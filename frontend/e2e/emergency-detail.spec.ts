import { expect, test, type Locator, type Page } from "@playwright/test";
import { ALERT_SOURCES, CIVIL_ALERTS, type CivilAlert } from "../src/entities/guide/model/alerts";
import { API_BASE_URL, SITE_URL } from "../src/shared/config/env";

// 이슈 #104(1-5) 경보 상세 페이지 /emergency/[alert] 실측. 기준 화면 폭(360·768·1080·1440)
// 내용은 CIVIL_ALERTS(when·signal·actions·keyActions·siren)·ALERT_SOURCES 와 비교한다. 소스 쪽 계약(서버 컴포넌트·토큰 색만·
// text-alert-* 글자 그대로)은 tests/test_m13_emergency.py, 아이콘 고지·llms.txt 는 tests/test_m17_alert_detail.py,
// 명도 대비는 contrast.spec.ts 의 "경보 상세 기본(공습경보)"·"경보 상세 더 보기 펼침(핵경보)" 상태.
// 빌드 경로 표(/emergency/[alert] 가 ƒ 아님, 사전 렌더 5개)는 npm run build 로 확인한다
//
// 화면 선택자 계약 (구현은 이 계약을 따른다)
// - 경로 /emergency/<경보 id>(CIVIL_ALERTS id 5개 글자 그대로). 목록 밖 id 는 대소문자만 달라도 404. 내용은 <main> 안
// - 메타데이터: <title> 에 "<경보 이름> 행동요령", canonical·og:url 경로가 /emergency/<id>(절대 주소면 경로),
//   og·twitter 제목은 "<경보 이름> 행동요령", 설명(description)은 when 과 keyActions 3문장을 글자 그대로 담고 og·twitter 설명과 같다.
//   루트 값(og:site_name·locale·type, 파일 기반 og:image /opengraph-image)은 그대로 붙는다(#98 방식). 푸터(SiteFooter)는 HTML 에 있다
// - 머리말: 접근 이름에 "비상 대비"가 든 링크 하나(글자 "← 비상 대비", href="/emergency"). h1(페이지에 하나)의 접근 이름은
//   경보 이름 그대로, 그 안에 svg 하나(aria-hidden="true"). when 글자와 고지 문구 NOTICE.
//   siren 이 true 인 경보(공습·핵)만 글자가 정확히 "사이렌"인 요소 하나가 h1 밖, h1 과 같은 줄에 있다(다른 경보는 0개)
// - 핵심 행동: 접근 이름 "지금 할 일 3가지"인 heading 다음 첫 ol. 바로 아래 li 가 keyActions 순서대로 3개
//   - li 마다 svg 하나(aria-hidden="true", 도형 요소 하나 이상)
//   - 번호는 목록 표시(li 가 display: list-item·list-style-type: decimal, 크기는 ::marker 글자) 또는 번호 요소(글자가 그 항목 번호
//     "1"·"2"·"3"(뒤 "." 허용)뿐인 보이는 요소)로 그린다. li 글자에서 번호 요소 글자를 뺀 나머지가 keyActions text 그대로
//   - 번호 글자 24px 이상, 문장(text 글자를 담은 요소) 글자 18px 이상. 열 수(li left 위치 수): 360·768 1열, 1080·1440 3열
// - 대피소 링크: 공습·핵 페이지에만 접근 이름이 정확히 "가까운 대피소 찾기"인 링크 하나(href="/#shelters", 높이 44px 이상,
//   안에 svg 하나 aria-hidden="true"). 다른 경보는 0개.
//   누르면 /#shelters 로 가고, 제목 "내 주변 대피소"가 처음 보인 프레임부터 1초 안에 그 section 윗변이 화면 안(-1px ≤ top < innerHeight)이고
//   포커스가 그 section 안 "내 주변 대피소 찾기" 버튼이다(shelter-anchor.spec.ts 와 같은 기준). 데이터가 다 들어온 뒤에도 그대로이고
//   그동안 위치 요청 0회. 브라우저 뒤로 가기로 상세에 돌아와 다시 눌러도 같다(#103 bfcacheId: 앱 안 이동마다 한 번)
// - 더 보기: main 안 details 하나. 처음엔 닫힘(open 없음), summary 글자에 "더 보기". Tab 으로 summary 에 닿고 Enter 로 열린다.
//   그 안에 signal 글자, ol 하나(바로 아래 li 가 actions 순서대로 글자 그대로, 번호는 목록 표시: display list-item·list-style-type none 아님),
//   출처(sources 의 키마다 a[href=url] 하나, target="_blank", rel 에 noreferrer, 이름과 확인일 checkedAt 글자 그대로)
// - 정적 페이지: 브라우저가 API 주소로 요청하지 않는다. 자바스크립트 실행 전 HTML(<script>·<title>·<meta> 밖 body)에
//   경보 이름, keyActions 3문장, actions 문장 전부, safekorea.go.kr 출처 링크(href). sitemap.xml 에 <SITE_URL>/emergency/<id> 5개
const WIDTHS = [360, 768, 1080, 1440];
const HEIGHT = 900;
const NARROW = 360; // 폭과 무관한 내용은 가장 좁은 폭에서 본다(홈 대피소 영역이 첫 화면 밖이라 스크롤도 확인됨)
const MD = 768;
const LG = 1080;
const XL = 1440;
const TEST_TIMEOUT_MS = 120_000; // 대피소 흐름은 홈 데이터 대기(최대 30초)를 두 번 해 기본(30초)보다 길게
const DATA_TIMEOUT_MS = 30_000; // 홈 데이터가 들어와 대피소 위젯이 그려지기를 기다리는 시간
const NAV_TIMEOUT_MS = 30_000; // 링크를 눌러 홈으로 가기를 기다리는 시간(개발 서버 첫 컴파일 포함)
const ANCHOR_MS = 1_000; // 제목이 보인 뒤 스크롤·포커스까지 한도(1-4 인수 조건)
const TOLERANCE_PX = 1; // 스크롤 위치 반올림(윗변이 -0.5px 등)
const MAX_TABS = 10; // summary 까지 누를 Tab 수 한도(Firefox 는 링크도 들르고 WebKit 은 건너뜀)
const NUMBER_MIN_PX = 24; // 핵심 행동 번호 글자 크기
const SENTENCE_MIN_PX = 18; // 핵심 행동 문장 글자 크기
const TARGET_MIN_PX = 44; // 대피소 링크 높이(plan.md 7-8)
const KEY_COLS = [1, 1, 3, 3]; // 폭 단계별 핵심 행동 카드 열 수: [기본, md, lg, xl]

