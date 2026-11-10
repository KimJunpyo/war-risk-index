import { expect, test } from "@playwright/test";

// 기획안 기준 화면 폭(360·768·1080·1440)
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
// PageScrollbar의 페이지 thumb(fixed, aria-hidden)
const PAGE_THUMB = 'div.fixed[aria-hidden="true"]';

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

    // 스크롤하면 페이지 thumb가 보여야 한다
    await page.mouse.wheel(0, 600);
    await expect(page.locator(PAGE_THUMB).first()).toHaveCSS("opacity", "1");

    await page.evaluate(() => window.scrollTo(0, 0));
    await info.attach(`${width}px`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    expect(errors, "콘솔 오류").toEqual([]);
  });
}
