import { expect, test, type Locator, type Page } from "@playwright/test";

// 이슈 #26(3-3) 푸터 개편 실측. 기준 화면 폭(360·768·1080·1440)
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
const MD = 768;
const LG = 1080;
const XL = 1440;
const TEST_TIMEOUT_MS = 60_000; // 데이터 대기(최대 30초) 뒤에 Tab 을 여러 번 누르는 테스트가 있어 기본(30초)보다 길게
const DATA_TIMEOUT_MS = 30_000; // 위 영역 데이터가 다 들어오기를 기다리는 시간
const ANCHOR_TIMEOUT_MS = 5_000; // 블록 기준 요소(고지 문구·제목·©)를 찾는 시간. 없으면 테스트 시간 초과까지 기다리지 않고 바로 실패
const TOLERANCE_PX = 1;
const SUBPIXEL_PX = 0.5; // 소수점 배치 오차
const MIN_TARGET_SPACING_PX = 24; // WCAG 2.5.8 최소 대상 크기(24 CSS px)
const EXTRA_TABS = 10; // 푸터에 들어가기 전·안에서 링크가 아닌 포커스 대상을 지나갈 여유 Tab 수
// 폭 단계별 기대값: [기본, md, lg, xl]
const FOOTER_COLS = [1, 2, 3, 3]; // 소개·고지 / 출처 / 만든 사람 블록이 놓이는 열 수
const SOURCE_LIST_COLS = [1, 1, 2, 2]; // 출처 목록 열 수

// 선택자 계약: 출처·만든 사람 블록은 제목(heading, 수준 무관) 글자로, 소개·고지 블록은 고지 문구로 찾는다
const SOURCES_TITLE = "데이터 출처";
const AUTHOR_TITLE = "만든 사람";
const FAQ_TITLE = "자주 묻는 질문"; // 푸터 바로 위 섹션
// 개인 작업물 고지(Q8 확정 문구). 두 문장 사이를 줄바꿈·다른 요소로 나눠도 됨
const NOTICE = [
  "개인이 만든 비영리 실험 프로젝트입니다.",
  "정부·공공기관·언론사와 관련이 없으며, 정부·민방위·외교부의 공식 경보와 안내가 항상 우선합니다.",
];
const AUTHOR_NAME = "KimJunpyo";
const AUTHOR_LINKS = [
  { name: "GitHub", href: "https://github.com/KimJunpyo" },
  { name: "LinkedIn", href: "https://www.linkedin.com/in/%EC%A4%80%ED%91%9C-%EA%B9%80-0bab72265/" },
];
const COPYRIGHT = /©\s*\d{4}\s*KimJunpyo/; // 하단 바. 연도는 빌드 연도 또는 상수
const DATA_RIGHTS = "데이터 저작권은 각 출처에 있습니다.";
// 이슈 표 12개 출처의 이름 키워드(출처 링크 하나에 하나씩). tests/test_m7_footer.py SOURCE_KEYWORDS 와 같은 목록
const SOURCE_KEYWORDS = [
  /GDELT 1\.0/, /GDELT 2\.0/, /UCDP/, /국무부/, /FCDO/, /외교부.*여행경보/,
  /재외공관/, /영사콜센터/, /대피시설/, /Google News/, /국민재난안전포털/, /world-atlas/,
];
const MIN_LINKS = SOURCE_KEYWORDS.length + AUTHOR_LINKS.length;
const NOREFERRER = /(^|\s)noreferrer(\s|$)/;
const EXTERNAL = /^https:\/\//;
const TRANSPARENT = /^transparent$|^rgba\([^)]*,\s*0\)$|\/\s*0\)$/; // 계산된 색이 완전 투명
const BLOCK_NAMES = ["소개·고지", "출처", "만든 사람"];

const step = (w: number) => (w >= XL ? 3 : w >= LG ? 2 : w >= MD ? 1 : 0);
const near = (a: number, b: number) => Math.abs(a - b);

