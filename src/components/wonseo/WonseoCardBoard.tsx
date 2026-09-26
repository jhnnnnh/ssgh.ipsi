"use client";

import { useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  Check,
  ChevronDown,
  ChevronUp,
  FolderInput,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useEqualHeights } from "@/lib/hooks/useEqualHeights";
import { SECTION_DROPPABLE_PREFIX } from "@/lib/hooks/useWonseoCards";
import { UNGROUPED_SECTION_ID, type WonseoCardSection } from "@/lib/wonseo-rank";
import { SortableWonseoCard } from "@/components/wonseo/SortableWonseoCard";
import { WonseoCardView } from "@/components/wonseo/WonseoCardView";
import type { WonseoCard, WonseoCardGroup } from "@/lib/database.types";

/**
 * 포인터가 실제로 올라가 있는 곳을 먼저 목적지로 본다. 카드 위면 그 카드, 카드가 없는
 * 그룹 빈칸이면 그 그룹. 가장 가까운 카드만 찾는 closestCenter만 쓰면 빈 그룹에는 카드가
 * 없어서 항상 다른 그룹 카드가 잡혀, 빈 그룹으로 옮기는 게 거의 불가능했다.
 */
const pointerFirstCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length > 0) {
    const cardHits = hits.filter((hit) => !String(hit.id).startsWith(SECTION_DROPPABLE_PREFIX));
    return cardHits.length > 0 ? cardHits : hits;
  }
  return closestCenter(args);
};

type Props = {
  sections: WonseoCardSection[];
  groups: WonseoCardGroup[];
  rankLabels: Map<string, string>;
  autoAssign: boolean;
  gridClassName: string;
  showStatus: boolean;
  showRecentResults: boolean;
  onEdit: (card: WonseoCard) => void;
  onDelete: (card: WonseoCard) => void;
  onToggleSubmitted: (card: WonseoCard) => void;
  onRankChange: (card: WonseoCard, text: string) => void;
  onReorder: (event: DragEndEvent) => void;
  onMoveCardToGroup: (card: WonseoCard, groupId: string | null) => void;
  onCreateGroup: (name: string) => Promise<boolean>;
  onRenameGroup: (group: WonseoCardGroup, name: string) => void;
  onToggleGroupRanked: (group: WonseoCardGroup) => void;
  onMoveGroup: (group: WonseoCardGroup, direction: -1 | 1) => void;
  onDeleteGroup: (group: WonseoCardGroup) => void;
};

/**
 * "카드 보기" 화면. 학생이 만든 그룹마다 구역을 나눠 보여주고, 카드를 드래그하거나 카드의
 * "그룹 이동" 메뉴로 다른 그룹에 옮긴다. 그룹을 하나도 안 만들었으면 예전처럼 카드만 보인다.
 */
