import { expect, test, type Locator, type Page } from "@playwright/test";
import { CIVIL_ALERTS } from "../src/entities/guide/model/alerts";
import { CHECKLIST_STORAGE_KEY, readChecked } from "../src/entities/guide/model/checklist";
import { GO_BAG_ITEMS, KIT_PERIODS, KIT_SOURCES, KIT_STORAGE_KEY, MAX_PEOPLE, STOCK_ITEMS } from "../src/entities/guide/model/kit";

// 이슈 #75(1-5) /emergency 비상 가방 체크리스트·물·식량 계산기와 홈 체크리스트 카드의 /emergency#kit 링크 실측. 기준 화면 폭(360·768·1080·1440)
// 목록·기간·저장 키·출처는 이슈 #73 모델(kit.ts)과 비교하고, 계산 결과는 인수 조건의 숫자를 그대로 쓴다.
// 페이지 골격(h1·목차·경보 카드·API 요청)은 #74 emergency.spec.ts, llms.txt "## 비상 대비" 절은 tests/test_m13_llms.py,
// 체크리스트·경보·가방 id 교차 확인은 src/entities/guide/model/guide-ids.test.ts. 명도 대비 상태는 #74 병합 뒤 contrast.spec.ts 에 더한다
//
// 화면 선택자 계약 (구현은 이 계약을 따른다. #74 emergency.spec.ts 계약 위에 더한다)
// - 목차(접근 이름 "목차"인 navigation): 경보 링크 5개 뒤에 href="#kit"(글자 "비상 가방")·href="#calc"(글자 "물·식량 계산") 링크가
//   이 순서로 하나씩. 누르면 주소에 #kit·#calc 가 붙고 그 영역이 화면 안
// - 가방 영역: id="kit" 요소 하나 (이슈 #105 에서 체크박스 목록 → 아이콘 타일로 바뀜)
//   - 목록 둘: 제목 heading 이 정확히 "들고 나가는 3일 가방(1인 1개)"(GO_BAG_ITEMS)·"집에 두는 7일 비축"(STOCK_ITEMS).
//     목록 = 제목에서 타일(button[aria-pressed])을 품은 가장 가까운 조상이고, 상대 목록의 타일은 품지 않는다
//   - 타일: 항목마다 button[aria-pressed] 하나, 모델 순서, 접근 이름 = item.text 그대로. #kit 안 체크박스(input·role=checkbox) 0개.
//     안에 svg[aria-hidden="true"] 항목 아이콘. 보이는 svg 는 안 담으면 1개, 담으면 체크 아이콘이 더해져 2개
//     (숨길 때는 그리지 않거나 display:none·visibility:hidden. opacity 0 은 보이는 것으로 친다)
//   - 진행: 목록 안에 글자 "{담은 수}/{전체} 챙김"과 진행 막대(progressbar 역할) 하나. 막대 값은 progress 의 value·max 또는
//     aria-valuenow·aria-valuemax 가 담은 수·전체이고, 접근 이름이 있다. 누르면 1초 안에 aria-pressed·글자·막대가 바뀐다
//   - 키보드: Tab 으로 타일에 모델 순서대로 닿고 Space·Enter 로 담고 뺀다. Tab 으로 오면 포커스 표시(outline 또는 box-shadow)가 생긴다
//   - 담기 저장: localStorage KIT_STORAGE_KEY 에 담은 item.id 의 JSON 배열(checklist.ts readChecked·toggleChecked 형식).
//     개편 전 저장값도 그대로 담긴 상태로 보인다. CHECKLIST_STORAGE_KEY 는 건드리지 않는다.
//     저장값은 하이드레이션 뒤에 반영한다(하이드레이션 불일치 없음)
//   - "이 브라우저에만 저장" 글자가 보인다
//   - 출처: 마지막 타일 뒤에 항목(sources)이 가리키는 KIT_SOURCES 마다 a[href=url](target="_blank", rel 에 noreferrer),
//     이름(name)·확인일(checkedAt 그대로). 항목이 가리키지 않는 바깥 링크(1-3 농림수산성 등)는 #kit 안에 없다
//   - 배치: 모든 폭에서 두 목록 위아래(3일 가방 위). 타일 높이 64px 이상, 목록 안 열 수 360 2열·768 3열·1080 4열·1440 4열
// - 계산기 영역: id="calc" 요소 하나
//   - 가구원 수: 접근 이름이 정확히 "가구원 수"인 input[type=number](spinbutton), min="1"·max="20"(MAX_PEOPLE)
//   - 기간: 공용 SegmentedControl. 접근 이름 "기간"인 radiogroup, radio 글자 = KIT_PERIODS label(순서 그대로)
//   - 결과: #calc 안 aria-live="polite" 요소 하나. 값을 넣기 전부터 DOM 에 있고(잘못된 값일 때도 남는다),
//     입력(가구원 수·기간)과 계산 기준 글자는 품지 않는다. 바른 값이면 그 안에 보이는 글자로
//     합계 "물 84L(약 84kg) · 식량 84끼"(공백·기호 그대로, 숫자 사이를 다른 요소로 나눠도 글자는 이대로), 1인당 "1인당"과 "물 21L · 21끼".
//     1인당 줄은 기간과 관계없이 "물 {L}L · {끼}끼" 꼴 그대로(무게를 넣지 않는다)
//   - "3일 가방"일 때만 #calc 안에 "가방은 한 사람에 하나" 안내와 1인당 물 무게 "약 9kg"(가구원이 4명이어도 1인분)이 보인다
//   - 잘못된 가구원 수(0·21·1.5·빈칸): #calc 안에 "1~20 사이 정수로 입력해 주세요"가 보이고, live 영역에 보이는 L·kg·끼 숫자가 없다.
//     바른 값으로 고치면 안내가 사라지고 결과가 다시 보인다
//   - 계산 기준 "1인 1일 물 3L·3끼" 글자와 출처 링크(KIT_SOURCES 중 하나 이상의 url, target="_blank", rel 에 noreferrer)
//   - 배치: md 미만은 입력 아래에 결과, md 이상은 입력과 결과가 한 줄(세로 범위가 겹치고 결과가 입력 오른쪽)
// - 체크·계산은 브라우저 안에서만 한다: 그동안 네트워크 요청 0건(지연 로딩 청크 포함)
// - 홈 체크리스트 카드(ActionGuide: "단계별 가이드" 버튼에서 체크박스까지 품은 가장 가까운 조상) 안에 a[href="/emergency#kit"] 하나.
//   같은 탭에서 열리고, 누르면 가방 영역이 화면 안
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
const MD = 768;
const WIDE = 1440; // 폭과 무관한 동작은 한 폭에서만 본다
const TOLERANCE_PX = 1;
const TEST_TIMEOUT_MS = 60_000; // 홈 데이터 대기(최대 30초) 뒤 /emergency 로 이동하는 테스트가 있어 기본(30초)보다 길게
const DATA_TIMEOUT_MS = 30_000; // 홈 체크리스트 카드(점수 데이터가 들어와야 나옴)를 기다리는 시간
const NAV_TIMEOUT_MS = 30_000; // 링크를 눌러 /emergency 로 가기를 기다리는 시간(개발 서버 첫 컴파일 포함)
const RESULT_TIMEOUT_MS = 1_000; // 입력부터 결과가 보이기까지 한도(인수 조건 "1초 안에")
const LATE_REQUEST_MS = 1_000; // 체크·계산 뒤 늦게 나가는 요청(디바운스 저장 등)까지 기다리는 시간
const MAX_TABS = 10; // 다음 체크박스까지 누를 Tab 최대 수(사이에 다른 포커스 대상이 있어도 되게)

