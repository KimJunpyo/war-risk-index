/**
 * 전쟁 가능성 지수 API Worker(#53). publish.py(#50)가 만들고 batch.py(#51)가 R2 api/ 에 올린 응답 JSON 을
 * 파싱하지 않고 그대로 흘려보낸다(무료 플랜 요청당 CPU 10ms). 경로·오류 문구·health 규칙은 backend/app/main.py 와 같다.
 * 대피소 위치·지역 검색(/api/shelters?…)은 publish 의 타일·지역 파일로 main.list_shelters 와 같은 응답을 만든다(#54).
 * 뉴스(/api/{pairs|countries}/{id}/news)는 15분 배치(news_publish.py)가 받아 R2 api/news/… 에 올린 파일을 그대로 준다.
 * Cloudflare 엣지에서는 Google News 가 503 을 줘서 Worker 가 직접 받지 않는다(#54).
 * Cron Trigger(scheduled)는 15분마다 갱신 워크플로(refresh.yml)를 수동 실행으로 부른다(#52).
 */

export interface Env {
  BUCKET: R2Bucket;
  CORS_ORIGINS?: string; // 쉼표로 구분한 허용 출처(main.CORS_ORIGINS 와 같은 뜻). 없거나 비면 어떤 출처도 허용하지 않는다
  GITHUB_DISPATCH_TOKEN?: string; // wrangler secret: 이 저장소만, Actions 읽기·쓰기 권한의 GitHub 미세 권한 토큰
}

type Status = { live_as_of: string | null; index_date: string | null }; // publish.build() 의 status.json
type ShelterMeta = { available: boolean; as_of: string | null }; // publish 의 shelters/meta.json
type ShelterList = ShelterMeta & { items: object[]; total: number }; // main.list_shelters 응답
// publish.TILE_FIELDS: 타일 파일의 시설 항목(distance_m 은 Worker 가 계산한다)
type Shelter = { name: string; address: string; lat: number; lon: number; capacity: number | null; kind: string };

const LIVE_MAX_AGE = 60; // 15분마다 바뀌는 실시간 값이 든 응답의 Cache-Control max-age(초)
const DAILY_MAX_AGE = 3600; // 하루 한 번 바뀌는 응답의 max-age(초)
const LIVE_STALE_MINUTES = 60; // /api/health: 최신 실시간 슬롯이 이 분을 넘게 지났으면 503(main 과 같은 값)
const INDEX_STALE_DAYS = 3; // /api/health: 일별 지수 최신 날짜가 이 일수를 넘게 지났으면 503(main 과 같은 값)
const CATALYST_DAYS = "90"; // publish.CATALYST_DAYS: 이 기간 파일만 있다
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const JSON_TYPE = "application/json";
const NO_STORE = "no-store";
const ALLOWED_METHODS = "GET, HEAD";
const HEALTH_PATH = "/api/health";
const STATUS_KEY = "api/status.json";
const NOT_FOUND = "Not Found"; // FastAPI 의 알 수 없는 경로 문구
const METHOD_NOT_ALLOWED = "Method Not Allowed";
const UPSTREAM_FAILED = "응답 조회 실패"; // R2 오류 등 예외일 때의 502 문구
// GitHub 예약(schedule) 실행은 3일 동안 15분 슬롯의 4%만 돌아서(#52), Cron Trigger 가 같은 워크플로를 수동 실행한다
const DISPATCH_URL = "https://api.github.com/repos/KimJunpyo/war-risk-index/actions/workflows/refresh.yml/dispatches";
const DISPATCH_REF = "main";
const GITHUB_API_VERSION = "2022-11-28";
const USER_AGENT = "war-risk-api-cron"; // GitHub API 는 User-Agent 가 없는 요청을 거부한다
const ERROR_BODY_CHARS = 200; // 실패 로그에 남길 GitHub 응답 본문 길이
// 대피소 검색(main.list_shelters 와 같은 값). 좌표는 소수점 2자리(약 1km)까지만 받는다(정밀 위치를 받지 않도록)
const SHELTERS_PATH = "/api/shelters";
const SHELTER_META_KEY = "api/shelters/meta.json";
const COORD_PATTERN = /^-?\d{1,3}(\.\d{1,2})?$/;
const KOREA_LAT = [33, 39];
const KOREA_LON = [124, 132];
const SHELTER_RADIUS_M = 5000;
const SHELTER_NEARBY_LIMIT = 1000; // 위치 조회 안전 상한
const METERS_PER_DEG_LAT = 111_000; // 반경 사전 필터용 근사
const REGION_MIN_LENGTH = 2;
const REGION_MAX_LENGTH = 40;
const EARTH_RADIUS_M = 6371008.8; // shelters.EARTH_RADIUS_M
const TILE_SCALE = 20; // publish.TILE_SCALE: 0.05° 격자, 타일 키 = floor(좌표 × 20)
const DEG_TO_RAD = Math.PI / 180; // Python math.radians 와 같은 계수(x × (π/180))
// 시·도·시·군·구에 이 글자가 있으면 R2 를 읽지 않는다(다른 키를 가리키지 못하게)
const UNSAFE_REGION = /[/\\]|\.\.|\p{Cc}/u;
// 결과가 있을 때만 캐시한다. 빈 결과(공공데이터가 잠시 빠졌거나 없는 지역)는 no-store 라 다음 갱신 뒤 바로 바뀐다
const NEARBY_CACHE = `private, max-age=${DAILY_MAX_AGE}`; // 위치가 든 URL 의 응답은 공유 캐시(CDN·프록시)에 두지 않는다
const REGION_CACHE = `public, max-age=${DAILY_MAX_AGE}`;
// 대피소 경로의 예외는 이 문구로 바꿔 던진다. R2 오류 문구에 키(타일 = 위치)가 섞여 공통 catch 의 로그에 남지 않게
const SHELTERS_FAILED = "대피소 조회 실패";
// 뉴스(main.pair_news·country_news 와 같은 쿼리 규칙). 파일 키는 api/news/{pairs|countries}/{id}/{range}.json
const NEWS_ROUTE = /^\/api\/(pairs|countries)\/([^/]+)\/news$/;
const NEWS_RANGES = ["24h", "7d"]; // backend/app/news.RANGES 의 키. 첫 값이 기본값
const NEWS_NAME_MAX_LENGTH = 40; // main.country_news 의 name 은 1~40자
const NEWS_MAX_AGE = 600; // 지금 API 의 뉴스 캐시(news.CACHE_SECONDS 10분)와 맞춘다
const NEWS_CACHE = `public, max-age=${NEWS_MAX_AGE}`;
const NEWS_NOT_READY = "뉴스 조회 실패: 아직 수집 전"; // 대상은 있는데 배치가 아직 받지 못했을 때의 502 문구

