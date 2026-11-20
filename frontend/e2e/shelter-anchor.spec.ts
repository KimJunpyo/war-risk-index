import { expect, test, type Locator, type Page } from "@playwright/test";

// 이슈 #103(1-4) 홈 대피소 영역 바로가기 /#shelters 실측. 기준 화면 폭(360·768·1080·1440)
//
// 화면 계약 (구현은 이 계약을 따른다)
// - 위젯: 제목 "내 주변 대피소"(heading)에서 가장 가까운 section(shelters.spec.ts 와 같음). 이 section 에 id="shelters", 문서에 이 id 는 하나
// - /#shelters 로 열면 제목이 처음 보인 프레임부터 1초 안에 아래 두 조건이 함께 선다. 데이터가 다 들어온 뒤에도 그대로
//   - section 윗변이 화면 안: -1px ≤ getBoundingClientRect().top < innerHeight
//   - document.activeElement 가 그 section 안 "내 주변 대피소 찾기" 버튼
//   위젯은 홈 요약의 animate-fade-up(0.5초 동안 8px 올라옴) 안에 있다. 그려지자마자 scrollIntoView({ block: "start" })만 하면
//   애니메이션이 끝난 뒤 윗변이 약 8px 화면 위로 나간다(구현을 흉내 내 확인, Firefox·WebKit). 위 여백(scroll-margin 등)이 필요하다
// - 위치는 묻지 않는다(plan.md Q10): 누르기 전 getCurrentPosition·watchPosition 호출 0회. 포커스된 그 버튼에서 Enter 한 번이면 묻는다
// - 해시가 없으면(/) 아무것도 하지 않는다: 데이터가 다 그려진 뒤에도 scrollY 0, 포커스는 body
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
const WIDE = 1440; // 폭과 무관한 동작은 한 폭에서만 본다
const TEST_TIMEOUT_MS = 60_000; // 첫 페이지 컴파일·데이터 기다림(30초)에 검사 시간을 더한 여유
const DATA_TIMEOUT_MS = 30_000; // 첫 페이지 컴파일·데이터가 들어와 위젯이 그려지기를 기다리는 시간
const ANCHOR_MS = 1_000; // 제목이 보인 뒤 스크롤·포커스까지 한도(인수 조건)
const TOLERANCE_PX = 1; // 스크롤 위치 반올림(윗변이 -0.5px 등)

const HOME = "/";
const ANCHOR = "/#shelters";
const SECTION_ID = "shelters";
const TITLE = "내 주변 대피소";
const FIND_NEARBY = "내 주변 대피소 찾기";
const LOADING = "불러오는 중";

/** 대피소 위젯. getByRole("region") 아래 evaluateAll 은 Firefox 페이지를 죽여서(Playwright 1.65) 제목으로 찾는다 */
const widgetOf = (page: Page) =>
  page.getByRole("heading", { name: TITLE, exact: true }).locator("xpath=ancestor::section[1]");
const findOf = (w: Locator) => w.getByRole("button", { name: FIND_NEARBY, exact: true });

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

/** 폭을 맞춰 path 를 열고 대피소 위젯이 보일 때까지 */
async function open(page: Page, width: number, path: string) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto(path, { timeout: DATA_TIMEOUT_MS });
  const widget = widgetOf(page);
  await expect(widget, "첫 화면 한국 선택 → 대피소 위젯").toBeVisible({ timeout: DATA_TIMEOUT_MS });
  return widget;
}

/** 데이터가 다 들어와 "불러오는 중"이 사라지고 등장 애니메이션(유한 반복)이 끝날 때까지 */
async function loaded(page: Page) {
  await expect(page.getByText(LOADING)).toHaveCount(0, { timeout: DATA_TIMEOUT_MS });
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => null))));
}

/** ms: 제목이 처음 보인 프레임부터 두 조건이 함께 선 첫 프레임까지(한도를 넘기면 null). top·active: 그 프레임의 윗변·포커스 */
type Anchor = { ms: number | null; top: number; active: string };

/** "제목이 보인 때부터 1초 안에"를 페이지 안 requestAnimationFrame 으로 매 프레임 잰다. page.goto 전에 부른다.
 *  Playwright expect 는 폴링 간격이 1초까지 늘어 제목이 보인 시각을 최대 1초 늦게 알아채므로 쓰지 않는다 */
