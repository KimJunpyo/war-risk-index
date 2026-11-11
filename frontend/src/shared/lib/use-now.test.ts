// use-now 의 getSnapshot 은 렌더 중 두 번 불러도 같은 값이어야 한다. 개발 모드 React 가 두 번 불러 비교하고, 다르면
// "The result of getSnapshot should be cached to avoid an infinite loop" 경고를 낸다(두 호출 사이에 30초 경계가 지날 때).
// 실행(저장소 루트): node --test "frontend/src/**/*.test.ts"  (Node 24 타입 스트리핑, 별칭 import 불가)
import assert from "node:assert/strict";
import { test } from "node:test";

import { CLOCK_MS, getSnapshot, subscribe } from "./use-now.ts";

test("두 번 부르는 사이에 30초 경계가 지나도 getSnapshot 값이 같다", (t) => {
  let clock = CLOCK_MS - 1; // 경계 1ms 전부터 부를 때마다 1ms 흐름
  t.mock.method(Date, "now", () => clock++);
  t.after(subscribe(() => {}));
  assert.equal(getSnapshot(), getSnapshot());
});

test("구독 때와 30초마다 시각을 다시 읽어 알린다", (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let clock = 0;
  t.mock.method(Date, "now", () => clock);
  let changes = 0;
  t.after(subscribe(() => changes++));
  assert.equal(getSnapshot(), 0);

  clock = CLOCK_MS + 1;
  t.mock.timers.tick(CLOCK_MS);
  assert.equal(getSnapshot(), CLOCK_MS);
  assert.equal(changes, 2);
});
