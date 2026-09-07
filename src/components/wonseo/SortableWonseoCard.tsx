"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { WonseoCardView } from "@/components/wonseo/WonseoCardView";
import type { WonseoCard } from "@/lib/database.types";

export function SortableWonseoCard({
  id,
  card,
  showStatus,
  showRecentResults,
  onEdit,
  onDelete,
  minHeight,
  setEqualHeightRef,
  isDragging,
  autoAssign,
  rankLabel,
  onRankChange,
  showCompetitionHistory,
}: {
  id: string;
  card: WonseoCard;
  showStatus: boolean;
  showRecentResults: boolean;
  onEdit: () => void;
  onDelete: () => void;
  minHeight?: number;
  setEqualHeightRef: (el: HTMLElement | null) => void;
  isDragging: boolean;
  autoAssign: boolean;
  rankLabel: string;
  onRankChange: (text: string) => void;
  showCompetitionHistory?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isSorting } = useSortable({ id });

  return (
    <WonseoCardView
      ref={setNodeRef}
      measureRef={setEqualHeightRef}
      card={card}
      showStatus={showStatus}
      showRecentResults={showRecentResults}
      onEdit={onEdit}
      onDelete={onDelete}
      autoAssign={autoAssign}
      rankLabel={rankLabel}
      onRankChange={onRankChange}
      showCompetitionHistory={showCompetitionHistory}
      minHeight={minHeight}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isSorting ? transition : undefined,
      }}
      className={isDragging ? "opacity-30" : undefined}
      dragHandle={
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="text-slate-300 hover:text-indigo-500 cursor-grab active:cursor-grabbing touch-none p-0.5 -ml-1"
          aria-label="카드 순서 변경"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      }
    />
  );
}
