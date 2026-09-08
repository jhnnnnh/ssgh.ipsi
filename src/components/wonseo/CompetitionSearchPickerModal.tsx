"use client";

import { useEffect, useState } from "react";
import { X, Search, LayoutGrid, Check } from "lucide-react";
import {
  fetchCompetitionUniversityOptions,
  fetchCompetitionDepartmentOptions,
  fetchCompetitionAdmissionTypeOptions,
  pickBestFuzzyOption,
} from "@/lib/admission-competition-lookup";
import { MyCardPickerModal, type PickableCard } from "@/components/wonseo/MyCardPickerModal";

/**
 * "작년 경쟁률 조회"의 세부전형명 자동완성이 admission_cutoffs(대학어디가) 표기를
 * 보여주는데 실제 경쟁률 아카이브는 전형명 표기가 달라서(예: "교과(교과성적)" vs
 * "교과성적우수인재전형") 골라도 못 찾거나, 비워두면 그 대학의 전형이 전부 쏟아지는
 * 문제가 있었다. 대학·학과·전형 세 칸을 한 화면에서 순서대로(대학을 골라야 학과 칸이,
 * 학과를 골라야 전형 칸이 열리는 식으로) 검색·선택하게 해서, 마지막에 고르는 전형이
 * 항상 아카이브에 실제로 있는 유일한 데이터가 되게 한다. "내 원서 카드에서 불러오기"는
 * 카드의 수기 입력값과 이름이 가장 비슷한 것을 각 칸에 미리 채워만 주고, 실제 선택은
 * 사람이 확인 후 마지막 칸에서 확정한다.
 */
export function CompetitionSearchPickerModal<T extends PickableCard & { university: string | null; department: string | null }>({
  open,
  onClose,
  onComplete,
  cards,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: (university: string, department: string | null, admissionType: string) => void;
  cards?: T[];
}) {
  const [universityQuery, setUniversityQuery] = useState("");
  const [universities, setUniversities] = useState<string[] | null>(null);
  const [university, setUniversity] = useState("");

  const [departmentQuery, setDepartmentQuery] = useState("");
  const [departments, setDepartments] = useState<{ list: string[]; hasSummary: boolean } | null>(null);
  const [department, setDepartment] = useState<string | null | undefined>(undefined);

  const [admissionTypeQuery, setAdmissionTypeQuery] = useState("");
  const [admissionTypes, setAdmissionTypes] = useState<string[] | null>(null);
  const [admissionType, setAdmissionType] = useState<string | null>(null);

  const [cardPickerOpen, setCardPickerOpen] = useState(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUniversityQuery("");
    setUniversities(null);
    setUniversity("");
    setDepartmentQuery("");
    setDepartments(null);
    setDepartment(undefined);
    setAdmissionTypeQuery("");
    setAdmissionTypes(null);
    setAdmissionType(null);
    fetchCompetitionUniversityOptions("").then(setUniversities);
  }, [open]);

  function pickUniversity(u: string) {
    setUniversity(u);
    setDepartmentQuery("");
    setDepartments(null);
    setDepartment(undefined);
    setAdmissionTypeQuery("");
    setAdmissionTypes(null);
    setAdmissionType(null);
    fetchCompetitionDepartmentOptions(u).then(({ departments: list, hasSummary }) => setDepartments({ list, hasSummary }));
  }

  function pickDepartment(d: string | null) {
    setDepartment(d);
    setAdmissionTypeQuery("");
    setAdmissionTypes(null);
    setAdmissionType(null);
    fetchCompetitionAdmissionTypeOptions(university, d).then(setAdmissionTypes);
  }

  function pickAdmissionType(t: string) {
    onComplete(university, department ?? null, t);
    onClose();
  }

  async function loadFromCard(card: T) {
    setCardPickerOpen(false);
    if (!card.university) return;
    setResolving(true);
    try {
      const allUniversities = universities ?? (await fetchCompetitionUniversityOptions(""));
      const uniGuess = allUniversities.includes(card.university)
        ? card.university
        : pickBestFuzzyOption(allUniversities, card.university);
      if (!uniGuess) {
        setResolving(false);
        return;
      }
      setUniversity(uniGuess);
      setUniversities(allUniversities);
      setDepartmentQuery("");
      setAdmissionTypeQuery("");

      const { departments: deptList, hasSummary } = await fetchCompetitionDepartmentOptions(uniGuess);
      setDepartments({ list: deptList, hasSummary });

      let deptGuess: string | null = null;
      if (card.department) {
        deptGuess = deptList.includes(card.department) ? card.department : pickBestFuzzyOption(deptList, card.department);
      }
      setDepartment(deptGuess);

      const typeHint = card.sub_category?.trim() || card.category?.trim() || "";
      const typeList = await fetchCompetitionAdmissionTypeOptions(uniGuess, deptGuess);
      setAdmissionTypes(typeList);
      setAdmissionType(
        typeHint ? (typeList.includes(typeHint) ? typeHint : pickBestFuzzyOption(typeList, typeHint)) : null,
      );
    } finally {
      setResolving(false);
    }
  }

  if (!open) return null;

  const filteredUniversities = (universities ?? []).filter((u) => u.includes(universityQuery.trim()));
  const filteredDepartments = (departments?.list ?? []).filter((d) => d.includes(departmentQuery.trim()));
  const filteredAdmissionTypes = (admissionTypes ?? []).filter((t) => t.includes(admissionTypeQuery.trim()));

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[92] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">대학·학과·전형 선택</h3>
          <div className="flex items-center gap-2">
            {cards && cards.length > 0 && (
              <button
                type="button"
                onClick={() => setCardPickerOpen(true)}
                className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl px-3 py-1.5 text-xs font-semibold transition"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                내 원서 카드에서 불러오기
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {resolving && <p className="px-5 pt-3 text-[11px] text-slate-400">카드와 가장 비슷한 항목을 찾는 중...</p>}

        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 overflow-hidden min-h-0 flex-1">
          <PickColumn
            title="1. 대학"
            query={universityQuery}
            onQueryChange={setUniversityQuery}
            disabled={false}
            disabledLabel=""
            items={filteredUniversities}
            selected={university || null}
            onPick={pickUniversity}
          />
          <PickColumn
            title="2. 학과"
            query={departmentQuery}
            onQueryChange={setDepartmentQuery}
            disabled={!university}
            disabledLabel="먼저 대학을 선택하세요"
            items={filteredDepartments}
            selected={department ?? null}
            onPick={pickDepartment}
            extraOption={
              departments?.hasSummary && !departmentQuery.trim()
                ? { label: "전체(학과 구분 없음)", onPick: () => pickDepartment(null), selected: department === null }
                : undefined
            }
          />
          <PickColumn
            title="3. 전형"
            query={admissionTypeQuery}
            onQueryChange={setAdmissionTypeQuery}
            disabled={!university || department === undefined}
            disabledLabel="먼저 학과를 선택하세요"
            items={filteredAdmissionTypes}
            selected={admissionType}
            onPick={pickAdmissionType}
          />
        </div>
      </div>

      {cards && (
        <MyCardPickerModal open={cardPickerOpen} onClose={() => setCardPickerOpen(false)} cards={cards} onPick={loadFromCard} />
      )}
    </div>
  );
}

