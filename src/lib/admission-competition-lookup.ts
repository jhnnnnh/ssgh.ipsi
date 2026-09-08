import { createClient } from "@/lib/supabase/client";
import { nameSimilarity, pickBestFuzzyOption, pickBestFuzzyAdmissionType } from "@/lib/admission-cutoff-lookup";
export { pickBestFuzzyOption } from "@/lib/admission-cutoff-lookup";

export type CompetitionPoint = {
  /** 그 대학 작년 원서접수 시작 시각으로부터 경과한 분. "최종" 집계 지점은 null. */
  elapsedMin: number | null;
  applicants: number | null;
  ratio: number | null;
};

export type CompetitionSeries = {
  university: string;
  admissionType: string;
  department: string | null;
  /** "department" = 학과까지 정확히 일치, "summary" = 전형 전체 요약(학과 구분 없음)로 대체됨. */
  matchLevel: "department" | "summary";
  startAt: string;
  points: CompetitionPoint[];
};

type Row = {
  university: string;
  admission_type: string;
  department: string | null;
  start_at: string;
  series: [number | null, number | null, number | null][];
};

async function fetchRowsExact(university: string, department: string | null): Promise<Row[]> {
  const supabase = createClient();
  let query = supabase
    .from("admission_competition_history")
    .select("university, admission_type, department, start_at, series")
    .eq("university", university);
  query = department != null ? query.eq("department", department) : query.is("department", null);
  const { data } = await query;
  return (data as Row[] | null) ?? [];
}

/** 일부 국립대(부경대·순천대·창원대·목포대·한국해양대 등)는 대학명 자동완성이 가져오는
 * "대학어디가" 쪽 표기에는 "국립"이 붙어 있는데(예: "국립부경대"), 이 아카이브는 엑셀 시트
 * 이름 그대로("부경대") 저장돼 있어 정확히 일치하는 이름이 아예 없다. "국립" 접두어를
 * 붙이거나 뗀 이름으로도 한 번 더 시도한다. */
async function fetchRows(university: string, department: string | null): Promise<Row[]> {
  const exact = await fetchRowsExact(university, department);
  if (exact.length > 0) return exact;
  const altUniversity = university.startsWith("국립") ? university.slice(2) : `국립${university}`;
  return fetchRowsExact(altUniversity, department);
}

async function fetchAllDepartmentRowsExact(university: string): Promise<Row[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("admission_competition_history")
    .select("university, admission_type, department, start_at, series")
    .eq("university", university)
    .not("department", "is", null);
  return (data as Row[] | null) ?? [];
}

async function fetchAllDepartmentRows(university: string): Promise<Row[]> {
  const exact = await fetchAllDepartmentRowsExact(university);
  if (exact.length > 0) return exact;
  const altUniversity = university.startsWith("국립") ? university.slice(2) : `국립${university}`;
  return fetchAllDepartmentRowsExact(altUniversity);
}

/** "내 원서 카드에서 불러오기"는 학생·교사가 수기로 입력한 학과명을 그대로 쓰기 때문에
 * 아카이브에 저장된 학과명과 정확히 같지 않을 수 있다(예: "경제학과" vs
 * "경제학부(경제학전공)"). 정확히 일치하는 학과가 없을 때, 그 대학의 학과들 중 이름이
 * 가장 비슷한 학과로 한 번 더 시도한다. */
function pickBestFuzzyDepartment(rows: Row[], hintDepartment: string): string | null {
  const uniqueDepts = Array.from(new Set(rows.map((r) => r.department).filter((d): d is string => d != null)));
  return pickBestFuzzyOption(uniqueDepts, hintDepartment);
}

/**
 * admission-cutoff-lookup.ts의 normalize()는 "교과"/"종합"/"전형"까지 지워버리는데,
 * 거기서는 대학어디가 쪽과 이투스 쪽이 그 수식어를 서로 다른 위치에 붙이는 문제를 풀기
 * 위해서였다. 여기서는 hint 자체가 "학생부교과전형"처럼 트랙 이름 하나뿐인 경우가 흔한데,
 * "교과"/"종합"을 지워버리면 "학생부"만 남아 사실상 아무 전형이나 다 걸려버린다(대부분의
 * 전형명이 "학생부"로 시작한다). 공백/괄호만 지우고 트랙 단어는 남겨서, 학생부교과와
 * 학생부종합처럼 실제로 다른 전형끼리 서로 매치되지 않게 한다.
 */
function normalizeLoose(s: string): string {
  return s.replace(/\s+/g, "").replace(/[()]/g, "").trim();
}

