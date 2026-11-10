import { expect, test, type Locator, type Page } from "@playwright/test";
import world from "world-atlas/countries-50m.json";

// 이슈 #22(2-2) 본문 영역 반응형 실측. 기준 화면 폭(360·768·1080·1440)
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
const MD = 768;
const LG = 1080;
const XL = 1440;
const SAME_LINE_PX = 8; // 한 줄로 보는 top 차이
const TOLERANCE_PX = 1;
const TEST_TIMEOUT_MS = 90_000; // 대상 셋을 차례로 고르는 테스트가 있어 기본(30초)보다 길게
const DATA_TIMEOUT_MS = 30_000; // 데이터가 들어와 위젯이 그려지기를 기다리는 시간
// 폭 단계별 기대값: [기본, md, lg, xl]
const NEWS_LIST_MAX_H = [480, 560, 720, 720]; // 뉴스 목록 최대 높이(px)
const RIGHT_COL_W = [0, 0, 360, 400]; // 패널 그리드 오른쪽(뉴스) 열 폭(px), lg 미만은 1열
const CHECK_COLS_BESIDE = [1, 2, 1, 1]; // 체크리스트 항목 열 수(대피소·재외공관과 함께일 때)
const CHECK_COLS_ALONE = [1, 2, 2, 2]; // 체크리스트 항목 열 수(혼자 전체 폭일 때)
const EMBASSY_COLS = [1, 2, 1, 1]; // 공관 목록 열 수
const SEOUL = { latitude: 37.5665, longitude: 126.978 }; // 위치로 대피소 찾기용 좌표(서울시청)

const MAP_NAME = "국가별 전쟁 가능성 지수 세계 지도";
const CHART_NAME = "전쟁 가능성 지수 추이";
const HISTORY = "지수 추이";
const NEWS = "국방 뉴스";
const THREATS = "⚡ 위협·경고 사건";
const PAST = "과거 위기 때 점수";
const ADVISORY_LABEL = "여행경보";
const ADVISORY_LEVEL = /\d+\/\d+단계/; // 기관별 경보 항목의 "3/4단계"
// 일본 여행경보 기관(지금 데이터에 셋 다 있음). 외교부가 맨 앞
const AGENCIES = ["외교부", "미 국무부", "영국 FCDO"];

// numeric: 지도에서 고를 나라의 ISO 숫자 코드. 없으면 국가 쌍 탭으로 고름
type Target = { title: string; numeric?: string };
const KOREA: Target = { title: "대한민국", numeric: "410" }; // 첫 화면 기본 선택 → 대피소
const JAPAN: Target = { title: "일본", numeric: "392" }; // 해외 나라 → 재외공관
const PAIR: Target = { title: "러시아 · 우크라이나" }; // 한국이 없는 국가 쌍 → 대피소·재외공관 없음
const TARGETS = [KOREA, JAPAN, PAIR];

// 지도 나라 면은 world-atlas 도형 순서대로 그려진다(WorldMap SHAPES)
const SHAPE_IDS = (world.objects.countries.geometries as { id?: string }[]).map((g) => g.id);

type Box = { x: number; y: number; width: number; height: number; bottom: number; right: number };

const step = (w: number) => (w >= XL ? 3 : w >= LG ? 2 : w >= MD ? 1 : 0);
// 같은 줄: 세로 범위가 겹친다
const sameLine = (a: Box, b: Box) => a.y < b.bottom && b.y < a.bottom;

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  expect(b, "요소가 화면에 없음").not.toBeNull();
  return { ...b!, bottom: b!.y + b!.height, right: b!.x + b!.width };
}

/** 자식 요소들의 서로 다른 left 위치 개수 = 열 수 */
async function columns(items: Locator): Promise<number> {
  const lefts = await items.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  return new Set(lefts).size;
}

/** 글자 줄 수 = 글자 rect 의 서로 다른 top 개수(같은 줄인데 rect 가 여러 개 나오는 브라우저가 있음) */
const lines = (l: Locator) => l.evaluate((el) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
});