const watchAnchor = (page: Page) => page.addInitScript(({ title, button, limit, tolerance }) => {
  const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  let seen: number | undefined;
  const frame = () => {
    const heading = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].find((e) => norm(e.textContent) === title);
    const section = heading?.closest("section");
    if (heading && section && heading.getBoundingClientRect().height > 0) {
      const now = performance.now();
      seen ??= now;
      const top = section.getBoundingClientRect().top;
      const a = document.activeElement;
      const ok = top >= -tolerance && top < window.innerHeight
        && a instanceof HTMLButtonElement && norm(a.textContent) === button && section.contains(a);
      if (ok || now - seen > limit) {
        const active = a === document.body ? "body" : a ? `${a.tagName.toLowerCase()} "${norm(a.textContent)}"` : "없음";
        (window as unknown as { __anchor: Anchor }).__anchor = { ms: ok ? now - seen : null, top, active };
        return;
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}, { title: TITLE, button: FIND_NEARBY, limit: ANCHOR_MS, tolerance: TOLERANCE_PX });

/** watchAnchor 가 정한 결과(두 조건이 섰거나 제목이 보인 뒤 한도를 넘김)를 받는다 */
async function anchorOf(page: Page): Promise<Anchor> {
  const handle = await page.waitForFunction(() => (window as unknown as { __anchor?: Anchor }).__anchor, undefined, {
    timeout: DATA_TIMEOUT_MS,
  });
  return (await handle.jsonValue())!;
}

/** getCurrentPosition·watchPosition 호출 수를 window.__geoCalls 에 센다(shelters.spec.ts 와 같은 계측).
 *  실제 위치 대신 거부(PERMISSION_DENIED) 콜백을 비동기로 돌려줘 어느 브라우저에서도 권한 팝업이 뜨지 않는다 */
const recordGeolocation = (page: Page) => page.addInitScript(() => {
  const w = window as unknown as { __geoCalls: number };
  w.__geoCalls = 0;
  const denied = { code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
  const deny = (onError?: PositionErrorCallback | null) => {
    w.__geoCalls++;
    setTimeout(() => onError?.(denied as GeolocationPositionError)); // 실제 브라우저처럼 비동기로
  };
  const proto = Geolocation.prototype;
  proto.getCurrentPosition = (_ok, onError) => deny(onError);
  proto.watchPosition = (_ok, onError) => {
    deny(onError);
    return 0; // 감시 id
  };
});
const geoCalls = (page: Page) => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);

// 측정 단언은 expect.soft 라 한 번 실행으로 어긋난 조건을 모두 보여 준다(요소가 있는지 같은 전제만 바로 멈춤)
test.describe.configure({ timeout: TEST_TIMEOUT_MS });

for (const width of WIDTHS) {
  test(`${width}px ${ANCHOR}: 제목이 보인 뒤 1초 안에 영역 윗변이 화면 안·포커스는 "${FIND_NEARBY}", 가로 넘침 없음·콘솔 오류 0건`, async ({ page }) => {
    const errors = trackErrors(page);
    await watchAnchor(page);
    const widget = await open(page, width, ANCHOR);
    await expect.soft(page.locator(`#${SECTION_ID}`), `id="${SECTION_ID}" 요소 하나`).toHaveCount(1);
    await expect.soft(widget, `대피소 영역 section 의 id`).toHaveAttribute("id", SECTION_ID);

    const t = await anchorOf(page);
    expect.soft(t.ms ?? Infinity, `제목이 보인 뒤 윗변 화면 안·찾기 버튼 포커스까지(ms). 그때 윗변 ${Math.round(t.top)}px, 포커스 ${t.active}`)
      .toBeLessThanOrEqual(ANCHOR_MS);

    await loaded(page);
    await expect.soft(findOf(widget), "데이터가 다 들어온 뒤에도 포커스는 찾기 버튼").toBeFocused();
    const top = await widget.evaluate((el) => el.getBoundingClientRect().top);
    expect.soft(top, "데이터가 다 들어온 뒤에도 영역 윗변이 화면 위 끝 아래").toBeGreaterThanOrEqual(-TOLERANCE_PX);
    expect.soft(top, "데이터가 다 들어온 뒤에도 영역 윗변이 화면 아래 끝 위").toBeLessThan(HEIGHT);
    const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect.soft(m.scroll, "가로 넘침").toBeLessThanOrEqual(m.inner);
    expect.soft(errors, "콘솔 오류").toEqual([]);
  });
}

test(`${ANCHOR}: 아무것도 누르지 않으면 위치 요청 0건, 포커스된 "${FIND_NEARBY}"에서 Enter 한 번이면 1건`, async ({ page }) => {
  await recordGeolocation(page);
  const widget = await open(page, WIDE, ANCHOR);
  await loaded(page);
  expect(await geoCalls(page), "누르기 전 위치 요청 수").toBe(0);
  await expect(findOf(widget), "전제: 바로가기로 찾기 버튼에 포커스").toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(() => geoCalls(page), "Enter 한 번이면 위치 요청 한 번(계측이 동작하는지)").toBe(1);
});

test(`${HOME}(해시 없음): 데이터가 다 그려진 뒤에도 scrollY 0·포커스는 body`, async ({ page }) => {
  await open(page, WIDE, HOME);
  await expect.soft(page.locator(`#${SECTION_ID}`), `id="${SECTION_ID}" 영역이 있어도 해시가 없으면 움직이지 않음`).toHaveCount(1);
  await loaded(page);
  const s = await page.evaluate(() => ({ y: window.scrollY, body: document.activeElement === document.body }));
  expect.soft(s.y, "scrollY").toBe(0);
  expect.soft(s.body, "포커스가 body").toBe(true);
});
