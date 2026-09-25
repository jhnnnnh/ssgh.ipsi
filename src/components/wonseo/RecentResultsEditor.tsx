"use client";

import { Plus, Search, X } from "lucide-react";
import { RESULT_ROWS, emptyResultYear } from "@/components/wonseo/RecentResultsTable";
import type { RecentResultYear } from "@/lib/database.types";

/** 카드 수정 모달 안에서 쓰는 편집 가능한 최근 입결 표. 저장은 모달의 "저장하기"가 담당한다. */
export function RecentResultsEditor({
  years,
  onChange,
  onFindSimilar,
  findingSimilar,
  sourceNote,
}: {
  years: RecentResultYear[];
  onChange: (next: RecentResultYear[]) => void;
  /** 표가 비어 있을 때 "비슷한 학과 입결 찾기"를 누르면 호출된다(없으면 버튼 자체를 안 보여준다). */
  onFindSimilar?: () => void;
  findingSimilar?: boolean;
  /** 다른 학과 데이터를 참고용으로 불러왔을 때, 어디서 왔는지 표 아래에 남기는 안내(이번 편집 세션 동안만 유지됨). */
  sourceNote?: string | null;
}) {
  function updateCell(index: number, key: keyof RecentResultYear, value: string) {
    onChange(years.map((y, i) => (i === index ? { ...y, [key]: value } : y)));
  }

  function addYear() {
    const oldestYear = years[years.length - 1]?.year;
    const guess = oldestYear ? String(Number(oldestYear) - 1 || "") : String(new Date().getFullYear());
    onChange([...years, emptyResultYear(guess)]);
  }

  function removeYear(index: number) {
    onChange(years.filter((_, i) => i !== index));
  }

  // 새 카드는 항상 연도 칸 3개가 기본으로 깔려 있어서(값은 비어 있음), "표에 실제 데이터가
  // 있는지"는 칸 개수가 아니라 셀 값으로 판단해야 "비슷한 학과 입결 찾기"가 뜬다.
  const hasData = years.some((y) => y.enrollment || y.competitionRate || y.fillCount || y.cut50 || y.cut70);

  const findSimilarButton = onFindSimilar && (
    <button
      type="button"
      onClick={onFindSimilar}
      disabled={findingSimilar}
      className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition disabled:opacity-60"
    >
      <Search className="w-3 h-3" />
      {findingSimilar ? "찾는 중..." : "비슷한 학과 입결 찾기"}
    </button>
  );

  return (
    <div className="space-y-2 border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between">
        <label className="block font-bold text-slate-700">최근 입결</label>
        <button
          type="button"
          onClick={addYear}
          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          연도 추가
        </button>
      </div>

      {years.length === 0 ? (
        <div className="text-center py-3 bg-slate-50 rounded-xl space-y-2">
          <p className="text-xs text-slate-400">등록된 입결 정보가 없습니다. 연도를 추가해 주세요.</p>
          {findSimilarButton}
        </div>
      ) : (
        <div className="overflow-x-auto">
          {!hasData && findSimilarButton && <div className="mb-1.5">{findSimilarButton}</div>}
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                <th className="text-left p-1.5 sticky left-0 bg-white" />
                {years.map((y, i) => (
                  <th key={i} className="p-1.5">
                    <div className="flex items-center gap-1">
                      <input
                        value={y.year}
                        onChange={(e) => updateCell(i, "year", e.target.value)}
                        placeholder="연도"
                        className="w-14 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-center font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                      <button
                        type="button"
                        onClick={() => removeYear(i)}
                        className="text-slate-300 hover:text-rose-500 shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RESULT_ROWS.map((row) => (
                <tr key={row.key} className="border-t border-slate-100">
                  <td className="text-slate-500 font-bold p-1.5 whitespace-nowrap sticky left-0 bg-white">
                    {row.label}
                  </td>
                  {years.map((y, i) => (
                    <td key={i} className="p-1.5">
                      <input
                        value={y[row.key]}
                        onChange={(e) => updateCell(i, row.key, e.target.value)}
                        className="w-16 bg-slate-50 border border-slate-200 rounded px-1 py-0.5 text-center text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sourceNote && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
          참고용: {sourceNote}
        </p>
      )}
    </div>
  );
}
