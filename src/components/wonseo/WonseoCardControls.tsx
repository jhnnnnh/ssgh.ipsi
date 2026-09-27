"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ChevronDown, Eye, EyeOff, Plus, SlidersHorizontal, Star } from "lucide-react";
import { SortableWonseoCard } from "@/components/wonseo/SortableWonseoCard";
import { WonseoCardView } from "@/components/wonseo/WonseoCardView";
import { computeAutoRankLabels } from "@/lib/wonseo-rank";
import { cn } from "@/lib/cn";
import type { ScheduleEvent, WonseoCard } from "@/lib/database.types";

// 학생 화면과 교사 화면이 같은 원서 카드 화면을 보여주도록, 카드 주변 조작부(툴바·열 수·접수한
// 원서 목록·빈 화면)를 여기 한곳에 둔다.

export type CardColumnCount = 1 | 2 | 3 | 4;

const DEFAULT_CARD_COLUMN_COUNT: CardColumnCount = 3;
const cardColumnFallback = new Map<string, CardColumnCount>();

const CARD_GRID_CLASSES: Record<CardColumnCount, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

export function cardGridClassName(count: CardColumnCount): string {
  return `grid ${CARD_GRID_CLASSES[count]} gap-4`;
}

function readCardColumnCount(storageKey: string): CardColumnCount {
  const fallback = cardColumnFallback.get(storageKey);
  if (fallback !== undefined) return fallback;
  try {
    const parsed = Number(window.localStorage.getItem(storageKey));
    if (parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4) return parsed;
  } catch {
    // Fall back to in-memory preference when browser storage is unavailable.
  }
  return DEFAULT_CARD_COLUMN_COUNT;
}

function subscribeToCardColumnCount(storageKey: string, onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) {
      cardColumnFallback.delete(storageKey);
      onChange();
    }
  };
  const onLocalPreferenceChange = (event: Event) => {
    if ((event as CustomEvent<{ storageKey: string }>).detail?.storageKey === storageKey) onChange();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener("wonseo-card-columns-change", onLocalPreferenceChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("wonseo-card-columns-change", onLocalPreferenceChange);
  };
}

/** 한 줄 카드 개수. 이 브라우저에 storageKey 단위로 기억한다. */
export function useCardColumns(storageKey: string): [CardColumnCount, (count: CardColumnCount) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeToCardColumnCount(storageKey, onChange),
    [storageKey],
  );
  const getSnapshot = useCallback(() => readCardColumnCount(storageKey), [storageKey]);
  const count = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_CARD_COLUMN_COUNT);

  const setCount = useCallback(
    (next: CardColumnCount) => {
      try {
        window.localStorage.setItem(storageKey, String(next));
        cardColumnFallback.delete(storageKey);
      } catch {
        // The current view still changes even if the browser blocks persistent storage.
        cardColumnFallback.set(storageKey, next);
      }
      window.dispatchEvent(new CustomEvent("wonseo-card-columns-change", { detail: { storageKey } }));
    },
    [storageKey],
  );
  return [count, setCount];
}

/** "접수한 원서" 보기 전환 버튼. */
export function SubmittedViewToggle({
  active,
  count,
  onToggle,
}: {
  active: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "shrink-0 whitespace-nowrap text-xs font-bold px-2.5 py-1 rounded-full border transition flex items-center gap-1",
        active
          ? "bg-amber-500 border-amber-500 text-white"
          : "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100",
      )}
    >
      <Star className="w-3 h-3" fill={active ? "currentColor" : "none"} />
      접수한 원서{count > 0 && ` ${count}`}
    </button>
  );
}