const PATH = "/emergency";
const NOT_FOUND = ["/emergency/unknown", "/emergency/AIR-RAID"]; // 목록 밖 id, 대소문자만 다른 id
const BACK_LINK = "← 비상 대비";
const NOTICE = "개인이 만든 참고용 안내입니다. 정부·민방위의 공식 경보와 안내가 항상 우선합니다.";
const SIREN = "사이렌";
const KEY_TITLE = "지금 할 일 3가지";
const MORE = "더 보기";
const SHELTER_LINK = "가까운 대피소 찾기";
const SHELTER_HREF = "/#shelters";
const SHELTER_IDS: CivilAlert["id"][] = ["air-raid", "nuclear"]; // 대피소 링크를 두는 경보(공습·핵)
const SHELTERS_TITLE = "내 주변 대피소";
const FIND_NEARBY = "내 주변 대피소 찾기";
const LOADING = "불러오는 중";
const SOURCE_HREF = 'href="https://safekorea.go.kr/'; // HTML 속성 글자 그대로
const NOREFERRER = /(^|\s)noreferrer(\s|$)/;
const SCRIPT = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const HEAD_TAG = /<title\b[^>]*>[\s\S]*?<\/title>|<meta\b[^>]*>/gi; // 스트리밍으로 body 에 온 메타데이터

