"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { WonseoCard } from "@/lib/database.types";
import {
  FIRST_RESULT_OPTIONS,
  STAGE_RESULT_OPTIONS,
  applyResultChange,
  finalResult,
  isStaged,
  resultBadge,
  type CardResult,
  type ResultTone,
} from "@/lib/wonseo-result";

/** 진행 중(발표 전·1단계 합격·예비)은 조용한 회색 테두리, 확정된 합격·불합격만 색을 채운다. */
export const RESULT_TONE_STYLE: Record<ResultTone, string> = {
  pending: "bg-white text-slate-500 border-slate-200",
  stage: "bg-white text-slate-700 border-slate-200",
  pass: "bg-emerald-600 text-white border-emerald-600",
  waitlist: "bg-white text-slate-700 border-slate-200",
  fail: "bg-rose-600 text-white border-rose-600",
};
const CHIP = "text-xs font-bold px-2 py-1 rounded-[8px] border";
const isSolid = (tone: ResultTone) => tone === "pass" || tone === "fail";

const BUTTON = "px-2.5 py-1 rounded-lg border text-xs font-bold transition";
const OFF = `${BUTTON} bg-white text-slate-700 border-slate-200 hover:bg-slate-50`;
const ON = `${BUTTON} bg-indigo-600 text-white border-indigo-600`;
const INPUT =
  "bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500";

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-h-[28px]">
      <span className="w-16 shrink-0 text-slate-500">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">{children}</div>
    </div>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => (
  <span className="text-xs text-slate-400">{children}</span>
);

/**
 * 접수한 원서 카드의 최신 발표 결과 배지. 누르면 1단계·최초 발표·충원·최종 결과를 한 번에
 * 보고 고치는 창이 열린다. onChange가 없으면(드래그 미리보기 등) 배지만 보여준다.
 */
