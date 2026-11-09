// 이슈 #6 (3-1 이번 주 변화 Top 5) 목록 선정 인수 테스트.
// 실행(저장소 루트): node --test frontend/src/**/*.test.ts  (Node 24 타입 스트리핑, 별칭 import 불가)
//
// 계약: frontend/src/widgets/weekly-movers/model/movers.ts (별칭 import 없는 단일 파일)
//   export function weeklyMovers<T extends { code: string; latest: { blended: number | null };
//     week_ago: { blended: number | null } | null }>(countries: T[]):
//     { up: { country: T; delta: number }[]; down: { country: T; delta: number }[] }
//   delta = latest.blended - week_ago.blended (반올림하지 않음). 상태("전쟁 중" 등)로 거르지 않음(Q9).
import assert from "node:assert/strict";
import { test } from "node:test";

import { weeklyMovers } from "./movers.ts";

const c = (code: string, now: number | null, prev: number | null | "none", status: string | null = null) => ({
  code, status,
  latest: { blended: now },
  week_ago: prev === "none" ? null : { blended: prev },
});

const codes = (xs: { country: { code: string } }[]) => xs.map((x) => x.country.code);

test("오른 나라는 변화량 큰 순, 내린 나라는 작은 순", () => {
  const r = weeklyMovers([c("AAA", 50, 40), c("BBB", 80, 50), c("CCC", 10, 30), c("DDD", 20, 25)]);
  assert.deepEqual(codes(r.up), ["BBB", "AAA"]);
  assert.deepEqual(codes(r.down), ["CCC", "DDD"]);
  assert.equal(r.up[0].delta, 30);
  assert.equal(r.down[0].delta, -20);
});

test("각 목록 최대 5개", () => {
  const ups = ["A", "B", "C", "D", "E", "F", "G"].map((k, i) => c(`UP${k}`, 100 + i, 0));
  const downs = ["A", "B", "C", "D", "E", "F", "G"].map((k, i) => c(`DN${k}`, 0, 100 + i));
  const r = weeklyMovers([...ups, ...downs]);
  assert.equal(r.up.length, 5);
  assert.equal(r.down.length, 5);
  assert.deepEqual(codes(r.up), ["UPG", "UPF", "UPE", "UPD", "UPC"]);
  assert.deepEqual(codes(r.down), ["DNG", "DNF", "DNE", "DND", "DNC"]);
});

test("변화량이 같으면 국가 코드 오름차순", () => {
  const r = weeklyMovers([c("ZZZ", 20, 10), c("AAA", 20, 10), c("MMM", 5, 15), c("BBB", 5, 15)]);
  assert.deepEqual(codes(r.up), ["AAA", "ZZZ"]);
  assert.deepEqual(codes(r.down), ["BBB", "MMM"]);
});

test("D 또는 D-7 blended 가 비었거나 week_ago 가 없으면 제외, 변화 0 도 제외", () => {
  const r = weeklyMovers([c("NOW", null, 10), c("PRV", 50, null), c("NUL", 50, "none"), c("ZER", 30, 30), c("OK1", 31, 30)]);
  assert.deepEqual(codes(r.up), ["OK1"]);
  assert.deepEqual(r.down, []);
});

test("전쟁 중 나라도 포함 (Q9)", () => {
  const r = weeklyMovers([c("UKR", 160, 120, "전쟁 중")]);
  assert.deepEqual(codes(r.up), ["UKR"]);
});

test("모두 비면 두 목록 다 빈 배열", () => {
  const r = weeklyMovers([c("AAA", 10, "none")]);
  assert.deepEqual(r, { up: [], down: [] });
});
