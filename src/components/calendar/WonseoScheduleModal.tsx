"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Check, Plus, RefreshCw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/providers/ToastProvider";
import { cn } from "@/lib/cn";
import { findWonseoScheduleGroups, addScheduleEvent, type CardScheduleGroup } from "@/lib/wonseo-schedule";

type StudentSection = {
  studentId: string;
  studentName: string | null;
  /** 학교(카드)별 묶음. 각 묶음 안 일정은 날짜순이다. */
  cards: { group: CardScheduleGroup; items: CardScheduleGroup["items"] }[];
};

/**
 * 학생 → 학교(카드) → 일정 순으로 묶는다. 검색어에 맞는 것만 남기고, 학교 묶음은 가장 이른 일정 날짜순이다.
 * 검색어는 학생 이름·학번·대학·학과·전형, 일정 이름·날짜를 본다.
 */
function buildStudentSections(groups: CardScheduleGroup[], query: string): StudentSection[] {
  const q = query.trim().toLowerCase();
  const hit = (text: string | null | undefined) => !!text && text.toLowerCase().includes(q);
  const byStudent = new Map<string, StudentSection>();
  for (const group of groups) {
    const groupHit =
      !q || [group.studentName, group.studentId, group.university, group.department, group.subCategory].some(hit);
    const items = group.items
      .filter((item) => groupHit || hit(item.label) || hit(item.date))
      .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, "ko"));
    if (items.length === 0) continue;
    let section = byStudent.get(group.studentId);
    if (!section) {
      section = { studentId: group.studentId, studentName: group.studentName, cards: [] };
      byStudent.set(group.studentId, section);
    }
    section.cards.push({ group, items });
  }
  for (const section of byStudent.values()) {
    section.cards.sort(
      (a, b) =>
        a.items[0].date.localeCompare(b.items[0].date) || a.group.university.localeCompare(b.group.university, "ko"),
    );
  }
  return [...byStudent.values()].sort((a, b) => a.studentId.localeCompare(b.studentId));
}

/** "내 원서 일정":"접수한 원서"로 표시한 카드에 등록해 둔 일정을 훑어보고, 항목별로 캘린더에 넣는다. */
export function WonseoScheduleModal({
  open,
  onClose,
  scope,
  createdBy,
  showStudentName,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  scope: { studentId?: string; classScope?: { grade: number; classNo: number } };
  createdBy: string;
  /** 교사 화면처럼 "(학생이름)"을 그룹 제목에 같이 보여줄지 여부. */
  showStudentName?: boolean;
  onImported: () => void;
}) {
  const showToast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<CardScheduleGroup[]>([]);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const sections = buildStudentSections(groups, query);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    void findWonseoScheduleGroups(scope)
      .then((result) => {
        if (cancelled) return;
        setGroups(result);
      })
      .catch(() => {
        if (cancelled) return;
        setGroups([]);
        setError("원서 일정을 불러오지 못했습니다. 다시 시도해 주세요.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reloadKey, scope.studentId, scope.classScope?.grade, scope.classScope?.classNo]);

  async function handleAdd(group: CardScheduleGroup, item: CardScheduleGroup["items"][number]) {
    const key = `${group.cardId}::${item.kind}`;
    setAddingKey(key);
    try {
      await addScheduleEvent({
        cardId: group.cardId,
        studentId: group.studentId,
        grade: group.grade,
        classNo: group.classNo,
        university: group.university,
        kind: item.kind,
        label: item.label,
        date: item.date,
        createdBy,
      });
      setGroups((prev) =>
        prev.map((g) =>
          g.cardId !== group.cardId
            ? g
            : { ...g, items: g.items.map((it) => (it.kind === item.kind ? { ...it, added: true } : it)) },
        ),
      );
      onImported();
    } catch {
      showToast("캘린더에 추가하지 못했습니다.", "error");
    } finally {
      setAddingKey(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="내 원서 일정" maxWidth="max-w-md">
      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">불러오는 중...</p>
      ) : error ? (
        <div className="text-center py-6 space-y-3">
          <AlertCircle className="w-5 h-5 mx-auto text-rose-500" />
          <p className="text-xs font-semibold text-slate-500">{error}</p>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="mx-auto px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            다시 불러오기
          </button>
        </div>
      ) : groups.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-6">
          추가할 수 있는 일정이 없어요. &ldquo;접수한 원서&rdquo;로 표시한 카드에 날짜가 정해진 일정을
          등록해야 여기서 캘린더에 추가할 수 있어요.
        </p>
      ) : (
        <div className="space-y-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="학생 이름, 학교, 일정 이름으로 찾기"
            className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <div className="space-y-3 max-h-[55dvh] overflow-y-auto">
            {sections.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-6">검색 결과가 없어요.</p>
            )}
            {sections.map((section) => (
              <div key={section.studentId} className="border border-slate-200 rounded-xl p-3">
                {showStudentName && (
                  <p className="text-xs font-bold text-slate-800">{section.studentName ?? section.studentId}</p>
                )}
                <div className={cn("space-y-2", showStudentName && "mt-2")}>
                  {section.cards.map(({ group, items }) => (
                    <div key={group.cardId} className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                      <p className="text-[11px] font-bold text-slate-500">
                        {group.university}
                        {group.department ? ` · ${group.department}` : ""}
                        {group.subCategory ? ` · ${group.subCategory}` : ""}
                      </p>
                      <div className="mt-1.5 space-y-1.5">
                        {items.map((item) => {
                          const key = `${group.cardId}::${item.kind}`;
                          return (
                            <div
                              key={key}
                              className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
                            >
                              <p className="min-w-0">
                                <span className="text-xs font-bold text-slate-700">{item.date}</span>
                                <span className="text-xs font-bold text-slate-700 ml-1.5">{item.label}</span>
                              </p>
                              {item.added ? (
                                <span className="shrink-0 flex items-center gap-1 text-xs font-bold text-emerald-600">
                                  <Check className="w-3 h-3" />
                                  추가됨
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleAdd(group, item)}
                                  disabled={addingKey === key}
                                  className="shrink-0 flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition disabled:opacity-60"
                                >
                                  <Plus className="w-3 h-3" />
                                  캘린더에 추가
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
