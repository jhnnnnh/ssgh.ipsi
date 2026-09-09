"use client";

import { useEffect, useState } from "react";
import { CalendarPlus, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { cn } from "@/lib/cn";
import { DEFAULT_EVENT_COLOR, EVENT_COLOR_PALETTE, EVENT_TYPE_LABELS } from "@/lib/calendar-constants";
import { toDateString } from "@/lib/calendar-grid";
import { findConnectedGroup } from "@/lib/calendar-group";
import type { CalendarEventType } from "@/lib/database.types";
import type { ResolvedCalendarEvent } from "@/lib/hooks/useCalendarEvents";

const MAX_RANGE_DAYS = 60;

/** start~end(포함) 사이의 "YYYY-MM-DD" 날짜 목록을 만든다. */
function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cur <= last) {
    dates.push(toDateString(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function CalendarEventModal({
  open,
  onClose,
  events,
  editingEvent,
  allowedTypes,
  defaultDate,
  scope,
  createdBy,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** 연속된 날짜에 같은 일정이 이어져 있는지 판단하기 위한 전체 일정 목록. */
  events: ResolvedCalendarEvent[];
  /** null이면 새 일정 추가, 값이 있으면 그 일정 수정(wonseo_schedule이면 색상만 수정 가능). */
  editingEvent: ResolvedCalendarEvent | null;
  allowedTypes: CalendarEventType[];
  defaultDate?: string;
  scope: { studentId?: string; grade?: number; classNo?: number };
  createdBy: string;
  onSaved: () => void;
}) {
  const showToast = useToast();
  const isWonseoSchedule = editingEvent?.type === "wonseo_schedule";

  const [type, setType] = useState<CalendarEventType>(allowedTypes[0] ?? "personal");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_EVENT_COLOR);
  const [titleError, setTitleError] = useState(false);
  const [dateError, setDateError] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 수정 대상이 이어진 일정 묶음일 때, 원래 그 묶음이 차지하던 날짜→id. 저장 시 이 목록과 비교해 변경분만 반영한다. */
  const [originalGroup, setOriginalGroup] = useState<{ id: string; date: string }[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (editingEvent) {
      setType(editingEvent.type);
      setTitle(editingEvent.resolvedTitle);
      setColor(editingEvent.color);
      const group = findConnectedGroup(editingEvent, events);
      const dates = group.map((e) => ({ id: e.id, date: e.resolvedDate! }));
      setOriginalGroup(dates);
      setDate(dates[0]?.date ?? editingEvent.resolvedDate ?? "");
      setEndDate(dates.length > 1 ? dates[dates.length - 1].date : "");
    } else {
      setType(allowedTypes[0] ?? "personal");
      setTitle("");
      setDate(defaultDate ?? "");
      setEndDate("");
      setColor(DEFAULT_EVENT_COLOR);
      setOriginalGroup([]);
    }
    setTitleError(false);
    setDateError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingEvent]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSave() {
    if (isWonseoSchedule) {
      // 색상만 수정
      setSaving(true);
      const supabase = createClient();
      const { error } = await supabase
        .from("calendar_events")
        .update({ color, updated_at: new Date().toISOString() })
        .eq("id", editingEvent!.id);
      setSaving(false);
      if (error) {
        showToast("색상 변경에 실패했습니다.", "error");
        return;
      }
      showToast("색상이 변경되었습니다.", "success");
      onSaved();
      onClose();
      return;
    }

    const hasTitle = title.trim().length > 0;
    const hasDate = date.trim().length > 0;
    setTitleError(!hasTitle);
    setDateError(!hasDate);
    if (!hasTitle || !hasDate) {
      showToast("제목과 날짜를 입력해 주세요.", "error");
      return;
    }
    if (endDate && endDate < date) {
      setDateError(true);
      showToast("종료일은 시작일보다 빠를 수 없어요.", "error");
      return;
    }

    const supabase = createClient();
    const dates = endDate && endDate > date ? dateRange(date, endDate) : [date];
    if (dates.length > MAX_RANGE_DAYS) {
      showToast(`한 번에 최대 ${MAX_RANGE_DAYS}일까지 등록할 수 있어요.`, "error");
      return;
    }

    const basePayload = {
      type,
      title: title.trim(),
      color,
      created_by: createdBy,
      student_id: type === "personal" ? (scope.studentId ?? null) : null,
      grade: type === "class" ? (scope.grade ?? null) : null,
      class_no: type === "class" ? (scope.classNo ?? null) : null,
    };

    setSaving(true);

    if (editingEvent) {
      // 원래 묶음의 날짜 중, 새 범위에도 남아있는 날짜는 그 행을 그대로 수정(id 유지),
      // 새로 포함된 날짜만 추가하고, 빠진 날짜만 삭제한다 — 통째로 지웠다 새로 올리지 않는다.
      const newDateSet = new Set(dates);
      const idByDate = new Map(originalGroup.map((g) => [g.date, g.id]));

      const toUpdate = dates.filter((d) => idByDate.has(d));
      const toInsert = dates.filter((d) => !idByDate.has(d));
      const toDelete = originalGroup.filter((g) => !newDateSet.has(g.date)).map((g) => g.id);

      const [updateResults, insertResult, deleteResult] = await Promise.all([
        Promise.all(
          toUpdate.map((d) =>
            supabase
              .from("calendar_events")
              .update({ ...basePayload, updated_at: new Date().toISOString() })
              .eq("id", idByDate.get(d)!),
          ),
        ),
        toInsert.length > 0
          ? supabase.from("calendar_events").insert(toInsert.map((d) => ({ ...basePayload, date: d })))
          : Promise.resolve({ error: null }),
        toDelete.length > 0
          ? supabase.from("calendar_events").delete().in("id", toDelete)
          : Promise.resolve({ error: null }),
      ]);
      setSaving(false);
      const failed = updateResults.some((r) => r.error) || insertResult.error || deleteResult.error;
      if (failed) {
        showToast("저장에 실패했습니다.", "error");
        return;
      }
    } else {
      const { error } = await supabase
        .from("calendar_events")
        .insert(dates.map((d) => ({ ...basePayload, date: d })));
      setSaving(false);
      if (error) {
        showToast("저장에 실패했습니다.", "error");
        return;
      }
    }

    showToast("저장되었습니다.", "success");
    onSaved();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingEvent ? "일정 수정" : "일정 추가"}
      icon={<CalendarPlus className="w-4 h-4 text-indigo-600" />}
      maxWidth="max-w-sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-60"
          >
            {saving ? "저장 중..." : "저장하기"}
          </button>
        </>
      }
    >
      {isWonseoSchedule ? (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-400">
            원서 카드에 연결된 일정은 제목·날짜를 여기서 직접 바꿀 수 없어요. 색상만 바꿀 수 있습니다.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
            <p className="font-bold text-slate-800">{title}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{date}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {allowedTypes.length > 1 && (
            <div>
              <label className="block font-bold text-slate-700 mb-1">유형</label>
              <div className="grid grid-cols-2 gap-1.5">
                {allowedTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "py-2 rounded-xl border font-bold text-xs transition",
                      type === t
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                    )}
                  >
                    {EVENT_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              제목 {titleError && <span className="text-rose-500">(필수)</span>}
            </label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(false);
              }}
              placeholder="예: 수시 원서 접수 마감"
              className={cn(
                "w-full bg-slate-50 border rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2",
                titleError
                  ? "border-rose-400 focus:ring-rose-400"
                  : "border-slate-300 focus:ring-indigo-500",
              )}
            />
          </div>

          <div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  시작일 {dateError && <span className="text-rose-500">(필수)</span>}
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (dateError) setDateError(false);
                  }}
                  className={cn(
                    "w-full bg-slate-50 border rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2",
                    dateError
                      ? "border-rose-400 focus:ring-rose-400"
                      : "border-slate-300 focus:ring-indigo-500",
                  )}
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">종료일 (선택)</label>
                <input
                  type="date"
                  value={endDate}
                  min={date || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            {date && endDate && endDate > date && (
              <p className="text-[11px] text-slate-400 mt-1">
                {dateRange(date, endDate).length}일간 이어진 일정으로 저장됩니다.
              </p>
            )}
            {editingEvent && originalGroup.length > 1 && (
              <p className="text-[11px] text-slate-400 mt-1">
                연속된 {originalGroup.length}일짜리 일정이에요. 날짜를 바꾸면 묶음 전체에 반영됩니다.
              </p>
            )}
          </div>
        </div>
      )}

      <div>
        <label className="block font-bold text-slate-700 mb-1.5">색상</label>
        <div className="flex items-center gap-2">
          {EVENT_COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              style={{ backgroundColor: c }}
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 ring-offset-2 transition"
              title={c}
            >
              {color === c && <Check className="w-3.5 h-3.5 text-white" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block font-bold text-slate-700 mb-1.5">미리보기</label>
        <span
          className="inline-block text-[11px] font-bold text-white px-2.5 py-1 rounded-lg truncate max-w-full"
          style={{ backgroundColor: color }}
        >
          {isWonseoSchedule ? title : title.trim() || "제목 미입력"}
        </span>
      </div>
    </Modal>
  );
}
