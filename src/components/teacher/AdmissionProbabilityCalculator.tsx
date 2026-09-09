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
import {
  estimateAdmission,
  type EstimatorInput,
  type EstimatorOutcome,
  type EstimatorResult,
  type KernelModel,
} from "@/lib/admission-probability-estimator";
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
  const [queriedScore, setQueriedScore] = useState(0);
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
      setQueriedScore(parsedScore);
      setResult(estimateAdmission(input, model));
    } catch {
      showToast("과거 사례 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", "error");
    } finally {
      setQuerying(false);
    }
  }

  function handleReset() {
    setForm(emptyForm());
    setResult(null);
    setQueriedScore(0);
    setDeptCandidates(null);
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
                className="no-spinner w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-xs">올해 모집 정원</label>
              <input
                type="number"
                value={form.targetQuota}
                onChange={(e) => updateField("targetQuota", e.target.value)}
                className="no-spinner w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              className="no-spinner w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                          className="no-spinner w-full text-center px-1 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:bg-indigo-50"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-bold transition shrink-0"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={() => void handleQuery()}
              disabled={querying}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center justify-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              {querying ? "계산 중..." : "조회"}
            </button>
          </div>
        </Card>

        {/* 결과 */}
        <div className="space-y-4">
          <Card className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] text-slate-400">{deptLabel || "대학·학과를 입력하면 표시됩니다"}</p>
              {!result && <p className="text-lg font-bold text-slate-400">분석 대기중</p>}
              {result && "insufficient" in result && <p className="text-lg font-bold text-slate-400">데이터 부족</p>}
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-slate-900">{ok ? `${ok.probLow}~${ok.probHigh}%` : "—"}</p>
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

              <Card>
                <ProbabilityChart result={ok} userScore={queriedScore} />
              </Card>

              <details className="border border-slate-200 rounded-xl bg-white">
                <summary className="px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer select-none">
                  이 수치는 어떻게 계산되었나요?
                </summary>
                <div className="px-4 pb-5 text-[13px] leading-relaxed text-slate-600 border-t border-slate-100 pt-4 space-y-5">
                  <p>
                    성적만 보고 &ldquo;몇 등급이니까 몇 % 확률&rdquo;로 계산하지 않아요. 대신 전국의 학생부 교과
                    전형 학과들 중에서, 지금 보고 있는 학과와 조건이 비슷한 학과들을 찾아서 그 학과들이
                    실제로 어떻게 됐는지를 근거로 삼아요.
                  </p>

                  <div className="space-y-3">
                    <StepRow n={1} title="조건이 비슷한 학과 찾기">
                      최근 3개년 컷의 평균 수준과 최근 흐름(오르는지 내리는지), 올해 정원이 작년보다
                      늘었는지 줄었는지, 예상 경쟁률이 원래 이 정도 성적대에서 흔한 수준인지 등을 종합해
                      &ldquo;가장 조건이 비슷한 학과들&rdquo;을 찾아요. 조건이 비슷할수록 더 많이 참고해요.
                    </StepRow>
                    <StepRow n={2} title="그 학과들의 실제 결과로 이번 컷 예측">
                      찾아낸 비슷한 학과들이 실제로 그 다음 해에 받은 50%·70%컷 결과값을 바탕으로 이번
                      해 컷을 예측해요. 어쩌다 한 번 크게 튄 사례에 휘둘리지 않도록, 가장 자주 나온
                      값 쪽에 가깝게 계산해요.
                    </StepRow>
                    <StepRow n={3} title="이 학과만의 충원 패턴 반영">
                      여기서부터는 다른 학과와 비교하지 않고, 이 학과 자신의 최근 실제 등록 인원(모집
                      인원과 추가 합격 인원을 더한 값)만 사용해요. 정원이 넉넉한 학과일수록 추가 합격이
                      더 많이 나는 경향이 실제 데이터로 확인돼서, 그 경향을 반영해 &ldquo;등록이 끝날 때까지
                      성적이 얼마나 더 밀릴 수 있는지&rdquo;를 계산해요.
                    </StepRow>
                    <StepRow n={4} title="수많은 가상 시나리오로 확률 계산" last>
                      위 정보들을 조합해 &ldquo;이런 조합이라면 어떻게 됐을까&rdquo;를 수천 번 가상으로
                      반복해요. 그중 지금 성적으로 합격했을 시나리오가 몇 %였는지를 세어서 확률로
                      보여줘요. 그래서 딱 떨어지는 숫자 하나가 아니라 범위로 나오는 거예요 — 참고할
                      사례가 풍부할수록 범위가 좁아지고, 사례가 적어 조심스러운 경우일수록 범위가
                      넓어져요.
                    </StepRow>
                  </div>

                  <p className="text-slate-400 border-t border-slate-100 pt-3">
                    이 추정치는 과거 데이터를 근거로 한 통계적 참고 자료이며, 실제 합격을 보장하지
                    않아요. 면접·자기소개서 등 정성평가가 섞인 전형에는 참고 정도로만 활용해 주세요.
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

