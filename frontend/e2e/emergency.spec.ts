import { expect, test, type Locator, type Page } from "@playwright/test";
import { ALERT_SOURCES, CIVIL_ALERTS } from "../src/entities/guide/model/alerts";
import { API_BASE_URL, SITE_URL } from "../src/shared/config/env";

// 이슈 #74(1-4) /emergency 비상 대비 안내(경보 5종)와 홈 헤더 진입 링크 실측. 기준 화면 폭(360·768·1080·1440)
// 경보 내용은 이슈 #72 모델(CIVIL_ALERTS·ALERT_SOURCES)과 비교한다. 소스 쪽 계약(토큰 색만·서버 컴포넌트·sitemap.ts)은
// tests/test_m13_emergency.py, 명도 대비는 contrast.spec.ts 의 "비상 대비 페이지 기본" 상태
//
// 화면 선택자 계약 (구현은 이 계약을 따른다)
// - 경로 /emergency, 내용은 <main> 안. <title> 에 "비상 대비", canonical 은 /emergency(절대 주소면 경로가 /emergency)
// - 공유 미리보기(이슈 #98): og:url 경로가 /emergency, og·twitter 제목은 h1 글자, 설명은 description 과 같다.
//   루트 값(og:site_name·locale·type, 파일 기반 og:image /opengraph-image)은 그대로 붙는다. 푸터(SiteFooter)는 HTML 에 있다
// - 머리말: h1(페이지에 하나) "비상 대비 안내", 접근 이름에 "전체 지도"가 든 링크 하나(글자 "← 전체 지도", href="/"),
//   고지 문구 NOTICE(문장 사이를 줄바꿈·다른 요소로 나눠도 됨)
// - 목차: 접근 이름 "목차"인 navigation. 경보 링크 5개가 CIVIL_ALERTS 순서로 href="#<경보 id>", 글자는 경보 이름 그대로.
//   목차 링크는 모두 이 페이지 안 앵커(대상 id 가 페이지에 있음)
// - 경보 카드: id="<경보 id>"인 요소 5개가 문서에 CIVIL_ALERTS 순서로 있고, 카드 내용은 모두 그 요소 안에 있다
//   - 제목: 접근 이름이 경보 이름(name)인 heading
//     제목 아이콘(이슈 #100): 카드 안 h3 하나, 그 안에 svg 하나(aria-hidden="true"). svg 의 계산된 stroke 가 h3 의 color 와
//     같다(stroke="currentColor"로 경보 토큰 색을 따름). 아이콘을 넣어도 h3 접근 이름은 경보 이름 그대로.
//     소스 쪽(lucide ISC 고지·"use client" 없음)은 tests/test_m17_icons.py
//   - when·signal 글자
//   - 할 일: 카드 안 ol 하나. 바로 아래 li 가 actions 순서대로 글자(text) 그대로라 li 수 = actions 수.
//     번호는 목록 표시로 그린다(li 가 display: list-item, list-style-type 이 none 아님. 글자에 번호를 넣지 않음)
//   - 출처: sources 의 키마다 a[href=ALERT_SOURCES[키].url] 하나(target="_blank", rel 에 noreferrer),
//     출처 이름(name)과 확인일(checkedAt 글자 그대로, YYYY-MM-DD)
//   - 열 수: 360·768 1열, 1080·1440 2열(카드 left 위치 수)
// - 정적 페이지: 브라우저가 API 주소로 요청하지 않는다. 자바스크립트 실행 전 HTML(<script> 밖 body)에 경보 이름 5개와
//   safekorea.go.kr 출처 링크(href)가 있다
// - 홈 헤더(main 의 첫 header) 제목 줄에 접근 이름이 정확히 "비상 대비"인 링크 하나, href="/emergency".
//   제목(h1)·LiveBadge·가이드 버튼과 같은 줄, 링크 글자도 한 줄, 헤더 내용 폭 안, 높이 24px 이상.
//   좁은 폭에서는 아이콘만 보여도 된다(접근 이름은 모든 폭에서 같음)
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
const MD = 768;
const LG = 1080;
const XL = 1440;
const TEST_TIMEOUT_MS = 60_000; // 홈 데이터 대기(최대 30초) 뒤 /emergency 로 이동하는 테스트가 있어 기본(30초)보다 길게
const DATA_TIMEOUT_MS = 30_000; // 홈 헤더 LiveBadge 가 그려지기를 기다리는 시간
const NAV_TIMEOUT_MS = 30_000; // 링크를 눌러 /emergency 로 가기를 기다리는 시간(개발 서버 첫 컴파일 포함)
const SAME_LINE_PX = 8; // 한 줄로 보는 top 차이(top-sections.spec.ts 와 같음)
const SUBPIXEL_PX = 0.5; // 소수점 배치 오차
const MIN_TARGET_PX = 24; // WCAG 2.5.8 최소 대상 크기(24 CSS px)
const CARD_COLS = [1, 1, 2, 2]; // 폭 단계별 경보 카드 열 수: [기본, md, lg, xl]