// 경로 파라미터가 없는 응답 → max-age. R2 키는 모든 경로에서 /api/x → api/x.json 이다
const FIXED_ROUTES = new Map([
  ["/api/pairs", LIVE_MAX_AGE],
  ["/api/countries", LIVE_MAX_AGE],
  ["/api/live", LIVE_MAX_AGE],
  ["/api/cases", DAILY_MAX_AGE],
  ["/api/blend", DAILY_MAX_AGE],
  ["/api/shelters/regions", DAILY_MAX_AGE],
  ["/api/embassies", DAILY_MAX_AGE],
]);
// 파라미터는 아무 글자나 받고 아래 패턴으로 따로 검사한다(어긋나도 FastAPI 처럼 "알 수 없는 …" 404)
const PAIR_ROUTE = /^\/api\/pairs\/([^/]+)\/(index|catalysts)$/;
const COUNTRY_ROUTE = /^\/api\/countries\/([^/]+)\/(index|catalysts|embassies)$/;
const PAIR_ID = /^[A-Z]{3}-[A-Z]{3}$/; // backend/app/pairs.py 의 PAIRS 키(예: KOR-PRK)
const COUNTRY_CODE = /^[A-Z]{3}$/; // CAMEO 국가 코드(country_meta.csv 의 code, 예: KOR)
const SLOT_KEY = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/; // live.KEY_FORMAT(%Y%m%d%H%M%S, UTC)

type Route = { maxAge: number; detail: string; valid: boolean };

function json(body: BodyInit | null, status: number, cacheControl?: string): Response {
  const headers = new Headers({ "Content-Type": JSON_TYPE });
  if (cacheControl) headers.set("Cache-Control", cacheControl);
  return new Response(body, { status, headers });
}

/** FastAPI HTTPException 과 같은 {"detail": …} 오류 응답. */
function error(status: number, detail: string): Response {
  return json(JSON.stringify({ detail }), status);
}

