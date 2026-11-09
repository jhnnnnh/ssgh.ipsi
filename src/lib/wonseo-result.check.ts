// 실행: npx tsx src/lib/wonseo-result.check.ts
import assert from "node:assert/strict";
import { applyResultChange, finalResult, resultBadge, waitlistTrail } from "./wonseo-result";

const empty = { stage1_result: null, first_result: null, waitlist_number: null, waitlist_progress: null, waitlist_final: null };
const staged = { ...empty, selection_mode: "multi" as const };
const single = { ...empty, selection_mode: "single" as const };

assert.deepEqual(resultBadge(staged), { label: "발표 전", tone: "pending" });
assert.deepEqual(resultBadge({ ...staged, stage1_result: "합격" }), { label: "1단계 합격", tone: "stage" });
assert.deepEqual(resultBadge({ ...staged, stage1_result: "불합격" }), { label: "1단계 불합격", tone: "fail" });

// 예비: 충원 메모의 마지막 숫자 → 최종 결과 선택
const waiting = { ...single, first_result: "예비" as const, waitlist_number: 23, waitlist_progress: "11 → 4" };
assert.equal(resultBadge(waiting).label, "예비 4");
assert.equal(resultBadge({ ...waiting, waitlist_progress: null }).label, "예비 23");
assert.deepEqual(finalResult(waiting), { value: null, auto: false });
assert.equal(resultBadge({ ...waiting, waitlist_final: "합격" }).label, "충원합격");
assert.deepEqual(finalResult({ ...waiting, waitlist_final: "불합격" }), { value: "불합격", auto: false });

// 위에서 결정되면 최종 결과는 자동
assert.deepEqual(finalResult({ ...single, first_result: "합격" }), { value: "합격", auto: true });
assert.deepEqual(finalResult({ ...staged, stage1_result: "불합격" }), { value: "불합격", auto: true });

// 예비 기록이 있는데 최초 발표를 바꾸면 지워지고, 확인이 필요하다
const changed = applyResultChange(waiting, { first_result: "합격" });
assert.equal(changed.wipes, true);
assert.deepEqual(changed.next, { ...empty, first_result: "합격" });
// 지울 게 없으면 확인 없이 바뀐다
assert.equal(applyResultChange({ ...single, first_result: "합격" }, { first_result: "불합격" }).wipes, false);
// 1단계를 불합격으로 고치면 최초 발표 이하가 지워진다
const s1 = applyResultChange({ ...waiting, selection_mode: "multi", stage1_result: "합격" }, { stage1_result: "불합격" });
assert.equal(s1.wipes, true);
assert.deepEqual(s1.next, { ...empty, stage1_result: "불합격" });
// 일괄 전형이면 남아 있던 1단계 값은 저장할 때 비운다(전형 방식을 나중에 바꾼 경우)
assert.equal(applyResultChange({ ...single, stage1_result: "불합격" }, { first_result: "합격" }).next.stage1_result, null);

// 카드 바닥의 예비 기록: 배지와 같은 말만 반복하면 숨긴다
assert.equal(waitlistTrail(waiting), "예비 23 → 11 → 4");
assert.equal(waitlistTrail({ ...waiting, waitlist_progress: null }), null);
assert.equal(waitlistTrail({ ...waiting, waitlist_progress: null, waitlist_final: "합격" }), "예비 23");
assert.equal(waitlistTrail({ ...single, first_result: "합격" }), null);

console.log("wonseo-result OK");
