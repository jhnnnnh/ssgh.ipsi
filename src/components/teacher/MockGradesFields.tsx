"use client";

import type { InquiryType, MathSubject, MockGrades } from "@/lib/suneung-minimum";

// 관리자 학년 현황(테스트)의 수능최저 판정에서 쓰는 모의고사 등급 입력칸.

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SELECT_CLASS = "rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-normal text-slate-800";

function GradeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
      {label}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={SELECT_CLASS}
      >
        <option value="">-</option>
        {GRADES.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </label>
  );
}

/** 국·수(과목)·영·탐1·탐2(종류)·한국사 등급 입력칸. */
export function MockGradesFields({ grades, onChange }: { grades: MockGrades; onChange: (g: MockGrades) => void }) {
  const set =
    <K extends keyof MockGrades>(key: K) =>
    (v: MockGrades[K]) =>
      onChange({ ...grades, [key]: v });
  return (
    <>
      <GradeSelect label="국어" value={grades.korean} onChange={set("korean")} />
      <GradeSelect label="수학" value={grades.math} onChange={set("math")} />
      <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
        수학 과목
        <select
          value={grades.mathSubject}
          onChange={(e) => set("mathSubject")(e.target.value as MathSubject)}
          className={SELECT_CLASS}
        >
          <option value="확통">확통</option>
          <option value="미적">미적</option>
          <option value="기하">기하</option>
        </select>
      </label>
      <GradeSelect label="영어" value={grades.english} onChange={set("english")} />
      <GradeSelect label="탐구1" value={grades.inquiry1} onChange={set("inquiry1")} />
      <GradeSelect label="탐구2" value={grades.inquiry2} onChange={set("inquiry2")} />
      <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
        탐구 종류
        <select
          value={grades.inquiryType}
          onChange={(e) => set("inquiryType")(e.target.value as InquiryType)}
          className={SELECT_CLASS}
        >
          <option value="사">사탐</option>
          <option value="과">과탐</option>
        </select>
      </label>
      <GradeSelect label="한국사" value={grades.history} onChange={set("history")} />
    </>
  );
}