const step = (w: number) => (w >= XL ? 3 : w >= LG ? 2 : w >= MD ? 1 : 0);
const pathOf = (id: string) => `${PATH}/${id}`;
/** API 주소로 가는 요청. 개발 서버의 환경 변수가 테스트와 달라도 잡히게 경로(/api/)로도 본다(emergency.spec.ts 와 같음) */
const isApi = (url: string) => url.startsWith(API_BASE_URL) || new URL(url).pathname.startsWith("/api/");
/** 절대·상대 주소의 경로 */
const pathname = (url: string | undefined) => url && new URL(url, SITE_URL).pathname;
/** <meta property|name="key"> 의 content */
const metaOf = (markup: string, key: string) =>
  markup.match(new RegExp(`<meta\\b[^>]*\\b(?:property|name)="${key}"[^>]*>`))?.[0].match(/\bcontent="([^"]*)"/)?.[1];
const shelterLinkOf = (page: Page) => page.getByRole("link", { name: SHELTER_LINK, exact: true });
/** 핵심 행동 카드: 제목 다음 첫 ol 의 바로 아래 li */
const keyItemsOf = (page: Page) =>
  page.getByRole("heading", { name: KEY_TITLE, exact: true }).locator("xpath=following::ol[1]").locator(":scope > li");
/** 홈 대피소 위젯: 제목에서 가장 가까운 section(shelter-anchor.spec.ts 와 같음) */
const widgetOf = (page: Page) =>
  page.getByRole("heading", { name: SHELTERS_TITLE, exact: true }).locator("xpath=ancestor::section[1]");
const findOf = (w: Locator) => w.getByRole("button", { name: FIND_NEARBY, exact: true });

async function box(l: Locator) {
  const b = await l.boundingBox();
  expect(b, "요소가 화면에 없음").not.toBeNull();
  return { ...b!, bottom: b!.y + b!.height };
}

/** 자식 요소들의 서로 다른 left 위치 개수 = 열 수 */
async function columns(items: Locator): Promise<number> {
  const lefts = await items.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  return new Set(lefts).size;
}

/** 상세를 열고(응답 200) main 이 붙을 때까지 */
async function open(page: Page, id: string) {
  const res = await page.goto(pathOf(id));
  expect(res?.status(), `${pathOf(id)} 응답`).toBe(200);
  await page.locator("main").waitFor();
}

type KeyItem = { text: string; number: "목록 표시" | "번호 요소" | null; numberPx: number; sentencePx: number };

/** 핵심 행동 li 실측: 번호 요소 글자를 뺀 글자, 번호 방식과 그 글자 크기, 문장(texts[i] 글자를 담은 요소) 글자 크기 */
const measureKeyItems = (items: Locator, texts: string[]) => items.evaluateAll((els, texts): KeyItem[] => {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const px = (el: Element | null | undefined, pseudo?: string) => (el ? parseFloat(getComputedStyle(el, pseudo).fontSize) : 0);
  return els.map((li, i) => {
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    // 번호 요소: 글자가 이 항목 번호(뒤 "." 허용)뿐이고 보이는(sr-only 아님) 요소
    const digit = nodes.find((n) => {
      const r = n.parentElement!.getBoundingClientRect();
      return norm(n.data).replace(/\.$/, "") === String(i + 1) && r.width > 1 && r.height > 1;
    });
    const cs = getComputedStyle(li);
    const marker = cs.display === "list-item" && cs.listStyleType === "decimal";
    return {
      text: norm(nodes.filter((n) => n !== digit).map((n) => n.data).join("")),
      number: digit ? "번호 요소" : marker ? "목록 표시" : null,
      numberPx: digit ? px(digit.parentElement) : marker ? px(li, "::marker") : 0,
      sentencePx: px(nodes.find((n) => norm(n.data) === texts[i])?.parentElement),
    };
  });
}, texts);

/** ms: 제목이 처음 보인 프레임부터 두 조건이 함께 선 첫 프레임까지(한도를 넘기면 null). top·active: 그 프레임의 윗변·포커스 */
type Anchor = { ms: number | null; top: number; active: string };
type AnchorWindow = { __anchor?: Anchor; __armAnchor: () => void };

