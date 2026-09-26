// 실행: npx tsx src/lib/grade-overview.check.ts
import assert from "node:assert/strict";
import type { AdminWonseoOverviewRow } from "./database.types";
import {
  cardTier,
  findRiskyStudents,
  findSeniorPrograms,
  groupByProgram,
  programKey,
  type StudentCard,
} from "./grade-overview";

assert.equal(programKey("국립부경대학교(부산)", "간호 학과"), programKey("부경대학교", "간호학과"));

const results = (cut: string) => [
  {
    year: "2025",
    enrollment: "",
    competitionRate: "",
    fillCount: "",
    cut50: "",
    cut70: cut,
    myPosition: "",
  },
];
assert.equal(
  cardTier({
    calculated_grade: "3.0",
    recent_results: results("2.2"),
    level: "하향",
  }),
  "상향",
);
assert.equal(
  cardTier({
    calculated_grade: "2.0",
    recent_results: results("2.1"),
    level: "상향",
  }),
  "적정",
);
assert.equal(
  cardTier({
    calculated_grade: "2.0",
    recent_results: results("2.8"),
    level: "상향",
  }),
  "안정",
);
assert.equal(cardTier({ calculated_grade: null, recent_results: [], level: "소신" }), "상향");

const row = (
  student_id: string,
  i: number,
  level: AdminWonseoOverviewRow["level"],
  category = "학생부교과",
): AdminWonseoOverviewRow => ({
  student_id,
  student_name: student_id,
  grade: 3,
  class_no: 9,
  card_id: `${student_id}-${i}`,
  university: "동아대학교",
  department: `학과${i}`,
  category,
  level,
  status: "지원예정",
  is_submitted: false,
  calculated_grade: null,
  recent_results: [],
  min_standard: null,
});
const rows = [
  ...[0, 1, 2, 3].map((i) => row("A", i, "상향")),
  row("B", 0, "하향"),
  row("B", 1, "적정"),
  row("B", 2, "상향"),
  ...[0, 1, 2, 3, 4, 5].map((i) => row("D", i, "적정")),
  { ...row("C", 0, null), card_id: null, university: null },
];
const risky = findRiskyStudents(rows);
assert.deepEqual(
  risky.map((r) => r.student_id),
  ["A"],
);
assert.deepEqual(risky[0].warnings, ["안정 지원 없음", "상향 4장", "전부 상향"]);

const programs = groupByProgram([
  row("A", 0, "적정", "학교장추천"),
  row("B", 0, "적정", "학교장추천"),
] as StudentCard[]);
assert.deepEqual(programs[0].overlappingCategories, ["학교장추천"]);
assert.deepEqual(programs[0].recommendationCategories, ["학교장추천"]);
console.log("grade-overview ok");

const seniors = findSeniorPrograms(
  [
    {
      university: "동아대학교(부산)",
      department: "간호학과",
      admission_type: "교과",
      track: "자연",
      final_stage: "충원합격",
      gpa: 3.1,
    },
    {
      university: "동아대학교(부산)",
      department: "간호학과",
      admission_type: "교과",
      track: "자연",
      final_stage: "불합격",
      gpa: 2.9,
    },
    {
      university: "부산대학교(부산)",
      department: "간호학과",
      admission_type: "교과",
      track: "자연",
      final_stage: "불합격",
      gpa: 3.0,
    },
    {
      university: "경성대학교(부산)",
      department: "간호학과",
      admission_type: "교과",
      track: "자연",
      final_stage: "합격",
      gpa: 3.5,
    },
    {
      university: "신라대학교(부산)",
      department: "국문과",
      admission_type: "교과",
      track: "인문",
      final_stage: "합격",
      gpa: 3.0,
    },
  ],
  3.0,
  0.3,
  "자연",
);
assert.deepEqual(
  seniors.map((s) => [s.university, s.admitted.length, s.rejected.length]),
  [
    ["동아대학교(부산)", 1, 1],
    ["부산대학교(부산)", 0, 1],
  ],
);
console.log("senior programs ok");
