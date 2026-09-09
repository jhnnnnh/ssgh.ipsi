import type { CalendarEventType } from "@/lib/database.types";

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  wonseo_schedule: "원서 일정",
  personal: "개인 일정",
  class: "반 일정",
  grade: "학년 공통",
};

/** 새 일정의 기본 색상. 유형과 무관하게 항상 이 색으로 시작하고, 이후 사용자가 팔레트에서 자유롭게 바꾼다. */
export const DEFAULT_EVENT_COLOR = "#378ADD";

/** 일정 추가 폼의 색상 팔레트(원형 스와치). */
export const EVENT_COLOR_PALETTE = [
  "#378ADD",
  "#7F77DD",
  "#1D9E75",
  "#D85A30",
  "#DB4C6C",
  "#C7A008",
  "#64748B",
] as const;

export function weekdayLabelClass(dayOfWeek: number): string {
  if (dayOfWeek === 0) return "text-rose-500";
  if (dayOfWeek === 6) return "text-blue-500";
  return "text-slate-500";
}