/** 힌트와 이름이 비슷한 행을 점수 높은 순으로 모두 돌려준다(0점 제외). 힌트가 없으면
 * 걸러내지 않고 전부(원본 순서 그대로) 돌려준다 — 그래야 세부전형명 없이 검색했을 때도
 * 그 학과/대학의 전형을 전부 골라볼 수 있다. */
function matchRows(rows: Row[], hint: string): Row[] {
  const normalizedHint = normalizeLoose(hint);
  if (!normalizedHint) return rows;
  return rows
    .map((row) => ({ row, score: nameSimilarity(normalizeLoose(row.admission_type), normalizedHint) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.row);
}

function toPoints(series: Row["series"]): CompetitionPoint[] {
  return series.map(([elapsedMin, applicants, ratio]) => ({ elapsedMin, applicants, ratio }));
}

function toSeries(row: Row, matchLevel: CompetitionSeries["matchLevel"]): CompetitionSeries {
  return {
    university: row.university,
    admissionType: row.admission_type,
    department: row.department,
    matchLevel,
    startAt: row.start_at,
    points: toPoints(row.series),
  };
}

/**
 * "작년 경쟁률 조회"용 대학→학과→전형 단계별 선택 팝업이 쓰는 자동완성. 세부전형명을
 * admission_cutoffs(대학어디가) 표기 자동완성으로 입력받으면 이 아카이브의 전형명 표기와
 * 달라서(예: "교과(교과성적)" vs "교과성적우수인재전형") 못 찾거나, 비워두면 전형이 전부
 * 쏟아지는 문제가 있었다. 이 아카이브 데이터 자체에서 대학→학과→전형을 순서대로 골라
 * 나가면 마지막에는 항상 유일한 시계열 하나로 좁혀진다.
 */
export async function fetchCompetitionUniversityOptions(query: string): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("autocomplete_competition_universities", { p_query: query, p_limit: 200 });
  return (data ?? []).map((r) => r.university);
}

export async function fetchCompetitionDepartmentOptions(
  university: string,
): Promise<{ departments: string[]; hasSummary: boolean }> {
  const supabase = createClient();
  const [{ data: deptData }, { data: hasSummary }] = await Promise.all([
    supabase.rpc("autocomplete_competition_departments", { p_university: university, p_limit: 500 }),
    supabase.rpc("autocomplete_competition_has_summary", { p_university: university }),
  ]);
  return { departments: (deptData ?? []).map((r) => r.department), hasSummary: hasSummary ?? false };
}

/** department가 null이면 "전체(학과 구분 없음)" 요약 전형 목록을 가져온다. */
export async function fetchCompetitionAdmissionTypeOptions(
  university: string,
  department: string | null,
): Promise<string[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc("autocomplete_competition_admission_types", {
    p_university: university,
    p_department: department,
  });
  return (data ?? []).map((r) => r.admission_type);
}

/**
 * 입결/모집정보의 전형명이 실제 원서접수 사이트 표기(경쟁률 아카이브가 그 사이트에서
 * 그대로 캡처한 것)와 다를 때, 화면에 참고로 보여줄 "공식 명칭"을 찾는다.
 * pickBestFuzzyAdmissionType과 같은 기준을 쓴다 — 트랙(교과/종합)이 다르면 무조건 후보에서
 * 빠지므로(안전장치), 트랙이 같은 후보 중 핵심 이름이 가장 비슷한 것만 돌려준다. 그래도
 * 하나도 안 겹치면(아카이브에 없는, 즉 올해 전형이 새로 생겼거나 이름이 완전히 바뀐
 * 경우일 수 있음) null을 돌려준다 — 원본 표기는 화면에서 그대로 두고(데이터 조회에도
 * 전혀 영향 없음), 이 값은 순수 참고용으로만 쓴다.
 */
export async function findOfficialAdmissionTypeName(
  university: string,
  department: string,
  rawAdmissionType: string,
): Promise<string | null> {
  let rows = await fetchRows(university, department);
  if (rows.length === 0) rows = await fetchRows(university, null);
  const candidates = Array.from(new Set(rows.map((r) => r.admission_type)));
  const best = pickBestFuzzyAdmissionType(candidates, rawAdmissionType);
  return best && best !== rawAdmissionType ? best : null;
}

export type CompetitionLookupResult =
  | { kind: "matched"; series: CompetitionSeries }
  /** 이름만으로는 어느 전형인지 하나로 못 좁혔다 — 자동으로 아무거나 고르면 틀린 그래프를
   * 보여줄 수 있으니, 후보를 전부 넘겨서 사람이 직접 고르게 한다. */
  | { kind: "ambiguous"; options: CompetitionSeries[] }
  | { kind: "none" };

/**
 * 대학+학과(+세부전형명 힌트)로 작년 경쟁률 시계열을 찾는다.
 * 1) 학과까지 정확히 일치하는 데이터 중 이름이 비슷한 전형을 찾고,
 * 2) 없으면(원서 카드처럼 수기 입력이라 학과명 표기가 다를 수 있으니) 그 대학의 학과 중
 *    이름이 가장 비슷한 학과로 한 번 더 시도하고,
 * 3) 그래도 없으면 학과 구분 없는 "전형 전체" 요약 시계열로 대체한다.
 * 후보가 정확히 하나면 바로 그래프를 그릴 수 있게 matched를, 둘 이상이면 ambiguous를
 * 돌려준다(호출부에서 사람이 직접 고르게 한다).
 */
export async function fetchCompetitionSeries(
  university: string,
  department: string,
  hintAdmissionType: string,
): Promise<CompetitionLookupResult> {
  const deptRows = await fetchRows(university, department);
  let deptMatches = matchRows(deptRows, hintAdmissionType);

  if (deptMatches.length === 0 && department.trim()) {
    const allDeptRows = await fetchAllDepartmentRows(university);
    const bestDept = pickBestFuzzyDepartment(allDeptRows, department);
    if (bestDept && bestDept !== department) {
      const fuzzyMatches = matchRows(
        allDeptRows.filter((r) => r.department === bestDept),
        hintAdmissionType,
      );
      if (fuzzyMatches.length > 0) deptMatches = fuzzyMatches;
    }
  }

  if (deptMatches.length === 1) return { kind: "matched", series: toSeries(deptMatches[0], "department") };
  if (deptMatches.length > 1) return { kind: "ambiguous", options: deptMatches.map((r) => toSeries(r, "department")) };

  const summaryRows = await fetchRows(university, null);
  const summaryMatches = matchRows(summaryRows, hintAdmissionType);
  if (summaryMatches.length === 1) return { kind: "matched", series: toSeries(summaryMatches[0], "summary") };
  if (summaryMatches.length > 1) {
    return { kind: "ambiguous", options: summaryMatches.map((r) => toSeries(r, "summary")) };
  }

  return { kind: "none" };
}

/**
 * 작년 원서접수 시작 시각을 대략 1년 뒤로 옮겨 "올해 시작 시각"으로 가정한다(대학마다
 * 실제 올해 접수 일정을 따로 입력받지 않는 대신 쓰는 단순 추정치). 그래프는 날짜가 아니라
 * 요일·시각으로 작년과 올해를 맞춰 보는 용도라("월화수목금" 라벨), 실제 날짜는 비교
 * 대상이 아니다 — 단순히 캘린더 날짜를 +1년 하면 1년이 365일(윤년이면 366일)이라 요일이
 * 하루이틀 밀려버려서 그래프의 "지금" 표시가 어긋난 요일 자리에 찍힌다. 그래서 +1년한
 * 날짜에서 요일이 작년 시작 요일과 같아지도록, 가장 가까운 방향(최대 ±3일)으로 보정한다
 * (항상 미래 쪽으로만 보정하면 실제 "지금"이 그 보정된 날짜보다 앞서서, 시작 전으로
 * 계산돼 "지금" 표시 자체가 아예 안 뜨는 경우가 있었다).
 */
export function assumeThisYearStart(lastYearStartIso: string): Date {
  const d = new Date(lastYearStartIso);
  const naive = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  let weekdayCorrection = (d.getDay() - naive.getDay() + 7) % 7;
  if (weekdayCorrection > 3) weekdayCorrection -= 7;
  naive.setDate(naive.getDate() + weekdayCorrection);
  return naive;
}

/** 지금 이 순간이, 올해 시작 시각(추정)으로부터 몇 분 지났는지. */
export function currentElapsedMinutes(lastYearStartIso: string, now: Date = new Date()): number {
  const assumedStart = assumeThisYearStart(lastYearStartIso);
  return Math.round((now.getTime() - assumedStart.getTime()) / 60000);
}

/** 경과 분을 "N일 M시간 경과" 형태로 표시한다. */
export function formatElapsedMinutes(minutes: number): string {
  const totalMinutes = Math.round(minutes);
  const sign = totalMinutes < 0 ? "-" : "";
  const abs = Math.abs(totalMinutes);
  const days = Math.floor(abs / (24 * 60));
  const hours = Math.floor((abs % (24 * 60)) / 60);
  return `${sign}${days}일 ${hours}시간 경과`;
}
