"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { CalendarPicker } from "@/components/ui/DatePicker";
import { createClient } from "@/lib/supabase/client";
import { WonseoAttachmentPreview } from "@/components/wonseo/WonseoAttachmentPreview";
import { WonseoImageLightbox } from "@/components/wonseo/WonseoImageLightbox";
import { RecentResultsSection } from "@/components/wonseo/RecentResultsSection";
import { LEVEL_EMPHASIS_STYLE } from "@/lib/wonseo-constants";
import { WonseoResultBadge } from "@/components/wonseo/WonseoResultBadge";
import { waitlistTrail, type CardResult } from "@/lib/wonseo-result";
import { normalizeDateInput } from "@/lib/time";
import type { ScheduleEvent, WonseoCard, WonseoImage } from "@/lib/database.types";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-slate-500">{label} </span>
      <span className="font-semibold text-slate-800 whitespace-pre-line">{value}</span>
    </p>
  );
}

/** 클릭하기 전에는 일반 텍스트처럼 보이다가, 클릭하면 그 자리에서 입력칸으로 바뀌는
 * 인라인 편집 텍스트. 지망 순위(수동 입력)·수험번호·일정 라벨에 공용으로 쓴다 — 항상
 * 테두리가 보이는 입력칸으로 두면 값이 있을 때도 "빈 칸"처럼 보이고, 편집 상태로 바뀔 때
 * 테두리만큼 박스가 커져 글자가 밀리는 문제가 있어 테두리 없이 배경 필드만 살짝 티나게 한다. */
function InlineEditableText({
  value,
  placeholder,
  onCommit,
  displayClassName,
  inputClassName,
  normalize,
  maxLength,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
  displayClassName: string;
  inputClassName: string;
  /** 값을 커밋하기 전에 형식을 다듬는다(예: 날짜 자동 하이픈 삽입). */
  normalize?: (raw: string) => string;
  maxLength?: number;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onBlur={(e) => {
          setEditing(false);
          onCommit(normalize ? normalize(e.target.value) : e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className={inputClassName}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`${displayClassName} text-left cursor-text hover:bg-slate-100 rounded transition`}
    >
      {value || <span className="text-slate-400 font-normal">{placeholder}</span>}
    </button>
  );
}

/** 자유 입력과 달력 선택 모두 같은 고정 폭을 유지한다. */
const SCHEDULE_DATE_WIDTH = "w-[84px]";

function InlineEditableDate({
  value,
  placeholder,
  onCommit,
  className,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
  className: string;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (editing) {
    return (
      <span className={`relative inline-block ${SCHEDULE_DATE_WIDTH} shrink-0`} onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setEditing(false);
          onCommit(normalizeDateInput(inputRef.current?.value ?? value));
        }
      }}>
        <input
          ref={inputRef}
          autoFocus
          defaultValue={value}
          placeholder={placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") { e.stopPropagation(); setEditing(false); }
          }}
          className="w-full bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-300 rounded pl-0.5 pr-3.5 text-xs font-semibold text-slate-800"
        />
        <span className="absolute right-0 top-1/2 -translate-y-1/2">
          <CalendarPicker value={value} onChange={(date) => {
            setEditing(false);
            onCommit(date);
          }} className="text-slate-400 hover:text-indigo-500 [&_svg]:w-3 [&_svg]:h-3" />
        </span>
      </span>
    );
  }
  const displayValue = normalizeDateInput(value);
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`${SCHEDULE_DATE_WIDTH} shrink-0 truncate ${className} text-left cursor-text hover:bg-slate-100 rounded transition`}
    >
      {displayValue || <span className="text-slate-400 font-normal">{placeholder}</span>}
    </button>
  );
}

