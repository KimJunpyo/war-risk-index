import { expect, test, type Locator, type Page } from "@playwright/test";
import { KIT_SOURCES, type KitSourceKey, MAX_PEOPLE } from "../src/entities/guide/model/kit";
import { shoppingList, shoppingText } from "../src/entities/guide/model/shopping";

// 이슈 #107(1-8) /emergency#calc 장보기 목록·3일 가방 물 나누기·장보기 목록 복사 실측. 기준 화면 폭(360·768·1080·1440)
// 목록 줄과 복사 글자는 이슈 #102(1-3) 모델(shopping.ts shoppingList·shoppingText)과 비교하고, 인수 조건의 글자는 그대로 쓴다.
// 계산기 입력·결과는 emergency-kit.spec.ts, 명도 대비는 contrast.spec.ts 의 장보기·복사 상태,
// llms.txt 는 tests/test_m17_shopping_list_llms.py, 복사 아이콘 고지는 tests/test_m17_shopping_icons.py.
// 클립보드: Playwright 의 클립보드 권한은 Firefox·WebKit 이 달라 실제 클립보드를 읽지 않는다. 두 브라우저 모두 addInitScript 로
// navigator.clipboard 를 바꿔 writeText 가 받은 글자를 기록한다. 메모 앱에 붙여 넣어 줄바꿈 보기는 이슈의 [수동] 항목
//
// 화면 선택자 계약 (구현은 이 계약을 따른다. emergency-kit.spec.ts "계산기 영역" 계약 위에 더한다)
// - 장보기 영역: #calc 안 h3(접근 이름이 "장보기 목록"으로 시작. 예 "장보기 목록 (4명 · 7일 비축)")에서 복사 버튼을 품은 가장 가까운 조상.
//   결과 live 영역(#calc 안 첫 aria-live="polite")과 서로 품지 않는다. md 미만은 결과 아래, md 이상은 입력 오른쪽·결과 아래(plan.md 7-7)
//   가구원 수가 잘못된 값(0·21·1.5·빈칸)이면 장보기 제목·복사 버튼이 보이지 않고, 바른 값으로 고치면 다시 보인다
// - 7·14일 비축: shoppingList(가구원 수, 기간 id) 줄마다 보이는 글자(공백·기호 그대로, 숫자를 다른 요소로 나눠도 글자는 이대로).
//   물 "2L 생수 6병 묶음 {팩}팩({병}병, 약 {kg}kg)", "휴대용 가스레인지 {대}대", 품목 "{name} {qty}{unit}".
//   두 줄을 한 줄에 이어도 된다(예 "휴대용 가스레인지 1대 · 부탄가스 24개")
//   - 목록 아래 조리용 물 안내("데우기·설거지 물은 따로" 글자)와 주식 안내(한 요소 글자에 "주식"…"넉넉"). 근거 글자 "농림수산성"·"어른 2명·1주"
// - 3일 가방: 보이는 글자 순서가 "가방에 넣을 몫" → 가방 몫("500mL {병}병"·"{끼}끼"·"가방 {가구원 수}개") → "집에 둘 몫"
//   → 집 몫("{팩}팩({병}병, 약 {kg}kg)"·"{L}L"). 국민안전24 "2~3일분" 안내와 "7일 비축" 겹침 안내가 있고, 가스레인지·품목 이름은 없다
// - 출처: 비축이면 KIT_SOURCES.maff, 3일 가방이면 mois-emergency·maff-carry 의 a[href=url](target="_blank", rel 에 noreferrer)와 확인일.
//   장보기 영역 안 링크는 모두 maff.go.jp·safekorea.go.kr(하위 도메인 포함)이고, 보이는 글자·복사 글자에 숫자 뒤 "원"(가격)이 없다
// - 복사 버튼: 장보기 영역 안 접근 이름이 정확히 "장보기 목록 복사"인 button 하나, 4폭에서 높이 44px 이상.
//   안의 아이콘 svg 하나는 aria-hidden="true"(그림 widgets/emergency-kit/ui/shopping-icons.tsx, lucide copy)
//   - 누르면 navigator.clipboard.writeText(shoppingText(지금 가구원 수, 지금 기간 id)) 한 번. navigator.clipboard 는 누를 때 읽는다
//   - 안내: 장보기 영역 안 aria-live="polite" 요소 하나. 누르기 전부터 DOM 에 있고 글자는 비어 있다. 성공이면 1초 안에 COPIED,
//     writeText 가 거절(reject)되거나 navigator.clipboard 가 없으면 1초 안에 COPY_FAILED(다른 복사 방법으로 대신하지 않는다). 콘솔 오류 없음
// - 목록을 보고 복사하는 동안 네트워크 요청 0건(지연 로딩 청크 포함)
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
const MD = 768;
const WIDE = 1440; // 폭과 무관한 동작은 한 폭에서만 본다
const TOLERANCE_PX = 1;
const TEST_TIMEOUT_MS = 60_000; // 개발 서버 첫 컴파일이 길 때가 있어 기본(30초)보다 길게
const RESULT_TIMEOUT_MS = 1_000; // 입력·누름부터 목록·안내가 보이기까지 한도(인수 조건 "1초 안에")
const LATE_REQUEST_MS = 1_000; // 복사 뒤 늦게 나가는 요청까지 기다리는 시간
const TARGET_MIN_PX = 44; // 복사 버튼 높이 최소(plan.md 7-8)

