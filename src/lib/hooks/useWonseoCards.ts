"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { createClient } from "@/lib/supabase/client";
import {
  UNGROUPED_SECTION_ID,
  buildCardSections,
  computeSectionRankLabels,
} from "@/lib/wonseo-rank";
import type { ScheduleEvent, WonseoCard, WonseoCardGroup } from "@/lib/database.types";

/** 빈 구역에도 카드를 끌어다 놓을 수 있게 구역마다 두는 드롭 영역의 id 접두어. */
export const SECTION_DROPPABLE_PREFIX = "section:";

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
  const [groups, setGroups] = useState<WonseoCardGroup[]>([]);

  const reloadCards = useCallback(async () => {
    if (!studentId) {
      setCards([]);
      setGroups([]);
      return;
    }
    const [{ data }, { data: groupData }] = await Promise.all([
      supabase
        .from("wonseo_cards")
        .select("*")
        .eq("student_id", studentId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("wonseo_card_groups")
        .select("*")
        .eq("student_id", studentId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    setCards(data ?? []);
    setGroups(groupData ?? []);
  }, [studentId, supabase]);

  const sections = useMemo(() => buildCardSections(cards, groups), [cards, groups]);
  const rankLabels = useMemo(() => computeSectionRankLabels(sections), [sections]);

  /** 화면 구역 순서를 그대로 펼쳐 sort_order·group_id를 다시 매기고, 바뀐 카드만 저장한다. */
  const saveSectionLayout = useCallback(
    async (nextSections: { id: string; cards: WonseoCard[] }[]) => {
      const flattened = nextSections.flatMap((section) =>
        section.cards.map((card) => ({
          ...card,
          group_id: section.id === UNGROUPED_SECTION_ID ? null : section.id,
        })),
      );
      const next = flattened.map((card, index) => ({ ...card, sort_order: index }));
      const previous = new Map(cards.map((card) => [card.id, card]));
      const changed = next.filter((card) => {
        const before = previous.get(card.id);
        return !before || before.sort_order !== card.sort_order || before.group_id !== card.group_id;
      });
      setCards(next);
      if (changed.length === 0) return;

      const results = await Promise.all(
        changed.map((card) =>
          supabase
            .from("wonseo_cards")
            .update({ sort_order: card.sort_order, group_id: card.group_id })
            .eq("id", card.id),
        ),
      );
      if (results.some((result) => result.error)) {
        onError("순서 저장에 실패했습니다.");
        await reloadCards();
      }
    },
    [cards, onError, reloadCards, supabase],
  );

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

  /** 같은 구역 안에서 순서를 바꾸거나, 다른 구역의 카드(또는 구역 빈칸) 위에 놓으면 그 구역으로 옮긴다. */
  const reorderCards = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeId = String(active.id);
      const overId = String(over.id);

      const fromSection = sections.find((s) => s.cards.some((c) => c.id === activeId));
      const toSection = overId.startsWith(SECTION_DROPPABLE_PREFIX)
        ? sections.find((s) => s.id === overId.slice(SECTION_DROPPABLE_PREFIX.length))
        : sections.find((s) => s.cards.some((c) => c.id === overId));
      if (!fromSection || !toSection) return;

      const nextSections = sections.map((s) => ({ id: s.id, cards: [...s.cards] }));
      const from = nextSections.find((s) => s.id === fromSection.id)!;
      const to = nextSections.find((s) => s.id === toSection.id)!;

      if (from === to) {
        const oldIndex = from.cards.findIndex((c) => c.id === activeId);
        const newIndex = from.cards.findIndex((c) => c.id === overId);
        if (oldIndex === -1 || newIndex === -1) return;
        from.cards = arrayMove(from.cards, oldIndex, newIndex);
      } else {
        const oldIndex = from.cards.findIndex((c) => c.id === activeId);
        const [moved] = from.cards.splice(oldIndex, 1);
        const overIndex = to.cards.findIndex((c) => c.id === overId);
        to.cards.splice(overIndex === -1 ? to.cards.length : overIndex, 0, moved);
      }
      await saveSectionLayout(nextSections);
    },
    [saveSectionLayout, sections],
  );

  /** 카드 메뉴의 "그룹 이동": 대상 구역 맨 끝으로 옮긴다(휴대폰에서 드래그 대신 쓴다). */
  const moveCardToGroup = useCallback(
    async (card: WonseoCard, groupId: string | null) => {
      const targetId = groupId ?? UNGROUPED_SECTION_ID;
      const nextSections = sections.map((s) => ({
        id: s.id,
        cards: s.cards.filter((c) => c.id !== card.id),
      }));
      const target = nextSections.find((s) => s.id === targetId);
      if (!target) return;
      target.cards.push(card);
      await saveSectionLayout(nextSections);
    },
    [saveSectionLayout, sections],
  );

  const createGroup = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return false;
      const { error } = await supabase.from("wonseo_card_groups").insert({
        student_id: studentId,
        name: trimmed.slice(0, 20),
        sort_order: groups.length === 0 ? 0 : Math.max(...groups.map((g) => g.sort_order)) + 1,
        is_ranked: false,
      });
      if (error) {
        onError("그룹을 만들지 못했습니다.");
        return false;
      }
      await reloadCards();
      return true;
    },
    [groups, onError, reloadCards, studentId, supabase],
  );

  const renameGroup = useCallback(
    async (group: WonseoCardGroup, name: string) => {
      const trimmed = name.trim().slice(0, 20);
      if (!trimmed || trimmed === group.name) return;
      const { error } = await supabase.from("wonseo_card_groups").update({ name: trimmed }).eq("id", group.id);
      if (error) {
        onError("이름을 바꾸지 못했습니다.");
        return;
      }
      await reloadCards();
    },
    [onError, reloadCards, supabase],
  );

  const toggleGroupRanked = useCallback(
    async (group: WonseoCardGroup) => {
      const { error } = await supabase
        .from("wonseo_card_groups")
        .update({ is_ranked: !group.is_ranked })
        .eq("id", group.id);
      if (error) {
        onError("저장에 실패했습니다.");
        return;
      }
      await reloadCards();
    },
    [onError, reloadCards, supabase],
  );

  /** 그룹 순서를 한 칸 위(-1)/아래(+1)로 옮긴다. 순서는 지망 번호 순서에도 반영된다. */
  const moveGroup = useCallback(
    async (group: WonseoCardGroup, direction: -1 | 1) => {
      const ordered = [...groups].sort((a, b) => a.sort_order - b.sort_order);
      const index = ordered.findIndex((g) => g.id === group.id);
      const swapIndex = index + direction;
      if (index === -1 || swapIndex < 0 || swapIndex >= ordered.length) return;
      const reordered = arrayMove(ordered, index, swapIndex);
      const results = await Promise.all(
        reordered.map((g, i) => supabase.from("wonseo_card_groups").update({ sort_order: i }).eq("id", g.id)),
      );
      if (results.some((result) => result.error)) onError("순서 저장에 실패했습니다.");
      await reloadCards();
    },
    [groups, onError, reloadCards, supabase],
  );

  const deleteGroup = useCallback(
    async (group: WonseoCardGroup) => {
      const count = cards.filter((c) => c.group_id === group.id).length;
      const ok = await confirm({
        message:
          count > 0
            ? `"${group.name}" 그룹을 삭제할까요? 안에 있는 카드 ${count}개는 지워지지 않고 미분류로 옮겨집니다.`
            : `"${group.name}" 그룹을 삭제할까요?`,
        confirmLabel: "삭제",
        danger: true,
      });
      if (!ok) return;
      const { error } = await supabase.from("wonseo_card_groups").delete().eq("id", group.id);
      if (error) {
        onError("삭제에 실패했습니다.");
        return;
      }
      await reloadCards();
    },
    [cards, confirm, onError, reloadCards, supabase],
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
      const results = await Promise.all(
        cards.map((card) =>
          supabase
            .from("wonseo_cards")
            .update({ rank: rankLabels.get(card.id) ?? null })
            .eq("id", card.id),
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
  }, [autoAssign, cards, confirm, onError, rankLabels, reloadCards, setAutoAssign, studentId, supabase]);

  return {
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
  };
}
