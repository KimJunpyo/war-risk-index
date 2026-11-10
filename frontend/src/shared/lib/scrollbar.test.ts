// 이슈 #20 (1-2 오버레이 스크롤바) thumb 크기·위치 계산 인수 테스트.
// 실행(저장소 루트): node --test frontend/src/**/*.test.ts  (Node 24 타입 스트리핑, 별칭 import 불가)
//
// 계약 (구현은 이 계약을 따른다) — frontend/src/shared/lib/scrollbar.ts, @/ 별칭 import 없음
//   export const MIN_THUMB = 24;  // 최소 thumb 길이(px)
//   export function thumbMetrics(p: { clientHeight: number; scrollHeight: number; scrollTop: number; minThumb?: number })
//     : { visible: boolean; size: number; offset: number };
//   export function scrollTopFromDrag(p: { startScrollTop: number; deltaY: number; clientHeight: number;
//     scrollHeight: number; thumbSize: number }): number;
// 규칙 (트랙 길이 = clientHeight, 반올림하지 않음)
//   - scrollHeight <= clientHeight 또는 clientHeight <= 0 → { visible: false, size: 0, offset: 0 }
//   - size = min(clientHeight, max(minThumb ?? MIN_THUMB, clientHeight * clientHeight / scrollHeight))
//   - maxScroll = scrollHeight - clientHeight
//     offset = clamp(scrollTop / maxScroll, 0, 1) * (clientHeight - size)   // 오버스크롤(음수·초과)도 클램프
//   - scrollTopFromDrag = clamp(startScrollTop + deltaY * maxScroll / (clientHeight - thumbSize), 0, max(0, maxScroll))
//     clientHeight - thumbSize <= 0 이면 startScrollTop 을 같은 범위로 클램프해 반환(NaN·Infinity 없음)
import assert from "node:assert/strict";
import { test } from "node:test";

import { MIN_THUMB, scrollTopFromDrag, thumbMetrics } from "./scrollbar.ts";

const EPS = 1e-9;
const near = (actual: number, expected: number, why: string) =>
  assert.ok(Math.abs(actual - expected) < EPS, `${why}: ${actual} != ${expected}`);

test("최소 길이 상수는 24px", () => {
  assert.equal(MIN_THUMB, 24);
});

test("넘치지 않으면 숨김", () => {
  const hidden = { visible: false, size: 0, offset: 0 };
  assert.deepEqual(thumbMetrics({ clientHeight: 400, scrollHeight: 400, scrollTop: 0 }), hidden, "같음");
  assert.deepEqual(thumbMetrics({ clientHeight: 400, scrollHeight: 300, scrollTop: 0 }), hidden, "내용이 더 작음");
  assert.deepEqual(thumbMetrics({ clientHeight: 0, scrollHeight: 300, scrollTop: 0 }), hidden, "높이 0");
});

test("길이는 보이는 비율 × 트랙", () => {
  const m = thumbMetrics({ clientHeight: 400, scrollHeight: 1600, scrollTop: 0 });
  assert.equal(m.visible, true);
  near(m.size, 100, "400 * 400 / 1600");
});

test("맨 위면 offset 0, 맨 아래면 thumb 끝이 트랙 끝", () => {
  near(thumbMetrics({ clientHeight: 400, scrollHeight: 1600, scrollTop: 0 }).offset, 0, "맨 위");
  const bottom = thumbMetrics({ clientHeight: 400, scrollHeight: 1600, scrollTop: 1200 });
  near(bottom.offset, 300, "맨 아래 offset");
  near(bottom.offset + bottom.size, 400, "맨 아래 끝");
});

test("중간 위치는 비례", () => {
  near(thumbMetrics({ clientHeight: 400, scrollHeight: 1600, scrollTop: 600 }).offset, 150, "절반 → (400-100)/2");
});

