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
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { ChevronDown, Eye, EyeOff, Layers, Plus, SlidersHorizontal, Star } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useStatusReveal } from "@/lib/hooks/useStatusReveal";
import { useRankAutoAssign } from "@/lib/hooks/useRankAutoAssign";
import { useWonseoCards } from "@/lib/hooks/useWonseoCards";
import { SortableWonseoCard } from "@/components/wonseo/SortableWonseoCard";
import { WonseoCardView } from "@/components/wonseo/WonseoCardView";
import { WonseoCardModal } from "@/components/wonseo/WonseoCardModal";
import { WonseoCardBoard } from "@/components/wonseo/WonseoCardBoard";
import { computeAutoRankLabels } from "@/lib/wonseo-rank";
import { cn } from "@/lib/cn";
import type { WonseoCard } from "@/lib/database.types";

type CardColumnCount = 1 | 2 | 3 | 4;

const DEFAULT_CARD_COLUMN_COUNT: CardColumnCount = 3;
const cardColumnFallback = new Map<string, CardColumnCount>();

const CARD_GRID_CLASSES: Record<CardColumnCount, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
};

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

export function WonseoTab({ studentId }: { studentId: string }) {
  const showToast = useToast();
  const confirm = useConfirm();
  const { enabled: statusVisible } = useStatusReveal();
  const { autoAssign, setAutoAssign } = useRankAutoAssign(studentId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<WonseoCard | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showRecentResults, setShowRecentResults] = useState(false);
  const [view, setView] = useState<"all" | "submitted">("all");
  const cardColumnsStorageKey = `wonseo-card-columns:${studentId}`;
  const subscribeToColumns = useCallback(
    (onChange: () => void) => subscribeToCardColumnCount(cardColumnsStorageKey, onChange),
    [cardColumnsStorageKey],
  );
  const getColumnsSnapshot = useCallback(
    () => readCardColumnCount(cardColumnsStorageKey),
    [cardColumnsStorageKey],
  );
  const cardColumns = useSyncExternalStore(
    subscribeToColumns,
    getColumnsSnapshot,
    () => DEFAULT_CARD_COLUMN_COUNT,
  );

  function changeCardColumns(count: CardColumnCount) {
    try {
      window.localStorage.setItem(cardColumnsStorageKey, String(count));
      cardColumnFallback.delete(cardColumnsStorageKey);
    } catch {
      // The current view still changes even if the browser blocks persistent storage.
      cardColumnFallback.set(cardColumnsStorageKey, count);
    }
    window.dispatchEvent(
      new CustomEvent("wonseo-card-columns-change", { detail: { storageKey: cardColumnsStorageKey } }),
    );
  }

  const cardGridClassName = `grid ${CARD_GRID_CLASSES[cardColumns]} gap-4 pt-2`;

  const {
    cards,
    groups,
    sections,
    rankLabels,
    moveCardToGroup,
    createGroup,
    renameGroup,
    toggleGroupRanked,
    moveGroup,
    deleteGroup,
    reloadCards,
    deleteCard,
    toggleSubmitted,
    reorderCards,
    reorderSubmittedCards,
    saveSubmittedFields,
    saveRank,
    toggleAutoAssign,
  } = useWonseoCards({
    studentId,
    autoAssign,
    setAutoAssign,
    confirm,
    onError: (message) => showToast(message, "error"),
    onSuccess: (message) => showToast(message, "success"),
  });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function openCreate() {
    setEditingCard(null);
    setModalOpen(true);
  }
  function openEdit(card: WonseoCard) {
    setEditingCard(card);
    setModalOpen(true);
  }

  const activeCard = cards.find((c) => c.id === activeId) ?? null;
  // "접수한 원서" 화면은 자신만의 순서(submitted_sort_order)와 그 순서 기준의 지망
  // 라벨을 따로 계산한다 — 접수 전 화면(rankLabels/cards)과는 독립적이다.
  const submittedCards = cards.filter((c) => c.is_submitted).sort((a, b) => a.submitted_sort_order - b.submitted_sort_order);
  const submittedRankLabels = computeAutoRankLabels(submittedCards);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">나의 수시 카드</h3>
          <button
            onClick={() => setView((v) => (v === "all" ? "submitted" : "all"))}
            className={cn(
              "shrink-0 whitespace-nowrap text-xs font-bold px-2.5 py-0.5 rounded-full border transition flex items-center gap-1",
              view === "submitted"
                ? "bg-amber-500 border-amber-500 text-white"
                : "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100",
            )}
          >
            <Star className="w-3 h-3" fill={view === "submitted" ? "currentColor" : "none"} />
            접수한 원서{submittedCards.length > 0 && ` ${submittedCards.length}`}
          </button>
        </div>
        <div
          className="flex items-center justify-end gap-2 flex-wrap shrink-0"
        >
          <button
            onClick={() => setShowRecentResults((v) => !v)}
            tabIndex={view === "all" ? 0 : -1}
            aria-hidden={view !== "all"}
            className={cn(
              "shrink-0 whitespace-nowrap px-3 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5",
              view !== "all" && "invisible pointer-events-none",
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
                  onChange={() => void toggleAutoAssign()}
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
                      onClick={() => changeCardColumns(count)}
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
            onClick={openCreate}
            tabIndex={view === "all" ? 0 : -1}
            aria-hidden={view !== "all"}
            className={cn(
              "shrink-0 whitespace-nowrap pl-3.5 pr-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center gap-1.5",
              view !== "all" && "invisible pointer-events-none",
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>원서 추가</span>
          </button>
        </div>
      </div>

      {view === "submitted" ? (
        submittedCards.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(e) => setActiveId(String(e.active.id))}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={(e) => {
              setActiveId(null);
              void reorderSubmittedCards(e, submittedCards);
            }}
          >
            <SortableContext items={submittedCards.map((c) => c.id)} strategy={rectSortingStrategy}>
              <div className={cardGridClassName}>
                {submittedCards.map((card, index) => (
                  <SortableWonseoCard
                    key={card.id}
                    id={card.id}
                    setEqualHeightRef={() => {}}
                    isDragging={activeId === card.id}
                    card={card}
                    autoAssign={autoAssign}
                    rankLabel={submittedRankLabels[index]}
                    onRankChange={(text) => void saveRank(card, text)}
                    showStatus={statusVisible}
                    showRecentResults={false}
                    onEdit={() => openEdit(card)}
                    onDelete={() => void deleteCard(card)}
                    isSubmitted={card.is_submitted}
                    onToggleSubmitted={() => void toggleSubmitted(card)}
                    bodyMode="submitted"
                    onSubmittedFieldsCommit={(fields) => void saveSubmittedFields(card, fields)}
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
                    rankLabel={submittedRankLabels[submittedCards.findIndex((c) => c.id === activeCard.id)]}
                    showStatus={statusVisible}
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
        ) : (
          <div className="bg-white rounded-3xl p-12 text-center border border-amber-200 space-y-3">
            <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-3xl flex items-center justify-center mx-auto shadow-xs">
              <Star className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">별표로 표시한 접수 원서가 없습니다.</h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
              카드 우측 상단의 별 아이콘을 눌러, 실제로 접수한 원서를 표시해 주세요.
            </p>
          </div>
        )
      ) : cards.length > 0 ? (
        <WonseoCardBoard
          sections={sections}
          groups={groups}
          rankLabels={rankLabels}
          autoAssign={autoAssign}
          gridClassName={cardGridClassName.replace(" pt-2", "")}
          showStatus={statusVisible}
          showRecentResults={showRecentResults}
          onEdit={openEdit}
          onDelete={(card) => void deleteCard(card)}
          onToggleSubmitted={(card) => void toggleSubmitted(card)}
          onRankChange={(card, text) => void saveRank(card, text)}
          onReorder={(e) => void reorderCards(e)}
          onMoveCardToGroup={(card, groupId) => void moveCardToGroup(card, groupId)}
          onCreateGroup={createGroup}
          onRenameGroup={(group, name) => void renameGroup(group, name)}
          onToggleGroupRanked={(group) => void toggleGroupRanked(group)}
          onMoveGroup={(group, direction) => void moveGroup(group, direction)}
          onDeleteGroup={(group) => void deleteGroup(group)}
        />
      ) : (
        <div className="bg-white rounded-3xl p-12 text-center border border-indigo-200 space-y-3">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-3xl flex items-center justify-center mx-auto text-2xl shadow-xs">
            <Layers className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">
            등록된 수시 원서 카드가 없습니다.
          </h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            상단의 <strong className="text-indigo-600">[원서 추가]</strong> 버튼을
            눌러 지망 순위별 대학 및 모집단위 정보를 등록해 보세요.
          </p>
        </div>
      )}

      <WonseoCardModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        studentId={studentId}
        editingCard={editingCard}
        canEditStatus={false}
        nextSortOrder={cards.length}
        onSaved={reloadCards}
      />
    </div>
  );
}
