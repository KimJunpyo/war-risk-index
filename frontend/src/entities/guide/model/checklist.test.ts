// 이슈 #8 (3-3 비상 대비 체크리스트) 콘텐츠·저장 로직 인수 테스트.
// 실행(저장소 루트): node --test frontend/src/**/*.test.ts  (Node 24 타입 스트리핑, 별칭 import 불가)
//
// 계약: frontend/src/entities/guide/model/checklist.ts (별칭 import 없는 단일 파일, guide.ts 가 가져다 씀)
//   export const CHECKLIST: Record<"calm" | "tension" | "high" | "extreme", { id: string; text: string }[]>
//   export const CHECKLIST_SOURCE: { name: string; url: string; checkedAt: string }  // checkedAt "YYYY-MM-DD"
//   export const CHECKLIST_STORAGE_KEY = "war-risk:checklist:v1"
//   export function readChecked(raw: string | null): string[]  // localStorage 원문 → 체크된 id 배열, 깨진 값은 []
//   export function toggleChecked(checked: string[], id: string): string[]  // 새 배열 반환(원본 불변)
// 문구는 자체 작성(Q11)이라 특정 문장은 확인하지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";

import { CHECKLIST, CHECKLIST_SOURCE, CHECKLIST_STORAGE_KEY, readChecked, toggleChecked } from "./checklist.ts";

const BAND_IDS = ["calm", "tension", "high", "extreme"];

test("구간 4개 모두 항목이 있고 각 항목은 비어 있지 않은 id·text", () => {
  assert.deepEqual(Object.keys(CHECKLIST).sort(), [...BAND_IDS].sort());
  for (const band of BAND_IDS) {
    const items = CHECKLIST[band as keyof typeof CHECKLIST];
    assert.ok(items.length > 0, `${band} 항목 없음`);
    for (const it of items) {
      assert.ok(typeof it.id === "string" && it.id.trim(), `${band}: 빈 id`);
      assert.ok(typeof it.text === "string" && it.text.trim(), `${band}: 빈 text`);
    }
  }
});

test("id 는 전체 구간에서 유일 (나라를 바꿔도 같은 id 로 체크 상태 공유)", () => {
  const ids = Object.values(CHECKLIST).flat().map((it) => it.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("출처: 이름·https 링크·확인일", () => {
  assert.ok(CHECKLIST_SOURCE.name.trim());
  assert.match(CHECKLIST_SOURCE.url, /^https:\/\//);
  assert.match(CHECKLIST_SOURCE.checkedAt, /^\d{4}-\d{2}-\d{2}$/);
});

test("저장 키", () => {
  assert.equal(CHECKLIST_STORAGE_KEY, "war-risk:checklist:v1");
});

test("readChecked: 없음·깨진 값은 빈 배열, 문자열만 남김", () => {
  assert.deepEqual(readChecked(null), []);
  assert.deepEqual(readChecked(""), []);
  assert.deepEqual(readChecked("{not json"), []);
  assert.deepEqual(readChecked('{"a":1}'), []);
  assert.deepEqual(readChecked('["a", 1, null, "b"]'), ["a", "b"]);
});

test("toggleChecked: 없으면 추가, 있으면 제거, 원본 불변", () => {
  const before = ["a"];
  assert.deepEqual(toggleChecked(before, "b").sort(), ["a", "b"]);
  assert.deepEqual(toggleChecked(before, "a"), []);
  assert.deepEqual(before, ["a"]);
});

test("저장 후 다시 읽으면 같은 상태 (새로고침 유지)", () => {
  const checked = toggleChecked(toggleChecked([], "x"), "y");
  assert.deepEqual(readChecked(JSON.stringify(checked)).sort(), ["x", "y"]);
});