const PATH = "/emergency";
const TITLE_TEXT = "비상 대비"; // <title> 에 들어갈 글자
const H1 = "비상 대비 안내";
const HOME_LINK = "← 전체 지도";
const NOTICE = "개인이 만든 참고용 안내입니다. 정부·민방위의 공식 경보와 안내가 항상 우선합니다.";
const TOC_NAME = "목차";
const ENTRY_NAME = "비상 대비"; // 홈 헤더 링크 접근 이름
const GUIDE_NAME = "가이드 · 여행경보 단계";
const SOURCE_HREF = 'href="https://safekorea.go.kr/'; // HTML 속성 글자 그대로
const NOREFERRER = /(^|\s)noreferrer(\s|$)/;
const SCRIPT = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const CARDS = CIVIL_ALERTS.map((a) => `[id="${a.id}"]`).join(", "); // 문서 순서로 잡힌다

// LiveBadge 상태 고정: /api/live 응답의 as_of 를 지금보다 agoMs 이전 슬롯으로 바꾼다(45분이 넘으면 지연).
// 배지 글자가 상태마다 달라 신선 상태와 글자가 가장 긴 지연 상태를 본다
const LIVE_API = "**/api/live";
const SLOT_FORMAT = "YYYYMMDDHHmmss"; // GDELT 2.0 슬롯 키(UTC)
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const LIVE_STATES = [
  { name: "신선 5분 전", agoMs: 5 * MINUTE_MS },
  { name: "지연 12시간 전", agoMs: 12 * HOUR_MS },
];

const step = (w: number) => (w >= XL ? 3 : w >= LG ? 2 : w >= MD ? 1 : 0);
/** API 주소로 가는 요청. 개발 서버의 환경 변수가 테스트와 달라도 잡히게 경로(/api/)로도 본다 */
const isApi = (url: string) => url.startsWith(API_BASE_URL) || new URL(url).pathname.startsWith("/api/");
/** 경보 카드: id 가 경보 id 인 요소 */
const cardOf = (page: Page, id: string) => page.locator(`[id="${id}"]`);
/** <meta property|name="key"> 의 content */
const metaOf = (markup: string, key: string) =>
  markup.match(new RegExp(`<meta\\b[^>]*\\b(?:property|name)="${key}"[^>]*>`))?.[0].match(/\bcontent="([^"]*)"/)?.[1];

async function box(l: Locator) {
  const b = await l.boundingBox();
  expect(b, "요소가 화면에 없음").not.toBeNull();
  return { ...b!, bottom: b!.y + b!.height, right: b!.x + b!.width };
}

/** 자식 요소들의 서로 다른 left 위치 개수 = 열 수 */
async function columns(items: Locator): Promise<number> {
  const lefts = await items.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  return new Set(lefts).size;
}

/** 요소 안 보이는 글자가 두 줄 이상인지(글자 조각 top 이 tol 넘게 벌어짐). sr-only(1px 상자) 안 글자는 뺀다 */
const textWraps = (l: Locator) => l.evaluate((el, tol) => {
  const tops: number[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement!.getBoundingClientRect();
    if (parent.width <= 1 || parent.height <= 1) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    tops.push(...[...range.getClientRects()].map((r) => r.top));
  }
  return tops.length > 0 && Math.max(...tops) - Math.min(...tops) > tol;
}, SAME_LINE_PX);

/** 등장 애니메이션(fade-up 등 유한 반복)이 끝날 때까지 기다린다. 무한 반복(blink·ping)은 제외 */
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations()
  .filter((a) => a.effect?.getTiming().iterations !== Infinity)
  .map((a) => a.finished.catch(() => null))));

