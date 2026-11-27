import { expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { CIVIL_ALERTS } from "../src/entities/guide/model/alerts";
import { API_BASE_URL } from "../src/shared/config/env";
import type { EmbassyBundle } from "../src/widgets/embassy-contacts/model/embassy";

// 이슈 #80(2-5) /emergency 오프라인 저장(서비스 워커 #78) 실측. Chromium·프로덕션 서버 전용: npm run e2e:offline(playwright.offline.config.ts).
// 기본 설정(npm run e2e, Firefox·WebKit)은 이 파일을 testIgnore 로 뺀다.
// Chrome 은 setOffline(true) 로 새로 고쳐도 navigator.onLine 이 true 로 남을 수 있어 오프라인 문구(#79)는 단언하지 않는다
const PATH = "/emergency";
const ACTIVATE_MS = 30_000; // 홈을 연 뒤 서비스 워커가 activated 가 되기까지 한도(인수 조건)
const TEST_TIMEOUT_MS = 60_000; // 활성화 대기(최대 30초) 뒤 오프라인 화면을 보는 테스트가 있어 기본(30초)보다 길게
const EMBASSY = "section#embassies"; // 재외공관 영역(#77, emergency.spec.ts 와 같음)
const BAG_TITLES = ["들고 나가는 3일 가방(1인 1개)", "집에 두는 7일 비축"]; // #kit 두 목록 제목(emergency-kit.spec.ts 와 같음)
const PEOPLE = "가구원 수";
const PERIOD = "기간";
const STOCK7 = "7일 비축";
const ONE = { people: "1", water: "21L" }; // 1명·7일 비축: 계산이 실제로 도는지 보려고 기본값(4명)과 다른 값을 먼저 넣는다
const FOUR = { people: "4", water: "84L" }; // 4명·7일 비축(인수 조건)
const FORBIDDEN = ["/api/", "lat="]; // Cache Storage 에 있으면 안 되는 주소 조각(인수 조건)

const tilesOf = (page: Page) => page.locator(CIVIL_ALERTS.map((a) => `main a[href="${PATH}/${a.id}"]`).join(", "));
const calcOf = (page: Page) => page.locator("#calc");
const peopleOf = (page: Page) => calcOf(page).getByRole("spinbutton", { name: PEOPLE, exact: true });
const liveOf = (page: Page) => calcOf(page).locator('[aria-live="polite"]').first(); // 계산 결과(emergency-kit.spec.ts 와 같음)

/** 서비스 워커 상태. 등록 전이면 null */
const swState = (page: Page) => page.evaluate(async () =>
  (await navigator.serviceWorker.getRegistration())?.active?.state ?? null);

/** 홈을 열고 서비스 워커가 ACTIVATE_MS 안에 activated 가 되기를 기다린다. 등록은 하이드레이션 뒤 effect 라 이 상태가 하이드레이션 끝도 뜻한다 */
async function install(page: Page) {
  await page.goto("/");
  await expect.poll(() => swState(page), { message: "서비스 워커 activated", timeout: ACTIVATE_MS }).toBe("activated");
}

/** 계산기 인원 칸이 readOnly 를 벗으면 하이드레이션 끝(emergency-kit.spec.ts open 과 같은 조건) */
const hydrated = (page: Page) => expect(peopleOf(page)).not.toHaveAttribute("readonly");

/** 설치 → 온라인으로 /emergency → 오프라인으로 바꾸고 새로 고친다 */
async function reloadOffline(page: Page, context: BrowserContext) {
  await install(page);
  await page.goto(PATH);
  await hydrated(page);
  await context.setOffline(true);
  await page.reload();
  await hydrated(page);
}

/** 테스트가 비교할 공관 묶음 응답(빌드 때 서버가 받은 것과 같은 API). request 는 브라우저 컨텍스트 밖이라 오프라인 영향이 없다 */
async function embassyBundle(request: APIRequestContext): Promise<EmbassyBundle> {
  const res = await request.get(`${API_BASE_URL}/api/embassies`);
  expect(res.status(), "/api/embassies 응답").toBe(200);
  return res.json();
}

test.describe.configure({ timeout: TEST_TIMEOUT_MS });

test(`홈을 연 뒤 ${ACTIVATE_MS / 1000}초 안에 서비스 워커 activated`, async ({ page }) => {
  await install(page);
});

test("오프라인 /emergency 새로 고침: 경보 5종·가방 목록·공관 접기가 보인다", async ({ page, context, request }) => {
  const bundle = await embassyBundle(request);
  await reloadOffline(page, context);
  await expect.soft(tilesOf(page).filter({ visible: true }), "경보 타일").toHaveCount(CIVIL_ALERTS.length);
  for (const title of BAG_TITLES) {
    await expect.soft(page.locator("#kit").getByRole("heading", { name: title, exact: true }), `가방 목록 "${title}"`).toBeVisible();
  }
  test.skip(!bundle.available, "공관 데이터 없음(백엔드 공공데이터 키 없음)");
  const summaries = page.locator(`${EMBASSY} details > summary`);
  await expect.soft(summaries, "나라 접기 수 = 응답 나라 수").toHaveCount(bundle.countries.length);
  await expect.soft(summaries.first(), "첫 나라 접기").toBeVisible();
});

test(`오프라인 계산기: ${FOUR.people}명·${STOCK7}이면 "${FOUR.water}"`, async ({ page, context }) => {
  await reloadOffline(page, context);
  await calcOf(page).getByRole("radiogroup", { name: PERIOD, exact: true }).getByRole("radio", { name: STOCK7, exact: true }).click();
  for (const c of [ONE, FOUR]) {
    await peopleOf(page).fill(c.people);
    await expect(liveOf(page), `${c.people}명`).toContainText(c.water);
  }
});

test(`오프라인에서 / 로 가면 ${PATH}`, async ({ page, context }) => {
  await install(page);
  await context.setOffline(true);
  await page.goto("/");
  await expect(page).toHaveURL(PATH);
  await expect(tilesOf(page).first(), "저장본 경보 타일").toBeVisible();
});

test(`Cache Storage 키에 ${FORBIDDEN.join("·")} 0건`, async ({ page, context }) => {
  // 홈(API 를 부르는 화면)과 /emergency 를 온라인·오프라인으로 다 거친 뒤 본다
  await reloadOffline(page, context);
  const urls = await page.evaluate(async () => {
    const all: string[] = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) all.push(req.url);
    return all;
  });
  expect(urls.length, "저장된 항목(0이면 확인이 안 된 것)").toBeGreaterThan(0);
  expect(urls.filter((u) => FORBIDDEN.some((f) => u.includes(f))), "API·좌표 주소").toEqual([]);
});
