"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { AutocompleteInput } from "@/components/ui/AutocompleteInput";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/providers/ToastProvider";
import {
  prefetchCutoffUniversities,
  searchCutoffAdmissionTypes,
  searchCutoffDepartments,
  searchCutoffUniversities,
} from "@/lib/admission-cutoff-autocomplete";
import { searchCutoffsForLookup, type CutoffLookupGroup } from "@/lib/admission-cutoff-lookup";

const ROWS: { key: "enrollment" | "competition_rate" | "additional_pass" | "grade_50" | "grade_70"; label: string }[] = [
  { key: "enrollment", label: "모집인원" },
  { key: "competition_rate", label: "경쟁률" },
  { key: "additional_pass", label: "충원인원" },
  { key: "grade_50", label: "50% 컷" },
  { key: "grade_70", label: "70% 컷" },
];

/**
 * 대학어디가(admission_cutoffs) 원본을 학교·학과·전형으로 직접 검색하는 조회 전용 탭.
 * 학생/교사 화면 둘 다 그대로 재사용한다(학생별로 다른 동작이 없는 순수 검색 기능).
 */
export function CutoffLookupTab() {
  const showToast = useToast();
  const [university, setUniversity] = useState("");
  const [department, setDepartment] = useState("");
  const [admissionType, setAdmissionType] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CutoffLookupGroup[] | null>(null);

  useEffect(() => {
    prefetchCutoffUniversities();
  }, []);

  async function handleSearch() {
    const uni = university.trim();
    const dept = department.trim();
    if (!uni || !dept) {
      showToast("대학명과 학과명을 입력해 주세요.", "error");
      return;
    }
    setLoading(true);
    try {
      const groups = await searchCutoffsForLookup(uni, dept, admissionType.trim() || undefined);
      setResults(groups);
      if (groups.length === 0) {
        showToast("일치하는 입결 데이터를 찾을 수 없습니다.", "error");
      }
    } catch {
      showToast("조회에 실패했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-800">입결 조회</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            대학명·모집단위·세부 전형명으로 2023~2026학년도 수시 입결을 조회할 수 있어요. 세부 전형명은
            비워두면 그 학과에 등록된 전형을 전부 보여줘요.
          </p>
        </div>
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

      {results && (
        <div className="space-y-4">
          {results.length === 0 ? (
            <Card>
              <p className="text-center text-xs text-slate-400 py-6">일치하는 입결 데이터가 없습니다.</p>
            </Card>
          ) : (
            results.map((g) => (
              <Card key={g.admissionType} className="space-y-3">
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
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
