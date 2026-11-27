import { expect, test } from "@playwright/test";

// 이슈 #78 서비스 워커 등록 조건. 개발 서버(npm run dev)에서는 등록하지 않는다(개발 파일을 저장하지 않고 다른 e2e 에 영향 없음).
// 프로덕션 등록·저장·오프라인 응답은 수동 확인(오프라인 자동 테스트는 #80)
const SW_PATH = "/sw.js";

test("개발 서버: 홈을 연 뒤 서비스 워커 등록 0건", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  // Firefox 개발 서버는 networkidle 뒤에도 청크·글꼴을 늦게 받는다. 하이드레이션(등록 effect)이 끝날 때까지 기다린다
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await page.waitForLoadState("networkidle");
  const registrations = await page.evaluate(async () =>
    navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : null);
  // null 이면 브라우저가 서비스 워커를 지원하지 않아 확인이 되지 않은 것이라 실패로 본다
  expect(registrations).toBe(0);
});

test("/sw.js: 200, javascript, 캐시 금지 헤더", async ({ request }) => {
  const res = await request.get(SW_PATH);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("javascript");
  expect(res.headers()["cache-control"]).toBe("no-cache, no-store, must-revalidate");
});
