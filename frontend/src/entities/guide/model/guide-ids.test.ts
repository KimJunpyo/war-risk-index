// 비상 대비 id 교차 확인. 이슈 #73 인수 조건 "가방·비축 id 가 CHECKLIST·CIVIL_ALERTS 의 id 와 겹치지 않는다"를 셋이 다 들어온 뒤(#75) 본다.
// 실행(저장소 루트): node --test "frontend/src/**/*.test.ts"  (Node 24 타입 스트리핑, 별칭 import 불가)
//
// 대상: 홈 체크리스트 CHECKLIST id, 경보 id·경보 행동 id(CIVIL_ALERTS), 비상 가방·비축 id(GO_BAG_ITEMS·STOCK_ITEMS).
// 체크 저장값과 /emergency 한 페이지에서 항목을 가리키는 값이라 모두 합쳐 유일해야 한다.
// 각 모델 안의 유일성은 checklist.test.ts·alerts.test.ts·kit.test.ts 가 이미 본다. 여기서는 모델 사이를 본다.
import assert from "node:assert/strict";
import { test } from "node:test";

import { CIVIL_ALERTS } from "./alerts.ts";
import { CHECKLIST } from "./checklist.ts";
import { GO_BAG_ITEMS, STOCK_ITEMS } from "./kit.ts";

const GROUPS: Record<string, string[]> = {
  CHECKLIST: Object.values(CHECKLIST).flat().map((it) => it.id),
  "CIVIL_ALERTS 경보": CIVIL_ALERTS.map((a) => a.id),
  "CIVIL_ALERTS 행동": CIVIL_ALERTS.flatMap((a) => a.actions.map((it) => it.id)),
  GO_BAG_ITEMS: GO_BAG_ITEMS.map((it) => it.id),
  STOCK_ITEMS: STOCK_ITEMS.map((it) => it.id),
};

test("체크리스트·경보·경보 행동·가방·비축 id 가 서로 겹치지 않고 전체에서 유일", () => {
  // 빈 목록이면 겹칠 것이 없어 통과해 버리므로 먼저 막는다
  for (const [group, ids] of Object.entries(GROUPS)) assert.ok(ids.length > 0, `${group}: id 없음`);
  const owners = new Map<string, string[]>();
  for (const [group, ids] of Object.entries(GROUPS)) {
    for (const id of ids) owners.set(id, [...(owners.get(id) ?? []), group]);
  }
  const dupes = [...owners].filter(([, groups]) => groups.length > 1).map(([id, groups]) => `${id}: ${groups.join(", ")}`);
  assert.deepEqual(dupes, [], "겹치는 id(id: 들어 있는 목록)");
});
