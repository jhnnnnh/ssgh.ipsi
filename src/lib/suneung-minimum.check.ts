// 실행: npx tsx src/lib/suneung-minimum.check.ts
import assert from "node:assert/strict";
import { evaluateMinimumStandard, type MockGrades } from "./suneung-minimum";

const g = (over: Partial<MockGrades> = {}): MockGrades => ({
  korean: 3,
  math: 4,
  mathSubject: "확통",
  english: 2,
  inquiry1: 3,
  inquiry2: 5,
  inquiryType: "사",
  history: 3,
  ...over,
});
const status = (text: string, grades = g()) => evaluateMinimumStandard(text, grades).status;

assert.equal(status("없음"), "none");
// 영2 + 국3 = 5
assert.equal(status("국, 수, 영, 탐(사/과)(1과목) 중 2개 영역 합 5이내"), "pass");
assert.equal(status("국, 수, 영, 탐(사/과)(1과목) 중 2개 영역 합 4이내"), "fail");
// 수학 포함: 수4 + 영2 = 6
assert.equal(status("국, 수, 영, 탐(사/과)(1과목) 중 수학 포함 2개 영역 합 6이내"), "pass");
// 확통 1등급 하향 → 수5 + 영2 = 7 > 6
assert.equal(
  status("국, 수, 영, 탐(사/과)(1과목) 중 수학 포함 2개 영역 합 6이내 (수(확통) 선택시 1등급 하향 적용)"),
  "fail",
);
// 수(미적/기하)만 인정인데 확통 → 수학 없이 국3+영2+탐3 = 8
assert.equal(status("국, 수(미적/기하), 영, 탐(과)(1과목) 중 3개 영역 합 8이내"), "fail"); // 탐(과)도 불가 → 조합 없음
assert.equal(
  status("국, 수(미적/기하), 영, 탐(과)(1과목) 중 3개 영역 합 9이내", g({ mathSubject: "미적", inquiryType: "과" })),
  "pass",
);
// 2과목평균 (3+5)/2=4, 절사하면 4
assert.equal(status("국, 수, 영, 탐(사/과)(2과목평균) 중 3개 영역 합 9이내 (탐구 소수점 절사)"), "pass");
// 한국사 조건
assert.equal(status("국, 수, 영, 탐(사/과)(1과목) 중 2개 영역 합 5이내, 한국사 2이내"), "fail");
// 영어 2등급 1등급 간주: 영1+국3 = 4
assert.equal(status("국, 수, 영, 탐(사/과)(1과목) 중 2개 영역 합 4이내 (영어 2등급 1등급으로 간주)"), "pass");
// 조건 안의 "또는"은 대안이 아니다
assert.equal(
  status("국, 수, 탐(사/과)(1과목) 중 국어 또는 수학 포함 2개 영역 합 6이내, 영어 3이내, 한국사 4이내"),
  "pass",
);
assert.equal(
  status("국, 수, 영, 탐(과)(1과목) 중 수학 또는 탐(과) 포함 2개 영역 합 6이내", g({ inquiryType: "과" })),
  "pass",
);
// 대안 "또는"
assert.equal(status("국, 수, 영, 탐(사/과)(1과목) 중 2개 영역 합 3이내 또는 1개 영역 2이내"), "pass");
// 입력 부족
assert.equal(
  status(
    "국, 수, 영, 탐(사/과)(1과목) 중 2개 영역 합 3이내",
    g({
      korean: null,
      english: null,
      inquiry1: null,
      inquiry2: null,
      math: null,
    }),
  ),
  "missing",
);
// 해석 불가
assert.equal(status("수(미적/기하) 4이내, 수(확통) 2이내"), "unknown");
const v = evaluateMinimumStandard(
  "[수능 4개 영역 필수 응시] 국, 수, 영, 탐(사/과)(1과목) 중 2개 영역 합 6이내 (탐구 2과목 필수응시)",
  g(),
);
assert.equal(v.status, "pass");
assert.ok(v.status === "pass" && v.caveats.length === 1);
console.log("suneung-minimum ok");

// 약식 표기 (국3 수4 영2 탐1 3 탐2 5 한국사3, 확통·사탐)
assert.equal(status("2합5"), "pass");
assert.equal(status("2합 4"), "fail");
assert.equal(status("2합 6(수학포함)"), "pass");
assert.equal(status("(수학 포함) 2합 5"), "fail");
assert.equal(status("3합 8 한국사 4 이내"), "pass"); // 영2+국3+탐3
assert.equal(status("2합6/과탐필수/한국사4"), "pass");
assert.equal(status("국,영,수,탐 중 1합2"), "pass");
assert.equal(status("1합3(탐구는 평균)"), "pass"); // 국3
assert.equal(status("최저 없음"), "none");
assert.equal(status("X"), "none");
assert.equal(status("최저 없음. 면접 없음"), "none");
assert.equal(status("2합5 단 영어 제외"), "unknown");
console.log("shorthand ok");

// 영역 목록 없이 시작하는 두 번째 대안: 국3+영2=5 > 4, 수4+영2=6 ≤ 6 (확통 하향 → 수5+영2=7 > 6)
const alt = "국, 수, 영, 탐(사/과)(1과목) 중 국어 포함 2개 영역 합 4이내 또는 수학 포함 2개 영역 합 6이내";
assert.equal(status(alt), "pass");
assert.equal(status(`${alt} (수(확통) 선택시 1등급 하향)`), "fail");
assert.equal(status("3합8(탐구1과목 반영)"), "pass");
assert.equal(status("수학포함2합6(확통선택 시 1등급하향적용)"), "fail"); // 수5+영2
assert.equal(status("수학포함2합7(확통선택 시 1등급하향적용)"), "pass");
assert.equal(status("수학포함2합6\n(과탐1과목 응시)"), "pass");
console.log("alternatives ok");