const PATH = "/emergency";
const CALC = "#calc";
const PEOPLE = "가구원 수";
const PERIOD = "기간";
const INC = "가구원 수 늘리기";
const POLITE = '[aria-live="polite"]';
const TITLE = /^장보기 목록/; // h3 접근 이름 앞부분(뒤에 "(4명 · 7일 비축)" 같은 글자가 붙어도 된다)
const COPY = "장보기 목록 복사";
const COPIED = "복사했습니다";
const COPY_FAILED = "복사하지 못했습니다. 목록을 길게 눌러 직접 복사해 주세요.";
const COOKING_NOTE = "데우기·설거지 물은 따로";
const STAPLE_NOTE = /주식.*넉넉/; // 주식은 끼니 수보다 넉넉하다는 안내
const BASIS = ["농림수산성", "어른 2명·1주"];
const BAG_SHARE = "가방에 넣을 몫";
const HOME_SHARE = "집에 둘 몫";
const BAG_NOTES = ["2~3일분", "7일 비축"]; // 국민안전24 생존배낭 안내, 7일 비축과 겹침 안내
const STOVE = "휴대용 가스레인지";
const INVALID_PEOPLE = ["0", "21", "1.5", ""]; // emergency-kit.spec.ts 와 같은 잘못된 값
const PRICE = /\d\s*원/; // 숫자 뒤 "원"(가격)
const LINK_DOMAINS = ["maff.go.jp", "safekorea.go.kr"];
const NOREFERRER = /(^|\s)noreferrer(\s|$)/;
// 개발 서버 도구(오류 오버레이·devtools 의 /__nextjs_*)와 HMR 요청은 운영에 없어 세지 않는다
const DEV_ONLY = /\/(?:__nextjs|_next\/webpack-hmr)/;

type Input = { people: number; period: string; id: string }; // period: 기간 칩 글자, id: KIT_PERIODS id
const FOUR_WEEK: Input = { people: 4, period: "7일 비축", id: "stock7" };
const FIVE_WEEK: Input = { people: 5, period: "7일 비축", id: "stock7" };
const FOUR_TWO_WEEKS: Input = { people: 4, period: "14일 비축", id: "stock14" };
const FOUR_BAG: Input = { people: 4, period: "3일 가방", id: "bag" };
// 폭별 확인용: 가장 긴 목록, 가장 큰 가방 몫
const MAX_TWO_WEEKS: Input = { people: MAX_PEOPLE, period: "14일 비축", id: "stock14" };
const MAX_BAG: Input = { people: MAX_PEOPLE, period: "3일 가방", id: "bag" };
// 인수 조건 글자 그대로
const FOUR_WEEK_TEXTS = [
  "2L 생수 6병 묶음 7팩(42병, 약 84kg)",
  "부탄가스 24개",
  "쌀 8kg",
  "봉지라면 36개",
  "즉석밥 12개",
  "레토르트 식품(카레·짜장·덮밥 소스 등) 48개",
  "통조림(고기·생선) 36캔",
];
const CHANGES = [
  { input: FIVE_WEEK, texts: ["2L 생수 6병 묶음 9팩(54병, 약 108kg)", "부탄가스 30개"] },
  { input: FOUR_TWO_WEEKS, texts: ["14팩(84병, 약 168kg)", "부탄가스 48개"] },
];
const FOUR_BAG_TEXTS = { bag: ["500mL 4병", "9끼", "가방 4개"], home: ["3팩(18병, 약 36kg)", "28L"] };

