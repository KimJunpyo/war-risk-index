import { expect, test, type Page } from "@playwright/test";

// 이슈 #31(1-1) 보조 글자 명도 대비·#32(1-2) 링크 밑줄 대비 실측. 기준 화면 폭(360·768·1080·1440)마다 상태별로 보이는 글자·밑줄을 모두 잰다.
// 기준(WCAG 2.2 AA 1.4.3): 4.5:1, 큰 글자(24px 이상 또는 18.66px 이상·굵기 700 이상) 3:1, SVG 글자는 크기와 관계없이 4.5:1.
// 밑줄(WCAG 1.4.11): 계산된 text-decoration-line 에 underline 이 있는 요소의 text-decoration-color 와 배경 3:1 이상,
// 같은 요소의 글자 대비 이하(밑줄이 글자보다 튀지 않게). 포인터를 치운 기본 상태만 잰다(hover·focus 색은 재지 않음).
// 재지 않는 것(plan.md 7절 한계): background-image(그라데이션)·조상 opacity·가상 요소 글자·input 값과 placeholder·option,
// aria-hidden·비활성 컨트롤 안쪽. 지도 hover 툴팁은 SVG hover 가 불안정해 앱 브라우저에서 수동 확인(이슈 할 일 5).
// 소스 쪽 계약은 tests/test_m8_contrast.py
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
const TEST_TIMEOUT_MS = 60_000; // 데이터 대기(최대 30초) 뒤에 다른 대상을 골라 다시 기다리는 상태가 있어 기본(30초)보다 길게
const DATA_TIMEOUT_MS = 30_000; // 데이터가 들어와 위젯이 그려지기를 기다리는 시간
const SEOUL = { latitude: 37.5665, longitude: 126.978 }; // 위치로 대피소 찾기용 좌표(서울시청)
const OTHER_TAB = 1; // 고를 국가 쌍 탭(순서). 첫 화면 기본 대상(한국)은 쌍이 아니라 선택된 탭이 없음
const HOME_COUNTRY = "대한민국"; // 첫 화면 기본 대상. 재외공관은 이 나라가 아닐 때만 나옴
const GUIDE_NAME = "가이드 · 여행경보 단계";
const CHART_NAME = "전쟁 가능성 지수 추이";
// 체크리스트 항목 글자: 체크한 것·체크 안 한 것
const CHECKED_ITEM = 'label:has(input[type="checkbox"]:checked) > span';
const UNCHECKED_ITEM = 'label:has(input[type="checkbox"]:not(:checked)) > span';
// 측정 코드 자체 확인: 대비 함수가 plan.md 5-2 표 값을 내는지, Tailwind 색의 계산값(lab()·oklch() 등)을 canvas 가 sRGB 로 읽는지
const SELF_CHECK: { pair: [string, string]; ratio: number }[] = [
  { pair: ["#a1a1a1", "#07090d"], ratio: 7.71 }, // neutral-400 / 페이지 배경
  { pair: ["#737373", "#07090d"], ratio: 4.2 }, // neutral-500 / 페이지 배경
];
const RATIO_TOLERANCE = 0.01;
const NEUTRAL_400 = "#a1a1a1"; // Tailwind 4.3.4 neutral-400(oklch 70.8% 0 0)의 sRGB 8비트
const CHANNEL_TOLERANCE = 1;
const PROBE_ID = "contrast-probe";
const UNDERLINE_MIN = 3; // 밑줄 대비 기준(WCAG 1.4.11 비텍스트)

type Measured = { text: string; fg: string; bg: string; ratio: number; min: number; underline: string; underlineRatio: number };
type State = { name: string; root?: string; act?: (page: Page) => Promise<void> };

/** 브라우저 안에서 실행하는 측정 코드(Chromium 앱 브라우저에서 먼저 검증). Playwright 는 함수 본문만 보내므로 도우미를 모두 안에 둔다.
 *  items: root 아래 보이는 글자 요소 전부, underlines: 보이는 밑줄 요소 전부, picked: 선택자마다 첫 요소, ratios: 색 쌍의 대비(자체 확인용) */
