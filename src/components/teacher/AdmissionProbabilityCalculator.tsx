"use client";

import { useEffect, useState } from "react";
import { Search, Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { AutocompleteInput } from "@/components/ui/AutocompleteInput";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import {
  prefetchCutoffUniversities,
  searchCutoffAdmissionTypes,
  searchCutoffDepartments,
  searchCutoffUniversities,
} from "@/lib/admission-cutoff-autocomplete";
import {
  searchCutoffsForLookup,
  searchCutoffCandidatesWithPreview,
  trackFromCategory,
  normalize,
  type CutoffLookupGroup,
  type CutoffCandidatePreview,
} from "@/lib/admission-cutoff-lookup";
import { estimateAdmission, type EstimatorInput, type EstimatorResult } from "@/lib/admission-probability-estimator";
import type { Roster, WonseoCard } from "@/lib/database.types";

type MyCard = Pick<WonseoCard, "id" | "university" | "department" | "enrollment" | "recent_results">;
type Triple = [number, number, number];

const YEAR_COLS = ["2026", "2025", "2024"] as const;

const TIER_COLOR: Record<EstimatorResult["tier"]["key"], { fg: string; bg: string; border: string }> = {
  safe: { fg: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  watch: { fg: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  risk: { fg: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200" },
};

function parseNum(v: string): number {
  return parseFloat(v) || 0;
}
function parseIntNum(v: string): number {
  return parseInt(v, 10) || 0;
}
function fmt2(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2);
}

function emptyForm() {
  return {
    university: "",
    department: "",
    admissionType: "",
    userScore: "",
    targetQuota: "",
    expectedCompetition: "",
    c50: ["", "", ""] as [string, string, string],
    c70: ["", "", ""] as [string, string, string],
    quota: ["", "", ""] as [string, string, string],
    turnover: ["", "", ""] as [string, string, string],
    applicants: ["", "", ""] as [string, string, string],
  };
}
type FormState = ReturnType<typeof emptyForm>;

/** 연도별 3개년 데이터(입결 원본이든 카드의 최근입결이든)를 "2026/2025/2024" 3칸에
 * 최대한 맞춰 채운다. year가 그 세 값 중 하나와 일치하면 그 칸에, 아니면 최신순으로
 * 앞에서부터 채운다. */
function yearsToTriples<T extends { year: string | number }>(
  rows: T[],
  pick: (row: T) => { c50: string; c70: string; quota: string; turnover: string; applicants: string },
) {
  const sorted = [...rows].sort((a, b) => Number(b.year) - Number(a.year));
  const c50: [string, string, string] = ["", "", ""];
  const c70: [string, string, string] = ["", "", ""];
  const quota: [string, string, string] = ["", "", ""];
  const turnover: [string, string, string] = ["", "", ""];
  const applicants: [string, string, string] = ["", "", ""];

  sorted.forEach((row, idx) => {
    const col = YEAR_COLS.indexOf(String(row.year) as (typeof YEAR_COLS)[number]);
    const slot = col >= 0 ? col : idx;
    if (slot > 2) return;
    const v = pick(row);
    c50[slot] = v.c50;
    c70[slot] = v.c70;
    quota[slot] = v.quota;
    turnover[slot] = v.turnover;
    applicants[slot] = v.applicants;
  });

  return { c50, c70, quota, turnover, applicants };
}

export function AdmissionProbabilityCalculator({
  studentId,
  roster,
}: {
  studentId?: string;
  roster?: Pick<Roster, "student_id" | "name">[];
}) {
  const showToast = useToast();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [result, setResult] = useState<EstimatorResult | { insufficient: true } | null>(null);
  const [queriedScore, setQueriedScore] = useState(0);
  const [loadingCutoffs, setLoadingCutoffs] = useState(false);

  const [teacherStudentId, setTeacherStudentId] = useState("");
  const [myCards, setMyCards] = useState<MyCard[] | null>(null);
  const effectiveStudentId = studentId ?? teacherStudentId;

  // 세부전형명 하나로 못 좁혔을 때 보여줄 후보들 — 같은 학과 안의 다른 전형(typeCandidates)
  // 또는 학과 자체가 없어서 이름이 비슷한 다른 학과(deptCandidates).
  const [typeCandidates, setTypeCandidates] = useState<CutoffLookupGroup[] | null>(null);
  const [deptCandidates, setDeptCandidates] = useState<CutoffCandidatePreview[] | null>(null);

  useEffect(() => {
    prefetchCutoffUniversities();
  }, []);

  function loadCards(id: string) {
    setTeacherStudentId(id);
    if (!id) {
      setMyCards(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from("wonseo_cards")
      .select("id, university, department, enrollment, recent_results")
      .eq("student_id", id)
      .order("sort_order", { ascending: true })
      .then(({ data }) => setMyCards(data ?? []));
  }

  function pickMyCard(card: MyCard) {
    const filled = yearsToTriples(card.recent_results ?? [], (y) => ({
      c50: y.cut50 ?? "",
      c70: y.cut70 ?? "",
      quota: y.enrollment ?? "",
      turnover: y.fillCount ?? "",
      applicants: y.competitionRate ?? "",
    }));
    setForm((f) => ({
      ...f,
      university: card.university ?? "",
      department: card.department ?? "",
      targetQuota: card.enrollment != null ? String(card.enrollment) : "",
      ...filled,
    }));
    setTypeCandidates(null);
    setDeptCandidates(null);
  }

  function applyGroupToForm(group: CutoffLookupGroup) {
    const filled = yearsToTriples(group.years, (m) => ({
      c50: m.grade_50 ?? "",
      c70: m.grade_70 ?? "",
      quota: m.enrollment ?? "",
      turnover: m.additional_pass ?? "",
      applicants: m.competition_rate ?? "",
    }));
    setForm((f) => ({ ...f, admissionType: group.admissionType, ...filled }));
    setTypeCandidates(null);
    setDeptCandidates(null);
  }

  function applyDeptCandidate(c: CutoffCandidatePreview) {
    setForm((f) => ({ ...f, university: c.university, department: c.department }));
    setDeptCandidates(null);
    // 후보 학과로 다시 검색해서(전형명 힌트 그대로) 정확히 하나로 좁혀지면 바로 채운다.
    void runLoadCutoffData(c.university, c.department, form.admissionType.trim());
  }

  /** 대학+학과+세부전형명으로 대학어디가 입결 원본을 찾아 3개년 표를 자동으로 채운다.
   * "내 카드 불러오기"와 달리 카드 없이도, 직접 검색한 아무 학과나 넣어볼 수 있다.
   * 전형명이 정확히 하나로 안 좁혀지면(입력한 글자가 포함된 전형이 여러 개거나, 비워
   * 뒀거나) 후보 목록을 보여주고 직접 고르게 한다. 학과 자체를 못 찾으면 이름이
   * 비슷한 다른 학과를 추천한다(카드 만들 때 "비슷한 학과 입결 찾기"와 같은 방식). */
  async function runLoadCutoffData(uni: string, dept: string, type: string) {
    setLoadingCutoffs(true);
    setTypeCandidates(null);
    setDeptCandidates(null);
    try {
      const groups = await searchCutoffsForLookup(uni, dept);
      if (groups.length === 0) {
        const candidates = await searchCutoffCandidatesWithPreview(uni, dept, trackFromCategory(type), type);
        if (candidates.length === 0) {
          showToast("일치하는 학과도, 비슷한 학과도 찾을 수 없습니다.", "error");
          return;
        }
        setDeptCandidates(candidates);
        return;
      }

      const normalizedType = normalize(type);
      const matched = normalizedType ? groups.filter((g) => normalize(g.admissionType).includes(normalizedType)) : groups;

      if (matched.length === 1) {
        applyGroupToForm(matched[0]);
        showToast("입결 데이터를 불러왔습니다.", "success");
        return;
      }
      // 0개(입력한 전형명과 겹치는 게 없음)거나 여러 개면 그 학과의 실제 전형 후보를 보여준다.
      setTypeCandidates(matched.length > 0 ? matched : groups);
    } finally {
      setLoadingCutoffs(false);
    }
  }

  function loadCutoffData() {
    const uni = form.university.trim();
    const dept = form.department.trim();
    if (!uni || !dept) {
      showToast("대학교명과 모집단위를 먼저 입력해 주세요.", "error");
      return;
    }
    void runLoadCutoffData(uni, dept, form.admissionType.trim());
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function updateTriple(key: "c50" | "c70" | "quota" | "turnover" | "applicants", idx: number, value: string) {
    setForm((f) => {
      const next = [...f[key]] as [string, string, string];
      next[idx] = value;
      return { ...f, [key]: next };
    });
  }

  function handleQuery() {
    const input: EstimatorInput = {
      userScore: parseNum(form.userScore),
      targetQuota: parseIntNum(form.targetQuota),
      expectedCompetition: parseNum(form.expectedCompetition),
      c50: form.c50.map(parseNum) as Triple,
      c70: form.c70.map(parseNum) as Triple,
      quota: form.quota.map(parseIntNum) as Triple,
      turnover: form.turnover.map(parseIntNum) as Triple,
      applicants: form.applicants.map(parseNum) as Triple,
    };
    setQueriedScore(input.userScore);
    setResult(estimateAdmission(input));
  }

  const ok = result && !("insufficient" in result) ? result : null;
  const deptLabel = [form.university, form.department].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <Card className="space-y-1">
        <h3 className="text-sm font-bold text-slate-800">합격 가능성 추정 (참고용)</h3>
        <p className="text-[11px] text-slate-400">
          학생부 교과 전형 한정 · 과거 3개년 입결 기반 통계적 추정치입니다. 정성평가가 섞인 전형에는 적용할
          수 없습니다.
        </p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
        {/* 입력 */}
        <Card className="space-y-4">
          {roster && (
            <select
              value={teacherStudentId}
              onChange={(e) => loadCards(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">학생 선택(내 카드 불러오기)</option>
              {roster.map((r) => (
                <option key={r.student_id} value={r.student_id}>
                  {r.student_id} {r.name}
                </option>
              ))}
            </select>
          )}
          {effectiveStudentId && myCards && myCards.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                const card = myCards.find((c) => c.id === e.target.value);
                if (card) pickMyCard(card);
              }}
              className="w-full bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">내 원서 카드에서 불러오기(대학·학과·입결 자동 입력)</option>
              {myCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.university} · {c.department}
                </option>
              ))}
            </select>
          )}

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-xs">대학교명</label>
              <AutocompleteInput
                value={form.university}
                onChange={(v) => setForm((f) => ({ ...f, university: v, department: "", admissionType: "" }))}
                onSearch={searchCutoffUniversities}
                placeholder="OO대학교"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-xs">모집단위 / 학과</label>
              <AutocompleteInput
                value={form.department}
                onChange={(v) => setForm((f) => ({ ...f, department: v, admissionType: "" }))}
                onSearch={(q) => searchCutoffDepartments(q, form.university)}
                placeholder="OO학과 또는 OO학부"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-xs">세부 전형명</label>
              <AutocompleteInput
                value={form.admissionType}
                onChange={(v) => updateField("admissionType", v)}
                onSearch={
                  form.university.trim() && form.department.trim()
                    ? (q) => searchCutoffAdmissionTypes(q, form.university, form.department)
                    : undefined
                }
                revealOnFocus
                placeholder="예: 학생부교과(일반전형)"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={loadCutoffData}
            disabled={loadingCutoffs}
            className="w-full px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            {loadingCutoffs ? "불러오는 중..." : "입결 불러오기(대학·학과·전형으로 3개년 자동 입력)"}
          </button>

          {typeCandidates && (
            <div className="space-y-1.5 border border-indigo-200 bg-indigo-50/40 rounded-xl p-3">
              <p className="text-[11px] font-bold text-indigo-700">
                입력한 세부전형명과 일치하는 전형이 여러 개예요. 하나를 골라 주세요.
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {typeCandidates.map((g) => (
                  <button
                    key={g.admissionType}
                    type="button"
                    onClick={() => applyGroupToForm(g)}
                    className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition"
                  >
                    <span className="font-bold text-slate-800 text-xs">{g.admissionType}</span>
                    <span className="shrink-0 text-[11px] font-bold text-indigo-600">선택</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {deptCandidates && (
            <div className="space-y-1.5 border border-amber-200 bg-amber-50/50 rounded-xl p-3">
              <p className="text-[11px] font-bold text-amber-700">
                정확히 일치하는 학과가 없어요. 이름이 비슷한 학과를 참고해 보세요.
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {deptCandidates.map((c) => (
                  <button
                    key={`${c.university}-${c.department}`}
                    type="button"
                    onClick={() => applyDeptCandidate(c)}
                    className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 bg-white hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-xl transition"
                  >
                    <span className="font-bold text-slate-800 text-xs">
                      {c.university} · {c.department}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-amber-700">선택</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-xs">내신 등급</label>
              <input
                type="number"
                step="0.01"
                value={form.userScore}
                onChange={(e) => updateField("userScore", e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-xs">올해 모집 정원</label>
              <input
                type="number"
                value={form.targetQuota}
                onChange={(e) => updateField("targetQuota", e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1 text-xs">
              올해 예상 경쟁률 <span className="font-normal text-slate-400">(선택)</span>
            </label>
            <input
              type="number"
              step="0.01"
              value={form.expectedCompetition}
              onChange={(e) => updateField("expectedCompetition", e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full">
              <caption className="text-left text-xs font-bold text-slate-700 pb-2">
                과거 3개년 입결 <span className="font-normal text-slate-400">(없는 연도는 비워두세요)</span>
              </caption>
              <thead>
                <tr>
                  <th className="p-1.5 bg-slate-50 border border-slate-200" />
                  {YEAR_COLS.map((y) => (
                    <th key={y} className="p-1.5 text-center font-bold text-slate-600 bg-slate-50 border border-slate-200">
                      {y}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["50% 컷", "c50"],
                    ["70% 컷", "c70"],
                    ["모집 인원", "quota"],
                    ["충원 인원", "turnover"],
                    ["경쟁률", "applicants"],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key}>
                    <td className="p-1.5 text-left font-bold text-slate-600 bg-slate-50 border border-slate-200 whitespace-nowrap">
                      {label}
                    </td>
                    {form[key].map((v, i) => (
                      <td key={i} className="p-0 border border-slate-200">
                        <input
                          type="number"
                          step="0.01"
                          value={v}
                          onChange={(e) => updateTriple(key, i, e.target.value)}
                          className="w-full text-center px-1 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:bg-indigo-50"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={handleQuery}
            className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center justify-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            조회
          </button>
        </Card>

        {/* 결과 */}
        <div className="space-y-4">
          <Card className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] text-slate-400">{deptLabel || "대학·학과를 입력하면 표시됩니다"}</p>
              {!result && <p className="text-lg font-bold text-slate-400">분석 대기중</p>}
              {result && "insufficient" in result && <p className="text-lg font-bold text-slate-400">데이터 부족</p>}
              {ok && <p className={`text-lg font-bold ${TIER_COLOR[ok.tier.key].fg}`}>{ok.tier.name} 지원</p>}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-slate-900">
                {ok ? `${ok.probRangeLow}~${ok.probRangeHigh}%` : "—"}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">추정 합격 가능성</p>
            </div>
          </Card>

          {result && "insufficient" in result && (
            <Card>
              <p className="text-xs text-slate-500">50%컷·70%컷 중 최소 1개년 데이터가 있어야 계산할 수 있어요.</p>
            </Card>
          )}

          {ok && (
            <>
              <Card className="space-y-2">
                <div className="h-8 relative border border-slate-800 bg-slate-50 overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 opacity-30 ${TIER_COLOR[ok.tier.key].fg.replace("text-", "bg-")}`}
                    style={{ width: `${Math.max(0, Math.min(100, ok.stripPos * 100))}%` }}
                  />
                  <div
                    className="absolute inset-y-0 w-0.5 bg-slate-900"
                    style={{ left: `${Math.max(0, Math.min(100, ok.stripPos * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>50% 컷 예측 {ok.p50Predicted.toFixed(2)}</span>
                  <span>마지노선 추정 {ok.p100Predicted.toFixed(2)}</span>
                </div>
              </Card>

              <div className="grid grid-cols-3 gap-px bg-slate-200 border border-slate-200">
                <div className="bg-white p-3">
                  <p className="text-[10px] text-slate-400">50%컷 예측</p>
                  <p className="text-base font-bold text-slate-800">{ok.p50Predicted.toFixed(2)} 등급</p>
                </div>
                <div className="bg-white p-3">
                  <p className="text-[10px] text-slate-400">70%컷 예측</p>
                  <p className="text-base font-bold text-slate-800">{ok.p70Predicted.toFixed(2)} 등급</p>
                </div>
                <div className="bg-white p-3">
                  <p className="text-[10px] text-slate-400">마지노선 대비 점수차</p>
                  <p className={`text-base font-bold ${ok.gap100 >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {fmt2(ok.gap100)} 등급
                  </p>
                </div>
              </div>

              <details className="border border-slate-200 rounded-xl bg-white">
                <summary className="px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer select-none">
                  이 수치는 어떻게 계산되었나요?
                </summary>
                <div className="px-4 pb-4 text-xs leading-relaxed text-slate-600 space-y-2 border-t border-slate-100 pt-3">
                  <p>
                    최근 연도 컷을 기준값으로 삼고(3개년 가중평균은 최근 추세를 희석시켜 오히려 편향을
                    키움), 예상 경쟁률 변화를 회귀식으로 보정합니다. 50%→70%컷의 스프레드와 충원비율을
                    다중회귀에 넣어 &ldquo;등록 마지노선(100%컷)&rdquo;을 추정하고, 그 지점을 확률 50%로 고정한
                    로지스틱 곡선 위에 입력 등급을 대입합니다.
                  </p>
                  <ProbCurve result={ok} userScore={queriedScore} />
                  <p className="text-slate-400">
                    본 모형의 계수는 복수 연도·복수 학과 표본에 대한 회귀분석으로 추정된 값이며, 표본 외
                    예측의 성격상 실제값과 편차가 발생할 수 있습니다. 정성평가 요소가 결합된 전형은 잔차의
                    분산이 커집니다.
                  </p>
                </div>
              </details>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProbCurve({ result, userScore }: { result: EstimatorResult; userScore: number }) {
  const W = 460,
    H = 220;
  const marginL = 34,
    marginR = 14,
    marginT = 14,
    marginB = 28;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;

  const cut50 = result.p50Predicted,
    cut70 = result.p70Predicted,
    cut100 = result.p100Predicted;
  const pad = Math.max(cut100 - cut50, 0.1) * 0.5;
  const xMin = Math.min(cut50, userScore) - pad;
  const xMax = Math.max(cut100, userScore) + pad;
  const xRange = Math.max(xMax - xMin, 0.01);

  const X = (g: number) => marginL + ((g - xMin) / xRange) * plotW;
  const Y = (p: number) => marginT + plotH - p * plotH;

  const steps = 60;
  let pathD = "";
  for (let i = 0; i <= steps; i++) {
    const g = xMin + (xRange * i) / steps;
    const z = result.k * (cut100 - g);
    const p = 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, z))));
    pathD += `${i === 0 ? "M" : "L"}${X(g).toFixed(1)},${Y(p).toFixed(1)} `;
  }

  const userZ = result.k * (cut100 - userScore);
  const userP = 1 / (1 + Math.exp(-Math.max(-25, Math.min(25, userZ))));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto border border-slate-200 bg-slate-50">
      <line x1={marginL} y1={marginT} x2={marginL} y2={marginT + plotH} stroke="#333" />
      <line x1={marginL} y1={marginT + plotH} x2={marginL + plotW} y2={marginT + plotH} stroke="#333" />
      {[0, 0.25, 0.5, 0.75, 1.0].map((p) => (
        <g key={p}>
          <line x1={marginL - 4} y1={Y(p)} x2={marginL} y2={Y(p)} stroke="#94a3b8" />
          <text x={marginL - 7} y={Y(p) + 3} fontSize={9} fill="#94a3b8" textAnchor="end">
            {Math.round(p * 100)}%
          </text>
        </g>
      ))}
      <line x1={X(cut50)} y1={marginT} x2={X(cut50)} y2={marginT + plotH} stroke="#059669" strokeWidth={1.3} strokeDasharray="4,3" />
      <line x1={X(cut70)} y1={marginT} x2={X(cut70)} y2={marginT + plotH} stroke="#b45309" strokeWidth={1.3} strokeDasharray="4,3" />
      <line x1={X(cut100)} y1={marginT} x2={X(cut100)} y2={marginT + plotH} stroke="#dc2626" strokeWidth={1.3} strokeDasharray="4,3" />
      <path d={pathD} fill="none" stroke="#555" strokeWidth={1.6} />
      <circle cx={X(userScore)} cy={Y(userP)} r={4.5} fill="#4f46e5" stroke="#fff" strokeWidth={1.2} />
      <text x={marginL + plotW / 2} y={H - 6} fontSize={10} textAnchor="middle" fill="#555">
        내신 등급 →
      </text>
    </svg>
  );
}
