import type { AdminWonseoOverviewRow, SchoolAdmissionResult } from "@/lib/database.types";

/** "동아대학교(부산)" / "동아대학교" / "동아대", "국립부경대학교" / "부경대"를 같은 대학으로 본다. */
export function universityKey(s: string): string {
  return s
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, "")
    .replace(/^국립/, "")
    .replace(/대학교$/, "대");
}

export function departmentKey(s: string): string {
  return s.replace(/\s+/g, "").replace(/[・·]/g, "");
}

export function programKey(university: string, department: string): string {
  return `${universityKey(university)}|${departmentKey(department)}`;
}

export type StudentCard = AdminWonseoOverviewRow & {
  card_id: string;
  university: string;
};

export type ProgramGroup = {
  key: string;
  university: string;
  department: string;
  cards: StudentCard[];
  /** 같은 대학·학과·전형에 2명 이상 겹친 전형 이름들. */
  overlappingCategories: string[];
  /** 학교장추천처럼 학교별 추천 인원 제한이 있을 수 있는 전형 이름들. */
  recommendationCategories: string[];
};

const RECOMMENDATION_RE = /추천|학교장|지역균형|지균/;

/** 원서 카드를 대학·학과별로 묶고 지원자 수가 많은 순으로 정렬한다. */
export function groupByProgram(cards: StudentCard[]): ProgramGroup[] {
  const map = new Map<string, StudentCard[]>();
  for (const c of cards) {
    const key = programKey(c.university, c.department ?? "");
    map.set(key, [...(map.get(key) ?? []), c]);
  }
  return [...map.entries()]
    .map(([key, list]) => {
      const byCategory = new Map<string, Set<string>>();
      for (const c of list) {
        const cat = c.category?.trim() || "(전형 미입력)";
        byCategory.set(cat, (byCategory.get(cat) ?? new Set()).add(c.student_id));
      }
      const cats = [...byCategory.keys()];
      return {
        key,
        university: list[0].university,
        department: list[0].department ?? "",
        cards: list,
        overlappingCategories: cats.filter((cat) => byCategory.get(cat)!.size >= 2),
        recommendationCategories: cats.filter((cat) => RECOMMENDATION_RE.test(cat)),
      };
    })
    .sort((a, b) => b.cards.length - a.cards.length || a.university.localeCompare(b.university, "ko"));
}

export type PastSummary = {
  applied: number;
  admitted: number;
  admittedGpas: number[];
};

/** 지난 결과를 대학·학과 키별로 요약한다. 합격·충원합격을 모두 합격으로 센다. */
export function summarizePastResults(
  results: Pick<SchoolAdmissionResult, "university" | "department" | "final_stage" | "gpa">[],
) {
  const map = new Map<string, PastSummary>();
  for (const r of results) {
    const key = programKey(r.university, r.department);
    const s = map.get(key) ?? { applied: 0, admitted: 0, admittedGpas: [] };
    s.applied++;
    if (r.final_stage === "합격" || r.final_stage === "충원합격") {
      s.admitted++;
      if (r.gpa != null) s.admittedGpas.push(Number(r.gpa));
    }
    map.set(key, s);
  }
  return map;
}

export type Tier = "상향" | "적정" | "안정";

