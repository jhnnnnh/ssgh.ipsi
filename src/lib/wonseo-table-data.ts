import { normalizeDateInput } from "@/lib/time";
import type { Roster, SupportLevel, WonseoCard } from "@/lib/database.types";

export const WONSEO_TABLE_ROW_LABELS = ["지원정도", "지망대학", "학과", "전형유형", "세부전형명"] as const;

export type WonseoTableRowLabel = (typeof WONSEO_TABLE_ROW_LABELS)[number];

export function wonseoTableCellValue(card: WonseoCard | undefined, label: WonseoTableRowLabel): string {
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
export const WONSEO_SUBMITTED_TABLE_ROW_LABELS = [...WONSEO_TABLE_ROW_LABELS, "수험번호", "일정"] as const;

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
  if (label === "일정") return scheduleEventsCellValue(card);
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

/** 교사 "전체 보기 / 접수한 원서 보기" 목록: 원서 1장 = 1줄. */
export type WonseoListRow = {
  card: WonseoCard;
  studentId: string;
  name: string;
  /** 그 학생 안에서의 순서(1부터). 학생별 표의 "N지망" 칸과 같은 순서다. */
  rank: number;
  /** 가장 이른 일정 날짜(YYYY-MM-DD). 없으면 null. */
  firstDate: string | null;
};

export type WonseoListSort = "student" | "university" | "department" | "level" | "date";

export type WonseoListFilter = {
  query: string;
  levels: SupportLevel[];
  category: string;
  university: string;
  sort: WonseoListSort;
};

const LEVEL_ORDER: SupportLevel[] = ["상향", "소신", "적정", "하향"];

function firstEventDate(card: WonseoCard): string | null {
  const dates = (card.schedule_events ?? [])
    .map((e) => normalizeDateInput(e.date))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  return dates[0] ?? null;
}

/** 명단에 있는 학생의 카드만, 학번순·학생별 카드 순서로 펼친다. */
export function buildWonseoListRows(
  roster: Roster[],
  cards: WonseoCard[],
  variant: "all" | "submitted",
): WonseoListRow[] {
  const data =
    variant === "submitted" ? buildSubmittedWonseoTableData(roster, cards) : buildWonseoTableData(roster, cards);
  const inRoster = new Set(roster.map((r) => r.student_id));
  return data.students
    .filter((s) => inRoster.has(s.studentId))
    .flatMap((s) =>
      s.cards.map((card, i) => ({
        card,
        studentId: s.studentId,
        name: s.name,
        rank: i + 1,
        firstDate: firstEventDate(card),
      })),
    );
}

/** 검색어(이름·학번·대학·학과)·지원정도·전형유형·대학으로 거르고 정렬한다. 같은 키 안에서는 원래 순서를 지킨다. */
export function filterSortListRows(rows: WonseoListRow[], f: WonseoListFilter): WonseoListRow[] {
  const q = f.query.replace(/\s+/g, "").toLowerCase();
  const filtered = rows.filter((r) => {
    if (f.levels.length > 0 && !f.levels.includes(r.card.level)) return false;
    if (f.category && r.card.category !== f.category) return false;
    if (f.university && r.card.university !== f.university) return false;
    if (!q) return true;
    const hay = [r.name, r.studentId, r.card.university, r.card.department].join(" ").replace(/\s+/g, "").toLowerCase();
    return hay.includes(q);
  });
  const key: Record<WonseoListSort, (r: WonseoListRow) => string> = {
    student: () => "",
    university: (r) => r.card.university ?? "",
    department: (r) => r.card.department ?? "",
    level: (r) => String(LEVEL_ORDER.indexOf(r.card.level)),
    // 날짜 없는 원서는 맨 뒤로
    date: (r) => r.firstDate ?? "9999",
  };
  return filtered
    .map((r, i) => ({ r, i }))
    .sort((a, b) => key[f.sort](a.r).localeCompare(key[f.sort](b.r), "ko") || a.i - b.i)
    .map(({ r }) => r);
}

/** 원서의 일정을 "면접 2026-11-20, 발표 2026-12-18"처럼 한 줄로 만든다. */
export function scheduleText(card: WonseoCard): string {
  return (card.schedule_events ?? [])
    .map((e) => [e.label, normalizeDateInput(e.date)].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
}

/** 대략적인 글자 폭(em). 한글·한자는 1em, 그 밖(숫자·영문·기호)은 0.65em으로 본다. */
export function textWidthEm(text: string): number {
  let w = 0;
  for (const ch of text) w += /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u4E00-\u9FFF]/.test(ch) ? 1 : 0.65;
  return w;
}

export type WonseoListColumn = {
  label: string;
  /** 열 너비(em, 표 글자 크기 기준). */
  widthEm: number;
};

/**
 * 원서 목록의 열 너비. 화면에 보이는 줄이 아니라 반 전체 원서에서 열마다 가장 긴 글자에 맞춰서,
 * 필터·정렬·탭을 바꿔도 너비가 그대로이고 빈 여백도 남지 않는다. 길어질 수 있는 열은 최대 너비
 * 안에서 줄바꿈한다. 두 탭이 같은 열을 같은 기준(반 전체 원서)으로 재서 위치가 맞는다.
 */
export function buildWonseoListColumns(
  roster: Roster[],
  cards: WonseoCard[],
  variant: "all" | "submitted",
): WonseoListColumn[] {
  const all = buildWonseoListRows(roster, cards, "all");
  const PAD = 2; // 좌우 여백 px-3 × 2 = 24px = 2em(12px 기준)
  const col = (label: string, values: string[], maxEm: number, extra = 0): WonseoListColumn => {
    const content = Math.max(textWidthEm(label), ...values.map(textWidthEm));
    return { label, widthEm: Math.round((Math.min(content, maxEm) + PAD + extra) * 10) / 10 };
  };
  const columns = [
    // 굵은 글씨라 조금 더 넓게 잡는다.
    col(
      "학생",
      all.map((r) => `${r.studentId} ${r.name}`),
      12,
      0.6,
    ),
    col(
      "지망",
      all.map((r) => `${r.rank}지망`),
      5,
    ),
    col("지원정도", ["소신"], 4, 0.8),
    col(
      "지망대학",
      all.map((r) => r.card.university ?? ""),
      11,
    ),
    col(
      "학과",
      all.map((r) => r.card.department ?? ""),
      11,
    ),
    col(
      "전형유형",
      all.map((r) => r.card.category ?? ""),
      8,
    ),
    col(
      "세부전형명",
      all.map((r) => r.card.sub_category ?? ""),
      11,
    ),
  ];
  if (variant === "submitted") {
    const submitted = buildWonseoListRows(roster, cards, "submitted");
    columns.push(
      col(
        "수험번호",
        submitted.map((r) => r.card.application_number ?? ""),
        8,
      ),
      col(
        "일정",
        submitted.map((r) => scheduleText(r.card)),
        12,
      ),
    );
  }
  return columns;
}
