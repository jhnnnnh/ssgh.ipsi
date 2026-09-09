import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { buildLevelBinTable, type KernelDatabaseRow } from "@/lib/admission-cut-kernel-predictor";

/**
 * `합격가능성_계산구조_v3_최종.md`의 "DB"(과거 (university,department,교과전형) 그룹별
 * level50/level70/trend70/capChange/compRaw/y50/y70 한 행씩)와 level50 구간별 경쟁률
 * 정규화 lookup 테이블을 admission_cutoffs 원본에서 계산해 돌려준다. 커널 계산·몬테카를로
 * 시뮬레이션 자체는 클라이언트에서 이 데이터를 받아 수행한다.
 *
 * 원본 admission_cutoffs가 6만 행 가까이 되다 보니, 매 조회마다 새로 페이지네이션 조회
 * + 전체 재계산을 하면 체감 속도가 느렸다. 실측 결과 원인은 여러 겹이었다:
 *  - 처음에 "admission_type ILIKE %교과%"로 걸렀는데, ILIKE는 인덱스를 못 써서 RLS가
 *    걸린 테이블 전체를 훑어야 했다. `range()`(OFFSET) 페이지네이션과 만나면 매 페이지가
 *    처음부터 다시 훑어서 뒤로 갈수록 급격히 느려지고, `count: "exact"`까지 곁들이면
 *    Postgres 문(statement) 타임아웃까지 났다(57014 canceling statement due to
 *    statement timeout). → 정확한 값만 담긴 `track` 컬럼이 따로 있어서 `eq("track","교과")`
 *    로 바꿨다(문자열 부분일치 대신 정확히 일치, 훨씬 저렴하다).
 *  - OFFSET 대신 기본키(id) 기준 커서 페이지네이션(`id > 마지막으로 받은 id`)을 쓴다 —
 *    매번 처음부터 다시 훑지 않고 직전 위치 다음부터만 훑으므로 페이지가 늘어나도
 *    느려지지 않는다.
 *  - 서버가 한 번에 최대 1000행만 돌려주므로(db-max-rows) 페이지 수 자체는 줄일 수
 *    없지만, 연도별로 나눠 병렬로 돌리면 각 흐름의 페이지 수가 줄어 전체 시간이 짧아진다.
 *  - 계산 결과(database/bins)를 서버 메모리에 잠깐 캐싱해서, 같은 서버 인스턴스가 살아있는
 *    동안의 재요청은 DB를 다시 안 훑고 바로 돌려준다(입결 데이터는 관리자가 가끔씩만
 *    재업로드하므로 몇 분 정도 오래된 캐시를 써도 무방하다).
 */

type CutoffRow = {
  university: string;
  department: string;
  admission_type: string | null;
  year: number;
  grade_50: number | null;
  grade_70: number | null;
  enrollment: number | null;
  competition_rate: number | null;
};

const SELECT_COLUMNS = "id, university, department, admission_type, year, grade_50, grade_70, enrollment, competition_rate";
const PAGE_SIZE = 1000;

/** grade_50/grade_70/enrollment/competition_rate는 text 컬럼이라(값이 아예 없거나 "-" 같은
 * 비숫자 표기가 섞여 있을 수 있어) 숫자로 안전 변환한다. */
function toNumOrNull(v: string | null): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeRow(r: {
  university: string;
  department: string;
  admission_type: string | null;
  year: number;
  grade_50: string | null;
  grade_70: string | null;
  enrollment: string | null;
  competition_rate: string | null;
}): CutoffRow {
  return {
    university: r.university,
    department: r.department,
    admission_type: r.admission_type,
    year: r.year,
    grade_50: toNumOrNull(r.grade_50),
    grade_70: toNumOrNull(r.grade_70),
    enrollment: toNumOrNull(r.enrollment),
    competition_rate: toNumOrNull(r.competition_rate),
  };
}

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;

/** 특정 연도 하나만의 커서 페이지네이션. 서버가 한 번에 최대 1000행만 돌려주는 제약(db-max-rows)이
 * 있어 페이지 수 자체는 줄일 수 없지만, 연도별로 나눠 병렬로 돌리면 안(하나의 연도) 페이지 수가
 * 줄어들어 전체 걸리는 시간이 짧아진다. */