test("최소 길이 보정 후에도 맨 아래에서 끝이 맞음", () => {
  const top = thumbMetrics({ clientHeight: 300, scrollHeight: 30000, scrollTop: 0 });
  assert.equal(top.size, MIN_THUMB, "비율로는 3px");
  const bottom = thumbMetrics({ clientHeight: 300, scrollHeight: 30000, scrollTop: 29700 });
  near(bottom.offset + bottom.size, 300, "끝 일치");
});

test("minThumb 인자가 기본값보다 우선", () => {
  assert.equal(thumbMetrics({ clientHeight: 300, scrollHeight: 30000, scrollTop: 0, minThumb: 40 }).size, 40);
});

test("트랙이 최소 길이보다 짧으면 트랙 길이를 넘지 않음", () => {
  const m = thumbMetrics({ clientHeight: 20, scrollHeight: 200, scrollTop: 180 });
  assert.equal(m.visible, true);
  assert.equal(m.size, 20);
  near(m.offset, 0, "남는 트랙 0");
});

test("오버스크롤(음수·최대 초과)은 클램프", () => {
  near(thumbMetrics({ clientHeight: 400, scrollHeight: 1600, scrollTop: -50 }).offset, 0, "음수");
  near(thumbMetrics({ clientHeight: 400, scrollHeight: 1600, scrollTop: 1300 }).offset, 300, "초과");
});

test("소수 입력(배율·서브픽셀)", () => {
  const m = thumbMetrics({ clientHeight: 380.5, scrollHeight: 1141.5, scrollTop: 380.5 });
  near(m.size, (380.5 * 380.5) / 1141.5, "길이");
  near(m.offset, 0.5 * (380.5 - m.size), "절반 위치");
  const bottom = thumbMetrics({ clientHeight: 380.5, scrollHeight: 1141.5, scrollTop: 761 });
  near(bottom.offset + bottom.size, 380.5, "소수 맨 아래 끝");
});

const BASE = { clientHeight: 400, scrollHeight: 1600, thumbSize: 100 };

test("드래그 거리 → 스크롤 위치 비례 환산", () => {
  // thumb 이동 가능 300px ↔ 스크롤 가능 1200px, 4배
  assert.equal(scrollTopFromDrag({ ...BASE, startScrollTop: 0, deltaY: 75 }), 300);
  assert.equal(scrollTopFromDrag({ ...BASE, startScrollTop: 600, deltaY: -50 }), 400);
});

test("드래그 양 끝 클램프", () => {
  assert.equal(scrollTopFromDrag({ ...BASE, startScrollTop: 100, deltaY: -500 }), 0, "0 미만 없음");
  assert.equal(scrollTopFromDrag({ ...BASE, startScrollTop: 1000, deltaY: 500 }), 1200, "최대 초과 없음");
  assert.equal(scrollTopFromDrag({ ...BASE, startScrollTop: 0, deltaY: 300 }), 1200, "트랙 끝까지 끌면 맨 아래");
});

test("드래그 소수 입력", () => {
  const top = scrollTopFromDrag({ clientHeight: 380.5, scrollHeight: 1141.5, thumbSize: 126.5, startScrollTop: 10.25, deltaY: 12.7 });
  near(top, 10.25 + (12.7 * 761) / 254, "비례");
});

test("thumb 위치 ↔ 스크롤 위치 왕복", () => {
  const m = thumbMetrics({ clientHeight: 400, scrollHeight: 1600, scrollTop: 0 });
  const scrollTop = scrollTopFromDrag({ ...BASE, thumbSize: m.size, startScrollTop: 0, deltaY: 123 });
  near(thumbMetrics({ clientHeight: 400, scrollHeight: 1600, scrollTop }).offset, 123, "끈 만큼 thumb 이동");
});

test("thumb가 트랙을 다 차지하면 0 나누기 없이 시작 위치 유지", () => {
  const top = scrollTopFromDrag({ clientHeight: 20, scrollHeight: 200, thumbSize: 20, startScrollTop: 50, deltaY: 10 });
  assert.equal(top, 50);
  assert.equal(scrollTopFromDrag({ clientHeight: 400, scrollHeight: 300, thumbSize: 0, startScrollTop: 30, deltaY: 10 }), 0, "넘치지 않음");
});
