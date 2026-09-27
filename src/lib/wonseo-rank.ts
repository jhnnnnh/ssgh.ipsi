import type { WonseoCard, WonseoCardGroup } from "@/lib/database.types";

/** "접수한 원서" 화면: 카드 목록(이미 그 화면 순서)을 그대로 세어 "N지망"을 매긴다. */
export function computeAutoRankLabels(cards: WonseoCard[]): string[] {
  return cards.map((_, i) => `${i + 1}지망`);
}

export const UNGROUPED_SECTION_ID = "ungrouped";

export type WonseoCardSection = {
  /** 그룹 id, 미분류면 UNGROUPED_SECTION_ID. */
  id: string;
  group: WonseoCardGroup | null;
  cards: WonseoCard[];
  /** 이 구역 카드가 N지망 번호를 받는지. */
  ranked: boolean;
};

/**
 * 카드 보기 화면의 구역 목록. 그룹을 sort_order 순으로 먼저 보여주고 미분류를 마지막에 둔다.
 * 지망 번호는 "지망 번호 받기"를 켠 구역의 카드만 받는다. 미분류의 스위치는 학생별 값
 * (ungroupedRanked, 기본 켜짐)이라 그룹을 안 쓰는 학생은 예전처럼 모든 카드가 번호를 받는다.
 */
export function buildCardSections(
  cards: WonseoCard[],
  groups: WonseoCardGroup[],
  ungroupedRanked: boolean,
): WonseoCardSection[] {
  const groupIds = new Set(groups.map((g) => g.id));
  const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order);
  const sections: WonseoCardSection[] = sortedGroups.map((group) => ({
    id: group.id,
    group,
    cards: cards.filter((c) => c.group_id === group.id),
    ranked: group.is_ranked,
  }));
  sections.push({
    id: UNGROUPED_SECTION_ID,
    group: null,
    cards: cards.filter((c) => !c.group_id || !groupIds.has(c.group_id)),
    ranked: ungroupedRanked,
  });
  return sections;
}

/** 화면 순서대로 번호 받는 구역의 카드에만 "N지망"을 매긴다. 번호가 없으면 결과에 없다. */
export function computeSectionRankLabels(sections: WonseoCardSection[]): Map<string, string> {
  const labels = new Map<string, string>();
  let rank = 0;
  for (const section of sections) {
    if (!section.ranked) continue;
    for (const card of section.cards) {
      rank += 1;
      labels.set(card.id, `${rank}지망`);
    }
  }
  return labels;
}
