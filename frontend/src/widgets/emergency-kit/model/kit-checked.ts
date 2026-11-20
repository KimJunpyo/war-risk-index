"use client";

import { useSyncExternalStore } from "react";
import { KIT_STORAGE_KEY, readChecked, toggleChecked } from "@/entities/guide";

// 비상 가방 담기 상태(KIT_STORAGE_KEY). 이 탭에서 담기를 보는 컴포넌트(가방 타일, 첫 화면 가방 카드 1-9)가 같은 값을 받는다

const NONE: string[] = []; // 서버 렌더·하이드레이션 때 값. 늘 같은 배열이어야 React 가 바뀌지 않은 것으로 본다
const listeners = new Set<() => void>();
let checked: string[] | null = null; // 이 탭의 담은 id. 저장소를 처음 읽기 전에는 null

/** 저장소 원문 → 담은 id. 저장소 접근이 막혀도(사생활 보호 모드 등) 빈 담기 */
function load(): string[] {
  try {
    return readChecked(localStorage.getItem(KIT_STORAGE_KEY));
  } catch {
    return NONE;
  }
}

const emit = () => listeners.forEach((l) => l());

// 다른 탭에서 담기를 바꾸거나 저장소를 비우면(key null) 다시 읽는다. 같은 탭에서 바꾼 것은 storage 사건이 오지 않아 emit 으로 알린다
function onStorage(e: StorageEvent) {
  if (e.key !== KIT_STORAGE_KEY && e.key !== null) return;
  checked = load();
  emit();
}

function subscribe(onChange: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

// 처음 부를 때만 저장소를 읽고 그 뒤로는 같은 배열을 돌려준다(React 는 렌더마다 불러 비교하므로 매번 새 배열이면 무한 렌더)
const getSnapshot = () => (checked ??= load());
const getServerSnapshot = () => NONE;

/** 담은 항목 id(readChecked 형식). 서버 렌더·하이드레이션 때는 빈 배열이고, 저장값은 하이드레이션 뒤에 반영된다(불일치 없음) */
export const useKitChecked = (): string[] => useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

/** 항목 하나를 담거나 빼고 저장한다. 저장에 실패해도 이 탭의 화면 상태는 바뀐다 */
export function toggleKitItem(id: string) {
  checked = toggleChecked(getSnapshot(), id);
  try {
    localStorage.setItem(KIT_STORAGE_KEY, JSON.stringify(checked));
  } catch { /* 저장 실패해도 화면 상태는 유지 */ }
  emit();
}
