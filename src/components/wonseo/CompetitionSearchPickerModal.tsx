"use client";

import { useEffect, useMemo, useState } from "react";
import { X, ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  fetchCompetitionUniversityOptions,
  fetchCompetitionDepartmentOptions,
  fetchCompetitionAdmissionTypeOptions,
} from "@/lib/admission-competition-lookup";

type Step = "university" | "department" | "admissionType";

/**
 * "작년 경쟁률 조회"의 대학/학과/세부전형명을 자유입력으로 받으면, 세부전형명 자동완성이
 * admission_cutoffs(대학어디가) 표기를 보여주는데 실제 경쟁률 아카이브는 표기가 달라서
 * (예: "교과(교과성적)" vs "교과성적우수인재전형") 골라도 못 찾거나, 비워두면 그 대학의
 * 전형이 전부 쏟아진다. 이 팝업은 아카이브 데이터 자체에서 대학→학과→전형을 순서대로
 * 골라 나가게 해서, 마지막에 고르는 전형이 항상 실제로 존재하는 유일한 시계열이 되게 한다.
 */
export function CompetitionSearchPickerModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: (university: string, department: string | null, admissionType: string) => void;
}) {
  const [step, setStep] = useState<Step>("university");
  const [query, setQuery] = useState("");
  const [universities, setUniversities] = useState<string[] | null>(null);
  const [university, setUniversity] = useState("");
  const [departments, setDepartments] = useState<{ list: string[]; hasSummary: boolean } | null>(null);
  const [department, setDepartment] = useState<string | null>(null);
  const [admissionTypes, setAdmissionTypes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep("university");
    setQuery("");
    setUniversities(null);
    setUniversity("");
    setDepartments(null);
    setDepartment(null);
    setAdmissionTypes(null);
    setLoading(true);
    fetchCompetitionUniversityOptions("").then((list) => {
      setUniversities(list);
      setLoading(false);
    });
  }, [open]);

  function pickUniversity(u: string) {
    setUniversity(u);
    setStep("department");
    setQuery("");
    setLoading(true);
    fetchCompetitionDepartmentOptions(u).then(({ departments: list, hasSummary }) => {
      setDepartments({ list, hasSummary });
      setLoading(false);
    });
  }

  function pickDepartment(d: string | null) {
    setDepartment(d);
    setStep("admissionType");
    setQuery("");
    setLoading(true);
    fetchCompetitionAdmissionTypeOptions(university, d).then((list) => {
      setAdmissionTypes(list);
      setLoading(false);
    });
  }

  function pickAdmissionType(t: string) {
    onComplete(university, department, t);
    onClose();
  }

  function goBack() {
    if (step === "admissionType") setStep("department");
    else if (step === "department") setStep("university");
  }

  const filteredUniversities = useMemo(
    () => (universities ?? []).filter((u) => u.includes(query.trim())),
    [universities, query],
  );
  const filteredDepartments = useMemo(
    () => (departments?.list ?? []).filter((d) => d.includes(query.trim())),
    [departments, query],
  );
  const filteredAdmissionTypes = useMemo(
    () => (admissionTypes ?? []).filter((t) => t.includes(query.trim())),
    [admissionTypes, query],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[95] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-1.5 min-w-0">
            {step !== "university" && (
              <button
                onClick={goBack}
                className="w-7 h-7 shrink-0 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">
                {step === "university" && "1. 대학 선택"}
                {step === "department" && "2. 학과 선택"}
                {step === "admissionType" && "3. 전형 선택"}
              </h3>
              {step !== "university" && (
                <p className="text-[11px] text-slate-400 truncate">
                  {university}
                  {step === "admissionType" && department !== null && ` · ${department}`}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 shrink-0 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-8 pr-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="p-5 pt-3 overflow-y-auto space-y-1.5">
          {loading && <p className="text-center text-xs text-slate-400 py-10">불러오는 중...</p>}

          {!loading && step === "university" && (
            <>
              {filteredUniversities.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-10">일치하는 대학이 없어요.</p>
              )}
              {filteredUniversities.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => pickUniversity(u)}
                  className="w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition"
                >
                  <span className="font-semibold text-slate-800 text-sm">{u}</span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                </button>
              ))}
            </>
          )}

          {!loading && step === "department" && (
            <>
              {departments?.hasSummary && !query.trim() && (
                <button
                  type="button"
                  onClick={() => pickDepartment(null)}
                  className="w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition"
                >
                  <span className="font-semibold text-indigo-700 text-sm">전체(학과 구분 없음)</span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 text-indigo-300" />
                </button>
              )}
              {filteredDepartments.length === 0 && !departments?.hasSummary && (
                <p className="text-center text-xs text-slate-400 py-10">일치하는 학과가 없어요.</p>
              )}
              {filteredDepartments.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pickDepartment(d)}
                  className="w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition"
                >
                  <span className="font-semibold text-slate-800 text-sm">{d}</span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-300" />
                </button>
              ))}
            </>
          )}

          {!loading && step === "admissionType" && (
            <>
              {filteredAdmissionTypes.length === 0 && (
                <p className="text-center text-xs text-slate-400 py-10">일치하는 전형이 없어요.</p>
              )}
              {filteredAdmissionTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => pickAdmissionType(t)}
                  className="w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl transition"
                >
                  <span className="font-semibold text-slate-800 text-sm">{t}</span>
                  <span className="shrink-0 text-[11px] font-bold text-indigo-600">선택</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