const PATH = "/emergency";
const KIT = "#kit"; // 영역 선택자이자 목차 href
const CALC = "#calc";
const TOC_NAME = "목차";
const KIT_TOC = "비상 가방";
const CALC_TOC = "물·식량 계산";
const LISTS = [
  { title: "들고 나가는 3일 가방(1인 1개)", items: GO_BAG_ITEMS },
  { title: "집에 두는 7일 비축", items: STOCK_ITEMS },
];
const TILE_COLUMNS: Record<number, number> = { 360: 2, 768: 3, 1080: 4, 1440: 4 }; // 폭별 목록 안 타일 열 수(plan.md 7-7)
const TILE_MIN_HEIGHT = 64; // 타일 높이 하한(plan.md 7-8)
const LEGACY_KIT = '["bag-medicine","stock-water"]'; // 개편 전 체크박스로 저장해 둔 값(인수 조건). 두 목록에서 하나씩
const TRANSPARENT = /^transparent$|^rgba\([^)]*,\s*0\)$|\/\s*0\)$/; // 계산된 색이 완전 투명(footer.spec.ts 와 같음)
const SAVE_NOTE = "이 브라우저에만 저장";
const PEOPLE = "가구원 수";
const PERIOD = "기간";
const BASIS = "1인 1일 물 3L·3끼";
const EACH = "1인당";
const BAG_NOTE = "가방은 한 사람에 하나";
const BAG_WEIGHT = "약 9kg"; // 3일 가방 1인분 물 9L ≈ 9kg
const INVALID = "1~20 사이 정수로 입력해 주세요";
const INVALID_PEOPLE = ["0", "21", "1.5", ""]; // 인수 조건: 0, 21, 1.5, 빈칸
const RESULT_NUMBER = /\d\s*(?:L|kg|끼)/; // 물 L·무게 kg·끼니 결과 숫자
const NOREFERRER = /(^|\s)noreferrer(\s|$)/;
const HOME_LINK = "/emergency#kit";
const GUIDE_BUTTON = "단계별 가이드"; // 홈 체크리스트 카드 안 버튼
const CHECKLIST_SEED = '["supplies-3days"]'; // 홈 체크리스트에서 체크해 둔 값(가방 체크와 상관없이 그대로 남아야 함)
// 개발 서버 도구(오류 오버레이·devtools 의 /__nextjs_*)와 HMR 요청은 운영에 없어 세지 않는다
const DEV_ONLY = /\/(?:__nextjs|_next\/webpack-hmr)/;

