import { toDateString } from "@/lib/calendar-grid";
import type { ResolvedCalendarEvent } from "@/lib/hooks/useCalendarEvents";

/**
 * 같은 일정을 연속된 날짜에 각각 등록한 경우(예: 원서 접수 기간을 하루씩 나눠 입력) 하나로
 * 묶어서 다루기 위한 그룹 키. 원서 연동 일정(접수한 원서의 일정)은 항상 하루짜리라 대상에서
 * 제외한다.
 */
export function eventGroupKey(ev: ResolvedCalendarEvent | null | undefined): string | null {
  if (!ev || ev.type === "wonseo_schedule") return null;
  const owner =
    ev.type === "personal"
      ? ev.created_by
      : ev.type === "class"
        ? `${ev.grade}-${ev.class_no}`
        : "grade";
  return `${ev.type}:${owner}:${ev.title}:${ev.color}`;
}

function isNextDay(a: string, b: string): boolean {
  const d = new Date(`${a}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toDateString(d) === b;
}

/**
 * ev와 같은 그룹(유형/소유자/제목/색상)이면서 날짜가 하루도 안 끊기고 이어지는 이벤트들을
 * 날짜순으로 반환한다(ev가 속한 구간만). 그룹이 없으면 [ev]만 반환한다.
 */
export function findConnectedGroup(
  ev: ResolvedCalendarEvent,
  events: ResolvedCalendarEvent[],
): ResolvedCalendarEvent[] {
  const key = eventGroupKey(ev);
  if (key == null || !ev.resolvedDate) return [ev];

  const sameKey = events
    .filter((e) => e.resolvedDate && eventGroupKey(e) === key)
    .sort((a, b) => a.resolvedDate!.localeCompare(b.resolvedDate!));

  const idx = sameKey.findIndex((e) => e.id === ev.id);
  if (idx === -1) return [ev];

  let start = idx;
  let end = idx;
  while (start > 0 && isNextDay(sameKey[start - 1].resolvedDate!, sameKey[start].resolvedDate!)) start--;
  while (end < sameKey.length - 1 && isNextDay(sameKey[end].resolvedDate!, sameKey[end + 1].resolvedDate!))
    end++;

  return sameKey.slice(start, end + 1);
}
