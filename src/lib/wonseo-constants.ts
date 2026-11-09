import type { SupportLevel } from "@/lib/database.types";

export const LEVEL_OPTIONS: SupportLevel[] = ["상향", "소신", "적정", "하향"];

/** 지원 정도 선택 버튼(입력 폼)의 활성/비활성 스타일 */
export const LEVEL_TOGGLE_STYLE: Record<SupportLevel, { active: string; inactive: string }> = {
  상향: {
    active: "bg-rose-600 text-white border-rose-600",
    inactive: "bg-white text-rose-600 border-rose-200 hover:bg-rose-50",
  },
  소신: {
    active: "bg-amber-500 text-white border-amber-500",
    inactive: "bg-white text-amber-600 border-amber-200 hover:bg-amber-50",
  },
  적정: {
    active: "bg-emerald-600 text-white border-emerald-600",
    inactive: "bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50",
  },
  하향: {
    active: "bg-blue-600 text-white border-blue-600",
    inactive: "bg-white text-blue-600 border-blue-200 hover:bg-blue-50",
  },
};

/** 원서 카드의 지원 정도 표시: 진한 배지 + 카드 왼쪽 색 막대(테두리는 회색으로 두고 색은 막대에만 준다). */
export const LEVEL_EMPHASIS_STYLE: Record<SupportLevel, { badge: string; bar: string }> = {
  상향: { badge: "bg-rose-600 text-white", bar: "bg-rose-500" },
  소신: { badge: "bg-amber-600 text-white", bar: "bg-amber-400" },
  적정: { badge: "bg-emerald-600 text-white", bar: "bg-emerald-500" },
  하향: { badge: "bg-blue-600 text-white", bar: "bg-blue-500" },
};

/** 수시 원서 표(화면)에서 지원 정도 값 셀을 강조하는 스타일 */
export const LEVEL_TABLE_CELL_STYLE: Record<SupportLevel, string> = {
  상향: "bg-rose-100 text-rose-700",
  소신: "bg-amber-100 text-amber-700",
  적정: "bg-emerald-100 text-emerald-700",
  하향: "bg-blue-100 text-blue-700",
};

/** 전형 유형 빠른 선택 버튼 (그 외 값은 "직접입력"으로 취급) */
export const QUICK_CATEGORY_OPTIONS = ["학생부교과", "학생부종합", "논술", "실기"] as const;
