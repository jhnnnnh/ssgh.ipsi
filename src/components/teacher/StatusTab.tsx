"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  CalendarX,
  FileDown,
  History,
  Pencil,
  Settings,
  SquarePlus,
  Star,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useCounselingSlots } from "@/lib/hooks/useCounselingSlots";
import { useFavorites } from "@/lib/hooks/useFavorites";
import { useEqualHeights } from "@/lib/hooks/useEqualHeights";
import { useActiveClass } from "@/components/providers/ActiveClassProvider";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { useConfirm } from "@/components/providers/ConfirmProvider";
import { DateTabs } from "@/components/ui/DateTabs";
import { EditSlotModal } from "@/components/teacher/EditSlotModal";
import { Card } from "@/components/ui/Card";
import { AddDateModal } from "@/components/teacher/AddDateModal";
import { FavoritesSettingsModal } from "@/components/teacher/FavoritesSettingsModal";
import { downloadCsv } from "@/lib/csv";
import {
  autoFormatTime,
  addMinutesToTime,
  compareSlotsForDisplay,
  formatSlotDisplay,
  formatTime,
  isValidTime,
  isWeekendDate,
  timeRangesOverlap,
  todayDateString,
} from "@/lib/time";
import type { CounselingSlot } from "@/lib/database.types";

const COMPACT_FIELD_CLASS =
  "w-20 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const COMPACT_BUTTON_CLASS =
  "px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition shadow-xs flex items-center gap-1.5";

const RESERVE_LABELS = ["예비1", "예비2", "예비3"] as const;

function findOverlap(existing: CounselingSlot[], date: string, start: string, end: string) {
  return existing.find(
    (s) =>
      s.date === date &&
      s.start_time != null &&
      s.end_time != null &&
      timeRangesOverlap(start, end, formatTime(s.start_time), formatTime(s.end_time)),
  );
}

