import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { CIVIL_ALERTS } from "../src/entities/guide/model/alerts";
import { GO_BAG_ITEMS, KIT_CALC_STORAGE_KEY, KIT_STORAGE_KEY, STOCK_ITEMS } from "../src/entities/guide/model/kit";
import { API_BASE_URL, SITE_URL } from "../src/shared/config/env";
import { CALL_CENTER, EMBASSY_SOURCE, type EmbassyBundle } from "../src/widgets/embassy-contacts/model/embassy";

// 이슈 #74(1-4) /emergency 비상 대비 안내와 홈 헤더 진입 링크, #108(1-9) 첫 화면(경보 타일·미리 준비하기 카드) 실측. 기준 화면 폭(360·768·1080·1440)
// 경보 내용은 이슈 #72 모델(CIVIL_ALERTS), 카드 값은 kit.ts 목록·저장 키와 인수 조건의 숫자를 그대로 쓴다. 소스 쪽 계약(토큰 색만·서버 컴포넌트·
// text-alert-* 글자 그대로·sitemap.ts)은 tests/test_m13_emergency.py, llms.txt 첫 화면 설명은 tests/test_m17_first_screen.py,
// 명도 대비는 contrast.spec.ts 의 "비상 대비 페이지 기본"·"준비 카드 진행 중" 상태
// #108 명세 변경: 첫 화면의 한 줄 소개·목차·경보 카드(언제·어떻게 알리나·할 일·출처)를 지우고 경보 타일·준비 카드로 바꿨다.
// 경보 카드 내용(행동요령 전체·출처 링크)은 상세 "더 보기"로 옮겼고 그 확인은 emergency-detail.spec.ts(#104)
//
// 화면 선택자 계약 (구현은 이 계약을 따른다)
// - 경로 /emergency, 내용은 <main> 안. <title> 에 "비상 대비", canonical 은 /emergency(절대 주소면 경로가 /emergency)
// - 공유 미리보기(이슈 #98): og:url 경로가 /emergency, og·twitter 제목은 h1 글자, 설명은 description 과 같다.
//   루트 값(og:site_name·locale·type, 파일 기반 og:image /opengraph-image)은 그대로 붙는다. 푸터(SiteFooter)는 HTML 에 있다.
//   설명(#108)에 "체크리스트"가 없고 새 기능 글자 "핵심 행동"·"비상 가방"·"물·식량 계산"·"장보기 목록"이 있다
// - 머리말: h1(페이지에 하나) "비상 대비 안내", 접근 이름에 "전체 지도"가 든 링크 하나(글자 "← 전체 지도", href="/"),
//   고지 문구 NOTICE(문장 사이를 줄바꿈·다른 요소로 나눠도 됨). 한 줄 소개 문단("민방위 경보 5종별 행동요령, …정리했습니다.")은 없다
// - 첫 화면에 접근 이름 "목차"인 navigation 이 없고, main 글자에 경보 actions 문장이 하나도 없다(행동요령은 상세에만)
// - 경보 타일(#108): main 안 a[href="/emergency/<경보 id>"]가 경보마다 하나. main 의 h2 와 타일·준비 카드 링크를 문서 순서로 늘어놓으면
//   h2 "지금 어떤 경보인가요?" → 타일 5개(CIVIL_ALERTS 순서) → h2 "미리 준비하기" → 가방 카드 → 물 카드
//   - 접근 이름에 경보 이름. 타일 글자에 siren 이 true(공습·핵)면 "사이렌", false 면 "방송·문자"(둘 중 하나만)
//   - 안에 svg 하나(aria-hidden="true"). 글자가 정확히 경보 이름인 요소의 color 와 svg 의 stroke 가 그 경보 토큰 색(--alert-<id>)
//   - 높이 80px 이상. 열 수(left 위치 수) 360 2열·768 3열·1080 5열·1440 5열, 360 에서 경보해제는 두 칸(1열 왼쪽 끝~2열 오른쪽 끝)
//   - 360×800 에서 스크롤 전에 5개 모두 화면 안(ratio 1). 누르면 /emergency/<id> 로 가고 h1 이 그 경보 이름
// - 준비 카드(#108): 카드 전체가 링크. 가방 카드 main a[href="#kit"] 하나, 물 카드 main a[href="#calc"] 하나. 열 수 360 1열(위아래)·768 이상 2열
//   - 가방 카드 글자: "3일 가방 {n}/7 챙김"·"7일 비축 {n}/8 챙김"(이름·숫자·"챙김" 사이 공백은 없어도 됨. n 은 KIT_STORAGE_KEY 의 목록별 담은 수).
//     진행 막대 2개(progress 또는 role="progressbar", 목록 순서). 값은 value·max 또는 aria-valuenow·aria-valuemax 가 담은 수·전체
//   - 물 카드 글자: "물 {L}L(약 {L}kg)"·"{n}명 · {기간 label}", 7·14일 비축이면 "2L 생수 6병 묶음 {팩}팩", 3일 가방이면 "가방 {b}L · 집 {h}L"
//     (KIT_CALC_STORAGE_KEY 의 가구원 수·기간. 저장값이 없으면 4명·7일 비축)
//   - 서버 HTML 은 기본값(0/7·0/8, 4명·7일 비축)이고 저장값은 하이드레이션 뒤에 반영한다(하이드레이션 경고 없음).
//     아래 #kit 타일을 누르거나 #calc 의 −/+·기간 칩을 바꾸면 1초 안에 카드가 바뀐다. 카드를 누르면 주소에 #kit·#calc, 그 영역이 화면 안
// - 가방·계산 영역: section#kit·section#calc 하나씩(내용 계약과 홈 체크리스트 카드의 /emergency#kit 링크는 emergency-kit.spec.ts)
// - 키보드: Tab 순서 ← 전체 지도 → 경보 타일 5개(순서대로) → 가방 카드 → 물 카드 → #kit 첫 타일, Tab 으로 오면 포커스 표시(outline 또는 box-shadow).
//   WebKit 은 Safari 기본 설정처럼 Tab 이 링크를 건너뛰어 Firefox 에서만 본다(footer.spec.ts 와 같음)
// - 재외공관 연락처(#77): section#embassies(#calc 뒤). 서버가 GET /api/embassies 를 받아 HTML 에 넣는다(브라우저 요청 없음, 위 폭별 테스트가 확인).
//   자바스크립트 실행 전 HTML 의 그 영역에 영사콜센터 해외 번호, <details> 가 응답 나라 수만큼(available false 면 0개, 단위 테스트는 embassy.test.ts).
//   summary 글자는 나라 한국어 이름이고 문서 순서가 Intl.Collator("ko") 가나다순. "일본"을 펼치면 공관 li 1곳 이상, "대표 " 뒤 전화 링크는 tel:+81.
//   영역 끝(마지막 자식)에 EMBASSY_SOURCE 이름 링크(href 같음)와 "수집일 {as_of}". 360·768 1열, 1080·1440 2열이고 펼쳐도 가로 넘침 없음
// - 정적 페이지: 브라우저가 API 주소로 요청하지 않는다. 자바스크립트 실행 전 HTML(<script> 밖 body)에 경보 이름 5개와
//   상세 링크 href="/emergency/<id>" 5개가 있다
// - 홈 헤더(main 의 첫 header) 제목 줄에 접근 이름이 정확히 "비상 대비"인 링크 하나, href="/emergency".
//   제목(h1)·LiveBadge·가이드 버튼과 같은 줄, 링크 글자도 한 줄, 헤더 내용 폭 안, 높이 24px 이상.
//   좁은 폭에서는 아이콘만 보여도 된다(접근 이름은 모든 폭에서 같음)
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
const NARROW = 360; // 폭과 무관한 내용은 가장 좁은 폭에서 본다
const FOLD = { width: 360, height: 800 }; // 인수 조건: 이 화면에서 스크롤 없이 경보 타일 5개
const MD = 768;
const LG = 1080;
const XL = 1440;
const TEST_TIMEOUT_MS = 60_000; // 홈 데이터 대기(최대 30초) 뒤 /emergency 로 이동하는 테스트가 있어 기본(30초)보다 길게
const DATA_TIMEOUT_MS = 30_000; // 홈 헤더 LiveBadge 가 그려지기를 기다리는 시간
const NAV_TIMEOUT_MS = 30_000; // 링크를 눌러 다른 경로로 가기를 기다리는 시간(개발 서버 첫 컴파일 포함)
const CARD_MS = 1_000; // 아래 영역에서 담거나 계산을 바꾼 뒤 카드가 바뀌기까지 한도(인수 조건 "1초 안에")
const SAME_LINE_PX = 8; // 한 줄로 보는 top 차이(top-sections.spec.ts 와 같음)
const SUBPIXEL_PX = 0.5; // 소수점 배치 오차
const TOLERANCE_PX = 1;
const MIN_TARGET_PX = 24; // WCAG 2.5.8 최소 대상 크기(24 CSS px)
const TILE_MIN_PX = 80; // 경보 타일 높이 하한(plan.md 7-8)
const TILE_COLS = [2, 3, 5, 5]; // 폭 단계별 경보 타일 열 수: [기본, md, lg, xl]
const PREP_COLS = [1, 2, 2, 2]; // 폭 단계별 준비 카드 열 수

