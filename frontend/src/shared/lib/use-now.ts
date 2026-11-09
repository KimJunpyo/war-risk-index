"use client";

import { useSyncExternalStore } from "react";

const CLOCK_MS = 30_000;

const subscribe = (onChange: () => void) => {
  const timer = setInterval(onChange, CLOCK_MS);
  return () => clearInterval(timer);
};
// 같은 30초 안에서는 같은 값을 돌려줘야 무한 재렌더가 나지 않음
const getSnapshot = () => Math.floor(Date.now() / CLOCK_MS) * CLOCK_MS;
// 서버(사전 렌더)에서는 시각을 읽지 않음 → null
const getServerSnapshot = () => null;

/** 30초마다 바뀌는 현재 시각(ms). 서버 렌더 중에는 null. */
export const useNow = (): number | null => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
