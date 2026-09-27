"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { useStatusReveal } from "@/lib/hooks/useStatusReveal";
import { useUngroupedRanked } from "@/lib/hooks/useUngroupedRanked";
import { useWonseoCards } from "@/lib/hooks/useWonseoCards";
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
import type { WonseoCard } from "@/lib/database.types";

export function WonseoTab({ studentId }: { studentId: string }) {
  const showToast = useToast();
  const confirm = useConfirm();
  const { enabled: statusVisible } = useStatusReveal();
  const { ungroupedRanked, setUngroupedRanked } = useUngroupedRanked(studentId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<WonseoCard | null>(null);
  const [showRecentResults, setShowRecentResults] = useState(false);
  const [view, setView] = useState<"all" | "submitted">("all");
  const [cardColumns, setCardColumns] = useCardColumns(`wonseo-card-columns:${studentId}`);
  const gridClassName = cardGridClassName(cardColumns);

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
    toggleUngroupedRanked,
  } = useWonseoCards({
    studentId,
    ungroupedRanked,
    setUngroupedRanked,
    confirm,
    onError: (message) => showToast(message, "error"),
    onSuccess: (message) => showToast(message, "success"),
  });

  function openCreate() {
    setEditingCard(null);
    setModalOpen(true);
  }
  function openEdit(card: WonseoCard) {
    setEditingCard(card);
    setModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">나의 수시 카드</h3>
          <SubmittedViewToggle
            active={view === "submitted"}
            count={cards.filter((c) => c.is_submitted).length}
            onToggle={() => setView((v) => (v === "all" ? "submitted" : "all"))}
          />
        </div>
        <WonseoCardToolbar
          hidden={view !== "all"}
          showRecentResults={showRecentResults}
          onToggleRecentResults={() => setShowRecentResults((v) => !v)}
          cardColumns={cardColumns}
          onChangeCardColumns={setCardColumns}
          onCreate={openCreate}
        />
      </div>

      {view === "submitted" ? (
        <SubmittedCardList
          cards={cards}
          gridClassName={gridClassName}
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
          onToggleUngroupedRanked={() => void toggleUngroupedRanked()}
          onMoveGroup={(group, direction) => void moveGroup(group, direction)}
          onDeleteGroup={(group) => void deleteGroup(group)}
        />
      ) : (
        <WonseoEmptyState icon={<Layers className="w-6 h-6" />} title="등록된 수시 원서 카드가 없습니다.">
          상단의 <strong className="text-indigo-600">[원서 추가]</strong> 버튼을 눌러 지망 순위별 대학 및 모집단위
          정보를 등록해 보세요.
        </WonseoEmptyState>
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