/** 지난 입결 · 정렬(N지망 정렬, 한 줄 카드 개수) · 원서 추가. "접수한 원서" 보기에서는 자리만 차지하고 숨는다. */
export function WonseoCardToolbar({
  hidden,
  showRecentResults,
  onToggleRecentResults,
  autoAssign,
  onToggleAutoAssign,
  cardColumns,
  onChangeCardColumns,
  onCreate,
}: {
  hidden: boolean;
  showRecentResults: boolean;
  onToggleRecentResults: () => void;
  autoAssign: boolean;
  onToggleAutoAssign: () => void;
  cardColumns: CardColumnCount;
  onChangeCardColumns: (count: CardColumnCount) => void;
  onCreate: () => void;
}) {
  const tabIndex = hidden ? -1 : 0;
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 flex-wrap shrink-0",
        hidden && "invisible pointer-events-none",
      )}
      aria-hidden={hidden}
    >
      <button
        type="button"
        onClick={onToggleRecentResults}
        tabIndex={tabIndex}
        className={cn(
          "shrink-0 whitespace-nowrap px-3 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5",
          showRecentResults
            ? "bg-indigo-600 hover:bg-indigo-700 text-white"
            : "bg-slate-100 hover:bg-slate-200 text-slate-600",
        )}
      >
        {showRecentResults ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        <span>지난 입결</span>
      </button>
      <details className="relative">
        <summary
          tabIndex={tabIndex}
          className={cn(
            "list-none [&::-webkit-details-marker]:hidden shrink-0 whitespace-nowrap px-3 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5 cursor-pointer",
            autoAssign
              ? "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              : "bg-slate-100 hover:bg-slate-200 text-slate-600",
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>정렬</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </summary>
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm font-bold text-slate-800">N지망 정렬</span>
            <input
              type="checkbox"
              checked={autoAssign}
              onChange={onToggleAutoAssign}
              className="h-4 w-4 accent-indigo-600"
            />
          </label>
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-sm font-bold text-slate-800">한 줄 카드 개수</p>
            <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label="한 줄 카드 개수">
              {([1, 2, 3, 4] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={cardColumns === count}
                  onClick={() => onChangeCardColumns(count)}
                  className={cn(
                    "rounded-lg py-1.5 text-sm font-bold transition",
                    cardColumns === count
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {count}개
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              선택한 개수는 최대 열 수예요. 4열은 화면 폭 1280px부터 적용되고, 좁은 화면에서는 자동으로 줄어듭니다.
            </p>
          </div>
        </div>
      </details>
      <button
        type="button"
        onClick={onCreate}
        tabIndex={tabIndex}
        className="shrink-0 whitespace-nowrap pl-3.5 pr-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center gap-1.5"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>원서 추가</span>
      </button>
    </div>
  );
}

/** 카드가 없을 때의 안내 상자. */
export function WonseoEmptyState({
  icon,
  tone = "indigo",
  title,
  children,
}: {
  icon: React.ReactNode;
  tone?: "indigo" | "amber";
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-white rounded-3xl p-12 text-center border space-y-3",
        tone === "amber" ? "border-amber-200" : "border-indigo-200",
      )}
    >
      <div
        className={cn(
          "w-16 h-16 rounded-3xl flex items-center justify-center mx-auto shadow-xs",
          tone === "amber" ? "bg-amber-50 text-amber-500" : "bg-indigo-50 text-indigo-500",
        )}
      >
        {icon}
      </div>
      <h4 className="text-sm font-bold text-slate-800">{title}</h4>
      {children && <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">{children}</p>}
    </div>
  );
}

/** "접수한 원서" 보기: 접수 표시한 카드만 자체 순서(submitted_sort_order)로 보여주고 드래그로 순서를 바꾼다. */
export function SubmittedCardList({
  cards,
  gridClassName,
  autoAssign,
  showStatus,
  onEdit,
  onDelete,
  onToggleSubmitted,
  onRankChange,
  onReorder,
  onSubmittedFieldsCommit,
}: {
  cards: WonseoCard[];
  gridClassName: string;
  autoAssign: boolean;
  showStatus: boolean;
  onEdit: (card: WonseoCard) => void;
  onDelete: (card: WonseoCard) => void;
  onToggleSubmitted: (card: WonseoCard) => void;
  onRankChange: (card: WonseoCard, text: string) => void;
  onReorder: (event: DragEndEvent, submittedCards: WonseoCard[]) => void;
  onSubmittedFieldsCommit: (
    card: WonseoCard,
    fields: { applicationNumber: string; scheduleEvents: ScheduleEvent[] },
  ) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // 접수 전 화면(rankLabels/cards)과 독립적으로, 이 화면 순서 기준의 지망 라벨을 따로 계산한다.
  const submittedCards = cards
    .filter((c) => c.is_submitted)
    .sort((a, b) => a.submitted_sort_order - b.submitted_sort_order);
  const rankLabels = computeAutoRankLabels(submittedCards);
  const activeIndex = submittedCards.findIndex((c) => c.id === activeId);
  const activeCard = activeIndex >= 0 ? submittedCards[activeIndex] : null;

  if (submittedCards.length === 0) {
    return (
      <WonseoEmptyState icon={<Star className="w-6 h-6" />} tone="amber" title="별표로 표시한 접수 원서가 없습니다.">
        카드 우측 상단의 별 아이콘을 눌러, 실제로 접수한 원서를 표시해 주세요.
      </WonseoEmptyState>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={(e) => {
        setActiveId(null);
        onReorder(e, submittedCards);
      }}
    >
      <SortableContext items={submittedCards.map((c) => c.id)} strategy={rectSortingStrategy}>
        <div className={gridClassName}>
          {submittedCards.map((card, index) => (
            <SortableWonseoCard
              key={card.id}
              id={card.id}
              setEqualHeightRef={() => {}}
              isDragging={activeId === card.id}
              card={card}
              autoAssign={autoAssign}
              rankLabel={rankLabels[index]}
              onRankChange={(text) => onRankChange(card, text)}
              showStatus={showStatus}
              showRecentResults={false}
              onEdit={() => onEdit(card)}
              onDelete={() => onDelete(card)}
              isSubmitted={card.is_submitted}
              onToggleSubmitted={() => onToggleSubmitted(card)}
              bodyMode="submitted"
              onSubmittedFieldsCommit={(fields) => onSubmittedFieldsCommit(card, fields)}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeCard && (
          <div className="shadow-lg rounded-3xl">
            <WonseoCardView
              card={activeCard}
              autoAssign={autoAssign}
              rankLabel={rankLabels[activeIndex]}
              showStatus={showStatus}
              showRecentResults={false}
              onEdit={() => {}}
              onDelete={() => {}}
              isSubmitted={activeCard.is_submitted}
              onToggleSubmitted={() => {}}
              bodyMode="submitted"
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