type Box = { x: number; y: number; width: number; height: number; bottom: number; right: number };

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  expect(b, "요소가 화면에 없음").not.toBeNull();
  return { ...b!, bottom: b!.y + b!.height, right: b!.x + b!.width };
}

/** 등장 애니메이션(fade-up 등 유한 반복)이 끝날 때까지 기다린다. 무한 반복(ping·blink)은 제외 */
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations()
  .filter((a) => a.effect?.getTiming().iterations !== Infinity)
  .map((a) => a.finished.catch(() => null))));

function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function expectNoOverflow(page: Page, label: string) {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect.soft(m.scroll, `${label}: 가로 넘침`).toBeLessThanOrEqual(m.inner);
}

/** /emergency 를 연다. 하이드레이션 끝을 알리는 요소가 없어 네트워크가 잠잠해질 때까지 기다린다(emergency-kit.spec.ts 와 같음) */
async function open(page: Page, width = WIDE) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto(PATH, { waitUntil: "networkidle" });
}

/** 가짜 클립보드(페이지를 열기 전에 부른다). ok: writeText 가 받은 글자를 window.__copied 에 쌓고 성공,
 *  reject: 쌓고 NotAllowedError 로 거절(권한 거부와 같음), missing: navigator.clipboard 가 없음(보안 출처가 아닐 때와 같음) */
type ClipboardMode = "ok" | "reject" | "missing";
const stubClipboard = (page: Page, mode: ClipboardMode) => page.addInitScript((mode) => {
  const w = window as unknown as { __copied: string[] };
  w.__copied = [];
  const writeText = (text: string) => {
    w.__copied.push(text);
    return mode === "ok" ? Promise.resolve() : Promise.reject(new DOMException("Write permission denied.", "NotAllowedError"));
  };
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: mode === "missing" ? undefined : { writeText } });
}, mode);
/** writeText 가 받은 글자(부른 순서). 가짜 클립보드가 없으면 undefined */
const copiedTexts = (page: Page) => page.evaluate(() => (window as unknown as { __copied?: string[] }).__copied);

const calcOf = (page: Page) => page.locator(CALC);
const peopleOf = (calc: Locator) => calc.getByRole("spinbutton", { name: PEOPLE, exact: true });
const periodsOf = (calc: Locator) => calc.getByRole("radiogroup", { name: PERIOD, exact: true });
const chipOf = (calc: Locator, label: string) => periodsOf(calc).getByRole("radio", { name: label, exact: true });
/** 결과 live 영역(emergency-kit.spec.ts liveOf 와 같음) */
const resultOf = (calc: Locator) => calc.locator(POLITE).first();
const titleOf = (calc: Locator) => calc.getByRole("heading", { level: 3, name: TITLE });
/** 장보기 영역: h3 제목에서 복사 버튼을 품은 가장 가까운 조상 */
const shopOf = (calc: Locator) => titleOf(calc).locator(`xpath=ancestor::*[.//button[contains(normalize-space(.), "${COPY}")]][1]`);
const copyOf = (scope: Locator) => scope.getByRole("button", { name: COPY, exact: true });
const statusOf = (shop: Locator) => shop.locator(POLITE);

/** 기간을 고르고 가구원 수를 넣는다(가구원 수가 마지막 입력. emergency-kit.spec.ts calculate 와 같은 순서) */
async function setInput(calc: Locator, c: Input) {
  await chipOf(calc, c.period).click();
  await peopleOf(calc).fill(String(c.people));
}

/** 장보기 영역. 하나가 아니면 바로 멈춘다(없는 영역 안을 찾느라 테스트 제한 시간까지 기다리지 않게) */
async function shopIn(calc: Locator, label: string) {
  const shop = shopOf(calc);
  await expect(shop, `${label}: 장보기 영역(h3 "장보기 목록…"에서 "${COPY}" 버튼을 품은 조상) 하나`).toHaveCount(1);
  return shop;
}

