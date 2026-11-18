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
// - 가방 영역: id="kit" 요소 하나
//   - 목록 둘: 제목 heading 이 정확히 "들고 나가는 3일 가방(1인 1개)"(GO_BAG_ITEMS)·"집에 두는 7일 비축"(STOCK_ITEMS).
//     목록 = 제목에서 체크박스를 품은 가장 가까운 조상이고, 상대 목록의 체크박스는 품지 않는다
//   - 항목: label 이 input[type=checkbox] 와 글자 span(item.text 그대로)을 직속 자식으로 감싼다(홈 ActionGuide 와 같은 꼴,
//     contrast.spec.ts 선택자 label:has(input[type="checkbox"]:checked) > span). 체크박스는 네이티브 그대로 보이고,
//     접근 이름은 item.text, 순서는 모델 순서
//   - 체크 저장: localStorage KIT_STORAGE_KEY 에 체크한 item.id 의 JSON 배열(checklist.ts readChecked·toggleChecked 형식).
//     CHECKLIST_STORAGE_KEY 는 건드리지 않는다. 저장값은 마운트 뒤에 읽는다(하이드레이션 불일치 없음)
//   - "이 브라우저에만 저장" 글자가 보인다
//   - 출처: 마지막 체크박스 뒤에 KIT_SOURCES 마다 a[href=url](target="_blank", rel 에 noreferrer), 이름(name)·확인일(checkedAt 그대로)
//   - 배치: md(768) 미만은 두 목록 위아래(3일 가방 위), md 이상은 2열(3일 가방 왼쪽)
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
/** 목록: 제목(heading)에서 체크박스를 품은 가장 가까운 조상 */
const listOf = (kit: Locator, title: string) =>
  kit.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::*[.//input[@type='checkbox']][1]");
const checkboxOf = (scope: Locator, text: string) => scope.getByRole("checkbox", { name: text, exact: true });
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

test("목차·가방 영역: 경보 뒤 비상 가방·물·식량 계산 링크, 두 목록(제목·모델 순서·글자·label 꼴), 저장 안내, 끝에 출처 새 탭·확인일", async ({ page }) => {
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
  for (const { title, items } of LISTS) {
    const list = listOf(kit, title);
    await expect(list, `목록 "${title}"`).toHaveCount(1);
    await expect.soft(list.getByRole("checkbox"), `${title}: 체크박스 수(상대 목록을 품지 않음)`).toHaveCount(items.length);
    await expect.soft(list.locator('label > input[type="checkbox"]'), `${title}: label 이 체크박스를 직접 감쌈`).toHaveCount(items.length);
    await expect.soft(list.locator("label > span"), `${title}: label 글자 span(모델 순서·글자)`).toHaveText(items.map((it) => it.text));
    for (const it of items) {
      await expect.soft(checkboxOf(list, it.text), `${it.id}: 접근 이름 = 항목 글자`).toHaveCount(1);
      await expect.soft(checkboxOf(list, it.text), `${it.id}: 처음엔 체크 안 됨`).not.toBeChecked();
    }
  }
  await expect.soft(kit.getByText(SAVE_NOTE).first(), "저장 안내").toBeVisible();

  for (const [key, s] of Object.entries(KIT_SOURCES)) {
    const links = kit.locator(`a[href="${s.url}"]`);
    await expect.soft(links, `출처 ${key} 링크`).not.toHaveCount(0);
    for (const a of await links.all()) {
      await expect.soft(a, `출처 ${key} 새 탭`).toHaveAttribute("target", "_blank");
      await expect.soft(a, `출처 ${key} rel`).toHaveAttribute("rel", NOREFERRER);
    }
    await expect.soft(kit, `출처 ${key} 이름`).toContainText(s.name, { useInnerText: true });
    await expect.soft(kit, `출처 ${key} 확인일`).toContainText(s.checkedAt);
  }
  // 영역 끝: 출처 링크는 모두 마지막 체크박스 뒤(문서 순서)
  const early = await kit.evaluate((el, urls) => {
    const boxes = el.querySelectorAll('input[type="checkbox"]');
    const last = boxes[boxes.length - 1];
    return urls.filter((u) => [...el.querySelectorAll(`a[href="${u}"]`)]
      .some((a) => !last || !(last.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING)));
  }, Object.values(KIT_SOURCES).map((s) => s.url));
  expect.soft(early, "마지막 체크박스보다 앞에 있는 출처 링크").toEqual([]);
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

test("체크 저장: 새로 고쳐도 남음, war-risk:kit:v1 을 지우면 모두 풀림, war-risk:checklist:v1 은 그대로", async ({ page }) => {
  await open(page);
  // 홈 체크리스트에 체크해 둔 상태에서 시작한다
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [CHECKLIST_STORAGE_KEY, CHECKLIST_SEED]);
  await page.reload({ waitUntil: "networkidle" });
  const kit = kitOf(page);
  const checked = kit.locator('input[type="checkbox"]:checked');
  await expect(checked, "처음에는 체크 없음").toHaveCount(0);

  const picked = [GO_BAG_ITEMS[0], STOCK_ITEMS[STOCK_ITEMS.length - 1]]; // 두 목록에서 하나씩
  for (const it of picked) await checkboxOf(kit, it.text).check();
  await expect.soft.poll(() => storedKitIds(page), `${KIT_STORAGE_KEY}: 체크한 id 의 JSON 배열`)
    .toEqual(picked.map((it) => it.id).sort());
  expect.soft(await storedValue(page, CHECKLIST_STORAGE_KEY), `체크 뒤 ${CHECKLIST_STORAGE_KEY} 그대로`).toBe(CHECKLIST_SEED);

  await page.reload({ waitUntil: "networkidle" });
  for (const it of picked) await expect(checkboxOf(kit, it.text), `새로 고친 뒤 ${it.id} 체크 남음`).toBeChecked();
  await expect.soft(checked, "새로 고친 뒤 체크 수").toHaveCount(picked.length);

  await page.evaluate((k) => localStorage.removeItem(k), KIT_STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });
  await expect(checked, `${KIT_STORAGE_KEY} 를 지우고 새로 고치면 모두 풀림`).toHaveCount(0);
  expect(await storedValue(page, CHECKLIST_STORAGE_KEY), `${CHECKLIST_STORAGE_KEY} 그대로`).toBe(CHECKLIST_SEED);
});

test("체크·계산하는 동안 네트워크 요청 0건", async ({ page }) => {
  await open(page);
  const requests: string[] = [];
  page.on("request", (r) => {
    if (!DEV_ONLY.test(r.url())) requests.push(`${r.method()} ${r.url()}`);
  });
  const kit = kitOf(page);
  for (const { title } of LISTS) await listOf(kit, title).getByRole("checkbox").first().check();
  await listOf(kit, LISTS[0].title).getByRole("checkbox").first().uncheck();
  const calc = calcOf(page);
  for (const c of [FOUR_WEEK, ONE_BAG]) {
    await calculate(calc, c);
    await expectResult(calc, c);
  }
  await peopleOf(calc).fill(INVALID_PEOPLE[0]);
  await expect(calc.getByText(INVALID).first()).toBeVisible();
  // 기다릴 사건이 없어(요청이 없어야 정상) 시간으로 기다린다
  await page.waitForTimeout(LATE_REQUEST_MS);
  expect(requests, "체크·계산 중 보낸 요청").toEqual([]);
});

test("키보드: Tab 으로 두 목록의 체크박스를 차례로 옮겨 다니며 Space 로 체크, 다시 Space 로 해제", async ({ page }) => {
  await open(page);
  const boxes = kitOf(page).getByRole("checkbox");
  const items = [...GO_BAG_ITEMS, ...STOCK_ITEMS];
  await expect(boxes, "체크박스 수 = 두 목록 항목 수").toHaveCount(items.length);
  await boxes.first().focus();
  for (const [i, it] of items.entries()) {
    const checkbox = boxes.nth(i);
    expect(await tabTo(page, checkbox), `Tab 으로 ${it.id}`).toBe(true);
    await page.keyboard.press("Space");
    await expect.soft(checkbox, `Space 로 ${it.id} 체크`).toBeChecked();
  }
  await expect.soft.poll(() => storedKitIds(page), "모두 체크한 뒤 저장값").toEqual(items.map((it) => it.id).sort());
  await page.keyboard.press("Space");
  await expect.soft(boxes.last(), "Space 로 다시 해제").not.toBeChecked();
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
  test(`${width}px: 체크·계산 상태에서 가로 넘침 없음·콘솔 오류 0건, 두 목록 ${wide ? "2열" : "위아래"}, 계산기 입력과 결과 ${wide ? "한 줄" : "위아래"}`, async ({ page }, info) => {
    const errors = trackErrors(page);
    await open(page, width);
    const kit = kitOf(page);
    const calc = calcOf(page);
    for (const { title } of LISTS) await listOf(kit, title).getByRole("checkbox").first().check();
    await settle(page);
    await expectNoOverflow(page, "체크");
    const [bag, stock] = await Promise.all(LISTS.map(({ title }) => box(listOf(kit, title))));
    if (wide) {
      expect.soft(sameLine(bag, stock), "두 목록이 한 줄(2열)").toBe(true);
      expect.soft(stock.x, "7일 비축이 3일 가방 오른쪽").toBeGreaterThanOrEqual(bag.right - TOLERANCE_PX);
    } else {
      expect.soft(stock.y, "7일 비축이 3일 가방 아래").toBeGreaterThanOrEqual(bag.bottom - TOLERANCE_PX);
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
