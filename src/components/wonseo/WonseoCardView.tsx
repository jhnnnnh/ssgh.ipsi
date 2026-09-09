"use client";

import { forwardRef, useEffect, useState } from "react";
import { Pencil, Star, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WonseoAttachmentPreview } from "@/components/wonseo/WonseoAttachmentPreview";
import { WonseoImageLightbox } from "@/components/wonseo/WonseoImageLightbox";
import { RecentResultsSection } from "@/components/wonseo/RecentResultsSection";
import { LEVEL_EMPHASIS_STYLE, STATUS_BADGE_STYLE, STATUS_OPTIONS } from "@/lib/wonseo-constants";
import { formatDateLabel } from "@/lib/time";
import type { WonseoCard, WonseoImage } from "@/lib/database.types";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-slate-500">{label} </span>
      <span className="font-semibold text-slate-800 whitespace-pre-line">{value}</span>
    </p>
  );
}

export const WonseoCardView = forwardRef<
  HTMLDivElement,
  {
    card: WonseoCard;
    showStatus: boolean;
    /** 목록 상단의 전체 on/off 버튼으로 제어되는, 최근 입결 표시 여부. */
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
  },
  ref,
) {
  const [images, setImages] = useState<WonseoImage[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("wonseo_images")
      .select("*")
      .eq("card_id", card.id)
      .then(({ data }) => setImages(data ?? []));
  }, [card.id]);

  const statusLabel = STATUS_OPTIONS.find((o) => o.value === card.status)?.label ?? card.status;

  const emphasis = LEVEL_EMPHASIS_STYLE[card.level];

  const methodValue =
    card.selection_mode === "single"
      ? card.stage_single
      : [card.stage_1 && `1단계 ${card.stage_1}`, card.stage_2 && `2단계 ${card.stage_2}`]
          .filter(Boolean)
          .join(" · ");

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
            <input
              key={card.id}
              defaultValue={card.rank ?? ""}
              onBlur={(e) => onRankChange?.(e.target.value)}
              placeholder="미지정"
              className="text-[11px] font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5 w-20 focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder:font-semibold placeholder:text-slate-400"
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
        <WonseoAttachmentPreview images={images} onClick={() => setLightboxOpen(true)} />
      </div>

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

      </div>
      <WonseoImageLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        images={images}
      />
    </div>
  );
});
