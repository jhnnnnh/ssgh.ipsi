"use client";

import { useEffect, useState } from "react";
import { Search, TrendingUp, FileBarChart, ExternalLink, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/providers/ToastProvider";
import { useAuth } from "@/components/providers/AuthProvider";
import { createClient } from "@/lib/supabase/client";
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
  type CutoffLookupGroup,
  type CutoffCandidatePreview,
} from "@/lib/admission-cutoff-lookup";
import {
  fetchCompetitionUniversityOptions,
  fetchCompetitionDepartmentOptions,
  fetchCompetitionAdmissionTypeOptions,
} from "@/lib/admission-competition-lookup";
import { listOfferingCandidates, type MergedOffering } from "@/lib/admission-offering-lookup";
import { CompetitionResultPanel } from "@/components/wonseo/CompetitionResultPanel";
import { CascadingPickerModal } from "@/components/wonseo/CascadingPickerModal";
import type { CompetitionSeries } from "@/lib/admission-competition-lookup";
import type { AdmissionCompetitionSave, Roster, WonseoCard } from "@/lib/database.types";

const ROWS: { key: "enrollment" | "competition_rate" | "additional_pass" | "grade_50" | "grade_70"; label: string }[] = [
  { key: "enrollment", label: "모집인원" },
  { key: "competition_rate", label: "경쟁률" },
  { key: "additional_pass", label: "충원인원" },
  { key: "grade_50", label: "50% 컷" },
  { key: "grade_70", label: "70% 컷" },
];

type MyCard = Pick<WonseoCard, "id" | "university" | "department" | "category" | "sub_category" | "level">;

/** 세부 전형명이 비어 있으면 전부 통과, 있으면 느슨한(비슷한 이름 포함) 매칭만 통과시킨다.
 * admissionTypeSimilarity를 쓰므로 트랙(교과/종합)이 다르면 무조건 걸러지고, 같은 전형을
 * 두 원본이 표기만 다르게 적어도(예: "교과(지역인재)" vs "지역인재전형(교과)") 잡힌다. */
function matchesHint(admissionType: string, hint: string): boolean {
  if (!hint) return true;
  return admissionTypeSimilarity(admissionType, hint) > 0;
}

function OfferingMethod({ o }: { o: MergedOffering }) {
  if (o.selectionMode === "single") return <>{o.methodSingle || "-"}</>;
  return (
    <>
      1단계 {o.methodStage1 || "-"} · 2단계 {o.methodStage2 || "-"}
    </>
  );
}

/**
 * 대입 정보 조회 탭: (1) "모집 정보 및 입결 조회"에서 대학+학과(+세부전형)로 이번 학년도
 * 모집정보(이투스 전형데이터)와 최근 3개년 입결(대학어디가)을 함께 보여주고, 정확히
 * 일치하는 데이터가 하나도 없으면 이름이 비슷한 다른 학과를 추천한다. (2) "작년 경쟁률
 * 조회"는 완전히 독립된 검색 상자로, 위 결과를 거치지 않고 바로 작년 경쟁률 그래프를 연다.
 * 둘 다 학생 화면에서는 studentId, 교사 화면에서는 roster를 받아 "내 원서 카드 불러오기"에
 * 쓴다(같은 카드 목록을 두 상자가 함께 쓴다).
 */
