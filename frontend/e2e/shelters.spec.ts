import { expect, test, type Locator, type Page } from "@playwright/test";

// 이슈 #25(3-2) 대피소 결과 키워드 검색·페이지네이션·카드 배치 실측. 기준 화면 폭(360·768·1080·1440)
// 건수 기대값은 로컬 data/shelters.csv 실데이터(2026-11-10 확인). 데이터가 바뀌면 전제 검사가 먼저 실패한다.
//
// 화면 선택자 계약 (구현은 이 계약을 따른다)
// - 위젯: 제목 "내 주변 대피소"(heading)에서 가장 가까운 section (기존)
// - 검색창: 접근 가능한 이름 "결과에서 찾기"인 textbox 또는 searchbox. 조회 결과가 1곳 이상일 때만 보임
// - 건수 문구: 위젯 글자에 "총 N곳" / "총 N곳 중 M곳", total > items 면 "상위 L곳만 표시"(숫자는 천 단위 쉼표)
// - 페이지 이동: 접근 가능한 이름이 정확히 "이전"·"다음"인 버튼 각 1개와 현재 위치 글자 "N / M".
//   (검색 뒤) 결과가 10곳 이하이면 버튼·현재 위치 글자 모두 DOM 에 없음(CSS 로 숨기기만 하면 실패)
// - 스크린리더: aria-live="polite" 요소 글자에 "N / M쪽". live 영역(aria-live·role=status/log/alert)은 카드를 품지 않음
// - 카드: 결과 목록의 li, 응답 순서 그대로. 카드마다 "지도에서 보기" 링크(a, target=_blank, rel 에 noreferrer, href = 카카오맵)
//   이름·주소·거리 배지는 각각 그 글자만 담은 요소. 거리 배지 "약 1,234 m", 수용 인원 "수용 1,234명"
//   거리 배지 "오른쪽 위" = 배지 오른쪽 끝이 카드 내용(이름·주소·배지 공통 조상의 padding 안쪽) 오른쪽 끝, 배지 아래 끝이 주소 위
// - 쪽을 바꾸면 결과 목록 맨 위로 스크롤(첫 카드가 화면 안에 다 보임), 포커스는 누른 버튼에 그대로
// - 검색 0건: "‘검색어’가 들어간 대피소가 없습니다."
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
const MD = 768;
const LG = 1080;
const XL = 1440;
const WIDE = XL; // 폭과 무관한 동작은 한 폭에서만 본다
const TEST_TIMEOUT_MS = 120_000; // 쪽을 수십 번 넘기는 테스트가 있어 기본(30초)보다 길게
const ACTION_TIMEOUT_MS = 10_000; // 없는 버튼·검색창을 누를 때 테스트 시간 초과까지 기다리지 않게
const DATA_TIMEOUT_MS = 30_000; // 첫 페이지 컴파일·데이터가 들어와 위젯이 그려지기를 기다리는 시간
const TOLERANCE_PX = 1;
const PAGE_SIZE = 10; // 페이지당 카드 수(plan.md Q7)
const CARD_COLS = [1, 2, 1, 1]; // 폭 단계별 카드 열 수: [기본, md, lg, xl]
const NAME_PX = 14;
const ADDRESS_PX = 12;
const BOLD = 600; // "굵게" = font-weight 600 이상
const SEARCH_RENDER_MS = 200; // 입력부터 결과 반영까지 한도(인수 조건)
const MAX_TABS = 40; // 목표 요소까지 누를 Tab 최대 수(카드 링크 10개를 지나갈 여유 포함)

const TITLE = "내 주변 대피소";
const FIND_NEARBY = "내 주변 대피소 찾기";
const FIND_BY_REGION = "지역으로 찾기";
const LOCATION_FAILED = "위치를 쓸 수 없습니다. 지역으로 찾아 주세요.";
const SEARCH_LABEL = "결과에서 찾기";
const MAP_LINK = "지도에서 보기";
const PREV = "이전";
const NEXT = "다음";
const PUBLIC_KIND = "공공용시설"; // 대부분이 이 값이라 배지를 달지 않는 시설 구분
const SIDO = 'select[aria-label="시·도"]';
const SIGUNGU = 'select[aria-label="시·군·구"]';
const POLITE = '[aria-live="polite"]';
const LIVE = '[aria-live]:not([aria-live="off"]), [role="status"], [role="log"], [role="alert"]';
const KAKAO = /^https:\/\/map\.kakao\.com\//;
const DISTANCE = /약 ([\d,]+) m/;
const ANY_PAGE = /\d+ \/ \d+/;
const SEARCHING = /총 [\d,]+곳 중/;
const NOREFERRER = /(^|\s)noreferrer(\s|$)/;
const EMPTY_VALUE = /null|undefined|NaN/; // 빈 값이 글자로 새어 나온 흔적

type Region = { sido: string; sigungu: string };
const CHANGWON: Region = { sido: "경상남도", sigungu: "창원시" };
const CHANGWON_TOTAL = 527; // 인수 조건 "총 527곳"
const CHANGWON_PAGES = 53; // "1 / 53"
const CHANGWON_LAST_CARDS = 7; // 53쪽 카드 수
const SMALL: Region = { sido: "경상남도", sigungu: "하동군" }; // 10곳: 페이지 크기와 같은 "10곳 이하" 경계
const OTHER: Region = { sido: "경상남도", sigungu: "김해시" }; // 다른 지역 고르기용(85곳, 9쪽)
const SEOUL = { latitude: 37.5666, longitude: 126.9784 }; // 서울시청(5km 안 476곳, 48쪽)
const SEOUL_ALL = "서울특별시"; // 서울시청 5km 안 주소에 모두 있는 글자(결과를 줄이지 않는 검색어)
const COORD_NEEDLES = ["37.5", "126.9"]; // 서울시청 좌표의 원본·반올림 값이 모두 이 글자로 시작
const SCHOOL = "초등학교";
const JINHAE = "진해구"; // 창원시에서 주소에만 있고 여러 쪽(138곳)
const JINHAE_APT = "진해구 아파트"; // 두 단어 AND(78곳)
const PARKING = "주차장"; // 저장소 검사용 검색어
const NONE = "zzzz";
const noMatch = (q: string) => `‘${q}’가 들어간 대피소가 없습니다.`;

