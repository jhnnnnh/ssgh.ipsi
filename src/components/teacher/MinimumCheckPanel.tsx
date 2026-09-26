"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import type { AdminWonseoOverviewRow } from "@/lib/database.types";
import {
  evaluateMinimumStandard,
  type InquiryType,
  type MathSubject,
  type MinimumVerdict,
  type MockGrades,
} from "@/lib/suneung-minimum";

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const VERDICT_STYLE: Record<MinimumVerdict["status"], { label: string; className: string }> = {
  pass: { label: "충족", className: "bg-emerald-50 text-emerald-700" },
  fail: { label: "미충족", className: "bg-rose-50 text-rose-600" },
  missing: {
    label: "등급 입력 부족",
    className: "bg-slate-100 text-slate-500",
  },
  none: { label: "최저 없음", className: "bg-slate-100 text-slate-500" },
  unknown: { label: "해석 불가", className: "bg-amber-50 text-amber-700" },
};

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
        className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-normal text-slate-800"
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

/** 관리자 테스트: 학생을 고르고 모의고사 등급을 넣으면 그 학생 원서 카드마다 수능최저 충족 여부를 판정한다. */
export function MinimumCheckPanel({ rows }: { rows: AdminWonseoOverviewRow[] }) {
  const students = useMemo(() => {
    const map = new Map<string, { id: string; label: string; cards: AdminWonseoOverviewRow[] }>();
    for (const r of rows) {
      if (!r.card_id || !r.university) continue;
      const s = map.get(r.student_id) ?? {
        id: r.student_id,
        label: `${r.class_no}반 ${r.student_name}`,
        cards: [],
      };
      s.cards.push(r);
      map.set(r.student_id, s);
    }
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
  }, [rows]);

  const [studentId, setStudentId] = useState<string>("");
  const [grades, setGrades] = useState<MockGrades>({
    korean: null,
    math: null,
    mathSubject: "확통",
    english: null,
    inquiry1: null,
    inquiry2: null,
    inquiryType: "사",
    history: null,
  });
  const set =
    <K extends keyof MockGrades>(key: K) =>
    (v: MockGrades[K]) =>
      setGrades((g) => ({ ...g, [key]: v }));

  const student = students.find((s) => s.id === studentId) ?? null;

  return (
    <section className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <ClipboardCheck className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-slate-900">수능최저 충족 판정</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            학생을 고르고 모의고사 등급을 넣으면, 원서 카드에 적힌 최저학력기준으로 충족 여부를 판정합니다. 등급은
            저장되지 않습니다.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
          학생
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-normal text-slate-800"
          >
            <option value="">선택</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <GradeSelect label="국어" value={grades.korean} onChange={set("korean")} />
        <GradeSelect label="수학" value={grades.math} onChange={set("math")} />
        <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">
          수학 과목
          <select
            value={grades.mathSubject}
            onChange={(e) => set("mathSubject")(e.target.value as MathSubject)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-normal text-slate-800"
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
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-normal text-slate-800"
          >
            <option value="사">사탐</option>
            <option value="과">과탐</option>
          </select>
        </label>
        <GradeSelect label="한국사" value={grades.history} onChange={set("history")} />
      </div>

      {!student ? (
        <p className="text-sm text-slate-400">학생을 선택해 주세요.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {student.cards.map((c) => {
            const verdict = evaluateMinimumStandard(c.min_standard, grades);
            const style = VERDICT_STYLE[verdict.status];
            return (
              <li key={c.card_id} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${style.className}`}>{style.label}</span>
                  <span className="font-bold text-slate-800">
                    {c.university} {c.department}
                  </span>
                  <span className="text-xs text-slate-500">{c.category}</span>
                </div>
                {c.min_standard && verdict.status !== "none" && (
                  <p className="text-xs text-slate-500">{c.min_standard}</p>
                )}
                {"detail" in verdict && <p className="text-xs font-bold text-slate-700">{verdict.detail}</p>}
                {"caveats" in verdict &&
                  verdict.caveats.map((note) => (
                    <p key={note} className="text-xs text-amber-700">
                      {note}
                    </p>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