/** 복사 버튼을 누른다. 하나가 아니면 바로 멈춘다 */
async function clickCopy(shop: Locator) {
  const button = copyOf(shop);
  await expect(button, `"${COPY}" 버튼 하나`).toHaveCount(1);
  await button.click();
}

/** 비축 목록(shoppingList). 3일 가방·잘못된 입력이면 테스트 자체 오류 */
function stockOf(c: Input) {
  const list = shoppingList(c.people, c.id);
  if (list?.kind !== "stock") throw new Error(`${c.people}명·${c.id}: 비축 목록이 아님`);
  return list;
}

/** 비축 목록 줄 글자: shoppingList 값을 계약의 글자 꼴로 */
function stockTexts(c: Input): string[] {
  const list = stockOf(c);
  const { packs, bottles, kg } = list.water;
  return [
    `2L 생수 6병 묶음 ${packs}팩(${bottles}병, 약 ${kg}kg)`,
    `${STOVE} ${list.stove}대`,
    ...list.items.map((it) => `${it.name} ${it.qty}${it.unit}`),
  ];
}
// 3일 가방에 없어야 하는 이름: 가스레인지와 비축 품목
const STOCK_NAMES = [STOVE, ...stockOf(FOUR_WEEK).items.map((it) => it.name)];

/** 비축이면 물 줄, 3일 가방이면 "집에 둘 몫"이 보일 때까지(입력을 바꾼 뒤 목록이 새로 그려진 것) */
async function expectListFor(shop: Locator, c: Input) {
  const text = c.id === "bag" ? HOME_SHARE : stockTexts(c)[0];
  await expect(shop.getByText(text).first(), `${c.people}명·${c.period}: "${text}"`).toBeVisible();
}

const shownText = (scope: Locator) => scope.evaluate((el) => (el as HTMLElement).innerText);

/** 보이는 글자(innerText) 순서: 모든 글자가 있고, 앞 묶음의 글자가 다음 묶음의 글자보다 먼저 나온다(묶음 안 순서는 따지지 않음) */
async function expectOrder(scope: Locator, groups: string[][], label: string) {
  const shown = (await shownText(scope)).replace(/\s+/g, " ");
  const at = (t: string) => shown.indexOf(t);
  expect.soft(groups.flat().filter((t) => at(t) < 0), `${label}: 보이는 글자에 없음`).toEqual([]);
  const late = groups.slice(1).flatMap((next, k) => groups[k].flatMap((a) => next
    .filter((b) => at(a) >= 0 && at(b) >= 0 && at(a) > at(b))
    .map((b) => `"${a}" 가 "${b}" 보다 뒤`)));
  expect.soft(late, `${label}: 글자 순서`).toEqual([]);
}

/** 출처: keys 마다 a[href=url] 하나 이상(새 탭·noreferrer)과 확인일 */
async function expectSources(shop: Locator, keys: KitSourceKey[], label: string) {
  for (const key of keys) {
    const s = KIT_SOURCES[key];
    const links = shop.locator(`a[href="${s.url}"]`);
    await expect.soft(links, `${label}: 출처 ${key} 링크`).not.toHaveCount(0);
    for (const a of await links.all()) {
      await expect.soft(a, `${label}: 출처 ${key} 새 탭`).toHaveAttribute("target", "_blank");
      await expect.soft(a, `${label}: 출처 ${key} rel`).toHaveAttribute("rel", NOREFERRER);
    }
    await expect.soft(shop, `${label}: 출처 ${key} 확인일`).toContainText(s.checkedAt);
  }
}

/** 장보기 영역 안 링크 중 maff.go.jp·safekorea.go.kr(하위 도메인 포함)이 아닌 것의 주소 */
const foreignLinks = (shop: Locator) => shop.locator("a[href]").evaluateAll((links, domains) => links
  .map((a) => (a as HTMLAnchorElement).href)
  .filter((href) => {
    const host = new URL(href).hostname;
    return !domains.some((d) => host === d || host.endsWith(`.${d}`));
  }), LINK_DOMAINS);

// 내용 단언은 expect.soft 라 한 번 실행으로 어긋난 조건을 모두 보여 준다(요소가 있는지 같은 전제만 바로 멈춤)
test.describe.configure({ timeout: TEST_TIMEOUT_MS });