const PATH = "/emergency";
const TITLE_TEXT = "비상 대비"; // <title> 에 들어갈 글자
const H1 = "비상 대비 안내";
const HOME_LINK = "← 전체 지도";
const NOTICE = "개인이 만든 참고용 안내입니다. 정부·민방위의 공식 경보와 안내가 항상 우선합니다.";
const INTRO_PARTS = ["민방위 경보 5종별 행동요령", "정리했습니다"]; // 지운 한 줄 소개 문단의 앞뒤 글자
const TOC_NAME = "목차"; // 지운 목차(#74)의 접근 이름
const TILES_TITLE = "지금 어떤 경보인가요?";
const PREP_TITLE = "미리 준비하기";
const SIREN = "사이렌";
const BROADCAST = "방송·문자";
const KIT = "#kit"; // 가방 영역 선택자이자 가방 카드 href
const CALC = "#calc";
const DESCRIPTION_WORDS = ["핵심 행동", "비상 가방", "물·식량 계산", "장보기 목록"]; // page.tsx 설명의 새 기능 글자(#108)
const OLD_DESCRIPTION_WORD = "체크리스트";
const ENTRY_NAME = "비상 대비"; // 홈 헤더 링크 접근 이름
const GUIDE_NAME = "가이드 · 여행경보 단계";
const SCRIPT = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const TRANSPARENT = /^transparent$|^rgba\([^)]*,\s*0\)$|\/\s*0\)$/; // 계산된 색이 완전 투명(footer.spec.ts 와 같음)
const BARS = 'progress, [role="progressbar"]'; // 진행 막대
const EMBASSY = "section#embassies"; // 재외공관 영역(#77)
const JAPAN = "일본";
const JAPAN_TEL = "tel:+81"; // 일본 공관 대표 전화 링크 앞부분
const EMBASSY_COLS = [1, 1, 2, 2]; // 폭 단계별 나라 접기 열 수(plan.md 7-4)
const BAG_ROWS = [{ name: "3일 가방", total: GO_BAG_ITEMS.length }, { name: "7일 비축", total: STOCK_ITEMS.length }]; // 가방 카드 줄(목록 순서)
// 저장값(인수 조건): 가방은 두 목록에서 하나씩 2개, 계산은 6명·14일 비축
const SAVED_KIT = JSON.stringify([GO_BAG_ITEMS[0].id, STOCK_ITEMS[0].id]);
const SAVED_CALC = JSON.stringify({ people: 6, period: "stock14" });
// 카드 글자가 가장 긴 저장값: 모두 담음(7/7·8/8), 20명·14일 비축(840L·70팩)
const MAX_KIT = JSON.stringify([...GO_BAG_ITEMS, ...STOCK_ITEMS].map((it) => it.id));
const MAX_CALC = JSON.stringify({ people: 20, period: "stock14" });
// 물 카드 글자: 물 L = 인원 × 일수 × 3, 묶음 = ⌈L ÷ 12⌉, 3일 가방은 가방 1인 2L·나머지 집(plan.md 7-5)
const WATER = {
  basic: ["물 84L(약 84kg)", "4명 · 7일 비축", "2L 생수 6병 묶음 7팩"], // 저장값 없음(인수 조건)
  five: ["물 105L(약 105kg)", "5명 · 7일 비축", "2L 생수 6병 묶음 9팩"], // 늘리기 한 번(인수 조건)
  bag: ["물 36L(약 36kg)", "4명 · 3일 가방", "가방 8L · 집 28L"], // 3일 가방·4명(인수 조건)
  saved: ["물 252L(약 252kg)", "6명 · 14일 비축", "2L 생수 6병 묶음 21팩"],
  max: ["물 840L(약 840kg)", "20명 · 14일 비축", "2L 생수 6병 묶음 70팩"],
};

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
/** <meta property|name="key"> 의 content */
const metaOf = (markup: string, key: string) =>
  markup.match(new RegExp(`<meta\\b[^>]*\\b(?:property|name)="${key}"[^>]*>`))?.[0].match(/\bcontent="([^"]*)"/)?.[1];