type Shelter = {
  name: string;
  address: string;
  lat: number;
  lon: number;
  distance_m: number | null;
  capacity: number | null;
  kind: string | null;
};
type ShelterResult = { available: boolean; as_of: string | null; items: Shelter[]; total?: number };

// 실데이터에 없는 경우(수용 인원 없음·kind 가 다른 값이나 null·total > items·total 없음)는 응답을 바꿔 확인
const MOCK_CAPPED: Region = { sido: "경상남도", sigungu: "의령군" };
const MOCK_NO_TOTAL: Region = { sido: "경상남도", sigungu: "함양군" };
const MOCK_COUNT = 12; // 한 쪽보다 많아 페이지 이동이 보이는 수
const MOCK_TOTAL = 1500; // 받은 수보다 큰 total(안전 상한에 걸린 경우)
const MOCK_CAPACITY = 1234;
const GOV_KIND = "정부지원시설";
const MOCK_ITEMS: Shelter[] = Array.from({ length: MOCK_COUNT }, (_, i) => ({
  name: `모의 대피소 ${String(i + 1).padStart(2, "0")}`,
  address: `경상남도 의령군 모의로 ${i + 1}`,
  lat: 35.32,
  lon: 128.26,
  distance_m: null,
  capacity: i === 0 ? null : MOCK_CAPACITY, // 1번: 수용 인원 없음
  kind: i === 1 ? GOV_KIND : i === 2 ? null : PUBLIC_KIND, // 2번: 정부지원시설, 3번: null
}));

const step = (w: number) => (w >= XL ? 3 : w >= LG ? 2 : w >= MD ? 1 : 0);
const fmt = (n: number) => n.toLocaleString("ko-KR");
const pageCount = (n: number) => Math.max(1, Math.ceil(n / PAGE_SIZE));
const totalOf = (r: ShelterResult) => r.total ?? r.items.length;
/** 현재 위치 "N / M"(앞뒤가 숫자가 아님. "11 / 53" 안의 "1 / 53" 은 아님) */
const pageRe = (n: number, m: number) => new RegExp(`(^|\\D)${n} / ${m}(\\D|$)`);
/** live 영역 안내 "N / M쪽" */
const announceRe = (n: number, m: number) => new RegExp(`(^|\\D)${n} / ${m}쪽`);
/** entities/shelter mapUrl 과 같은 카카오맵 링크 */
const mapUrl = (s: Shelter) => `https://map.kakao.com/link/map/${encodeURIComponent(s.name)},${s.lat},${s.lon}`;
/** 검색 정답(테스트 쪽): 공백으로 나눈 단어가 모두 이름 또는 주소에(대소문자 무시) */
const matching = (items: Shelter[], q: string) => {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((s) => words.every((w) => s.name.toLowerCase().includes(w) || s.address.toLowerCase().includes(w)));
};

/** 대피소 위젯. getByRole("region") 아래 evaluateAll 은 Firefox 페이지를 죽여서(Playwright 1.65) 제목으로 찾는다 */
const widgetOf = (page: Page) =>
  page.getByRole("heading", { name: TITLE, exact: true }).locator("xpath=ancestor::section[1]");
const searchOf = (w: Locator) =>
  w.getByRole("searchbox", { name: SEARCH_LABEL, exact: true }).or(w.getByRole("textbox", { name: SEARCH_LABEL, exact: true }));
/** 카드: "지도에서 보기" 링크를 품은 li */
const cardsOf = (w: Locator) => w.locator("li").filter({ has: w.page().locator("a", { hasText: MAP_LINK }) });
const prevOf = (w: Locator) => w.getByRole("button", { name: PREV, exact: true });
const nextOf = (w: Locator) => w.getByRole("button", { name: NEXT, exact: true });

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

async function expectNoPageOverflow(page: Page, label: string) {
  await settle(page);
  const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect.soft(m.scroll, `${label}: 가로 넘침`).toBeLessThanOrEqual(m.inner);
}

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto("/", { timeout: DATA_TIMEOUT_MS });
  await page.locator("main").waitFor({ timeout: DATA_TIMEOUT_MS });
  const widget = widgetOf(page);
  await expect(widget, "첫 화면 한국 선택 → 대피소 위젯").toBeVisible({ timeout: DATA_TIMEOUT_MS });
  return widget;
}

const isQuery = (url: string, key: "region" | "lat") => {
  const u = new URL(url);
  return u.pathname === "/api/shelters" && u.searchParams.has(key);
};

/** 지역 조회. 화면이 받은 응답(정답 데이터)을 돌려준다 */
async function pickRegion(widget: Locator, r: Region): Promise<ShelterResult> {
  const sido = widget.locator(SIDO);
  if (!(await sido.isVisible())) await widget.getByRole("button", { name: FIND_BY_REGION, exact: true }).click();
  await sido.selectOption(r.sido);
  const res = widget.page().waitForResponse((x) =>
    isQuery(x.url(), "region") && new URL(x.url()).searchParams.get("region") === `${r.sido} ${r.sigungu}`);
  await widget.locator(SIGUNGU).selectOption(r.sigungu);
  return (await res).json();
}

/** 위치 조회(좌표는 test.use 의 geolocation). 화면이 받은 응답을 돌려준다 */
async function findNearby(widget: Locator): Promise<ShelterResult> {
  const res = widget.page().waitForResponse((x) => isQuery(x.url(), "lat"));
  await widget.getByRole("button", { name: FIND_NEARBY, exact: true }).click();
  return (await res).json();
}

