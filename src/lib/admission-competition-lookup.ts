import { createClient } from "@/lib/supabase/client";
import { normalize, nameSimilarity } from "@/lib/admission-cutoff-lookup";

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

function pickBest(rows: Row[], hint: string): Row | null {
  const normalizedHint = normalize(hint);
  let best: { row: Row; score: number } | null = null;
  for (const row of rows) {
    const score = nameSimilarity(normalize(row.admission_type), normalizedHint);
    if (score === 0) continue;
    if (!best || score > best.score) best = { row, score };
  }
  return best?.row ?? null;
}

function toPoints(series: Row["series"]): CompetitionPoint[] {
  return series.map(([elapsedMin, applicants, ratio]) => ({ elapsedMin, applicants, ratio }));
}

/**
 * 학생 원서 카드의 대학+학과+세부전형명과 가장 비슷한 작년 경쟁률 시계열을 찾는다.
 * 1) 학과까지 정확히 일치하는 데이터에서 전형명이 비슷한 것을 우선 찾고,
 * 2) 없으면 학과 구분 없는 "전형 전체" 요약 시계열로 대체한다(그것도 없으면 null).
 */
export async function fetchCompetitionSeries(
  university: string,
  department: string,
  hintAdmissionType: string,
): Promise<CompetitionSeries | null> {
  const deptRows = await fetchRows(university, department);
  const deptBest = pickBest(deptRows, hintAdmissionType);
  if (deptBest) {
    return {
      university,
      admissionType: deptBest.admission_type,
      department: deptBest.department,
      matchLevel: "department",
      startAt: deptBest.start_at,
      points: toPoints(deptBest.series),
    };
  }

  const summaryRows = await fetchRows(university, null);
  const summaryBest = pickBest(summaryRows, hintAdmissionType);
  if (summaryBest) {
    return {
      university,
      admissionType: summaryBest.admission_type,
      department: null,
      matchLevel: "summary",
      startAt: summaryBest.start_at,
      points: toPoints(summaryBest.series),
    };
  }

  return null;
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
