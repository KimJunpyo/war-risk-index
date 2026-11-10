import { expect, test, type Locator, type Page } from "@playwright/test";

// 이슈 #21(2-1) 상단 영역 반응형 실측. 기준 화면 폭(360·768·1080·1440)
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
const MD = 768;
const LG = 1080;
const XL = 1440;
const DATA_TIMEOUT_MS = 30_000; // 데이터가 다 들어오기를 기다리는 시간
const GUIDE_NAME = "가이드 · 여행경보 단계";
const MAP_NAME = "국가별 전쟁 가능성 지수 세계 지도";
const SAME_LINE_PX = 8; // 한 줄로 보는 top 차이
const SUBPIXEL_PX = 0.5; // 소수점 배치 오차
const WATCH_MAX_H = 320; // lg 미만 주목 국가 목록 최대 높이
const WATCH_W = { lg: 260, xl: 300 }; // lg 이상 주목 국가 열 폭
const WATCH_MIN_VIEW_H = 144; // lg 이상에서 "주목 국가 기준"을 펼쳐도 남아야 하는 목록 높이(항목 약 3개)
const MIN_ITEMS = 3; // 열 수를 세려면 항목이 이만큼은 있어야 함
const MOVER_BLOCKS = 2; // 이번 주 변화: 오른 나라·내린 나라
const OTHER_TAB = 1; // 기본 선택이 아닌 국가 쌍 탭(순서)
const SELECTED_CLASS = "bg-white/10"; // 주목 국가 선택 표시
const SELECTED = /(^|\s)bg-white\/10(\s|$)/;
const TOLERANCE_PX = 1;
// 열 수 기대값: [기본, md, lg, xl]
const WATCH_COLS = [1, 2, 1, 1];
const MOVER_COLS = [1, 2, 2, 2];
const PAIR_COLS = [2, 3, 4, 4];
// LiveBadge 상태 고정: /api/live 응답의 as_of 를 지금보다 agoMs 이전 슬롯으로 바꾼다(45분이 넘으면 지연)
const LIVE_API = "**/api/live";
const SLOT_FORMAT = "YYYYMMDDHHmmss"; // GDELT 2.0 슬롯 키(UTC)
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
// text: 배지의 접근성 트리 문구(상태 + 경과 시간)
const LIVE_STATES = [
  { name: "신선 5분 전", agoMs: 5 * MINUTE_MS, text: /LIVE.*분 전/ },
  { name: "지연 59분 전", agoMs: 59 * MINUTE_MS, text: /지연.*분 전/ },
  { name: "지연 12시간 전", agoMs: 12 * HOUR_MS, text: /지연.*시간 전/ },
  { name: "지연 3일 전", agoMs: 3 * DAY_MS, text: /지연.*일 전/ },
];

const step = (w: number) => (w >= XL ? 3 : w >= LG ? 2 : w >= MD ? 1 : 0);

/** 자식 요소들의 서로 다른 left 위치 개수 = 열 수 */
async function columns(items: Locator): Promise<number> {
  const lefts = await items.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  return new Set(lefts).size;
}

async function box(l: Locator) {
  const b = await l.boundingBox();
  expect(b, "요소가 화면에 없음").not.toBeNull();
  return { ...b!, bottom: b!.y + b!.height, right: b!.x + b!.width };
}

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto("/");
  await page.locator("main").waitFor();
  // 데이터가 다 들어와 "불러오는 중"이 사라질 때까지 기다린다
  await expect(page.getByText("불러오는 중")).toHaveCount(0, { timeout: DATA_TIMEOUT_MS });
}

/** 지금보다 agoMs 이전의 슬롯 키(SLOT_FORMAT). LiveBadge slotToIso 의 역 */
const slotKey = (agoMs: number) =>
  new Date(Date.now() - agoMs).toISOString().replace(/\D/g, "").slice(0, SLOT_FORMAT.length);

/** /api/live 의 as_of 만 바꿔 배지 상태를 고정한다. 실제 응답을 받아 고치므로 CORS 등 헤더는 그대로 */
async function fixLiveAsOf(page: Page, agoMs: number) {
  await page.route(LIVE_API, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), as_of: slotKey(agoMs) } });
  });
}

/** 등장 애니메이션(fade-up 등 유한 반복)이 끝날 때까지 기다린다. 무한 반복(blink·ping)은 제외 */
const settle = (page: Page) => page.evaluate(async () => {
  await Promise.allSettled(document.getAnimations()
    .filter((a) => a.effect?.getTiming().iterations !== Infinity)
    .map((a) => a.finished));
});