const footerOf = (page: Page) => page.locator("footer");
const heading = (scope: Page | Locator, name: string) => scope.getByRole("heading", { name, exact: true });
/** 출처·만든 사람 블록: 제목에서 링크까지 품은 가장 가까운 조상.
 *  getByRole("region") 아래 요소에 evaluateAll 을 쓰면 Firefox 페이지가 죽어서(Playwright 1.65) 제목으로 찾는다 */
const blockOf = (footer: Locator, title: string) => heading(footer, title).locator("xpath=ancestor::*[.//a][1]");

/** 등장 애니메이션(fade-up 등 유한 반복)이 끝날 때까지 기다린다. 무한 반복(ping·blink)은 제외 */
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations()
  .filter((a) => a.effect?.getTiming().iterations !== Infinity)
  .map((a) => a.finished.catch(() => null))));

/** 링크 밖 글자만(링크 글자 "github.com/KimJunpyo" 같은 것은 표시 이름으로 치지 않음) */
const textOutsideLinks = (l: Locator) => l.evaluate((el) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.parentElement?.closest("a")) parts.push(n.textContent ?? "");
  }
  return parts.join("");
});

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto("/");
  await page.locator("main").waitFor();
  // 위 영역 데이터가 다 들어와 "불러오는 중"이 사라지고, 잴 푸터 요소가 보일 때까지
  await expect(page.getByText("불러오는 중")).toHaveCount(0, { timeout: DATA_TIMEOUT_MS });
  const footer = footerOf(page);
  await expect(footer, "푸터는 하나").toHaveCount(1);
  await expect(heading(footer, SOURCES_TITLE)).toBeVisible();
  await expect(heading(footer, AUTHOR_TITLE)).toBeVisible();
  await expect(blockOf(footer, SOURCES_TITLE).getByRole("link").first()).toBeVisible();
  await settle(page);
  return footer;
}

/** 블록 상자 등을 evaluate 한 번으로 잰다(따로 재면 그 사이 위 영역이 다시 그려져 푸터가 밀릴 수 있음).
 *  기준 요소 = 고지 문구·출처 제목·만든 사람 제목, 하단 바는 저작권 문구(©).
 *  블록 = 제 기준 요소를 품고 다른 기준 요소는 품지 않는 가장 바깥 조상
 *  (소개·만든 사람을 왼쪽 열 래퍼로 묶어도 래퍼가 아니라 각 블록을 잰다) */
async function measure(page: Page) {
  const f = footerOf(page);
  const handles = await Promise.all([
    f.getByText(NOTICE[0]),
    heading(f, SOURCES_TITLE),
    heading(f, AUTHOR_TITLE),
    f.getByText(COPYRIGHT),
    heading(page, FAQ_TITLE),
  ].map((l) => l.elementHandle({ timeout: ANCHOR_TIMEOUT_MS })));
  return page.evaluate(([notice, sources, author, copyright, faq]) => {
    const own = (e: Element, others: Element[]) => {
      let b = e;
      while (b.parentElement && !others.some((o) => b.parentElement!.contains(o))) b = b.parentElement;
      return b;
    };
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, right: r.right, bottom: r.bottom };
    };
    /** border·padding 안쪽 가로 범위 */
    const inner = (e: Element) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return {
        x: r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft),
        right: r.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight),
      };
    };
    const anchors = [notice, sources, author];
    const blocks = anchors.map((e) => own(e, anchors.filter((o) => o !== e)));
    const footer = notice.closest("footer")!;
    const s = getComputedStyle(footer);
    return {
      blocks: blocks.map(box),
      bar: box(own(copyright, anchors)),
      footer: inner(footer),
      main: inner(document.querySelector("main")!),
      footerTop: footer.getBoundingClientRect().top,
      faqBottom: (faq.closest("section") ?? faq).getBoundingClientRect().bottom,
      border: { width: parseFloat(s.borderTopWidth), style: s.borderTopStyle, color: s.borderTopColor },
      sourceLefts: [...blocks[1].querySelectorAll("a[href]")].map((a) => Math.round(a.getBoundingClientRect().left)),
    };
  }, handles);
}