/** 경보 타일: 상세로 가는 링크. tilesOf 는 문서 순서로 잡힌다 */
const tileOf = (page: Page, id: string) => page.locator(`main a[href="${PATH}/${id}"]`);
const tilesOf = (page: Page) => page.locator(CIVIL_ALERTS.map((a) => `main a[href="${PATH}/${a.id}"]`).join(", "));
const bagCardOf = (page: Page) => page.locator(`main a[href="${KIT}"]`);
const waterCardOf = (page: Page) => page.locator(`main a[href="${CALC}"]`);

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

/** 포커스 표시 재료: 보이는 outline 인지, box-shadow(Tailwind ring)가 있는지, 둘의 계산값(emergency-kit.spec.ts 와 같음) */
const focusLook = (l: Locator) => l.evaluate((el, transparent) => {
  const s = getComputedStyle(el);
  return {
    outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 && !new RegExp(transparent).test(s.outlineColor),
    ring: s.boxShadow !== "none",
    key: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} ${s.boxShadow}`,
  };
}, TRANSPARENT.source);

/** 콘솔 오류와 하이드레이션 경고(warning 으로 찍히는 경우도 잡는다).
 *  type 을 보지 않고 글자만 보면 React 개발 모드의 console.timeStamp("Hydrated")(Firefox)까지 잡혀 type 으로 거른다 */
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || (m.type() === "warning" && /hydrat/i.test(m.text()))) errors.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function open(page: Page, width = NARROW, height = HEIGHT) {
  await page.setViewportSize({ width, height });
  await page.goto(PATH);
  await page.locator("main").waitFor();
}

/** 하이드레이션 끝을 알리는 요소가 없어 네트워크가 잠잠해질 때까지 기다린다(그 전 누름·저장값은 React 가 받지 못함) */
const hydrated = (page: Page) => page.waitForLoadState("networkidle");

/** 담기·계산 저장값을 넣고 새로 고친다 */
async function reloadWith(page: Page, kit: string, calc: string) {
  await page.evaluate(([k, kv, c, cv]) => {
    localStorage.setItem(k, kv);
    localStorage.setItem(c, cv);
  }, [KIT_STORAGE_KEY, kit, KIT_CALC_STORAGE_KEY, calc]);
  await page.reload({ waitUntil: "networkidle" });
}

async function expectNoOverflow(page: Page, label: string) {
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect.soft(m.scroll, `${label}: 가로 넘침`).toBeLessThanOrEqual(m.inner);
}

/** 가방 카드: 줄마다 "{이름} {담은 수}/{전체} 챙김", 진행 막대 2개 값(목록 순서). timeout 을 주면 그 시간 안에 */
async function expectBagCard(card: Locator, done: number[], label: string, timeout?: number) {
  await expect(card, `${label}: 가방 카드(a[href="${KIT}"]) 하나`).toHaveCount(1);
  for (const [i, row] of BAG_ROWS.entries()) {
    await expect.soft(card, `${label}: "${row.name} ${done[i]}/${row.total} 챙김"`)
      .toContainText(new RegExp(`${row.name}\\s*${done[i]}\\s*/\\s*${row.total}\\s*챙김`), { timeout });
  }
  const bars = card.locator(BARS);
  await expect.soft(bars, `${label}: 진행 막대 수`).toHaveCount(BAG_ROWS.length);
  await expect.soft.poll(() => bars.evaluateAll((els) => els.map((el) => el instanceof HTMLProgressElement
    ? { now: el.value, max: el.max }
    : { now: Number(el.getAttribute("aria-valuenow")), max: Number(el.getAttribute("aria-valuemax")) })),
  { message: `${label}: 진행 막대 값·최댓값(목록 순서)`, timeout }).toEqual(BAG_ROWS.map((r, i) => ({ now: done[i], max: r.total })));
}

/** 물 카드: texts 글자가 모두 있다. timeout 을 주면 그 시간 안에 */
async function expectWaterCard(card: Locator, texts: string[], label: string, timeout?: number) {
  await expect(card, `${label}: 물 카드(a[href="${CALC}"]) 하나`).toHaveCount(1);
  for (const t of texts) await expect.soft(card, `${label}: "${t}"`).toContainText(t, { timeout });
}

// 내용 단언은 expect.soft 라 한 번 실행으로 어긋난 조건을 모두 보여 준다(요소가 있는지 같은 전제만 바로 멈춤)
test.describe.configure({ timeout: TEST_TIMEOUT_MS });

test("자바스크립트 실행 전 HTML: 경보 이름 5개·상세 링크 5개, <title>·canonical·공유 미리보기·설명(새 기능 글자)·푸터", async ({ request }) => {
  const res = await request.get(PATH);
  expect(res.status(), `${PATH} 응답`).toBe(200);
  // RSC 데이터(<script>)에만 있는 글자는 자바스크립트가 돌아야 보이므로 뺀다. 경보 이름은 head(메타데이터) 말고 body 에서 찾는다
  const markup = (await res.text()).replace(SCRIPT, "");
  const body = markup.slice(markup.indexOf("<body"));
  for (const a of CIVIL_ALERTS) {
    expect.soft(body, `경보 이름 ${a.name}`).toContain(a.name);
    expect.soft(body, `상세 링크 ${a.id}`).toContain(`href="${PATH}/${a.id}"`);
  }

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
  // #108: 설명의 "체크리스트"를 새 기능 설명으로 바꿨다
  const description = metaOf(markup, "description") ?? "";
  expect.soft(description, `설명에 "${OLD_DESCRIPTION_WORD}"`).not.toContain(OLD_DESCRIPTION_WORD);
  for (const w of DESCRIPTION_WORDS) expect.soft(description, `설명에 "${w}"`).toContain(w);
  expect.soft(metaOf(markup, "og:image"), "og:image(루트 파일 기반 이미지)").toMatch(/\/opengraph-image(?![\w-])/);
  expect.soft(body, "푸터(SiteFooter)").toMatch(/<footer\b/);
});

/** 테스트가 비교할 공관 묶음 응답(서버가 받는 것과 같은 API) */
async function embassyBundle(request: APIRequestContext): Promise<EmbassyBundle> {
  const res = await request.get(`${API_BASE_URL}/api/embassies`);
  expect(res.status(), "/api/embassies 응답").toBe(200);
  return res.json();
}
const countryOf = (page: Page, name: string) =>
  page.locator(`${EMBASSY} details`).filter({ has: page.locator("summary", { hasText: new RegExp(`^${name}$`) }) });

test("재외공관(자바스크립트 실행 전 HTML): 영사콜센터 해외 번호, 응답 나라 수만큼 <details>", async ({ request }) => {
  const bundle = await embassyBundle(request);
  const markup = (await (await request.get(PATH)).text()).replace(SCRIPT, "");
  const start = markup.indexOf('id="embassies"');
  expect(start, "section#embassies").toBeGreaterThan(0);
  const section = markup.slice(start, markup.indexOf("<footer", start));
  expect.soft(section, "영사콜센터 해외 번호").toContain(CALL_CENTER.tel_overseas);
  expect.soft(section.match(/<details\b/g)?.length ?? 0, "나라 접기 수 = 응답 나라 수")
    .toBe(bundle.available ? bundle.countries.length : 0);
});

test("재외공관: 나라 접기 가나다순(Intl.Collator ko), 일본 펼치면 공관 1곳 이상·대표 전화 tel:+81, 영역 끝 출처 링크·수집일", async ({ page, request }) => {
  const bundle = await embassyBundle(request);
  test.skip(!bundle.available, "공관 데이터 없음(백엔드 공공데이터 키 없음)");
  await open(page);
  await hydrated(page);
  const names = await page.locator(`${EMBASSY} details > summary`).allTextContents();
  expect.soft(names, "나라 수").toHaveLength(bundle.countries.length);
  expect.soft(names, "가나다순").toEqual([...names].sort(new Intl.Collator("ko").compare));

  const japan = countryOf(page, JAPAN);
  await expect(japan, JAPAN).toHaveCount(1);
  await japan.locator("summary").click();
  await expect(japan, `${JAPAN} 펼침`).toHaveAttribute("open");
  await expect.soft(japan.locator("li").first(), `${JAPAN} 공관`).toBeVisible();
  // "대표 " 글자 바로 뒤의 링크 = 대표 전화(긴급 전화는 한국 번호일 수 있어 보지 않는다)
  const tels = await japan.locator('a[href^="tel:"]').evaluateAll((els) =>
    els.filter((a) => a.previousSibling?.textContent?.endsWith("대표 ")).map((a) => a.getAttribute("href")));
  expect.soft(tels.length, `${JAPAN} 대표 전화 링크 수`).toBeGreaterThan(0);
  expect.soft(tels.filter((h) => !h?.startsWith(JAPAN_TEL)), `${JAPAN_TEL} 로 시작하지 않는 대표 전화`).toEqual([]);

  const last = page.locator(`${EMBASSY} > :last-child`);
  const source = last.getByRole("link", { name: EMBASSY_SOURCE.name, exact: true });
  await expect.soft(source, "출처 링크").toHaveAttribute("href", EMBASSY_SOURCE.url);
  await expect.soft(last, "수집일").toContainText(`수집일 ${bundle.as_of}`);
});

test("sitemap.xml 에 <SITE_URL>/emergency", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status(), "sitemap.xml 응답").toBe(200);
  expect(await res.text()).toContain(`<loc>${SITE_URL}${PATH}</loc>`);
});

test("머리말: ← 전체 지도·h1·고지, 한 줄 소개·목차·행동요령(actions) 문장 없음, section#kit·section#calc 그대로", async ({ page }) => {
  await open(page);
  const main = page.locator("main");
  await expect(page.getByRole("heading", { level: 1 }), "h1").toHaveText(H1);
  const home = page.getByRole("link", { name: /전체 지도/ });
  await expect.soft(home, "전체 지도 링크 글자").toHaveText(HOME_LINK);
  await expect.soft(home, "전체 지도 링크 주소").toHaveAttribute("href", "/");
  await expect.soft(main, "고지 문구").toContainText(NOTICE, { useInnerText: true });
  for (const part of INTRO_PARTS) await expect.soft(main, `한 줄 소개 문단("${part}")`).not.toContainText(part);
  await expect.soft(page.getByRole("navigation", { name: TOC_NAME, exact: true }), "목차").toHaveCount(0);
  const text = await main.evaluate((el) => (el.textContent ?? "").replace(/\s+/g, " "));
  const left = CIVIL_ALERTS.flatMap((a) => a.actions.filter((x) => text.includes(x.text)).map((x) => x.id));
  expect.soft(left, "첫 화면에 남은 행동요령 문장(actions id)").toEqual([]);
  for (const id of ["kit", "calc"]) await expect.soft(page.locator(`section#${id}`), `section#${id}`).toHaveCount(1);
});