/** "제목이 보인 때부터 1초 안에"를 페이지 안 requestAnimationFrame 으로 매 프레임 잰다(shelter-anchor.spec.ts watchAnchor 와 같은 기준).
 *  문서마다 처음 한 번 켜진다. 앱 안 이동(같은 문서)으로 다시 잴 때는 누르기 전에 window.__armAnchor() 로 다시 켠다.
 *  보이는 제목만 친다(앱 안 이동 때 감춰 둔 이전 화면은 높이 0) */
const watchAnchor = (page: Page) => page.addInitScript(({ title, button, limit, tolerance }) => {
  const w = window as unknown as AnchorWindow;
  const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  let run = 0; // 다시 켤 때마다 늘려 이전 측정 루프를 멈춘다
  let seen: number | undefined;
  const frame = (id: number) => {
    if (id !== run) return;
    const heading = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
      .find((e) => norm(e.textContent) === title && e.getBoundingClientRect().height > 0);
    const section = heading?.closest("section");
    if (section) {
      const now = performance.now();
      seen ??= now;
      const top = section.getBoundingClientRect().top;
      const a = document.activeElement;
      const ok = top >= -tolerance && top < window.innerHeight
        && a instanceof HTMLButtonElement && norm(a.textContent) === button && section.contains(a);
      if (ok || now - seen > limit) {
        const active = a === document.body ? "body" : a ? `${a.tagName.toLowerCase()} "${norm(a.textContent)}"` : "없음";
        w.__anchor = { ms: ok ? now - seen : null, top, active };
        return;
      }
    }
    requestAnimationFrame(() => frame(id));
  };
  w.__armAnchor = () => {
    w.__anchor = undefined;
    seen = undefined;
    const id = ++run;
    requestAnimationFrame(() => frame(id));
  };
  w.__armAnchor();
}, { title: SHELTERS_TITLE, button: FIND_NEARBY, limit: ANCHOR_MS, tolerance: TOLERANCE_PX });

/** watchAnchor 가 정한 결과(두 조건이 섰거나 제목이 보인 뒤 한도를 넘김)를 받는다 */
async function anchorOf(page: Page): Promise<Anchor> {
  const handle = await page.waitForFunction(() => (window as unknown as AnchorWindow).__anchor, undefined, {
    timeout: DATA_TIMEOUT_MS,
  });
  return (await handle.jsonValue())!;
}

/** getCurrentPosition·watchPosition 호출 수를 window.__geoCalls 에 센다(shelter-anchor.spec.ts 와 같은 계측).
 *  실제 위치 대신 거부(PERMISSION_DENIED) 콜백을 비동기로 돌려줘 어느 브라우저에서도 권한 팝업이 뜨지 않는다 */
const recordGeolocation = (page: Page) => page.addInitScript(() => {
  const w = window as unknown as { __geoCalls: number };
  w.__geoCalls = 0;
  const denied = { code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
  const deny = (onError?: PositionErrorCallback | null) => {
    w.__geoCalls++;
    setTimeout(() => onError?.(denied as GeolocationPositionError)); // 실제 브라우저처럼 비동기로
  };
  const proto = Geolocation.prototype;
  proto.getCurrentPosition = (_ok, onError) => deny(onError);
  proto.watchPosition = (_ok, onError) => {
    deny(onError);
    return 0; // 감시 id
  };
});
const geoCalls = (page: Page) => page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);

/** 데이터가 다 들어와 "불러오는 중"이 사라지고 등장 애니메이션(유한 반복)이 끝날 때까지 */
async function loaded(page: Page) {
  await expect(page.getByText(LOADING)).toHaveCount(0, { timeout: DATA_TIMEOUT_MS });
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => null))));
}

// 내용 단언은 expect.soft 라 한 번 실행으로 어긋난 조건을 모두 보여 준다(요소가 있는지 같은 전제만 바로 멈춤)
test.describe.configure({ timeout: TEST_TIMEOUT_MS });