// 측정 단언은 expect.soft 라 한 번 실행으로 어긋난 조건을 모두 보여 준다(요소가 있는지 같은 전제만 바로 멈춤)
test.describe.configure({ timeout: TEST_TIMEOUT_MS });

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test("내용: 고지 문구·출처 링크 12개·만든 사람 링크, 모두 새 탭·noreferrer", async ({ page }) => {
      const footer = await open(page, width);
      for (const s of NOTICE) await expect.soft(footer, "개인 작업물 고지").toContainText(s, { useInnerText: true });
      await expect.soft(footer, "하단 바 저작권").toContainText(COPYRIGHT);
      await expect.soft(footer, "하단 바 데이터 저작권").toContainText(DATA_RIGHTS, { useInnerText: true });

      const sources = blockOf(footer, SOURCES_TITLE);
      const sourceLinks = sources.getByRole("link");
      await expect.soft(sourceLinks, "출처 링크 수").toHaveCount(SOURCE_KEYWORDS.length);
      for (const k of SOURCE_KEYWORDS) {
        await expect.soft(sources.getByRole("link", { name: k }), `출처 링크 ${k}`).toHaveCount(1);
      }

      const author = blockOf(footer, AUTHOR_TITLE);
      expect.soft(await textOutsideLinks(author), "만든 사람 표시 이름(링크 밖 글자)").toContain(AUTHOR_NAME);
      for (const l of AUTHOR_LINKS) await expect.soft(author.locator(`a[href="${l.href}"]`), l.name).toHaveCount(1);

      // 푸터 링크는 모두 새 탭·noreferrer(출처·GitHub·LinkedIn 포함)
      for (const a of await footer.getByRole("link").all()) {
        const label = (await a.textContent())?.trim();
        await expect.soft(a, `${label} 새 탭`).toHaveAttribute("target", "_blank");
        await expect.soft(a, `${label} rel`).toHaveAttribute("rel", NOREFERRER);
        await expect.soft(a, `${label} 주소`).toHaveAttribute("href", EXTERNAL);
      }
    });

    test("배치: 맨 아래·구분선·컨테이너 폭, 블록 열 수·순서, 출처 목록 열 수, 하단 바 전체 폭", async ({ page }) => {
      await open(page, width);
      const m = await measure(page);
      const [intro, sources, author] = m.blocks;

      expect.soft(m.footerTop, "푸터가 FAQ 아래(맨 아래)").toBeGreaterThanOrEqual(m.faqBottom - TOLERANCE_PX);
      expect.soft(m.border.style, "푸터 위 구분선(border-top)").not.toBe("none");
      expect.soft(m.border.width, "구분선 두께").toBeGreaterThan(0);
      expect.soft(m.border.color, "구분선 색").not.toMatch(TRANSPARENT);
      // 페이지 컨테이너(main padding 안쪽) 폭을 따른다
      expect.soft(near(m.footer.x, m.main.x), "푸터 내용 왼쪽 끝 = 본문 왼쪽").toBeLessThanOrEqual(TOLERANCE_PX);
      expect.soft(near(m.footer.right, m.main.right), "푸터 내용 오른쪽 끝 = 본문 오른쪽").toBeLessThanOrEqual(TOLERANCE_PX);

      const cols = FOOTER_COLS[step(width)];
      if (cols === 1) {
        // 세로 쌓기: 소개·고지 → 출처 → 만든 사람(→ 하단 바는 아래 공통 검사), 모두 푸터 왼쪽 끝에서 시작
        m.blocks.forEach((b, i) => {
          expect.soft(near(b.x, m.footer.x), `${BLOCK_NAMES[i]} 왼쪽 끝`).toBeLessThanOrEqual(TOLERANCE_PX);
          if (i > 0) {
            expect.soft(b.y, `${BLOCK_NAMES[i]}이(가) ${BLOCK_NAMES[i - 1]} 아래`)
              .toBeGreaterThanOrEqual(m.blocks[i - 1].bottom - TOLERANCE_PX);
          }
        });
      } else if (cols === 2) {
        // 왼쪽 열: 소개·고지 위, 만든 사람 아래. 오른쪽 열: 출처(위 끝 맞춤)
        expect.soft(near(intro.x, m.footer.x), "소개·고지 왼쪽 끝").toBeLessThanOrEqual(TOLERANCE_PX);
        expect.soft(near(author.x, intro.x), "만든 사람이 소개·고지와 같은 왼쪽 열").toBeLessThanOrEqual(TOLERANCE_PX);
        expect.soft(author.y, "만든 사람이 소개·고지 아래").toBeGreaterThanOrEqual(intro.bottom - TOLERANCE_PX);
        expect.soft(sources.x, "출처가 오른쪽 열").toBeGreaterThanOrEqual(Math.max(intro.right, author.right) - TOLERANCE_PX);
        expect.soft(near(sources.y, intro.y), "출처 top = 소개·고지 top").toBeLessThanOrEqual(TOLERANCE_PX);
      } else {
        // 소개·고지 / 출처 / 만든 사람이 한 줄에 왼쪽부터
        expect.soft(near(intro.x, m.footer.x), "소개·고지 왼쪽 끝").toBeLessThanOrEqual(TOLERANCE_PX);
        expect.soft(sources.x, "출처가 소개·고지 오른쪽").toBeGreaterThanOrEqual(intro.right - TOLERANCE_PX);
        expect.soft(author.x, "만든 사람이 출처 오른쪽").toBeGreaterThanOrEqual(sources.right - TOLERANCE_PX);
        for (const [label, b] of [["출처", sources], ["만든 사람", author]] as const) {
          expect.soft(near(b.y, intro.y), `${label} top = 소개·고지 top`).toBeLessThanOrEqual(TOLERANCE_PX);
        }
      }
      // 하단 바: 세 블록 아래, 푸터 전체 폭
      expect.soft(m.bar.y, "하단 바가 세 블록 아래").toBeGreaterThanOrEqual(Math.max(...m.blocks.map((b) => b.bottom)) - TOLERANCE_PX);
      expect.soft(near(m.bar.x, m.footer.x), "하단 바 왼쪽 끝").toBeLessThanOrEqual(TOLERANCE_PX);
      expect.soft(near(m.bar.right, m.footer.right), "하단 바 오른쪽 끝").toBeLessThanOrEqual(TOLERANCE_PX);
      expect.soft(new Set(m.sourceLefts).size, "출처 목록 열 수").toBe(SOURCE_LIST_COLS[step(width)]);
    });

    test("키보드: Tab 으로 푸터 링크를 순서대로 지나고 포커스 표시가 보임", async ({ page, browserName }) => {
      // WebKit 은 Safari 기본 설정처럼 Tab 이 링크를 건너뛴다(Windows 빌드는 Alt+Tab 도 같음, 이슈 #26 작업 때 확인)
      test.skip(browserName === "webkit", "WebKit 은 Tab 으로 링크에 포커스하지 않음");
      const footer = await open(page, width);
      const total = await footer.locator("a[href]").filter({ visible: true }).count();
      expect(total, "푸터 링크(출처 + GitHub·LinkedIn)").toBeGreaterThanOrEqual(MIN_LINKS);
      // 시작점: 문서 순서로 푸터 바로 앞의 포커스 가능한 요소(지금은 FAQ 마지막 질문)
      const before = await page.evaluate(() => {
        const f = document.querySelector("footer")!;
        const els = [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]")]
          .filter((e) => e.tabIndex >= 0 && e.getClientRects().length > 0 && e.compareDocumentPosition(f) & Node.DOCUMENT_POSITION_FOLLOWING);
        els.at(-1)?.focus();
        return els.length;
      });
      expect(before, "푸터 앞 포커스 가능한 요소").toBeGreaterThan(0);

      const visited: { index: number; name: string; top: number; ring: boolean }[] = [];
      for (let i = 0; i < total + EXTRA_TABS; i++) {
        await page.keyboard.press("Tab");
        const s = await page.evaluate((transparent) => {
          const f = document.querySelector("footer")!;
          const a = document.activeElement;
          if (!a || !f.contains(a)) return null;
          const links = [...f.querySelectorAll("a[href]")].filter((e) => e.getClientRects().length > 0);
          const st = getComputedStyle(a);
          const outline = st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0 && !new RegExp(transparent).test(st.outlineColor);
          return {
            index: links.indexOf(a),
            name: (a.textContent ?? "").trim(),
            top: a.getBoundingClientRect().top + window.scrollY, // Tab 이 페이지를 스크롤하므로 문서 좌표
            ring: outline || st.boxShadow !== "none", // 포커스 표시: 보이는 outline 또는 box-shadow(Tailwind ring)
          };
        }, TRANSPARENT.source);
        if (!s) {
          if (visited.length) break; // 푸터를 벗어남
          continue; // 아직 푸터 앞
        }
        if (s.index >= 0) visited.push(s); // 링크 아닌 포커스 대상은 건너뜀
      }
      expect(visited.map((v) => v.index), "Tab 으로 지난 푸터 링크(문서 순서 번호)").toEqual([...Array(total).keys()]);
      expect.soft(visited.filter((v) => !v.ring).map((v) => v.name), "포커스 표시가 없는 링크").toEqual([]);
      if (width < MD) {
        // 1열: 화면에서도 위에서 아래로 움직인다(CSS order 등으로 문서 순서와 화면 순서가 어긋나지 않음)
        const upward = visited.slice(1).filter((v, i) => v.top < visited[i].top - TOLERANCE_PX).map((v) => v.name);
        expect.soft(upward, "앞 링크보다 위로 올라간 링크").toEqual([]);
      }
    });

    test("가로 넘침 없음·콘솔 오류 0건", async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await open(page, width);
      const m = await page.evaluate(() => {
        const f = document.querySelector("footer")!;
        return { scroll: document.documentElement.scrollWidth, inner: window.innerWidth, footer: [f.scrollWidth, f.clientWidth] };
      });
      expect.soft(m.scroll, "페이지 가로 넘침").toBeLessThanOrEqual(m.inner);
      expect.soft(m.footer[0], "푸터 가로 넘침").toBeLessThanOrEqual(m.footer[1]);
      expect.soft(errors, "콘솔 오류").toEqual([]);
    });

    if (width < MD) {
      test("터치 대상: 위아래로 이웃한 푸터 링크의 세로 간격 24px 이상", async ({ page }) => {
        const footer = await open(page, width);
        // 간격 = 위아래로 놓인(가로 범위가 겹치는) 두 링크의 세로 중심 간 거리.
        //   WCAG 2.5.8 간격 예외: 링크마다 중심에 지름 24px 원을 놓았을 때 위아래 원이 겹치지 않으려면 중심 간 거리 24px 이상.
        //   높이가 같은 링크끼리는 "링크 높이 + 사이 간격"과 같다. 같은 줄에 나란한 링크(가로 범위가 안 겹침)는 대상이 아니다
        const links = await footer.getByRole("link").evaluateAll((els) => els.map((e) => {
          const r = e.getBoundingClientRect();
          return { name: (e.textContent ?? "").trim(), x: r.left, right: r.right, cy: r.top + r.height / 2 };
        }));
        expect(links.length, "푸터 링크(출처 + GitHub·LinkedIn)").toBeGreaterThanOrEqual(MIN_LINKS);
        const stacked = links.flatMap((a, i) => links.slice(i + 1)
          .filter((b) => a.x < b.right && b.x < a.right)
          .map((b) => ({ pair: `${a.name} ↔ ${b.name}`, gap: Math.abs(a.cy - b.cy) })));
        expect(stacked.length, "위아래로 놓인 링크 쌍이 있어야 검사가 의미 있음").toBeGreaterThan(0);
        const close = stacked.filter((p) => p.gap < MIN_TARGET_SPACING_PX - SUBPIXEL_PX).map((p) => `${p.pair}: ${p.gap.toFixed(1)}px`);
        expect(close, "세로 중심 간 거리가 24px 미만인 링크 쌍").toEqual([]);
      });
    }
  });
}
