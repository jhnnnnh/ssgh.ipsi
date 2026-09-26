"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AdminWonseoOverviewRow, SchoolAdmissionResult } from "@/lib/database.types";
import { findRiskyStudents, groupByProgram, summarizePastResults, type StudentCard } from "@/lib/grade-overview";
import { fetchAllRows } from "@/lib/school-results-excel";
import { MinimumCheckPanel } from "@/components/teacher/MinimumCheckPanel";
import { SeniorResultsPanel } from "@/components/teacher/SeniorResultsPanel";

type PastRow = Pick<
  SchoolAdmissionResult,
  "university" | "department" | "admission_type" | "track" | "final_stage" | "gpa" | "result_year"
>;

const VIEWS = [
  { key: "overview", label: "지원 현황" },
  { key: "minimum", label: "수능최저 판정" },
  { key: "seniors", label: "선배 합격 지도" },
] as const;

/** 관리자 모드 전용(테스트): 학년 전체 원서 지원 현황·교내 겹침·원서 조합 위험 학생, 수능최저 판정, 선배 합격 지도. */
export function GradeOverviewTab() {
  const [rows, setRows] = useState<AdminWonseoOverviewRow[] | null>(null);
  const [past, setPast] = useState<PastRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [grade, setGrade] = useState<number | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [view, setView] = useState<(typeof VIEWS)[number]["key"]>("overview");

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const [overview, results] = await Promise.all([
        fetchAllRows<AdminWonseoOverviewRow>((from, to) =>
          supabase.rpc("admin_wonseo_overview").order("student_id").order("card_id").range(from, to),
        ).then(
          (data) => ({ data, error: null }),
          (error: unknown) => ({ data: null, error }),
        ),
        fetchAllRows<PastRow>((from, to) =>
          supabase
            .from("school_admission_results")
            .select("university, department, admission_type, track, final_stage, gpa, result_year")
            .order("id")
            .range(from, to),
        ).catch(() => []),
      ]);
      if (overview.error) {
        setError("학년 현황을 불러오지 못했습니다.");
        return;
      }
      setRows(overview.data ?? []);
      setPast(results);
    })();
  }, []);

  const grades = useMemo(() => [...new Set((rows ?? []).map((r) => r.grade))].sort(), [rows]);
  const activeGrade = grade ?? grades.at(-1) ?? null;
  const gradeRows = useMemo(() => (rows ?? []).filter((r) => r.grade === activeGrade), [rows, activeGrade]);

  const cards = useMemo(
    () => gradeRows.filter((r): r is StudentCard => Boolean(r.card_id && r.university?.trim())),
    [gradeRows],
  );
  const programs = useMemo(() => groupByProgram(cards), [cards]);
  const risky = useMemo(() => findRiskyStudents(gradeRows), [gradeRows]);
  const pastYear = useMemo(() => Math.max(0, ...past.map((p) => p.result_year)), [past]);
  const pastSummary = useMemo(
    () => summarizePastResults(past.filter((p) => p.result_year === pastYear)),
    [past, pastYear],
  );

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (rows == null) return <p className="text-sm text-slate-400">불러오는 중...</p>;

  const studentsWithCards = new Set(cards.map((c) => c.student_id)).size;
  const studentCount = new Set(gradeRows.map((r) => r.student_id)).size;
  const shownPrograms = onlyFlagged
    ? programs.filter((p) => p.overlappingCategories.length > 0 || p.recommendationCategories.length > 0)
    : programs;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {grades.length > 1 && (
          <select
            value={activeGrade ?? ""}
            onChange={(e) => setGrade(Number(e.target.value))}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-800"
            aria-label="학년 선택"
          >
            {grades.map((g) => (
              <option key={g} value={g}>
                {g}학년
              </option>
            ))}
          </select>
        )}
        <span>
          원서 카드를 만든 학생 <b className="text-slate-800">{studentsWithCards}</b> / {studentCount}명 · 카드{" "}
          <b className="text-slate-800">{cards.length}</b>장
        </span>
        <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 font-bold">관리자 테스트 기능</span>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="학년 현황 보기">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            onClick={() => setView(v.key)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${
              view === v.key
                ? "bg-indigo-600 text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-300"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "minimum" && <MinimumCheckPanel rows={gradeRows} />}
      {view === "seniors" && <SeniorResultsPanel results={past} />}

      {view === "overview" && (
        <>
          <section className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">원서 조합 점검이 필요한 학생</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  환산 등급과 최근 입결 70% 컷을 비교해 상향·적정·안정으로 나눕니다(입결이 없으면 카드에 고른 지원
                  수준을 씁니다). 접수한 원서가 있으면 접수한 원서만 봅니다.
                </p>
              </div>
            </div>
            {risky.length === 0 ? (
              <p className="text-sm text-slate-400">점검이 필요한 학생이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {risky.map((s) => (
                  <li key={s.student_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <span className="font-bold text-slate-800 w-28 shrink-0">
                      {s.class_no}반 {s.student_name}
                    </span>
                    <span className="text-xs text-slate-500">
                      상향 {s.tiers.상향} · 적정 {s.tiers.적정} · 안정 {s.tiers.안정}
                    </span>
                    {s.warnings.map((w) => (
                      <span key={w} className="rounded-full bg-rose-50 text-rose-600 px-2 py-0.5 text-xs font-bold">
                        {w}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex flex-wrap items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900">대학·학과별 지원 현황</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  같은 대학·학과·전형에 2명 이상이면 <b className="text-rose-600">겹침</b>, 추천 인원 제한이 있을 수
                  있는 전형이면 <b className="text-amber-600">추천</b>으로 표시합니다.
                  {pastYear > 0 && ` 오른쪽은 ${pastYear}년 우리 학교 결과입니다.`}
                </p>
              </div>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
                표시된 것만
              </label>
            </div>
            {shownPrograms.length === 0 ? (
              <p className="text-sm text-slate-400">표시할 원서가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {shownPrograms.map((p) => {
                  const pastInfo = pastSummary.get(p.key);
                  const gpas = pastInfo?.admittedGpas ?? [];
                  return (
                    <li key={p.key} className="py-3 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-800">
                          {p.university} {p.department}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Users className="w-3.5 h-3.5" />
                          {new Set(p.cards.map((c) => c.student_id)).size}명
                        </span>
                        {p.overlappingCategories.map((cat) => (
                          <span
                            key={`o-${cat}`}
                            className="rounded-full bg-rose-50 text-rose-600 px-2 py-0.5 text-xs font-bold"
                          >
                            겹침 · {cat}
                          </span>
                        ))}
                        {p.recommendationCategories.map((cat) => (
                          <span
                            key={`r-${cat}`}
                            className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-xs font-bold"
                          >
                            추천 · {cat}
                          </span>
                        ))}
                        {pastInfo && (
                          <span className="ml-auto text-xs text-slate-500">
                            작년 {pastInfo.applied}명 지원 ·{" "}
                            <b className="text-emerald-600">{pastInfo.admitted}명 합격</b>
                            {gpas.length > 0 &&
                              ` (${Math.min(...gpas).toFixed(2)}~${Math.max(...gpas).toFixed(2)}등급)`}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.cards.map((c) => (
                          <span
                            key={c.card_id}
                            className={`rounded-lg border px-2 py-0.5 text-xs ${
                              c.is_submitted
                                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 text-slate-600"
                            }`}
                            title={c.is_submitted ? "접수한 원서" : "지원 예정"}
                          >
                            {c.class_no}반 {c.student_name} · {c.category || "전형 미입력"}
                            {c.calculated_grade ? ` · ${c.calculated_grade}` : ""}
                          </span>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