test("경보 타일: h2 아래 /emergency/<id> 링크 5개(CIVIL_ALERTS 순서)·접근 이름에 경보 이름·사이렌 또는 방송·문자·aria-hidden 아이콘 하나·이름과 아이콘이 경보 토큰 색, 그 아래 미리 준비하기 카드", async ({ page }) => {
  await open(page);
  for (const name of [TILES_TITLE, PREP_TITLE]) {
    await expect.soft(page.getByRole("heading", { level: 2, name, exact: true }), `h2 "${name}"`).toHaveCount(1);
  }
  const tiles = tilesOf(page);
  await expect(tiles, "경보 타일 수(경보마다 하나)").toHaveCount(CIVIL_ALERTS.length);
  // 문서 순서: h2 → 타일 5개 → h2 → 가방 카드 → 물 카드(그 뒤는 #kit·#calc 영역 제목 등)
  const order = await page.locator(`main h2, main a[href^="${PATH}/"], main a[href="${KIT}"], main a[href="${CALC}"]`)
    .evaluateAll((els) => els.map((e) => (e.tagName === "H2" ? (e.textContent ?? "").trim() : e.getAttribute("href"))));
  const expected = [TILES_TITLE, ...CIVIL_ALERTS.map((a) => `${PATH}/${a.id}`), PREP_TITLE, KIT, CALC];
  expect.soft(order.slice(0, expected.length), "문서 순서(h2 글자·링크 href)").toEqual(expected);

  for (const a of CIVIL_ALERTS) {
    const tile = tileOf(page, a.id);
    await expect.soft(tile, `${a.id} 접근 이름에 경보 이름`).toHaveAccessibleName(new RegExp(a.name));
    const [shown, hidden] = a.siren ? [SIREN, BROADCAST] : [BROADCAST, SIREN];
    await expect.soft(tile, `${a.id} "${shown}"(siren ${a.siren})`).toContainText(shown);
    await expect.soft(tile, `${a.id} "${hidden}" 없음`).not.toContainText(hidden);
    await expect(tile.locator("svg"), `${a.id} 타일 안 svg 수`).toHaveCount(1);
    await expect.soft(tile.locator('svg[aria-hidden="true"]'), `${a.id} 아이콘 aria-hidden`).toHaveCount(1);
    const name = tile.getByText(a.name, { exact: true });
    await expect(name, `${a.id} 글자가 정확히 "${a.name}"인 요소`).toHaveCount(1);
    // 토큰 색: --alert-<id> 를 글자 색으로 둔 탐침의 계산값. stroke 가 currentColor 면 계산값이 color 와 같은 글자다
    const c = await name.evaluate((el, id) => {
      const probe = document.body.appendChild(document.createElement("span"));
      probe.style.color = `var(--alert-${id})`;
      const token = getComputedStyle(probe).color;
      probe.remove();
      return { token, name: getComputedStyle(el).color, stroke: getComputedStyle(el.closest("a")!.querySelector("svg")!).stroke };
    }, a.id);
    expect.soft(c.name, `${a.id} 이름 글자 색 = --alert-${a.id}`).toBe(c.token);
    expect.soft(c.stroke, `${a.id} 아이콘 선 색 = --alert-${a.id}`).toBe(c.token);
  }
});