/** 응답이 있는 경로면 (max-age, 키가 없을 때의 404 문구, 경로 파라미터가 패턴에 맞는지). 알 수 없는 경로면 undefined. */
function route(path: string): Route | undefined {
  const fixed = FIXED_ROUTES.get(path);
  if (fixed !== undefined) return { maxAge: fixed, detail: NOT_FOUND, valid: true };
  const pair = PAIR_ROUTE.exec(path);
  if (pair) return { maxAge: DAILY_MAX_AGE, detail: `알 수 없는 국가 쌍: ${pair[1]}`, valid: PAIR_ID.test(pair[1]) };
  const country = COUNTRY_ROUTE.exec(path);
  if (country) {
    // 나라 촉매에는 일별 파일이 아직 없는 날(오늘·어제)의 15분 실시간 슬롯이 섞인다(main.country_catalyst_rows)
    const maxAge = country[2] === "catalysts" ? LIVE_MAX_AGE : DAILY_MAX_AGE;
    return { maxAge, detail: `알 수 없는 국가: ${country[1]}`, valid: COUNTRY_CODE.test(country[1]) };
  }
  return undefined;
}

/**
 * status.json 의 두 값. main 에서 파일이 없을 때처럼, 파일이 없거나 R2 오류·깨진 JSON 이면 둘 다 null 이고
 * 문자열이 아닌 값(내용이 null·배열인 경우 포함)도 null 로 본다. health 가 500·502 가 아니라 503 본문을 주게 한다.
 */
async function readStatus(env: Env): Promise<Status> {
  try {
    const object = await env.BUCKET.get(STATUS_KEY);
    const raw = object ? await object.json<Record<string, unknown> | null>() : null;
    const text = (value: unknown) => (typeof value === "string" ? value : null);
    return { live_as_of: text(raw?.live_as_of), index_date: text(raw?.index_date) };
  } catch (e) {
    console.error("status.json 읽기 실패", e);
    return { live_as_of: null, index_date: null };
  }
}

/** main.health() 와 같은 규칙·본문. 두 나이가 모두 기준 이내면 200, 하나라도 넘거나 null 이면 503. */
async function health(env: Env, head: boolean): Promise<Response> {
  const { live_as_of, index_date } = await readStatus(env);
  const now = Date.now();
  // 분 단위 내림. GDELT 슬롯 key 는 발행보다 약 10분 늦어 갱신 직후 음수일 수 있고 정상이다(하한 검사 없음)
  const liveAge = live_as_of === null ? null
    : Math.floor((now - Date.parse(live_as_of.replace(SLOT_KEY, "$1-$2-$3T$4:$5:$6Z"))) / MINUTE_MS);
  // 하루 중 시각과 무관한 UTC 달력 날짜 차("YYYY-MM-DD" 는 UTC 자정으로 읽힌다)
  const indexAge = index_date === null ? null : Math.floor(now / DAY_MS) - Date.parse(index_date) / DAY_MS;
  const ok = liveAge !== null && indexAge !== null && liveAge <= LIVE_STALE_MINUTES && indexAge <= INDEX_STALE_DAYS;
  const body = { ok, live_as_of, live_age_minutes: liveAge, index_date, index_age_days: indexAge };
  return json(head ? null : JSON.stringify(body), ok ? 200 : 503, NO_STORE);
}

/** shelters.haversine_m 과 같은 식의 대원 거리(m). */
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * DEG_TO_RAD, p2 = lat2 * DEG_TO_RAD;
  const dp = p2 - p1, dl = (lon2 - lon1) * DEG_TO_RAD;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** meta.json 이 없으면 main 에서 공공데이터 키·파일이 없을 때처럼 available false. */
async function readShelterMeta(env: Env): Promise<ShelterMeta> {
  const object = await env.BUCKET.get(SHELTER_META_KEY);
  return object ? object.json<ShelterMeta>() : { available: false, as_of: null };
}

/** 결과가 없을 때의 응답. 키 순서까지 main.list_shelters 와 같다. */
function noShelters({ available, as_of }: ShelterMeta): ShelterList {
  return { available, as_of, items: [], total: 0 };
}

