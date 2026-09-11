export const WEEKDAY_KR = ["일", "월", "화", "수", "목", "금", "토"];

export function formatDateLabel(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAY_KR[d.getDay()]})`;
}

export function formatDateFull(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일(${WEEKDAY_KR[d.getDay()]})`;
}

export function isWeekendDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** 사용자가 시간 입력창에 숫자만 입력해도 "HH:MM" 형태로 자동 정리한다. */
export function autoFormatTime(raw: string) {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/** DB에서 오는 "HH:MM:SS" 형태의 time 값을 화면 표시용 "HH:MM"으로 자른다. */
export function formatTime(value: string) {
  return value.slice(0, 5);
}

export function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function addMinutesToTime(time: string, minutes: number) {
  if (!isValidTime(time)) return "";
  const [h, m] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes + 24 * 60) % (24 * 60);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export function compareTime(a: string, b: string) {
  return a.localeCompare(b);
}

/** "HH:MM" 두 구간이 겹치는지 확인한다 (끝 시각과 다음 시작 시각이 같은 건 겹침이 아님). */
export function timeRangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  return startA < endB && startB < endA;
}

type TimeOrLabelSlot = { label: string | null; start_time: string | null; end_time: string | null };

/** 상담 슬롯 한 칸의 표시 문구. 시간 슬롯이면 "13:00 ~ 13:30", 정해진 시각이 없는 "예비"
 * 슬롯이면 그 이름(label, 예: "예비1")을 그대로 보여준다. */
export function formatSlotDisplay(slot: TimeOrLabelSlot) {
  if (slot.label) return slot.label;
  if (slot.start_time && slot.end_time) return `${formatTime(slot.start_time)} ~ ${formatTime(slot.end_time)}`;
  return "";
}

/** 슬롯 목록을 표시 순서로 정렬하는 비교 함수. 시간 슬롯은 시각순으로 먼저 오고, 시각이
 * 없는 "예비" 슬롯은 항상 그 뒤에 이름순으로 온다. (참고: "~예비1"처럼 특수문자를 붙인
 * 문자열을 localeCompare로 비교하는 방식은 브라우저 로케일에 따라 기호와 숫자의 사전식
 * 순서가 달라져 예비 슬롯이 시간 슬롯보다 앞에 오는 경우가 있어, null 여부를 직접
 * 분기하는 방식으로 바꿨다.) */
export function compareSlotsForDisplay(a: TimeOrLabelSlot, b: TimeOrLabelSlot): number {
  if (a.start_time != null && b.start_time != null) {
    return a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0;
  }
  if (a.start_time != null) return -1;
  if (b.start_time != null) return 1;
  return (a.label ?? "").localeCompare(b.label ?? "");
}

/** "20261111"처럼 구분자 없이 숫자 8자리로 입력해도 "2026-11-11" 형식으로 맞춰 보여준다
 * (점·슬래시 등 다른 구분자로 입력해도 숫자만 추려 같은 방식으로 맞춘다). 8자리가 아니면
 * 자유 텍스트를 그대로 둔다 — 날짜가 아직 미정이거나 "추후 공지" 같은 메모여도 막지 않는다. */
export function normalizeDateInput(raw: string): string {
  const trimmed = raw.trim();
  const digitsOnly = trimmed.replace(/[^0-9]/g, "");
  if (digitsOnly.length === 8) {
    return `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4, 6)}-${digitsOnly.slice(6, 8)}`;
  }
  return trimmed;
}

/** 로컬 타임존 기준 오늘 날짜를 "YYYY-MM-DD"로 반환한다. */
export function todayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