const mapPanel = (page: Page) =>
  page.locator("section", { has: page.getByRole("heading", { name: "세계 지도", exact: true }) });

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    // 배지 문구 길이가 상태마다 달라 상태별로 본다. lg 이상은 헤더 폭이 넉넉해 신선 상태만
    for (const state of width >= LG ? LIVE_STATES.slice(0, 1) : LIVE_STATES) {
      test(`헤더(배지 ${state.name}): 제목·LiveBadge·가이드 버튼 한 줄, 버튼 문구·접근 이름`, async ({ page }) => {
        await fixLiveAsOf(page, state.agoMs);
        await open(page, width);
        const header = page.locator("main header").first();
        const title = header.getByRole("heading", { level: 1 });
        const badge = header.locator("span", { hasText: /LIVE|지연/ }).first();
        const guide = page.getByRole("button", { name: GUIDE_NAME, exact: true });
        // 상태가 고정됐는지 + 경과 시간은 화면에서 숨겨도 스크린리더에는 남는지
        await expect(badge).toMatchAriaSnapshot(`- text: /${state.text.source}/`);
        await expect(guide).toBeVisible();
        await settle(page);

        const [t, b, g] = await Promise.all([title, badge, guide].map(box));
        const m = await page.evaluate(() => {
          const main = document.querySelector("main")!;
          return {
            contentRight: main.getBoundingClientRect().right - parseFloat(getComputedStyle(main).paddingRight),
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          };
        });
        expect(g.right, `가이드 버튼 오른쪽 끝(헤더 내용 끝 ${m.contentRight})`).toBeLessThanOrEqual(m.contentRight + SUBPIXEL_PX);
        expect(m.scrollWidth, "페이지 가로 넘침").toBeLessThanOrEqual(m.innerWidth);
        const tops = [t, b, g].map((x) => x.y);
        expect(Math.max(...tops) - Math.min(...tops), "세 요소 top 차이").toBeLessThanOrEqual(SAME_LINE_PX);
        await expect(guide).toHaveText(width >= MD ? GUIDE_NAME : "가이드", { useInnerText: true });
        await expect(guide).toHaveAccessibleName(GUIDE_NAME);
      });
    }

    test("세계 지도: 토글 위치·주목 국가 배치", async ({ page }) => {
      await open(page, width);
      const panel = mapPanel(page);
      const heading = await box(panel.getByRole("heading", { name: "세계 지도", exact: true }));
      const toggle = await box(panel.getByRole("radiogroup", { name: "지도 색 기준" }));
      if (width >= MD) {
        // 같은 줄: 세로 범위가 겹친다
        expect(toggle.y).toBeLessThan(heading.bottom);
        expect(heading.y).toBeLessThan(toggle.bottom);
      } else {
        expect(toggle.y, "토글이 제목 아래 줄").toBeGreaterThanOrEqual(heading.bottom);
      }

      const svg = panel.getByRole("img", { name: MAP_NAME });
      const aside = panel.locator("aside");
      const viewport = aside.locator(".overflow-y-auto").first();
      const items = viewport.locator("ul").first().locator(":scope > li");
      await expect.poll(() => items.count(), "열 수를 세려면 항목이 여럿 있어야 함").toBeGreaterThanOrEqual(MIN_ITEMS);
      await settle(page);
      const map = await box(svg.locator(".."));
      const asideBox = await box(aside);

      if (width >= LG) {
        const expected = width >= XL ? WATCH_W.xl : WATCH_W.lg;
        expect(Math.abs(asideBox.width - expected), "주목 국가 폭").toBeLessThanOrEqual(TOLERANCE_PX);
        expect(asideBox.x).toBeGreaterThanOrEqual(map.right);
        // 목록이 그리드 행 높이를 키우지 않는다: 지도 박스·주목 국가 높이 = SVG 자체 높이
        const svgH = (await box(svg)).height;
        expect(Math.abs(map.height - svgH), `지도 박스 높이 ${map.height}, SVG ${svgH}`).toBeLessThanOrEqual(TOLERANCE_PX);
        expect(Math.abs(asideBox.height - svgH), `주목 국가 높이 ${asideBox.height}, SVG ${svgH}`).toBeLessThanOrEqual(TOLERANCE_PX);
        expect((await box(viewport)).bottom, "목록 아래 끝이 주목 국가 영역 밖").toBeLessThanOrEqual(asideBox.bottom + TOLERANCE_PX);

        // "주목 국가 기준"을 펼쳐도 영역 안에 있고 목록이 충분히 보인다
        const details = aside.locator("details");
        await details.locator("summary").click();
        await expect(details).toHaveAttribute("open");
        const [a, d, v] = await Promise.all([aside, details, viewport].map(box));
        expect(d.bottom, "펼친 기준 아래 끝이 주목 국가 영역 밖").toBeLessThanOrEqual(a.bottom + TOLERANCE_PX);
        expect(v.height, "기준을 펼친 뒤 목록 높이").toBeGreaterThanOrEqual(WATCH_MIN_VIEW_H);
      } else {
        expect(asideBox.y, "목록이 지도 아래").toBeGreaterThanOrEqual(map.bottom);
        const v = await viewport.evaluate((e) => ({ h: e.clientHeight, overflowY: getComputedStyle(e).overflowY }));
        expect(v.h).toBeLessThanOrEqual(WATCH_MAX_H);
        expect(v.overflowY).toBe("auto");
      }
      expect(await columns(items), "주목 국가 열 수").toBe(WATCH_COLS[step(width)]);
    });

    test("이번 주 변화 열 수", async ({ page }) => {
      await open(page, width);
      const panel = page.locator("section", { has: page.getByRole("heading", { name: "이번 주 변화", exact: true }) });
      const blocks = panel.locator(".grid").first().locator(":scope > div");
      await expect(blocks, "오른·내린 나라 두 블록이 있어야 열 수 검사 가능").toHaveCount(MOVER_BLOCKS);
      expect(await columns(blocks)).toBe(MOVER_COLS[step(width)]);
    });

    test("국가 쌍 카드 열 수·넘침 없음·보조 문구 위치", async ({ page }) => {
      await open(page, width);
      const tabs = page.getByRole("tablist", { name: "국가 쌍 선택" }).getByRole("tab");
      await expect.poll(() => tabs.count()).toBeGreaterThan(PAIR_COLS[step(width)]);
      expect(await columns(tabs)).toBe(PAIR_COLS[step(width)]);
      const overflow = await tabs.evaluateAll((els) =>
        els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
      expect(overflow, "카드 밖으로 넘친 카드").toEqual([]);

      // 보조 문구(실시간 24시간 …)와 그 앞 큰 점수의 세로 범위
      const rows = await tabs.evaluateAll((els) => els.map((e) => {
        const sub = [...e.querySelectorAll("span")].find((s) => /^(실시간 )?24시간/.test(s.textContent ?? ""))!;
        const score = sub.previousElementSibling!.getBoundingClientRect();
        const r = sub.getBoundingClientRect();
        return { name: e.textContent, scoreTop: score.top, scoreBottom: score.bottom, subTop: r.top, subBottom: r.bottom };
      }));
      for (const r of rows) {
        if (width >= MD) {
          expect(r.subTop < r.scoreBottom && r.scoreTop < r.subBottom, `${r.name}: 보조 문구가 점수와 같은 줄`).toBe(true);
        } else {
          expect(r.subTop, `${r.name}: 보조 문구가 점수 아래 줄`).toBeGreaterThanOrEqual(r.scoreBottom - TOLERANCE_PX);
        }
      }
    });

    test("지도 클릭·확대·주목 국가 선택·국가 쌍 선택 동작", async ({ page }) => {
      await open(page, width);
      const panel = mapPanel(page);
      const svg = panel.getByRole("img", { name: MAP_NAME });
      const zoomed = svg.locator(":scope > g").first();

      await panel.getByRole("button", { name: "확대", exact: true }).click();
      await expect(zoomed).not.toHaveAttribute("transform", /scale\(1\)$/);

      // 실제 히트 테스트: bbox 중심을 눌렀을 때 그 나라 면이 맞는 것 중 가장 큰 것(부속 지역 말고 본토)을 마우스로 누른다
      const land = await svg.locator("path.cursor-pointer").evaluateAll((paths) => paths
        .map((p) => {
          const r = p.getBoundingClientRect();
          return { p, x: r.x + r.width / 2, y: r.y + r.height / 2, area: r.width * r.height };
        })
        .filter(({ p, x, y }) => document.elementFromPoint(x, y) === p)
        .sort((a, b) => b.area - a.area)
        .map(({ p, x, y }) => ({ d: p.getAttribute("d")!, x, y }))[0]);
      expect(land, "눌러서 맞는 나라 면이 없음").toBeTruthy();
      await page.mouse.click(land.x, land.y);
      // 선택 테두리(glow)가 그 나라 모양으로 그려짐
      await expect(svg.locator('path[filter="url(#glow)"]')).toHaveAttribute("d", land.d);

      // 아직 선택되지 않은 주목 국가를 눌러 선택 표시가 붙는지
      const watchItems = panel.locator("aside li button");
      const i = await watchItems.evaluateAll((els, cls) => els.findIndex((e) => !e.classList.contains(cls)), SELECTED_CLASS);
      expect(i, "선택 안 된 주목 국가가 없음").toBeGreaterThanOrEqual(0);
      const watchItem = watchItems.nth(i);
      await expect(watchItem).not.toHaveClass(SELECTED);
      await watchItem.click();
      await expect(watchItem).toHaveClass(SELECTED);

      const tab = page.getByRole("tablist", { name: "국가 쌍 선택" }).getByRole("tab").nth(OTHER_TAB);
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
    });
  });
}
