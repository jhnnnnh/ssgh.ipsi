"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, GraduationCap, Layers, LayoutGrid, Star, Table2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useStatusReveal } from "@/lib/hooks/useStatusReveal";
import { useRankAutoAssign } from "@/lib/hooks/useRankAutoAssign";
import { useWonseoCards } from "@/lib/hooks/useWonseoCards";
import { useActiveClass } from "@/components/providers/ActiveClassProvider";
import { Card } from "@/components/ui/Card";
import { WonseoCardModal } from "@/components/wonseo/WonseoCardModal";
import { WonseoCardBoard } from "@/components/wonseo/WonseoCardBoard";
import {
  SubmittedCardList,
  SubmittedViewToggle,
  WonseoCardToolbar,
  WonseoEmptyState,
  cardGridClassName,
  useCardColumns,
} from "@/components/wonseo/WonseoCardControls";
import { WonseoTableView } from "@/components/teacher/WonseoTableView";
import { exportWonseoExcel } from "@/lib/wonseo-excel";
import type { Roster, WonseoCard } from "@/lib/database.types";

type ViewMode = "cards" | "table" | "submittedTable";

export function WonseoManageTab({ roster }: { roster: Roster[] }) {
  const showToast = useToast();
  const confirm = useConfirm();
  const { enabled: statusVisible } = useStatusReveal();
  const { isAdmin } = useActiveClass();
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const { autoAssign, setAutoAssign } = useRankAutoAssign(selectedStudentId);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [allCards, setAllCards] = useState<WonseoCard[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<WonseoCard | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showRecentResults, setShowRecentResults] = useState(false);
  const [studentView, setStudentView] = useState<"all" | "submitted">("all");
  const [cardColumns, setCardColumns] = useCardColumns("wonseo-card-columns:teacher");
  const gridClassName = cardGridClassName(cardColumns);

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


  return (
    <div className="space-y-6">
      <Card className="space-y-5">
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
                  <SubmittedViewToggle
                    active={studentView === "submitted"}
                    count={cards.filter((c) => c.is_submitted).length}
                    onToggle={() => setStudentView((v) => (v === "all" ? "submitted" : "all"))}
                  />
                )}
              </div>
              {selectedStudentId && (
                <WonseoCardToolbar
                  hidden={studentView !== "all"}
                  showRecentResults={showRecentResults}
                  onToggleRecentResults={() => setShowRecentResults((v) => !v)}
                  autoAssign={autoAssign}
                  onToggleAutoAssign={() => void toggleAutoAssign()}
                  cardColumns={cardColumns}
                  onChangeCardColumns={setCardColumns}
                  onCreate={openCreate}
                />
              )}
            </div>

            {selectedStudentId ? (
              studentView === "submitted" ? (
                <SubmittedCardList
                  cards={cards}
                  gridClassName={gridClassName}
                  autoAssign={autoAssign}
                  showStatus={statusVisible}
                  onEdit={openEdit}
                  onDelete={(card) => void deleteCard(card)}
                  onToggleSubmitted={(card) => void toggleSubmitted(card)}
                  onRankChange={(card, text) => void saveRank(card, text)}
                  onReorder={(e, submitted) => void reorderSubmittedCards(e, submitted)}
                  onSubmittedFieldsCommit={(card, fields) => void saveSubmittedFields(card, fields)}
                />
              ) : cards.length > 0 ? (
                <WonseoCardBoard
                  sections={sections}
                  groups={groups}
                  rankLabels={rankLabels}
                  autoAssign={autoAssign}
                  gridClassName={gridClassName}
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
                <WonseoEmptyState icon={<Layers className="w-6 h-6" />} title="이 학생은 아직 등록한 원서 카드가 없습니다.">
                  <strong className="text-indigo-600">[원서 추가]</strong> 버튼으로 학생 대신 등록할 수 있어요.
                </WonseoEmptyState>
              )
            ) : (
              <WonseoEmptyState icon={<GraduationCap className="w-6 h-6" />} title="학생을 선택해 주세요.">
                상단에서 학생을 선택하면 해당 학생의 수시 원서 카드가 표시됩니다.
              </WonseoEmptyState>
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
