import { expect, test, type Locator, type Page } from "@playwright/test";

// 기획안 기준 화면 폭(360·768·1080·1440)
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
// 폭별 모달 폭(px). 360 은 화면 전체
const DIALOG_WIDTH: Record<number, number> = { 360: 360, 768: 720, 1080: 760, 1440: 880 };
const MD = 768;
const TOLERANCE = 1;
const DATA_TIMEOUT_MS = 30_000; // 데이터가 다 들어오기를 기다리는 시간
const TAB_PRESSES = 12;
const LEVEL_COUNT = 4;
const AGENCY_COLUMNS = [2, 3, 4]; // 표에서 외교부·미 국무부·영국 FCDO 칸(nth-child)
const ONE_LINE = 1;
const BACKDROP_POINT = { x: 2, y: 2 }; // 모달 밖(배경) 클릭 위치
// 본문 스크롤 영역과 그 오버레이 thumb. getByRole("region") 아래 evaluateAll 이 Firefox 페이지를 죽여 CSS 로 찾는다
const BODY = 'dialog [aria-label="가이드 본문"]';
const BODY_THUMB = 'dialog div.absolute[aria-hidden="true"]';
const WHEEL_STEP_PX = 200; // thumb 확인용 한 번 스크롤 양
const THUMB_SHOW_TIMEOUT_MS = 500; // 스크롤 뒤 opacity-100 이 붙기를 기다리는 시간(숨김 지연 0.8초보다 짧게)
const THUMB_RETRY_TIMEOUT_MS = 10_000; // 다시 스크롤해 확인하는 전체 시간
const TALL = { width: 1440, height: 2400 }; // 내용이 모달 최대 높이보다 짧은 큰 화면
const DIALOG_MAX_VH = 0.85; // md 이상 모달 최대 높이 85vh
// 헤더 버튼 문구는 이슈 #21 담당. 바뀌면 이 값을 맞춘다
const OPEN_BUTTON = "가이드 · 여행경보 단계";