/** getCurrentPosition·watchPosition 호출 수를 window.__geoCalls 에 센다. deny 면 실제 위치 대신 거부(PERMISSION_DENIED) 콜백.
 *  Firefox 는 권한을 주지 않으면 팝업에서 멈춰(위젯 자체 포기 15초) 거부를 이렇게 흉내 낸다 */
const recordGeolocation = (page: Page, deny = false) => page.addInitScript((deny) => {
  const w = window as unknown as { __geoCalls: number };
  w.__geoCalls = 0;
  const proto = Geolocation.prototype;
  const get = proto.getCurrentPosition;
  const watch = proto.watchPosition;
  proto.getCurrentPosition = function (this: Geolocation, ...args: Parameters<Geolocation["getCurrentPosition"]>) {
    w.__geoCalls++;
    if (!deny) return get.apply(this, args);
    const denied = { code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
    setTimeout(() => args[1]?.(denied as GeolocationPositionError)); // 실제 브라우저처럼 비동기로
  };
  proto.watchPosition = function (this: Geolocation, ...args: Parameters<Geolocation["watchPosition"]>) {
    w.__geoCalls++;
    return watch.apply(this, args);
  };
}, deny);
const geoCalls = (page: Page) => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);

/** Tab(목표가 문서에서 앞이면 Shift+Tab)을 눌러 target 에 포커스가 갈 때까지. 닿으면 true */
async function tabTo(page: Page, target: Locator) {
  const backward = await target.evaluate((t) => {
    const a = document.activeElement;
    return !!a && a !== document.body && !!(a.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING);
  });
  for (let i = 0; i < MAX_TABS; i++) {
    if (await target.evaluate((t) => t === document.activeElement)) return true;
    await page.keyboard.press(backward ? "Shift+Tab" : "Tab");
  }
  return target.evaluate((t) => t === document.activeElement);
}

/** "다음"을 눌러 from+1 … to 쪽으로 차례로 넘기며, 쪽마다 visit 을 부른다 */
async function walk(w: Locator, count: number, from: number, to: number, visit?: () => Promise<void>) {
  for (let p = from + 1; p <= to; p++) {
    await nextOf(w).click();
    await expect(w, `${p}쪽으로 넘어감`).toContainText(pageRe(p, count));
    await visit?.();
  }
}

/** 페이지 이동(이전·다음 버튼, "N / M" 글자)이 DOM 에 없음. CSS 로 숨기기만 하면 실패 */
async function expectNoPager(w: Locator, label: string) {
  for (const name of [PREV, NEXT]) {
    const button = w.getByRole("button", { name, exact: true, includeHidden: true });
    await expect.soft(button, `${label}: "${name}" 버튼이 DOM 에 없음`).toHaveCount(0);
  }
  await expect.soft(w.getByText(ANY_PAGE), `${label}: 현재 위치 글자가 DOM 에 없음`).toHaveCount(0);
}

type Box = { top: number; bottom: number; right: number; weight: number; size: number };
type CardFact = {
  left: number;
  text: string;
  name: Box | null;
  address: Box | null;
  badge: Box | null;
  contentRight: number | null; // 이름·주소·배지 공통 조상의 padding 안쪽 오른쪽 끝
  link: { href: string | null; target: string | null; rel: string | null } | null;
};

/** 카드마다 이름·주소·거리 배지 요소(그 글자만 담은 가장 안쪽 요소)의 글꼴·위치와 카드 글자·지도 링크를 한 번에 잰다 */
const cardFacts = (cards: Locator, want: { name: string; address: string; badge?: string }[]) =>
  cards.evaluateAll((els, { want, mapLink }) => els.map((card, i): CardFact => {
    const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
    const find = (t?: string) => {
      if (!t) return null;
      const hits = [...card.querySelectorAll("*")].filter((e) => norm(e.textContent) === norm(t));
      return hits.find((e) => !hits.some((o) => o !== e && e.contains(o))) ?? null;
    };
    const box = (e: Element | null) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return { top: r.top, bottom: r.bottom, right: r.right, weight: Number(s.fontWeight), size: parseFloat(s.fontSize) };
    };
    const name = find(want[i]?.name);
    const address = find(want[i]?.address);
    const badge = find(want[i]?.badge);
    const parts = [name, address, badge].filter((e): e is Element => e !== null);
    let common: Element | null = parts[0] ?? null;
    while (common && !parts.every((p) => common!.contains(p))) common = common.parentElement;
    const cs = common ? getComputedStyle(common) : null;
    const link = [...card.querySelectorAll("a")].find((a) => norm(a.textContent).includes(mapLink));
    return {
      left: Math.round(card.getBoundingClientRect().left),
      text: norm(card.textContent),
      name: box(name),
      address: box(address),
      badge: box(badge),
      contentRight: common && cs
        ? common.getBoundingClientRect().right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
        : null,
      link: link ? { href: link.getAttribute("href"), target: link.getAttribute("target"), rel: link.getAttribute("rel") } : null,
    };
  }), { want, mapLink: MAP_LINK });

/** 카드 구성: 이름(굵게·14px), 주소(12px), 수용 인원(있을 때만), 지도 링크(새 탭), kind 배지(공공용시설이 아닐 때만),
 *  거리 배지(위치 조회만, 오른쪽 위) */