/** main.list_shelters 의 좌표 분기. 반경 사각형에 걸리는 타일을 합쳐 사각형·반경으로 거르고 가까운 순으로 자른다. */
async function nearbyShelters(env: Env, y: number, x: number): Promise<ShelterList> {
  const meta = await readShelterMeta(env);
  if (!meta.available || !(KOREA_LAT[0] <= y && y <= KOREA_LAT[1] && KOREA_LON[0] <= x && x <= KOREA_LON[1])) {
    return noShelters(meta);
  }
  const dy = SHELTER_RADIUS_M / METERS_PER_DEG_LAT;
  const dx = dy / Math.cos(y * DEG_TO_RAD);
  const keys: string[] = [];
  for (let ty = Math.floor((y - dy) * TILE_SCALE); ty <= Math.floor((y + dy) * TILE_SCALE); ty++) {
    for (let tx = Math.floor((x - dx) * TILE_SCALE); tx <= Math.floor((x + dx) * TILE_SCALE); tx++) {
      keys.push(`api/shelters/tiles/${ty}_${tx}.json`);
    }
  }
  const tiles = await Promise.all(keys.map(async (key) => {
    const object = await env.BUCKET.get(key);
    return object ? object.json<Shelter[]>() : []; // 시설이 없는 칸은 파일이 없다
  }));
  const near = tiles.flat()
    .filter((s) => y - dy <= s.lat && s.lat <= y + dy && x - dx <= s.lon && s.lon <= x + dx)
    // 키 순서도 main.SHELTER_FIELDS 와 같게 만든다.
    // shortcut: Math.round 는 .5 를 올린다(Python round 는 짝수 쪽). 계산값이 정확히 .5 일 때만 달라 그대로 둔다.
    // 픽스처 대조가 어긋나면 짝수 반올림으로 바꾼다
    .map((s) => ({
      name: s.name, address: s.address, lat: s.lat, lon: s.lon,
      distance_m: Math.round(haversineM(y, x, s.lat, s.lon)), capacity: s.capacity, kind: s.kind,
    }))
    .filter((s) => s.distance_m <= SHELTER_RADIUS_M) // total 은 사각형 사전 필터가 아니라 반경 안 건수
    .sort((a, b) => a.distance_m - b.distance_m);
  return { ...noShelters(meta), items: near.slice(0, SHELTER_NEARBY_LIMIT), total: near.length };
}

/** main.list_shelters 의 지역 분기. publish 가 지역마다 만든 응답 파일을 그대로 주고, 파일이 없는 지역은 빈 결과. */
async function regionShelters(env: Env, region: string): Promise<Response> {
  // main 처럼 앞뒤 공백을 떼고 첫 공백에서 시·도와 시·군·구로 나눈다(시·군·구 안의 공백은 그대로)
  const [sido, ...rest] = region.trim().split(" ");
  const sigungu = rest.join(" ").trim();
  const object = [sido, sigungu].some((part) => UNSAFE_REGION.test(part)) ? null
    : await env.BUCKET.get(`api/shelters/region/${sigungu ? `${sido}/${sigungu}` : sido}.json`);
  if (object) return json(object.body, 200, REGION_CACHE);
  return json(JSON.stringify(noShelters(await readShelterMeta(env))), 200, NO_STORE);
}

/**
 * GET /api/shelters. FastAPI 처럼 쿼리 검사(lat·lon 패턴, region 길이)가 먼저이고, lat·lon 이 둘 다 있으면 좌표,
 * 아니면 region 검색이다. 요청 좌표는 로그에 남기지 않는다(이 경로에서 console 을 부르지 않는다).
 */
async function shelters(params: URLSearchParams, env: Env): Promise<Response> {
  // 같은 이름이 여러 번 오면 FastAPI(Starlette)처럼 마지막 값을 쓴다
  const [lat, lon, region] = ["lat", "lon", "region"].map((name) => params.getAll(name).at(-1) ?? null);
  if ([lat, lon].some((v) => v !== null && !COORD_PATTERN.test(v))) {
    return error(422, "lat·lon 은 소수점 2자리까지의 숫자만 지원함");
  }
  const length = region === null ? REGION_MIN_LENGTH : [...region].length; // Python len 처럼 코드 포인트로 센다
  if (length < REGION_MIN_LENGTH || length > REGION_MAX_LENGTH) {
    return error(422, `region 은 ${REGION_MIN_LENGTH}~${REGION_MAX_LENGTH}자만 지원함`);
  }
  if (lat !== null && lon !== null) {
    const body = await nearbyShelters(env, Number(lat), Number(lon));
    return json(JSON.stringify(body), 200, body.total ? NEARBY_CACHE : NO_STORE);
  }
  return region ? regionShelters(env, region) : error(422, "lat·lon 또는 region 이 필요함");
}

/**
 * GET /api/{pairs|countries}/{id}/news. FastAPI 처럼 쿼리 검사(range, 나라는 name)가 pair·code 확인보다 먼저다.
 * 없는 대상은 다른 경로처럼 404(패턴 위반이거나 publish 가 대상마다 만드는 index.json 이 없음)이고,
 * 대상은 있는데 뉴스 파일이 아직 없으면 지금 API 의 뉴스 장애처럼 502 다.
 */
