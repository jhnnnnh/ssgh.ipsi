"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { CalendarDays, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WonseoAttachmentPreview } from "@/components/wonseo/WonseoAttachmentPreview";
import { WonseoImageLightbox } from "@/components/wonseo/WonseoImageLightbox";
import { RecentResultsSection } from "@/components/wonseo/RecentResultsSection";
import { LEVEL_EMPHASIS_STYLE, STATUS_BADGE_STYLE, STATUS_OPTIONS } from "@/lib/wonseo-constants";
import { formatDateLabel } from "@/lib/time";
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
 * 인라인 편집 텍스트. 지망 순위(수동 입력)·수험번호에 공용으로 쓴다 — 항상 테두리가
 * 보이는 입력칸으로 두면 값이 있을 때도 "빈 칸"처럼 보여서 자연스럽지 않다는 피드백을
 * 반영했다. */
function InlineEditableText({
  value,
  placeholder,
  onCommit,
  displayClassName,
  inputClassName,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
  displayClassName: string;
  inputClassName: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        autoFocus
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => {
          setEditing(false);
          onCommit(e.target.value);
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
      className={`${displayClassName} text-left cursor-text hover:bg-slate-100 rounded px-0.5 -mx-0.5 transition`}
    >
      {value || <span className="text-slate-400 font-normal">{placeholder}</span>}
    </button>
  );
}

/** 일정 한 건의 날짜 입력칸. 세그먼트를 하나씩 클릭해서 채워야 하는 &lt;input type="date"&gt;
 * 특유의 불편함 때문에, 기본은 자유롭게 타이핑할 수 있는 텍스트 입력으로 두고 달력
 * 아이콘을 누르면 네이티브 날짜 선택기가 뜨도록 했다(선택기로 고르면 텍스트 칸에
 * 그대로 반영된다). */
function ScheduleDateField({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative w-[132px] shrink-0">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="YYYY-MM-DD"
        className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-2 pr-7 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => pickerRef.current?.showPicker?.()}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 p-0.5"
      >
        <CalendarDays className="w-3.5 h-3.5" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""}
        onChange={(e) => {
          onChange(e.target.value);
          onBlur();
        }}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      />
    </div>
  );
}

export const WonseoCardView = forwardRef<
  HTMLDivElement,
  {
    card: WonseoCard;
    showStatus: boolean;
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
    /** 지망 순위 자동 배정이 켜져 있을 때 보여줄, 카드 위치로 계산된 라벨(예: "1지망"). */
    autoAssign?: boolean;
    rankLabel?: string;
    /** 자동 배정이 꺼져 있을 때 학생/교사가 직접 입력한 텍스트가 바뀌면(blur 시) 저장한다. */
    onRankChange?: (text: string) => void;
    /** "full"(기본): 전형방법·모집인원·최근입결 등 전체 정보. "submitted": "접수한 원서"
     * 화면 전용으로, 학교/학과/전형만 보이고 그 자리에 수험번호·일정 편집기를 보여준다. */
    bodyMode?: "full" | "submitted";
    onSubmittedFieldsCommit?: (fields: { applicationNumber: string; scheduleEvents: ScheduleEvent[] }) => void;
  }
>(function WonseoCardView(
  {
    card,
    showStatus,
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
    autoAssign = true,
    rankLabel,
    onRankChange,
    bodyMode = "full",
    onSubmittedFieldsCommit,
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

  const statusLabel = STATUS_OPTIONS.find((o) => o.value === card.status)?.label ?? card.status;

  const emphasis = LEVEL_EMPHASIS_STYLE[card.level];

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
    setScheduleEvents((prev) => [...prev, { label: "", date: "" }]);
  }
  function removeSchedule(index: number) {
    const next = scheduleEvents.filter((_, i) => i !== index);
    setScheduleEvents(next);
    commitSubmittedFields({ scheduleEvents: next });
  }
  function updateSchedule(index: number, key: keyof ScheduleEvent, value: string) {
    setScheduleEvents((prev) => prev.map((s, i) => (i === index ? { ...s, [key]: value } : s)));
  }

  return (
    <div
      ref={ref}
      style={{ ...(minHeight ? { minHeight } : undefined), ...style }}
      className={`bg-white rounded-3xl border-2 ${emphasis.border} shadow-sm overflow-hidden flex ${className ?? ""}`}
    >
      <div className={`w-2 shrink-0 ${emphasis.bar}`} />
      <div ref={measureRef} className="flex-1 self-start p-5 space-y-3 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {dragHandle}
          {autoAssign ? (
            <span className="text-[11px] font-bold text-slate-900">{rankLabel}</span>
          ) : (
            <InlineEditableText
              value={card.rank ?? ""}
              placeholder="미지정"
              onCommit={(text) => onRankChange?.(text)}
              displayClassName="text-[11px] font-bold text-slate-900"
              inputClassName="text-[11px] font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5 w-20 focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder:font-semibold placeholder:text-slate-400"
            />
          )}
          <span
            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${emphasis.badge}`}
          >
            {card.level}
          </span>
          {showStatus && (
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_BADGE_STYLE[card.status]}`}
            >
              {statusLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
            <span className="border border-slate-300 text-slate-700 px-2 py-1 rounded-lg">
              {card.category}
            </span>
            {card.sub_category && (
              <span className="border border-slate-300 text-slate-700 px-2 py-1 rounded-lg">
                {card.sub_category}
              </span>
            )}
          </div>
        </div>
        {bodyMode === "full" && <WonseoAttachmentPreview images={images} onClick={() => setLightboxOpen(true)} />}
      </div>

      {bodyMode === "submitted" ? (
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
              inputClassName="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">일정 <span className="text-slate-400">(논술·면접·발표 등)</span></span>
              <button
                type="button"
                onClick={addSchedule}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[11px] font-bold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                추가
              </button>
            </div>
            {scheduleEvents.length === 0 && <p className="text-[11px] text-slate-400">등록된 일정이 없어요.</p>}
            <div className="space-y-1.5">
              {scheduleEvents.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={s.label}
                    onChange={(e) => updateSchedule(i, "label", e.target.value)}
                    onBlur={() => commitSubmittedFields({})}
                    placeholder="예: 논술, 1차 발표"
                    className="flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <ScheduleDateField
                    value={s.date}
                    onChange={(v) => updateSchedule(i, "date", v)}
                    onBlur={() => commitSubmittedFields({})}
                  />
                  <button
                    type="button"
                    onClick={() => removeSchedule(i)}
                    className="w-7 h-7 shrink-0 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-500 flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
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
            {card.has_exam_date && card.exam_date_at && (
              <InfoRow
                label="일정"
                value={`${card.exam_memo ? `${card.exam_memo} ` : ""}${formatDateLabel(card.exam_date_at)}`}
              />
            )}
          </div>

          <RecentResultsSection years={card.recent_results ?? []} open={showRecentResults} />

          {card.memo && (
            <p className="text-xs text-amber-900 bg-amber-100 rounded-xl p-3 whitespace-pre-wrap shadow-md shadow-amber-900/5 -rotate-1">
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