export function WonseoResultBadge({
  card,
  onChange,
}: {
  card: WonseoCard;
  onChange?: (next: CardResult) => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  /** 기록이 지워지는 변경은 바로 저장하지 않고 확인을 받는다. */
  const [pending, setPending] = useState<CardResult | null>(null);
  const badge = resultBadge(card);

  const positionPopup = useCallback(() => {
    const popup = popupRef.current;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!popup || !rect || !popup.matches(":popover-open")) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    popup.style.left = `${Math.max(8, Math.min(rect.left, width - popup.offsetWidth - 8))}px`;
    popup.style.top = `${
      rect.bottom + popup.offsetHeight + 12 <= height ? rect.bottom + 6 : Math.max(8, rect.top - popup.offsetHeight - 6)
    }px`;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnScroll = (event: Event) => {
      const popup = popupRef.current;
      if (popup && !(event.target instanceof Node && popup.contains(event.target))) popup.hidePopover();
    };
    window.addEventListener("resize", positionPopup);
    document.addEventListener("scroll", closeOnScroll, true);
    return () => {
      window.removeEventListener("resize", positionPopup);
      document.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [isOpen, positionPopup]);

  // 내용(줄 수)이 바뀌면 창 높이도 바뀌므로 위치를 다시 잡는다.
  useEffect(() => {
    positionPopup();
  });

  if (!onChange) {
    return (
      <span className={cn(CHIP, RESULT_TONE_STYLE[badge.tone])}>
        {badge.label}
      </span>
    );
  }
  const save = onChange;

  function change(patch: Partial<CardResult>) {
    const { next, wipes } = applyResultChange(card, patch);
    if (wipes) setPending(next);
    else save(next);
  }
  /** 같은 버튼을 다시 누르면 선택을 풀어 "발표 전"으로 되돌린다. */
  const toggle = <K extends keyof CardResult>(key: K, value: CardResult[K]) =>
    change({ [key]: card[key] === value ? null : value } as Partial<CardResult>);

  function commitWaitlistNumber(raw: string) {
    const digits = raw.replace(/\D/g, "");
    const value = digits ? Number(digits) : null;
    if (value !== card.waitlist_number) change({ waitlist_number: value && value >= 1 ? value : null });
  }
  function commitProgress(raw: string) {
    const value = raw.trim() || null;
    if (value !== card.waitlist_progress) change({ waitlist_progress: value });
  }
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  const staged = isStaged(card);
  const stoppedAtStage1 = staged && card.stage1_result === "불합격";
  const final = finalResult(card);

  function open() {
    const popup = popupRef.current;
    if (!popup) return;
    if (popup.matches(":popover-open")) {
      popup.hidePopover();
      return;
    }
    popup.showPopover();
    positionPopup();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="발표 결과 입력"
        className={cn(
          CHIP,
          "pr-1.5 inline-flex items-center gap-1 transition",
          RESULT_TONE_STYLE[badge.tone],
          !isSolid(badge.tone) && "hover:bg-slate-50",
          isOpen && "ring-2 ring-indigo-300",
        )}
      >
        {badge.label}
        <ChevronDown className={cn("w-3 h-3", isSolid(badge.tone) ? "opacity-80" : "text-slate-400")} aria-hidden="true" />
      </button>
      <div
        ref={popupRef}
        popover="auto"
        role="dialog"
        aria-label={`${card.university ?? ""} 발표 결과`}
        style={{ right: "auto", bottom: "auto" }}
        onToggle={(e) => {
          const nowOpen = (e as unknown as { newState: string }).newState === "open";
          setIsOpen(nowOpen);
          if (!nowOpen) setPending(null);
        }}
        className="fixed m-0 w-[336px] max-w-[calc(100vw-16px)] bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-[13px] text-slate-800 space-y-2"
      >
        <button
            type="button"
            onClick={() => popupRef.current?.hidePopover()}
            aria-label="닫기"
            className="absolute top-2 right-2 w-6 h-6 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"
          >
            <X className="w-3.5 h-3.5" />
          </button>

        <div className="space-y-1.5">
          {staged && (
            <Row label="1단계">
              {STAGE_RESULT_OPTIONS.map((v) => (
                <button key={v} type="button" className={card.stage1_result === v ? ON : OFF} onClick={() => toggle("stage1_result", v)}>
                  {v}
                </button>
              ))}
            </Row>
          )}
          {!stoppedAtStage1 && (
            <Row label="최초 발표">
              {staged && card.stage1_result !== "합격" ? (
                <Muted>1단계 합격 후 입력</Muted>
              ) : (
                <>
                  {FIRST_RESULT_OPTIONS.map((v) => (
                    <button key={v} type="button" className={card.first_result === v ? ON : OFF} onClick={() => toggle("first_result", v)}>
                      {v}
                    </button>
                  ))}
                  {card.first_result === "예비" && (
                    <span className="inline-flex items-center gap-1">
                      <input
                        key={`no-${card.waitlist_number}`}
                        defaultValue={card.waitlist_number ?? ""}
                        placeholder="번호"
                        inputMode="numeric"
                        aria-label="최초 예비 번호"
                        onBlur={(e) => commitWaitlistNumber(e.target.value)}
                        onKeyDown={blurOnEnter}
                        className={`${INPUT} w-12`}
                      />
                      <span className="text-xs text-slate-500">번</span>
                    </span>
                  )}
                </>
              )}
            </Row>
          )}
          {card.first_result === "예비" && (
            <Row label="충원">
              <input
                key={`progress-${card.waitlist_progress}`}
                defaultValue={card.waitlist_progress ?? ""}
                placeholder="예: 11 → 4 (단계별 입력 가능)"
                aria-label="충원 예비 순위"
                maxLength={60}
                onBlur={(e) => commitProgress(e.target.value)}
                onKeyDown={blurOnEnter}
                className={`${INPUT} w-[170px]`}
              />
            </Row>
          )}
        </div>

        <div className="border-t border-slate-200 pt-2">
          <Row label={<span className="font-bold text-slate-700">최종 결과</span>}>
            {!final.auto ? (
              <>
                {STAGE_RESULT_OPTIONS.map((v) => (
                  <button key={v} type="button" className={card.waitlist_final === v ? ON : OFF} onClick={() => toggle("waitlist_final", v)}>
                    {v}
                  </button>
                ))}
              </>
            ) : final.value ? (
              <span className={cn(CHIP, RESULT_TONE_STYLE[final.value === "합격" ? "pass" : "fail"])}>{final.value}</span>
            ) : (
              <Muted>발표 대기</Muted>
            )}
          </Row>
        </div>

        {pending && (
          <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg p-2.5 text-xs font-semibold space-y-2">
            <p>뒤 단계 기록(예비 번호·충원 포함)이 지워져요.</p>
            <div className="flex gap-1.5">
              <button
                type="button"
                className={`${BUTTON} bg-amber-600 text-white border-amber-600`}
                onClick={() => {
                  save(pending);
                  setPending(null);
                }}
              >
                지우고 변경
              </button>
              <button type="button" className={OFF} onClick={() => setPending(null)}>
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
