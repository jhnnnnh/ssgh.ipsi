import type { FirstResult, StageResult, WonseoCard } from "@/lib/database.types";

/** 원서 카드의 발표 결과 칸들. DB 칸 이름 그대로다. */
export type CardResult = Pick<
  WonseoCard,
  "stage1_result" | "first_result" | "waitlist_number" | "waitlist_progress" | "waitlist_final"
>;

type ResultSource = CardResult & Pick<WonseoCard, "selection_mode">;

/** 배지 색 구분: 발표 전 / 1단계 통과 / 합격 / 예비 / 불합격. */
export type ResultTone = "pending" | "stage" | "pass" | "waitlist" | "fail";

/** 단계별(1단계·2단계) 전형이면 1단계 결과 칸이 있다. */
export const isStaged = (card: Pick<WonseoCard, "selection_mode">) => card.selection_mode === "multi";

/** 충원 메모("11 → 4")의 마지막 숫자가 지금 예비 순위다. 없으면 최초 예비 번호. */
export function currentWaitlistNumber(card: CardResult): number | null {
  const numbers = card.waitlist_progress?.match(/\d+/g);
  return numbers ? Number(numbers[numbers.length - 1]) : card.waitlist_number;
}

/**
 * 카드 바닥에 배지와 함께 보일 예비 순위 기록(예: "예비 23 → 11 → 4"). 배지와 같은 말만
 * 반복하게 되는 경우(충원 메모 없이 최초 예비 번호만 있는 진행 중 상태)는 null.
 */
export function waitlistTrail(card: CardResult): string | null {
  if (card.first_result !== "예비") return null;
  if (!card.waitlist_progress && !card.waitlist_final) return null;
  const parts = [card.waitlist_number && `예비 ${card.waitlist_number}`, card.waitlist_progress].filter(Boolean);
  return parts.length ? parts.join(" → ") : null;
}

/** 최종 결과. auto=false면 예비를 거친 경우라 학생이 직접 고른다. */
export function finalResult(card: ResultSource): { value: StageResult | null; auto: boolean } {
  if (isStaged(card) && card.stage1_result === "불합격") return { value: "불합격", auto: true };
  if (card.first_result === "합격" || card.first_result === "불합격") return { value: card.first_result, auto: true };
  if (card.first_result === "예비") return { value: card.waitlist_final, auto: false };
  return { value: null, auto: true };
}

/** 카드 배지에 보일 가장 최신 결과. */
export function resultBadge(card: ResultSource): { label: string; tone: ResultTone } {
  if (isStaged(card) && card.stage1_result === "불합격") return { label: "1단계 불합격", tone: "fail" };
  if (card.first_result === "합격") return { label: "최초합격", tone: "pass" };
  if (card.first_result === "불합격") return { label: "불합격", tone: "fail" };
  if (card.first_result === "예비") {
    if (card.waitlist_final === "합격") return { label: "충원합격", tone: "pass" };
    if (card.waitlist_final === "불합격") return { label: "불합격", tone: "fail" };
    const n = currentWaitlistNumber(card);
    return { label: n ? `예비 ${n}` : "예비", tone: "waitlist" };
  }
  if (isStaged(card) && card.stage1_result === "합격") return { label: "1단계 합격", tone: "stage" };
  return { label: "발표 전", tone: "pending" };
}

/**
 * 결과 칸 하나를 바꾼 뒤, 앞 단계와 맞지 않게 된 뒤 단계 값을 비운다(DB 제약과 같은 규칙).
 * wipes=true면 이미 적어 둔 기록이 지워지므로 화면에서 먼저 확인을 받는다.
 */
export function applyResultChange(card: ResultSource, patch: Partial<CardResult>): { next: CardResult; wipes: boolean } {
  const next: CardResult = {
    stage1_result: card.stage1_result,
    first_result: card.first_result,
    waitlist_number: card.waitlist_number,
    waitlist_progress: card.waitlist_progress,
    waitlist_final: card.waitlist_final,
    ...patch,
  };
  if (!isStaged(card)) next.stage1_result = null;
  const wipesFirst = isStaged(card) && next.stage1_result !== "합격" && next.first_result !== null;
  if (wipesFirst) next.first_result = null;
  const notWaitlist = next.first_result !== "예비";
  const wipesWaitlist =
    notWaitlist && (next.waitlist_number !== null || !!next.waitlist_progress || next.waitlist_final !== null);
  if (notWaitlist) {
    next.waitlist_number = null;
    next.waitlist_progress = null;
    next.waitlist_final = null;
  }
  return { next, wipes: wipesFirst || wipesWaitlist };
}

export const FIRST_RESULT_OPTIONS: FirstResult[] = ["합격", "예비", "불합격"];
export const STAGE_RESULT_OPTIONS: StageResult[] = ["합격", "불합격"];
