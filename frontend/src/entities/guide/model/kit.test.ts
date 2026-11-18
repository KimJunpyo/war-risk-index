// 이슈 #73 (1-3 비상 가방·비축 목록과 물·식량 계산 함수) 목록·출처·계산 인수 테스트.
// 실행(저장소 루트): node --test "frontend/src/**/*.test.ts"  (Node 24 타입 스트리핑, 별칭 import 불가)
//
// 계약: frontend/src/entities/guide/model/kit.ts (별칭 import 없는 단일 파일, 같은 폴더 ./checklist.ts 정도만 import)
//   export const GO_BAG_ITEMS: { id: string; text: string; sources: KitSourceKey[] }[]  // 들고 나가는 3일 가방
//   export const STOCK_ITEMS: { id: string; text: string; sources: KitSourceKey[] }[]   // 집에 두는 7일 이상 비축
//   export const KIT_PERIODS = [{ id: "bag", days: 3, label: "3일 가방" }, { id: "stock7", days: 7, label: "7일 비축" },
//     { id: "stock14", days: 14, label: "14일 비축" }]  // 30일은 넣지 않는다(Q2)
//   export const WATER_L_PER_PERSON_DAY = 3, MEALS_PER_PERSON_DAY = 3, MAX_PEOPLE = 20  // Q3
//   export function supplies(people: number, days: number): { waterL: number; meals: number } | null
//     people 이 1~MAX_PEOPLE 정수가 아니거나 days 가 KIT_PERIODS 에 없으면 null
//   export const KIT_STORAGE_KEY = "war-risk:kit:v1"  // 체크 상태용(1-5), CHECKLIST_STORAGE_KEY 와 따로 둔다
//   export const KIT_SOURCES: Record<KitSourceKey, { name: string; url: string; checkedAt: string }>  // checkedAt "YYYY-MM-DD"
//     키 후보는 mois-emergency·maff·mcf·bbk. 원문을 확인하지 못한 출처는 빠질 수 있어 키 목록은 확인하지 않는다.
// 목록 문구는 자체 작성이라 특정 문장은 확인하지 않는다. 경보(alerts.ts, #72) id 와의 교차 확인은 둘 다 들어온 뒤 따로 한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CHECKLIST, CHECKLIST_STORAGE_KEY } from "./checklist.ts";
import {
  GO_BAG_ITEMS, KIT_PERIODS, KIT_SOURCES, KIT_STORAGE_KEY, MAX_PEOPLE, MEALS_PER_PERSON_DAY, STOCK_ITEMS, supplies,
  WATER_L_PER_PERSON_DAY,
} from "./kit.ts";

const ALL_ITEMS = [...GO_BAG_ITEMS, ...STOCK_ITEMS];

test("supplies: 가구원 수 × 일수 × 1인 1일 물 3L·3끼", () => {
  assert.deepEqual(supplies(1, 3), { waterL: 9, meals: 9 });
  assert.deepEqual(supplies(4, 7), { waterL: 84, meals: 84 });
  assert.deepEqual(supplies(4, 14), { waterL: 168, meals: 168 });
  assert.deepEqual(supplies(20, 14), { waterL: 840, meals: 840 }); // 가구원 상한 경계
});

test("supplies: 가구원 수가 1~20 정수가 아니거나 기간이 KIT_PERIODS 에 없으면 null", () => {
  for (const people of [0, -1, 1.5, 21, NaN, Infinity]) {
    assert.equal(supplies(people, 7), null, `people=${people}`);
  }
  for (const days of [30, 5]) {
    assert.equal(supplies(1, days), null, `days=${days}`);
  }
});

test("기간은 3일 가방·7일 비축·14일 비축 셋뿐 (30일 없음)", () => {
  assert.deepEqual(KIT_PERIODS, [
    { id: "bag", days: 3, label: "3일 가방" },
    { id: "stock7", days: 7, label: "7일 비축" },
    { id: "stock14", days: 14, label: "14일 비축" },
  ]);
});

test("계산 기준 상수: 물 1인 1일 3L, 1인 1일 3끼, 가구원 최대 20명", () => {
  assert.equal(WATER_L_PER_PERSON_DAY, 3);
  assert.equal(MEALS_PER_PERSON_DAY, 3);
  assert.equal(MAX_PEOPLE, 20);
});

test("두 목록 모두 항목이 있고 각 항목은 비어 있지 않은 id·text", () => {
  for (const [name, items] of Object.entries({ GO_BAG_ITEMS, STOCK_ITEMS })) {
    assert.ok(items.length > 0, `${name} 항목 없음`);
    for (const it of items) {
      assert.ok(typeof it.id === "string" && it.id.trim(), `${name}: 빈 id`);
      assert.ok(typeof it.text === "string" && it.text.trim(), `${name}: 빈 text`);
    }
  }
});

test("id 는 두 목록 전체에서 유일 (두 목록의 체크 상태를 한 저장 키에 같이 둔다)", () => {
  const ids = ALL_ITEMS.map((it) => it.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("id 가 비상 대비 체크리스트(CHECKLIST) id 와 겹치지 않는다", () => {
  const checklistIds = new Set(Object.values(CHECKLIST).flat().map((it) => it.id));
  for (const it of ALL_ITEMS) assert.ok(!checklistIds.has(it.id), `CHECKLIST 와 겹침: ${it.id}`);
});

test("모든 항목이 KIT_SOURCES 의 출처를 1개 이상 가리킨다", () => {
  const keys = new Set(Object.keys(KIT_SOURCES));
  for (const it of ALL_ITEMS) {
    assert.ok(Array.isArray(it.sources) && it.sources.length > 0, `${it.id}: 출처 없음`);
    for (const key of it.sources) assert.ok(keys.has(key), `${it.id}: KIT_SOURCES 에 없는 출처 ${key}`);
  }
});

test("출처마다 이름·https 링크·확인일(YYYY-MM-DD)", () => {
  const entries = Object.entries(KIT_SOURCES);
  assert.ok(entries.length > 0, "출처 없음");
  for (const [key, s] of entries) {
    assert.ok(s.name.trim(), `${key}: 빈 name`);
    assert.match(s.url, /^https:\/\//, `${key}: url`);
    assert.match(s.checkedAt, /^\d{4}-\d{2}-\d{2}$/, `${key}: checkedAt`);
  }
});

test("저장 키: war-risk:kit:v1, 체크리스트 저장 키와 따로", () => {
  assert.equal(KIT_STORAGE_KEY, "war-risk:kit:v1");
  assert.notEqual(KIT_STORAGE_KEY, CHECKLIST_STORAGE_KEY);
});

test("kit.ts 에 별칭(@/) import 가 없다 (node --test 는 @/ 를 풀지 못한다)", () => {
  const src = readFileSync(new URL("./kit.ts", import.meta.url), "utf8");
  // from "@/..", import "@/..", import("@/..") 모두 잡는다
  assert.doesNotMatch(src, /\b(?:from|import)\s*\(?\s*["'`]@\//);
});