test("자바스크립트 실행 전 HTML(5개): 경보 이름·핵심 행동 3문장·actions 전부·safekorea.go.kr 출처 링크, <title>·canonical·공유 미리보기·푸터", async ({ request }) => {
  for (const a of CIVIL_ALERTS) {
    const path = pathOf(a.id);
    const res = await request.get(path);
    expect(res.status(), `${path} 응답`).toBe(200);
    // RSC 데이터(<script>)에만 있는 글자는 자바스크립트가 돌아야 보이므로 뺀다. 본문 글자는 메타데이터(title·meta) 말고 body 에서 찾는다
    const markup = (await res.text()).replace(SCRIPT, "");
    const body = markup.slice(markup.indexOf("<body")).replace(HEAD_TAG, "");
    for (const text of [a.name, ...a.keyActions.map((k) => k.text), ...a.actions.map((x) => x.text)]) {
      expect.soft(body, `${a.id} 본문 글자 "${text}"`).toContain(text);
    }
    expect.soft(body, `${a.id} safekorea.go.kr 출처 링크`).toContain(SOURCE_HREF);
    expect.soft(body, `${a.id} 푸터(SiteFooter)`).toMatch(/<footer\b/);

    const title = `${a.name} 행동요령`;
    expect.soft(markup.match(/<title>([^<]*)<\/title>/)?.[1], `${a.id} <title>`).toContain(title);
    const canonical = markup.match(/<link\b[^>]*\brel="canonical"[^>]*>/)?.[0].match(/\bhref="([^"]*)"/)?.[1];
    expect.soft(pathname(canonical), `${a.id} canonical(${canonical})`).toBe(path);
    const ogUrl = metaOf(markup, "og:url");
    expect.soft(pathname(ogUrl), `${a.id} og:url(${ogUrl})`).toBe(path);
    // 루트 값을 이어 받아 사이트 이름·이미지가 빠지지 않게(#98 방식)
    for (const key of ["og:site_name", "og:locale", "og:type"]) expect.soft(metaOf(markup, key), `${a.id} ${key}`).toBeTruthy();
    const description = metaOf(markup, "description");
    for (const text of [a.when, ...a.keyActions.map((k) => k.text)]) {
      expect.soft(description, `${a.id} 설명에 "${text}"`).toContain(text);
    }
    for (const p of ["og", "twitter"]) {
      expect.soft(metaOf(markup, `${p}:title`), `${a.id} ${p}:title`).toBe(title);
      expect.soft(metaOf(markup, `${p}:description`), `${a.id} ${p}:description`).toBe(description);
    }
    expect.soft(metaOf(markup, "og:image"), `${a.id} og:image(루트 파일 기반 이미지)`).toMatch(/\/opengraph-image(?![\w-])/);
  }
});

test("목록 밖 id 는 404: /emergency/unknown·/emergency/AIR-RAID", async ({ request }) => {
  // 라우트가 아예 없어도 404 라서, 목록 안 id 가 열리는 것을 먼저 본다
  expect((await request.get(pathOf("air-raid"))).status(), `${pathOf("air-raid")} 응답(목록 안 id)`).toBe(200);
  for (const path of NOT_FOUND) expect.soft((await request.get(path)).status(), `${path} 응답`).toBe(404);
});

test("sitemap.xml 에 <SITE_URL>/emergency/<id> 5개", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status(), "sitemap.xml 응답").toBe(200);
  const xml = await res.text();
  for (const a of CIVIL_ALERTS) expect.soft(xml, a.id).toContain(`<loc>${SITE_URL}${pathOf(a.id)}</loc>`);
});