/** 지금보다 agoMs 이전의 슬롯 키(SLOT_FORMAT). LiveBadge slotToIso 의 역 */
const slotKey = (agoMs: number) =>
  new Date(Date.now() - agoMs).toISOString().replace(/\D/g, "").slice(0, SLOT_FORMAT.length);

/** /api/live 의 as_of 만 바꿔 배지 상태를 고정한다(top-sections.spec.ts 와 같음) */
async function fixLiveAsOf(page: Page, agoMs: number) {
  await page.route(LIVE_API, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), as_of: slotKey(agoMs) } });
  });
}

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto(PATH);
  await page.locator("main").waitFor();
}

// 내용 단언은 expect.soft 라 한 번 실행으로 어긋난 조건을 모두 보여 준다(요소가 있는지 같은 전제만 바로 멈춤)
test.describe.configure({ timeout: TEST_TIMEOUT_MS });

test("자바스크립트 실행 전 HTML: 경보 이름 5개·safekorea.go.kr 출처 링크, <title>·canonical·공유 미리보기·푸터", async ({ request }) => {
  const res = await request.get(PATH);
  expect(res.status(), `${PATH} 응답`).toBe(200);
  // RSC 데이터(<script>)에만 있는 글자는 자바스크립트가 돌아야 보이므로 뺀다. 경보 이름은 head(메타데이터) 말고 body 에서 찾는다
  const markup = (await res.text()).replace(SCRIPT, "");
  const body = markup.slice(markup.indexOf("<body"));
  for (const a of CIVIL_ALERTS) expect.soft(body, `경보 이름 ${a.name}`).toContain(a.name);
  expect.soft(body, "safekorea.go.kr 출처 링크").toContain(SOURCE_HREF);

  expect.soft(markup.match(/<title>([^<]*)<\/title>/)?.[1], "<title>").toContain(TITLE_TEXT);
  const canonical = markup.match(/<link\b[^>]*\brel="canonical"[^>]*>/)?.[0].match(/\bhref="([^"]*)"/)?.[1];
  expect.soft(canonical && new URL(canonical, SITE_URL).pathname, `canonical(${canonical})`).toBe(PATH);

  // 공유 미리보기: 루트 값을 물려받아 홈 주소·제목·설명이 나오지 않게, 루트의 사이트 이름·이미지는 빠지지 않게
  const ogUrl = metaOf(markup, "og:url");
  expect.soft(ogUrl && new URL(ogUrl, SITE_URL).pathname, `og:url(${ogUrl})`).toBe(PATH);
  for (const key of ["description", "og:site_name", "og:locale", "og:type"]) expect.soft(metaOf(markup, key), key).toBeTruthy();
  for (const p of ["og", "twitter"]) {
    expect.soft(metaOf(markup, `${p}:title`), `${p}:title`).toBe(H1);
    expect.soft(metaOf(markup, `${p}:description`), `${p}:description`).toBe(metaOf(markup, "description"));
  }
  expect.soft(metaOf(markup, "og:image"), "og:image(루트 파일 기반 이미지)").toMatch(/\/opengraph-image(?![\w-])/);
  expect.soft(body, "푸터(SiteFooter)").toMatch(/<footer\b/);
});

test("sitemap.xml 에 <SITE_URL>/emergency", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status(), "sitemap.xml 응답").toBe(200);
  expect(await res.text()).toContain(`<loc>${SITE_URL}${PATH}</loc>`);
});

