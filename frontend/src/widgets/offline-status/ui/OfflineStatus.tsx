"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { savedAtKst } from "../model/saved-at";

// public/sw.js 가 저장하는 주소. 캐시 이름(wri-emergency-vN)은 버전이 오르므로 이름 없이 모든 캐시에서 찾는다
const PAGE = "/emergency";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
const getSnapshot = () => navigator.onLine;
const getServerSnapshot = () => true; // 서버 렌더·하이드레이션 때는 온라인(줄은 저장본을 읽은 뒤에만 그려 불일치 없음)

/** /emergency 저장 상태 줄(이슈 #79). 저장 시각은 저장본 응답의 date 헤더(한국 시각).
 *  서비스 워커를 지원하지 않거나 저장본이 없으면 그리지 않는다. 브라우저 안에서만 읽어 API 요청은 없다 */
export function OfflineStatus() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // 처음과 온라인·오프라인이 바뀔 때, 첫 설치 뒤 서비스 워커가 페이지를 맡을 때(controllerchange) 저장본을 다시 읽는다
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("caches" in window)) return;
    let alive = true;
    const read = () => {
      caches.match(PAGE)
        .then((res) => {
          if (alive) setSavedAt(savedAtKst(res?.headers.get("date")));
        })
        .catch(() => undefined); // 저장소 접근이 막히면(사설 모드 등) 줄을 그리지 않는다
    };
    read();
    navigator.serviceWorker.addEventListener("controllerchange", read);
    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener("controllerchange", read);
    };
  }, [online]);

  if (!savedAt) return null;
  return (
    <p role="status" className={`mt-3 text-xs ${online ? "text-fg-muted" : "font-semibold text-warning"}`}>
      {online ? "이 기기에 저장됨" : "오프라인: 저장된 안내입니다"} · 저장 {savedAt}
    </p>
  );
}