// 가구원 수·기간 → live 영역의 합계·1인당 글자
type Case = { people: string; period: string; total: string; each: string };
const FOUR_WEEK: Case = { people: "4", period: "7일 비축", total: "물 84L(약 84kg) · 식량 84끼", each: "물 21L · 21끼" }; // 인수 조건
const ONE_BAG: Case = { people: "1", period: "3일 가방", total: "물 9L(약 9kg) · 식량 9끼", each: "물 9L · 9끼" }; // 인수 조건
const FOUR_BAG: Case = { people: "4", period: "3일 가방", total: "물 36L(약 36kg) · 식량 36끼", each: "물 9L · 9끼" }; // 합계와 1인분 무게가 다름
// 폭별 배치 확인용: 가장 긴 결과, 가방 안내가 붙는 결과
const MAX_TWO_WEEKS: Case = { people: String(MAX_PEOPLE), period: "14일 비축", total: "물 840L(약 840kg) · 식량 840끼", each: "물 42L · 42끼" };
const MAX_BAG: Case = { people: String(MAX_PEOPLE), period: "3일 가방", total: "물 180L(약 180kg) · 식량 180끼", each: "물 9L · 9끼" };

type Box = { x: number; y: number; width: number; height: number; bottom: number; right: number };

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  expect(b, "요소가 화면에 없음").not.toBeNull();
  return { ...b!, bottom: b!.y + b!.height, right: b!.x + b!.width };
}

// 같은 줄: 세로 범위가 겹친다
const sameLine = (a: Box, b: Box) => a.y < b.bottom && b.y < a.bottom;

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

/** /emergency 를 연다. 하이드레이션 끝을 알리는 요소가 없어 네트워크가 잠잠해질 때까지 기다린다(#74 와 같음).
 *  그 전에 넣은 값·체크는 React 가 받지 못한다 */
async function open(page: Page, width = WIDE) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto(PATH, { waitUntil: "networkidle" });
}

const storedValue = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);
/** KIT_STORAGE_KEY 저장값을 readChecked 로 읽은 id(정렬). 저장이 effect 에서 늦게 일어나도 되게 poll 로 쓴다 */
const storedKitIds = async (page: Page) => readChecked(await storedValue(page, KIT_STORAGE_KEY)).sort();

/** Tab 을 눌러 target(문서에서 지금 포커스보다 뒤)에 포커스가 갈 때까지. 닿으면 true */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < MAX_TABS; i++) {
    if (await target.evaluate((t) => t === document.activeElement)) return true;
    await page.keyboard.press("Tab");
  }
  return target.evaluate((t) => t === document.activeElement);
}

