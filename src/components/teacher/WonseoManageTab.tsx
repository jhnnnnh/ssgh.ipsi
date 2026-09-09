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
import { Eye, EyeOff, FileSpreadsheet, GraduationCap, LayoutGrid, Plus, Star, Table2, Wand2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useStatusReveal } from "@/lib/hooks/useStatusReveal";
import { useEqualHeights } from "@/lib/hooks/useEqualHeights";
import { useRankAutoAssign } from "@/lib/hooks/useRankAutoAssign";
import { useActiveClass } from "@/components/providers/ActiveClassProvider";
import { Card } from "@/components/ui/Card";
import { SortableWonseoCard } from "@/components/wonseo/SortableWonseoCard";
import { WonseoCardView } from "@/components/wonseo/WonseoCardView";
import { WonseoCardModal } from "@/components/wonseo/WonseoCardModal";
import { WonseoTableView } from "@/components/teacher/WonseoTableView";
import { exportWonseoExcel } from "@/lib/wonseo-excel";
import { computeAutoRankLabels } from "@/lib/wonseo-rank";
import type { Roster, ScheduleEvent, WonseoCard } from "@/lib/database.types";

type ViewMode = "cards" | "table" | "submittedTable";

export function WonseoManageTab({ roster }: { roster: Roster[] }) {
  const showToast = useToast();
  const confirm = useConfirm();
  const { enabled: statusVisible, toggle } = useStatusReveal();
  const { isAdmin } = useActiveClass();
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const { autoAssign, setAutoAssign } = useRankAutoAssign(selectedStudentId);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [cards, setCards] = useState<WonseoCard[]>([]);
  const [allCards, setAllCards] = useState<WonseoCard[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<WonseoCard | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showRecentResults, setShowRecentResults] = useState(false);
  const [studentView, setStudentView] = useState<"all" | "submitted">("all");

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

  const reload = async (studentId: string) => {
    if (!studentId) {
      setCards([]);
      return;
    }
    const { data } = await supabase
      .from("wonseo_cards")
      .select("*")
      .eq("student_id", studentId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setCards(data ?? []);
  };

  const reloadAll = async () => {
    const { data } = await supabase.from("wonseo_cards").select("*");
    setAllCards(data ?? []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload(selectedStudentId);
    setStudentView("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId]);

  useEffect(() => {
    if (viewMode === "table" || viewMode === "submittedTable") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      reloadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

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
    reload(selectedStudentId);
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
    reload(selectedStudentId);
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
      reload(selectedStudentId);
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
    reload(selectedStudentId);
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
      reload(selectedStudentId);
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
    reload(selectedStudentId);
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
        .eq("student_id", selectedStudentId);
      if (error) {
        showToast("전환에 실패했습니다.", "error");
        return;
      }
      setAutoAssign(false);
      reload(selectedStudentId);
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
        .eq("student_id", selectedStudentId);
      if (error) {
        showToast("전환에 실패했습니다.", "error");
        return;
      }
      setAutoAssign(true);
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    const { data, error } = await supabase.from("wonseo_cards").select("*");
    if (error || !data) {
      showToast("엑셀 데이터를 불러오지 못했습니다.", "error");
      setExporting(false);
      return;
    }
    if (data.length === 0) {
      showToast("등록된 원서 카드가 없습니다.", "error");
      setExporting(false);
      return;
    }
    await exportWonseoExcel(roster, data);
    setExporting(false);
  }

  async function handleToggleStatus() {
    const ok = await toggle();
    showToast(
      ok ? (statusVisible ? "합격 상태가 비공개로 전환되었습니다." : "합격 상태가 공개되었습니다.") : "변경에 실패했습니다.",
      ok ? "success" : "error",
    );
  }

  const activeCard = cards.find((c) => c.id === activeId) ?? null;
  const rankLabels = computeAutoRankLabels(cards);
  // "접수한 원서" 화면은 자신만의 순서(submitted_sort_order)와 그 순서 기준의 지망
  // 라벨을 따로 계산한다 — 접수 전 화면(rankLabels/cards)과는 독립적이다.
  const submittedCards = cards.filter((c) => c.is_submitted).sort((a, b) => a.submitted_sort_order - b.submitted_sort_order);
  const submittedRankLabels = computeAutoRankLabels(submittedCards);

  return (
    <div className="space-y-6">
      <Card className="space-y-5">
        {isAdmin && (
          <div className="flex justify-end border-b border-slate-100 pb-4">
            <button
              onClick={handleToggleStatus}
              className={cn(
                "w-[168px] shrink-0 px-3.5 py-2 rounded-xl text-sm font-bold transition flex items-center justify-center gap-1.5",
                statusVisible
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-slate-200 hover:bg-slate-300 text-slate-700",
              )}
            >
              {statusVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>합격 상태</span>
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("cards")}
            className={cn(
              "px-3.5 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5",
              viewMode === "cards"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>카드 보기</span>
          </button>
          <button
            onClick={() => setViewMode("table")}
            className={cn(
              "px-3.5 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5",
              viewMode === "table"
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            <Table2 className="w-3.5 h-3.5" />
            <span>전체 보기</span>
          </button>
          <button
            onClick={() => setViewMode("submittedTable")}
            className={cn(
              "px-3.5 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5",
              viewMode === "submittedTable"
                ? "bg-amber-500 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            <Star className="w-3.5 h-3.5" fill={viewMode === "submittedTable" ? "currentColor" : "none"} />
            <span>접수한 원서 보기</span>
          </button>
        </div>

        {viewMode === "cards" ? (
          <>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <label className="text-xs font-bold text-slate-700 shrink-0">대상 학생 선택:</label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="w-full sm:w-64 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- 학생을 선택하세요 --</option>
                  {roster.map((r) => (
                    <option key={r.student_id} value={r.student_id}>
                      {r.student_id} {r.name}
                    </option>
                  ))}
                </select>
                {selectedStudentId && (
                  <button
                    onClick={() => setStudentView((v) => (v === "all" ? "submitted" : "all"))}
                    className={cn(
                      "shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-full border transition flex items-center gap-1",
                      studentView === "submitted"
                        ? "bg-amber-500 border-amber-500 text-white"
                        : "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100",
                    )}
                  >
                    <Star className="w-3 h-3" fill={studentView === "submitted" ? "currentColor" : "none"} />
                    접수한 원서{submittedCards.length > 0 && ` ${submittedCards.length}`}
                  </button>
                )}
              </div>
              {selectedStudentId && (
                <div
                  className={cn(
                    "flex items-center gap-2 shrink-0",
                    studentView !== "all" && "invisible pointer-events-none",
                  )}
                  aria-hidden={studentView !== "all"}
                >
                  <button
                    onClick={() => setShowRecentResults((v) => !v)}
                    tabIndex={studentView === "all" ? 0 : -1}
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
                    tabIndex={studentView === "all" ? 0 : -1}
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
                    tabIndex={studentView === "all" ? 0 : -1}
                    className="pl-3.5 pr-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-2xs flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>원서 추가</span>
                  </button>
                </div>
              )}
            </div>

            {selectedStudentId ? (
              studentView === "submitted" ? (
                submittedCards.length > 0 ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={(e) => setActiveId(String(e.active.id))}
                    onDragCancel={() => setActiveId(null)}
                    onDragEnd={(e) => handleSubmittedDragEnd(e, submittedCards)}
                  >
                    <SortableContext items={submittedCards.map((c) => c.id)} strategy={rectSortingStrategy}>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
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
                  <div className="text-center py-12">
                    <p className="text-xs font-semibold text-slate-500">
                      별표로 표시한 접수 원서가 없습니다.
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
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
                <div className="text-center py-12">
                  <p className="text-xs font-semibold text-slate-500">
                    이 학생은 아직 등록한 원서 카드가 없습니다.
                  </p>
                </div>
              )
            ) : (
              <div className="text-center py-12">
                <div className="w-12 h-12 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-2">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-500">
                  상단에서 학생을 선택하면 해당 학생의 수시 원서 카드가 표시됩니다.
                </p>
              </div>
            )}
          </>
        ) : viewMode === "table" ? (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                onClick={handleExportExcel}
                disabled={exporting}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition flex items-center gap-1.5 disabled:opacity-60"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{exporting ? "생성 중..." : "엑셀 일괄 다운로드"}</span>
              </button>
            </div>
            <WonseoTableView roster={roster} cards={allCards} />
          </div>
        ) : (
          <WonseoTableView roster={roster} cards={allCards} variant="submitted" />
        )}
      </Card>

      {selectedStudentId && (
        <WonseoCardModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          studentId={selectedStudentId}
          editingCard={editingCard}
          canEditStatus={isAdmin || statusVisible}
          nextSortOrder={cards.length}
          onSaved={() => reload(selectedStudentId)}
        />
      )}
    </div>
  );
}
