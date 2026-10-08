"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { LEVEL_EMPHASIS_STYLE } from "@/lib/wonseo-constants";
import {
  buildWonseoListRows,
  filterSortListRows,
  type WonseoListFilter,
  type WonseoListSort,
} from "@/lib/wonseo-table-data";
import { normalizeDateInput } from "@/lib/time";
import type { Roster, SupportLevel, WonseoCard } from "@/lib/database.types";

const LEVELS: SupportLevel[] = ["상향", "소신", "적정", "하향"];
const EMPTY_FILTER: WonseoListFilter = { query: "", levels: [], category: "", university: "", sort: "student" };
const SELECT_CLASS =
  "bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500";

/**
 * 교사 "전체 보기 / 접수한 원서 보기"의 원서 목록 모드: 반 학생 모두의 원서를 원서 1장 = 1줄로 나열하고 검색·지원정도·
 * 전형유형·대학으로 거르고 정렬한다. 엑셀 다운로드는 이 필터와 상관없이 반 전체를 받는다.
 */
export function WonseoListView({
  roster,
  cards,
  variant = "all",
}: {
  roster: Roster[];
  cards: WonseoCard[];
  /** "submitted"면 접수 표시(is_submitted)된 카드만, 지망·수험번호·날짜 열을 더해 보여준다. */
  variant?: "all" | "submitted";
}) {
  const [filter, setFilter] = useState<WonseoListFilter>(EMPTY_FILTER);
  const submitted = variant === "submitted";
  const rows = useMemo(() => buildWonseoListRows(roster, cards, variant), [roster, cards, variant]);
  const shown = useMemo(() => filterSortListRows(rows, filter), [rows, filter]);
  const categories = useMemo(() => uniqueSorted(rows.map((r) => r.card.category)), [rows]);
  const universities = useMemo(() => uniqueSorted(rows.map((r) => r.card.university)), [rows]);
  const set = (patch: Partial<WonseoListFilter>) => setFilter((f) => ({ ...f, ...patch }));
  const filtered = JSON.stringify(filter) !== JSON.stringify(EMPTY_FILTER);

  if (rows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-xs font-semibold text-slate-500">
          {submitted ? "접수 표시된 원서가 없습니다." : "등록된 원서 카드가 없습니다."}
        </p>
      </div>
    );
  }

  const headers = [
    "학생",
    ...(submitted ? ["지망"] : []),
    "지원정도",
    "지망대학",
    "학과",
    "전형유형",
    "세부전형명",
    ...(submitted ? ["수험번호", "날짜"] : []),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={filter.query}
            onChange={(e) => set({ query: e.target.value })}
            placeholder="이름·학번·대학·학과 검색"
            aria-label="검색"
            className={cn(SELECT_CLASS, "w-56 pl-8 font-normal")}
          />
        </label>
        <div className="flex gap-1" role="group" aria-label="지원정도">
          {LEVELS.map((level) => {
            const on = filter.levels.includes(level);
            return (
              <button
                key={level}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set({ levels: on ? filter.levels.filter((l) => l !== level) : [...filter.levels, level] })
                }
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-bold transition",
                  on
                    ? LEVEL_EMPHASIS_STYLE[level].badge
                    : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300",
                )}
              >
                {level}
              </button>
            );
          })}
        </div>
        <select
          value={filter.category}
          onChange={(e) => set({ category: e.target.value })}
          aria-label="전형유형"
          className={SELECT_CLASS}
        >
          <option value="">전형유형 전체</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filter.university}
          onChange={(e) => set({ university: e.target.value })}
          aria-label="대학"
          className={SELECT_CLASS}
        >
          <option value="">대학 전체</option>
          {universities.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <select
          value={filter.sort}
          onChange={(e) => set({ sort: e.target.value as WonseoListSort })}
          aria-label="정렬"
          className={SELECT_CLASS}
        >
          <option value="student">학번순</option>
          <option value="university">대학순</option>
          <option value="department">학과순</option>
          <option value="level">지원정도순</option>
          {submitted && <option value="date">날짜순</option>}
        </select>
        <span className="ml-auto text-xs text-slate-500">
          <b className="text-slate-800">{shown.length}</b>건 / 전체 {rows.length}건
        </span>
        {filtered && (
          <button
            type="button"
            onClick={() => setFilter(EMPTY_FILTER)}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-white hover:text-slate-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            초기화
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="text-center py-12 text-xs font-semibold text-slate-500">조건에 맞는 원서가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="text-xs border-collapse w-full min-w-[760px]">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="bg-slate-900 text-white font-bold px-3 py-2.5 text-left whitespace-nowrap sticky top-0"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const { card } = row;
                return (
                  <tr key={card.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap font-bold text-slate-800">
                      <span className="text-slate-400 font-semibold mr-1.5">{row.studentId}</span>
                      {row.name}
                    </td>
                    {submitted && (
                      <td className="px-3 py-2 whitespace-nowrap text-slate-700">{row.submittedRank}지망</td>
                    )}
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-block px-2 py-0.5 rounded-md font-bold",
                          LEVEL_EMPHASIS_STYLE[card.level].badge,
                        )}
                      >
                        {card.level}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-800 font-semibold">{card.university || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{card.department || "-"}</td>
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{card.category || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{card.sub_category || "-"}</td>
                    {submitted && (
                      <>
                        <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{card.application_number || "-"}</td>
                        <td className="px-3 py-2 text-slate-700">
                          {(card.schedule_events ?? [])
                            .map((e) => [e.label, normalizeDateInput(e.date)].filter(Boolean).join(" "))
                            .filter(Boolean)
                            .join(", ") || "-"}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v?.trim())))].sort((a, b) => a.localeCompare(b, "ko"));
}
