import { createClient } from "@/lib/supabase/client";
import { QUICK_CATEGORY_OPTIONS } from "@/lib/wonseo-constants";

const OFFERING_COLUMNS =
  "admission_type, track, enrollment, selection_model, method_text, method_academic_quant, method_academic_qual, method_interview, method_essay, method_practical, method_document, method_stage1_score, method_etc, min_standard_applied, min_standard_text";

type OfferingRow = {
  admission_type: string;
  track: string;
  enrollment: number | null;
  selection_model: string;
  method_text: string | null;
  method_academic_quant: number | null;
  method_academic_qual: number | null;
  method_interview: number | null;
  method_essay: number | null;
  method_practical: number | null;
  method_document: number | null;
  method_stage1_score: number | null;
  method_etc: number | null;
  min_standard_applied: string | null;
  min_standard_text: string | null;
};

export type MergedOffering = {
  admissionType: string;
  track: string;
  enrollment: number | null;
  minStandard: string;
  selectionMode: "single" | "multi";
  methodSingle: string;
  methodStage1: string;
  methodStage2: string;
};

export type OfferingLookupResult =
  | { kind: "matched"; offering: MergedOffering }
  | { kind: "ambiguous"; options: MergedOffering[] }
  | { kind: "none" };

/** 카드의 전형 유형 문자열이 이투스 데이터의 "중심전형" 값과 정확히 같을 때만 자동완성 필터에 쓴다. */
export function trackForOffering(category: string): string | undefined {
  return (QUICK_CATEGORY_OPTIONS as readonly string[]).includes(category) ? category : undefined;
}

const METHOD_LABELS: { key: keyof OfferingRow; label: string }[] = [
  { key: "method_academic_quant", label: "학생부(정량)" },
  { key: "method_academic_qual", label: "학생부(정성)" },
  { key: "method_interview", label: "면접" },
  { key: "method_essay", label: "논술" },
  { key: "method_practical", label: "실기" },
  { key: "method_document", label: "서류" },
  { key: "method_stage1_score", label: "1단계성적" },
  { key: "method_etc", label: "기타" },
];

/** 값이 있는 항목만 "라벨+숫자" 형태로 이어붙인다(예: "학생부(정량)80 + 면접20"). 전부 비어 있으면 원문으로 대체. */
function buildMethodSummary(row: OfferingRow): string {
  const parts = METHOD_LABELS.filter(({ key }) => row[key] != null).map(({ key, label }) => `${label}${row[key]}`);
  if (parts.length > 0) return parts.join(" + ");
  return row.method_text ?? "";
}

function minStandardText(row: OfferingRow): string {
  return row.min_standard_applied === "Y" ? (row.min_standard_text ?? "") : "없음";
}

/** 단일 행을 그대로 하나의 후보(일괄전형 형태)로 보여준다 — 모양이 안 맞는 예외 케이스용. */
function rowToCandidate(row: OfferingRow): MergedOffering {
  return {
    admissionType: row.admission_type,
    track: row.track,
    enrollment: row.enrollment,
    minStandard: minStandardText(row),
    selectionMode: "single",
    methodSingle: buildMethodSummary(row),
    methodStage1: "",
    methodStage2: "",
  };
}

/** 같은 세부전형명의 행들("일괄합산" 1행 또는 "1단계"+"2단계" 각 1행)을 하나의 결과로 합친다. */
function toMerged(rows: OfferingRow[]): MergedOffering | null {
  if (rows.length === 1 && rows[0].selection_model === "일괄합산") {
    return rowToCandidate(rows[0]);
  }
  const stage1 = rows.find((r) => r.selection_model === "1단계");
  const stage2 = rows.find((r) => r.selection_model === "2단계");
  if (rows.length === 2 && stage1 && stage2) {
    return {
      admissionType: stage1.admission_type,
      track: stage1.track,
      enrollment: stage1.enrollment ?? stage2.enrollment,
      minStandard: minStandardText(stage1),
      selectionMode: "multi",
      methodSingle: "",
      methodStage1: buildMethodSummary(stage1),
      methodStage2: buildMethodSummary(stage2),
    };
  }
  return null;
}

/** 세부전형명별로 묶어서 후보 목록을 만든다. 모양이 안 맞는 그룹은 행 단위로 풀어서 보여준다. */
function groupByAdmissionType(rows: OfferingRow[]): MergedOffering[] {
  const byType = new Map<string, OfferingRow[]>();
  for (const row of rows) {
    const list = byType.get(row.admission_type) ?? [];
    list.push(row);
    byType.set(row.admission_type, list);
  }
  const result: MergedOffering[] = [];
  for (const group of byType.values()) {
    const merged = toMerged(group);
    if (merged) result.push(merged);
    else result.push(...group.map(rowToCandidate));
  }
  return result;
}

/**
 * 대학+모집단위+세부전형명이 정확히 일치하는 이투스 전형데이터를 찾는다. 원본 데이터는
 * 1행이 아니라 "1개 전형 = 일괄합산 1행 또는 1단계+2단계 각 1행"이라, 먼저 그 모양대로
 * 합쳐서 하나의 결과로 만든다. 그 모양을 벗어나는 경우(원본 데이터 자체의 중복 등, 매우
 * 드묾)는 각 행을 후보로 보여주고 학생이 고르게 한다.
 */
export async function findOfferingMatch(
  university: string,
  department: string,
  admissionType: string,
): Promise<OfferingLookupResult> {
  const supabase = createClient();
  const { data } = await supabase
    .from("admission_offerings")
    .select(OFFERING_COLUMNS)
    .eq("university", university)
    .eq("department", department)
    .eq("admission_type", admissionType);
  const rows = data ?? [];
  if (rows.length === 0) return { kind: "none" };

  const merged = toMerged(rows);
  if (merged) return { kind: "matched", offering: merged };

  return { kind: "ambiguous", options: rows.map(rowToCandidate) };
}

/**
 * 세부 전형명을 아직 안 골랐을 때 쓴다 — 대학+모집단위(+전형 유형)에 있는 이투스 전형을
 * 전부 훑어서 세부전형명별로 하나씩 후보를 만든다. 딱 하나뿐이면 바로 그걸 쓰면 되고,
 * 여러 개면 학생이 고르게 한다.
 */
export async function listOfferingCandidates(
  university: string,
  department: string,
  track?: string,
): Promise<MergedOffering[]> {
  const supabase = createClient();
  let query = supabase
    .from("admission_offerings")
    .select(OFFERING_COLUMNS)
    .eq("university", university)
    .eq("department", department);
  if (track) query = query.eq("track", track);
  const { data } = await query;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  return groupByAdmissionType(rows);
}