export function StatusTab() {
  const { grade, classNo } = useActiveClass();
  const { slots, reload } = useCounselingSlots(
    grade != null && classNo != null ? { grade, classNo } : null,
  );
  const { favorites, reload: reloadFavorites } = useFavorites();
  const showToast = useToast();
  const confirm = useConfirm();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [extraDates, setExtraDates] = useState<string[]>([]);
  const [showPastDates, setShowPastDates] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [editingSlot, setEditingSlot] = useState<CounselingSlot | null>(null);
  const [addDateModalOpen, setAddDateModalOpen] = useState(false);
  const [favoritesModalOpen, setFavoritesModalOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [endTouched, setEndTouched] = useState(false);
  const [favoriteOverride, setFavoriteOverride] = useState<"weekday" | "weekend" | null>(null);

  const allDates = useMemo(
    () => Array.from(new Set([...slots.map((s) => s.date), ...extraDates])).sort(),
    [slots, extraDates],
  );
  const today = todayDateString();
  const visibleDates = useMemo(
    () => (showPastDates ? allDates : allDates.filter((d) => d >= today)),
    [allDates, showPastDates, today],
  );

  const defaultDate = useMemo(() => {
    if (visibleDates.length === 0) return null;
    if (visibleDates.includes(today)) return today;
    const todayMs = new Date(`${today}T00:00:00`).getTime();
    return visibleDates.reduce((closest, d) => {
      const diff = Math.abs(new Date(`${d}T00:00:00`).getTime() - todayMs);
      const closestDiff = Math.abs(new Date(`${closest}T00:00:00`).getTime() - todayMs);
      return diff < closestDiff ? d : closest;
    }, visibleDates[0]);
  }, [visibleDates, today]);

  const activeDate = selectedDate ?? defaultDate;

  const daySlots = useMemo(
    () =>
      slots
        .filter((s) => s.date === activeDate)
        .sort(compareSlotsForDisplay),
    [slots, activeDate],
  );

  const { setRef: setSlotCardRef, maxHeight: slotCardHeight } = useEqualHeights(
    daySlots.map((s) => s.id).join("|"),
    daySlots.length,
  );

  const autoFavoriteCategory = activeDate ? (isWeekendDate(activeDate) ? "weekend" : "weekday") : "weekday";
  const activeFavoriteCategory = favoriteOverride ?? autoFavoriteCategory;
  const visibleFavorites = useMemo(
    () => favorites.filter((f) => f.category === activeFavoriteCategory),
    [favorites, activeFavoriteCategory],
  );

  // 날짜를 바꾸면 그 날짜의 요일에 맞는 즐겨찾기로 다시 자동 전환한다.
  // (직접 고른 평일/휴일 선택은 같은 날짜를 보는 동안에만 유지된다.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFavoriteOverride(null);
  }, [activeDate]);

  function handleStartChange(value: string) {
    const formatted = autoFormatTime(value);
    setStart(formatted);
    if (!endTouched && isValidTime(formatted)) {
      setEnd(addMinutesToTime(formatted, 60));
    }
  }
  function handleEndChange(value: string) {
    setEndTouched(true);
    setEnd(autoFormatTime(value));
  }

  function handleAddDate(date: string) {
    setExtraDates((prev) => (prev.includes(date) ? prev : [...prev, date]));
    setSelectedDate(date);
  }

  async function createNewSlot() {
    if (grade == null || classNo == null) {
      showToast("반 정보를 확인할 수 없습니다.", "error");
      return;
    }
    if (!activeDate) {
      showToast("먼저 날짜를 선택하거나 추가해 주세요.", "error");
      return;
    }
    if (!isValidTime(start) || !isValidTime(end)) {
      showToast("시작/종료 시간을 HH:MM 형식으로 입력해 주세요.", "error");
      return;
    }
    if (start >= end) {
      showToast("종료 시간은 시작 시간보다 늦어야 합니다.", "error");
      return;
    }
    const conflict = findOverlap(slots, activeDate, start, end);
    if (conflict) {
      showToast(
        `이미 ${formatTime(conflict.start_time!)}~${formatTime(conflict.end_time!)} 슬롯과 시간이 겹쳐서 추가할 수 없습니다.`,
        "error",
      );
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("counseling_slots")
      .insert({ date: activeDate, start_time: start, end_time: end, grade, class_no: classNo });
    if (error) {
      showToast("슬롯 생성에 실패했습니다.", "error");
      return;
    }
    showToast("상담 슬롯이 추가되었습니다.", "success");
    setStart("");
    setEnd("");
    setEndTouched(false);
  }

  async function addSingleFavorite(f: { start_time: string; end_time: string }) {
    if (grade == null || classNo == null) {
      showToast("반 정보를 확인할 수 없습니다.", "error");
      return;
    }
    if (!activeDate) {
      showToast("먼저 날짜를 선택하거나 추가해 주세요.", "error");
      return;
    }
    const start_time = formatTime(f.start_time);
    const end_time = formatTime(f.end_time);
    const conflict = findOverlap(slots, activeDate, start_time, end_time);
    if (conflict) {
      showToast(
        `이미 ${formatTime(conflict.start_time!)}~${formatTime(conflict.end_time!)} 슬롯과 시간이 겹쳐서 추가할 수 없습니다.`,
        "error",
      );
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("counseling_slots")
      .insert({ date: activeDate, start_time, end_time, grade, class_no: classNo });
    if (error) {
      showToast("슬롯 생성에 실패했습니다.", "error");
      return;
    }
    showToast("상담 슬롯이 추가되었습니다.", "success");
  }

  /** 정해진 시각 없이 "예비1/예비2/예비3"처럼 이름만 있는 슬롯을 추가한다 — 정규 시간
   * 슬롯이 다 찬 뒤에도 순번만 정해 두고 나중에 시간을 조율할 때 쓴다. */
  async function createLabelSlot(label: string) {
    if (grade == null || classNo == null) {
      showToast("반 정보를 확인할 수 없습니다.", "error");
      return;
    }
    if (!activeDate) {
      showToast("먼저 날짜를 선택하거나 추가해 주세요.", "error");
      return;
    }
    if (daySlots.some((s) => s.label === label)) {
      showToast(`이미 ${label} 슬롯이 있습니다.`, "error");
      return;
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("counseling_slots")
      .insert({ date: activeDate, label, grade, class_no: classNo });
    if (error) {
      showToast("슬롯 생성에 실패했습니다.", "error");
      return;
    }
    showToast(`${label} 슬롯이 추가되었습니다.`, "success");
  }

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleCheckAll(checkedAll: boolean) {
    setChecked(checkedAll ? new Set(daySlots.map((s) => s.id)) : new Set());
  }

  async function deleteSelected() {
    if (checked.size === 0) {
      showToast("삭제할 슬롯을 선택해 주세요.", "error");
      return;
    }
    const ok = await confirm({
      message: `선택한 ${checked.size}개 슬롯을 삭제하시겠습니까? (예약 내역도 함께 삭제됩니다)`,
      confirmLabel: "삭제",
      danger: true,
    });
    if (!ok) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("counseling_slots")
      .delete()
      .in("id", Array.from(checked));
    if (error) {
      showToast("삭제에 실패했습니다.", "error");
      return;
    }
    showToast("삭제되었습니다.", "success");
    setChecked(new Set());
  }

  async function deleteOne(id: string) {
    const ok = await confirm({ message: "이 슬롯을 삭제하시겠습니까?", danger: true });
    if (!ok) return;
    const supabase = createClient();
    await supabase.from("counseling_slots").delete().eq("id", id);
    showToast("삭제되었습니다.", "success");
  }

  function exportCsv() {
    const sorted = [...slots].sort((a, b) => (a.date === b.date ? compareSlotsForDisplay(a, b) : a.date.localeCompare(b.date)));
    const rows: (string | number)[][] = [
      ["날짜", "시작", "종료", "상태", "학번", "이름", "신청일시", "메모"],
      ...sorted.map((s) => [
        s.date,
        s.label ?? formatTime(s.start_time!),
        s.label ? "" : formatTime(s.end_time!),
        s.is_booked ? "예약됨" : "가능",
        s.student_id ?? "",
        s.student_name ?? "",
        s.booked_at ? new Date(s.booked_at).toLocaleString("ko-KR") : "",
        s.memo ?? "",
      ]),
    ];
    downloadCsv(`상담현황_전체기간.csv`, rows);
  }

  const allChecked = daySlots.length > 0 && daySlots.every((s) => checked.has(s.id));

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="space-y-2">
          <div className="overflow-x-auto pb-1 -mx-1 px-1">
            <DateTabs dates={visibleDates} selected={activeDate} onSelect={setSelectedDate} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setAddDateModalOpen(true)}
              className="shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition whitespace-nowrap bg-white text-slate-600 border-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              <span>날짜 추가</span>
            </button>
            <button
              onClick={() => setShowPastDates((v) => !v)}
              className={cn(
                "shrink-0 px-4 py-2 rounded-xl text-sm font-bold border transition whitespace-nowrap flex items-center gap-1.5",
                showPastDates
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >
              <History className="w-3.5 h-3.5" />
              <span>지난 날짜 보기</span>
            </button>
          </div>
        </div>

        <div className="bg-indigo-50/60 border border-indigo-200/70 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={start}
              onChange={(e) => handleStartChange(e.target.value)}
              placeholder="13:00"
              className={COMPACT_FIELD_CLASS}
            />
            <span className="text-slate-400 text-xs font-bold">~</span>
            <input
              value={end}
              onChange={(e) => handleEndChange(e.target.value)}
              placeholder="13:30"
              className={COMPACT_FIELD_CLASS}
            />
            <button onClick={createNewSlot} className={COMPACT_BUTTON_CLASS}>
              <SquarePlus className="w-3.5 h-3.5" />
              <span>직접 추가</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-indigo-700 shrink-0">예비 슬롯</span>
            {RESERVE_LABELS.map((label) => {
              const exists = daySlots.some((s) => s.label === label);
              return (
                <button
                  key={label}
                  onClick={() => createLabelSlot(label)}
                  disabled={exists}
                  className="shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap bg-white text-slate-700 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-white"
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="border-t border-dashed border-indigo-200" />

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-bold text-indigo-700 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                <span>즐겨찾기</span>
              </span>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-white border border-indigo-200 rounded-xl p-0.5 text-[11px] font-bold">
                  {(
                    [
                      { key: "weekday", label: "평일" },
                      { key: "weekend", label: "휴일" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setFavoriteOverride(opt.key)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg transition",
                        activeFavoriteCategory === opt.key
                          ? "bg-indigo-600 text-white"
                          : "text-slate-500 hover:text-slate-700",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setFavoritesModalOpen(true)}
                  className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 underline flex items-center gap-1 shrink-0"
                >
                  <Settings className="w-3 h-3" />
                  <span>설정</span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {visibleFavorites.length === 0 && (
                <p className="text-[11px] text-slate-400">
                  등록된 즐겨찾기가 없습니다. &ldquo;설정&rdquo;에서 추가해 보세요.
                </p>
              )}
              {visibleFavorites.map((f) => (
                <button
                  key={f.id}
                  onClick={() => addSingleFavorite(f)}
                  title="클릭하면 이 시간대로 슬롯이 바로 추가됩니다"
                  className="shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold border transition whitespace-nowrap bg-white text-slate-700 border-slate-200 hover:border-indigo-400 hover:bg-indigo-50"
                >
                  {formatTime(f.start_time)}~{formatTime(f.end_time)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {daySlots.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <button
              onClick={() => toggleCheckAll(!allChecked)}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-bold transition flex items-center gap-1.5"
            >
              <span>{allChecked ? "전체 선택 해제" : "전체 선택"}</span>
            </button>
            <button
              onClick={deleteSelected}
              className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-sm font-bold transition flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>선택 삭제</span>
            </button>
            <button
              onClick={exportCsv}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>엑셀 일괄 다운로드</span>
            </button>
          </div>
        )}

        {daySlots.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pt-2">
            {daySlots.map((s, index) => (
              <div
                key={s.id}
                ref={setSlotCardRef(index)}
                style={slotCardHeight ? { minHeight: slotCardHeight } : undefined}
                className={cn(
                  "rounded-2xl border p-4 flex flex-col gap-2.5",
                  s.is_booked
                    ? "bg-indigo-50 border-indigo-300"
                    : "bg-white border-slate-200",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <label className="flex items-center gap-2 flex-wrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked.has(s.id)}
                      onChange={() => toggleCheck(s.id)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-lg font-bold text-slate-900">{formatSlotDisplay(s)}</span>
                    {s.is_booked && (
                      <span className="whitespace-nowrap text-[11px] font-bold emphasis-title bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                        {s.student_id} {s.student_name}
                      </span>
                    )}
                  </label>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setEditingSlot(s)}
                      className="text-slate-400 hover:text-indigo-600"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteOne(s.id)}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {s.is_booked ? (
                  s.booked_at && (
                    <p className="text-[11px] text-slate-400 font-semibold">
                      신청일시: {new Date(s.booked_at).toLocaleString("ko-KR")}
                    </p>
                  )
                ) : (
                  <span className="text-[11px] font-bold text-slate-400 bg-slate-100 inline-block px-2 py-0.5 rounded-full w-fit">
                    신청 가능
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {daySlots.length === 0 && (
          <div className="text-center py-12">
            <div className="w-12 h-12 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-2">
              <CalendarX className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-slate-500">
              선택된 날짜에 등록된 상담 슬롯이 없거나 내역이 없습니다.
            </p>
          </div>
        )}
      </Card>

      <EditSlotModal slot={editingSlot} onClose={() => setEditingSlot(null)} onSaved={reload} />
      <AddDateModal
        open={addDateModalOpen}
        onClose={() => setAddDateModalOpen(false)}
        onAdd={handleAddDate}
      />
      <FavoritesSettingsModal
        open={favoritesModalOpen}
        onClose={() => setFavoritesModalOpen(false)}
        favorites={favorites}
        reload={reloadFavorites}
      />
    </div>
  );
}
