import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/supabase/require-teacher";
import { buildLevelBinTable, type KernelDatabaseRow } from "@/lib/admission-cut-kernel-predictor";

/**
 * `합격가능성_계산구조_v3_최종.md`의 "DB"(과거 (university,department,교과전형) 그룹별
 * level50/level70/trend70/capChange/compRaw/y50/y70 한 행씩)와 level50 구간별 경쟁률
 * 정규화 lookup 테이블을 admission_cutoffs 원본에서 매번 새로 계산해 돌려준다. 커널
 * 계산·몬테카를로 시뮬레이션 자체는 클라이언트에서 이 데이터를 받아 수행한다.
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

/** grade_50/grade_70/enrollment/competition_rate는 text 컬럼이라(값이 아예 없거나 "-" 같은
 * 비숫자 표기가 섞여 있을 수 있어) 숫자로 안전 변환한다. */
function toNumOrNull(v: string | null): number | null {
  if (v == null) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchAllCutoffs(supabase: Awaited<ReturnType<typeof createServerClient>>) {
  const all: CutoffRow[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("admission_cutoffs")
      .select("university, department, admission_type, year, grade_50, grade_70, enrollment, competition_rate")
      .eq("admission_period", "수시")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(
      ...data.map((r) => ({
        university: r.university,
        department: r.department,
        admission_type: r.admission_type,
        year: r.year,
        grade_50: toNumOrNull(r.grade_50),
        grade_70: toNumOrNull(r.grade_70),
        enrollment: toNumOrNull(r.enrollment),
        competition_rate: toNumOrNull(r.competition_rate),
      })),
    );
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function GET() {
  const teacher = await requireTeacher();
  if (!teacher) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });

  const supabase = await createServerClient();
  let rows: CutoffRow[];
  try {
    rows = await fetchAllCutoffs(supabase);
  } catch {
    return NextResponse.json({ error: "입결 데이터를 불러오지 못했습니다." }, { status: 500 });
  }

  const groups = new Map<string, CutoffRow[]>();
  for (const r of rows) {
    if (!r.admission_type?.includes("교과")) continue;
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

  const bins = buildLevelBinTable(database);

  return NextResponse.json({ database, bins });
}