/** main padding 안쪽 가로 범위 = 본문 전체 폭 */
const content = (page: Page) => page.locator("main").evaluate((m) => {
  const r = m.getBoundingClientRect();
  const s = getComputedStyle(m);
  return { x: r.left + parseFloat(s.paddingLeft), right: r.right - parseFloat(s.paddingRight) };
});

/** 가장 가까운 그리드 조상(패널 그리드)의 행 간격(px) */
const gridRowGap = (l: Locator) => l.evaluate((el) => {
  for (let g = el.parentElement; g; g = g.parentElement) {
    const s = getComputedStyle(g);
    if (s.display === "grid") return parseFloat(s.rowGap);
  }
  return null;
});

/** 등장 애니메이션(fade-up 등 유한 반복)이 끝날 때까지 기다린다. 무한 반복(ping·blink)은 제외 */
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations()
  .filter((a) => a.effect?.getTiming().iterations !== Infinity)
  .map((a) => a.finished.catch(() => null))));

/** 카드 마지막 자식 아래 남는 빈 높이(px). 0 이면 카드가 내용 높이만큼만 차지(옆 카드 높이로 늘어나 속이 비지 않음) */
const emptyBelow = (l: Locator) => l.evaluate((el) => {
  const last = el.lastElementChild;
  if (!last) return 0;
  const s = getComputedStyle(el);
  const gap = el.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
  return gap - parseFloat(getComputedStyle(last).marginBottom) - parseFloat(s.paddingBottom) - parseFloat(s.borderBottomWidth);
});

const heading = (page: Page, t: Target) => page.getByRole("heading", { level: 2, name: t.title, exact: true });
/** 요약 영역: 대상 이름(h2)을 품은 가장 바깥 section */
const summaryOf = (page: Page, t: Target) => page.locator("section", { has: heading(page, t) }).first();
/** 패널·카드: 제목(heading)에서 가장 가까운 section.
 *  getByRole("region") 아래 요소에 evaluateAll 을 쓰면 Firefox 페이지가 죽어서(Playwright 1.65) 제목으로 찾는다 */
const panel = (page: Page, title: string) =>
  page.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::section[1]");
/** 체크리스트 카드: "단계별 가이드" 버튼에서 체크박스까지 품은 가장 가까운 조상 */
const checklistOf = (s: Locator) =>
  s.getByRole("button", { name: "단계별 가이드", exact: true }).locator("xpath=ancestor::*[.//input[@type='checkbox']][1]");
/** 재외공관 카드: "현지 긴급 연락처" 제목에서 전화 링크까지 품은 가장 가까운 조상 */
const embassyOf = (s: Locator) =>
  s.getByText("현지 긴급 연락처", { exact: true }).locator("xpath=ancestor::*[.//a[starts-with(@href,'tel:')]][1]");
const sheltersOf = (page: Page) => panel(page, "내 주변 대피소");

async function select(page: Page, t: Target) {
  if (t.numeric) {
    const land = page.getByRole("img", { name: MAP_NAME }).locator(":scope > g > g").nth(SHAPE_IDS.indexOf(t.numeric));
    // 작은 화면에서도 나라 면 크기와 무관하게 클릭 이벤트를 보낸다
    await land.locator("path").first().dispatchEvent("click");
  } else {
    await page.getByRole("tablist", { name: "국가 쌍 선택" }).getByRole("tab", { name: t.title }).click();
  }
  await expect(heading(page, t)).toBeVisible({ timeout: DATA_TIMEOUT_MS });
}

async function open(page: Page, width: number, t: Target = KOREA) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto("/");
  await page.locator("main").waitFor();
  await expect(heading(page, KOREA), "첫 화면 기본 대상").toBeVisible({ timeout: DATA_TIMEOUT_MS });
  if (t !== KOREA) await select(page, t);
  return summaryOf(page, t);
}

