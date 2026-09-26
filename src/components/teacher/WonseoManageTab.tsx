"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Eye, EyeOff, FileSpreadsheet, GraduationCap, LayoutGrid, Plus, Star, Table2, Wand2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useStatusReveal } from "@/lib/hooks/useStatusReveal";
import { useRankAutoAssign } from "@/lib/hooks/useRankAutoAssign";
import { useWonseoCards } from "@/lib/hooks/useWonseoCards";
import { useActiveClass } from "@/components/providers/ActiveClassProvider";
import { Card } from "@/components/ui/Card";
import { SortableWonseoCard } from "@/components/wonseo/SortableWonseoCard";
import { WonseoCardView } from "@/components/wonseo/WonseoCardView";
import { WonseoCardModal } from "@/components/wonseo/WonseoCardModal";
import { WonseoCardBoard } from "@/components/wonseo/WonseoCardBoard";
import { WonseoTableView } from "@/components/teacher/WonseoTableView";
import { exportWonseoExcel } from "@/lib/wonseo-excel";
import { computeAutoRankLabels } from "@/lib/wonseo-rank";
import type { Roster, WonseoCard } from "@/lib/database.types";

type ViewMode = "cards" | "table" | "submittedTable";

export function WonseoManageTab({ roster }: { roster: Roster[] }) {
  const showToast = useToast();
  const confirm = useConfirm();
  const { enabled: statusVisible, toggle } = useStatusReveal();
  const { isAdmin } = useActiveClass();
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const { autoAssign, setAutoAssign } = useRankAutoAssign(selectedStudentId);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [allCards, setAllCards] = useState<WonseoCard[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<WonseoCard | null>(null);
  const [exporting, setExporting] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showRecentResults, setShowRecentResults] = useState(false);
  const [studentView, setStudentView] = useState<"all" | "submitted">("all");

  const supabase = useMemo(() => createClient(), []);
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
    studentId: selectedStudentId,
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

  const reloadAll = async () => {
    const { data } = await supabase.from("wonseo_cards").select("*");
    setAllCards(data ?? []);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStudentView("all");
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

  async function handleExportExcel(variant: "all" | "submitted" = "all") {
    setExporting(true);
    const { data, error } = await supabase.from("wonseo_cards").select("*");
    if (error || !data) {
      showToast("엑셀 데이터를 불러오지 못했습니다.", "error");
      setExporting(false);
      return;
    }
    const relevant = variant === "submitted" ? data.filter((c) => c.is_submitted) : data;
    if (relevant.length === 0) {
      showToast(variant === "submitted" ? "접수 표시된 원서가 없습니다." : "등록된 원서 카드가 없습니다.", "error");
      setExporting(false);
      return;
    }
    await exportWonseoExcel(roster, data, variant);
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

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setViewMode("cards")}
            className={cn(
              "shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5",
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
              "shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5",
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
              "shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5",
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
                      "shrink-0 whitespace-nowrap text-xs font-bold px-2.5 py-1.5 rounded-full border transition flex items-center gap-1",
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
                    "flex items-center gap-2 flex-wrap shrink-0",
                    studentView !== "all" && "invisible pointer-events-none",
                  )}
                  aria-hidden={studentView !== "all"}
                >
                  <button
                    onClick={() => setShowRecentResults((v) => !v)}
                    tabIndex={studentView === "all" ? 0 : -1}
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
                    tabIndex={studentView === "all" ? 0 : -1}
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
                    tabIndex={studentView === "all" ? 0 : -1}
                    className="shrink-0 whitespace-nowrap pl-3.5 pr-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-2xs flex items-center gap-1.5"
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
                    onDragEnd={(e) => {
                      setActiveId(null);
                      void reorderSubmittedCards(e, submittedCards);
                    }}
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
                  <div className="text-center py-12">
                    <p className="text-xs font-semibold text-slate-500">
                      별표로 표시한 접수 원서가 없습니다.
                    </p>
                  </div>
                )
              ) : cards.length > 0 ? (
                <WonseoCardBoard
                  sections={sections}
                  groups={groups}
                  rankLabels={rankLabels}
                  autoAssign={autoAssign}
                  gridClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
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
                onClick={() => handleExportExcel("all")}
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
          <div className="space-y-3">
            <div className="flex justify-end">
              <button
                onClick={() => handleExportExcel("submitted")}
                disabled={exporting}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition flex items-center gap-1.5 disabled:opacity-60"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{exporting ? "생성 중..." : "엑셀 일괄 다운로드"}</span>
              </button>
            </div>
            <WonseoTableView roster={roster} cards={allCards} variant="submitted" />
          </div>
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
          onSaved={reloadCards}
        />
      )}
    </div>
  );
}