function PickColumn({
  title,
  query,
  onQueryChange,
  disabled,
  disabledLabel,
  items,
  selected,
  onPick,
  extraOption,
}: {
  title: string;
  query: string;
  onQueryChange: (v: string) => void;
  disabled: boolean;
  disabledLabel: string;
  items: string[];
  selected: string | null;
  onPick: (v: string) => void;
  extraOption?: { label: string; onPick: () => void; selected: boolean };
}) {
  return (
    <div className="flex flex-col min-h-0 border border-slate-200 rounded-2xl overflow-hidden">
      <h4 className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-50 border-b border-slate-200">{title}</h4>
      {disabled ? (
        <p className="flex-1 flex items-center justify-center text-center text-[11px] text-slate-400 px-3 py-8">{disabledLabel}</p>
      ) : (
        <>
          <div className="p-2 relative">
            <Search className="w-3 h-3 absolute left-4.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="검색..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 min-h-[10rem] max-h-64">
            {extraOption && (
              <button
                type="button"
                onClick={extraOption.onPick}
                className={`w-full flex items-center justify-between gap-1.5 text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
                  extraOption.selected
                    ? "bg-indigo-100 border-indigo-300 text-indigo-800"
                    : "bg-indigo-50/60 hover:bg-indigo-100 border-indigo-200 text-indigo-700"
                }`}
              >
                <span className="truncate">{extraOption.label}</span>
                {extraOption.selected && <Check className="w-3.5 h-3.5 shrink-0 text-indigo-600" />}
              </button>
            )}
            {items.length === 0 && !extraOption && (
              <p className="text-center text-[11px] text-slate-400 py-6">일치하는 항목이 없어요.</p>
            )}
            {items.map((item) => {
              const isSelected = item === selected;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => onPick(item)}
                  className={`w-full flex items-center justify-between gap-1.5 text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${
                    isSelected
                      ? "bg-indigo-100 border-indigo-300 text-indigo-800"
                      : "bg-slate-50 hover:bg-indigo-50 border-slate-200 hover:border-indigo-300 text-slate-800"
                  }`}
                >
                  <span className="truncate">{item}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-indigo-600" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