function expectCard(f: CardFact, s: Shelter, nearby: boolean) {
  const label = s.name;
  expect.soft(f.name, `${label}: 이름만 담은 요소`).not.toBeNull();
  expect.soft(f.name?.weight, `${label}: 이름 굵기`).toBeGreaterThanOrEqual(BOLD);
  expect.soft(f.name?.size, `${label}: 이름 글자 크기`).toBeCloseTo(NAME_PX, 0);
  expect.soft(f.address, `${label}: 주소만 담은 요소`).not.toBeNull();
  expect.soft(f.address?.size, `${label}: 주소 글자 크기`).toBeCloseTo(ADDRESS_PX, 0);
  if (s.capacity != null) expect.soft(f.text, `${label}: 수용 인원`).toContain(`수용 ${fmt(s.capacity)}명`);
  else expect.soft(f.text, `${label}: 수용 인원이 없으면 표시 안 함`).not.toContain("수용");
  if (s.kind && s.kind !== PUBLIC_KIND) expect.soft(f.text, `${label}: 시설 구분 배지`).toContain(s.kind);
  else expect.soft(f.text, `${label}: 공공용시설 배지 없음`).not.toContain(PUBLIC_KIND);
  expect.soft(f.text, `${label}: 빈 값 표기`).not.toMatch(EMPTY_VALUE);
  expect.soft(f.link?.target, `${label}: 지도 링크 새 탭`).toBe("_blank");
  expect.soft(f.link?.rel ?? "", `${label}: 지도 링크 rel`).toMatch(NOREFERRER);
  expect.soft(f.link?.href, `${label}: 지도 링크 주소`).toBe(mapUrl(s));
  if (!nearby) {
    expect.soft(f.text, `${label}: 지역 조회는 거리 배지 없음`).not.toMatch(DISTANCE);
    return;
  }
  expect.soft(f.badge, `${label}: 거리 배지 "약 N m"`).not.toBeNull();
  if (f.badge && f.address && f.contentRight !== null) {
    expect.soft(Math.abs(f.badge.right - f.contentRight), `${label}: 거리 배지 오른쪽 끝`).toBeLessThanOrEqual(TOLERANCE_PX);
    expect.soft(f.badge.bottom, `${label}: 거리 배지가 주소 위`).toBeLessThanOrEqual(f.address.top + TOLERANCE_PX);
  }
}

/** 카드마다 거리 배지 숫자(m). 배지가 없으면 null */
const distances = (cards: Locator) => cards.evaluateAll((els, src) => els.map((e) => {
  const m = new RegExp(src).exec(e.textContent ?? "");
  return m ? Number(m[1].replace(/,/g, "")) : null;
}), DISTANCE.source);

/** 넘치는 카드(까닭: 글자 앞부분). 인수 조건 scrollWidth > clientWidth 에 더해, 긴 내용에 카드째 넓어져
 *  scrollWidth = clientWidth 인 채로 화면 밖까지 나간 카드도 센다(지금 목록에 2000px 글자를 넣어 보니 카드가 같이 늘어남) */
const overflowing = (cards: Locator) => cards.evaluateAll((els, tolerance) => els.flatMap((e) => {
  const why = e.scrollWidth > e.clientWidth ? "scrollWidth > clientWidth"
    : e.getBoundingClientRect().right > document.documentElement.clientWidth + tolerance ? "화면 밖" : null;
  return why ? [`${why}: ${(e.textContent ?? "").slice(0, 40)}`] : [];
}), TOLERANCE_PX);

type Want = { keyword: string; count: string; cards: number; page: string | null };
/** 검색창에 value 를 넣고 input 이벤트부터 화면이 want 를 모두 만족한 첫 DOM 변경까지 걸린 시간(ms).
 *  "200ms 안에"를 Playwright 왕복 시간 없이 재려고 페이지 안 MutationObserver 로 잰다. 끝내 만족하지 않으면 실패 */
async function inputToRender(search: Locator, widget: Locator, value: string, want: Want) {
  const page = search.page();
  const [input, root] = await Promise.all([search.elementHandle(), widget.elementHandle()]);
  await page.evaluate(({ input, root, want, mapLink }) => {
    const t: { input?: number; done?: number } = {};
    (window as unknown as { __searchTiming: typeof t }).__searchTiming = t;
    const ok = () => {
      const cards = [...root.querySelectorAll("li")]
        .filter((li) => [...li.querySelectorAll("a")].some((a) => (a.textContent ?? "").includes(mapLink)));
      const text = root.textContent ?? "";
      return cards.length === want.cards
        && cards.every((c) => (c.textContent ?? "").includes(want.keyword))
        && text.includes(want.count)
        && (want.page === null || new RegExp(`(^|\\D)${want.page}(\\D|$)`).test(text));
    };
    // window 캡처 단계라 앱의 어떤 input 리스너보다 먼저 시각을 남긴다
    window.addEventListener("input", (e) => {
      if (e.target === input) t.input ??= performance.now();
    }, { capture: true });
    new MutationObserver((_, observer) => {
      if (t.input === undefined || !ok()) return;
      t.done = performance.now();
      observer.disconnect();
    }).observe(root, { subtree: true, childList: true, characterData: true });
  }, { input, root, want, mapLink: MAP_LINK });
  await search.fill(value);
  const timing = () => page.evaluate(() => (window as unknown as { __searchTiming: { input?: number; done?: number } }).__searchTiming);
  await expect.poll(async () => (await timing()).done !== undefined, { message: "검색 결과가 조건대로 그려짐" }).toBe(true);
  const t = await timing();
  return t.done! - t.input!;
}

// 측정 단언은 expect.soft 라 한 번 실행으로 어긋난 조건을 모두 보여 준다(요소가 있는지 같은 전제만 바로 멈춤)
test.describe.configure({ timeout: TEST_TIMEOUT_MS });
test.use({ actionTimeout: ACTION_TIMEOUT_MS });