function contrastInPage({ root, picked, pairs }: { root: string; picked: string[]; pairs: [string, string][] }) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  const px = () => Array.from(ctx.getImageData(0, 0, 1, 1).data);
  // 색 문자열(oklch 포함)을 칠해 [r,g,b,a]로 읽음. 못 읽는 값이면 앞의 #000이 남음
  const parse = (c: string) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    return px();
  };
  // 바닥부터 색을 겹쳐 칠한 결과(알파 합성은 canvas가 함)
  const paint = (layers: string[]) => {
    ctx.clearRect(0, 0, 1, 1);
    for (const c of layers) {
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
    }
    return px();
  };
  const lum = ([r, g, b]: number[]) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a: number[], b: number[]) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  // 자기부터 조상으로 올라가며 배경색을 모으고, 불투명한 배경에서 멈춤(background-image 그라데이션은 무시)
  const bgLayers = (el: Element) => {
    const out: string[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const a = parse(c)[3];
      if (a > 0) out.unshift(c);
      if (a === 255) break;
    }
    return out;
  };
  const hex = (c: number[]) => `#${c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const measure = (el: Element): Measured => {
    const cs = getComputedStyle(el);
    const layers = bgLayers(el);
    const bg = paint(layers);
    const svg = el instanceof SVGElement;
    const fg = paint([...layers, svg ? cs.fill : cs.color]);
    const deco = paint([...layers, cs.textDecorationColor]); // 밑줄 색. 지정이 없으면 currentcolor(글자 색)
    const size = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight);
    const min = !svg && (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5; // SVG는 viewBox 배율 때문에 늘 4.5
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
    return { text, fg: hex(fg), bg: hex(bg), ratio: ratio(fg, bg), min, underline: hex(deco), underlineRatio: ratio(deco, bg) };
  };

  const items: Measured[] = [];
  const underlines: Measured[] = [];
  for (const el of document.querySelector(root)?.querySelectorAll("*") ?? []) {
    if (el.closest('[aria-hidden="true"], :disabled, [aria-disabled="true"], option')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    // sr-only·display:none. 접힌 details 안쪽은 Firefox·WebKit 에서 크기가 있어 여기서 빠지지 않는다(펼치지 않아도 잼)
    if (r.width <= 1 || r.height <= 1 || cs.visibility !== "visible") continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()); // 직접 글자가 있는 요소
    const underlined = cs.textDecorationLine.includes("underline"); // 밑줄은 글자가 자식 요소에만 있어도 잰다
    if (!hasText && !underlined) continue;
    const m = measure(el);
    if (hasText) items.push(m);
    if (underlined) underlines.push(m);
  }
  return {
    items,
    underlines,
    picked: picked.map((s) => {
      const el = document.querySelector(s);
      return el && measure(el);
    }),
    ratios: pairs.map(([a, b]) => ratio(parse(a), parse(b))),
  };
}

const audit = (page: Page, root: string, picked: string[] = [], pairs: [string, string][] = []) =>
  page.evaluate(contrastInPage, { root, picked, pairs });

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** 실패 한 줄: 글자 앞 20자 · 글자 색 / 합성한 배경색 · 대비 < 기준 */
const line = (m: Measured) => `${m.text} · ${m.fg} / ${m.bg} · ${m.ratio.toFixed(2)} < ${m.min}`;
/** 밑줄 실패 한 줄: 글자 앞 20자 · 밑줄 색 / 합성한 배경색 · 대비 < 3 */
const underlineLine = (m: Measured) => `${m.text} · ${m.underline} / ${m.bg} · ${m.underlineRatio.toFixed(2)} < ${UNDERLINE_MIN}`;

/** 패널·카드: 제목(heading)에서 가장 가까운 section.
 *  getByRole("region") 아래 요소에 evaluateAll 을 쓰면 Firefox 페이지가 죽어서(Playwright 1.65) 제목으로 찾는다 */
const panel = (page: Page, title: string) =>
  page.getByRole("heading", { name: title, exact: true }).locator("xpath=ancestor::section[1]");

/** 데이터가 다 그려질 때까지: LIVE 배지, 추이·뉴스·위협 사건 패널 내용, "불러오는 중" 없음.
 *  "불러오는 중"이 없어도 아직 비어 있는 위젯이 있어 내용으로 확인한다(body-sections.spec.ts waitPanels) */
async function waitData(page: Page) {
  const badge = page.locator("main header").first().locator("span", { hasText: /LIVE|지연/ }).first();
  await expect(badge, "LIVE 배지(실시간 데이터)").toBeVisible({ timeout: DATA_TIMEOUT_MS });
  await expect(panel(page, "지수 추이").getByRole("img", { name: CHART_NAME, exact: true })).toBeVisible({ timeout: DATA_TIMEOUT_MS });
  await expect(panel(page, "국방 뉴스").getByRole("listitem").first()).toBeVisible({ timeout: DATA_TIMEOUT_MS });
  await expect(panel(page, "⚡ 위협·경고 사건").getByText("최근 90일 하루별 보도량")).toBeVisible({ timeout: DATA_TIMEOUT_MS });
  await expect(page.getByText("불러오는 중")).toHaveCount(0, { timeout: DATA_TIMEOUT_MS });
}

/** 등장 애니메이션(fade-up 등 유한 반복)이 끝날 때까지 기다린다. 무한 반복(ping·blink)은 제외 */
const settle = (page: Page) => page.evaluate(() => Promise.all(document.getAnimations()
  .filter((a) => a.effect?.getTiming().iterations !== Infinity)
  .map((a) => a.finished.catch(() => null))));

const HOME: State = { name: "기본 홈" };
const CHECK_ONE: State = { name: "체크리스트 항목 하나 체크", act: (page) => page.getByRole("checkbox").first().check() };

const STATES: State[] = [
  HOME,
  {
    name: "가이드 모달 열림",
    root: "dialog[open]", // 바깥은 inert 이고 backdrop 에 덮여 모달 안쪽만 잰다
    act: async (page) => {
      await page.getByRole("button", { name: GUIDE_NAME, exact: true }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    // 접힌 내용도 크기가 있어 다른 상태에서 이미 잰다(측정 수가 기본 홈과 같음). 펼친 화면 그대로 한 번 더 잰다
    name: "주목 국가 기준 펼침",
    act: async (page) => {
      const details = page.locator("aside details");
      await details.locator("summary").click();
      await expect(details).toHaveAttribute("open");
    },
  },
  CHECK_ONE,
  {
    name: "국가 쌍 탭 선택",
    act: async (page) => {
      const tab = page.getByRole("tablist", { name: "국가 쌍 선택" }).getByRole("tab").nth(OTHER_TAB);
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      // 과거 위기 사례는 국가 쌍일 때만 나옴. 이것이 보이면 새 대상의 패널이 붙은 것
      await expect(panel(page, "과거 위기 때 점수").getByRole("listitem").first()).toBeVisible({ timeout: DATA_TIMEOUT_MS });
    },
  },
  {
    name: "대피소 위치 조회 결과",
    act: async (page) => {
      const shelters = panel(page, "내 주변 대피소");
      await shelters.getByRole("button", { name: "내 주변 대피소 찾기", exact: true }).click();
      await expect(shelters.getByRole("listitem").first(), "대피소 결과").toBeVisible({ timeout: DATA_TIMEOUT_MS });
    },
  },
  {
    // 재외공관 연락처(EmbassyContacts)는 해외 나라를 골랐을 때만 나와 위 상태에서는 잴 수 없다
    name: "주목 국가에서 외국 선택(재외공관)",
    act: async (page) => {
      await page.locator("aside li button").filter({ hasNotText: HOME_COUNTRY }).first().click();
      const embassy = page.getByText("현지 긴급 연락처", { exact: true })
        .locator("xpath=ancestor::*[.//a[starts-with(@href,'tel:')]][1]");
      await expect(embassy.locator("li").first(), "공관 목록이 있는 나라여야 재외공관 글자를 잴 수 있음")
        .toBeVisible({ timeout: DATA_TIMEOUT_MS });
    },
  },
];

// 측정 단언은 expect.soft 라 한 번 실행으로 어긋난 조건을 모두 보여 준다(요소가 있는지 같은 전제만 바로 멈춤)
test.describe.configure({ timeout: TEST_TIMEOUT_MS });
// 대피소 위치 조회용. 위치는 버튼을 눌렀을 때만 묻으므로 다른 상태에는 영향이 없다
test.use({ geolocation: SEOUL, permissions: ["geolocation"] });

test("측정 코드 자체 확인: 대비 7.71·4.20 재현, text-neutral-400 을 canvas 로 읽으면 #a1a1a1", async ({ page }) => {
  await page.goto("/");
  await page.locator("main").waitFor();
  // 임시 요소에 text-neutral-400 을 붙여 계산된 색(빌드 CSS 의 @supports 값이라 Firefox·WebKit 모두 lab() 문자열)을 canvas 가 sRGB 로 읽는지 본다
  const color = await page.evaluate((id) => {
    const s = document.body.appendChild(document.createElement("span"));
    s.id = id;
    s.className = "text-neutral-400";
    s.textContent = "probe";
    return getComputedStyle(s).color;
  }, PROBE_ID);
  test.info().annotations.push({ type: "text-neutral-400 계산된 색", description: color });
  const r = await audit(page, `#${PROBE_ID}`, [`#${PROBE_ID}`], SELF_CHECK.map((c) => c.pair));
  SELF_CHECK.forEach((c, i) => {
    expect.soft(Math.abs(r.ratios[i] - c.ratio), `대비 ${c.pair.join(" / ")} = ${r.ratios[i].toFixed(3)}, 기대 ${c.ratio}`)
      .toBeLessThanOrEqual(RATIO_TOLERANCE);
  });
  const probe = r.picked[0];
  expect(probe, "임시 요소").not.toBeNull();
  const diff = rgb(probe!.fg).map((v, i) => Math.abs(v - rgb(NEUTRAL_400)[i]));
  expect(Math.max(...diff), `text-neutral-400(${color}) → canvas ${probe!.fg}, 기대 ${NEUTRAL_400}`).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
});

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    for (const state of STATES) {
      test(`${state.name}: 보이는 글자 대비 4.5:1(큰 글자 3:1)·밑줄 3:1 이상`, async ({ page }) => {
        // 동작 줄이기: fade-up·pulse 등 애니메이션이 끝난 상태에서 잰다
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.setViewportSize({ width, height: HEIGHT });
        await page.goto("/");
        await page.locator("main").waitFor();
        await waitData(page);
        if (state.act) {
          await state.act(page);
          await waitData(page);
        }
        // 방금 누른 요소의 hover 색이 아니라 평소 색을 잰다. 포인터를 치운 뒤의 전환(Firefox)까지 settle 이 기다리도록 먼저 옮긴다
        await page.mouse.move(0, 0);
        await settle(page);

        const r = await audit(page, state.root ?? "body", state === CHECK_ONE ? [CHECKED_ITEM, UNCHECKED_ITEM] : []);
        const failures = r.items.filter((m) => m.ratio < m.min).map(line);
        const underlineFailures = r.underlines.filter((m) => m.underlineRatio < UNDERLINE_MIN).map(underlineLine);
        const louder = r.underlines.filter((m) => m.underlineRatio > m.ratio)
          .map((m) => `${m.text} · 밑줄 ${m.underlineRatio.toFixed(2)} > 글자 ${m.ratio.toFixed(2)}`);
        const lowest = r.underlines.length ? Math.min(...r.underlines.map((m) => m.underlineRatio)).toFixed(2) : "–";
        test.info().annotations.push(
          { type: "측정 요소 수", description: `${r.items.length}(기준 미달 ${failures.length})` },
          { type: "밑줄 요소 수", description: `${r.underlines.length}(최저 ${lowest}, 3:1 미달 ${underlineFailures.length})` },
        );
        expect(r.items.length, "측정한 글자 요소 수(수집이 깨져 0건으로 통과하는 것을 막음)").toBeGreaterThan(0);
        if (state === HOME) expect(r.underlines.length, "기본 홈에서 잰 밑줄 요소 수(푸터 링크는 늘 보임)").toBeGreaterThan(0);
        expect.soft(failures, "기준 미달 글자(글자 · 글자 색 / 합성한 배경색 · 대비 < 기준)").toEqual([]);
        expect.soft(underlineFailures, "3:1 미달 밑줄(글자 · 밑줄 색 / 합성한 배경색 · 대비 < 3)").toEqual([]);
        // 위계: 밑줄은 같은 요소의 글자보다 옅다
        expect.soft(louder, "밑줄 대비가 같은 요소의 글자 대비보다 높음").toEqual([]);

        if (state === CHECK_ONE) {
          // 위계: 체크한 항목(취소선)이 체크 안 한 항목보다 흐리다
          const [checked, unchecked] = r.picked;
          expect(checked && unchecked, "체크한 항목·체크 안 한 항목 글자").toBeTruthy();
          test.info().annotations.push({ type: "체크 항목 대비", description: `체크 ${checked!.ratio.toFixed(2)} / 안 함 ${unchecked!.ratio.toFixed(2)}` });
          expect.soft(checked!.ratio, `체크한 항목 대비 < 체크 안 한 항목 대비(${unchecked!.ratio.toFixed(2)})`)
            .toBeLessThan(unchecked!.ratio);
        }
      });
    }
  });
}
