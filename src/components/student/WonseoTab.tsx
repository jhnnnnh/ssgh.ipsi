"use client";

import { useState } from "react";
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
import { Eye, EyeOff, Layers, Plus, Star, Wand2 } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useStatusReveal } from "@/lib/hooks/useStatusReveal";
import { useEqualHeights } from "@/lib/hooks/useEqualHeights";
import { useRankAutoAssign } from "@/lib/hooks/useRankAutoAssign";
import { useWonseoCards } from "@/lib/hooks/useWonseoCards";
import { SortableWonseoCard } from "@/components/wonseo/SortableWonseoCard";
import { WonseoCardView } from "@/components/wonseo/WonseoCardView";
import { WonseoCardModal } from "@/components/wonseo/WonseoCardModal";
import { computeAutoRankLabels } from "@/lib/wonseo-rank";
import { cn } from "@/lib/cn";
import type { WonseoCard } from "@/lib/database.types";

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

  const {
    cards,
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
  const { setRef, maxHeight } = useEqualHeights(
    cards.map((c) => c.id).join("|"),
    cards.length,
  );

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
  const rankLabels = computeAutoRankLabels(cards);
  // "접수한 원서" 화면은 자신만의 순서(submitted_sort_order)와 그 순서 기준의 지망
  // 라벨을 따로 계산한다 — 접수 전 화면(rankLabels/cards)과는 독립적이다.
  const submittedCards = cards.filter((c) => c.is_submitted).sort((a, b) => a.submitted_sort_order - b.submitted_sort_order);
  const submittedRankLabels = computeAutoRankLabels(submittedCards);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-3.5 sm:p-4 shadow-sm border border-indigo-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
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
          className={cn(
            "flex items-center gap-2 flex-wrap shrink-0",
            view !== "all" && "invisible pointer-events-none",
          )}
          aria-hidden={view !== "all"}
        >
          <button
            onClick={() => setShowRecentResults((v) => !v)}
            tabIndex={view === "all" ? 0 : -1}
            className={cn(
              "shrink-0 whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5",
              showRecentResults
                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-600",
            )}
          >
            {showRecentResults ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>지난 입결</span>
          </button>
          <button
            onClick={() => void toggleAutoAssign()}
            tabIndex={view === "all" ? 0 : -1}
            className={cn(
              "shrink-0 whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5",
              autoAssign
                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-600",
            )}
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>N지망 정렬</span>
          </button>
          <button
            onClick={openCreate}
            tabIndex={view === "all" ? 0 : -1}
            className="shrink-0 whitespace-nowrap pl-3.5 pr-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center gap-1.5"
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
                <div className="shadow-2xl shadow-indigo-900/30 rounded-3xl rotate-1 scale-[1.03]">
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragCancel={() => setActiveId(null)}
          onDragEnd={(e) => {
            setActiveId(null);
            void reorderCards(e);
          }}
        >
          <SortableContext items={cards.map((c) => c.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {cards.map((card, index) => (
                <SortableWonseoCard
                  key={card.id}
                  id={card.id}
                  setEqualHeightRef={setRef(index)}
                  minHeight={maxHeight}
                  isDragging={activeId === card.id}
                  card={card}
                  autoAssign={autoAssign}
                  rankLabel={rankLabels[index]}
                  onRankChange={(text) => void saveRank(card, text)}
                  showStatus={statusVisible}
                  showRecentResults={showRecentResults}
                  onEdit={() => openEdit(card)}
                  onDelete={() => void deleteCard(card)}
                  isSubmitted={card.is_submitted}
                  onToggleSubmitted={() => void toggleSubmitted(card)}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeCard && (
              <div className="shadow-2xl shadow-indigo-900/30 rounded-3xl rotate-1 scale-[1.03]">
                <WonseoCardView
                  card={activeCard}
                  autoAssign={autoAssign}
                  rankLabel={rankLabels[cards.findIndex((c) => c.id === activeCard.id)]}
                  showStatus={statusVisible}
                  showRecentResults={showRecentResults}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  isSubmitted={activeCard.is_submitted}
                  onToggleSubmitted={() => {}}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
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
