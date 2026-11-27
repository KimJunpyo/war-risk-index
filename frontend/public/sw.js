// /emergency 오프라인 저장용 서비스 워커(이슈 #78, plan.md 7-1). 라이브러리 없이 직접 쓴다.
// 위치에서 나온 정보와 API 응답은 저장하지 않는다: 다른 출처·/api/·좌표가 든 주소는 respondWith 를 부르지 않는다.

// 내용을 바꾸면 버전을 올린다. activate 에서 이 이름이 아닌 캐시는 지운다(영숫자 32자 이상 해시 금지)
const CACHE = "wri-emergency-v1";
const PAGE = "/emergency";
const EXTRA = ["/manifest.webmanifest", "/icon.svg"];
// HTML 이 가리키는 정적 파일(JS·CSS·글꼴). 인라인 RSC 데이터의 \" 이스케이프 앞에서 끊는다
const STATIC_REF = /\/_next\/static\/[^"'\s)\\]+/g;

/** /emergency 응답을 저장하고, 그 HTML 이 가리키는 정적 파일도 저장한다 */
async function savePage(cache, res) {
  const html = await res.clone().text();
  await cache.put(PAGE, res);
  const refs = [...new Set(html.match(STATIC_REF) ?? [])];
  // 한 파일이 실패해도 나머지는 저장한다
  await Promise.allSettled(refs.map((ref) => cache.add(ref)));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const res = await fetch(PAGE, { cache: "reload" });
    if (!res.ok) throw new Error(`${PAGE} ${res.status}`);
    await savePage(cache, res);
    await cache.addAll(EXTRA);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

/** 이동: /emergency 는 네트워크 먼저(성공하면 저장본 교체), 실패하면 저장본. 그 밖의 페이지는 실패하면 /emergency 로 보낸다 */
async function navigate(event, url) {
  const { request } = event;
  if (url.pathname === PAGE) {
    try {
      const res = await fetch(request);
      // 저장은 응답을 늦추지 않게 뒤에서 한다. 복제는 지금 해야 한다(돌려준 뒤에는 본문이 이미 읽혀 clone 이 실패)
      if (res.ok) {
        const copy = res.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => savePage(cache, copy)));
      }
      return res;
    } catch (err) {
      const saved = await caches.match(PAGE);
      if (saved) return saved;
      throw err;
    }
  }
  try {
    return await fetch(request);
  } catch {
    return Response.redirect(PAGE, 302);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || /[?&](lat|lon|lng)=/.test(url.search)) return;
  if (request.mode === "navigate") {
    event.respondWith(navigate(event, url));
    return;
  }
  // 저장 대상 경로만 저장본 먼저. 저장본이 없으면 네트워크로 받기만 하고 저장하지 않는다
  if (url.pathname.startsWith("/_next/static/") || EXTRA.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((saved) => saved ?? fetch(request)));
  }
});
