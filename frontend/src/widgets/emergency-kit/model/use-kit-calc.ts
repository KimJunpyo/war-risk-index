"use client";

import { useSyncExternalStore } from "react";
import { KIT_CALC_STORAGE_KEY, readKitCalc } from "@/entities/guide";

type KitCalc = ReturnType<typeof readKitCalc>; // { people, period }

// 서버 렌더와 하이드레이션 첫 렌더는 기본값(4명·7일 비축). 저장값은 마운트 뒤에 들어와 하이드레이션이 어긋나지 않는다
const SERVER_SNAPSHOT = readKitCalc(null);
// 이 탭의 계산 입력. getSnapshot 은 부를 때마다 같은 값을 돌려줘야 해서 저장소는 캐시가 빈 때만 읽는다
let current: KitCalc | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((onChange) => onChange());

// 다른 탭에서 바꾸거나 저장소를 비우면(key null) 캐시를 비우고 알린다(다음 getSnapshot 이 다시 읽음).
// 같은 탭에서 바꾼 것은 storage 사건이 오지 않아 setKitCalc 가 알린다
function onStorage(e: StorageEvent) {
  if (e.key !== KIT_CALC_STORAGE_KEY && e.key !== null) return;
  current = null;
  emit();
}

const subscribe = (onChange: () => void) => {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size > 0) return;
    window.removeEventListener("storage", onStorage);
    current = null; // 구독자가 없는 동안 다른 탭이 바꾼 값을 다음 마운트 때 다시 읽게
  };
};
const getSnapshot = () => {
  if (!current) {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KIT_CALC_STORAGE_KEY);
    } catch { /* 저장소 접근이 막혀도 기본값 */ }
    current = readKitCalc(raw);
  }
  return current;
};
const getServerSnapshot = () => SERVER_SNAPSHOT;

/** 바른 값(가구원 1~MAX_PEOPLE 정수, KIT_PERIODS id)만 받는다. 잘못된 입력은 부르는 쪽이 넘기지 않는다.
 *  넘긴 칸만 바꾸고 나머지는 지금 값 그대로(하이드레이션 직후 아직 기본값으로 그린 화면에서 눌러도 저장값의 다른 칸을 덮지 않게) */
function setKitCalc(patch: Partial<KitCalc>) {
  const next = { ...getSnapshot(), ...patch };
  current = next;
  try {
    localStorage.setItem(KIT_CALC_STORAGE_KEY, JSON.stringify(next));
  } catch { /* 저장 실패해도 화면 상태는 유지 */ }
  emit();
}

/** 계산기 입력(가구원 수·기간)과 바꾸는 함수. KIT_CALC_STORAGE_KEY 에 브라우저에만 저장하고,
 *  이 훅을 쓰는 컴포넌트(계산기, 첫 화면 물 카드 1-9)는 같은 값을 따라간다 */
export function useKitCalc(): [KitCalc, (patch: Partial<KitCalc>) => void] {
  return [useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot), setKitCalc];
}
