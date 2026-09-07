import { createClient } from "@/lib/supabase/client";
import { nameSimilarity } from "@/lib/admission-cutoff-lookup";

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

async function fetchRows(university: string, department: string | null): Promise<Row[]> {
  const supabase = createClient();
  let query = supabase
    .from("admission_competition_history")
    .select("university, admission_type, department, start_at, series")
    .eq("university", university);
  query = department != null ? query.eq("department", department) : query.is("department", null);
  const { data } = await query;
  return (data as Row[] | null) ?? [];
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

export type CompetitionLookupResult =
  | { kind: "matched"; series: CompetitionSeries }
  /** 이름만으로는 어느 전형인지 하나로 못 좁혔다 — 자동으로 아무거나 고르면 틀린 그래프를
   * 보여줄 수 있으니, 후보를 전부 넘겨서 사람이 직접 고르게 한다. */
  | { kind: "ambiguous"; options: CompetitionSeries[] }
  | { kind: "none" };

/**
 * 대학+학과(+세부전형명 힌트)로 작년 경쟁률 시계열을 찾는다.
 * 1) 학과까지 정확히 일치하는 데이터 중 이름이 비슷한 전형을 찾고,
 * 2) 없으면 학과 구분 없는 "전형 전체" 요약 시계열로 대체한다.
 * 후보가 정확히 하나면 바로 그래프를 그릴 수 있게 matched를, 둘 이상이면 ambiguous를
 * 돌려준다(호출부에서 사람이 직접 고르게 한다).
 */
export async function fetchCompetitionSeries(
  university: string,
  department: string,
  hintAdmissionType: string,
): Promise<CompetitionLookupResult> {
  const deptRows = await fetchRows(university, department);
  const deptMatches = matchRows(deptRows, hintAdmissionType);
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
 * 작년 원서접수 시작 시각을 그대로 1년 뒤로 옮겨 "올해 시작 시각"으로 가정한다(대학마다
 * 실제 올해 접수 일정을 따로 입력받지 않는 대신 쓰는 단순 추정치 — 수시 접수는 매년
 * 비슷한 시기에 진행되는 편이라 그래프에서 "지금 이 시점"을 대략적으로 짚는 용도로는
 * 충분하다). 연/월/일/시/분만 옮기고 나머지는 그대로 둔다.
 */
export function assumeThisYearStart(lastYearStartIso: string): Date {
  const d = new Date(lastYearStartIso);
  return new Date(d.getFullYear() + 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
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
