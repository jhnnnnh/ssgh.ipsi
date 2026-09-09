"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import {
  prefetchCutoffUniversities,
  listCutoffUniversities,
  listCutoffDepartments,
  listCutoffAdmissionTypes,
} from "@/lib/admission-cutoff-autocomplete";
import {
  searchCutoffsForLookup,
  searchCutoffCandidatesWithPreview,
  trackFromCategory,
  admissionTypeSimilarity,
  type CutoffCandidatePreview,
} from "@/lib/admission-cutoff-lookup";
import { listOfferingCandidates } from "@/lib/admission-offering-lookup";
import { estimateAdmission, type EstimatorInput, type EstimatorOutcome, type KernelModel } from "@/lib/admission-probability-estimator";
import { CascadingPickerModal } from "@/components/wonseo/CascadingPickerModal";
import type { Roster, WonseoCard } from "@/lib/database.types";

/** 교과전형 커널 계산용 데이터(과거 사례 DB + 경쟁률 정규화 구간표)는 모든 컴포넌트
 * 인스턴스가 같은 걸 쓰면 되므로 모듈 스코프에서 한 번만 불러와 재사용한다. */
let kernelModelPromise: Promise<KernelModel> | null = null;
function loadKernelModel(): Promise<KernelModel> {
  if (!kernelModelPromise) {
    kernelModelPromise = fetch("/api/admission-cut-model").then((res) => {
      if (!res.ok) throw new Error("failed to load kernel model");
      return res.json();
    });
  }
  return kernelModelPromise;
}

type MyCard = Pick<
  WonseoCard,
  | "id"
  | "university"
  | "department"
  | "category"
  | "sub_category"
  | "enrollment"
  | "recent_results"
  | "level"
  | "calculated_grade"
>;
type Triple = [number, number, number];

const YEAR_COLS = ["2026", "2025", "2024"] as const;

/** 모집정보(이투스)와 입결(대학어디가)은 같은 전형을 서로 다른 표기로 적어 두는 일이 흔해서
 * (예: "교과(지역인재)" vs "지역인재전형(교과)"), 정확히 같은 문자열만 찾으면 실제로 있는
 * 데이터도 없는 것처럼 사라진다. admissionTypeSimilarity는 트랙(교과/종합)이 다르면
 * 무조건 걸러내면서도 표기 순서가 달라도 같은 전형은 알아본다. */
function matchesHint(admissionType: string, hint: string): boolean {
  if (!hint) return true;
  return admissionTypeSimilarity(admissionType, hint) > 0;
}

function mergeTriple(existing: [string, string, string], incoming?: [string, string, string]): [string, string, string] {
  if (!incoming) return existing;
  return existing.map((v, i) => (v.trim() ? v : incoming[i])) as [string, string, string];
}