for (const width of WIDTHS) {
  test.describe(`${width}px`, () => {
    test("지역 조회(창원시): 총 527곳·1 / 53·카드 10개·열 수·카드 구성, 다음 52번 → 53 / 53·카드 7개", async ({ page }) => {
      const errors = trackErrors(page);
      const widget = await open(page, width);
      await expect.soft(searchOf(widget), "조회 전에는 검색창 없음").toHaveCount(0);
      // 건수 live 영역은 결과보다 먼저 DOM 에 있어야 결과 도착 때 바뀐 글자를 읽는다(#25 리뷰: 새로 붙은 live 영역은 안 읽는 스크린리더가 많음)
      const liveBefore = await widget.locator(POLITE).elementHandles();
      const data = await pickRegion(widget, CHANGWON);
      expect(totalOf(data), "창원시 대피소 수(로컬 데이터)").toBe(CHANGWON_TOTAL);
      expect(data.items, "안전 상한(1000) 안이라 전부 받음").toHaveLength(CHANGWON_TOTAL);

      const cards = cardsOf(widget);
      await expect.soft(searchOf(widget), "결과가 있으면 검색창").toBeVisible();
      await expect(widget).toContainText(`총 ${fmt(CHANGWON_TOTAL)}곳`);
      const countLive = widget.locator(POLITE).filter({ hasText: `총 ${fmt(CHANGWON_TOTAL)}곳` });
      expect.soft(await countLive.evaluate((el, before) => before.includes(el), liveBefore), "건수 live 영역이 결과 전부터 DOM 에 있음")
        .toBe(true);
      await expect.soft(widget, "검색 전에는 \"중 M곳\" 없음").not.toContainText(SEARCHING);
      await expect(widget).toContainText(pageRe(1, CHANGWON_PAGES));
      await expect(cards).toHaveCount(PAGE_SIZE);
      await expect.soft(prevOf(widget), "1쪽에서 이전").toBeDisabled();
      await expect.soft(nextOf(widget), "1쪽에서 다음").toBeEnabled();

      await settle(page);
      const facts = await cardFacts(cards, data.items.slice(0, PAGE_SIZE));
      expect.soft(new Set(facts.map((f) => f.left)).size, "카드 열 수").toBe(CARD_COLS[step(width)]);
      facts.forEach((f, i) => expectCard(f, data.items[i], false));
      // 이 이슈는 내부 스크롤 없이 쪽 단위로만 보여 준다(할 일 4)
      const scrollers = await widget.evaluate((el) => [...el.querySelectorAll("*")]
        .filter((e) => /auto|scroll/.test(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1)
        .map((e) => e.tagName));
      expect.soft(scrollers, "위젯 안 내부 스크롤 영역").toEqual([]);
      await expectNoPageOverflow(page, "1쪽");

      // 360 은 모든 쪽의 카드가 넘치지 않는지 본다
      const overflow = width < MD ? await overflowing(cards) : [];
      const visit = async () => {
        if (width < MD) overflow.push(...(await overflowing(cards)));
      };
      await walk(widget, CHANGWON_PAGES, 1, 2, visit);
      await expect.soft(cards.first(), "쪽을 바꾸면 결과 목록 맨 위로(첫 카드가 화면 안)").toBeInViewport({ ratio: 1 });
      await walk(widget, CHANGWON_PAGES, 2, CHANGWON_PAGES, visit); // 1쪽부터 합쳐 "다음" 52번

      await expect(cards, "53쪽 카드 수").toHaveCount(CHANGWON_LAST_CARDS);
      await expect.soft(nextOf(widget), "마지막 쪽에서 다음").toBeDisabled();
      await expect.soft(prevOf(widget), "마지막 쪽에서 이전").toBeEnabled();
      expect.soft(overflow, "넘치는 카드(360)").toEqual([]);
      await expectNoPageOverflow(page, "53쪽");
      expect.soft(errors, "콘솔 오류").toEqual([]);
    });

    test("위치 거부: 안내 문구·지역 선택, 가로 넘침 없음·콘솔 오류 0건", async ({ page }) => {
      const errors = trackErrors(page);
      await recordGeolocation(page, true);
      const widget = await open(page, width);
      await widget.getByRole("button", { name: FIND_NEARBY, exact: true }).click();
      await expect(widget.getByText(LOCATION_FAILED, { exact: true })).toBeVisible();
      await expect(widget.locator(SIDO), "거부하면 지역 선택이 열림").toBeVisible();
      await expect.soft(searchOf(widget), "결과가 없으면 검색창 없음").toHaveCount(0);
      await expectNoPageOverflow(page, "위치 거부");
      expect.soft(errors, "콘솔 오류").toEqual([]);
    });

    test.describe("위치 허용", () => {
      test.use({ geolocation: SEOUL, permissions: ["geolocation"] });

      test("위치 조회(서울시청): 거리 배지·거리 오름차순, 쪽을 넘겨도 이어짐, 가로 넘침 없음·콘솔 오류 0건", async ({ page }) => {
        const errors = trackErrors(page);
        const widget = await open(page, width);
        const data = await findNearby(widget);
        const count = pageCount(data.items.length);
        expect(count, "서울시청 5km 안 대피소가 여러 쪽이어야 이어짐 검사 가능").toBeGreaterThan(1);

        const cards = cardsOf(widget);
        await expect(widget).toContainText(`총 ${fmt(totalOf(data))}곳`);
        await expect(widget).toContainText(pageRe(1, count));
        await expect(cards).toHaveCount(PAGE_SIZE);
        await settle(page);
        const first = data.items.slice(0, PAGE_SIZE);
        const facts = await cardFacts(cards, first.map((s) => ({ ...s, badge: `약 ${fmt(s.distance_m ?? NaN)} m` })));
        expect.soft(new Set(facts.map((f) => f.left)).size, "카드 열 수").toBe(CARD_COLS[step(width)]);
        facts.forEach((f, i) => expectCard(f, first[i], true));

        // 360 은 마지막 쪽까지(카드 넘침도 모든 쪽), 나머지 폭은 1쪽 → 2쪽 이음만 본다
        const seen = await distances(cards);
        const overflow = width < MD ? await overflowing(cards) : [];
        await walk(widget, count, 1, width < MD ? count : 2, async () => {
          seen.push(...(await distances(cards)));
          if (width < MD) overflow.push(...(await overflowing(cards)));
        });
        expect.soft(seen.filter((d) => d === null).length, "거리 배지 없는 카드 수").toBe(0);
        const drops = seen.flatMap((d, i) => {
          const before = seen[i - 1];
          return i > 0 && d !== null && before != null && d < before ? [`${i + 1}번째 카드: ${before} → ${d}`] : [];
        });
        expect.soft(drops, "앞 카드보다 가까워진 거리(오름차순 깨짐)").toEqual([]);
        expect.soft(seen[PAGE_SIZE - 1] ?? Infinity, "1쪽 마지막 거리 ≤ 2쪽 첫 거리").toBeLessThanOrEqual(seen[PAGE_SIZE] ?? -Infinity);
        expect.soft(overflow, "넘치는 카드(360)").toEqual([]);
        await expectNoPageOverflow(page, "위치 조회");
        expect.soft(errors, "콘솔 오류").toEqual([]);
      });
    });
  });
}

test.describe("폭과 무관한 동작", () => {
  test("검색: '초등학교' 200ms 안에 반영·1쪽·총 527곳 중 M곳, 입력이 바뀌면 1쪽, 'zzzz' 0건 문구·페이지 이동 없음", async ({ page }) => {
    const widget = await open(page, WIDE);
    const data = await pickRegion(widget, CHANGWON);
    const search = searchOf(widget);
    const cards = cardsOf(widget);
    await expect(search).toBeVisible();
    await expect(widget).toContainText(pageRe(1, CHANGWON_PAGES));
    await walk(widget, CHANGWON_PAGES, 1, 3); // 3쪽에서 입력해 1쪽으로 돌아가는지 본다

    const school = matching(data.items, SCHOOL);
    expect(school.length, "창원시에 '초등학교'가 든 대피소가 있어야 검사 가능").toBeGreaterThan(0);
    const schoolCount = `총 ${fmt(CHANGWON_TOTAL)}곳 중 ${fmt(school.length)}곳`;
    const schoolPages = pageCount(school.length);
    // "200ms 안에": 입력 이벤트부터 카드·건수·쪽 조건을 모두 만족한 첫 DOM 변경까지를 페이지 안에서 잰다.
    // Playwright 왕복 시간이 빠져 기계가 느려도 흔들리지 않는다(입력 직후 바로 단언하는 방식보다 엄격·안정)
    const ms = await inputToRender(search, widget, SCHOOL, {
      keyword: SCHOOL,
      count: schoolCount,
      cards: Math.min(PAGE_SIZE, school.length),
      page: schoolPages > 1 ? `1 / ${schoolPages}` : null,
    });
    expect.soft(ms, "입력부터 결과 반영까지(ms)").toBeLessThanOrEqual(SEARCH_RENDER_MS);
    await expect(widget).toContainText(schoolCount);
    await expect(cards).toHaveCount(Math.min(PAGE_SIZE, school.length));
    for (const t of await cards.allTextContents()) expect.soft(t, "카드 이름 또는 주소에 '초등학교'").toContain(SCHOOL);
    if (schoolPages > 1) await expect(widget, "1쪽").toContainText(pageRe(1, schoolPages));
    else await expectNoPager(widget, `'${SCHOOL}' ${school.length}곳`); // 한 쪽이면 1쪽뿐이고 페이지 이동 없음

    // 주소에만 있는 단어: 여러 쪽이고 1쪽부터
    const jinhae = matching(data.items, JINHAE);
    const jinhaePages = pageCount(jinhae.length);
    expect(jinhaePages, "'진해구' 결과가 3쪽 이상이어야 1쪽 복귀 검사 가능").toBeGreaterThanOrEqual(3);
    await search.fill(JINHAE);
    await expect(widget).toContainText(`총 ${fmt(CHANGWON_TOTAL)}곳 중 ${fmt(jinhae.length)}곳`);
    await expect(widget, "입력이 바뀌면 1쪽").toContainText(pageRe(1, jinhaePages));
    for (const t of await cards.allTextContents()) expect.soft(t, "주소에 '진해구'").toContain(JINHAE);

    // 3쪽에서 입력을 바꾸면(두 단어 AND) 1쪽
    await walk(widget, jinhaePages, 1, 3);
    const both = matching(data.items, JINHAE_APT);
    expect(pageCount(both.length), "'진해구 아파트' 결과가 두 쪽 이상이어야 검사 가능").toBeGreaterThan(1);
    await search.fill(JINHAE_APT);
    await expect(widget).toContainText(`총 ${fmt(CHANGWON_TOTAL)}곳 중 ${fmt(both.length)}곳`);
    await expect(widget, "입력이 바뀌면 1쪽").toContainText(pageRe(1, pageCount(both.length)));
    for (const t of await cards.allTextContents()) {
      for (const w of JINHAE_APT.split(" ")) expect.soft(t, `두 단어 모두: ${w}`).toContain(w);
    }

    // 0건: 문구, 카드·페이지 이동 없음, 검색창은 남음
    await search.fill(NONE);
    await expect(widget.getByText(noMatch(NONE), { exact: true }), "0건 문구").toBeVisible();
    await expect(cards).toHaveCount(0);
    await expectNoPager(widget, "0건");
    await expect.soft(search, "0건이어도 검색창은 남음").toBeVisible();

    // 검색어를 지우면 다시 전체
    await search.fill("");
    await expect(widget).toContainText(`총 ${fmt(CHANGWON_TOTAL)}곳`);
    await expect(widget).not.toContainText(SEARCHING);
    await expect(widget).toContainText(pageRe(1, CHANGWON_PAGES));
    await expect(cards).toHaveCount(PAGE_SIZE);
  });

  test("10곳 이하 지역(경상남도 하동군): 페이지 이동이 DOM 에 없음", async ({ page }) => {
    const widget = await open(page, WIDE);
    const data = await pickRegion(widget, SMALL);
    const n = totalOf(data);
    expect(n, "하동군은 1곳 이상(로컬 데이터)").toBeGreaterThan(0);
    expect(n, "하동군은 10곳 이하(로컬 데이터)").toBeLessThanOrEqual(PAGE_SIZE);
    await expect.soft(searchOf(widget), "1곳 이상이면 검색창").toBeVisible();
    await expect(widget).toContainText(`총 ${fmt(n)}곳`);
    await expect(cardsOf(widget)).toHaveCount(n);
    await expectNoPager(widget, `${n}곳`);
  });

  test("키보드·스크린리더: 검색창 이름, Tab·Enter·Space 로 검색창·페이지 버튼·지도 링크, live 영역은 쪽 안내만", async ({ page, browserName }) => {
    // 지도 링크 새 탭이 외부 사이트로 나가지 않게 가짜 응답
    await page.context().route(KAKAO, (r) => r.fulfill({ contentType: "text/html", body: "<title>지도</title>" }));
    const widget = await open(page, WIDE);
    const data = await pickRegion(widget, CHANGWON);
    const search = searchOf(widget);
    await expect(search).toBeVisible();
    await expect.soft(search, "검색창 접근 가능한 이름").toHaveAccessibleName(SEARCH_LABEL);

    // 시·군·구 선택 상자에서 Tab 으로 검색창까지 가서 입력(단어 사이 Space 포함)
    await widget.locator(SIGUNGU).focus();
    expect(await tabTo(page, search), "Tab 으로 검색창").toBe(true);
    await page.keyboard.type(JINHAE_APT);
    const n = matching(data.items, JINHAE_APT).length;
    const count = pageCount(n);
    expect(count, "검색 결과가 4쪽 이상이어야 버튼 검사 가능").toBeGreaterThanOrEqual(4);
    const counted = `총 ${fmt(CHANGWON_TOTAL)}곳 중 ${fmt(n)}곳`;
    await expect(widget).toContainText(counted);
    await expect(widget).toContainText(pageRe(1, count));
    // 검색창에서 Enter: 폼 제출로 새로 고치거나 주소에 검색어를 남기지 않음
    const url = page.url();
    await page.keyboard.press("Enter");
    await expect.soft(search, "Enter 뒤 검색어 유지").toHaveValue(JINHAE_APT);
    await expect.soft(widget, "Enter 뒤 결과 유지").toContainText(counted);
    expect.soft(page.url(), "Enter 뒤 주소 그대로").toBe(url);

    // 다음: Enter(2쪽)·Space(3쪽)·Enter(4쪽). 포커스는 버튼에 그대로(건수 문구로 옮기지 않음), live 영역이 쪽 안내
    const next = nextOf(widget);
    expect(await tabTo(page, next), "Tab 으로 다음 버튼").toBe(true);
    for (const [key, p] of [["Enter", 2], ["Space", 3], ["Enter", 4]] as const) {
      await page.keyboard.press(key);
      await expect(widget, `다음에서 ${key}`).toContainText(pageRe(p, count));
      await expect.soft(next, `${key} 뒤 포커스는 다음 버튼`).toBeFocused();
      await expect.soft(widget.locator(POLITE).filter({ hasText: announceRe(p, count) }), `aria-live 안내 "${p} / ${count}쪽"`)
        .not.toHaveCount(0);
    }
    // 이전: Space(3쪽)·Enter(2쪽)·Enter(1쪽). 끝 쪽 버튼은 aria-disabled 라 1쪽에 닿아도 포커스를 잃지 않고
    // 더 눌러도 1쪽 그대로(#25 리뷰: disabled 면 브라우저가 그 버튼의 포커스를 버림)
    const prev = prevOf(widget);
    expect(await tabTo(page, prev), "Tab 으로 이전 버튼").toBe(true);
    for (const [key, p] of [["Space", 3], ["Enter", 2], ["Enter", 1]] as const) {
      await page.keyboard.press(key);
      await expect(widget, `이전에서 ${key}`).toContainText(pageRe(p, count));
      await expect.soft(prev, `${key} 뒤 포커스는 이전 버튼`).toBeFocused();
    }
    await expect.soft(prev, "1쪽에서 이전").toBeDisabled();
    await page.keyboard.press("Enter");
    await expect.soft(widget, "1쪽에서 이전을 또 눌러도 1쪽").toContainText(pageRe(1, count));
    await expect.soft(prev, "1쪽에 닿은 뒤에도 포커스는 이전 버튼").toBeFocused();

    // live 영역은 카드 목록을 품지 않음(쪽을 바꿀 때마다 수백 곳을 읽지 않게, #24 리뷰)
    await expect(cardsOf(widget).first()).toBeVisible();
    await expect.soft(widget.locator(LIVE).locator("a", { hasText: MAP_LINK }), "live 영역 안 카드").toHaveCount(0);

    // 지도 링크: Enter 로 새 탭. WebKit 은 Tab 이 링크를 건너뛰어(footer.spec.ts) focus() 로 옮긴 뒤 Enter 만 본다
    const link = cardsOf(widget).first().locator("a", { hasText: MAP_LINK });
    if (browserName === "webkit") await link.focus();
    else expect(await tabTo(page, link), "Tab 으로 지도 링크").toBe(true);
    const popup = page.context().waitForEvent("page");
    await page.keyboard.press("Enter");
    const tab = await popup;
    await tab.waitForURL(KAKAO);
    await tab.close();
  });

  test("모의 응답: 수용 인원 없음·kind 배지, total > items 면 상위 L곳 안내, total 없으면 받은 수", async ({ page }) => {
    const mocks = new Map<string, ShelterResult>([
      [`${MOCK_CAPPED.sido} ${MOCK_CAPPED.sigungu}`, { available: true, as_of: null, items: MOCK_ITEMS, total: MOCK_TOTAL }],
      [`${MOCK_NO_TOTAL.sido} ${MOCK_NO_TOTAL.sigungu}`, { available: true, as_of: null, items: MOCK_ITEMS }], // 예전 응답
    ]);
    const regionOf = (url: URL) => url.searchParams.get("region") ?? "";
    await page.route((url) => url.pathname === "/api/shelters" && mocks.has(regionOf(url)), (route) => route.fulfill({
      json: mocks.get(regionOf(new URL(route.request().url()))),
      headers: { "access-control-allow-origin": "*" }, // 프론트(3000)가 백엔드(8000)를 부르는 교차 출처 요청
    }));
    const errors = trackErrors(page);
    const widget = await open(page, WIDE);
    const cards = cardsOf(widget);

    await pickRegion(widget, MOCK_CAPPED);
    await expect(widget).toContainText(`총 ${fmt(MOCK_TOTAL)}곳`);
    await expect(widget, "안전 상한 안내").toContainText(`상위 ${fmt(MOCK_COUNT)}곳만 표시`);
    await expect(widget).toContainText(pageRe(1, pageCount(MOCK_COUNT)));
    await expect(cards).toHaveCount(PAGE_SIZE);
    const facts = await cardFacts(cards, MOCK_ITEMS.slice(0, PAGE_SIZE));
    facts.forEach((f, i) => expectCard(f, MOCK_ITEMS[i], false));

    await pickRegion(widget, MOCK_NO_TOTAL);
    await expect(widget, "total 이 없으면 받은 수").toContainText(`총 ${fmt(MOCK_COUNT)}곳`);
    await expect.soft(widget, "total 이 없으면 상한 안내 없음").not.toContainText("상위");
    await expect.soft(widget, "빈 값 표기").not.toContainText(EMPTY_VALUE);
    expect.soft(errors, "콘솔 오류").toEqual([]);
  });

  test.describe("위치 허용", () => {
    test.use({ geolocation: SEOUL, permissions: ["geolocation"] });

    test("새 조회: 다른 지역을 고르거나 위치 조회를 다시 하면 검색창이 비고 1쪽", async ({ page }) => {
      const widget = await open(page, WIDE);
      const search = searchOf(widget);
      /** 검색어를 넣고 2쪽으로 넘긴 상태로 만든다 */
      const dirty = async (data: ShelterResult, q: string) => {
        const n = matching(data.items, q).length;
        expect(pageCount(n), `'${q}' 결과가 두 쪽 이상이어야 검사 가능`).toBeGreaterThan(1);
        await search.fill(q);
        await expect(widget).toContainText(pageRe(1, pageCount(n)));
        await walk(widget, pageCount(n), 1, 2);
      };
      const expectFresh = async (data: ShelterResult, label: string) => {
        await expect(search, `${label}: 검색창 비움`).toHaveValue("");
        await expect(widget, `${label}: 1쪽`).toContainText(pageRe(1, pageCount(data.items.length)));
        await expect(widget, `${label}: 검색 없는 건수`).toContainText(`총 ${fmt(totalOf(data))}곳`);
        await expect(widget, `${label}: "중 M곳" 없음`).not.toContainText(SEARCHING);
      };

      const changwon = await pickRegion(widget, CHANGWON);
      await expect(search).toBeVisible();
      await dirty(changwon, JINHAE);
      const other = await pickRegion(widget, OTHER);
      await expectFresh(other, "다른 지역");

      await dirty(other, OTHER.sigungu);
      const near = await findNearby(widget);
      await expectFresh(near, "지역 → 위치 조회");

      await dirty(near, SEOUL_ALL);
      await widget.getByRole("button", { name: FIND_NEARBY, exact: true }).click();
      await expectFresh(near, "위치 조회 다시");
    });

    test("저장소: 위치 요청·검색 뒤 localStorage·sessionStorage·쿠키에 좌표·검색어 없음", async ({ page }) => {
      const widget = await open(page, WIDE);
      const near = await findNearby(widget);
      await expect(cardsOf(widget).first()).toBeVisible();
      const expectNotStored = async (label: string, needles: string[]) => {
        const web = await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]));
        const stored = `${web}\n${JSON.stringify(await page.context().cookies())}`;
        for (const needle of needles) expect.soft(stored, `${label}: "${needle}" 저장 안 함`).not.toContain(needle);
      };
      await expectNotStored("위치 요청 뒤", COORD_NEEDLES);

      const m = matching(near.items, PARKING).length;
      expect(m, "검색 결과가 있어야 건수 문구로 반영 확인").toBeGreaterThan(0);
      await expect(searchOf(widget)).toBeVisible();
      await searchOf(widget).fill(PARKING);
      await expect(widget).toContainText(`총 ${fmt(totalOf(near))}곳 중 ${fmt(m)}곳`);
      await expectNotStored("검색 뒤", [...COORD_NEEDLES, PARKING, encodeURIComponent(PARKING)]);
    });

    test("위치 요청: 홈을 열고 버튼을 누르기 전에는 위치를 묻지 않음", async ({ page }) => {
      await recordGeolocation(page);
      const widget = await open(page, WIDE);
      await expect(page.getByText("불러오는 중")).toHaveCount(0, { timeout: DATA_TIMEOUT_MS });
      await settle(page);
      expect(await geoCalls(page), "버튼 전 위치 요청 수").toBe(0);
      await widget.getByRole("button", { name: FIND_NEARBY, exact: true }).click();
      await expect.poll(() => geoCalls(page), "버튼을 누르면 한 번(계측이 동작하는지)").toBe(1);
      await expect(cardsOf(widget).first(), "허용한 위치로 결과").toBeVisible();
    });
  });
});
