/**
 * 전쟁 가능성 지수 API Worker(#53). publish.py(#50)가 만들고 batch.py(#51)가 R2 api/ 에 올린 응답 JSON 을
 * 파싱하지 않고 그대로 흘려보낸다(무료 플랜 요청당 CPU 10ms). 경로·오류 문구·health 규칙은 backend/app/main.py 와 같다.
 * news·대피소 위치·지역 검색(/api/shelters?…)은 #54 에서 만든다.
 */

export interface Env {
  BUCKET: R2Bucket;
  CORS_ORIGINS?: string; // 쉼표로 구분한 허용 출처(main.CORS_ORIGINS 와 같은 뜻). 없거나 비면 어떤 출처도 허용하지 않는다
}

type Status = { live_as_of: string | null; index_date: string | null }; // publish.build() 의 status.json

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

// 경로 파라미터가 없는 응답 → max-age. R2 키는 모든 경로에서 /api/x → api/x.json 이다
const FIXED_ROUTES = new Map([
  ["/api/pairs", LIVE_MAX_AGE],
  ["/api/countries", LIVE_MAX_AGE],
  ["/api/live", LIVE_MAX_AGE],
  ["/api/cases", DAILY_MAX_AGE],
  ["/api/blend", DAILY_MAX_AGE],
  ["/api/shelters/regions", DAILY_MAX_AGE],
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

export default {
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