export const WonseoCardView = forwardRef<
  HTMLDivElement,
  {
    card: WonseoCard;
    /** 목록 상단의 전체 on/off 버튼으로 제어되는, 최근 입결 표시 여부. "submitted" 모드에서는 안 쓴다. */
    showRecentResults: boolean;
    onEdit: () => void;
    onDelete: () => void;
    /** 실제로 접수한 카드인지(별표) 표시·토글. */
    isSubmitted: boolean;
    onToggleSubmitted: () => void;
    minHeight?: number;
    /** 카드 동일높이 계산용 실측 대상. min-height가 걸리는 루트 대신 이 안쪽 요소를
     * 재야, 내용이 줄어들 때도 예전 min-height에 막히지 않고 실제 줄어든 높이를 감지한다. */
    measureRef?: (el: HTMLDivElement | null) => void;
    style?: React.CSSProperties;
    className?: string;
    dragHandle?: React.ReactNode;
    /** 상단 오른쪽 버튼 줄 맨 앞에 붙는 추가 버튼(예: 그룹 이동 메뉴). */
    extraActions?: React.ReactNode;
    /** 지망 번호를 받는 구역의 카드면 위치로 계산된 라벨(예: "1지망"). 없으면 지망 칸은 메모 칸이 된다. */
    rankLabel?: string;
    /** 번호 없는 카드의 지망 칸 메모가 바뀌면(blur 시) 저장한다. 없으면 메모를 읽기 전용으로 보여준다. */
    onRankChange?: (text: string) => void;
    /** "full"(기본): 전형방법·모집인원·최근입결 등 전체 정보. "submitted": "접수한 원서"
     * 화면 전용으로, 학교/학과/전형만 보이고 그 자리에 수험번호·일정 편집기를 보여준다. */
    bodyMode?: "full" | "submitted";
    onSubmittedFieldsCommit?: (fields: { applicationNumber: string; scheduleEvents: ScheduleEvent[] }) => void;
    /** "submitted" 모드의 발표 결과 배지가 바뀌면 저장한다. 없으면 배지를 읽기 전용으로 보여준다. */
    onResultChange?: (result: CardResult) => void;
  }
