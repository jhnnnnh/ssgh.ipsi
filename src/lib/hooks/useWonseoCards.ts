"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { createClient } from "@/lib/supabase/client";
import { computeAutoRankLabels } from "@/lib/wonseo-rank";
import type { ScheduleEvent, WonseoCard } from "@/lib/database.types";

type ConfirmOptions = {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
};

type UseWonseoCardsOptions = {
  /** 학생 화면은 본인 학번, 교사 화면은 선택한 학생의 학번을 넘긴다. */
  studentId: string;
  autoAssign: boolean;
  setAutoAssign: (enabled: boolean) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

/**
 * 학생·교사 원서 화면이 공통으로 쓰는 카드 저장 규칙이다. 두 화면의 UI와 권한 범위는
 * 각각 유지하고, 카드 정렬·접수 표시·지망 순위처럼 어느 화면에서 해도 같은 결과여야 하는
 * DB 변경만 여기에서 한 번 관리한다.
 */
export function useWonseoCards({
  studentId,
  autoAssign,
  setAutoAssign,
  confirm,
  onError,
  onSuccess,
}: UseWonseoCardsOptions) {
  const supabase = useMemo(() => createClient(), []);
  const [cards, setCards] = useState<WonseoCard[]>([]);

  const reloadCards = useCallback(async () => {
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
  }, [studentId, supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadCards();
  }, [reloadCards]);

  const deleteCard = useCallback(
    async (card: WonseoCard) => {
      const ok = await confirm({
        message: `${card.university || "해당"} 원서 카드를 삭제하시겠습니까?`,
        confirmLabel: "삭제",
        danger: true,
      });
      if (!ok) return;
      const { error } = await supabase.from("wonseo_cards").delete().eq("id", card.id);
      if (error) {
        onError("삭제에 실패했습니다.");
        return;
      }
      onSuccess("삭제되었습니다.");
      await reloadCards();
    },
    [confirm, onError, onSuccess, reloadCards, supabase],
  );

  const toggleSubmitted = useCallback(
    async (card: WonseoCard) => {
      const turningOn = !card.is_submitted;
      // 별표 목록의 순서는 일반 카드 순서와 독립적이다. 새 카드는 접수 목록 마지막에 붙인다.
      const patch: { is_submitted: boolean; submitted_sort_order?: number } = { is_submitted: turningOn };
      if (turningOn) patch.submitted_sort_order = cards.filter((item) => item.is_submitted).length;

      const { error } = await supabase.from("wonseo_cards").update(patch).eq("id", card.id);
      if (error) {
        onError("저장에 실패했습니다.");
        return;
      }
      await reloadCards();
    },
    [cards, onError, reloadCards, supabase],
  );

  const reorderCards = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = cards.findIndex((card) => card.id === active.id);
      const newIndex = cards.findIndex((card) => card.id === over.id);
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
      if (results.some((result) => result.error)) {
        onError("순서 저장에 실패했습니다.");
        await reloadCards();
      }
    },
    [cards, onError, reloadCards, supabase],
  );

  const reorderSubmittedCards = useCallback(
    async (event: DragEndEvent, submittedCards: WonseoCard[]) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = submittedCards.findIndex((card) => card.id === active.id);
      const newIndex = submittedCards.findIndex((card) => card.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(submittedCards, oldIndex, newIndex).map((card, index) => ({
        ...card,
        submitted_sort_order: index,
      }));
      const byId = new Map(reordered.map((card) => [card.id, card]));
      setCards((previous) => previous.map((card) => byId.get(card.id) ?? card));

      const results = await Promise.all(
        reordered.map((card) =>
          supabase
            .from("wonseo_cards")
            .update({ submitted_sort_order: card.submitted_sort_order })
            .eq("id", card.id),
        ),
      );
      if (results.some((result) => result.error)) {
        onError("순서 저장에 실패했습니다.");
        await reloadCards();
      }
    },
    [onError, reloadCards, supabase],
  );

  const saveSubmittedFields = useCallback(
    async (card: WonseoCard, fields: { applicationNumber: string; scheduleEvents: ScheduleEvent[] }) => {
      const { error } = await supabase
        .from("wonseo_cards")
        .update({
          application_number: fields.applicationNumber.trim() || null,
          schedule_events: fields.scheduleEvents,
        })
        .eq("id", card.id);
      if (error) {
        onError("저장에 실패했습니다.");
        return;
      }
      await reloadCards();
    },
    [onError, reloadCards, supabase],
  );

  const saveRank = useCallback(
    async (card: WonseoCard, text: string) => {
      const value = text.trim() || null;
      if (value === card.rank) return;
      const { error } = await supabase.from("wonseo_cards").update({ rank: value }).eq("id", card.id);
      if (error) {
        onError("지망 순위 저장에 실패했습니다.");
        return;
      }
      await reloadCards();
    },
    [onError, reloadCards, supabase],
  );

  const toggleAutoAssign = useCallback(async () => {
    if (autoAssign) {
      const labels = computeAutoRankLabels(cards);
      const results = await Promise.all(
        cards.map((card, index) =>
          supabase.from("wonseo_cards").update({ rank: labels[index] }).eq("id", card.id),
        ),
      );
      if (results.some((result) => result.error)) {
        onError("전환에 실패했습니다.");
        return;
      }
      const { error } = await supabase
        .from("roster")
        .update({ rank_auto_assign: false })
        .eq("student_id", studentId);
      if (error) {
        onError("전환에 실패했습니다.");
        return;
      }
      setAutoAssign(false);
      await reloadCards();
      return;
    }

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
      onError("전환에 실패했습니다.");
      return;
    }
    setAutoAssign(true);
  }, [autoAssign, cards, confirm, onError, reloadCards, setAutoAssign, studentId, supabase]);

  return {
    cards,
    reloadCards,
    deleteCard,
    toggleSubmitted,
    reorderCards,
    reorderSubmittedCards,
    saveSubmittedFields,
    saveRank,
    toggleAutoAssign,
  };
}
