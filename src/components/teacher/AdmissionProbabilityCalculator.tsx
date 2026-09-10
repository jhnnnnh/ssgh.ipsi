"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, ExternalLink, Search, Trash2, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/AuthProvider";
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
import { CompetitionResultPanel } from "@/components/wonseo/CompetitionResultPanel";
import type { AdmissionProbabilitySave, AdmissionProbabilitySaveInput, Roster, WonseoCard } from "@/lib/database.types";

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
  const { profile } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [result, setResult] = useState<EstimatorOutcome | null>(null);
  const [queriedScore, setQueriedScore] = useState(0);
  const [querying, setQuerying] = useState(false);
  const [loadingCutoffs, setLoadingCutoffs] = useState(false);

  const [teacherStudentId, setTeacherStudentId] = useState("");
  const [myCards, setMyCards] = useState<MyCard[] | null>(null);
  const [cardPickerOpen, setCardPickerOpen] = useState(false);

  const [saves, setSaves] = useState<AdmissionProbabilitySave[] | null>(null);
  const [savesLoading, setSavesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 대학·학과·전형 선택 팝업이 고르는 학과 자체가 admission_cutoffs에 없을 때(드묾)
  // 이름이 비슷한 다른 학과를 대신 보여준다(카드 만들 때 "비슷한 학과 입결 찾기"와 같은 방식).
  const [deptCandidates, setDeptCandidates] = useState<CutoffCandidatePreview[] | null>(null);

  const [competitionModalOpen, setCompetitionModalOpen] = useState(false);

  // "대학·학과·전형 선택"에서 카드를 골라 handleCardSelected가 먼저 값을 채운 뒤, 이어서
  // handlePicked가 실행되는 순서다(사용자가 팝업에서 "검색"을 눌러야 onComplete가 불림).
  // 그 사이 이 플래그를 true로 켜 두면, handlePicked가 "카드에서 온 값이니 지우면 안
  // 된다"고 판단해 병합(빈 칸만 채움)하고, 카드 없이 직접 고른 경우에는 false라서
  // 이전에 다른 학과를 조회하며 남은 값을 먼저 비우고 새로 채운다.
  const [cardFillPending, setCardFillPending] = useState(false);

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
      setSaves(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from("wonseo_cards")
      .select("id, university, department, category, sub_category, enrollment, recent_results, level, calculated_grade")
      .eq("student_id", id)
      .order("sort_order", { ascending: true })
      .then(({ data }) => setMyCards(data ?? []));
    loadSaves(id);
  }

  function loadSaves(id: string) {
    setSavesLoading(true);
    const supabase = createClient();
    supabase
      .from("admission_probability_saves")
      .select("*")
      .eq("student_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setSaves((data as AdmissionProbabilitySave[] | null) ?? []);
        setSavesLoading(false);
      });
  }

  /** 지금 나온 결과를 저장 목록에 추가한다. 다시 계산하지 않고도 목록에서 바로 확률을
   * 보여줄 수 있도록, 계산 시점의 입력값과 결과 요약을 함께 스냅샷으로 저장한다. */
  async function handleSaveResult() {
    if (!ok || !profile) return;
    if (!teacherStudentId) {
      showToast("먼저 학생을 선택해 주세요.", "error");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const input: AdmissionProbabilitySaveInput = {
      userScore: form.userScore,
      targetQuota: form.targetQuota,
      expectedCompetition: form.expectedCompetition,
      c50: form.c50,
      c70: form.c70,
      quota: form.quota,
      turnover: form.turnover,
      applicants: form.applicants,
    };
    const { error } = await supabase.from("admission_probability_saves").insert({
      student_id: teacherStudentId,
      university: form.university,
      department: form.department.trim() || null,
      admission_type: form.admissionType.trim() || null,
      input,
      prob: ok.prob,
      prob_low: ok.probLow,
      prob_high: ok.probHigh,
      p50_predicted: ok.p50Predicted,
      p70_predicted: ok.p70Predicted,
      created_by: profile.id,
    });
    setSaving(false);
    if (error) {
      showToast("저장하지 못했어요.", "error");
      return;
    }
    showToast("결과를 저장했어요.", "success");
    loadSaves(teacherStudentId);
  }

  /** 저장된 결과를 폼에 다시 채우고, 그래프까지 보여주기 위해 같은 입력으로 한 번 더
   * 계산한다(목록 요약은 저장된 값을 그대로 쓰고, 다시 계산하지 않는다). */
  async function handleLoadSave(save: AdmissionProbabilitySave) {
    const input = save.input;
    setForm((f) => ({
      ...f,
      university: save.university,
      department: save.department ?? "",
      admissionType: save.admission_type ?? "",
      userScore: input.userScore,
      targetQuota: input.targetQuota,
      expectedCompetition: input.expectedCompetition,
      c50: input.c50,
      c70: input.c70,
      quota: input.quota,
      turnover: input.turnover,
      applicants: input.applicants,
    }));
    setDeptCandidates(null);
    const parsedScore = parseNum(input.userScore);
    setQueriedScore(parsedScore);
    setQuerying(true);
    try {
      const model = await loadKernelModel();
      const estimatorInput: EstimatorInput = {
        userScore: parsedScore,
        targetQuota: parseIntNum(input.targetQuota),
        expectedCompetition: parseNum(input.expectedCompetition),
        c50: input.c50.map(parseNum) as Triple,
        c70: input.c70.map(parseNum) as Triple,
        quota: input.quota.map(parseIntNum) as Triple,
        turnover: input.turnover.map(parseIntNum) as Triple,
      };
      setResult(estimateAdmission(estimatorInput, model));
    } catch {
      showToast("결과를 다시 계산하지 못했어요.", "error");
    } finally {
      setQuerying(false);
    }
  }

  async function handleDeleteSave(save: AdmissionProbabilitySave) {
    const supabase = createClient();
    const { error } = await supabase.from("admission_probability_saves").delete().eq("id", save.id);
    if (error) {
      showToast("삭제하지 못했어요.", "error");
      return;
    }
    setSaves((prev) => prev?.filter((s) => s.id !== save.id) ?? null);
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
    setCardFillPending(true);
  }

  /** 대학·학과·전형 선택 팝업이 완료되면(카드로 불러왔든 직접 골랐든) 바로 실행된다.
   * 대학·학과·전형은 팝업이 이미 admission_cutoffs 실제 데이터 기준으로 골라준 값이라
   * 그대로 채우고, 올해 모집 정원·과거 3개년 입결은 저장된 데이터에서 찾아 채운다.
   *
   * 카드에서 불러온 직후라면(cardFillPending) 카드가 이미 채운 값을 덮어쓰지 않는다 —
   * 학생이 직접 적어 둔 값이 우선이고, DB 조회는 빈 칸만 메꾸는 용도다. 반대로 카드 없이
   * 대학·학과·전형만 직접 새로 고른 거라면, 이전에 다른 학과를 조회하며 채워졌던 값이
   * 그대로 남아 있으면 안 되므로(예: A학과의 모집 정원이 B학과에도 남아 있는 것처럼
   * 보이는 문제) 먼저 비우고 새로 채운다. */
  function handlePicked(uni: string, dept: string | null, type: string) {
    const departmentStr = dept ?? "";
    const fromCard = cardFillPending;
    setCardFillPending(false);
    setForm((f) => ({
      ...(fromCard
        ? f
        : { ...f, targetQuota: "", c50: ["", "", ""], c70: ["", "", ""], quota: ["", "", ""], turnover: ["", "", ""], applicants: ["", "", ""] }),
      university: uni,
      department: departmentStr,
      admissionType: type,
    }));
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

  function openCompetitionModal() {
    if (!form.university.trim() || !form.department.trim()) {
      showToast("먼저 대학·학과·전형을 선택해 주세요.", "error");
      return;
    }
    setCompetitionModalOpen(true);
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
        <h3 className="text-sm font-bold text-slate-800">합격 가능성 추정</h3>
        <p className="text-[11px] text-slate-400">과거 입결 기반 통계적 추정치입니다</p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
        {/* 입력 */}
        <div className="space-y-4">
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
            onClick={() => {
              setCardPickerOpen(true);
              setCardFillPending(false);
            }}
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
            <div className="flex flex-wrap gap-1.5">
              <input
                type="number"
                step="0.01"
                value={form.expectedCompetition}
                onChange={(e) => updateField("expectedCompetition", e.target.value)}
                className="no-spinner flex-1 min-w-0 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={openCompetitionModal}
                className="shrink-0 whitespace-nowrap flex items-center gap-1 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                작년
              </button>
              <a
                href="https://apply.jinhakapply.com/SmartRatio"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 whitespace-nowrap flex items-center gap-1 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                실시간(진)
              </a>
              <a
                href="https://info.uway.com/power/?isApply=1"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 whitespace-nowrap flex items-center gap-1 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                실시간(유)
              </a>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="text-xs border-collapse w-full">
              <caption className="text-left text-xs font-bold text-slate-700 pb-2">과거 3개년 입결</caption>
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

        {teacherStudentId && (
          <Card className="space-y-2">
            <p className="text-xs font-bold text-slate-700">
              저장된 결과{saves && saves.length > 0 && ` ${saves.length}`}
            </p>
            {savesLoading ? (
              <p className="text-[11px] text-slate-400">불러오는 중...</p>
            ) : !saves || saves.length === 0 ? (
              <p className="text-[11px] text-slate-400">아직 저장된 결과가 없어요. 결과를 조회한 뒤 저장해 보세요.</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {saves.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => void handleLoadSave(s)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-xs font-bold text-slate-800 truncate">
                        {s.university}
                        {s.department && ` · ${s.department}`}
                        {s.admission_type && ` · ${s.admission_type}`}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {s.input.userScore}등급 · {s.prob_low}~{s.prob_high}% ·{" "}
                        {new Date(s.created_at).toLocaleDateString("ko-KR")}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteSave(s)}
                      className="shrink-0 w-7 h-7 rounded-lg hover:bg-rose-100 text-rose-500 flex items-center justify-center"
                      aria-label="저장된 결과 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
        </div>

        {/* 결과 */}
        <div className="space-y-4">
          <Card className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] text-slate-400">{deptLabel || "대학·학과를 입력하면 표시됩니다"}</p>
              {!result && <p className="text-lg font-bold text-slate-400">분석 대기중</p>}
              {result && "insufficient" in result && <p className="text-lg font-bold text-slate-400">데이터 부족</p>}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-900">{ok ? `${ok.probLow}~${ok.probHigh}%` : "—"}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">추정 합격 가능성</p>
              </div>
              {ok && (
                <button
                  type="button"
                  onClick={() => void handleSaveResult()}
                  disabled={saving}
                  className="shrink-0 flex items-center gap-1 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  {saving ? "저장 중..." : "저장"}
                </button>
              )}
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
                    최근 몇 년간의 실제 입결 데이터를 바탕으로 통계적으로 계산해요. 다만 참고 자료일 뿐,
                    실제 합격을 보장하지는 않아요.
                  </p>

                  <div className="space-y-3">
                    <StepRow n={1} title="과거 입결 데이터 참고">
                      최근 몇 년간 쌓인 전국 학생부 교과 전형 입결 데이터를 폭넓게 참고해요. 컷의 흐름,
                      정원 변화, 경쟁률처럼 비슷한 상황의 과거 사례들을 살펴봐요.
                    </StepRow>
                    <StepRow n={2} title="50%·70%컷 예측">
                      참고한 과거 데이터를 바탕으로 이번 해 50%·70%컷을 예측해요. 어쩌다 한 번 크게 튄
                      값에 휘둘리지 않도록, 가장 흔하게 나타나는 값에 가깝게 계산해요.
                    </StepRow>
                    <StepRow n={3} title="지원 분포 추정">
                      모집인원과 충원인원을 종합적으로 참고해서 지원 분포를 추측하고, 등록이 끝날 때까지
                      성적이 얼마나 더 밀릴 수 있는지를 계산해요.
                    </StepRow>
                    <StepRow n={4} title="수많은 가상 시나리오로 확률 계산" last>
                      위 정보들을 조합해 수천 번의 가상 시나리오를 계산하고, 그중 지금 성적으로
                      합격했을 경우가 몇 %인지 세어 확률로 보여줘요. 그래서 숫자 하나가 아니라 범위로
                      나와요 — 참고할 수 있는 데이터가 많을수록 범위가 좁아지고, 적을수록 넓어져요.
                    </StepRow>
                  </div>

                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <p className="text-xs font-bold text-slate-700">사용된 통계적 원리</p>

                    <div className="space-y-3">
                      <div>
                        <p className="font-bold text-slate-800 text-xs mb-1">① 국소가중회귀(커널 기반 유사도)</p>
                        <p>
                          학과를 몇 가지 수치(컷의 평균 수준, 최근 추세, 정원 증감, 정규화한 경쟁률)로
                          이루어진 벡터로 표현하고, 목표 학과와의 거리가 가까울수록 큰 가중치를 부여하는
                          가우시안 커널 함수를 사용해요. 통계학에서 국소가중회귀(local weighted
                          regression) 또는 Nadaraya–Watson 커널 회귀라 불리는 방식으로, 전체 평균을 내는
                          대신 &ldquo;지금 상황과 비슷한 사례일수록 더 많이 반영&rdquo;하는 방법이에요.
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-xs mb-1">② 가중중앙값(로버스트 통계량)</p>
                        <p>
                          50%·70%컷 예측에는 가중평균이 아니라 가중중앙값을 사용해요. 입결 데이터처럼
                          소수의 극단적 사례(미충원, 대규모 추가합격 등)가 꼬리를 만드는 비대칭
                          분포에서는, 평균이 그 극단치에 쉽게 끌려가는 반면 중앙값은 이런 이상치에
                          상대적으로 영향을 덜 받는(robust) 성질이 있어요.
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-xs mb-1">③ 로그선형회귀</p>
                        <p>
                          합격자수가 늘어날수록 합격선이 50%·70%컷보다 더 크게 밀리지만, 그 증가폭은
                          합격자수에 선형으로 비례하지 않고 체감(diminishing marginal effect)하는
                          형태를 보여요. 이런 승수적 관계는 원값 그대로 선형회귀를 적용하면 왜곡되지만,
                          독립변수에 로그를 취해 y = a + b·ln(x) 형태로 근사하면(로그선형모형) 다시
                          선형 관계로 다룰 수 있어요.
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-xs mb-1">④ 몬테카를로 시뮬레이션(붓스트랩 재표집)</p>
                        <p>
                          등록 합격선을 하나의 확정값으로 두지 않고, 확률분포로 취급해요. 국소가중회귀에서
                          구한 가중치를 확률처럼 사용해 과거 실제 컷 값들을 반복 복원추출(bootstrap
                          resampling)하고, 여기에 로그선형회귀가 갖는 추정 오차를 정규분포 형태의
                          노이즈로 더해, 수천 번의 가상 시나리오를 만들어요. 최종 합격확률은 그
                          시나리오들 중 실제로 합격 조건을 만족하는 비율을 그대로 세어서 구해요 —
                          로지스틱 함수 같은 별도의 확률 변환식을 쓰지 않아요.
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-slate-800 text-xs mb-1">⑤ 유효표본수 기반 신뢰구간</p>
                        <p>
                          확률을 하나의 숫자 대신 범위로 보여주는 이유는, 가중치를 사용한 추정값의
                          불확실성을 통계학의 유효표본수(effective sample size, Kish&apos;s
                          approximation) 개념으로 정량화했기 때문이에요. 참고할 수 있는 비슷한 사례가
                          많을수록(유효표본수가 클수록) 범위가 좁아지고, 적을수록 넓어져요.
                        </p>
                      </div>
                    </div>
                  </div>
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

      <Modal
        open={competitionModalOpen}
        onClose={() => setCompetitionModalOpen(false)}
        title="작년 경쟁률"
        icon={<TrendingUp className="w-4 h-4 text-indigo-600" />}
        maxWidth="max-w-xl"
      >
        <p className="text-xs text-slate-400 -mt-1">
          {form.university}
          {form.department && ` · ${form.department}`}
          {form.admissionType && ` · ${form.admissionType}`}
        </p>
        <CompetitionResultPanel
          open={competitionModalOpen}
          university={form.university}
          department={form.department}
          hintAdmissionType={form.admissionType}
          bare
        />
      </Modal>
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