const kitOf = (page: Page) => page.locator(KIT);
const calcOf = (page: Page) => page.locator(CALC);
/** 목록: 제목(heading)에서 타일(button[aria-pressed])을 품은 가장 가까운 조상 */
const listOf = (kit: Locator, title: string) =>
  kit.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::*[.//button[@aria-pressed]][1]");
const tilesOf = (scope: Locator) => scope.locator("button[aria-pressed]");
const tileOf = (scope: Locator, text: string) => scope.getByRole("button", { name: text, exact: true });
/** 타일 안 보이는 svg: 항목 아이콘, 담으면 체크 아이콘까지 */
const shownSvgs = (tile: Locator) => tile.locator("svg").filter({ visible: true });
/** 진행 막대 값: progress 는 value·max, role="progressbar" 는 aria-valuenow·aria-valuemax */
const barValue = (bar: Locator) => bar.evaluate((el) => el instanceof HTMLProgressElement
  ? { now: el.value, max: el.max }
  : { now: Number(el.getAttribute("aria-valuenow")), max: Number(el.getAttribute("aria-valuemax")) });
/** 포커스 표시 재료: 보이는 outline 인지, box-shadow(Tailwind ring)가 있는지, 둘의 계산값 */
const focusLook = (l: Locator) => l.evaluate((el, transparent) => {
  const s = getComputedStyle(el);
  return {
    outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 && !new RegExp(transparent).test(s.outlineColor),
    ring: s.boxShadow !== "none",
    key: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.boxShadow}`,
  };
}, TRANSPARENT.source);

/** 타일을 누르고 aria-pressed 가 pressed 가 되기를 1초까지 기다린다(체크박스 check()·uncheck() 처럼 전제로 쓴다). 타일이 없으면 바로 멈춘다 */
async function toggleTile(tile: Locator, pressed: boolean, label: string) {
  await expect(tile, `${label} 타일`).toHaveCount(1);
  await tile.click();
  await expect(tile, `${label} aria-pressed="${pressed}"`).toHaveAttribute("aria-pressed", String(pressed), { timeout: RESULT_TIMEOUT_MS });
}

/** 목록 진행: 진행 막대 하나, 글자 "{done}/{total} 챙김", 막대 값 done·최댓값 total. timeout 을 주면 그 시간 안에 */
async function expectProgress(list: Locator, done: number, total: number, label: string, timeout?: number) {
  const bar = list.getByRole("progressbar");
  await expect(bar, `${label}: 진행 막대 하나`).toHaveCount(1);
  await expect.soft(list, `${label}: 진행 글자`).toContainText(`${done}/${total} 챙김`, { timeout });
  await expect.soft.poll(() => barValue(bar), { message: `${label}: 진행 막대 값·최댓값`, timeout }).toEqual({ now: done, max: total });
}

const peopleOf = (calc: Locator) => calc.getByRole("spinbutton", { name: PEOPLE, exact: true });
const periodsOf = (calc: Locator) => calc.getByRole("radiogroup", { name: PERIOD, exact: true });
const liveOf = (calc: Locator) => calc.locator('[aria-live="polite"]');

/** 기간을 고르고 가구원 수를 넣는다(가구원 수가 마지막 입력) */
async function calculate(calc: Locator, c: Pick<Case, "people" | "period">) {
  await periodsOf(calc).getByRole("radio", { name: c.period, exact: true }).click();
  await peopleOf(calc).fill(c.people);
}

/** live 영역 안에 합계·1인당 글자가 보인다. timeout 을 주면 입력부터 그 시간 안에 */
async function expectResult(calc: Locator, c: Case, timeout?: number) {
  const live = liveOf(calc);
  const label = `${c.people}명·${c.period}`;
  await expect(live.getByText(c.total).first(), `${label} 합계`).toBeVisible({ timeout });
  await expect.soft(live.getByText(c.each).first(), `${label} 1인당 값`).toBeVisible({ timeout });
  await expect.soft(live.getByText(EACH).first(), `${label} "${EACH}" 표시`).toBeVisible({ timeout });
}

// 내용 단언은 expect.soft 라 한 번 실행으로 어긋난 조건을 모두 보여 준다(요소가 있는지 같은 전제만 바로 멈춤)
test.describe.configure({ timeout: TEST_TIMEOUT_MS });

test("목차·가방 영역: 경보 뒤 비상 가방·물·식량 계산 링크, 두 목록(제목·타일 모델 순서·접근 이름·아이콘, 체크박스 없음), 저장 안내, 끝에 항목 출처만 새 탭·확인일", async ({ page }) => {
  await open(page);
  const toc = page.getByRole("navigation", { name: TOC_NAME, exact: true });
  await expect(toc, "목차").toBeVisible();
  const hrefs: string[] = [];
  for (const link of await toc.getByRole("link").all()) hrefs.push((await link.getAttribute("href")) ?? "");
  const order = [...CIVIL_ALERTS.map((a) => `#${a.id}`), KIT, CALC];
  expect.soft(hrefs.filter((h) => order.includes(h)), "목차 순서: 경보 5개 → 비상 가방 → 물·식량 계산(하나씩)").toEqual(order);
  await expect.soft(toc.locator(`a[href="${KIT}"]`), "목차 비상 가방 글자").toHaveText(KIT_TOC);
  await expect.soft(toc.locator(`a[href="${CALC}"]`), "목차 물·식량 계산 글자").toHaveText(CALC_TOC);
  for (const [name, target] of [[KIT_TOC, KIT], [CALC_TOC, CALC]]) {
    await toc.getByRole("link", { name, exact: true }).click();
    await expect.soft(page, `${name} 주소`).toHaveURL(new RegExp(`${target}$`));
    await expect.soft(page.locator(target), `${name} 영역이 화면 안`).toBeInViewport();
  }

  const kit = kitOf(page);
  await expect(kit, "가방 영역(id=kit) 하나").toHaveCount(1);
  await expect.soft(kit.locator('input[type="checkbox"], [role="checkbox"]'), "#kit 안 체크박스").toHaveCount(0);
  for (const { title, items } of LISTS) {
    const list = listOf(kit, title);
    await expect(list, `목록 "${title}"`).toHaveCount(1);
    const tiles = tilesOf(list);
    await expect(tiles, `${title}: 타일 수(상대 목록을 품지 않음)`).toHaveCount(items.length);
    for (const [i, it] of items.entries()) {
      const tile = tiles.nth(i);
      await expect.soft(tile, `${it.id}: ${i + 1}번째 타일 접근 이름 = 항목 글자(모델 순서)`).toHaveAccessibleName(it.text);
      await expect.soft(tile, `${it.id}: 처음엔 안 담김`).toHaveAttribute("aria-pressed", "false");
      await expect.soft(tile.locator('svg[aria-hidden="true"]'), `${it.id}: aria-hidden 아이콘`).not.toHaveCount(0);
      await expect.soft(shownSvgs(tile), `${it.id}: 안 담은 타일은 보이는 svg 1개(체크 아이콘 없음)`).toHaveCount(1);
    }
  }
  await expect.soft(kit.getByText(SAVE_NOTE).first(), "저장 안내").toBeVisible();

  // 출처: 항목(sources)이 가리키는 것만
  const keys = [...new Set(LISTS.flatMap(({ items }) => items.flatMap((it) => it.sources)))];
  for (const key of keys) {
    const s = KIT_SOURCES[key];
    const links = kit.locator(`a[href="${s.url}"]`);
    await expect.soft(links, `출처 ${key} 링크`).not.toHaveCount(0);
    for (const a of await links.all()) {
      await expect.soft(a, `출처 ${key} 새 탭`).toHaveAttribute("target", "_blank");
      await expect.soft(a, `출처 ${key} rel`).toHaveAttribute("rel", NOREFERRER);
    }
    await expect.soft(kit, `출처 ${key} 이름`).toContainText(s.name, { useInnerText: true });
    await expect.soft(kit, `출처 ${key} 확인일`).toContainText(s.checkedAt);
  }
  const urls = keys.map((k) => KIT_SOURCES[k].url);
  // 영역 끝: 출처 링크는 모두 마지막 타일 뒤(문서 순서)
  const early = await kit.evaluate((el, urls) => {
    const tiles = el.querySelectorAll("button[aria-pressed]");
    const last = tiles[tiles.length - 1];
    return urls.filter((u) => [...el.querySelectorAll(`a[href="${u}"]`)]
      .some((a) => !last || !(last.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING)));
  }, urls);
  expect.soft(early, "마지막 타일보다 앞에 있는 출처 링크").toEqual([]);
  // KIT_SOURCES 에 있어도 항목이 가리키지 않는 출처(1-3 장보기 환산 근거)는 여기 두지 않는다
  const others = await kit.evaluate((el, urls) => [...el.querySelectorAll("a[href]")]
    .map((a) => a.getAttribute("href") ?? "").filter((h) => /^https?:/.test(h) && !urls.includes(h)), urls);
  expect.soft(others, "항목이 가리키지 않는 바깥 링크(1-3 농림수산성 등)").toEqual([]);
});

test("타일 누르기: 1초 안에 aria-pressed=true·진행 1/7(1/8) 챙김·막대 값 1, 체크 아이콘이 보임, 다시 누르면 false·0", async ({ page }) => {
  await open(page);
  const kit = kitOf(page);
  for (const { title, items } of LISTS) {
    const list = listOf(kit, title);
    await expect(list, `목록 "${title}"`).toHaveCount(1);
    const [tile, other] = [tilesOf(list).first(), tilesOf(list).nth(1)];
    await expectProgress(list, 0, items.length, `${title} 처음`);
    await expect.soft(list.getByRole("progressbar"), `${title}: 진행 막대 접근 이름`).toHaveAccessibleName(/\S/);

    await tile.click();
    await expect.soft(tile, `${title} 첫 타일 누름: aria-pressed`).toHaveAttribute("aria-pressed", "true", { timeout: RESULT_TIMEOUT_MS });
    await expectProgress(list, 1, items.length, `${title} 첫 타일 누름`, RESULT_TIMEOUT_MS);
    await expect.soft(shownSvgs(tile), `${title} 담은 타일: 항목 아이콘 + 체크 아이콘`).toHaveCount(2);
    await expect.soft(tile.locator('svg:not([aria-hidden="true"])'), `${title} 담은 타일: 체크 아이콘도 aria-hidden`).toHaveCount(0);
    await expect.soft(shownSvgs(other), `${title} 안 담은 이웃 타일: 체크 아이콘 없음`).toHaveCount(1);

    await tile.click();
    await expect.soft(tile, `${title} 다시 누름: aria-pressed`).toHaveAttribute("aria-pressed", "false", { timeout: RESULT_TIMEOUT_MS });
    await expectProgress(list, 0, items.length, `${title} 다시 누름`, RESULT_TIMEOUT_MS);
    await expect.soft(shownSvgs(tile), `${title} 뺀 타일: 체크 아이콘 사라짐`).toHaveCount(1);
  }
});

test(`기존 저장값 호환: ${KIT_STORAGE_KEY} 에 ${LEGACY_KIT} 가 있으면 두 타일 담김·진행 1/7·1/8 챙김, 하이드레이션 오류 없음`, async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KIT_STORAGE_KEY, LEGACY_KIT]);
  await page.reload({ waitUntil: "networkidle" });
  const saved = readChecked(LEGACY_KIT);
  const kit = kitOf(page);
  for (const { title, items } of LISTS) {
    const list = listOf(kit, title);
    await expect(list, `목록 "${title}"`).toHaveCount(1);
    for (const it of items) {
      const pressed = String(saved.includes(it.id));
      await expect.soft(tileOf(list, it.text), `${it.id}: aria-pressed="${pressed}"`).toHaveAttribute("aria-pressed", pressed);
    }
    await expectProgress(list, items.filter((it) => saved.includes(it.id)).length, items.length, title);
  }
  expect.soft(errors, "콘솔 오류(하이드레이션 포함)").toEqual([]);
});

