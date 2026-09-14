import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCompetitionCorrection,
  buildLevelBinTable,
  type CompetitionCorrection,
  type KernelDatabaseRow,
  type LevelBin,
} from "@/lib/admission-cut-kernel-predictor";
import type { Database } from "@/lib/database.types";

export type CutoffModelSourceRow = {
  university: string;
  department: string;
  admission_type: string | null;
  year: number;
  grade_50: string | null;
  grade_70: string | null;
  enrollment: string | null;
  competition_rate: string | null;
};

export type AdmissionCutModel = {
  database: KernelDatabaseRow[];
  bins: LevelBin[];
  competitionCorrection: CompetitionCorrection;
};

const SELECT_COLUMNS = "id, university, department, admission_type, year, grade_50, grade_70, enrollment, competition_rate";
const PAGE_SIZE = 1000;

function toNumOrNull(value: string | null): number | null {
  if (value == null) return null;
  const numberValue = parseFloat(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

type NormalizedCutoffRow = Omit<CutoffModelSourceRow, "grade_50" | "grade_70" | "enrollment" | "competition_rate"> & {
  grade_50: number | null;
  grade_70: number | null;
  enrollment: number | null;
  competition_rate: number | null;
};

function normalizeRow(row: CutoffModelSourceRow): NormalizedCutoffRow {
  return {
    ...row,
    grade_50: toNumOrNull(row.grade_50),
    grade_70: toNumOrNull(row.grade_70),
    enrollment: toNumOrNull(row.enrollment),
    competition_rate: toNumOrNull(row.competition_rate),
  };
}

/** 입결 업로드 완료 시와 최초 전환 시에만 원본에서 계산용 행을 읽는다. */
export async function fetchAdmissionCutoffModelSource(
  supabase: SupabaseClient<Database>,
): Promise<CutoffModelSourceRow[]> {
  const filterBase = () =>
    supabase.from("admission_cutoffs").select("year").eq("admission_period", "수시").eq("track", "교과");
  const [{ data: minRows, error: minError }, { data: maxRows, error: maxError }] = await Promise.all([
    filterBase().order("year", { ascending: true }).limit(1),
    filterBase().order("year", { ascending: false }).limit(1),
  ]);
  if (minError) throw minError;
  if (maxError) throw maxError;
  const minYear = minRows?.[0]?.year;
  const maxYear = maxRows?.[0]?.year;
  if (minYear == null || maxYear == null) return [];

  const years: number[] = [];
  for (let year = minYear; year <= maxYear; year++) years.push(year);
  const perYear = await Promise.all(years.map((year) => fetchModelSourceYear(supabase, year)));
  return perYear.flat();
}

async function fetchModelSourceYear(
  supabase: SupabaseClient<Database>,
  year: number,
): Promise<CutoffModelSourceRow[]> {
  const rows: CutoffModelSourceRow[] = [];
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

    rows.push(...(data as CutoffModelSourceRow[]));
    cursor = data[data.length - 1].id;
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

/** 기존 계산기와 같은 4연속 연도 규칙으로, 실제 계산에 쓰는 숫자 목록을 만든다. */
export function buildAdmissionCutModel(sourceRows: CutoffModelSourceRow[]): AdmissionCutModel {
  const groups = new Map<string, NormalizedCutoffRow[]>();
  for (const sourceRow of sourceRows) {
    const row = normalizeRow(sourceRow);
    if (!row.admission_type) continue;
    const key = `${row.university}|||${row.department}|||${row.admission_type}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const database: KernelDatabaseRow[] = [];
  for (const groupRows of groups.values()) {
    const byYear = new Map<number, NormalizedCutoffRow>();
    let hasDuplicateYear = false;
    for (const row of groupRows) {
      if (byYear.has(row.year)) hasDuplicateYear = true;
      byYear.set(row.year, row);
    }
    if (hasDuplicateYear) continue;

    const years = [...byYear.keys()].sort((a, b) => a - b);
    let window: [number, number, number, number] | null = null;
    for (let index = years.length - 4; index >= 0; index--) {
      if (years[index + 3] - years[index] === 3) {
        window = [years[index], years[index + 1], years[index + 2], years[index + 3]];
        break;
      }
    }
    if (!window) continue;

    const [year0, year1, year2, year3] = window;
    const row0 = byYear.get(year0)!;
    const row1 = byYear.get(year1)!;
    const row2 = byYear.get(year2)!;
    const row3 = byYear.get(year3)!;
    if (
      !row0.grade_50 || !row1.grade_50 || !row2.grade_50 || !row3.grade_50 ||
      !row0.grade_70 || !row1.grade_70 || !row2.grade_70 || !row3.grade_70 ||
      !row2.enrollment || !row3.enrollment || !row3.competition_rate
    ) {
      continue;
    }

    database.push({
      level50: (row0.grade_50 + row1.grade_50 + row2.grade_50) / 3,
      level70: (row0.grade_70 + row1.grade_70 + row2.grade_70) / 3,
      trend70: row2.grade_70 - row1.grade_70,
      capChange: Math.log(row3.enrollment) - Math.log(row2.enrollment),
      compRaw: row3.competition_rate,
      y50: row3.grade_50,
      y70: row3.grade_70,
    });
  }

  const bins = buildLevelBinTable(database);
  return { database, bins, competitionCorrection: buildCompetitionCorrection(database, bins) };
}
