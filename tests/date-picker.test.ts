import assert from "node:assert/strict";
import { test } from "node:test";
import { validDate } from "../src/components/ui/DatePicker";

test("날짜는 실제 존재하는 YYYY-MM-DD만 허용한다", () => {
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2026-13-01"), false);
  assert.equal(validDate("20261027"), false);
});