test("머리말: ← 비상 대비 링크 하나(/emergency), h1 하나 = 경보 이름(아이콘 aria-hidden), when·고지, 사이렌 경보만 h1 옆 \"사이렌\"", async ({ page }) => {
  await page.setViewportSize({ width: NARROW, height: HEIGHT });
  for (const a of CIVIL_ALERTS) {
    await open(page, a.id);
    const main = page.locator("main");
    const back = page.getByRole("link", { name: /비상 대비/ });
    await expect.soft(back, `${a.id} 비상 대비 링크 수`).toHaveCount(1);
    await expect.soft(back.first(), `${a.id} 비상 대비 링크 글자`).toHaveText(BACK_LINK);
    await expect.soft(back.first(), `${a.id} 비상 대비 링크 주소`).toHaveAttribute("href", PATH);

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1, `${a.id} h1 수`).toHaveCount(1);
    await expect.soft(h1, `${a.id} h1 접근 이름`).toHaveAccessibleName(a.name);
    await expect.soft(h1.locator("svg"), `${a.id} h1 안 svg 수`).toHaveCount(1);
    await expect.soft(h1.locator('svg[aria-hidden="true"]'), `${a.id} h1 아이콘 aria-hidden`).toHaveCount(1);
    await expect.soft(main, `${a.id} when`).toContainText(a.when, { useInnerText: true });
    await expect.soft(main, `${a.id} 고지 문구`).toContainText(NOTICE, { useInnerText: true });

    const siren = main.getByText(SIREN, { exact: true });
    await expect.soft(siren, `${a.id} "${SIREN}" 표시 수(siren ${a.siren})`).toHaveCount(a.siren ? 1 : 0);
    if (!a.siren || (await siren.count()) !== 1) continue;
    await expect.soft(h1.getByText(SIREN, { exact: true }), `${a.id} "${SIREN}"는 h1 밖(h1 접근 이름에 넣지 않음)`).toHaveCount(0);
    const [h, s] = await Promise.all([box(h1), box(siren)]);
    expect.soft(s.y < h.bottom && h.y < s.bottom, `${a.id} "${SIREN}"이 h1 과 같은 줄`).toBe(true);
  }
});

test("지금 할 일 3가지: 제목 다음 ol 의 li 3개 = keyActions 순서·글자, li 마다 aria-hidden 아이콘 하나, 번호 1·2·3", async ({ page }) => {
  await page.setViewportSize({ width: NARROW, height: HEIGHT });
  for (const a of CIVIL_ALERTS) {
    await open(page, a.id);
    const items = keyItemsOf(page);
    await expect(items, `${a.id} 핵심 행동 li 수`).toHaveCount(a.keyActions.length);
    const measured = await measureKeyItems(items, a.keyActions.map((k) => k.text));
    measured.forEach((m, i) => {
      expect.soft(m.text, `${a.id} ${i + 1}번 글자(번호 요소 글자는 뺌)`).toBe(a.keyActions[i].text);
      expect.soft(m.number, `${a.id} ${i + 1}번 번호(목록 표시 decimal 또는 글자가 "${i + 1}"인 번호 요소)`).not.toBeNull();
    });
    for (const [i, li] of (await items.all()).entries()) {
      await expect.soft(li.locator("svg"), `${a.id} ${i + 1}번 svg 수`).toHaveCount(1);
      await expect.soft(li.locator('svg[aria-hidden="true"]'), `${a.id} ${i + 1}번 아이콘 aria-hidden`).toHaveCount(1);
      expect.soft(await li.locator("svg > *").count(), `${a.id} ${i + 1}번 아이콘 도형 수`).toBeGreaterThan(0);
    }
  }
});

test(`대피소 링크: 공습·핵만 "${SHELTER_LINK}" 하나(href="${SHELTER_HREF}", 안에 aria-hidden 아이콘), 다른 경보는 0개`, async ({ page }) => {
  for (const a of CIVIL_ALERTS) {
    await open(page, a.id);
    const link = shelterLinkOf(page);
    const wanted = SHELTER_IDS.includes(a.id);
    await expect.soft(link, `${a.id} 대피소 링크 수`).toHaveCount(wanted ? 1 : 0);
    if (!wanted) continue;
    await expect.soft(link, `${a.id} 대피소 링크 주소`).toHaveAttribute("href", SHELTER_HREF);
    await expect.soft(link.locator('svg[aria-hidden="true"]'), `${a.id} 대피소 링크 아이콘(aria-hidden)`).toHaveCount(1);
  }
});

