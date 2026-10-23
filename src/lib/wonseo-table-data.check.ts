// 실행: npx tsx src/lib/wonseo-table-data.check.ts
import assert from "node:assert/strict";
import type { Roster, WonseoCard } from "./database.types";
import {
  buildWonseoListColumns,
  buildWonseoListRows,
  filterSortListRows,
  textWidthEm,
  type WonseoListFilter,
} from "./wonseo-table-data";

const roster = [
  { student_id: "30201", name: "가나" },
  { student_id: "30202", name: "다라" },
] as Roster[];
let n = 0;
const card = (student_id: string, over: Partial<WonseoCard>): WonseoCard =>
  ({
    id: `c${++n}`,
    student_id,
    level: "적정",
    category: "학생부교과",
    university: "동아대학교",
    department: "간호학과",
    is_submitted: true,
    submitted_sort_order: n,
    created_at: `2026-01-0${n}`,
    schedule_events: [],
    ...over,
  }) as WonseoCard;
const cards = [
  card("30202", {
    university: "부산대학교",
    level: "상향",
    schedule_events: [{ id: "a", label: "면접", date: "20261120" }],
  }),
  card("30201", { department: "경영학과", schedule_events: [{ id: "b", label: "논술", date: "2026-11-15" }] }),
  card("30201", { level: "하향", is_submitted: false }),
  card("99999", {}), // 명단에 없는 학생은 빠진다
];
const base: WonseoListFilter = { query: "", levels: [], category: "", university: "", sort: "student" };

const all = buildWonseoListRows(roster, cards, "all");
assert.deepEqual(
  all.map((r) => r.studentId),
  ["30201", "30201", "30202"],
);
const sub = buildWonseoListRows(roster, cards, "submitted");
assert.deepEqual(
  sub.map((r) => [r.studentId, r.rank, r.firstDate]),
  [
    ["30201", 1, "2026-11-15"],
    ["30202", 1, "2026-11-20"],
  ],
);
assert.equal(filterSortListRows(all, { ...base, query: "간 호" }).length, 2);
assert.equal(filterSortListRows(all, { ...base, query: "다라" }).length, 1);
assert.deepEqual(
  filterSortListRows(all, { ...base, levels: ["상향", "하향"] }).map((r) => r.card.level),
  ["하향", "상향"],
);
assert.deepEqual(
  filterSortListRows(all, { ...base, sort: "level" }).map((r) => r.card.level),
  ["상향", "적정", "하향"],
);
assert.deepEqual(
  filterSortListRows(sub, { ...base, sort: "date" }).map((r) => r.firstDate),
  ["2026-11-15", "2026-11-20"],
);
console.log("wonseo list ok");

// 열 너비: 반 전체 원서 기준이라 필터와 무관하고, 두 탭의 같은 열 너비가 같다.
const colsAll = buildWonseoListColumns(roster, cards, "all");
const colsSub = buildWonseoListColumns(roster, cards, "submitted");
assert.deepEqual(colsSub.slice(0, colsAll.length), colsAll);
assert.deepEqual(
  colsSub.slice(colsAll.length).map((c) => c.label),
  ["수험번호", "일정"],
);
assert.equal(colsAll.find((c) => c.label === "학과")!.widthEm, 4 + 2); // "경영학과" 4em + 여백
assert.equal(textWidthEm("부산대 12"), 3 + 0.65 * 3);
console.log("list columns ok");
