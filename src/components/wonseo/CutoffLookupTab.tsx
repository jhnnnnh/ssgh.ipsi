"use client";

import { useEffect, useState } from "react";
import { Search, TrendingUp, FileBarChart, LayoutGrid } from "lucide-react";
import { AutocompleteInput } from "@/components/ui/AutocompleteInput";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/providers/ToastProvider";
import { createClient } from "@/lib/supabase/client";
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
  nameSimilarity,
  type CutoffLookupGroup,
  type CutoffCandidatePreview,
} from "@/lib/admission-cutoff-lookup";
import { listOfferingCandidates, type MergedOffering } from "@/lib/admission-offering-lookup";
import { CompetitionHistoryModal } from "@/components/wonseo/CompetitionHistoryModal";
import { CompetitionSearchPickerModal } from "@/components/wonseo/CompetitionSearchPickerModal";
import { MyCardPickerModal } from "@/components/wonseo/MyCardPickerModal";
import type { Roster, WonseoCard } from "@/lib/database.types";

const ROWS: { key: "enrollment" | "competition_rate" | "additional_pass" | "grade_50" | "grade_70"; label: string }[] = [
  { key: "enrollment", label: "모집인원" },
  { key: "competition_rate", label: "경쟁률" },
  { key: "additional_pass", label: "충원인원" },
  { key: "grade_50", label: "50% 컷" },
  { key: "grade_70", label: "70% 컷" },
];

type MyCard = Pick<WonseoCard, "id" | "university" | "department" | "category" | "sub_category" | "level">;

/** 세부 전형명이 비어 있으면 전부 통과, 있으면 느슨한(비슷한 이름 포함) 매칭만 통과시킨다.
 * 모집정보(이투스)와 입결(대학어디가)은 같은 전형을 서로 다른 표기로 적어 두는 일이 흔해서
 * (예: "학생부종합전형" vs "학생부종합(학생부종합전형)"), 정확히 같은 문자열만 찾으면
 * 실제로는 있는 데이터도 없는 것처럼 사라져 버린다. */