test("360×800: 스크롤하기 전에 경보 타일 5개가 모두 화면 안", async ({ page }) => {
  await open(page, FOLD.width, FOLD.height);
  await expect(tilesOf(page), "경보 타일 수").toHaveCount(CIVIL_ALERTS.length);
  expect(await page.evaluate(() => window.scrollY), "스크롤하지 않은 상태").toBe(0);
  for (const a of CIVIL_ALERTS) await expect.soft(tileOf(page, a.id), `${a.id} 타일 전체가 화면 안`).toBeInViewport({ ratio: 1 });
});

test("경보 타일을 누르면 /emergency/<id> 로 가고 h1 이 그 경보 이름(5개)", async ({ page }) => {
  await open(page);
  await expect(tilesOf(page), "경보 타일 수").toHaveCount(CIVIL_ALERTS.length);
  // 상세 페이지(#104)가 없으면 h1 을 기다리다 시간이 다 가므로 먼저 본다
  const statuses = await Promise.all(CIVIL_ALERTS.map(async (a) => (await page.request.get(`${PATH}/${a.id}`)).status()));
  expect(statuses, "상세 페이지 5개 응답(#104)").toEqual(CIVIL_ALERTS.map(() => 200));
  for (const a of CIVIL_ALERTS) {
    await open(page);
    const tile = tileOf(page, a.id);
    await tile.click();
    await expect.soft(page, `${a.id} 주소`).toHaveURL(new RegExp(`${PATH}/${a.id}$`), { timeout: NAV_TIMEOUT_MS });
    await expect.soft(page.getByRole("heading", { level: 1, name: a.name, exact: true }), `${a.id} 상세 h1`)
      .toBeVisible({ timeout: NAV_TIMEOUT_MS });
  }
});