async function openGuide(page: Page, width: number, height = HEIGHT) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await page.locator("main").waitFor();
  // 데이터가 다 들어와 "불러오는 중"이 사라질 때까지 기다린다
  await expect(page.getByText("불러오는 중")).toHaveCount(0, { timeout: DATA_TIMEOUT_MS });
  await page.getByRole("button", { name: OPEN_BUTTON, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function box(l: Locator) {
  const b = await l.boundingBox();
  expect(b, "요소가 화면에 없음").not.toBeNull();
  return { ...b!, bottom: b!.y + b!.height, right: b!.x + b!.width };
}

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test("여행경보 단계 이름 한 줄·가로 넘침 없음·모달 크기", async ({ page }, info) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      const dialog = await openGuide(page, width);

      const m = await dialog.evaluate((d, { isTable, agencyColumns }) => {
        const lines = (el: Element | null) => (el ? el.getClientRects().length : -1);
        const section = d.querySelector('[data-guide="advisory"]')!;
        const body = d.querySelector('[aria-label="가이드 본문"]')!;
        const table = section.querySelector("table")!;
        const cards = [...section.querySelectorAll("li")];
        // 표: 각 행의 첫 칸(단계)과 기관 칸의 주 문구, 카드: 제목과 기관별 주 문구
        const levelEls = isTable ? [...table.querySelectorAll("tbody tr td:first-child > span")] : cards.map((c) => c.querySelector("h4 > span"));
        const mainEls = isTable
          ? [...table.querySelectorAll("tbody tr")].flatMap((tr) => agencyColumns.map((i) => tr.querySelector(`td:nth-child(${i}) > span:first-child`)))
          : cards.flatMap((c) => [...c.querySelectorAll("dd > span:first-child")]);
        const r = d.getBoundingClientRect();
        return {
          // 조상이 display:none 이면 자기 display 는 그대로라 상자 유무로 본다
          tableShown: table.getClientRects().length > 0,
          cardsShown: cards.length > 0 && cards[0].getClientRects().length > 0,
          cardCount: cards.length,
          levelLines: levelEls.map(lines),
          mainLines: mainEls.map(lines),
          sectionScroll: [section.scrollWidth, section.clientWidth],
          bodyScroll: [body.scrollWidth, body.clientWidth],
          docScroll: [document.documentElement.scrollWidth, window.innerWidth],
          rect: { left: r.left, width: r.width, height: r.height },
          viewport: [window.innerWidth, window.innerHeight],
        };
      }, { isTable: width >= MD, agencyColumns: AGENCY_COLUMNS });

      expect(m.tableShown, "md 이상 표, md 미만 카드").toBe(width >= MD);
      expect(m.cardsShown).toBe(width < MD);
      if (width < MD) expect(m.cardCount).toBe(LEVEL_COUNT);
      expect(m.levelLines, "N단계 한 줄").toEqual(Array(LEVEL_COUNT).fill(ONE_LINE));
      expect(m.mainLines, "기관별 주 문구 한 줄").toEqual(Array(LEVEL_COUNT * AGENCY_COLUMNS.length).fill(ONE_LINE));
      expect(m.sectionScroll[0], "여행경보 가로 넘침").toBeLessThanOrEqual(m.sectionScroll[1]);
      // 점수 의미·행동 권고·지도 상태 등 다른 섹션까지 본문 전체
      expect(m.bodyScroll[0], "모달 본문 가로 넘침").toBeLessThanOrEqual(m.bodyScroll[1]);
      expect(m.docScroll[0], "페이지 가로 넘침").toBeLessThanOrEqual(m.docScroll[1]);

      expect(Math.abs(m.rect.width - DIALOG_WIDTH[width]), `모달 폭 ${m.rect.width}`).toBeLessThanOrEqual(TOLERANCE);
      if (width < MD) {
        expect(Math.abs(m.rect.left)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(m.rect.width - m.viewport[0])).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(m.rect.height - m.viewport[1])).toBeLessThanOrEqual(TOLERANCE);
      }

      await info.attach(`${width}px`, { body: await page.screenshot(), contentType: "image/png" });
      expect(errors, "콘솔 오류").toEqual([]);
    });

    test("끝까지 스크롤해도 닫기 버튼 보임·Tab 포커스 가둠·Esc 로 닫힘", async ({ page }) => {
      const dialog = await openGuide(page, width);
      const body = dialog.getByRole("region", { name: "가이드 본문" });
      await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await expect(dialog.getByRole("button", { name: "닫기" })).toBeInViewport();

      for (let i = 0; i < TAB_PRESSES; i++) {
        await page.keyboard.press("Tab");
        // 모달 밖 요소로 포커스가 가면 안 된다(브라우저 UI 로 나가 body 가 되는 것은 허용)
        const inside = await dialog.evaluate((d) => {
          const a = document.activeElement;
          return !a || a === document.body || d.contains(a);
        });
        expect(inside, `Tab ${i + 1}번째`).toBe(true);
      }

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });

    test("본문을 휠로 내리면 오버레이 thumb 가 모달 안에 보임", async ({ page }) => {
      const dialog = await openGuide(page, width);
      const body = page.locator(BODY);
      const thumb = page.locator(BODY_THUMB);
      const b = await box(body);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      // 계산된 opacity 는 페이드·숨김 지연 사이에만 1이라 놓칠 수 있어,
      // 스크롤 중 붙는 opacity-100 클래스를 보고, 놓치면 다시 스크롤해 확인한다
      await expect(async () => {
        await page.mouse.wheel(0, WHEEL_STEP_PX);
        await expect(thumb).toHaveClass(/(^|\s)opacity-100(\s|$)/, { timeout: THUMB_SHOW_TIMEOUT_MS });
      }).toPass({ timeout: THUMB_RETRY_TIMEOUT_MS });
      // Firefox 는 휠 스크롤이 부드럽게(비동기로) 움직여 바로 읽으면 0일 수 있다
      await expect.poll(() => body.evaluate((e) => e.scrollTop), "휠로 본문이 스크롤됨").toBeGreaterThan(0);

      const [t, d] = await Promise.all([box(thumb), box(dialog)]);
      expect(t.x, "thumb 왼쪽").toBeGreaterThanOrEqual(d.x);
      expect(t.y, "thumb 위").toBeGreaterThanOrEqual(d.y);
      expect(t.right, "thumb 오른쪽").toBeLessThanOrEqual(d.right);
      expect(t.bottom, "thumb 아래").toBeLessThanOrEqual(d.bottom);
    });

    test("닫기 버튼으로 닫힘", async ({ page }) => {
      const dialog = await openGuide(page, width);
      await dialog.getByRole("button", { name: "닫기" }).click();
      await expect(dialog).toBeHidden();
    });

    if (width >= MD) {
      test("바깥(배경) 클릭으로 닫힘", async ({ page }) => {
        const dialog = await openGuide(page, width);
        await page.mouse.click(BACKDROP_POINT.x, BACKDROP_POINT.y);
        await expect(dialog).toBeHidden();
      });
    }
  });
}

test("큰 화면: 모달 높이 = 닫기 줄 + 본문 내용(빈 영역 없음)", async ({ page }) => {
  const dialog = await openGuide(page, TALL.width, TALL.height);
  const h = await dialog.evaluate((d) => ({
    dialog: d.clientHeight,
    head: d.querySelector("#guide-title")!.parentElement!.offsetHeight,
    content: d.querySelector('[aria-label="가이드 본문"]')!.scrollHeight,
    viewport: window.innerHeight,
  }));
  expect(h.head + h.content, "내용이 모달 최대 높이보다 짧아야 검사가 의미 있음").toBeLessThan(h.viewport * DIALOG_MAX_VH);
  expect(Math.abs(h.dialog - (h.head + h.content)), `모달 ${h.dialog}px, 닫기 줄 + 본문 내용 ${h.head + h.content}px`)
    .toBeLessThanOrEqual(TOLERANCE);
});