test("머리말·목차·경보 카드: CIVIL_ALERTS 순서, 할 일 항목 수 = actions 수, 출처 새 탭·noreferrer·확인일", async ({ page }) => {
  await page.goto(PATH);
  const main = page.locator("main");
  await main.waitFor();
  await expect(page.getByRole("heading", { level: 1 }), "h1").toHaveText(H1);
  const home = page.getByRole("link", { name: /전체 지도/ });
  await expect.soft(home, "전체 지도 링크 글자").toHaveText(HOME_LINK);
  await expect.soft(home, "전체 지도 링크 주소").toHaveAttribute("href", "/");
  await expect.soft(main, "고지 문구").toContainText(NOTICE, { useInnerText: true });

  const toc = page.getByRole("navigation", { name: TOC_NAME, exact: true });
  await expect(toc, "목차").toBeVisible();
  await expect.soft(toc.locator(CIVIL_ALERTS.map((a) => `a[href="#${a.id}"]`).join(", ")), "목차 경보 링크(순서·글자)")
    .toHaveText(CIVIL_ALERTS.map((a) => a.name));
  // 지금 있는 영역만 앵커로 건다
  for (const link of await toc.getByRole("link").all()) {
    const href = (await link.getAttribute("href")) ?? "";
    expect.soft(href, "목차 링크는 이 페이지 안 앵커").toMatch(/^#./);
    await expect.soft(page.locator(`[id="${href.slice(1)}"]`), `목차 ${href} 의 대상`).toHaveCount(1);
  }

  const order = await page.locator(CARDS).evaluateAll((els) => els.map((e) => e.id));
  expect(order, "경보 카드 순서(id)").toEqual(CIVIL_ALERTS.map((a) => a.id));
  for (const a of CIVIL_ALERTS) {
    const card = cardOf(page, a.id);
    await expect.soft(card.getByRole("heading", { name: a.name, exact: true }), `${a.id} 제목`).toBeVisible();
    await expect.soft(card, `${a.id} 언제`).toContainText(a.when, { useInnerText: true });
    await expect.soft(card, `${a.id} 어떻게 알리나`).toContainText(a.signal, { useInnerText: true });

    const todo = card.locator("ol");
    await expect(todo, `${a.id} 할 일 번호 목록(ol)`).toHaveCount(1);
    const items = todo.locator(":scope > li");
    await expect.soft(items, `${a.id} 할 일 항목 수`).toHaveCount(a.actions.length);
    await expect.soft(items, `${a.id} 할 일 순서·글자`).toHaveText(a.actions.map((x) => x.text));
    const unnumbered = await items.evaluateAll((els) => els.filter((e) => {
      const s = getComputedStyle(e);
      return s.display !== "list-item" || s.listStyleType === "none";
    }).length);
    expect.soft(unnumbered, `${a.id} 번호가 안 보이는 할 일 항목`).toBe(0);

    for (const key of a.sources) {
      const s = ALERT_SOURCES[key];
      const link = card.locator(`a[href="${s.url}"]`);
      await expect.soft(link, `${a.id} 출처 ${key} 링크`).toHaveCount(1);
      await expect.soft(link, `${a.id} 출처 ${key} 새 탭`).toHaveAttribute("target", "_blank");
      await expect.soft(link, `${a.id} 출처 ${key} rel`).toHaveAttribute("rel", NOREFERRER);
      await expect.soft(card, `${a.id} 출처 ${key} 이름`).toContainText(s.name, { useInnerText: true });
      await expect.soft(card, `${a.id} 출처 ${key} 확인일`).toContainText(s.checkedAt);
    }
  }
});

test("경보 카드 제목 아이콘: h3 마다 svg 하나·aria-hidden, 선 색 = 제목 글자 색, 접근 이름은 경보 이름 그대로", async ({ page }) => {
  await page.goto(PATH);
  await page.locator("main").waitFor();
  for (const a of CIVIL_ALERTS) {
    // 이름이 아니라 수준(h3)으로 찾아야 접근 이름을 따로 볼 수 있다
    const title = cardOf(page, a.id).getByRole("heading", { level: 3 });
    await expect(title, `${a.id} 제목(h3)`).toHaveCount(1);
    await expect.soft(title, `${a.id} 제목 접근 이름`).toHaveAccessibleName(a.name);
    const icon = title.locator("svg");
    await expect(icon, `${a.id} 제목 안 svg 수`).toHaveCount(1);
    await expect.soft(icon, `${a.id} 아이콘 aria-hidden`).toHaveAttribute("aria-hidden", "true");
    // stroke 가 currentColor 면 Firefox·WebKit 모두 계산값을 color 와 같은 글자로 돌려준다
    const c = await title.evaluate((h) => ({
      color: getComputedStyle(h).color,
      stroke: getComputedStyle(h.querySelector("svg")!).stroke,
    }));
    expect.soft(c.stroke, `${a.id} 아이콘 선 색(제목 글자 ${c.color})`).toBe(c.color);
  }
});

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test("가로 넘침 없음·경보 카드 열 수·콘솔 오류(하이드레이션 포함) 0건·API 요청 0건", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));
      const api: string[] = [];
      page.on("request", (r) => {
        if (isApi(r.url())) api.push(r.url());
      });
      await open(page, width);
      // 페이지 자체에는 하이드레이션 끝을 알리는 요소가 없어, 네트워크가 잠잠해질 때(하이드레이션·늦은 요청 뒤)까지 기다린다
      await page.waitForLoadState("networkidle");

      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect.soft(m.scrollWidth, "가로 넘침").toBeLessThanOrEqual(m.innerWidth);
      const cards = page.locator(CARDS);
      await expect(cards, "경보 카드 수").toHaveCount(CIVIL_ALERTS.length);
      expect.soft(await columns(cards), "경보 카드 열 수").toBe(CARD_COLS[step(width)]);
      expect.soft(errors, "콘솔 오류").toEqual([]);
      expect.soft(api, "API 주소로 보낸 요청").toEqual([]);
    });

    test("목차 링크를 누르면 주소에 #경보 id, 그 카드 제목이 화면 안", async ({ page }) => {
      await open(page, width);
      const toc = page.getByRole("navigation", { name: TOC_NAME, exact: true });
      for (const a of CIVIL_ALERTS) {
        await toc.getByRole("link", { name: a.name, exact: true }).click();
        await expect.soft(page, `${a.name} 주소`).toHaveURL(new RegExp(`#${a.id}$`));
        await expect.soft(cardOf(page, a.id).getByRole("heading", { name: a.name, exact: true }), `${a.name} 카드 제목`)
          .toBeInViewport({ ratio: 1 });
      }
    });

    // 배지 문구 길이가 상태마다 달라 상태별로 본다. lg 이상은 헤더 폭이 넉넉해 신선 상태만(top-sections.spec.ts 와 같음)
    for (const state of width >= LG ? LIVE_STATES.slice(0, 1) : LIVE_STATES) {
      test(`홈 헤더 "비상 대비" 링크(배지 ${state.name}): 제목 줄 한 줄·넘침 없음·높이 24px 이상, 누르면 /emergency`, async ({ page }) => {
        await fixLiveAsOf(page, state.agoMs);
        await page.setViewportSize({ width, height: HEIGHT });
        await page.goto("/");
        const header = page.locator("main header").first();
        const badge = header.locator("span", { hasText: /LIVE|지연/ }).first();
        // 배지까지 나와야 제목 줄이 다 찬 상태
        await expect(badge, "LIVE 배지").toBeVisible({ timeout: DATA_TIMEOUT_MS });
        const link = header.getByRole("link", { name: ENTRY_NAME, exact: true });
        await expect(link, "홈 헤더 비상 대비 링크").toBeVisible();
        await expect.soft(link, "링크 주소").toHaveAttribute("href", PATH);
        await settle(page);

        const names = ["제목", "LiveBadge", "비상 대비 링크", "가이드 버튼"];
        const guide = page.getByRole("button", { name: GUIDE_NAME, exact: true });
        const boxes = await Promise.all([header.getByRole("heading", { level: 1 }), badge, link, guide].map(box));
        const [title, , entry] = boxes;
        const m = await page.evaluate(() => {
          const main = document.querySelector("main")!;
          return {
            contentRight: main.getBoundingClientRect().right - parseFloat(getComputedStyle(main).paddingRight),
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth,
          };
        });
        // 같은 줄: 제목과 세로 범위가 겹친다
        boxes.forEach((b, i) => {
          expect.soft(b.y < title.bottom && title.y < b.bottom, `${names[i]}이(가) 제목과 같은 줄`).toBe(true);
        });
        expect.soft(await textWraps(link), "링크 글자가 두 줄 이상").toBe(false);
        expect.soft(Math.max(...boxes.map((b) => b.right)), `제목 줄 오른쪽 끝(헤더 내용 끝 ${m.contentRight})`)
          .toBeLessThanOrEqual(m.contentRight + SUBPIXEL_PX);
        expect.soft(m.scrollWidth, "페이지 가로 넘침").toBeLessThanOrEqual(m.innerWidth);
        expect.soft(entry.height, "링크 높이").toBeGreaterThanOrEqual(MIN_TARGET_PX);

        await link.click();
        await expect(page, "링크를 누르면 /emergency").toHaveURL(new RegExp(`${PATH}$`), { timeout: NAV_TIMEOUT_MS });
        await expect(page.getByRole("heading", { level: 1, name: H1, exact: true })).toBeVisible();
      });
    }
  });
}