export function CutoffLookupTab({
  studentId,
  roster,
}: {
  studentId?: string;
  roster?: Pick<Roster, "student_id" | "name">[];
}) {
  const showToast = useToast();
  const { profile } = useAuth();
  const [university, setUniversity] = useState("");
  const [department, setDepartment] = useState("");
  const [admissionType, setAdmissionType] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [cutoffGroups, setCutoffGroups] = useState<CutoffLookupGroup[]>([]);
  const [offerings, setOfferings] = useState<MergedOffering[]>([]);
  const [candidates, setCandidates] = useState<CutoffCandidatePreview[] | null>(null);
  const [findingCandidates, setFindingCandidates] = useState(false);

  const [lookupPickerOpen, setLookupPickerOpen] = useState(false);

  const [caUniversity, setCaUniversity] = useState("");
  const [caDepartment, setCaDepartment] = useState("");
  const [caAdmissionType, setCaAdmissionType] = useState("");
  const [competitionOpen, setCompetitionOpen] = useState(false);
  const [competitionPickerOpen, setCompetitionPickerOpen] = useState(false);

  const [teacherStudentId, setTeacherStudentId] = useState("");
  const [myCards, setMyCards] = useState<MyCard[] | null>(null);
  const effectiveStudentId = studentId ?? teacherStudentId;

  const [competitionSaves, setCompetitionSaves] = useState<AdmissionCompetitionSave[] | null>(null);
  const [savesLoading, setSavesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    prefetchCutoffUniversities();
  }, []);

  useEffect(() => {
    if (!effectiveStudentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMyCards(null);
      return;
    }
    let active = true;
    const supabase = createClient();
    supabase
      .from("wonseo_cards")
      .select("id, university, department, category, sub_category, level")
      .eq("student_id", effectiveStudentId)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        if (active) setMyCards(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [effectiveStudentId]);

  useEffect(() => {
    if (!effectiveStudentId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCompetitionSaves(null);
      return;
    }
    let active = true;
    loadCompetitionSaves(effectiveStudentId, () => active);
    return () => {
      active = false;
    };
  }, [effectiveStudentId]);

  function loadCompetitionSaves(id: string, stillActive?: () => boolean) {
    setSavesLoading(true);
    const supabase = createClient();
    supabase
      .from("admission_competition_saves")
      .select("*")
      .eq("student_id", id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (stillActive && !stillActive()) return;
        setCompetitionSaves((data as AdmissionCompetitionSave[] | null) ?? []);
        setSavesLoading(false);
      });
  }

  /** 조회된(실제로 일치한) 대학·학과·전형을 그대로 저장한다 — 힌트가 아니라 매칭된 값을
   * 저장해야, 다시 열었을 때도 같은 결과가 곧바로 나온다. */
  async function handleSaveCompetition(series: CompetitionSeries) {
    if (!profile) return;
    if (!effectiveStudentId) {
      showToast("먼저 학생을 선택해 주세요.", "error");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from("admission_competition_saves").insert({
      student_id: effectiveStudentId,
      university: series.university,
      department: series.department,
      admission_type: series.admissionType,
      created_by: profile.id,
    });
    setSaving(false);
    if (error) {
      showToast("저장하지 못했어요.", "error");
      return;
    }
    showToast("경쟁률 조회를 저장했어요.", "success");
    loadCompetitionSaves(effectiveStudentId);
  }

  function handleLoadCompetitionSave(save: AdmissionCompetitionSave) {
    setCaUniversity(save.university);
    setCaDepartment(save.department ?? "");
    setCaAdmissionType(save.admission_type ?? "");
    setCompetitionOpen(true);
  }

  async function handleDeleteCompetitionSave(save: AdmissionCompetitionSave) {
    const supabase = createClient();
    const { error } = await supabase.from("admission_competition_saves").delete().eq("id", save.id);
    if (error) {
      showToast("삭제하지 못했어요.", "error");
      return;
    }
    setCompetitionSaves((prev) => prev?.filter((s) => s.id !== save.id) ?? null);
  }

  async function runSearch(uni: string, dept: string, type: string) {
    if (!uni || !dept) {
      showToast("대학명과 학과명을 입력해 주세요.", "error");
      return;
    }
    setLoading(true);
    setCandidates(null);
    try {
      const [groups, offeringList] = await Promise.all([
        searchCutoffsForLookup(uni, dept),
        listOfferingCandidates(uni, dept),
      ]);
      const filteredGroups = groups.filter((g) => matchesHint(g.admissionType, type));
      const filteredOfferings = offeringList.filter((o) => matchesHint(o.admissionType, type));
      setCutoffGroups(filteredGroups);
      setOfferings(filteredOfferings);
      setSearched(true);

      if (filteredGroups.length === 0 && filteredOfferings.length === 0) {
        setFindingCandidates(true);
        try {
          const found = await searchCutoffCandidatesWithPreview(uni, dept, trackFromCategory(type), type);
          setCandidates(found);
        } finally {
          setFindingCandidates(false);
        }
      }
    } catch {
      showToast("조회에 실패했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }

  function handleLookupPicked(uni: string, dept: string | null, type: string) {
    setUniversity(uni);
    setDepartment(dept ?? "");
    setAdmissionType(type);
    void runSearch(uni, dept ?? "", type);
  }

  function applyCandidate(c: CutoffCandidatePreview) {
    setUniversity(c.university);
    setDepartment(c.department);
    void runSearch(c.university, c.department, admissionType.trim());
  }

  function handleCompetitionPicked(uni: string, dept: string | null, type: string) {
    setCaUniversity(uni);
    setCaDepartment(dept ?? "");
    setCaAdmissionType(type);
    setCompetitionOpen(true);
  }

  const showEmpty = searched && !loading && cutoffGroups.length === 0 && offerings.length === 0;

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">모집 정보 및 입결 조회</h3>
        </div>

        {!studentId && roster && (
          <select
            value={teacherStudentId}
            onChange={(e) => setTeacherStudentId(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
          onClick={() => setLookupPickerOpen(true)}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center gap-1.5 disabled:opacity-60"
        >
          <Search className="w-3.5 h-3.5" />
          <span>{loading ? "조회 중..." : "조회하기"}</span>
        </button>
      </Card>

      {searched && !loading && (offerings.length > 0 || cutoffGroups.length > 0) && (
        <Card className="space-y-4">
          <h3 className="text-base font-bold text-slate-900">
            {university}
            {department && ` · ${department}`}
            {admissionType && ` · ${admissionType}`}
          </h3>

          {offerings.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-bold text-slate-800">모집정보</h4>
              <div className="space-y-2">
                {offerings.map((o) => (
                  <div key={o.admissionType} className="border border-slate-200 rounded-xl p-3 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm">{o.admissionType}</span>
                      {o.track && (
                        <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                          {o.track}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">모집인원 {o.enrollment ?? "-"}명</p>
                    <p className="text-xs text-slate-500">
                      전형방법 <OfferingMethod o={o} />
                    </p>
                    <p className="text-xs text-slate-500">수능최저 {o.minStandard || "없음"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cutoffGroups.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-bold text-slate-800">최근입결</h4>
              <div className="space-y-4">
                {cutoffGroups.map((g) => (
                  <div key={g.admissionType} className="border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 text-sm">{g.admissionType}</span>
                      {g.track && (
                        <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                          {g.track}
                        </span>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="text-xs border-collapse w-full">
                        <thead>
                          <tr>
                            <th className="text-left p-1.5 sticky left-0 bg-white" />
                            {g.years.map((y) => (
                              <th key={y.year} className="p-1.5 text-center font-bold text-slate-700">
                                {y.year}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ROWS.map((row, idx) => (
                            <tr key={row.key} className={idx % 2 === 1 ? "bg-slate-50/60" : undefined}>
                              <td className="text-slate-500 font-bold p-1.5 whitespace-nowrap sticky left-0 bg-inherit">
                                {row.label}
                              </td>
                              {g.years.map((y) => (
                                <td
                                  key={y.year}
                                  className={`p-1.5 text-center ${
                                    row.key === "grade_50" || row.key === "grade_70"
                                      ? "font-bold text-indigo-700"
                                      : "text-slate-700"
                                  }`}
                                >
                                  {y[row.key] || "-"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {showEmpty &&
        (findingCandidates ? (
          <Card>
            <p className="text-center text-xs text-slate-400 py-6">비슷한 학과를 찾는 중...</p>
          </Card>
        ) : candidates && candidates.length > 0 ? (
          <Card className="space-y-3">
            <p className="text-xs font-bold text-slate-700">
              정확히 일치하는 데이터가 없어요. 이름이 비슷한 다른 학과를 참고해 보세요.
            </p>
            <div className="space-y-1.5">
              {candidates.map((c) => (
                <button
                  key={`${c.university}-${c.department}`}
                  type="button"
                  onClick={() => applyCandidate(c)}
                  className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition"
                >
                  <div>
                    <div className="font-bold text-slate-800 text-xs">
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
          </Card>
        ) : (
          <Card>
            <p className="text-center text-xs text-slate-400 py-6">일치하는 모집정보·입결 데이터가 없습니다.</p>
          </Card>
        ))}

      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <FileBarChart className="w-4 h-4 text-indigo-600" />
            경쟁률 조회
          </h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCompetitionPickerOpen(true)}
            className="shrink-0 whitespace-nowrap px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center gap-1.5"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>작년 경쟁률</span>
          </button>
          <a
            href="https://apply.jinhakapply.com/SmartRatio"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5 text-white hover:opacity-90"
            style={{ backgroundColor: "#f9ce2d" }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>실시간 경쟁률(진학사)</span>
          </a>
          <a
            href="https://info.uway.com/power/?isApply=1"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition flex items-center gap-1.5 text-white hover:opacity-90"
            style={{ backgroundColor: "#e21d55" }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>실시간 경쟁률(유웨이)</span>
          </a>
        </div>

        {effectiveStudentId && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-bold text-slate-700">
              저장된 경쟁률{competitionSaves && competitionSaves.length > 0 && ` ${competitionSaves.length}`}
            </p>
            {savesLoading ? (
              <p className="text-[11px] text-slate-400">불러오는 중...</p>
            ) : !competitionSaves || competitionSaves.length === 0 ? (
              <p className="text-[11px] text-slate-400">아직 저장된 경쟁률이 없어요. 작년 경쟁률을 조회한 뒤 저장해 보세요.</p>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {competitionSaves.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadCompetitionSave(s)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-xs font-bold text-slate-800 truncate">
                        {s.university}
                        {s.department && ` · ${s.department}`}
                        {s.admission_type && ` · ${s.admission_type}`}
                      </p>
                      <p className="text-[11px] text-slate-400">{new Date(s.created_at).toLocaleDateString("ko-KR")}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCompetitionSave(s)}
                      className="shrink-0 w-7 h-7 rounded-lg hover:bg-rose-100 text-rose-500 flex items-center justify-center"
                      aria-label="저장된 경쟁률 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <CompetitionResultPanel
        open={competitionOpen}
        university={caUniversity.trim()}
        department={caDepartment.trim()}
        hintAdmissionType={caAdmissionType.trim()}
        onPickManually={() => setCompetitionPickerOpen(true)}
        onSave={(series) => void handleSaveCompetition(series)}
        saving={saving}
      />

      <CascadingPickerModal
        open={lookupPickerOpen}
        onClose={() => setLookupPickerOpen(false)}
        onComplete={handleLookupPicked}
        fetchUniversities={listCutoffUniversities}
        fetchDepartments={async (u) => ({ list: await listCutoffDepartments(u), hasSummary: false })}
        fetchAdmissionTypes={async (u, d) => {
          // 올해 새로 생긴 전형(예: 작년까지 교과만 모집하다 올해 종합을 신설)은
          // admission_cutoffs(과거 입결)에는 아직 없고 admission_offerings(이번 학년도
          // 모집정보)에만 있을 수 있다. 입결이 없을 뿐 실제로 모집하는 전형이니 선택
          // 목록에서는 보여야 한다 — 그래서 두 출처를 합친다(입결은 당연히 못 뜬다). 다만
          // 두 출처가 같은 전형을 다르게 적어 둔 경우가 흔해서(예: "교과(지역인재)" vs
          // "지역인재전형(교과)") 그대로 합치면 같은 전형이 두 번 보인다 — 입결 쪽 표기를
          // 우선해 하나로 합친다. 이때 반드시 핵심 이름이 "완전히 같을 때"(2점)만 합친다 —
          // ">0"(부분 겹침)까지 합치면, 같은 대학이 "지역전형" 같은 짧은 이름과 지역별로
          // 나뉜 여러 실제 전형(예: "지역의사진료전형(경주)"/"(구미)"/...)을 동시에 갖고
          // 있을 때 서로 다른 여러 전형이 하나로 뭉개져 선택 목록에서 사라져 버린다.
          const [cutoffTypes, offerings] = await Promise.all([
            listCutoffAdmissionTypes(u, d ?? ""),
            listOfferingCandidates(u, d ?? ""),
          ]);
          const merged = [...cutoffTypes, ...offerings.map((o) => o.admissionType)];
          const deduped: string[] = [];
          for (const type of merged) {
            if (!deduped.some((kept) => admissionTypeSimilarity(kept, type) === 2)) deduped.push(type);
          }
          return deduped;
        }}
        admissionTypeAllLabel="전체 전형 보기"
        cards={myCards ?? []}
      />

      <CascadingPickerModal
        open={competitionPickerOpen}
        onClose={() => setCompetitionPickerOpen(false)}
        onComplete={handleCompetitionPicked}
        fetchUniversities={() => fetchCompetitionUniversityOptions("")}
        fetchDepartments={async (u) => {
          const { departments, hasSummary } = await fetchCompetitionDepartmentOptions(u);
          return { list: departments, hasSummary };
        }}
        fetchAdmissionTypes={fetchCompetitionAdmissionTypeOptions}
        cards={myCards ?? []}
      />
    </div>
  );
}