/** 패널 그리드 세 패널의 내용이 그려질 때까지("불러오는 중"이 없어도 아직 비어 있는 위젯이 있어 내용으로 확인) */
async function waitPanels(page: Page) {
  await expect(panel(page, HISTORY).getByRole("img", { name: CHART_NAME, exact: true })).toBeVisible({ timeout: DATA_TIMEOUT_MS });
  await expect(panel(page, NEWS).getByRole("listitem").first()).toBeVisible({ timeout: DATA_TIMEOUT_MS });
  await expect(panel(page, THREATS).getByText("최근 90일 하루별 보도량")).toBeVisible({ timeout: DATA_TIMEOUT_MS });
}

/** 대상별 위젯(대피소·공관 목록·과거 사례)까지 그려질 때까지 */
async function waitTarget(page: Page, t: Target) {
  await waitPanels(page);
  const s = summaryOf(page, t);
  if (t === KOREA) await expect(sheltersOf(page)).toBeVisible({ timeout: DATA_TIMEOUT_MS });
  if (t === JAPAN) await expect(embassyOf(s).locator("li").first()).toBeVisible({ timeout: DATA_TIMEOUT_MS });
  if (t === PAIR) await expect(panel(page, PAST).getByRole("listitem").first()).toBeVisible({ timeout: DATA_TIMEOUT_MS });
  await expect(page.getByText("불러오는 중")).toHaveCount(0, { timeout: DATA_TIMEOUT_MS });
}

/** lg 이상: 체크리스트와 옆 영역이 1:1로 나란히(top·폭 같음, 둘이 본문 폭을 채움).
 *  lg 미만: 옆 영역이 체크리스트 아래, 둘 다 전체 폭 */
async function expectActionArea(page: Page, checklist: Locator, other: Locator, width: number) {
  const [c, o] = await Promise.all([box(checklist), box(other)]);
  const main = await content(page);
  if (width >= LG) {
    expect.soft(Math.abs(c.y - o.y), "체크리스트·옆 영역 top 차이").toBeLessThanOrEqual(TOLERANCE_PX);
    expect.soft(Math.abs(c.width - o.width), "체크리스트·옆 영역 폭 차이").toBeLessThanOrEqual(TOLERANCE_PX);
    expect.soft(o.x, "옆 영역이 체크리스트 오른쪽").toBeGreaterThanOrEqual(c.right);
    expect.soft(Math.abs(c.x - main.x), "체크리스트 왼쪽 끝 = 본문 왼쪽").toBeLessThanOrEqual(TOLERANCE_PX);
    expect.soft(Math.abs(o.right - main.right), "옆 영역 오른쪽 끝 = 본문 오른쪽").toBeLessThanOrEqual(TOLERANCE_PX);
  } else {
    expect.soft(o.y, "옆 영역이 체크리스트 아래").toBeGreaterThanOrEqual(c.bottom - TOLERANCE_PX);
    for (const [label, b] of [["체크리스트", c], ["옆 영역", o]] as const) {
      expect.soft(Math.abs(b.x - main.x), `${label} 왼쪽 끝 = 본문 왼쪽`).toBeLessThanOrEqual(TOLERANCE_PX);
      expect.soft(Math.abs(b.right - main.right), `${label} 오른쪽 끝 = 본문 오른쪽`).toBeLessThanOrEqual(TOLERANCE_PX);
    }
  }
}

