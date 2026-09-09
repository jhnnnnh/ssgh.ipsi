"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Eye, EyeOff, Layers, Plus, Star, Wand2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useStatusReveal } from "@/lib/hooks/useStatusReveal";
import { useEqualHeights } from "@/lib/hooks/useEqualHeights";
import { useRankAutoAssign } from "@/lib/hooks/useRankAutoAssign";
import { SortableWonseoCard } from "@/components/wonseo/SortableWonseoCard";
import { WonseoCardView } from "@/components/wonseo/WonseoCardView";
import { WonseoCardModal } from "@/components/wonseo/WonseoCardModal";
import { computeAutoRankLabels } from "@/lib/wonseo-rank";
import { cn } from "@/lib/cn";
import type { ScheduleEvent, WonseoCard } from "@/lib/database.types";

export function WonseoTab({ studentId }: { studentId: string }) {
  const showToast = useToast();
  const confirm = useConfirm();
  const { enabled: statusVisible } = useStatusReveal();
  const { autoAssign, setAutoAssign } = useRankAutoAssign(studentId);
  const [cards, setCards] = useState<WonseoCard[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<WonseoCard | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showRecentResults, setShowRecentResults] = useState(false);
  const [view, setView] = useState<"all" | "submitted">("all");

  const supabase = useMemo(() => createClient(), []);
  const { setRef, maxHeight } = useEqualHeights(
    cards.map((c) => c.id).join("|"),
    cards.length,
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reload = async () => {
    const { data } = await supabase
      .from("wonseo_cards")
      .select("*")
      .eq("student_id", studentId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setCards(data ?? []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  function openCreate() {
    setEditingCard(null);
    setModalOpen(true);
  }
  function openEdit(card: WonseoCard) {
    setEditingCard(card);
    setModalOpen(true);
  }

  async function handleDelete(card: WonseoCard) {
    const ok = await confirm({
      message: `${card.university || "해당"} 원서 카드를 삭제하시겠습니까?`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("wonseo_cards").delete().eq("id", card.id);
    if (error) {
      showToast("삭제에 실패했습니다.", "error");
      return;
    }
    showToast("삭제되었습니다.", "success");
    reload();
  }

  async function handleToggleSubmitted(card: WonseoCard) {
    const turningOn = !card.is_submitted;
    // 새로 별표 표시하는 카드는 "접수한 원서" 목록 맨 뒤에 붙인다. sort_order(접수 전
    // 화면 순서)는 절대 건드리지 않는다 — 두 화면의 순서는 완전히 독립적이어야 한다.
    const patch: { is_submitted: boolean; submitted_sort_order?: number } = { is_submitted: turningOn };
    if (turningOn) {
      patch.submitted_sort_order = cards.filter((c) => c.is_submitted).length;
    }
    const { error } = await supabase.from("wonseo_cards").update(patch).eq("id", card.id);
    if (error) {
      showToast("저장에 실패했습니다.", "error");
      return;
    }
    reload();
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = cards.findIndex((c) => c.id === active.id);
    const newIndex = cards.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(cards, oldIndex, newIndex).map((card, index) => ({
      ...card,
      sort_order: index,
    }));
    setCards(reordered);

    const results = await Promise.all(
      reordered.map((card) =>
        supabase.from("wonseo_cards").update({ sort_order: card.sort_order }).eq("id", card.id),
      ),
    );
    if (results.some((r) => r.error)) {
      showToast("순서 저장에 실패했습니다.", "error");
      reload();
    }
  }

  /** "접수한 원서" 화면의 순서는 submitted_sort_order라는 별도 컬럼을 쓴다 — 접수 전
   * 화면의 sort_order와 완전히 분리되어 있어, 한쪽에서 드래그해도 다른 쪽 카드 순서·
   * 지망 번호에는 전혀 영향을 주지 않는다. */
  async function handleSubmittedDragEnd(event: DragEndEvent, submittedCards: WonseoCard[]) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const oldIndex = submittedCards.findIndex((c) => c.id === active.id);
    const newIndex = submittedCards.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedSubmitted = arrayMove(submittedCards, oldIndex, newIndex).map((card, index) => ({
      ...card,
      submitted_sort_order: index,
    }));
    const byId = new Map(reorderedSubmitted.map((c) => [c.id, c]));
    setCards((prev) => prev.map((c) => byId.get(c.id) ?? c));

    const results = await Promise.all(
      reorderedSubmitted.map((card) =>
        supabase.from("wonseo_cards").update({ submitted_sort_order: card.submitted_sort_order }).eq("id", card.id),
      ),
    );
    if (results.some((r) => r.error)) {
      showToast("순서 저장에 실패했습니다.", "error");
      reload();
    }
  }

  async function handleSubmittedFieldsCommit(
    card: WonseoCard,
    fields: { applicationNumber: string; scheduleEvents: ScheduleEvent[] },
  ) {
    const { error } = await supabase
      .from("wonseo_cards")
      .update({
        application_number: fields.applicationNumber.trim() || null,
        schedule_events: fields.scheduleEvents,
      })
      .eq("id", card.id);
    if (error) {
      showToast("저장에 실패했습니다.", "error");
      return;
    }
    reload();
  }

  async function handleRankTextChange(card: WonseoCard, text: string) {
    const value = text.trim() || null;
    if (value === card.rank) return;
    const { error } = await supabase.from("wonseo_cards").update({ rank: value }).eq("id", card.id);
    if (error) {
      showToast("지망 순위 저장에 실패했습니다.", "error");
      return;
    }
    reload();
  }

  async function handleToggleAutoAssign() {
    if (autoAssign) {
      const labels = computeAutoRankLabels(cards);
      const results = await Promise.all(
        cards.map((card, i) =>
          supabase.from("wonseo_cards").update({ rank: labels[i] }).eq("id", card.id),
        ),
      );
      if (results.some((r) => r.error)) {
        showToast("전환에 실패했습니다.", "error");
        return;
      }
      const { error } = await supabase
        .from("roster")
        .update({ rank_auto_assign: false })
        .eq("student_id", studentId);
      if (error) {
        showToast("전환에 실패했습니다.", "error");
        return;
      }
      setAutoAssign(false);
      reload();
    } else {
      const ok = await confirm({
        message: "자동 배정으로 전환하면 직접 입력한 지망 값이 초기화됩니다. 계속할까요?",
        confirmLabel: "전환",
        danger: true,
      });
      if (!ok) return;
      const { error } = await supabase
        .from("roster")
        .update({ rank_auto_assign: true })
        .eq("student_id", studentId);
      if (error) {
        showToast("전환에 실패했습니다.", "error");
        return;
      }
      setAutoAssign(true);
    }
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
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold tracking-tight text-slate-900">나의 수시 카드</h3>
          <button
            onClick={() => setView((v) => (v === "all" ? "submitted" : "all"))}
            className={cn(
              "text-xs font-bold px-2.5 py-0.5 rounded-full border transition flex items-center gap-1",
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
          className={cn("flex items-center gap-2 shrink-0", view !== "all" && "invisible pointer-events-none")}
          aria-hidden={view !== "all"}
        >
          <button
            onClick={() => setShowRecentResults((v) => !v)}
            tabIndex={view === "all" ? 0 : -1}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5",
              showRecentResults
                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                : "bg-slate-100 hover:bg-slate-200 text-slate-600",
            )}
          >
            {showRecentResults ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>지난 입결</span>
          </button>
          <button
            onClick={handleToggleAutoAssign}
            tabIndex={view === "all" ? 0 : -1}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5",
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
            className="pl-3.5 pr-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center gap-1.5"
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
            onDragEnd={(e) => handleSubmittedDragEnd(e, submittedCards)}
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
                    onRankChange={(text) => handleRankTextChange(card, text)}
                    showStatus={statusVisible}
                    showRecentResults={false}
                    onEdit={() => openEdit(card)}
                    onDelete={() => handleDelete(card)}
                    isSubmitted={card.is_submitted}
                    onToggleSubmitted={() => handleToggleSubmitted(card)}
                    bodyMode="submitted"
                    onSubmittedFieldsCommit={(fields) => handleSubmittedFieldsCommit(card, fields)}
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
          onDragEnd={handleDragEnd}
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
                  onRankChange={(text) => handleRankTextChange(card, text)}
                  showStatus={statusVisible}
                  showRecentResults={showRecentResults}
                  onEdit={() => openEdit(card)}
                  onDelete={() => handleDelete(card)}
                  isSubmitted={card.is_submitted}
                  onToggleSubmitted={() => handleToggleSubmitted(card)}
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
        onSaved={reload}
      />
    </div>
  );
}