export function WonseoCardBoard({
  sections,
  groups,
  rankLabels,
  autoAssign,
  gridClassName,
  showStatus,
  showRecentResults,
  onEdit,
  onDelete,
  onToggleSubmitted,
  onRankChange,
  onReorder,
  onMoveCardToGroup,
  onCreateGroup,
  onRenameGroup,
  onToggleGroupRanked,
  onMoveGroup,
  onDeleteGroup,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overSectionId, setOverSectionId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const allCards = sections.flatMap((s) => s.cards);
  const { setRef, maxHeight } = useEqualHeights(
    `${allCards.map((c) => c.id).join("|")}#${[...collapsed].join("|")}`,
    allCards.length,
  );
  const indexById = new Map(allCards.map((c, i) => [c.id, i]));
  const activeCard = allCards.find((c) => c.id === activeId) ?? null;
  const hasGroups = groups.length > 0;
  const orderedGroups = sections.filter((s) => s.group).map((s) => s.group!);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitNewGroup() {
    if (!newName.trim()) {
      setCreating(false);
      return;
    }
    const ok = await onCreateGroup(newName);
    if (ok) {
      setNewName("");
      setCreating(false);
    }
  }

  function renderCard(card: WonseoCard) {
    return (
      <SortableWonseoCard
        key={card.id}
        id={card.id}
        setEqualHeightRef={setRef(indexById.get(card.id) ?? 0)}
        minHeight={maxHeight}
        isDragging={activeId === card.id}
        card={card}
        autoAssign={autoAssign}
        rankLabel={rankLabels.get(card.id)}
        onRankChange={(text) => onRankChange(card, text)}
        showStatus={showStatus}
        showRecentResults={showRecentResults}
        onEdit={() => onEdit(card)}
        onDelete={() => onDelete(card)}
        isSubmitted={card.is_submitted}
        onToggleSubmitted={() => onToggleSubmitted(card)}
        extraActions={
          hasGroups ? (
            <CardGroupMenu
              currentGroupId={card.group_id}
              groups={orderedGroups}
              onSelect={(groupId) => onMoveCardToGroup(card, groupId)}
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <DndContext
        sensors={sensors}
        collisionDetection={pointerFirstCollision}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragOver={(e) => {
          const overId = e.over ? String(e.over.id) : null;
          if (!overId) return setOverSectionId(null);
          if (overId.startsWith(SECTION_DROPPABLE_PREFIX)) {
            return setOverSectionId(overId.slice(SECTION_DROPPABLE_PREFIX.length));
          }
          setOverSectionId(sections.find((s) => s.cards.some((c) => c.id === overId))?.id ?? null);
        }}
        onDragCancel={() => {
          setActiveId(null);
          setOverSectionId(null);
        }}
        onDragEnd={(e) => {
          setActiveId(null);
          setOverSectionId(null);
          onReorder(e);
        }}
      >
        {sections.map((section) => {
          // 그룹이 없을 때는 미분류 구역 제목 없이 예전 화면 그대로 보여준다.
          if (!hasGroups) {
            return (
              <SectionDropZone key={section.id} sectionId={section.id}>
                <SortableContext items={section.cards.map((c) => c.id)} strategy={rectSortingStrategy}>
                  <div className={gridClassName}>{section.cards.map(renderCard)}</div>
                </SortableContext>
              </SectionDropZone>
            );
          }
          const isCollapsed = collapsed.has(section.id);
          const groupIndex = section.group ? orderedGroups.findIndex((g) => g.id === section.group!.id) : -1;
          const isDropTarget = activeId !== null && overSectionId === section.id;
          return (
            <SectionShell
              key={section.id}
              sectionId={section.id}
              className={cn(
                "rounded-3xl border-2 p-3 sm:p-4 transition-colors",
                isDropTarget
                  ? "border-indigo-500 bg-indigo-100/70"
                  : section.ranked
                    ? "border-indigo-200 bg-indigo-50/40"
                    : "border-slate-200 bg-slate-50/60",
              )}
            >
              <SectionHeader
                section={section}
                collapsed={isCollapsed}
                onToggleCollapsed={() => toggleCollapsed(section.id)}
                canMoveUp={groupIndex > 0}
                canMoveDown={groupIndex !== -1 && groupIndex < orderedGroups.length - 1}
                onRename={(name) => section.group && onRenameGroup(section.group, name)}
                onToggleRanked={() => section.group && onToggleGroupRanked(section.group)}
                onMove={(direction) => section.group && onMoveGroup(section.group, direction)}
                onDelete={() => section.group && onDeleteGroup(section.group)}
              />
              {!isCollapsed && (
                <SortableContext items={section.cards.map((c) => c.id)} strategy={rectSortingStrategy}>
                  {section.cards.length > 0 ? (
                    <div className={cn(gridClassName, "mt-3")}>{section.cards.map(renderCard)}</div>
                  ) : (
                    <p className="mt-3 rounded-2xl border border-dashed border-slate-300 py-10 text-center text-xs font-semibold text-slate-400">
                      카드를 여기로 끌어오거나, 카드의 <FolderInput className="inline w-3.5 h-3.5" /> 버튼으로 옮겨 보세요.
                    </p>
                  )}
                </SortableContext>
              )}
            </SectionShell>
          );
        })}
        <DragOverlay>
          {activeCard && (
            <div className="shadow-lg rounded-3xl">
              <WonseoCardView
                card={activeCard}
                autoAssign={autoAssign}
                rankLabel={rankLabels.get(activeCard.id)}
                showStatus={showStatus}
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

      {creating ? (
        <div className="flex items-center gap-2 rounded-2xl border border-indigo-200 bg-white p-2">
          <input
            autoFocus
            value={newName}
            maxLength={20}
            placeholder="그룹 이름 (예: 최종 후보)"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitNewGroup();
              if (e.key === "Escape") {
                setNewName("");
                setCreating(false);
              }
            }}
            className="min-w-0 flex-1 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => void submitNewGroup()}
            className="shrink-0 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-indigo-700"
          >
            만들기
          </button>
          <button
            type="button"
            onClick={() => {
              setNewName("");
              setCreating(false);
            }}
            className="shrink-0 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-bold text-slate-500 transition hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-600 flex items-center justify-center gap-1.5"
        >
          <FolderPlus className="w-4 h-4" />
          그룹 추가
        </button>
      )}
    </div>
  );
}

function SectionDropZone({ sectionId, children }: { sectionId: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `${SECTION_DROPPABLE_PREFIX}${sectionId}` });
  return <div ref={setNodeRef}>{children}</div>;
}

/** 그룹 상자 전체(제목 포함)를 드롭 영역으로 둔다. 접힌 그룹에도 끌어다 놓을 수 있다. */
function SectionShell({
  sectionId,
  className,
  children,
}: {
  sectionId: string;
  className: string;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: `${SECTION_DROPPABLE_PREFIX}${sectionId}` });
  return (
    <section ref={setNodeRef} className={className}>
      {children}
    </section>
  );
}

function SectionHeader({
  section,
  collapsed,
  onToggleCollapsed,
  canMoveUp,
  canMoveDown,
  onRename,
  onToggleRanked,
  onMove,
  onDelete,
}: {
  section: WonseoCardSection;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRename: (name: string) => void;
  onToggleRanked: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const group = section.group;
  const title = group ? group.name : "미분류";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "펼치기" : "접기"}
          className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700"
        >
          <ChevronDown className={cn("w-4 h-4 transition", collapsed && "-rotate-90")} />
        </button>
        {editing && group ? (
          <input
            autoFocus
            defaultValue={group.name}
            maxLength={20}
            onBlur={(e) => {
              setEditing(false);
              onRename(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
            }}
            className="min-w-0 w-40 rounded-lg bg-white px-2 py-1 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
          <h4 className="truncate text-sm font-bold text-slate-900">{title}</h4>
        )}
        <span className="shrink-0 text-xs font-bold text-slate-400">{section.cards.length}</span>
        {!group && section.ranked && (
          <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
            지망 번호
          </span>
        )}
      </div>

      {group && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onToggleRanked}
            aria-pressed={group.is_ranked}
            title="켜면 이 그룹 카드가 N지망 번호를 받아요"
            className={cn(
              "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition",
              group.is_ranked
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-300 bg-white text-slate-500 hover:border-indigo-300 hover:text-indigo-600",
            )}
          >
            {group.is_ranked && <Check className="w-3 h-3" />}
            지망 번호 받기
          </button>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            aria-label="그룹을 위로"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            aria-label="그룹을 아래로"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label="그룹 이름 바꾸기"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="그룹 삭제"
            className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function CardGroupMenu({
  currentGroupId,
  groups,
  onSelect,
}: {
  currentGroupId: string | null;
  groups: WonseoCardGroup[];
  onSelect: (groupId: string | null) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const options: { id: string | null; name: string }[] = [
    ...groups.map((g) => ({ id: g.id, name: g.name })),
    { id: null, name: "미분류" },
  ];
  const currentId = groups.some((g) => g.id === currentGroupId) ? currentGroupId : null;

  return (
    <details ref={detailsRef} className="relative">
      <summary
        title="그룹 이동"
        aria-label="그룹 이동"
        className="list-none [&::-webkit-details-marker]:hidden w-7 h-7 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
      >
        <FolderInput className="w-3.5 h-3.5" />
      </summary>
      <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
        <p className="px-2 pb-1 pt-0.5 text-[11px] font-bold text-slate-400">그룹 이동</p>
        {options.map((option) => (
          <button
            key={option.id ?? UNGROUPED_SECTION_ID}
            type="button"
            onClick={() => {
              detailsRef.current?.removeAttribute("open");
              if (option.id !== currentId) onSelect(option.id);
            }}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-semibold",
              option.id === currentId ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50",
            )}
          >
            <span className="truncate">{option.name}</span>
            {option.id === currentId && <Check className="w-3.5 h-3.5 shrink-0" />}
          </button>
        ))}
      </div>
    </details>
  );
}
