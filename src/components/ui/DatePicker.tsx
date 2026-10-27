"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { getMonthGridCells, toDateString } from "@/lib/calendar-grid";
import { normalizeDateInput } from "@/lib/time";
import { cn } from "@/lib/cn";

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && toDateString(date) === value;
}

export function CalendarPicker({ value, onChange, min, className, label }: {
  value: string;
  onChange: (date: string) => void;
  min?: string;
  className?: string;
  label?: string;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [month, setMonth] = useState(() => {
    const initial = validDate(value) ? value : min && validDate(min) ? min : "";
    const date = initial ? new Date(`${initial}T00:00:00`) : new Date();
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  });

  const positionPopup = useCallback(() => {
    const popup = popupRef.current;
    const rect = (triggerRef.current?.closest("[data-date-field]") ?? triggerRef.current)?.getBoundingClientRect();
    if (!popup || !rect || !popup.matches(":popover-open")) return;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    popup.style.maxHeight = `${Math.max(120, height - 16)}px`;
    const popupWidth = popup.offsetWidth;
    const popupHeight = popup.offsetHeight;
    popup.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - popupWidth - 8))}px`;
    popup.style.top = `${rect.bottom + popupHeight + 12 <= top + height ? rect.bottom + 4 : Math.max(top + 8, Math.min(rect.top - popupHeight - 4, top + height - popupHeight - 8))}px`;
  }, []);

  useEffect(() => {
    const closeOnScroll = (event: Event) => {
      const popup = popupRef.current;
      if (popup?.matches(":popover-open") && !(event.target instanceof Node && popup.contains(event.target))) popup.hidePopover();
    };
    window.addEventListener("resize", positionPopup);
    window.visualViewport?.addEventListener("resize", positionPopup);
    window.visualViewport?.addEventListener("scroll", positionPopup);
    document.addEventListener("scroll", closeOnScroll, true);
    return () => {
      window.removeEventListener("resize", positionPopup);
      window.visualViewport?.removeEventListener("resize", positionPopup);
      window.visualViewport?.removeEventListener("scroll", positionPopup);
      document.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [positionPopup]);

  function open() {
    const popup = popupRef.current;
    if (!popup || !triggerRef.current) return;
    if (popup.matches(":popover-open")) { popup.hidePopover(); return; }
    const initial = validDate(value) ? value : min && validDate(min) ? min : "";
    const date = initial ? new Date(`${initial}T00:00:00`) : new Date();
    setMonth({ year: date.getFullYear(), month: date.getMonth() + 1 });
    popup.showPopover();
    positionPopup();
  }

  function moveMonth(amount: number) {
    const date = new Date(month.year, month.month - 1 + amount, 1);
    setMonth({ year: date.getFullYear(), month: date.getMonth() + 1 });
  }

  const today = toDateString(new Date());
  return (
    <span className="inline-block" onKeyDown={(e) => {
      if (e.key === "Escape" && popupRef.current?.matches(":popover-open")) { e.stopPropagation(); e.preventDefault(); popupRef.current.hidePopover(); }
    }}>
      <button ref={triggerRef} type="button" onClick={open} aria-label={label ?? "달력 열기"} className={className}>
        {label ? <><CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" /><span>{label}</span></> : <CalendarDays className="w-4 h-4" aria-hidden="true" />}
      </button>
      <div ref={popupRef} popover="auto" role="dialog" aria-label="날짜 선택 달력" style={{ right: "auto", bottom: "auto" }} onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}
        className="fixed m-0 w-72 max-w-[calc(100vw-16px)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl text-slate-800">
        <div className="flex items-center justify-between mb-2">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달" className="p-2 rounded-lg hover:bg-slate-100"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-bold" aria-live="polite">{month.year}년 {month.month}월</span>
          <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달" className="p-2 rounded-lg hover:bg-slate-100"><ChevronRight className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs font-semibold">
          {["일", "월", "화", "수", "목", "금", "토"].map((day, i) => <span key={day} className={cn("py-2", i === 0 || i === 6 ? "text-slate-400" : "text-slate-600")}>{day}</span>)}
          {getMonthGridCells(month.year, month.month).map((day) => (
            <button key={day.dateStr} type="button" disabled={!!min && day.dateStr < min}
              aria-label={day.dateStr} aria-pressed={day.dateStr === value} aria-current={day.dateStr === today ? "date" : undefined}
              onClick={() => { onChange(day.dateStr); popupRef.current?.hidePopover(); }}
              className={cn("h-9 rounded-lg text-sm hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed", day.dateStr === value ? "bg-indigo-600 text-white hover:bg-indigo-600 font-bold" : day.dateStr === today ? "text-indigo-600 font-bold" : !day.inMonth ? "text-slate-300" : day.dayOfWeek === 0 || day.dayOfWeek === 6 ? "text-slate-400" : "text-slate-800")}>{day.day}</button>
          ))}
        </div>
      </div>
    </span>
  );
}

export function DatePicker({ value, onChange, min, label, className }: {
  value: string;
  onChange: (date: string) => void;
  min?: string;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  function commit(raw: string) {
    const normalized = normalizeDateInput(raw);
    if (!normalized || (validDate(normalized) && (!min || normalized >= min))) onChange(normalized);
    setDraft(null);
  }
  return (
    <div ref={containerRef} data-date-field className={cn("flex items-center gap-1", className)} onKeyDownCapture={(e) => {
      const popup = containerRef.current?.querySelector<HTMLElement>("[popover]");
      if (e.key === "Escape" && popup?.matches(":popover-open")) { e.stopPropagation(); e.preventDefault(); popup.hidePopover(); }
    }}>
      <input type="text" inputMode="numeric" aria-label={label} placeholder="YYYY-MM-DD" value={draft ?? value}
        onClick={() => containerRef.current?.querySelector<HTMLButtonElement>('button[aria-label="달력 열기"]')?.click()}
        onChange={(e) => setDraft(e.target.value)} onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        className="min-w-0 w-full bg-transparent focus:outline-none" />
      <CalendarPicker value={value} min={min} onChange={(date) => { setDraft(null); onChange(date); }} className="shrink-0 text-slate-500 hover:text-indigo-600" />
    </div>
  );
}