test("계산기: 가구원 수(spinbutton, min 1·max 20)·기간 radiogroup(KIT_PERIODS)·aria-live=polite 결과 영역·계산 기준과 출처", async ({ page }) => {
  await open(page);
  const calc = calcOf(page);
  await expect(calc, "계산기 영역(id=calc) 하나").toHaveCount(1);
  const people = peopleOf(calc);
  await expect(people, `"${PEOPLE}" 입력`).toHaveCount(1);
  await expect.soft(people, "숫자 입력").toHaveAttribute("type", "number");
  await expect.soft(people, "최소 1").toHaveAttribute("min", "1");
  await expect.soft(people, `최대 ${MAX_PEOPLE}`).toHaveAttribute("max", String(MAX_PEOPLE));
  await expect.soft(periodsOf(calc).getByRole("radio"), "기간 선택지(순서·글자)").toHaveText(KIT_PERIODS.map((p) => p.label));

  const live = liveOf(calc);
  await expect(live, "값을 넣기 전부터 aria-live=polite 결과 영역 하나").toHaveCount(1);
  await expect.soft(live.getByRole("spinbutton"), "live 영역 안 가구원 수 입력").toHaveCount(0);
  await expect.soft(live.getByRole("radiogroup"), "live 영역 안 기간 선택").toHaveCount(0);
  await expect.soft(calc.getByText(BASIS).first(), "계산 기준").toBeVisible();
  await expect.soft(live, "계산 기준은 live 영역 밖").not.toContainText(BASIS);
  const sources = calc.locator(Object.values(KIT_SOURCES).map((s) => `a[href="${s.url}"]`).join(", "));
  await expect.soft(sources, "계산 기준 출처 링크").not.toHaveCount(0);
  for (const a of await sources.all()) {
    await expect.soft(a, "계산 기준 출처 새 탭").toHaveAttribute("target", "_blank");
    await expect.soft(a, "계산 기준 출처 rel").toHaveAttribute("rel", NOREFERRER);
  }
});

