// 이슈 #81 지역 대피소 저장 키·저장 시각·본문 검사.
// 실행(저장소 루트): node --test "frontend/src/**/*.test.ts"  (Node 24 타입 스트리핑, 별칭 import 불가)
// Cache Storage 읽기·쓰기는 e2e(shelters.spec.ts·emergency.spec.ts·offline.spec.ts)가 본다
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSaved, savedAtText, savedKey } from "./saved.ts";

test("키 주소에는 지역 이름만(좌표·lat= 없음), /emergency·/api/ 와 겹치지 않음", () => {
  const key = savedKey("경상남도 창원시");
  assert.equal(decodeURIComponent(key), "/saved-shelters/경상남도 창원시");
  assert.ok(!key.includes("lat=") && !key.includes("?"), key);
  assert.ok(!key.startsWith("/api/") && !key.startsWith("/emergency"), key);
});

test("저장 시각 ISO → 한국 시각 YYYY-MM-DD HH:mm, 읽을 수 없으면 null", () => {
  assert.equal(savedAtText("2026-11-27T05:04:59.000Z"), "2026-11-27 14:04");
  assert.equal(savedAtText("2026-12-31T15:00:00.000Z"), "2027-01-01 00:00");
  assert.equal(savedAtText("not a date"), null);
});

test("본문 검사: 모양이 맞으면 그대로, 다르면 null", () => {
  const ok = { region: "세종특별자치시", savedAt: "2026-11-27T05:04:00.000Z", result: { available: true, as_of: null, items: [], total: 0 } };
  assert.deepEqual(parseSaved(ok), ok);
  for (const bad of [null, {}, { ...ok, region: 1 }, { ...ok, result: {} }, { region: "a", savedAt: "b" }]) assert.equal(parseSaved(bad), null);
});