test(`더 보기: details 하나·처음엔 닫힘·Tab 으로 summary·Enter 로 열림, signal·행동요령 ol(actions 순서·글자·번호)·출처 새 탭·noreferrer·확인일`, async ({ page }) => {
  for (const a of CIVIL_ALERTS) {
    await open(page, a.id);
    // 키보드는 하이드레이션 뒤에 누른다(그 전에 연 details 를 React 가 다시 그리지 않게)
    await page.waitForLoadState("networkidle");
    const details = page.locator("main details");
    await expect(details, `${a.id} details 수`).toHaveCount(1);
    expect.soft(await details.evaluate((d) => (d as HTMLDetailsElement).open), `${a.id} 처음엔 닫힘`).toBe(false);
    const summary = details.locator("summary");
    await expect.soft(summary, `${a.id} summary 글자`).toContainText(MORE);

    let focused = false;
    for (let i = 0; i < MAX_TABS && !focused; i++) {
      await page.keyboard.press("Tab");
      focused = await summary.evaluate((s) => s === document.activeElement);
    }
    expect(focused, `${a.id} Tab ${MAX_TABS}번 안에 summary 에 포커스`).toBe(true);
    await page.keyboard.press("Enter");
    await expect(details, `${a.id} Enter 로 열림`).toHaveAttribute("open");

    await expect.soft(details, `${a.id} 어떻게 알리나`).toContainText(a.signal, { useInnerText: true });
    const list = details.locator("ol");
    await expect(list, `${a.id} 행동요령 번호 목록(ol)`).toHaveCount(1);
    const items = list.locator(":scope > li");
    await expect.soft(items, `${a.id} 행동요령 순서·글자(li 수 = actions 수)`).toHaveText(a.actions.map((x) => x.text));
    const unnumbered = await items.evaluateAll((els) => els.filter((e) => {
      const s = getComputedStyle(e);
      return s.display !== "list-item" || s.listStyleType === "none";
    }).length);
    expect.soft(unnumbered, `${a.id} 번호가 안 보이는 행동요령 항목`).toBe(0);

    for (const key of a.sources) {
      const s = ALERT_SOURCES[key];
      const link = details.locator(`a[href="${s.url}"]`);
      await expect.soft(link, `${a.id} 출처 ${key} 링크`).toHaveCount(1);
      await expect.soft(link, `${a.id} 출처 ${key} 새 탭`).toHaveAttribute("target", "_blank");
      await expect.soft(link, `${a.id} 출처 ${key} rel`).toHaveAttribute("rel", NOREFERRER);
      await expect.soft(details, `${a.id} 출처 ${key} 이름`).toContainText(s.name, { useInnerText: true });
      await expect.soft(details, `${a.id} 출처 ${key} 확인일`).toContainText(s.checkedAt);
    }
  }
});