function parseNum(v: string): number {
  return parseFloat(v) || 0;
}
function parseIntNum(v: string): number {
  return parseInt(v, 10) || 0;
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
  const [result, setResult] = useState<EstimatorOutcome | null>(null);
  const [querying, setQuerying] = useState(false);
  const [loadingCutoffs, setLoadingCutoffs] = useState(false);

  const [teacherStudentId, setTeacherStudentId] = useState("");
  const [myCards, setMyCards] = useState<MyCard[] | null>(null);
  const [cardPickerOpen, setCardPickerOpen] = useState(false);

  // 대학·학과·전형 선택 팝업이 고르는 학과 자체가 admission_cutoffs에 없을 때(드묾)
  // 이름이 비슷한 다른 학과를 대신 보여준다(카드 만들 때 "비슷한 학과 입결 찾기"와 같은 방식).
  const [deptCandidates, setDeptCandidates] = useState<CutoffCandidatePreview[] | null>(null);

  useEffect(() => {
    prefetchCutoffUniversities();
    loadKernelModel().catch(() => {});
  }, []);

  // 학생 화면에서는 교사 화면의 학생 선택 <select>가 없으니, 자기 자신의 studentId로
  // 카드를 곧바로 불러온다(교사 화면은 select의 onChange가 loadCards를 직접 부른다).
  useEffect(() => {
    if (studentId) loadCards(studentId);
  }, [studentId]);

  function loadCards(id: string) {
    setTeacherStudentId(id);
    if (!id) {
      setMyCards(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from("wonseo_cards")
      .select("id, university, department, category, sub_category, enrollment, recent_results, level, calculated_grade")
      .eq("student_id", id)
      .order("sort_order", { ascending: true })
      .then(({ data }) => setMyCards(data ?? []));
  }

  /** 대학·학과·전형 선택 팝업에서 카드를 고른 시점에 호출된다. 대학/학과/전형은 팝업이
   * 실제 입결 데이터 기준으로 알아서 매칭해 채워주므로(onComplete), 여기서는 카드 자체의
   * 값인 최근 3개년 입결·모집정원·내신등급만 채운다. */
  function handleCardSelected(card: MyCard) {
    const filled = yearsToTriples(card.recent_results ?? [], (y) => ({
      c50: y.cut50 ?? "",
      c70: y.cut70 ?? "",
      quota: y.enrollment ?? "",
      turnover: y.fillCount ?? "",
      applicants: y.competitionRate ?? "",
    }));
    // calculated_grade는 자유 텍스트라("2.35" 같은 순수 숫자가 아닐 수도 있음) 실제로
    // 숫자로 읽히는 경우에만 내신 등급 칸에 채운다.
    const cardGrade = card.calculated_grade?.trim() ?? "";
    const userScore = cardGrade && Number.isFinite(parseFloat(cardGrade)) ? cardGrade : "";
    setForm((f) => ({
      ...f,
      targetQuota: card.enrollment != null ? String(card.enrollment) : "",
      userScore: userScore || f.userScore,
      ...filled,
    }));
    setDeptCandidates(null);
  }

  /** 대학·학과·전형 선택 팝업이 완료되면(카드로 불러왔든 직접 골랐든) 바로 실행된다.
   * 대학·학과·전형은 팝업이 이미 admission_cutoffs 실제 데이터 기준으로 골라준 값이라
   * 그대로 채우고, 올해 모집 정원·과거 3개년 입결은 저장된 데이터에서 찾아 채운다.
   * 단, 카드에서 불러와 이미 값이 있는 칸(비어 있지 않은 칸)은 덮어쓰지 않는다 — 카드에
   * 학생이 직접 적어 둔 값이 우선이고, DB 조회는 빈 칸만 메꾸는 용도다. */
  function handlePicked(uni: string, dept: string | null, type: string) {
    const departmentStr = dept ?? "";
    setForm((f) => ({ ...f, university: uni, department: departmentStr, admissionType: type }));
    void autoFillCutoffData(uni, departmentStr, type);
  }

  function applyDeptCandidate(c: CutoffCandidatePreview) {
    setForm((f) => ({ ...f, university: c.university, department: c.department }));
    setDeptCandidates(null);
    // 후보 학과로 다시 검색해서(전형명 힌트 그대로) 빈 칸을 채운다.
    void autoFillCutoffData(c.university, c.department, form.admissionType.trim());
  }

  /** 대학+학과+세부전형명으로 이번 학년도 모집 정원(모집정보)과 과거 3개년 입결(대학어디가)을
   * 찾아, 비어 있는 칸만 채운다. 학과 자체를 못 찾으면 이름이 비슷한 다른 학과를 추천한다
   * (카드 만들 때 "비슷한 학과 입결 찾기"와 같은 방식). */
  async function autoFillCutoffData(uni: string, dept: string, type: string) {
    if (!uni || !dept) return;
    setLoadingCutoffs(true);
    setDeptCandidates(null);
    try {
      const [groups, offerings] = await Promise.all([searchCutoffsForLookup(uni, dept), listOfferingCandidates(uni, dept)]);

      if (groups.length === 0) {
        const candidates = await searchCutoffCandidatesWithPreview(uni, dept, trackFromCategory(type), type);
        if (candidates.length > 0) setDeptCandidates(candidates);
        else showToast("저장된 입결 데이터를 찾을 수 없어요. 직접 입력해 주세요.", "error");
        return;
      }

      const matchedGroup =
        groups.find((g) => g.admissionType === type) ?? groups.find((g) => admissionTypeSimilarity(g.admissionType, type) > 0);
      const matchedOffering = offerings.find((o) => matchesHint(o.admissionType, type));

      const filledTriples = matchedGroup
        ? yearsToTriples(matchedGroup.years, (m) => ({
            c50: m.grade_50 ?? "",
            c70: m.grade_70 ?? "",
            quota: m.enrollment ?? "",
            turnover: m.additional_pass ?? "",
            applicants: m.competition_rate ?? "",
          }))
        : null;

      setForm((f) => ({
        ...f,
        targetQuota: f.targetQuota.trim()
          ? f.targetQuota
          : matchedOffering?.enrollment != null
            ? String(matchedOffering.enrollment)
            : f.targetQuota,
        c50: mergeTriple(f.c50, filledTriples?.c50),
        c70: mergeTriple(f.c70, filledTriples?.c70),
        quota: mergeTriple(f.quota, filledTriples?.quota),
        turnover: mergeTriple(f.turnover, filledTriples?.turnover),
        applicants: mergeTriple(f.applicants, filledTriples?.applicants),
      }));
    } finally {
      setLoadingCutoffs(false);
    }
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

  async function handleQuery() {
    // 내신 등급이 비어 있으면 parseNum이 조용히 0을 돌려주는데, 등급 스케일에서는 0이
    // "가장 좋은 등급"보다도 더 좋은 값으로 계산돼 버려서 등급을 입력 안 했는데도
    // 확률이 나오는(그것도 아주 높게 나오는) 심각한 오류가 있었다. 반드시 실제 값을
    // 입력해야만 조회되게 막는다.
    const rawScore = form.userScore.trim();
    const parsedScore = parseFloat(rawScore);
    if (!rawScore || !Number.isFinite(parsedScore) || parsedScore <= 0) {
      showToast("내신 등급을 입력해 주세요.", "error");
      return;
    }

    if (!form.admissionType.includes("교과")) {
      setResult({ insufficient: true, reason: "학생부 교과전형만 지원해요. 종합전형은 아직 검증된 계산식이 없어요." });
      return;
    }

    setQuerying(true);
    try {
      const model = await loadKernelModel();
      const input: EstimatorInput = {
        userScore: parsedScore,
        targetQuota: parseIntNum(form.targetQuota),
        expectedCompetition: parseNum(form.expectedCompetition),
        c50: form.c50.map(parseNum) as Triple,
        c70: form.c70.map(parseNum) as Triple,
        quota: form.quota.map(parseIntNum) as Triple,
        turnover: form.turnover.map(parseIntNum) as Triple,
      };
      setResult(estimateAdmission(input, model));
    } catch {
      showToast("과거 사례 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", "error");
    } finally {
      setQuerying(false);
    }
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
          <button
            type="button"
            onClick={() => setCardPickerOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-sm font-semibold transition"
          >
            <Search className="w-3.5 h-3.5" />
            대학·학과·전형 선택
          </button>

          {form.university && (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              선택됨: <span className="font-bold text-slate-700">{form.university}</span>
              {form.department && <> · <span className="font-bold text-slate-700">{form.department}</span></>}
              {form.admissionType && <> · <span className="font-bold text-slate-700">{form.admissionType}</span></>}
            </p>
          )}

          {loadingCutoffs && <p className="text-xs text-slate-400">모집 정원·입결 불러오는 중...</p>}

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
            onClick={() => void handleQuery()}
            disabled={querying}
            className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center justify-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5" />
            {querying ? "계산 중..." : "조회"}
          </button>
        </Card>

        {/* 결과 */}
        <div className="space-y-4">
          <Card className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] text-slate-400">{deptLabel || "대학·학과를 입력하면 표시됩니다"}</p>
              {!result && <p className="text-lg font-bold text-slate-400">분석 대기중</p>}
              {result && "insufficient" in result && <p className="text-lg font-bold text-slate-400">데이터 부족</p>}
              {ok && (
                <p className={`text-lg font-bold ${ok.prob >= 50 ? "text-emerald-700" : "text-rose-700"}`}>
                  {ok.prob >= 50 ? "적정 이상" : "상향 지원"}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-slate-900">{ok ? `${Math.round(ok.prob)}%` : "—"}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">추정 합격 가능성</p>
            </div>
          </Card>

          {result && "insufficient" in result && (
            <Card>
              <p className="text-xs text-slate-500">{result.reason}</p>
            </Card>
          )}

          {ok && (
            <>
              <div className="grid grid-cols-2 gap-px bg-slate-200 border border-slate-200">
                <div className="bg-white p-3">
                  <p className="text-[10px] text-slate-400">50%컷 예측</p>
                  <p className="text-base font-bold text-slate-800">{ok.p50Predicted.toFixed(2)} 등급</p>
                </div>
                <div className="bg-white p-3">
                  <p className="text-[10px] text-slate-400">70%컷 예측</p>
                  <p className="text-base font-bold text-slate-800">{ok.p70Predicted.toFixed(2)} 등급</p>
                </div>
              </div>

              <p className="text-[11px] text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                비슷한 과거 사례 {Math.round(ok.effectiveN)}건을 참고해 계산했어요 — 수가 적을수록 예측이
                불안정할 수 있어요.
              </p>

              <details className="border border-slate-200 rounded-xl bg-white">
                <summary className="px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer select-none">
                  이 수치는 어떻게 계산되었나요?
                </summary>
                <div className="px-4 pb-4 text-xs leading-relaxed text-slate-600 border-t border-slate-100 pt-3 space-y-4">
                  <section>
                    <h4 className="font-bold text-slate-800 mb-1">1. 비슷한 과거 사례 찾기 (국소가중 커널)</h4>
                    <p>
                      과거 3개년 컷을 &ldquo;3개년 평균(수준)&rdquo;과 &ldquo;가장 최근 1년의 변화량(추세)&rdquo;으로
                      요약하고, 여기에 정원 증감률과 이번 해 예상 경쟁률(과거 수준 구간별로 정규화한 값)까지
                      더한 지표로, 교과전형 학과 데이터베이스에서 비슷한 사례를 찾아 가중치를 매깁니다.
                    </p>
                    <Formula>
                      {"수준50/수준70 = 과거 3개년 평균,  추세70 = 최근해 - 그 직전해"}
                      {"\n정원변화 = ln(올해 정원) - ln(작년 정원),  경쟁률_국소 = (예상 경쟁률 - μ_구간) / σ_구간"}
                      {"\n거리² = Σ ((사례값 - 목표값) / 대역폭)²  →  가중치 = exp(-거리²/2)"}
                    </Formula>
                  </section>

                  <section>
                    <h4 className="font-bold text-slate-800 mb-1">2. 50%·70%컷 — 가중중앙값</h4>
                    <p>
                      가중평균이 아니라 가중중앙값을 씁니다. 컷 분포가 비대칭이라(소수의 미충원·이변 사례가
                      꼬리를 만듦) 평균은 극단치에 끌려가지만 중앙값은 그렇지 않습니다.
                    </p>
                  </section>

                  <section>
                    <h4 className="font-bold text-slate-800 mb-1">3. 마지노선 배수 — 이 학과 자신의 데이터만 사용</h4>
                    <p>
                      다른 학과 사례와 무관하게, 이 학과의 가장 최근해 실제 합격자수(모집인원+충원인원)만으로
                      &ldquo;마지노선이 50%컷·70%컷 스프레드의 몇 배 지점에 있는지&rdquo;를 구합니다(대교협 실측
                      6개 학과·514명 데이터로 검증).
                    </p>
                    <Formula>
                      {"합격자수 = 올해 모집인원 + 올해 충원인원 (35~132명 범위로 제한)"}
                      {"\nratio = -2.289 + 1.184 × ln(합격자수),  하한 0.3"}
                    </Formula>
                  </section>

                  <section>
                    <h4 className="font-bold text-slate-800 mb-1">4. 몬테카를로 시뮬레이션 → 합격확률</h4>
                    <p>
                      마지노선을 하나의 숫자로 고정하지 않고, 1번의 가중치로 과거 실제 (50컷,70컷)을 1만 번
                      복원추출 + 3번의 ratio를 오차 범위 안에서 정규분포로 흔들어 마지노선의 분포를 만듭니다.
                      로지스틱 함수나 임의의 보정 계수 없이, 이 분포 중 내 성적으로 합격 가능한 비율을 그대로
                      셉니다.
                    </p>
                    <Formula>
                      {"마지노선[i] = sim50컷[i] + ratio[i] × (sim70컷[i] - sim50컷[i])  (i = 1..10000)"}
                      {"\n합격확률 = (마지노선 ≥ 내 성적)의 비율"}
                    </Formula>
                  </section>

                  <p className="text-slate-400 border-t border-slate-100 pt-3">
                    본 모형은 교과전형 한정으로 검증된 통계적 추정치이며, 표본 외 예측의 성격상 실제값과
                    편차가 발생할 수 있습니다. 합격을 보증하지 않습니다.
                  </p>
                </div>
              </details>
            </>
          )}
        </div>
      </div>

      <CascadingPickerModal
        open={cardPickerOpen}
        onClose={() => setCardPickerOpen(false)}
        onComplete={handlePicked}
        fetchUniversities={listCutoffUniversities}
        fetchDepartments={async (u) => ({ list: await listCutoffDepartments(u), hasSummary: false })}
        fetchAdmissionTypes={(u, d) => listCutoffAdmissionTypes(u, d ?? "")}
        admissionTypeAllLabel="전체 전형 보기"
        cards={myCards ?? []}
        onCardSelected={handleCardSelected}
      />
    </div>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-1.5 whitespace-pre-wrap break-words overflow-x-auto font-mono text-[11px] text-slate-700 bg-slate-100 rounded-lg p-2.5">
      {children}
    </pre>
  );
}