>(function WonseoCardView(
  {
    card,
    showRecentResults,
    onEdit,
    onDelete,
    isSubmitted,
    onToggleSubmitted,
    minHeight,
    measureRef,
    style,
    className,
    dragHandle,
    extraActions,
    rankLabel,
    onRankChange,
    bodyMode = "full",
    onSubmittedFieldsCommit,
    onResultChange,
  },
  ref,
) {
  const [images, setImages] = useState<WonseoImage[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [applicationNumber, setApplicationNumber] = useState(card.application_number ?? "");
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>(card.schedule_events ?? []);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("wonseo_images")
      .select("*")
      .eq("card_id", card.id)
      .then(({ data }) => setImages(data ?? []));
  }, [card.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApplicationNumber(card.application_number ?? "");
    setScheduleEvents(card.schedule_events ?? []);
  }, [card.id, card.application_number, card.schedule_events]);

  const emphasis = LEVEL_EMPHASIS_STYLE[card.level];
  const trail = waitlistTrail(card);

  const methodValue =
    card.selection_mode === "single"
      ? card.stage_single
      : [card.stage_1 && `1단계 ${card.stage_1}`, card.stage_2 && `2단계 ${card.stage_2}`]
          .filter(Boolean)
          .join(" · ");

  function commitSubmittedFields(next: { applicationNumber?: string; scheduleEvents?: ScheduleEvent[] }) {
    onSubmittedFieldsCommit?.({
      applicationNumber: next.applicationNumber ?? applicationNumber,
      scheduleEvents: next.scheduleEvents ?? scheduleEvents,
    });
  }

  function addSchedule() {
    setScheduleEvents((prev) => [...prev, { id: crypto.randomUUID(), label: "", date: "" }]);
  }
  function removeSchedule(id: string) {
    const next = scheduleEvents.filter((s) => s.id !== id);
    setScheduleEvents(next);
    commitSubmittedFields({ scheduleEvents: next });
  }
  /** 값을 바꾸는 즉시(=편집칸에서 blur될 때) 저장까지 한 번에 한다. setScheduleEvents의
   * 함수형 업데이트 콜백 안에서 커밋해야, 같은 렌더에서 아직 안 반영된 이전 state를
   * 실수로 저장하는 걸 피할 수 있다. id로 항목을 찾으므로, 다른 항목을 지우거나 순서를
   * 바꿔도 엉뚱한 항목이 수정되지 않는다. */
  function commitScheduleField(id: string, key: keyof Omit<ScheduleEvent, "id">, value: string) {
    setScheduleEvents((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, [key]: value } : s));
      commitSubmittedFields({ scheduleEvents: next });
      return next;
    });
  }

  return (
    <div
      ref={ref}
      style={{ ...(minHeight ? { minHeight } : undefined), ...style }}
      className={`bg-white rounded-[12px] border border-slate-200 hover:border-slate-300 transition-colors overflow-hidden flex ${className ?? ""}`}
    >
      <div className={`w-1.5 shrink-0 ${emphasis.bar}`} />
      <div
        ref={measureRef}
        // 접수한 원서 화면에선 발표 결과 줄을 카드 바닥에 붙이려고 세로로 늘인다(이 화면은 동일높이 측정을 안 쓴다).
        className={`flex-1 p-4 space-y-3 min-w-0 ${bodyMode === "submitted" ? "flex flex-col" : "self-start"}`}
      >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {dragHandle}
          {rankLabel ? (
            <span className="text-xs font-bold text-slate-900">{rankLabel}</span>
          ) : onRankChange ? (
            <InlineEditableText
              value={card.rank ?? ""}
              placeholder="메모"
              maxLength={12}
              onCommit={onRankChange}
              displayClassName="text-xs font-bold text-slate-900"
              inputClassName="w-24 bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-300 rounded text-xs font-bold text-slate-900 placeholder:font-semibold placeholder:text-slate-400"
            />
          ) : (
            card.rank && <span className="text-xs font-bold text-slate-900">{card.rank}</span>
          )}
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-lg ${emphasis.badge}`}
          >
            {card.level}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {extraActions}
          <button
            onClick={onToggleSubmitted}
            title={isSubmitted ? "접수 표시 해제" : "실제로 접수한 카드로 표시"}
            className={`w-7 h-7 rounded-lg flex items-center justify-center ${
              isSubmitted ? "bg-amber-100 hover:bg-amber-200 text-amber-500" : "bg-slate-50 hover:bg-slate-100 text-slate-400"
            }`}
          >
            <Star className="w-3.5 h-3.5" fill={isSubmitted ? "currentColor" : "none"} />
          </button>
          <button
            onClick={onEdit}
            className="w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 flex items-center justify-center"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <h4
              className="text-lg font-bold text-slate-900 truncate shrink-0"
              style={{ maxWidth: "58%" }}
            >
              {card.university}
            </h4>
            <span className="text-lg font-bold text-slate-900 truncate min-w-0">
              {card.department}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5 text-xs font-bold">
            <span className="border border-slate-200 bg-slate-50 text-slate-700 px-2 py-1 rounded-[8px]">
              {card.category}
            </span>
            {card.sub_category && (
              <span className="border border-slate-200 bg-slate-50 text-slate-700 px-2 py-1 rounded-[8px]">
                {card.sub_category}
              </span>
            )}
          </div>
        </div>
        {bodyMode === "full" && <WonseoAttachmentPreview images={images} onClick={() => setLightboxOpen(true)} />}
      </div>

      {bodyMode === "submitted" ? (
        <>
        <div className="text-[13px] space-y-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 shrink-0">수험번호</span>
            <InlineEditableText
              value={applicationNumber}
              placeholder="입력"
              onCommit={(text) => {
                setApplicationNumber(text);
                commitSubmittedFields({ applicationNumber: text });
              }}
              displayClassName="font-semibold text-slate-800"
              inputClassName="w-28 bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-300 rounded px-0.5 text-[13px] font-semibold text-slate-800"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">일정 <span className="text-slate-400">(논술·면접·발표 등)</span></span>
              <button
                type="button"
                onClick={addSchedule}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                추가
              </button>
            </div>
            {scheduleEvents.length === 0 && <p className="text-xs text-slate-400">등록된 일정이 없어요.</p>}
            <div className="space-y-1">
              {scheduleEvents.map((s) => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <InlineEditableText
                    value={s.label}
                    placeholder="논술 등"
                    onCommit={(text) => commitScheduleField(s.id, "label", text)}
                    displayClassName="w-20 shrink-0 truncate font-semibold text-slate-800"
                    inputClassName="w-20 shrink-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-300 rounded px-0.5 text-xs font-semibold text-slate-800"
                  />
                  <InlineEditableDate
                    value={s.date}
                    placeholder="날짜"
                    onCommit={(text) => commitScheduleField(s.id, "date", text)}
                    className="text-xs font-semibold text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => removeSchedule(s.id)}
                    className="w-7 h-7 shrink-0 ml-auto rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-3 text-[13px] min-w-0">
          <span className="text-slate-500 shrink-0">발표 결과</span>
          <WonseoResultBadge card={card} onChange={onResultChange} />
          {trail && <span className="text-xs font-semibold text-slate-500 truncate">{trail}</span>}
        </div>
        </>
      ) : (
        <>
          <div className="text-[13px] space-y-1 border-t border-slate-100 pt-3">
            {methodValue && <InfoRow label="전형방법" value={methodValue} />}
            {(card.calculated_grade || card.min_standard || card.enrollment != null) && (
              <div className="flex flex-wrap gap-x-4">
                {card.enrollment != null && (
                  <InfoRow label="모집인원" value={`${card.enrollment}명`} />
                )}
                {card.calculated_grade && <InfoRow label="등급" value={card.calculated_grade} />}
                {card.min_standard && <InfoRow label="최저" value={card.min_standard} />}
              </div>
            )}
          </div>

          <RecentResultsSection years={card.recent_results ?? []} open={showRecentResults} />

          {card.memo && (
            <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-[10px] p-3 whitespace-pre-wrap">
              {card.memo}
            </p>
          )}
        </>
      )}

      </div>
      {bodyMode === "full" && (
        <WonseoImageLightbox open={lightboxOpen} onClose={() => setLightboxOpen(false)} images={images} />
      )}
    </div>
  );
});
