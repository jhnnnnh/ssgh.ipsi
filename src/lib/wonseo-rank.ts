import type { WonseoCard, WonseoCardGroup } from "@/lib/database.types";

/** 자동 배정이 켜져 있을 때: 카드 목록(이미 sort_order 순서)을 그대로 세어 "N지망"을 매긴다. */
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
 * 지망 번호는 is_ranked 그룹의 카드만 받는다. 번호 받는 그룹이 하나도 없으면(그룹을 안 쓰는
 * 학생 포함) 미분류 카드가 번호를 받아, 그룹 기능 이전과 똑같이 보인다.
 */
export function buildCardSections(cards: WonseoCard[], groups: WonseoCardGroup[]): WonseoCardSection[] {
  const groupIds = new Set(groups.map((g) => g.id));
  const hasRankedGroup = groups.some((g) => g.is_ranked);
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
    ranked: !hasRankedGroup,
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