test("계산: 4명·7일 비축이면 1초 안에 aria-live 영역에 물 84L(약 84kg) · 식량 84끼, 1인당 물 21L · 21끼", async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  const calc = calcOf(page);
  await calculate(calc, FOUR_WEEK);
  await expectResult(calc, FOUR_WEEK, RESULT_TIMEOUT_MS);
  await expect.soft(calc.getByText(BAG_NOTE).filter({ visible: true }), "비축 기간에는 가방 안내 없음").toHaveCount(0);
  expect.soft(errors, "콘솔 오류").toEqual([]);
});

test("계산: 1명·3일 가방이면 물 9L(약 9kg) · 식량 9끼, 3일 가방이면 가방 안내·1인당 물 무게, 비축으로 바꾸면 안내 없음", async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  const calc = calcOf(page);
  await calculate(calc, ONE_BAG);
  await expectResult(calc, ONE_BAG);
  await expect.soft(calc.getByText(BAG_NOTE).first(), "1명·3일 가방: 가방 안내").toBeVisible();
  // 4명이면 합계 무게(약 36kg)와 1인분 무게(약 9kg)가 달라 1인당 물 무게를 따로 확인할 수 있다
  await calculate(calc, FOUR_BAG);
  await expectResult(calc, FOUR_BAG);
  await expect.soft(calc.getByText(BAG_NOTE).first(), "4명·3일 가방: 가방 안내").toBeVisible();
  await expect.soft(calc.getByText(BAG_WEIGHT).first(), `4명·3일 가방: 1인당 물 무게 "${BAG_WEIGHT}"`).toBeVisible();
  await calculate(calc, FOUR_WEEK);
  await expectResult(calc, FOUR_WEEK);
  await expect.soft(calc.getByText(BAG_NOTE).filter({ visible: true }), "7일 비축으로 바꾸면 가방 안내 없음").toHaveCount(0);
  expect.soft(errors, "콘솔 오류").toEqual([]);
});

test("계산: 가구원 수 0·21·1.5·빈칸이면 안내 문구, live 영역에 L·kg·끼 결과 없음, 바른 값으로 고치면 결과", async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  const calc = calcOf(page);
  const live = liveOf(calc);
  await calculate(calc, FOUR_WEEK);
  await expectResult(calc, FOUR_WEEK);
  for (const value of INVALID_PEOPLE) {
    const label = value === "" ? "빈칸" : value;
    await peopleOf(calc).fill(value);
    await expect.soft(calc.getByText(INVALID).first(), `${label}: 안내 문구`).toBeVisible();
    await expect.soft(live.getByText(RESULT_NUMBER).filter({ visible: true }), `${label}: live 영역에 보이는 L·kg·끼 결과`).toHaveCount(0);
    await expect.soft(live, `${label}: live 영역은 DOM 에 남음`).toHaveCount(1);
    await peopleOf(calc).fill(FOUR_WEEK.people);
    await expectResult(calc, FOUR_WEEK);
    await expect.soft(calc.getByText(INVALID).filter({ visible: true }), `${label} 뒤 바른 값: 안내 사라짐`).toHaveCount(0);
  }
  expect.soft(errors, "콘솔 오류(NaN 값 경고 등)").toEqual([]);
});