test("미리 준비하기(저장값 없음): 가방 카드 0/7·0/8 챙김·막대 2개, 물 카드 84L·4명 · 7일 비축·7팩, 누르면 #kit·#calc 영역이 화면 안", async ({ page }) => {
  await open(page);
  await hydrated(page);
  await expectBagCard(bagCardOf(page), [0, 0], "저장값 없음");
  await expectWaterCard(waterCardOf(page), WATER.basic, "저장값 없음");
  for (const [card, target] of [[bagCardOf(page), KIT], [waterCardOf(page), CALC]] as const) {
    await card.click();
    await expect.soft(page, `${target} 주소`).toHaveURL(new RegExp(`${target}$`));
    await expect.soft(page.locator(target), `${target} 영역이 화면 안`).toBeInViewport();
  }
});

test("아래 영역을 바꾸면 1초 안에 카드가 바뀜: 가방 타일 → 1/7·1/8 챙김, 늘리기 → 105L·9팩, 3일 가방 → 가방 8L · 집 28L", async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await hydrated(page);
  const kit = page.locator(KIT);
  const calc = page.locator(CALC);
  for (const [it, done] of [[GO_BAG_ITEMS[0], [1, 0]], [STOCK_ITEMS[0], [1, 1]]] as const) {
    const tile = kit.getByRole("button", { name: it.text, exact: true });
    await expect(tile, `${it.id} 타일`).toHaveCount(1);
    await tile.click();
    await expectBagCard(bagCardOf(page), [...done], `${it.id} 담음`, CARD_MS);
  }
  const press = async (name: string) => {
    const button = calc.getByRole("button", { name, exact: true });
    await expect(button, `"${name}" 버튼`).toHaveCount(1);
    await button.click();
  };
  await press("가구원 수 늘리기"); // 4 → 5명
  await expectWaterCard(waterCardOf(page), WATER.five, "늘리기(5명·7일 비축)", CARD_MS);
  await press("가구원 수 줄이기"); // 다시 4명
  await expectWaterCard(waterCardOf(page), WATER.basic, "줄이기(4명·7일 비축)", CARD_MS);
  await calc.getByRole("radiogroup", { name: "기간", exact: true }).getByRole("radio", { name: "3일 가방", exact: true }).click();
  await expectWaterCard(waterCardOf(page), WATER.bag, "3일 가방(4명)", CARD_MS);
  expect.soft(errors, "콘솔 오류").toEqual([]);
});