for (const width of WIDTHS) {
  test(`${width}px 상세 5개: 가로 넘침 없음·콘솔 오류(하이드레이션 포함)·API 요청 0건, 핵심 행동 열 수·번호 24px·문장 18px, 대피소 링크 높이 44px`, async ({ page }) => {
    let current = "";
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(`${current}: ${m.text()}`);
    });
    page.on("pageerror", (e) => errors.push(`${current}: ${e.message}`));
    const api: string[] = [];
    page.on("request", (r) => {
      if (isApi(r.url())) api.push(`${current}: ${r.url()}`);
    });
    await page.setViewportSize({ width, height: HEIGHT });
    for (const a of CIVIL_ALERTS) {
      current = a.id;
      await open(page, a.id);
      // 페이지 자체에는 하이드레이션 끝을 알리는 요소가 없어, 네트워크가 잠잠해질 때(하이드레이션·늦은 요청 뒤)까지 기다린다
      await page.waitForLoadState("networkidle");
      const m = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
      expect.soft(m.scrollWidth, `${a.id} 가로 넘침`).toBeLessThanOrEqual(m.innerWidth);

      const items = keyItemsOf(page);
      await expect(items, `${a.id} 핵심 행동 li 수`).toHaveCount(a.keyActions.length);
      expect.soft(await columns(items), `${a.id} 핵심 행동 열 수`).toBe(KEY_COLS[step(width)]);
      const measured = await measureKeyItems(items, a.keyActions.map((k) => k.text));
      measured.forEach((k, i) => {
        expect.soft(k.numberPx, `${a.id} ${i + 1}번 번호 글자 크기(${k.number ?? "번호 없음"})`).toBeGreaterThanOrEqual(NUMBER_MIN_PX);
        expect.soft(k.sentencePx, `${a.id} ${i + 1}번 문장 글자 크기(0 = 문장 글자를 담은 요소 없음)`).toBeGreaterThanOrEqual(SENTENCE_MIN_PX);
      });
      if (SHELTER_IDS.includes(a.id)) {
        const link = shelterLinkOf(page);
        await expect(link, `${a.id} 대피소 링크`).toHaveCount(1);
        expect.soft((await box(link)).height, `${a.id} 대피소 링크 높이`).toBeGreaterThanOrEqual(TARGET_MIN_PX);
      }
    }
    expect.soft(errors, "콘솔 오류").toEqual([]);
    expect.soft(api, "API 주소로 보낸 요청").toEqual([]);
  });
}

for (const id of SHELTER_IDS) {
  test(`${pathOf(id)} "${SHELTER_LINK}" → 홈 대피소 영역: 1초 안에 화면 안·"${FIND_NEARBY}" 포커스·위치 요청 0회, 뒤로 가기 뒤 다시 눌러도 같음`, async ({ page }) => {
    const alert = CIVIL_ALERTS.find((a) => a.id === id)!;
    /** 대피소 링크를 눌러 홈 대피소 영역 바로가기를 잰다 */
    const follow = async (round: string) => {
      // 하이드레이션 뒤에 눌러야 앱 안 이동이 된다(그 전이면 전체 이동)
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => (window as unknown as AnchorWindow).__armAnchor());
      await shelterLinkOf(page).click();
      await expect(page, `${round}: 주소`).toHaveURL(new RegExp(`${SHELTER_HREF}$`), { timeout: NAV_TIMEOUT_MS });
      const t = await anchorOf(page);
      expect.soft(t.ms ?? Infinity, `${round}: 제목이 보인 뒤 윗변 화면 안·찾기 버튼 포커스까지(ms). 그때 윗변 ${Math.round(t.top)}px, 포커스 ${t.active}`)
        .toBeLessThanOrEqual(ANCHOR_MS);

      await loaded(page);
      const widget = widgetOf(page);
      await expect.soft(findOf(widget), `${round}: 데이터가 다 들어온 뒤에도 포커스는 찾기 버튼`).toBeFocused();
      const top = await widget.evaluate((el) => el.getBoundingClientRect().top);
      expect.soft(top, `${round}: 데이터가 다 들어온 뒤에도 영역 윗변이 화면 위 끝 아래`).toBeGreaterThanOrEqual(-TOLERANCE_PX);
      expect.soft(top, `${round}: 데이터가 다 들어온 뒤에도 영역 윗변이 화면 아래 끝 위`).toBeLessThan(HEIGHT);
      expect.soft(await geoCalls(page), `${round}: 위치 요청 수`).toBe(0);
    };

    await recordGeolocation(page);
    await watchAnchor(page);
    await page.setViewportSize({ width: NARROW, height: HEIGHT });
    await open(page, id);
    await follow("처음");
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: alert.name, exact: true }), "뒤로 가기: 상세 h1")
      .toBeVisible({ timeout: NAV_TIMEOUT_MS });
    // 홈 제목이 보이는 채로 다시 켜면 앞 결과를 다시 잰다
    await expect(page.getByRole("heading", { name: SHELTERS_TITLE, exact: true }), "뒤로 가기: 홈 대피소 제목이 안 보임").toBeHidden();
    await follow("뒤로 가기 뒤 다시");
  });
}