test("담기 저장: 새로 고쳐도 남음, war-risk:kit:v1 을 지우면 모두 풀림, war-risk:checklist:v1 은 그대로", async ({ page }) => {
  await open(page);
  // 홈 체크리스트에 체크해 둔 상태에서 시작한다
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [CHECKLIST_STORAGE_KEY, CHECKLIST_SEED]);
  await page.reload({ waitUntil: "networkidle" });
  const kit = kitOf(page);
  const pressed = kit.locator('button[aria-pressed="true"]');
  await expect(pressed, "처음에는 담은 타일 없음").toHaveCount(0);

  const picked = [GO_BAG_ITEMS[0], STOCK_ITEMS[STOCK_ITEMS.length - 1]]; // 두 목록에서 하나씩
  for (const it of picked) await toggleTile(tileOf(kit, it.text), true, it.id);
  await expect.soft.poll(() => storedKitIds(page), `${KIT_STORAGE_KEY}: 담은 id 의 JSON 배열`)
    .toEqual(picked.map((it) => it.id).sort());
  expect.soft(await storedValue(page, CHECKLIST_STORAGE_KEY), `담은 뒤 ${CHECKLIST_STORAGE_KEY} 그대로`).toBe(CHECKLIST_SEED);

  await page.reload({ waitUntil: "networkidle" });
  for (const it of picked) await expect(tileOf(kit, it.text), `새로 고친 뒤 ${it.id} 담김 남음`).toHaveAttribute("aria-pressed", "true");
  await expect.soft(pressed, "새로 고친 뒤 담은 수").toHaveCount(picked.length);

  await page.evaluate((k) => localStorage.removeItem(k), KIT_STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await expect(pressed, `${KIT_STORAGE_KEY} 를 지우고 새로 고치면 모두 풀림`).toHaveCount(0);
  expect(await storedValue(page, CHECKLIST_STORAGE_KEY), `${CHECKLIST_STORAGE_KEY} 그대로`).toBe(CHECKLIST_SEED);
});

test("담기·계산하는 동안 네트워크 요청 0건", async ({ page }) => {
  await open(page);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (!DEV_ONLY.test(r.url())) requests.push(`${r.method()} ${r.url()}`);
  });
  const kit = kitOf(page);
  for (const { title } of LISTS) await toggleTile(tilesOf(listOf(kit, title)).first(), true, `${title} 첫`);
  await toggleTile(tilesOf(listOf(kit, LISTS[0].title)).first(), false, `${LISTS[0].title} 첫`);
  const calc = calcOf(page);
  for (const c of [FOUR_WEEK, ONE_BAG]) {
    await calculate(calc, c);
    await expectResult(calc, c);
  }
  await peopleOf(calc).fill(INVALID_PEOPLE[0]);
  await expect(calc.getByText(INVALID).first()).toBeVisible();
  // 기다릴 사건이 없어(요청이 없어야 정상) 시간으로 기다린다
  await page.waitForTimeout(LATE_REQUEST_MS);
  expect(requests, "담기·계산 중 보낸 요청").toEqual([]);
});

test("키보드: Tab 으로 두 목록의 타일을 모델 순서로 옮겨 다니며 포커스 표시, Space 로 담기, Enter·Space 로 빼고 담기", async ({ page }) => {
  await open(page);
  const tiles = tilesOf(kitOf(page));
  const items = [...GO_BAG_ITEMS, ...STOCK_ITEMS];
  await expect(tiles, "타일 수 = 두 목록 항목 수").toHaveCount(items.length);
  await tiles.first().focus();
  const unmarked: string[] = [];
  for (const [i, it] of items.entries()) {
    const tile = tiles.nth(i);
    const before = await focusLook(tile);
    expect(await tabTo(page, tile), `Tab 으로 ${it.id}`).toBe(true);
    const after = await focusLook(tile);
    // 첫 타일은 focus() 로 옮겼으므로 Tab 으로 온 타일만 본다. 포커스 전과 달라지고 outline 이나 box-shadow 가 보여야 한다
    if (i > 0 && !(after.key !== before.key && (after.outline || after.ring))) unmarked.push(it.id);
    await page.keyboard.press("Space");
    await expect.soft(tile, `Space 로 ${it.id} 담기`).toHaveAttribute("aria-pressed", "true");
  }
  expect.soft(unmarked, "Tab 으로 왔는데 포커스 표시(outline 또는 box-shadow)가 생기지 않은 타일").toEqual([]);
  await expect.soft.poll(() => storedKitIds(page), "모두 담은 뒤 저장값").toEqual(items.map((it) => it.id).sort());
  for (const [key, pressed] of [["Enter", "false"], ["Enter", "true"], ["Space", "false"]]) {
    await page.keyboard.press(key);
    await expect.soft(tiles.last(), `마지막 타일에서 ${key} → aria-pressed="${pressed}"`).toHaveAttribute("aria-pressed", pressed);
  }
});

