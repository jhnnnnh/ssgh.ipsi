"use client";

import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/providers/ToastProvider";
import { findWonseoScheduleGroups, addScheduleEvent, type CardScheduleGroup } from "@/lib/wonseo-schedule";

/** "내 원서 일정": "접수한 원서"로 표시한 카드에 등록해 둔 일정을 훑어보고, 항목별로 캘린더에 넣는다. */
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
  const [groups, setGroups] = useState<CardScheduleGroup[]>([]);
  const [addingKey, setAddingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    findWonseoScheduleGroups(scope).then((result) => {
      if (cancelled) return;
      setGroups(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope.studentId, scope.classScope?.grade, scope.classScope?.classNo]);

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
        <p className="text-[11px] text-slate-400 text-center py-6">불러오는 중...</p>
      ) : groups.length === 0 ? (
        <p className="text-[11px] text-slate-400 text-center py-6">
          추가할 수 있는 일정이 없어요. &ldquo;접수한 원서&rdquo;로 표시한 카드에 날짜가 정해진 일정을
          등록해야 여기서 캘린더에 추가할 수 있어요.
        </p>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {groups.map((group) => {
            return (
              <div key={group.cardId} className="border border-slate-200 rounded-xl p-3">
                <p className="text-xs font-bold text-slate-800">
                  {showStudentName && group.studentName ? `${group.studentName} · ` : ""}
                  {group.university}
                  {group.department ? ` · ${group.department}` : ""}
                  {group.subCategory ? ` · ${group.subCategory}` : ""}
                </p>

                <div className="mt-2 space-y-1.5">
                  {group.items.map((item) => {
                    const key = `${group.cardId}::${item.kind}`;
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <span className="text-[11px] font-bold text-slate-700">{item.label}</span>
                          <span className="text-[10px] text-slate-400 ml-1.5">{item.date}</span>
                        </div>
                        {item.added ? (
                          <span className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                            <Check className="w-3 h-3" />
                            추가됨
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAdd(group, item)}
                            disabled={addingKey === key}
                            className="shrink-0 flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold transition disabled:opacity-60"
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
            );
          })}
        </div>
      )}
    </Modal>
  );
}