async function news(kind: string, id: string, params: URLSearchParams, env: Env): Promise<Response> {
  const pairs = kind === "pairs";
  // 같은 이름이 여러 번 오면 FastAPI(Starlette)처럼 마지막 값을 쓴다
  const range = params.getAll("range").at(-1) ?? NEWS_RANGES[0];
  if (!NEWS_RANGES.includes(range)) return error(422, `range 는 ${NEWS_RANGES.join("·")} 만 지원함`);
  // 나라 name 은 길이만 본다(Python len 처럼 코드 포인트로). 배치가 화면과 같은 이름으로 받아 두어 값은 쓰지 않는다
  const name = params.getAll("name").at(-1) ?? "";
  if (!pairs && (name === "" || [...name].length > NEWS_NAME_MAX_LENGTH)) {
    return error(422, `name 은 1~${NEWS_NAME_MAX_LENGTH}자만 지원함`);
  }
  // 패턴에 어긋나면 R2 를 읽지 않는다
  if (!(pairs ? PAIR_ID : COUNTRY_CODE).test(id) || !(await env.BUCKET.head(`api/${kind}/${id}/index.json`))) {
    return error(404, `알 수 없는 ${pairs ? "국가 쌍" : "국가"}: ${id}`);
  }
  const object = await env.BUCKET.get(`api/news/${kind}/${id}/${range}.json`);
  return object ? json(object.body, 200, NEWS_CACHE) : error(502, NEWS_NOT_READY);
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    // 프론트는 단순 GET 만 쓴다. 사전 요청에는 허용 메서드만 알려 준다(Allow-Origin 은 fetch 에서 붙인다)
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Methods": ALLOWED_METHODS } });
  }
  if (url.pathname === HEALTH_PATH) {
    const head = request.method === "HEAD";
    return head || request.method === "GET" ? health(env, head) : error(405, METHOD_NOT_ALLOWED);
  }
  if (url.pathname === SHELTERS_PATH) {
    if (request.method !== "GET") return error(405, METHOD_NOT_ALLOWED);
    // 원래 오류(R2 문구에 타일 키가 섞일 수 있다)는 버린다. 공통 catch 가 이 고정 문구만 남기고 502 를 준다
    return shelters(url.searchParams, env).catch(() => {
      throw new Error(SHELTERS_FAILED);
    });
  }
  const newsRoute = NEWS_ROUTE.exec(url.pathname);
  if (newsRoute) {
    if (request.method !== "GET") return error(405, METHOD_NOT_ALLOWED);
    return news(newsRoute[1], newsRoute[2], url.searchParams, env);
  }
  const found = route(url.pathname);
  if (!found) return error(404, NOT_FOUND);
  if (request.method !== "GET") return error(405, METHOD_NOT_ALLOWED);
  // FastAPI 처럼 쿼리 검사가 pair·code 확인보다 먼저다. 생략하거나 90 일 때만 받는다(API 계약 변경)
  if (url.pathname.endsWith("/catalysts") && url.searchParams.getAll("days").some((d) => d !== CATALYST_DAYS)) {
    return error(422, `days 는 ${CATALYST_DAYS} 만 지원함`);
  }
  // 패턴에 어긋나면 R2 를 읽지 않는다
  const object = found.valid ? await env.BUCKET.get(`${url.pathname.slice(1)}.json`) : null;
  return object ? json(object.body, 200, `public, max-age=${found.maxAge}`) : error(404, found.detail);
}

/** 갱신 워크플로를 main 에서 수동 실행한다. 토큰이 없거나 204 가 아니면 throw 해 Cron 이벤트에 실패로 남긴다. */
async function dispatchRefresh(env: Env): Promise<void> {
  if (!env.GITHUB_DISPATCH_TOKEN) throw new Error("GITHUB_DISPATCH_TOKEN 없음: 갱신 워크플로를 부르지 않음");
  const response = await fetch(DISPATCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ ref: DISPATCH_REF }),
  });
  if (response.status !== 204) {
    const detail = (await response.text()).slice(0, ERROR_BODY_CHARS);
    throw new Error(`갱신 워크플로 호출 실패: ${response.status} ${detail}`);
  }
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await dispatchRefresh(env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await handle(request, env).catch((e: unknown) => {
      // 그대로 두면 Cloudflare 오류 페이지(HTML, CORS 없음)가 나가 프론트가 오류를 읽지 못한다
      console.error(e);
      return error(502, UPSTREAM_FAILED);
    });
    const origin = request.headers.get("Origin");
    // 출처에 따라 헤더가 달라지므로 허용 여부와 상관없이 붙인다(캐시가 출처끼리 섞이지 않게)
    response.headers.set("Vary", "Origin");
    const allowed = env.CORS_ORIGINS ? env.CORS_ORIGINS.split(",") : [];
    if (origin && allowed.includes(origin)) {
      response.headers.set("Access-Control-Allow-Origin", origin);
    }
    return response;
  },
} satisfies ExportedHandler<Env>;
