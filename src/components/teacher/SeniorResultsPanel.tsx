"use client";

import { useMemo, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import type { SchoolAdmissionResult } from "@/lib/database.types";
import { findSeniorPrograms } from "@/lib/grade-overview";

type Row = Pick<
  SchoolAdmissionResult,
  "university" | "department" | "admission_type" | "track" | "final_stage" | "gpa" | "result_year"
>;

const RANGES = [0.2, 0.3, 0.5];
const MAX_SHOWN = 60;

/** 관리자 테스트: 내신 등급을 넣으면 비슷한 등급의 우리 학교 선배들이 지원한 곳과 합불을 보여 준다. */
export function SeniorResultsPanel({ results }: { results: Row[] }) {
  const years = useMemo(() => [...new Set(results.map((r) => r.result_year))].sort((a, b) => b - a), [results]);
  const tracks = useMemo(
    () => [...new Set(results.map((r) => r.track).filter((t): t is string => Boolean(t)))].sort(),
    [results],
  );
  const [gpaText, setGpaText] = useState("");
  const [range, setRange] = useState(0.3);
  const [track, setTrack] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [onlyAdmitted, setOnlyAdmitted] = useState(false);

  const gpa = Number.parseFloat(gpaText);
  const activeYear = year ?? years[0] ?? null;
  const programs = useMemo(() => {
    if (!Number.isFinite(gpa)) return [];
    const list = findSeniorPrograms(
      results.filter((r) => r.result_year === activeYear),
      gpa,
      range,
      track || null,
    );
    return onlyAdmitted ? list.filter((p) => p.admitted.length > 0) : list;
  }, [results, activeYear, gpa, range, track, onlyAdmitted]);

  const selectClass = "rounded-lg border border-slate-200 px-2 py-1 text-sm font-normal text-slate-800";

  return (
    <section className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
          <MapIcon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900">내 등급대 선배 합격 지도</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            전교과 등급을 넣으면 비슷한 등급의 우리 학교 선배들이 지원한 대학·학과·전형과 합불을 보여 줍니다(충원 합격
            포함).
          </p>
        </div>
      </div>

      {years.length === 0 ? (
        <p className="text-sm text-slate-400">데이터 관리 탭에서 우리 학교 수시 결과를 먼저 올려 주세요.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              전교과 등급
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="1"
                max="9"
                placeholder="예: 3.2"
                value={gpaText}
                onChange={(e) => setGpaText(e.target.value)}
                className={`${selectClass} w-24`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              범위
              <select value={range} onChange={(e) => setRange(Number(e.target.value))} className={selectClass}>
                {RANGES.map((r) => (
                  <option key={r} value={r}>
                    ±{r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
              계열
              <select value={track} onChange={(e) => setTrack(e.target.value)} className={selectClass}>
                <option value="">전체</option>
                {tracks.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            {years.length > 1 && (
              <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
                연도
                <select
                  value={activeYear ?? ""}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className={selectClass}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1.5 pb-1.5 text-xs font-bold text-slate-600">
              <input type="checkbox" checked={onlyAdmitted} onChange={(e) => setOnlyAdmitted(e.target.checked)} />
              합격자 있는 곳만
            </label>
          </div>

          {!Number.isFinite(gpa) ? (
            <p className="text-sm text-slate-400">등급을 입력해 주세요.</p>
          ) : programs.length === 0 ? (
            <p className="text-sm text-slate-400">이 등급대의 선배 지원 기록이 없습니다.</p>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                {activeYear}년 · {gpa.toFixed(2)}±{range}등급 · {programs.length}곳
                {programs.length > MAX_SHOWN && ` (합격이 많은 순 상위 ${MAX_SHOWN}곳만 표시)`}
              </p>
              <ul className="divide-y divide-slate-100">
                {programs.slice(0, MAX_SHOWN).map((p) => (
                  <li
                    key={`${p.university}|${p.department}|${p.admissionType}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                  >
                    <span className="font-bold text-slate-800">
                      {p.university} {p.department}
                    </span>
                    <span className="text-xs text-slate-500">{p.admissionType}</span>
                    <span className="ml-auto flex gap-1.5 text-xs">
                      {p.admitted.length > 0 && (
                        <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 font-bold">
                          합격 {p.admitted.length} ({p.admitted.map((g) => g.toFixed(2)).join(", ")})
                        </span>
                      )}
                      {p.rejected.length > 0 && (
                        <span className="rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 font-bold">
                          불합격 {p.rejected.length} ({p.rejected.map((g) => g.toFixed(2)).join(", ")})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
