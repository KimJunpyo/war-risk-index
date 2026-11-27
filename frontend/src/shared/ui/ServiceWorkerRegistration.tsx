"use client";

import { useEffect } from "react";

// /emergency 오프라인 저장용 서비스 워커(public/sw.js, 이슈 #78)
const SW_URL = "/sw.js";
const SW_SCOPE = "/";

/** 프로덕션에서만 서비스 워커를 등록한다. 개발 서버는 개발 파일을 저장하지 않게 등록하지 않는다. 그리는 것은 없다 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    // 등록 실패(사설 모드 등)는 사이트 동작에 영향이 없어 무시한다
    navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE }).catch(() => undefined);
  }, []);
  return null;
}