test("장보기 목록(4명·7일 비축): #calc 안 h3 아래 shoppingList(4, stock7) 줄 모두, 목록 아래 조리용 물·주식 안내, 근거·출처 maff, 결과 live 영역과 따로", async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  const calc = calcOf(page);
  await setInput(calc, FOUR_WEEK);
  const shop = await shopIn(calc, "4명·7일");
  const lines = stockTexts(FOUR_WEEK);
  for (const t of new Set([...lines, ...FOUR_WEEK_TEXTS])) {
    await expect.soft(shop.getByText(t).first(), `줄 "${t}"`).toBeVisible();
  }
  await expect.soft(shop.getByText(COOKING_NOTE).first(), "조리용 물 안내").toBeVisible();
  await expect.soft(shop.getByText(STAPLE_NOTE).first(), "주식 안내").toBeVisible();
  // 제목 → 목록 줄 → 조리용 물 안내(보이는 글자 순서)
  await expectOrder(shop, [["장보기 목록"], lines, [COOKING_NOTE]], "4명·7일");
  for (const t of BASIS) await expect.soft(shop, `근거 "${t}"`).toContainText(t, { useInnerText: true });
  await expectSources(shop, ["maff"], "4명·7일");
  // 결과 live 영역(aria-atomic, 입력마다 읽음)과 복사 안내 live 영역은 따로: 서로 품지 않는다
  await expect.soft(shop.locator(`xpath=ancestor-or-self::*[@aria-live="polite"]`), "장보기 영역이 결과 live 영역 안").toHaveCount(0);
  await expect.soft(statusOf(shop), "장보기 영역 안 aria-live=polite 하나(복사 안내. 결과 live 영역을 품지 않음)").toHaveCount(1);
  expect.soft(errors, "콘솔 오류").toEqual([]);
});

test("입력을 바꾸면 1초 안에 목록이 바뀜: 5명·7일 9팩(54병, 약 108kg)·부탄가스 30개, 4명·14일 14팩(84병, 약 168kg)·부탄가스 48개, 조리용 물·주식 안내 그대로", async ({ page }) => {
  await open(page);
  const calc = calcOf(page);
  await setInput(calc, FOUR_WEEK);
  const shop = await shopIn(calc, "4명·7일");
  await expectListFor(shop, FOUR_WEEK);
  let before = FOUR_WEEK_TEXTS[0];
  for (const { input, texts } of CHANGES) {
    const label = `${input.people}명·${input.period}`;
    await setInput(calc, input);
    for (const t of texts) {
      await expect.soft(shop.getByText(t).first(), `${label}: 1초 안에 "${t}"`).toBeVisible({ timeout: RESULT_TIMEOUT_MS });
    }
    await expect.soft(shop.getByText(before), `${label}: 앞 목록의 "${before}" 사라짐`).toHaveCount(0);
    await expect.soft(shop.getByText(COOKING_NOTE).first(), `${label}: 조리용 물 안내`).toBeVisible();
    await expect.soft(shop.getByText(STAPLE_NOTE).first(), `${label}: 주식 안내`).toBeVisible();
    before = texts[0];
  }
});

test("3일 가방·4명: 가방에 넣을 몫(500mL 4병·9끼·가방 4개)과 집에 둘 몫(3팩(18병, 약 36kg)·28L)이 따로, 2~3일분·7일 비축 안내, 가스레인지·품목 없음, 출처 mois-emergency·maff-carry", async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  const calc = calcOf(page);
  await setInput(calc, FOUR_BAG);
  const shop = await shopIn(calc, "3일 가방·4명");
  await expectListFor(shop, FOUR_BAG);
  await expectOrder(shop, [[BAG_SHARE], FOUR_BAG_TEXTS.bag, [HOME_SHARE], FOUR_BAG_TEXTS.home], "3일 가방·4명");
  // 보이는 글자(innerText)로 본다: 숨긴 요소에 남은 글자는 치지 않는다
  for (const t of BAG_NOTES) await expect.soft(shop, `안내 "${t}"`).toContainText(t, { useInnerText: true });
  for (const name of STOCK_NAMES) await expect.soft(shop, `3일 가방에 "${name}" 없음`).not.toContainText(name, { useInnerText: true });
  await expectSources(shop, ["mois-emergency", "maff-carry"], "3일 가방·4명");
  expect.soft(errors, "콘솔 오류").toEqual([]);
});