async function fetchYearCutoffs(supabase: SupabaseClient, year: number): Promise<CutoffRow[]> {
  const all: CutoffRow[] = [];
  let cursor: string | null = null;
  while (true) {
    let query = supabase
      .from("admission_cutoffs")
      .select(SELECT_COLUMNS)
      .eq("admission_period", "수시")
      .eq("year", year)
      .eq("track", "교과")
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    if (cursor) query = query.gt("id", cursor);

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...data.map(normalizeRow));
    cursor = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }
  return all;
}

async function fetchAllCutoffs(supabase: SupabaseClient): Promise<CutoffRow[]> {
  const filterBase = () =>
    supabase.from("admission_cutoffs").select("year").eq("admission_period", "수시").eq("track", "교과");

  const [{ data: minRow, error: minErr }, { data: maxRow, error: maxErr }] = await Promise.all([
    filterBase().order("year", { ascending: true }).limit(1),
    filterBase().order("year", { ascending: false }).limit(1),
  ]);
  if (minErr) throw minErr;
  if (maxErr) throw maxErr;
  const minYear = minRow?.[0]?.year;
  const maxYear = maxRow?.[0]?.year;
  if (minYear == null || maxYear == null) return [];

  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);

  const perYear = await Promise.all(years.map((y) => fetchYearCutoffs(supabase, y)));
  return perYear.flat();
}

function buildDatabase(rows: CutoffRow[]): KernelDatabaseRow[] {
  // rows는 이미 track='교과'로만 가져왔으므로 여기서 다시 걸러낼 필요가 없다.
  const groups = new Map<string, CutoffRow[]>();
  for (const r of rows) {
    if (!r.admission_type) continue;
    const key = `${r.university}|||${r.department}|||${r.admission_type}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const database: KernelDatabaseRow[] = [];

  for (const groupRows of groups.values()) {
    const byYear = new Map<number, CutoffRow>();
    let hasDup = false;
    for (const r of groupRows) {
      if (byYear.has(r.year)) hasDup = true;
      byYear.set(r.year, r);
    }
    if (hasDup) continue;

    const years = [...byYear.keys()].sort((a, b) => a - b);
    // 4연속 연도 구간 중 가장 최근 것을 찾는다.
    let window: [number, number, number, number] | null = null;
    for (let i = years.length - 4; i >= 0; i--) {
      if (years[i + 3] - years[i] === 3) {
        window = [years[i], years[i + 1], years[i + 2], years[i + 3]];
        break;
      }
    }
    if (!window) continue;

    const [y0, y1, y2, y3] = window;
    const r0 = byYear.get(y0)!;
    const r1 = byYear.get(y1)!;
    const r2 = byYear.get(y2)!;
    const r3 = byYear.get(y3)!;

    if (
      !r0.grade_50 || !r1.grade_50 || !r2.grade_50 || !r3.grade_50 ||
      !r0.grade_70 || !r1.grade_70 || !r2.grade_70 || !r3.grade_70 ||
      !r2.enrollment || !r3.enrollment || !r3.competition_rate
    ) {
      continue;
    }

    database.push({
      level50: (r0.grade_50 + r1.grade_50 + r2.grade_50) / 3,
      level70: (r0.grade_70 + r1.grade_70 + r2.grade_70) / 3,
      trend70: r2.grade_70 - r1.grade_70,
      capChange: Math.log(r3.enrollment) - Math.log(r2.enrollment),
      compRaw: r3.competition_rate,
      y50: r3.grade_50,
      y70: r3.grade_70,
    });
  }

  return database;
}

type CachedModel = { database: KernelDatabaseRow[]; bins: ReturnType<typeof buildLevelBinTable>; builtAt: number };
let cache: CachedModel | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function GET() {
  const supabase = await createServerClient();
  // 교사뿐 아니라 학생도 "합격 가능성 추정"을 쓰므로, 교사 전용이 아니라 로그인 여부만
  // 확인한다(실제 행 접근 권한은 admission_cutoffs의 RLS가 별도로 검증한다).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  if (!cache || Date.now() - cache.builtAt > CACHE_TTL_MS) {
    let rows: CutoffRow[];
    try {
      rows = await fetchAllCutoffs(supabase);
    } catch (err) {
      console.error("[admission-cut-model] fetchAllCutoffs failed:", err);
      return NextResponse.json({ error: "입결 데이터를 불러오지 못했습니다." }, { status: 500 });
    }
    const database = buildDatabase(rows);
    const bins = buildLevelBinTable(database);
    cache = { database, bins, builtAt: Date.now() };
  }

  return NextResponse.json(
    { database: cache.database, bins: cache.bins },
    { headers: { "Cache-Control": "private, max-age=600" } },
  );
}