// 측정 단언은 expect.soft 라 한 번 실행으로 어긋난 조건을 모두 보여 준다(요소가 있는지 같은 전제만 바로 멈춤)
test.describe.configure({ timeout: TEST_TIMEOUT_MS });

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test("요약: 이름·배지 한 줄, 종합·실시간 점수 위치", async ({ page }) => {
      await open(page, width);
      for (const t of TARGETS) {
        if (t !== KOREA) await select(page, t);
        const s = summaryOf(page, t);
        const name = heading(page, t);
        const badge = name.locator("xpath=following-sibling::*[1]");
        const total = s.getByText("종합 7일", { exact: true }).locator("..");
        const live = s.getByText("실시간 24시간", { exact: true }).locator("..");
        await expect(live, `${t.title} 실시간 점수`).toBeVisible({ timeout: DATA_TIMEOUT_MS });
        await settle(page);
        const [n, b, tot, lv] = await Promise.all([name, badge, total, live].map((l) => box(l)));

        expect.soft(await lines(name), `${t.title} 이름 줄 수`).toBe(1);
        expect.soft(sameLine(n, b), `${t.title} 이름·배지 같은 줄`).toBe(true);
        expect.soft(sameLine(tot, lv), `${t.title} 종합·실시간 점수 같은 줄`).toBe(true);
        if (width >= MD) {
          expect.soft(Math.abs(tot.y - n.y), `${t.title} 종합 점수 top - 이름 top`).toBeLessThanOrEqual(SAME_LINE_PX);
          expect.soft(tot.x, `${t.title} 점수가 이름 블록 오른쪽`).toBeGreaterThanOrEqual(Math.max(n.right, b.right));
        } else {
          const nameBottom = Math.max(n.bottom, b.bottom);
          expect.soft(tot.y, `${t.title} 종합 점수가 이름 줄 아래`).toBeGreaterThanOrEqual(nameBottom - TOLERANCE_PX);
          expect.soft(lv.y, `${t.title} 실시간 점수가 이름 줄 아래`).toBeGreaterThanOrEqual(nameBottom - TOLERANCE_PX);
          // 점수 구성 문장은 전체 폭
          const formula = await box(s.getByText(/^종합 점수 구성/));
          const main = await content(page);
          expect.soft(Math.abs(formula.x - main.x), `${t.title} 구성 문장 왼쪽 끝`).toBeLessThanOrEqual(TOLERANCE_PX);
          expect.soft(Math.abs(formula.right - main.right), `${t.title} 구성 문장 오른쪽 끝`).toBeLessThanOrEqual(TOLERANCE_PX);
        }
      }
    });

    test("여행경보 줄(일본): md 미만 기관별 목록·외교부 첫 줄, md 이상 한 문단", async ({ page }) => {
      const s = await open(page, width, JAPAN);
      // 기관별 항목: 보이는 li 중 "N/M단계"가 있는 것
      const items = s.locator("li").filter({ hasText: ADVISORY_LEVEL }).filter({ visible: true });
      await expect.soft(s.getByRole("button", { name: "단계 설명", exact: true }), "단계 설명 버튼 유지").toBeVisible();

      if (width < MD) {
        await expect(items, "기관마다 li 하나").toHaveCount(AGENCIES.length);
        const texts = await items.allInnerTexts();
        expect.soft(texts[0], "외교부가 첫 줄").toContain(AGENCIES[0]);
        for (const a of AGENCIES) expect.soft(texts.filter((x) => x.includes(a)), `${a} 항목 수`).toHaveLength(1);
        await settle(page);
        const boxes = await Promise.all((await items.all()).map((l) => box(l)));
        for (let i = 1; i < boxes.length; i++) {
          expect.soft(boxes[i].y, `${i + 1}번째 기관이 앞 기관 아래 줄`).toBeGreaterThanOrEqual(boxes[i - 1].bottom - TOLERANCE_PX);
        }
      } else {
        await expect.soft(items, "md 이상은 기관별 목록 없음").toHaveCount(0);
        // 뉴스 제목 등과 헷갈리지 않게 세 기관 이름을 모두 담은 문단만 센다
        let paragraph = s.locator("p").filter({ visible: true }).filter({ hasText: ADVISORY_LABEL });
        for (const a of AGENCIES) paragraph = paragraph.filter({ hasText: a });
        await expect(paragraph, "세 기관이 한 문단").toHaveCount(1);
        const text = await paragraph.innerText();
        for (const a of AGENCIES.slice(1)) {
          expect.soft(text.indexOf(AGENCIES[0]), `외교부가 ${a}보다 앞`).toBeLessThan(text.indexOf(a));
        }
      }
      for (const a of AGENCIES) {
        await expect.soft(s.getByRole("link", { name: a, exact: true }), `${a} 링크 새 탭`).toHaveAttribute("target", "_blank");
      }
    });

    test("한국: 체크리스트·대피소 배치, 체크리스트 항목 열 수", async ({ page }) => {
      const s = await open(page, width, KOREA);
      const checklist = checklistOf(s);
      const shelters = sheltersOf(page);
      await expect(checklist).toBeVisible({ timeout: DATA_TIMEOUT_MS });
      await expect(shelters).toBeVisible({ timeout: DATA_TIMEOUT_MS });
      await settle(page);
      await expectActionArea(page, checklist, shelters, width);
      expect.soft(await columns(checklist.locator("li")), "체크리스트 항목 열 수").toBe(CHECK_COLS_BESIDE[step(width)]);
    });

    test("일본: 체크리스트·재외공관 배치, 체크리스트 항목·공관 목록 열 수", async ({ page }) => {
      const s = await open(page, width, JAPAN);
      const checklist = checklistOf(s);
      const embassy = embassyOf(s);
      const offices = embassy.locator("li");
      await expect(checklist).toBeVisible({ timeout: DATA_TIMEOUT_MS });
      await expect(offices.first(), "공관 목록").toBeVisible({ timeout: DATA_TIMEOUT_MS });
      expect(await offices.count(), "공관이 둘 이상이어야 열 수 검사 가능").toBeGreaterThan(1);
      await expect.soft(sheltersOf(page), "해외 나라는 대피소 없음").toHaveCount(0);
      await settle(page);
      await expectActionArea(page, checklist, embassy, width);
      expect.soft(await columns(checklist.locator("li")), "체크리스트 항목 열 수").toBe(CHECK_COLS_BESIDE[step(width)]);
      expect.soft(await columns(offices), "공관 목록 열 수").toBe(EMBASSY_COLS[step(width)]);
      if (width >= LG) {
        // 사용자 결정 "각자 높이": 공관 카드가 훨씬 길어도 체크리스트 카드는 내용 높이만큼만(속 빈 카드 없음)
        const [c, e, empty] = await Promise.all([box(checklist), box(embassy), emptyBelow(checklist)]);
        expect(e.height, "공관 카드가 체크리스트 내용보다 길어야 이 검사가 의미 있음").toBeGreaterThan(c.height - empty);
        expect.soft(empty, "체크리스트 카드 안 아래 빈 높이").toBeLessThanOrEqual(TOLERANCE_PX);
      }
    });

    test("러시아–우크라이나: 체크리스트 전체 폭, 항목 열 수", async ({ page }) => {
      const s = await open(page, width, PAIR);
      const checklist = checklistOf(s);
      await expect(checklist).toBeVisible({ timeout: DATA_TIMEOUT_MS });
      await expect.soft(sheltersOf(page), "한국 없는 쌍은 대피소 없음").toHaveCount(0);
      await expect.soft(s.getByText("현지 긴급 연락처", { exact: true }), "국가 쌍은 재외공관 없음").toHaveCount(0);
      await settle(page);
      const c = await box(checklist);
      const main = await content(page);
      expect.soft(Math.abs(c.x - main.x), "체크리스트 왼쪽 끝 = 본문 왼쪽").toBeLessThanOrEqual(TOLERANCE_PX);
      expect.soft(Math.abs(c.right - main.right), "체크리스트 오른쪽 끝 = 본문 오른쪽").toBeLessThanOrEqual(TOLERANCE_PX);
      expect.soft(await columns(checklist.locator("li")), "체크리스트 항목 열 수").toBe(CHECK_COLS_ALONE[step(width)]);
    });

    test("패널 그리드: 추이·위협 사건 왼쪽 열, 뉴스 두 행·오른쪽 열 폭", async ({ page }) => {
      await open(page, width, KOREA);
      await waitPanels(page);
      await settle(page);
      const [h, n, t] = await Promise.all([HISTORY, NEWS, THREATS].map((title) => box(panel(page, title))));

      if (width >= LG) {
        const gap = await gridRowGap(panel(page, HISTORY));
        expect(gap, "패널 그리드(display: grid) 없음").not.toBeNull();
        expect.soft(Math.abs(t.x - h.x), "위협 사건이 추이와 같은 왼쪽 열").toBeLessThanOrEqual(TOLERANCE_PX);
        expect.soft(Math.abs(t.width - h.width), "위협 사건 폭 = 추이 폭").toBeLessThanOrEqual(TOLERANCE_PX);
        expect.soft(Math.abs(t.y - h.bottom - gap!), "추이 아래 간격 = 그리드 gap").toBeLessThanOrEqual(TOLERANCE_PX);
        expect.soft(n.x, "뉴스가 오른쪽 열").toBeGreaterThanOrEqual(h.right);
        expect.soft(Math.abs(n.y - h.y), "뉴스 top = 첫 행 top").toBeLessThanOrEqual(TOLERANCE_PX);
        expect.soft(n.bottom, "뉴스가 둘째 행까지 차지").toBeGreaterThanOrEqual(t.bottom - TOLERANCE_PX);
        expect.soft(Math.abs(n.width - RIGHT_COL_W[step(width)]), `오른쪽 열 폭 ${n.width}`).toBeLessThanOrEqual(TOLERANCE_PX);
      } else {
        // 1열: 추이 → 뉴스 → 위협 사건, 모두 같은 열
        expect.soft(n.y, "뉴스가 추이 아래").toBeGreaterThanOrEqual(h.bottom);
        expect.soft(t.y, "위협 사건이 뉴스 아래").toBeGreaterThanOrEqual(n.bottom);
        for (const [label, b] of [["뉴스", n], ["위협 사건", t]] as const) {
          expect.soft(Math.abs(b.x - h.x), `${label} 왼쪽 끝`).toBeLessThanOrEqual(TOLERANCE_PX);
          expect.soft(Math.abs(b.width - h.width), `${label} 폭`).toBeLessThanOrEqual(TOLERANCE_PX);
        }
      }
    });

    test("뉴스 목록 최대 높이", async ({ page }) => {
      await open(page, width, KOREA);
      const news = panel(page, NEWS);
      await expect(news.getByRole("listitem").first()).toBeVisible({ timeout: DATA_TIMEOUT_MS });
      // 목록 스크롤 요소: 패널 안에서 처음 나오는 overflow-y auto/scroll 요소
      const list = await news.evaluate((el) => {
        const v = [...el.querySelectorAll("*")].find((e) => /auto|scroll/.test(getComputedStyle(e).overflowY));
        return v ? { maxHeight: getComputedStyle(v).maxHeight, height: v.clientHeight } : null;
      });
      const expected = NEWS_LIST_MAX_H[step(width)];
      expect(list, "뉴스 목록 스크롤 영역 없음").not.toBeNull();
      expect.soft(list!.maxHeight, "뉴스 목록 최대 높이").toBe(`${expected}px`);
      expect.soft(list!.height).toBeLessThanOrEqual(expected);
    });

    test("과거 사례(국가 쌍): 그리드 두 열 전체 폭", async ({ page }) => {
      await open(page, width, PAIR);
      const past = panel(page, PAST);
      await expect(past.getByRole("listitem").first()).toBeVisible({ timeout: DATA_TIMEOUT_MS });
      await waitPanels(page);
      await settle(page);
      const [p, h, n] = await Promise.all([past, panel(page, HISTORY), panel(page, NEWS)].map((l) => box(l)));
      // 왼쪽 끝 = 왼쪽 열(추이), 오른쪽 끝 = 마지막 열(lg 이상 뉴스, 미만 추이)
      expect.soft(Math.abs(p.x - h.x), "과거 사례 왼쪽 끝").toBeLessThanOrEqual(TOLERANCE_PX);
      expect.soft(Math.abs(p.right - (width >= LG ? n.right : h.right)), "과거 사례 오른쪽 끝").toBeLessThanOrEqual(TOLERANCE_PX);
    });

    test("세 대상: 가로 넘침 없음·콘솔 오류 0·FAQ 1열 전체 폭", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));

      await open(page, width);
      for (const t of TARGETS) {
        if (t !== KOREA) await select(page, t);
        await waitTarget(page, t);
        await settle(page);
        const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
        expect.soft(m.scroll, `${t.title} 가로 넘침`).toBeLessThanOrEqual(m.inner);
      }

      const faq = panel(page, "자주 묻는 질문");
      const f = await box(faq);
      const main = await content(page);
      expect.soft(Math.abs(f.x - main.x), "FAQ 왼쪽 끝").toBeLessThanOrEqual(TOLERANCE_PX);
      expect.soft(Math.abs(f.right - main.right), "FAQ 오른쪽 끝").toBeLessThanOrEqual(TOLERANCE_PX);
      expect.soft(await columns(faq.locator("details")), "FAQ 열 수").toBe(1);
      expect.soft(errors, "콘솔 오류").toEqual([]);
    });

    test.describe("상호작용", () => {
      test.use({ geolocation: SEOUL, permissions: ["geolocation"] });

      test("한국: 추이·뉴스 기간 전환, 대피소 찾기, 체크 저장", async ({ page }) => {
        const s = await open(page, width, KOREA);
        await waitPanels(page);

        // 추이 기간: 1년으로 바꾸면 선이 다시 그려짐
        const history = panel(page, HISTORY);
        const line = history.getByRole("img", { name: CHART_NAME, exact: true }).locator("path").first();
        const before = await line.getAttribute("d");
        const oneYear = history.getByRole("radiogroup", { name: "차트 기간" }).getByRole("radio", { name: "1년", exact: true });
        await oneYear.click();
        await expect(oneYear).toBeChecked();
        await expect(line).not.toHaveAttribute("d", before ?? "");

        // 뉴스 기간: 선택되지 않은, 고를 수 있는 기간으로 바꿈
        const range = panel(page, NEWS).getByRole("radiogroup", { name: "뉴스 기간" });
        const idle = range.getByRole("radio", { checked: false, disabled: false });
        await expect(idle, "고를 수 있는 다른 뉴스 기간이 있어야 전환 검사 가능").toHaveCount(1);
        const label = (await idle.textContent()) ?? "";
        await idle.click();
        await expect(range.getByRole("radio", { name: label, exact: true })).toBeChecked();

        // 대피소 찾기(위치 권한·좌표는 test.use)
        const shelters = sheltersOf(page);
        await shelters.getByRole("button", { name: "내 주변 대피소 찾기", exact: true }).click();
        await expect(shelters.getByRole("listitem").first(), "대피소 결과").toBeVisible({ timeout: DATA_TIMEOUT_MS });

        // 체크 저장: 새로 고쳐도 체크가 남음
        const first = checklistOf(s).getByRole("checkbox").first();
        await first.check();
        await page.reload();
        await expect(checklistOf(summaryOf(page, KOREA)).getByRole("checkbox").first()).toBeChecked({ timeout: DATA_TIMEOUT_MS });
      });

      test("일본: 재외공관 전화 링크", async ({ page }) => {
        const s = await open(page, width, JAPAN);
        const embassy = embassyOf(s);
        await expect(embassy.locator("li").first()).toBeVisible({ timeout: DATA_TIMEOUT_MS });
        await settle(page);
        const tel = embassy.locator('a[href^="tel:"]');
        expect(await tel.count(), "전화 링크").toBeGreaterThan(1);
        // 모든 전화 링크가 가려지지 않고 눌릴 수 있는지(실제 전화 앱 이동은 하지 않음)
        for (const a of await tel.all()) await a.click({ trial: true });
      });
    });
  });
}