function StepRow({ n, title, last, children }: { n: number; title: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center">
          {n}
        </div>
        {!last && <div className="w-px flex-1 bg-slate-200 mt-1" />}
      </div>
      <div className={last ? "" : "pb-1"}>
        <p className="font-bold text-slate-800 text-xs mb-0.5">{title}</p>
        <p>{children}</p>
      </div>
    </div>
  );
}

/** 성적(등급)별 합격확률 곡선. 등급은 숫자가 작을수록 좋은 성적이라, x축 왼쪽일수록 좋은
 * 성적 · 오른쪽일수록 낮은 성적이다. 사용자 성적 위치에 확률 범위(±)를 세로 막대로 함께
 * 보여주고, 마우스를 올리면 그 지점의 등급·확률을 십자선과 말풍선으로 보여준다. */
function ProbabilityChart({ result, userScore }: { result: EstimatorResult; userScore: number }) {
  const [hoverX, setHoverX] = useState<number | null>(null);
  const W = 460;
  const H = 180;
  const marginL = 34;
  const marginR = 14;
  const marginT = 14;
  const marginB = 8;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;

  const curve = result.curve;
  const gMin = curve[0]?.grade ?? userScore - 1;
  const gMax = curve[curve.length - 1]?.grade ?? userScore + 1;
  const gRange = Math.max(gMax - gMin, 0.01);

  const X = (g: number) => marginL + ((g - gMin) / gRange) * plotW;
  const Y = (p: number) => marginT + plotH - (p / 100) * plotH;
  const gradeAtX = (px: number) => gMin + ((px - marginL) / plotW) * gRange;

  let pathD = "";
  curve.forEach((pt, i) => {
    pathD += `${i === 0 ? "M" : "L"}${X(pt.grade).toFixed(1)},${Y(pt.prob).toFixed(1)} `;
  });

  function nearestPoint(grade: number) {
    let best = curve[0];
    let bestDiff = Infinity;
    for (const pt of curve) {
      const diff = Math.abs(pt.grade - grade);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = pt;
      }
    }
    return best;
  }

  const hoverPoint = hoverX != null ? nearestPoint(gradeAtX(hoverX)) : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          setHoverX(Math.max(marginL, Math.min(marginL + plotW, px)));
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        <line x1={marginL} y1={marginT} x2={marginL} y2={marginT + plotH} stroke="#cbd5e1" />
        <line x1={marginL} y1={marginT + plotH} x2={marginL + plotW} y2={marginT + plotH} stroke="#cbd5e1" />
        {[0, 25, 50, 75, 100].map((p) => (
          <g key={p}>
            <line x1={marginL - 4} y1={Y(p)} x2={marginL + plotW} y2={Y(p)} stroke="#f1f5f9" />
            <text x={marginL - 7} y={Y(p) + 3} fontSize={9} fill="#94a3b8" textAnchor="end">
              {p}%
            </text>
          </g>
        ))}

        <line
          x1={X(result.p50Predicted)}
          y1={marginT}
          x2={X(result.p50Predicted)}
          y2={marginT + plotH}
          stroke="#a5b4fc"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
        <line
          x1={X(result.p70Predicted)}
          y1={marginT}
          x2={X(result.p70Predicted)}
          y2={marginT + plotH}
          stroke="#a5b4fc"
          strokeWidth={1}
          strokeDasharray="3,3"
        />

        <path d={pathD} fill="none" stroke="#4f46e5" strokeWidth={2} />

        {/* 사용자 성적 위치 — 확률 범위(±)를 세로 막대로 표시 */}
        <line
          x1={X(userScore)}
          y1={Y(result.probHigh)}
          x2={X(userScore)}
          y2={Y(result.probLow)}
          stroke="#4f46e5"
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.35}
        />
        <circle cx={X(userScore)} cy={Y(result.prob)} r={4.5} fill="#4f46e5" stroke="#fff" strokeWidth={1.2} />

        {hoverPoint && (
          <>
            <line
              x1={X(hoverPoint.grade)}
              y1={marginT}
              x2={X(hoverPoint.grade)}
              y2={marginT + plotH}
              stroke="#64748b"
              strokeWidth={1}
            />
            <circle cx={X(hoverPoint.grade)} cy={Y(hoverPoint.prob)} r={3.5} fill="#1e293b" />
          </>
        )}
      </svg>
      <p className="text-[11px] text-center text-slate-500 -mt-1">
        {hoverPoint
          ? `${hoverPoint.grade.toFixed(2)}등급 → 합격확률 약 ${Math.round(hoverPoint.prob)}%`
          : `점선: 50%·70%컷 예측 / 굵은 점: 내 성적(${userScore.toFixed(2)}등급)`}
      </p>
    </div>
  );
}
