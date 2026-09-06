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
import { Eye, EyeOff, Layers, Plus, Wand2 } from "lucide-react";
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
import type { WonseoCard } from "@/lib/database.types";

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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-3.5 sm:p-4 shadow-sm border border-indigo-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold tracking-tight text-slate-900">나의 수시 카드</h3>
          <span className="bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs font-bold px-2.5 py-0.5 rounded-full">
            {cards.length}개 등록됨
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowRecentResults((v) => !v)}
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
            className="pl-3.5 pr-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>원서 추가</span>
          </button>
        </div>
      </div>

      {cards.length > 0 ? (
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