for (const c of [FOUR_WEEK, FOUR_BAG]) {
  const label = `${c.people}명·${c.period}`;
  test(`복사(${label}): "${COPY}"(아이콘 aria-hidden)를 누르면 writeText 글자 = shoppingText(${c.people}, "${c.id}") 한 번, 1초 안에 장보기 영역 aria-live 에 "${COPIED}"`, async ({ page }) => {
    const errors = trackErrors(page);
    await stubClipboard(page, "ok");
    await open(page);
    expect(await copiedTexts(page), "가짜 클립보드(addInitScript)").toEqual([]);
    const calc = calcOf(page);
    await setInput(calc, c);
    const shop = await shopIn(calc, label);
    await expectListFor(shop, c); // 바뀐 목록이 그려진 뒤 누른다
    const button = copyOf(shop);
    await expect(button, `"${COPY}" 버튼 하나`).toHaveCount(1);
    await expect.soft(button.locator("svg"), "아이콘 svg 하나").toHaveCount(1);
    await expect.soft(button.locator('svg[aria-hidden="true"]'), '아이콘 aria-hidden="true"').toHaveCount(1);
    const status = statusOf(shop);
    await expect(status, "누르기 전부터 장보기 영역 안 aria-live=polite 하나").toHaveCount(1);
    await expect.soft(status, "누르기 전 안내는 비어 있음").toHaveText("");
    await button.click();
    await expect.soft(status, `1초 안에 "${COPIED}"`).toContainText(COPIED, { timeout: RESULT_TIMEOUT_MS });
    await expect.soft(status, "안내가 보임").toBeVisible();
    await expect.soft.poll(() => copiedTexts(page), "writeText 가 받은 글자(한 번)").toEqual([shoppingText(c.people, c.id)]);
    expect.soft(errors, "콘솔 오류").toEqual([]);
  });
}

for (const mode of ["reject", "missing"] as const) {
  const what = mode === "reject" ? "writeText 가 거절(reject)" : "navigator.clipboard 없음";
  test(`복사 실패(${what}): 1초 안에 "${COPY_FAILED}", "${COPIED}" 없음, 콘솔 오류 0건`, async ({ page }) => {
    const errors = trackErrors(page);
    await stubClipboard(page, mode);
    await open(page);
    expect(await page.evaluate(() => typeof navigator.clipboard?.writeText), "가짜 클립보드(addInitScript)")
      .toBe(mode === "missing" ? "undefined" : "function");
    const calc = calcOf(page);
    await setInput(calc, FOUR_WEEK);
    const shop = await shopIn(calc, "4명·7일");
    await expectListFor(shop, FOUR_WEEK);
    await clickCopy(shop);
    const status = statusOf(shop);
    await expect.soft(status, `1초 안에 실패 안내`).toContainText(COPY_FAILED, { timeout: RESULT_TIMEOUT_MS });
    await expect.soft(status, "안내가 보임").toBeVisible();
    await expect.soft(status, `"${COPIED}" 없음`).not.toContainText(COPIED);
    if (mode === "reject") expect.soft(await copiedTexts(page), "거절되기 전에 넘긴 글자").toEqual([shoppingText(4, "stock7")]);
    expect.soft(errors, "콘솔 오류(잡지 않은 거절·없는 clipboard 호출 등)").toEqual([]);
  });
}

test("가구원 수 0·21·1.5·빈칸이면 장보기 제목·복사 버튼이 보이지 않고, 4명으로 고치면 다시 보임", async ({ page }) => {
  await open(page);
  const calc = calcOf(page);
  await setInput(calc, FOUR_WEEK);
  await shopIn(calc, "4명·7일");
  for (const value of INVALID_PEOPLE) {
    const label = value === "" ? "빈칸" : value;
    await peopleOf(calc).fill(value);
    await expect.soft(titleOf(calc), `${label}: 장보기 제목`).toHaveCount(0);
    await expect.soft(copyOf(calc), `${label}: 복사 버튼`).toHaveCount(0);
    await expect.soft(calc.getByText("6병 묶음").filter({ visible: true }), `${label}: 보이는 물 묶음 줄`).toHaveCount(0);
    await peopleOf(calc).fill(String(FOUR_WEEK.people));
    await expect.soft(titleOf(calc), `${label} 뒤 4명: 장보기 제목`).toBeVisible();
    await expect.soft(copyOf(calc), `${label} 뒤 4명: 복사 버튼`).toBeVisible();
  }
});

