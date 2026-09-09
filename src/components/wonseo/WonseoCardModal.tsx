"use client";

import { useEffect, useRef, useState } from "react";
import { Download, GraduationCap, Paperclip, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { AutocompleteInput } from "@/components/ui/AutocompleteInput";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/providers/ToastProvider";
import { WonseoImageThumb } from "@/components/wonseo/WonseoImageThumb";
import { RecentResultsEditor } from "@/components/wonseo/RecentResultsEditor";
import {
  fetchRecentResultsBestEffort,
  mergeCutoffsIntoYears,
  searchCutoffCandidatesWithPreview,
  trackFromCategory,
  type CutoffCandidatePreview,
} from "@/lib/admission-cutoff-lookup";
import {
  findOfferingMatch,
  listOfferingCandidates,
  trackForOffering,
  type MergedOffering,
} from "@/lib/admission-offering-lookup";
import { emptyResultYear } from "@/components/wonseo/RecentResultsTable";
import { buildStoragePath, deleteWonseoImageFile, uploadWonseoImage } from "@/lib/wonseo-storage";
import {
  prefetchUniversities,
  searchAdmissionTypes,
  searchDepartments,
  searchUniversities,
} from "@/lib/admission-offering-autocomplete";
import {
  LEVEL_OPTIONS,
  LEVEL_TOGGLE_STYLE,
  QUICK_CATEGORY_OPTIONS,
  STATUS_OPTIONS,
} from "@/lib/wonseo-constants";
import { cn } from "@/lib/cn";
import type {
  ApplicationCategory,
  ApplicationStatus,
  RecentResultYear,
  SelectionMode,
  SupportLevel,
  WonseoCard,
  WonseoImage,
} from "@/lib/database.types";

interface FormState {
  rank: string;
  level: SupportLevel;
  status: ApplicationStatus;
  university: string;
  department: string;
  enrollment: string;
  category: ApplicationCategory;
  subCategory: string;
  selectionMode: SelectionMode;
  stageSingle: string;
  stage1: string;
  stage2: string;
  calculatedGrade: string;
  minStandard: string;
  memo: string;
  recentResults: RecentResultYear[];
}

const EMPTY_FORM: FormState = {
  rank: "",
  level: "적정",
  status: "지원예정",
  university: "",
  department: "",
  enrollment: "",
  category: "학생부교과",
  subCategory: "",
  selectionMode: "single",
  stageSingle: "",
  stage1: "",
  stage2: "",
  calculatedGrade: "",
  minStandard: "",
  memo: "",
  recentResults: [],
};

function defaultRecentResultYears(): RecentResultYear[] {
  const thisYear = new Date().getFullYear();
  return [thisYear, thisYear - 1, thisYear - 2].map((y) => emptyResultYear(String(y)));
}

function cardToForm(card: WonseoCard): FormState {
  return {
    rank: card.rank ?? "",
    level: card.level,
    status: card.status,
    university: card.university ?? "",
    department: card.department ?? "",
    enrollment: card.enrollment != null ? String(card.enrollment) : "",
    category: card.category,
    subCategory: card.sub_category ?? "",
    selectionMode: card.selection_mode,
    stageSingle: card.stage_single ?? "",
    stage1: card.stage_1 ?? "",
    stage2: card.stage_2 ?? "",
    calculatedGrade: card.calculated_grade ?? "",
    minStandard: card.min_standard ?? "",
    memo: card.memo ?? "",
    recentResults: card.recent_results ?? [],
  };
}

export function WonseoCardModal({
  open,
  onClose,
  studentId,
  editingCard,
  canEditStatus,
  nextSortOrder,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  editingCard: WonseoCard | null;
  canEditStatus: boolean;
  nextSortOrder?: number;
  onSaved: () => void;
}) {
  const showToast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [existingImages, setExistingImages] = useState<WonseoImage[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [universityError, setUniversityError] = useState(false);
  const universityRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [offeringOptions, setOfferingOptions] = useState<MergedOffering[] | null>(null);
  const [cutoffCandidates, setCutoffCandidates] = useState<CutoffCandidatePreview[] | null>(null);
  const [findingSimilarCutoffs, setFindingSimilarCutoffs] = useState(false);
  const [cutoffSourceNote, setCutoffSourceNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    prefetchUniversities();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(
      editingCard
        ? cardToForm(editingCard)
        : { ...EMPTY_FORM, recentResults: defaultRecentResultYears() },
    );
    setNewFiles([]);
    setUniversityError(false);
    setCutoffSourceNote(null);
    if (editingCard) {
      const supabase = createClient();
      supabase
        .from("wonseo_images")
        .select("*")
        .eq("card_id", editingCard.id)
        .then(({ data }) => setExistingImages(data ?? []));
    } else {
      setExistingImages([]);
    }
  }, [open, editingCard]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /**
   * 확인 모달에서 사용자가 실제로 골랐을 때만 호출된다. offering을 카드 필드(세부 전형명/
   * 전형 유형/전형방법/수능최저학력기준/모집인원)에 채우고, 같은 대학·학과·전형으로 최근
   * 3개년 입결도 조용히 함께 채운다 — 확인 한 번으로 2027학년도 전형데이터와 2024~2026학년도
   * 입결이 한꺼번에 나오는 구조. 최근입결이 애매하면(전형명 표기가 두 원본 사이에서 다를 수
   * 있어) 가장 비슷한 것 하나만 골라서 채우고, 그마저 안 되면 다시 묻지 않고 비워 둔다. 전부
   * 그대로 수정 가능(읽기 전용 아님).
   */
  async function applyOffering(university: string, department: string, offering: MergedOffering) {
    setForm((f) => ({
      ...f,
      subCategory: offering.admissionType || f.subCategory,
      category: offering.track || f.category,
      enrollment: offering.enrollment != null ? String(offering.enrollment) : f.enrollment,
      minStandard: offering.minStandard || f.minStandard,
      selectionMode: offering.selectionMode,
      stageSingle: offering.selectionMode === "single" ? offering.methodSingle || f.stageSingle : f.stageSingle,
      stage1: offering.selectionMode === "multi" ? offering.methodStage1 || f.stage1 : f.stage1,
      stage2: offering.selectionMode === "multi" ? offering.methodStage2 || f.stage2 : f.stage2,
    }));
    setOfferingOptions(null);
    showToast(`${offering.admissionType} 전형 정보를 불러옵니다.`, "success");

    const years = await fetchRecentResultsBestEffort(
      university,
      department,
      trackFromCategory(offering.track),
      offering.admissionType,
    );
    if (years.length > 0) {
      setForm((f) => ({ ...f, recentResults: mergeCutoffsIntoYears(f.recentResults, years) }));
    }
  }

  /** 후보를 확인 모달에 띄운다. 하나도 없으면 안내만 하고 모달은 띄우지 않는다. */
  function presentOfferingOptions(candidates: MergedOffering[]) {
    if (candidates.length === 0) {
      showToast("일치하는 전형 정보를 찾을 수 없습니다. 직접 입력해주세요.", "error");
      return;
    }
    setOfferingOptions(candidates);
  }

  /**
   * 대학+모집단위+세부전형명이 모두 채워졌을 때(정확 매칭)만 쓴다. 셋 중 하나라도 비어
   * 있으면 조용히 아무것도 하지 않는다. 매칭 결과가 하나뿐이어도 바로 채우지 않고 확인
   * 모달을 띄운다 — 매칭이 틀렸을 가능성이 있으니 반영 전에 항상 사용자가 확인한다.
   */
  async function applyOfferingMatch(university: string, department: string, admissionType: string) {
    const uni = university.trim();
    const dept = department.trim();
    const type = admissionType.trim();
    if (!uni || !dept || !type) return;
    const result = await findOfferingMatch(uni, dept, type);
    if (result.kind === "none") {
      showToast("일치하는 전형 정보를 찾을 수 없습니다. 직접 입력해주세요.", "error");
      return;
    }
    presentOfferingOptions(result.kind === "matched" ? [result.offering] : result.options);
  }

  /**
   * 세부 전형명을 아직 안 골랐을 때, 대학+모집단위(및 고른 전형 유형)에 있는 이투스 전형을
   * 전부 훑어서 확인 모달에 띄운다(하나뿐이어도 확인 모달을 거친다).
   */
  async function browseOfferings(university: string, department: string) {
    const candidates = await listOfferingCandidates(university, department, trackForOffering(form.category));
    presentOfferingOptions(candidates);
  }

  /**
   * "불러오기"는 오직 이 버튼을 눌렀을 때만 동작한다(대학·학과·세부 전형명을 타이핑하거나
   * 자동완성에서 고르는 동작만으로는 아무것도 자동으로 채우지 않는다). 세부 전형명까지
   * 입력되어 있으면 정확 매칭, 아니면 대학+학과로 전형데이터를 훑어서 채운다.
   */
  async function handleImport() {
    const uni = form.university.trim();
    const dept = form.department.trim();
    if (!uni || !dept) {
      showToast("대학교명과 모집단위를 먼저 입력해 주세요.", "error");
      return;
    }
    setImporting(true);
    try {
      const sub = form.subCategory.trim();
      if (sub) {
        await applyOfferingMatch(uni, dept, sub);
      } else {
        await browseOfferings(uni, dept);
      }
    } catch {
      showToast("전형 정보를 불러오지 못했습니다.", "error");
    } finally {
      setImporting(false);
    }
  }

  /**
   * "최근 입결" 표가 비어 있을 때 쓴다 — 대학명·학과명이 전형데이터와 정확히 일치하는
   * 입결이 없는 경우(대학의 학과 개편·명칭 변경 등)를 위해, 이름이 비슷한 다른 학과의
   * 입결을 후보로 찾아 보여준다. 절대 자동으로 채우지 않고 사용자가 직접 골라야 한다 —
   * 완전히 다른 학과일 수도 있어서다.
   */
  async function findSimilarCutoffs() {
    const uni = form.university.trim();
    const dept = form.department.trim();
    if (!uni || !dept) return;
    setFindingSimilarCutoffs(true);
    try {
      const candidates = await searchCutoffCandidatesWithPreview(
        uni,
        dept,
        trackFromCategory(form.category),
        form.subCategory.trim(),
      );
      if (candidates.length === 0) {
        showToast("비슷한 학과의 입결 데이터를 찾을 수 없습니다.", "error");
        return;
      }
      setCutoffCandidates(candidates);
    } catch {
      showToast("입결 데이터를 불러오지 못했습니다.", "error");
    } finally {
      setFindingSimilarCutoffs(false);
    }
  }

  /** 참고용 후보 하나를 골랐을 때 표에 채운다. 어느 학과에서 왔는지 표 아래에 남겨 둔다. */
  function applyCutoffCandidate(candidate: CutoffCandidatePreview) {
    setForm((f) => ({ ...f, recentResults: mergeCutoffsIntoYears(f.recentResults, candidate.years) }));
    setCutoffSourceNote(`${candidate.university} ${candidate.department}`);
    setCutoffCandidates(null);
    showToast(`${candidate.university} ${candidate.department} 입결을 참고용으로 불러옵니다.`, "success");
  }

  const isCustomCategory = !(QUICK_CATEGORY_OPTIONS as readonly string[]).includes(form.category);

  async function handleRemoveExistingImage(img: WonseoImage) {
    const supabase = createClient();
    await supabase.from("wonseo_images").delete().eq("id", img.id);
    await deleteWonseoImageFile(img.storage_path);
    setExistingImages((prev) => prev.filter((i) => i.id !== img.id));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setNewFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  }

  async function handleSave() {
    if (!form.university.trim()) {
      setUniversityError(true);
      showToast("대학교명을 입력해 주세요.", "error");
      universityRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      universityRef.current?.focus();
      return;
    }
    setUniversityError(false);
    setSaving(true);
    const supabase = createClient();

    const payload = {
      student_id: studentId,
      rank: form.rank.trim() || null,
      level: form.level,
      status: form.status,
      university: form.university.trim(),
      department: form.department.trim() || null,
      enrollment: form.enrollment.trim() ? Number(form.enrollment.trim()) : null,
      category: form.category,
      sub_category: form.subCategory.trim() || null,
      selection_mode: form.selectionMode,
      stage_single: form.selectionMode === "single" ? form.stageSingle.trim() || null : null,
      stage_1: form.selectionMode === "multi" ? form.stage1.trim() || null : null,
      stage_2: form.selectionMode === "multi" ? form.stage2.trim() || null : null,
      calculated_grade: form.calculatedGrade.trim() || null,
      min_standard: form.minStandard.trim() || null,
      memo: form.memo.trim() || null,
      recent_results: form.recentResults,
      updated_at: new Date().toISOString(),
    };

    let cardId = editingCard?.id ?? null;

    if (cardId) {
      const { error } = await supabase.from("wonseo_cards").update(payload).eq("id", cardId);
      if (error) {
        showToast("저장에 실패했습니다.", "error");
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("wonseo_cards")
        .insert({ ...payload, sort_order: nextSortOrder ?? 0 })
        .select("id")
        .single();
      if (error || !data) {
        showToast("저장에 실패했습니다.", "error");
        setSaving(false);
        return;
      }
      cardId = data.id;
    }

    for (const file of newFiles) {
      const path = buildStoragePath(studentId, cardId, file);
      try {
        await uploadWonseoImage(path, file);
        await supabase.from("wonseo_images").insert({
          card_id: cardId,
          student_id: studentId,
          storage_path: path,
        });
      } catch {
        showToast(`${file.name} 업로드에 실패했습니다.`, "error");
      }
    }

    setSaving(false);
    showToast("저장되었습니다.", "success");
    onSaved();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingCard ? "수시 원서 카드 수정" : "수시 원서 카드 등록"}
      icon={<GraduationCap className="w-4 h-4 text-indigo-600" />}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 transition"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs disabled:opacity-60"
          >
            {saving ? "저장 중..." : "저장하기"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-bold text-slate-700 mb-1">지망 순위</label>
          <input
            value={form.rank}
            onChange={(e) => set("rank", e.target.value)}
            placeholder="예: 1지망"
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-1">지원 정도</label>
          <div className="grid grid-cols-4 gap-1.5">
            {LEVEL_OPTIONS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => set("level", level)}
                className={cn(
                  "py-2 rounded-xl border font-bold transition",
                  form.level === level
                    ? LEVEL_TOGGLE_STYLE[level].active
                    : LEVEL_TOGGLE_STYLE[level].inactive,
                )}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
      </div>

      {canEditStatus && (
        <div className="border-t border-b border-slate-100 py-2.5">
          <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between">
            <span>진행 / 합격 상태</span>
            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              선생님 전용
            </span>
          </label>
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value as ApplicationStatus)}
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <label className="block font-bold text-slate-700">학교 · 학과 정보</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-bold text-slate-700 mb-1">
            대학교명 {universityError && <span className="text-rose-500">(필수)</span>}
          </label>
          <AutocompleteInput
            ref={universityRef}
            value={form.university}
            onChange={(v) => {
              set("university", v);
              if (universityError) setUniversityError(false);
            }}
            onSearch={searchUniversities}
            placeholder="OO대학교"
            className={cn(
              "w-full bg-slate-50 border rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2",
              universityError
                ? "border-rose-400 focus:ring-rose-400"
                : "border-slate-300 focus:ring-indigo-500",
            )}
          />
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-1">모집단위 / 학과</label>
          <AutocompleteInput
            value={form.department}
            onChange={(v) => set("department", v)}
            onSearch={(q) => searchDepartments(q, form.university)}
            placeholder="OO학과 또는 OO학부"
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block font-bold text-slate-700 mb-1">전형 유형</label>
          <div className="grid grid-cols-3 gap-1.5">
            {QUICK_CATEGORY_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => set("category", opt)}
                className={cn(
                  "py-2 rounded-xl border font-bold text-[11px] sm:text-xs transition",
                  form.category === opt
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                )}
              >
                {opt}
              </button>
            ))}
            <button
              type="button"
              onClick={() => !isCustomCategory && set("category", "")}
              className={cn(
                "py-2 rounded-xl border font-bold text-[11px] sm:text-xs transition",
                isCustomCategory
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >
              직접입력
            </button>
          </div>
          {isCustomCategory && (
            <input
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="전형 유형을 입력하세요"
              autoFocus
              className="w-full mt-1.5 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-1">세부 전형명</label>
          <AutocompleteInput
            value={form.subCategory}
            onChange={(v) => set("subCategory", v)}
            onSearch={
              form.university.trim()
                ? (q) =>
                    searchAdmissionTypes(
                      q,
                      form.university,
                      form.department,
                      trackForOffering(form.category),
                    )
                : undefined
            }
            revealOnFocus
            placeholder="예: 지역균형전형 / 일반전형"
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleImport}
        disabled={importing}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition disabled:opacity-60"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{importing ? "전형데이터 검색 중..." : "위 정보로 전형데이터 불러오기"}</span>
      </button>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between">
          <label className="block font-bold text-slate-700">전형 방법</label>
          <div className="flex items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1 cursor-pointer font-semibold text-slate-700">
              <input
                type="radio"
                checked={form.selectionMode === "single"}
                onChange={() => set("selectionMode", "single")}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>일괄전형</span>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer font-semibold text-slate-700">
              <input
                type="radio"
                checked={form.selectionMode === "multi"}
                onChange={() => set("selectionMode", "multi")}
                className="text-indigo-600 focus:ring-indigo-500"
              />
              <span>단계별 전형</span>
            </label>
          </div>
        </div>

        {form.selectionMode === "single" ? (
          <input
            value={form.stageSingle}
            onChange={(e) => set("stageSingle", e.target.value)}
            placeholder="예: 서류 100% 또는 교과 100%"
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-0.5">1단계</label>
              <input
                value={form.stage1}
                onChange={(e) => set("stage1", e.target.value)}
                placeholder="예: 서류 100% (3배수)"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-0.5">2단계</label>
              <input
                value={form.stage2}
                onChange={(e) => set("stage2", e.target.value)}
                placeholder="예: 1단계 70% + 면접 30%"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block font-bold text-slate-700 mb-1">수능 최저학력기준</label>
          <textarea
            value={form.minStandard}
            onChange={(e) => set("minStandard", e.target.value)}
            rows={2}
            placeholder="2합5 / 없음"
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-1">모집인원</label>
          <input
            value={form.enrollment}
            onChange={(e) => set("enrollment", e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="예: 10"
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block font-bold text-slate-700 mb-1">대학별 산출 등급</label>
          <input
            value={form.calculatedGrade}
            onChange={(e) => set("calculatedGrade", e.target.value)}
            placeholder="1.00 또는 970점"
            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <RecentResultsEditor
        years={form.recentResults}
        onChange={(next) => set("recentResults", next)}
        onFindSimilar={findSimilarCutoffs}
        findingSimilar={findingSimilarCutoffs}
        sourceNote={cutoffSourceNote}
      />

      <Modal
        open={offeringOptions != null}
        onClose={() => setOfferingOptions(null)}
        title="불러올 전형 정보를 확인해 주세요"
        maxWidth="max-w-sm"
      >
        <p className="flex items-start gap-1.5 text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5">
          <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            본 정보는 참고용이며 실제와 다를 수 있습니다. 지원 전 반드시 해당 대학 입학처 공식
            모집요강을 확인하세요!
          </span>
        </p>
        <p className="text-[11px] text-slate-400">
          {offeringOptions && offeringOptions.length > 1
            ? "입력한 대학·모집단위에 전형이 여러 개 있어요. 지원하는 전형을 선택하면 전형방법·수능최저학력기준·모집인원과 최근 입결이 함께 채워져요."
            : "아래 내용으로 전형방법·수능최저학력기준·모집인원과 최근 입결을 채울게요. 맞으면 선택해 주세요."}
        </p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {offeringOptions?.map((opt, i) => (
            <button
              key={`${opt.admissionType}-${i}`}
              type="button"
              onClick={() => applyOffering(form.university.trim(), form.department.trim(), opt)}
              className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition"
            >
              <div>
                <div className="font-bold text-slate-800">{opt.admissionType}</div>
                <div className="text-slate-400 text-[10px] mt-0.5">
                  {opt.track} · {opt.methodSingle || `${opt.methodStage1} → ${opt.methodStage2}`} · 모집{" "}
                  {opt.enrollment ?? "-"}명
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-bold text-indigo-600">확인</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={cutoffCandidates != null}
        onClose={() => setCutoffCandidates(null)}
        title="비슷한 학과의 입결을 확인해 주세요"
        maxWidth="max-w-sm"
      >
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {form.university} {form.department}와(과) 이름이 비슷한 다른 학과의 입결이에요. 학과 개편·명칭
            변경으로 실제 같은 전형일 수도, 전혀 다른 학과일 수도 있으니 참고용으로만 확인하세요.
          </span>
        </p>
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {cutoffCandidates?.map((c) => (
            <button
              key={`${c.university}-${c.department}`}
              type="button"
              onClick={() => applyCutoffCandidate(c)}
              className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition"
            >
              <div>
                <div className="font-bold text-slate-800">
                  {c.university} · {c.department}
                </div>
                <div className="text-slate-400 text-[10px] mt-0.5">
                  {c.years[0]?.year}학년도 · 모집 {c.years[0]?.enrollment ?? "-"}명 · 경쟁률{" "}
                  {c.years[0]?.competition_rate ?? "-"}
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-bold text-indigo-600">확인</span>
            </button>
          ))}
        </div>
      </Modal>

      <div>
        <label className="block font-bold text-slate-700 mb-1">메모</label>
        <textarea
          value={form.memo}
          onChange={(e) => set("memo", e.target.value)}
          rows={3}
          placeholder="메모할 사항을 자유롭게 입력하세요."
          className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 font-sans text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
        />
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between">
          <label className="block font-bold text-slate-700">이미지 파일 첨부</label>
          <label className="cursor-pointer px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[11px] font-bold transition flex items-center gap-1">
            <Paperclip className="w-3 h-3" />
            <span>사진 선택</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2 pt-1 min-h-[40px]">
          {existingImages.map((img) => (
            <WonseoImageThumb
              key={img.id}
              path={img.storage_path}
              onRemove={() => handleRemoveExistingImage(img)}
            />
          ))}
          {newFiles.map((file, idx) => (
            <div
              key={idx}
              className="relative w-16 h-16 rounded-xl overflow-hidden border border-indigo-200 bg-slate-100 shrink-0"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0 inset-x-0 bg-indigo-600/80 text-white text-[9px] text-center">
                신규
              </span>
            </div>
          ))}
        </div>
      </div>

    </Modal>
  );
}