test("홈 체크리스트 카드(ActionGuide)에 /emergency#kit 링크 하나, 누르면 같은 탭에서 가방 영역", async ({ page }) => {
  await page.setViewportSize({ width: WIDE, height: HEIGHT });
  await page.goto("/");
  const more = page.getByRole("button", { name: GUIDE_BUTTON, exact: true });
  await expect(more, "홈 체크리스트 카드(점수 데이터가 들어와야 나옴)").toBeVisible({ timeout: DATA_TIMEOUT_MS });
  const card = more.locator("xpath=ancestor::*[.//input[@type='checkbox']][1]");
  const link = card.locator(`a[href="${HOME_LINK}"]`);
  await expect(link, `체크리스트 카드 안 ${HOME_LINK} 링크`).toHaveCount(1);
  await expect.soft(link, "링크 접근 이름").toHaveAccessibleName(/\S/);
  await link.click();
  await expect(page, `같은 탭에서 ${HOME_LINK}`).toHaveURL(new RegExp(`${HOME_LINK}$`), { timeout: NAV_TIMEOUT_MS });
  await expect(kitOf(page), "가방 영역이 화면 안").toBeInViewport({ timeout: NAV_TIMEOUT_MS });
});

for (const width of WIDTHS) {
  const wide = width >= MD;
  test(`${width}px: 담기·계산 상태에서 가로 넘침 없음·콘솔 오류 0건, 두 목록 위아래·타일 ${TILE_COLUMNS[width]}열·높이 ${TILE_MIN_HEIGHT}px 이상, 계산기 입력과 결과 ${wide ? "한 줄" : "위아래"}`, async ({ page }, info) => {
    const errors = trackErrors(page);
    await open(page, width);
    const kit = kitOf(page);
    const calc = calcOf(page);
    for (const { title } of LISTS) await toggleTile(tilesOf(listOf(kit, title)).first(), true, `${title} 첫`);
    await settle(page);
    await expectNoOverflow(page, "담기");
    const [bag, stock] = await Promise.all(LISTS.map(({ title }) => box(listOf(kit, title))));
    expect.soft(stock.y, "7일 비축이 3일 가방 아래").toBeGreaterThanOrEqual(bag.bottom - TOLERANCE_PX);
    for (const { title } of LISTS) {
      const tiles = await Promise.all((await tilesOf(listOf(kit, title)).all()).map(box));
      // 열 수 = 첫 타일과 같은 줄(세로 범위가 겹침)에 놓인 타일 수
      expect.soft(tiles.filter((t) => sameLine(t, tiles[0])).length, `${title}: 타일 열 수`).toBe(TILE_COLUMNS[width]);
      expect.soft(tiles.map((t) => t.height).filter((h) => h < TILE_MIN_HEIGHT), `${title}: 높이 ${TILE_MIN_HEIGHT}px 미만 타일`).toEqual([]);
    }

    for (const c of [MAX_TWO_WEEKS, MAX_BAG]) {
      const label = `${c.people}명·${c.period}`;
      await calculate(calc, c);
      await expectResult(calc, c);
      await settle(page);
      await expectNoOverflow(page, label);
      const [people, periods, result] = await Promise.all([peopleOf(calc), periodsOf(calc), liveOf(calc)].map(box));
      // 입력 묶음(가구원 수·기간)의 범위. 둘을 위아래로 두든 옆으로 두든 된다
      const inputs = {
        top: Math.min(people.y, periods.y),
        bottom: Math.max(people.bottom, periods.bottom),
        right: Math.max(people.right, periods.right),
      };
      if (wide) {
        expect.soft(result.y < inputs.bottom && inputs.top < result.bottom, `${label}: 입력과 결과 한 줄`).toBe(true);
        expect.soft(result.x, `${label}: 결과가 입력 오른쪽`).toBeGreaterThanOrEqual(inputs.right - TOLERANCE_PX);
      } else {
        expect.soft(result.y, `${label}: 결과가 입력 아래`).toBeGreaterThanOrEqual(inputs.bottom - TOLERANCE_PX);
      }
    }
    await info.attach(`${width}px`, { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

    await peopleOf(calc).fill("");
    await expect(calc.getByText(INVALID).first(), "빈칸 안내").toBeVisible();
    await settle(page);
    await expectNoOverflow(page, "빈칸 안내");
    expect.soft(errors, "콘솔 오류(하이드레이션 포함)").toEqual([]);
  });
}