test("가격·링크: 4명·7일 비축과 3일 가방·4명의 보이는 장보기 글자·복사 글자에 숫자 뒤 원 0건, 장보기 영역 링크는 maff.go.jp·safekorea.go.kr 뿐", async ({ page }) => {
  await stubClipboard(page, "ok");
  await open(page);
  const calc = calcOf(page);
  const cases = [FOUR_WEEK, FOUR_BAG];
  for (const c of cases) {
    const label = `${c.people}명·${c.period}`;
    await setInput(calc, c);
    const shop = await shopIn(calc, label);
    await expectListFor(shop, c);
    await clickCopy(shop);
    expect.soft(await shownText(shop), `${label}: 보이는 글자의 가격`).not.toMatch(PRICE);
    await expect.soft(shop.locator("a[href]"), `${label}: 링크`).not.toHaveCount(0);
    expect.soft(await foreignLinks(shop), `${label}: 허용 도메인 밖 링크`).toEqual([]);
  }
  await expect.soft.poll(async () => (await copiedTexts(page))?.length, "복사한 횟수").toBe(cases.length);
  expect.soft(((await copiedTexts(page)) ?? []).filter((t) => PRICE.test(t)), "가격이 든 복사 글자").toEqual([]);
});

test("목록을 보고 복사하는 동안 네트워크 요청 0건(5명·7일 → 3일 가방, 복사 두 번)", async ({ page }) => {
  await stubClipboard(page, "ok");
  await open(page);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (!DEV_ONLY.test(r.url())) requests.push(`${r.method()} ${r.url()}`);
  });
  const calc = calcOf(page);
  for (const c of [FIVE_WEEK, FOUR_BAG]) {
    await setInput(calc, c);
    const shop = await shopIn(calc, `${c.people}명·${c.period}`);
    await expectListFor(shop, c);
    await clickCopy(shop);
    await expect(statusOf(shop), "복사 안내").toContainText(COPIED);
  }
  // 기다릴 사건이 없어(요청이 없어야 정상) 시간으로 기다린다
  await page.waitForTimeout(LATE_REQUEST_MS);
  expect(requests, "목록·복사 중 보낸 요청").toEqual([]);
});

for (const width of WIDTHS) {
  const wide = width >= MD;
  test(`${width}px: 20명·14일 비축(가장 긴 목록)·20명 3일 가방에서 가로 넘침 없음·콘솔 오류 0건, 복사 버튼 높이 44px 이상, 장보기가 결과 아래${wide ? "·입력 오른쪽" : ""}`, async ({ page }, info) => {
    const errors = trackErrors(page);
    await open(page, width);
    const calc = calcOf(page);
    for (const c of [MAX_TWO_WEEKS, MAX_BAG]) {
      const label = `${c.people}명·${c.period}`;
      await setInput(calc, c);
      const shop = await shopIn(calc, label);
      await expectListFor(shop, c);
      await settle(page);
      await expectNoOverflow(page, label);
      const button = copyOf(shop);
      await expect(button, `${label}: "${COPY}" 버튼 하나`).toHaveCount(1);
      expect.soft((await box(button)).height, `${label}: 복사 버튼 높이`).toBeGreaterThanOrEqual(TARGET_MIN_PX);
      const [result, area] = await Promise.all([resultOf(calc), shop].map(box));
      expect.soft(area.y, `${label}: 장보기가 결과 아래`).toBeGreaterThanOrEqual(result.bottom - TOLERANCE_PX);
      if (wide) {
        // 입력 묶음(가구원 수 −/+·숫자 칸, 기간 칩)의 오른쪽 끝보다 오른쪽 = 결과와 같은 오른쪽 열(plan.md 7-7)
        const inputs = await Promise.all([peopleOf(calc), calc.getByRole("button", { name: INC, exact: true }), periodsOf(calc)].map(box));
        expect.soft(area.x, `${label}: 장보기가 입력 오른쪽`).toBeGreaterThanOrEqual(Math.max(...inputs.map((b) => b.right)) - TOLERANCE_PX);
      }
    }
    await info.attach(`${width}px`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
    expect.soft(errors, "콘솔 오류(하이드레이션 포함)").toEqual([]);
  });
}