function matchesHint(admissionType: string, hint: string): boolean {
  if (!hint) return true;
  return nameSimilarity(normalize(admissionType), normalize(hint)) > 0;
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
  const [university, setUniversity] = useState("");
  const [department, setDepartment] = useState("");
  const [admissionType, setAdmissionType] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [cutoffGroups, setCutoffGroups] = useState<CutoffLookupGroup[]>([]);
  const [offerings, setOfferings] = useState<MergedOffering[]>([]);
  const [candidates, setCandidates] = useState<CutoffCandidatePreview[] | null>(null);
  const [findingCandidates, setFindingCandidates] = useState(false);

  const [caUniversity, setCaUniversity] = useState("");
  const [caDepartment, setCaDepartment] = useState("");
  const [caAdmissionType, setCaAdmissionType] = useState("");
  const [competitionOpen, setCompetitionOpen] = useState(false);
  const [competitionPickerOpen, setCompetitionPickerOpen] = useState(false);

  const [teacherStudentId, setTeacherStudentId] = useState("");
  const [myCards, setMyCards] = useState<MyCard[] | null>(null);
  const [cardPickerTarget, setCardPickerTarget] = useState<"lookup" | null>(null);
  const effectiveStudentId = studentId ?? teacherStudentId;

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

  function handleSearch() {
    void runSearch(university.trim(), department.trim(), admissionType.trim());
  }

  function pickMyCard(card: MyCard) {
    if (!card.university || !card.department) return;
    const type = card.sub_category ?? card.category ?? "";
    setUniversity(card.university);
    setDepartment(card.department);
    setAdmissionType(type);
    void runSearch(card.university, card.department, type);
  }

  function applyCandidate(c: CutoffCandidatePreview) {
    setUniversity(c.university);
    setDepartment(c.department);
    void runSearch(c.university, c.department, admissionType.trim());
  }

  function handleCompetitionSearch() {
    if (!caUniversity.trim()) {
      showToast("대학명을 입력해 주세요.", "error");
      return;
    }
    setCompetitionOpen(true);
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
          <p className="text-[11px] text-slate-400 mt-0.5">
            대학명·모집단위·세부 전형명으로 이번 학년도 모집정보와 2023~2026학년도 수시 입결을 함께 조회할 수
            있어요. 세부 전형명은 비워두면 그 학과에 등록된 전형을 전부 보여줘요.
          </p>
        </div>

        {(effectiveStudentId || roster) && (
          <div className="flex flex-col sm:flex-row gap-2">
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
            {effectiveStudentId && myCards && myCards.length > 0 && (
              <button
                type="button"
                onClick={() => setCardPickerTarget("lookup")}
                className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl px-3 py-2.5 text-sm font-semibold transition"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                내 원서 카드에서 불러오기
              </button>
            )}
            {effectiveStudentId && myCards && myCards.length === 0 && (
              <p className="text-[11px] text-slate-400 self-center">등록된 원서 카드가 없어요.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-bold text-slate-700 mb-1 text-xs">대학교명</label>
            <AutocompleteInput
              value={university}
              onChange={(v) => {
                setUniversity(v);
                setDepartment("");
                setAdmissionType("");
              }}
              onSearch={searchCutoffUniversities}
              placeholder="OO대학교"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1 text-xs">모집단위 / 학과</label>
            <AutocompleteInput
              value={department}
              onChange={(v) => {
                setDepartment(v);
                setAdmissionType("");
              }}
              onSearch={(q) => searchCutoffDepartments(q, university)}
              placeholder="OO학과 또는 OO학부"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 mb-1 text-xs">세부 전형명 (선택)</label>
            <AutocompleteInput
              value={admissionType}
              onChange={setAdmissionType}
              onSearch={
                university.trim() && department.trim()
                  ? (q) => searchCutoffAdmissionTypes(q, university, department)
                  : undefined
              }
              revealOnFocus
              placeholder="예: 일반전형"
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center gap-1.5 disabled:opacity-60"
        >
          <Search className="w-3.5 h-3.5" />
          <span>{loading ? "조회 중..." : "조회하기"}</span>
        </button>
      </Card>

      {searched && !loading && offerings.length > 0 && (
        <Card className="space-y-3">
          <h4 className="text-sm font-bold text-slate-800">이번 학년도 모집정보</h4>
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
        </Card>
      )}

      {searched && !loading && cutoffGroups.length > 0 && (
        <Card className="space-y-3">
          <h4 className="text-sm font-bold text-slate-800">최근 3개년 입결</h4>
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
                      {ROWS.map((row) => (
                        <tr key={row.key} className="border-t border-slate-100">
                          <td className="text-slate-500 font-bold p-1.5 whitespace-nowrap sticky left-0 bg-white">
                            {row.label}
                          </td>
                          {g.years.map((y) => (
                            <td key={y.year} className="p-1.5 text-center text-slate-700">
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
            작년 경쟁률 조회
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            위 모집정보·입결 조회와 별개로, 대학→학과→전형을 순서대로 골라서 바로 작년
            원서접수 기간의 시간대별 경쟁률 그래프를 볼 수 있어요.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCompetitionPickerOpen(true)}
          className="flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl px-3 py-2.5 text-sm font-semibold transition"
        >
          <Search className="w-3.5 h-3.5" />
          대학·학과·전형 선택
        </button>

        {caUniversity && (
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            선택됨: <span className="font-bold text-slate-700">{caUniversity}</span>
            {caDepartment && <> · <span className="font-bold text-slate-700">{caDepartment}</span></>}
            {caAdmissionType && <> · <span className="font-bold text-slate-700">{caAdmissionType}</span></>}
          </p>
        )}

        <button
          type="button"
          onClick={handleCompetitionSearch}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition shadow-xs flex items-center gap-1.5"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>작년 경쟁률 보기</span>
        </button>
      </Card>

      <CompetitionSearchPickerModal
        open={competitionPickerOpen}
        onClose={() => setCompetitionPickerOpen(false)}
        onComplete={handleCompetitionPicked}
        cards={myCards ?? []}
      />

      <CompetitionHistoryModal
        open={competitionOpen}
        onClose={() => setCompetitionOpen(false)}
        university={caUniversity.trim()}
        department={caDepartment.trim()}
        hintAdmissionType={caAdmissionType.trim()}
        onPickManually={() => setCompetitionPickerOpen(true)}
      />

      <MyCardPickerModal
        open={cardPickerTarget != null}
        onClose={() => setCardPickerTarget(null)}
        cards={myCards ?? []}
        onPick={pickMyCard}
      />
    </div>
  );
}
