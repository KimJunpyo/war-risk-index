"use client";

import { useSyncExternalStore } from "react";

export const CLOCK_MS = 30_000;

// 마지막으로 읽은 30초 단위 시각. 개발 모드 React 는 렌더 중 getSnapshot 을 두 번 불러 비교하므로
// getSnapshot 은 시각을 직접 읽지 않고 이 값만 돌려준다(두 호출 사이에 30초 경계가 지나도 같은 값)
let now: number | null = null;

// shortcut: 구독자마다 타이머가 따로라 여러 컴포넌트가 쓰면 서로 최대 30초 어긋남, 사용처가 둘 이상 되면 리스너 집합 + 타이머 하나로
export const subscribe = (onChange: () => void) => {
  const tick = () => {
    now = Math.floor(Date.now() / CLOCK_MS) * CLOCK_MS;
    onChange(); // 값이 그대로면 React 가 다시 렌더하지 않음
  };
  tick(); // 구독하자마자 채움(첫 렌더는 null 또는 이전 값)
  const timer = setInterval(tick, CLOCK_MS);
  return () => clearInterval(timer);
};
export const getSnapshot = () => now;
// 서버(사전 렌더)에서는 시각을 읽지 않음 → null
const getServerSnapshot = () => null;

/** 30초마다 바뀌는 현재 시각(ms). 서버 렌더 중과 구독 전에는 null. */
export const useNow = (): number | null => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