test(`저장값(${KIT_STORAGE_KEY} 2개·${KIT_CALC_STORAGE_KEY} 6명·14일 비축): 새로 고친 뒤 카드 1/7·1/8 챙김·252L·21팩, 하이드레이션 경고 없음`, async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await reloadWith(page, SAVED_KIT, SAVED_CALC);
  await expectBagCard(bagCardOf(page), [1, 1], "저장값");
  await expectWaterCard(waterCardOf(page), WATER.saved, "저장값");
  expect.soft(errors, "콘솔 오류·하이드레이션 경고").toEqual([]);
});

test("키보드: Tab 순서 ← 전체 지도 → 경보 타일 5개 → 가방 카드 → 물 카드 → 가방 첫 타일, Tab 으로 오면 포커스 표시", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "WebKit 은 Tab 으로 링크에 포커스하지 않음(footer.spec.ts 와 같음)");
  await open(page);
  await hydrated(page);
  const targets = [
    { name: HOME_LINK, el: page.getByRole("link", { name: /전체 지도/ }) },
    ...CIVIL_ALERTS.map((a) => ({ name: `${a.name} 타일`, el: tileOf(page, a.id) })),
    { name: "가방 카드", el: bagCardOf(page) },
    { name: "물 카드", el: waterCardOf(page) },
    { name: "가방 첫 타일", el: page.locator(`${KIT} button[aria-pressed]`).first() },
  ];
  for (const t of targets) await expect(t.el, t.name).toHaveCount(1);
  const before = await Promise.all(targets.map((t) => focusLook(t.el)));
  await targets[0].el.focus();
  const unmarked: string[] = [];
  for (let i = 1; i < targets.length; i++) {
    await page.keyboard.press("Tab");
    await expect(targets[i].el, `${targets[i - 1].name} 다음 Tab: ${targets[i].name}`).toBeFocused();
    // 첫 요소는 focus() 로 옮겼으므로 Tab 으로 온 요소만 본다. 포커스 전과 달라지고 outline 이나 box-shadow 가 보여야 한다
    const after = await focusLook(targets[i].el);
    if (!(after.key !== before[i].key && (after.outline || after.ring))) unmarked.push(targets[i].name);
  }
  expect.soft(unmarked, "Tab 으로 왔는데 포커스 표시(outline 또는 box-shadow)가 생기지 않은 요소").toEqual([]);
});

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test("가로 넘침 없음·경보 타일 열 수·높이 80px·준비 카드 열 수·콘솔 오류(하이드레이션 포함) 0건·API 요청 0건, 가장 긴 저장값에서도 넘침 없음", async ({ page }) => {
      const errors = trackErrors(page);
      const api: string[] = [];
      page.on("request", (r) => {
        if (isApi(r.url())) api.push(r.url());
      });
      await open(page, width);
      await hydrated(page);
      await expectNoOverflow(page, "저장값 없음");

      await expect(tilesOf(page), "경보 타일 수").toHaveCount(CIVIL_ALERTS.length);
      expect.soft(await columns(tilesOf(page)), "경보 타일 열 수").toBe(TILE_COLS[step(width)]);
      const boxes = await Promise.all(CIVIL_ALERTS.map((a) => box(tileOf(page, a.id))));
      expect.soft(CIVIL_ALERTS.filter((_, i) => boxes[i].height < TILE_MIN_PX - SUBPIXEL_PX).map((a) => a.id), `높이 ${TILE_MIN_PX}px 미만 타일`)
        .toEqual([]);
      if (step(width) === 0) {
        // 2열에서 경보해제(CIVIL_ALERTS 마지막)는 두 칸: 다른 타일들의 왼쪽 끝~오른쪽 끝을 덮는다
        const others = boxes.slice(0, -1);
        const allClear = boxes[boxes.length - 1];
        expect.soft(Math.abs(allClear.x - Math.min(...others.map((b) => b.x))), "경보해제 왼쪽 끝 = 1열 왼쪽 끝").toBeLessThanOrEqual(TOLERANCE_PX);
        expect.soft(Math.abs(allClear.right - Math.max(...others.map((b) => b.right))), "경보해제 오른쪽 끝 = 2열 오른쪽 끝")
          .toBeLessThanOrEqual(TOLERANCE_PX);
      }
      const cards = page.locator(`main a[href="${KIT}"], main a[href="${CALC}"]`);
      await expect(cards, "준비 카드 수").toHaveCount(2);
      expect.soft(await columns(cards), "준비 카드 열 수").toBe(PREP_COLS[step(width)]);

      await reloadWith(page, MAX_KIT, MAX_CALC);
      await expectBagCard(bagCardOf(page), BAG_ROWS.map((r) => r.total), "가장 긴 저장값");
      await expectWaterCard(waterCardOf(page), WATER.max, "가장 긴 저장값");
      await expectNoOverflow(page, "가장 긴 저장값");
      expect.soft(errors, "콘솔 오류(하이드레이션 포함)").toEqual([]);
      expect.soft(api, "API 주소로 보낸 요청").toEqual([]);
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

for (const width of WIDTHS) {
  test(`${width}px 재외공관: 나라 접기 열 수, 일본을 펼쳐도 가로 넘침 없음`, async ({ page }) => {
    await open(page, width);
    await hydrated(page);
    const items = page.locator(`${EMBASSY} details`);
    test.skip(await items.count() === 0, "공관 데이터 없음(백엔드 공공데이터 키 없음)");
    expect.soft(await columns(items), "나라 접기 열 수").toBe(EMBASSY_COLS[step(width)]);
    const japan = countryOf(page, JAPAN);
    await japan.locator("summary").click();
    await expect(japan, `${JAPAN} 펼침`).toHaveAttribute("open");
    await expectNoOverflow(page, `${JAPAN} 펼침`);
  });
}