function toNumber(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = Number.parseFloat(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 && n < 10 ? n : null;
}

/**
 * 카드 한 장의 지원 수준. 환산 등급과 최근 입결 70% 컷이 있으면 그 차이로, 없으면 학생이
 * 고른 수준(상향/소신/적정/하향)으로 판단한다. 등급은 낮을수록 좋다.
 * ponytail: 70%컷 평균과의 단순 차이. 합격률 계산기 확률로 바꾸면 더 정확해진다.
 */
export function cardTier(card: Pick<StudentCard, "calculated_grade" | "recent_results" | "level">): Tier {
  const mine = toNumber(card.calculated_grade);
  const cuts = (card.recent_results ?? []).map((r) => toNumber(r.cut70)).filter((n): n is number => n != null);
  if (mine != null && cuts.length > 0) {
    const gap = mine - cuts.reduce((a, b) => a + b, 0) / cuts.length;
    if (gap > 0.3) return "상향";
    if (gap < -0.3) return "안정";
    return "적정";
  }
  if (card.level === "상향" || card.level === "소신") return "상향";
  if (card.level === "하향") return "안정";
  return "적정";
}

export type StudentRisk = {
  student_id: string;
  student_name: string;
  class_no: number;
  tiers: Record<Tier, number>;
  cardCount: number;
  warnings: string[];
};

/**
 * 학생별 원서 조합 위험 신호. 접수한 카드가 있으면 접수한 카드만, 없으면 전체 카드를 본다.
 * 경고가 있는 학생만 경고 개수가 많은 순으로 돌려준다.
 */
export function findRiskyStudents(rows: AdminWonseoOverviewRow[]): StudentRisk[] {
  const byStudent = new Map<string, AdminWonseoOverviewRow[]>();
  for (const r of rows) byStudent.set(r.student_id, [...(byStudent.get(r.student_id) ?? []), r]);

  const result: StudentRisk[] = [];
  for (const [student_id, list] of byStudent) {
    const cards = list.filter((r) => r.card_id && r.university);
    const submitted = cards.filter((r) => r.is_submitted);
    const target = submitted.length > 0 ? submitted : cards;
    const tiers: Record<Tier, number> = { 상향: 0, 적정: 0, 안정: 0 };
    for (const c of target) tiers[cardTier(c)]++;

    // 앱을 쓰지 않는 학생도 많아서 카드가 없는 학생은 위험 신호로 보지 않는다.
    if (target.length === 0) continue;
    const warnings: string[] = [];
    // 카드 지원 수준의 기본값이 "적정"이라 수준을 안 고른 학생은 전부 적정으로 보인다.
    // 그런 학생까지 잡지 않도록 상향이 2장 이상 섞였을 때만 안정 부족을 경고한다.
    if (tiers.안정 === 0 && tiers.상향 >= 2 && target.length >= 3) warnings.push("안정 지원 없음");
    if (tiers.상향 >= 4) warnings.push(`상향 ${tiers.상향}장`);
    if (tiers.상향 === target.length && target.length >= 2) warnings.push("전부 상향");
    if (warnings.length === 0) continue;
    result.push({
      student_id,
      student_name: list[0].student_name,
      class_no: list[0].class_no,
      tiers,
      cardCount: target.length,
      warnings,
    });
  }
  return result.sort((a, b) => b.warnings.length - a.warnings.length || a.student_id.localeCompare(b.student_id));
}

export type SeniorProgram = {
  university: string;
  department: string;
  admissionType: string;
  admitted: number[];
  rejected: number[];
};

/**
 * 내 등급 ±range 안의 선배들이 지원한 대학·학과·전형을 합격이 많은 순으로 모은다.
 * 등급이 없는 행은 뺀다. track을 주면 계열(인문/자연/예체능 등)이 같은 결과만 본다.
 */
export function findSeniorPrograms(
  results: Pick<
    SchoolAdmissionResult,
    "university" | "department" | "admission_type" | "track" | "final_stage" | "gpa"
  >[],
  gpa: number,
  range: number,
  track: string | null,
): SeniorProgram[] {
  const map = new Map<string, SeniorProgram>();
  for (const r of results) {
    if (r.gpa == null || Math.abs(Number(r.gpa) - gpa) > range + 1e-9) continue;
    if (track && r.track !== track) continue;
    const admissionType = r.admission_type ?? "";
    const key = `${programKey(r.university, r.department)}|${admissionType}`;
    const p = map.get(key) ?? {
      university: r.university,
      department: r.department,
      admissionType,
      admitted: [],
      rejected: [],
    };
    (r.final_stage === "합격" || r.final_stage === "충원합격" ? p.admitted : p.rejected).push(Number(r.gpa));
    map.set(key, p);
  }
  return [...map.values()].sort(
    (a, b) =>
      b.admitted.length - a.admitted.length ||
      a.rejected.length - b.rejected.length ||
      a.university.localeCompare(b.university, "ko"),
  );
}
