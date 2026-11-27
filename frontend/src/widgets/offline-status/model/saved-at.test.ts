// 저장 시각 표시(#79): Cache Storage /emergency 응답의 date 헤더 → 한국 시각
// 실행(저장소 루트): node --test "frontend/src/**/*.test.ts"  (Node 24 타입 스트리핑, 별칭 import 불가)
import assert from "node:assert/strict";
import { test } from "node:test";

import { savedAtKst } from "./saved-at.ts";

test("date 헤더(GMT)를 한국 시각 YYYY-MM-DD HH:mm 으로 바꾼다", () => {
  assert.equal(savedAtKst("Fri, 27 Nov 2026 05:04:59 GMT"), "2026-11-27 14:04");
});

test("한국 시각으로 날짜가 넘어가면 다음 날", () => {
  assert.equal(savedAtKst("Tue, 31 Dec 2026 15:00:00 GMT"), "2027-01-01 00:00");
});

test("헤더가 없거나 읽을 수 없으면 null", () => {
  assert.equal(savedAtKst(null), null);
  assert.equal(savedAtKst(""), null);
  assert.equal(savedAtKst("not a date"), null);
});
