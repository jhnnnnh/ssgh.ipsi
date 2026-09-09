import { normalizeDateInput } from "@/lib/time";
import type { Roster, WonseoCard } from "@/lib/database.types";

export const WONSEO_TABLE_ROW_LABELS = [
  "지원정도",
  "지망대학",
  "학과",
  "전형유형",
  "세부전형명",
] as const;

export type WonseoTableRowLabel = (typeof WONSEO_TABLE_ROW_LABELS)[number];

export function wonseoTableCellValue(
  card: WonseoCard | undefined,
  label: WonseoTableRowLabel,
): string {
  if (!card) return "";
  switch (label) {
    case "지원정도":
      return card.level;
    case "지망대학":
      return card.university ?? "";
    case "학과":
      return card.department ?? "";
    case "전형유형":
      return card.category ?? "";
    case "세부전형명":
      return card.sub_category ?? "";
    default:
      return "";
  }
}

/** "접수한 원서 보기" 표에서 지원정도~세부전형명 아래에 덧붙이는 두 행. */
export const WONSEO_SUBMITTED_TABLE_ROW_LABELS = [...WONSEO_TABLE_ROW_LABELS, "수험번호", "날짜"] as const;

export type WonseoSubmittedTableRowLabel = (typeof WONSEO_SUBMITTED_TABLE_ROW_LABELS)[number];

function scheduleEventsCellValue(card: WonseoCard): string {
  return (card.schedule_events ?? [])
    .map((s) => [s.label, normalizeDateInput(s.date)].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
}

export function wonseoSubmittedTableCellValue(
  card: WonseoCard | undefined,
  label: WonseoSubmittedTableRowLabel,
): string {
  if (!card) return "";
  if (label === "수험번호") return card.application_number ?? "";
  if (label === "날짜") return scheduleEventsCellValue(card);
  return wonseoTableCellValue(card, label as WonseoTableRowLabel);
}

export type WonseoTableStudentRow = {
  studentId: string;
  name: string;
  cards: WonseoCard[];
};

export type WonseoTableData = {
  maxChoices: number;
  students: WonseoTableStudentRow[];
};

/** 수시 원서 표(엑셀/화면 공용)를 위해 학생별로 카드를 그룹핑·정렬한다. sortKey를 바꾸면
 * "접수한 원서 보기"처럼 다른 기준(submitted_sort_order)으로도 재사용할 수 있다. */
export function buildWonseoTableData(
  roster: Roster[],
  cards: WonseoCard[],
  sortKey: (card: WonseoCard) => string | number = (c) => c.created_at,
): WonseoTableData {
  const nameById = new Map(roster.map((r) => [r.student_id, r.name]));
  const byStudent = new Map<string, WonseoCard[]>();
  for (const c of cards) {
    const list = byStudent.get(c.student_id) ?? [];
    list.push(c);
    byStudent.set(c.student_id, list);
  }
  for (const list of byStudent.values()) {
    list.sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }

  const studentIds = Array.from(byStudent.keys()).sort();
  const maxChoices = Math.max(1, ...studentIds.map((id) => byStudent.get(id)!.length));

  return {
    maxChoices,
    students: studentIds.map((id) => ({
      studentId: id,
      name: nameById.get(id) ?? "",
      cards: byStudent.get(id)!,
    })),
  };
}

/** "접수한 원서 보기" 표 전용 — 접수 표시(is_submitted)된 카드만, "접수한 원서" 화면과 같은
 * 순서(submitted_sort_order)로 모은다. */
export function buildSubmittedWonseoTableData(roster: Roster[], cards: WonseoCard[]): WonseoTableData {
  return buildWonseoTableData(
    roster,
    cards.filter((c) => c.is_submitted),
    (c) => c.submitted_sort_order,
  );
}
