import { expect, test } from "@playwright/test";

// 기획안 기준 화면 폭(360·768·1080·1440)
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
// PageScrollbar의 페이지 thumb(fixed, aria-hidden)
const PAGE_THUMB = 'div.fixed[aria-hidden="true"]';
const WHEEL_STEP_PX = 200; // thumb 확인용 한 번 스크롤 양
const THUMB_SHOW_TIMEOUT_MS = 500; // 스크롤 뒤 opacity-100 이 붙기를 기다리는 시간(숨김 지연 0.8초보다 짧게)
const THUMB_RETRY_TIMEOUT_MS = 10_000; // 다시 스크롤해 확인하는 전체 시간

for (const width of WIDTHS) {
  test(`${width}px: 가로 넘침 없음·스크롤바 공간 0·콘솔 오류 없음`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));

    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto("/");
    await page.locator("main").waitFor();
    // 데이터가 다 들어와 "불러오는 중"이 사라질 때까지 기다린다
    await expect(page.getByText("불러오는 중")).toHaveCount(0, { timeout: 30_000 });

    const m = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(m.scrollHeight, "세로 스크롤이 생겨야 스크롤바 검사가 의미 있음").toBeGreaterThan(HEIGHT);
    expect(m.scrollWidth, "가로 넘침").toBeLessThanOrEqual(m.innerWidth);
    expect(m.clientWidth, "네이티브 스크롤바가 폭을 차지함").toBe(m.innerWidth);

    // 스크롤하면 페이지 thumb가 보여야 한다.
    // 계산된 opacity는 페이드(0.2초)·숨김 지연(0.8초) 사이에만 1이라 부하 때 놓치므로,
    // 스크롤 중 붙는 opacity-100 클래스를 보고, 놓치면 다시 스크롤해 확인한다
    const thumb = page.locator(PAGE_THUMB).first();
    await expect(async () => {
      await page.mouse.wheel(0, WHEEL_STEP_PX);
      await expect(thumb).toHaveClass(/(^|\s)opacity-100(\s|$)/, { timeout: THUMB_SHOW_TIMEOUT_MS });
    }).toPass({ timeout: THUMB_RETRY_TIMEOUT_MS });

    await page.evaluate(() => window.scrollTo(0, 0));
    await info.attach(`${width}px`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    expect(errors, "콘솔 오류").toEqual([]);
  });
}
