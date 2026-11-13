/**
 * Worker(#53) 테스트. R2 는 vitest-pool-workers 의 로컬 가짜이고, 키마다 다른 본문을 넣어 두고 경로가 그 키를 그대로
 * 내주는지 본다. 기대값(오류 문구·health 규칙)은 backend/app/main.py 와 tests/test_deploy_health.py 를 따른다.
 * 현재 시각은 Date.now 만 바꿔 끼운다(고정된 지난 날짜라 실행 날짜와 상관없다).
 */
import { env } from "cloudflare:workers";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const BASE = "https://api.test";
const ORIGIN = "http://localhost:3000"; // wrangler.jsonc 의 vars.CORS_ORIGINS
const LIVE = "public, max-age=60";
const DAILY = "public, max-age=3600";
const NOT_FOUND = { detail: "Not Found" };
const STATUS_KEY = "api/status.json";
const SLOT = "20240229234500"; // 최신 실시간 슬롯 2024-02-29 23:45:00 UTC (test_deploy_health.py 와 같은 값)
// get 이 늘 throw 하는 가짜 R2(장애 흉내)
const BROKEN = { BUCKET: { get: () => Promise.reject(new Error("R2 장애")) }, CORS_ORIGINS: ORIGIN } as unknown as Env;
// status.json 이 없을 때의 health 본문
const EMPTY_HEALTH = { ok: false, live_as_of: null, live_age_minutes: null, index_date: null, index_age_days: null };

// [경로, R2 키, Cache-Control]. countries/{code}/catalysts 는 15분 실시간 슬롯이 섞여 있어 짧게 캐시한다
const ROUTES: [string, string, string][] = [
  ["/api/pairs", "api/pairs.json", LIVE],
  ["/api/countries", "api/countries.json", LIVE],
  ["/api/live", "api/live.json", LIVE],
  ["/api/cases", "api/cases.json", DAILY],
  ["/api/blend", "api/blend.json", DAILY],
  ["/api/shelters/regions", "api/shelters/regions.json", DAILY],
  ["/api/pairs/KOR-PRK/index", "api/pairs/KOR-PRK/index.json", DAILY],
  ["/api/pairs/KOR-PRK/catalysts", "api/pairs/KOR-PRK/catalysts.json", DAILY],
  ["/api/countries/KOR/index", "api/countries/KOR/index.json", DAILY],
  ["/api/countries/KOR/catalysts", "api/countries/KOR/catalysts.json", LIVE],
  ["/api/countries/KOR/embassies", "api/countries/KOR/embassies.json", DAILY],
];

type Status = { live_as_of: string | null; index_date: string | null };

/** 키마다 다른 본문. 한글은 바이트를 다시 인코딩하지 않고 그대로 흘려보내는지 보려고 넣었다. */
function body(key: string): string {
  return JSON.stringify({ key, name: "남북" });
}

function request(path: string, init?: RequestInit, e: Env = env): Promise<Response> {
  return worker.fetch(new Request(BASE + path, init), e);
}

async function putStatus(status: Status | null): Promise<void> {
  await (status ? env.BUCKET.put(STATUS_KEY, JSON.stringify(status)) : env.BUCKET.delete(STATUS_KEY));
}

beforeAll(async () => {
  for (const [, key] of ROUTES) await env.BUCKET.put(key, body(key));
  // 패턴에 어긋나는 코드는 키가 있어도 내주지 않는다
  await env.BUCKET.put("api/countries/kor/index.json", body("api/countries/kor/index.json"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("라우팅", () => {
  it.each(ROUTES)("%s → %s", async (path, key, cache) => {
    const res = await request(path);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(body(key));
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Cache-Control")).toBe(cache);
  });

  it.each([
    ["/api/pairs/USA-CHN/index", "알 수 없는 국가 쌍: USA-CHN"],
    ["/api/pairs/USA-CHN/catalysts", "알 수 없는 국가 쌍: USA-CHN"],
    ["/api/countries/XYZ/index", "알 수 없는 국가: XYZ"],
    ["/api/countries/XYZ/embassies", "알 수 없는 국가: XYZ"],
    // 패턴 위반: 소문자(키가 있어도), 길이, 인코딩된 / 로 다른 키를 가리키려는 시도
    ["/api/countries/kor/index", "알 수 없는 국가: kor"],
    ["/api/countries/KOREA/index", "알 수 없는 국가: KOREA"],
    ["/api/pairs/KOR/index", "알 수 없는 국가 쌍: KOR"],
    ["/api/pairs/KOR-PRK%2F..%2F..%2Fstatus/index", "알 수 없는 국가 쌍: KOR-PRK%2F..%2F..%2Fstatus"],
  ])("없는 pair·code 와 패턴 위반은 404: %s", async (path, detail) => {
    const res = await request(path);
    expect(res.status).toBe(404);
    expect(await res.json()).toStrictEqual({ detail });
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it.each([
    "/",
    "/api",
    "/api/unknown",
    "/api/pairs/",
    "/api/pairs/KOR-PRK",
    "/api/pairs/KOR-PRK/embassies",
    "/api/pairs/KOR-PRK/news", // #54
    "/api/shelters", // #54
    "/api/countries/KOR/index/extra",
  ])("알 수 없는 경로는 FastAPI 처럼 Not Found: %s", async (path) => {
    const res = await request(path);
    expect(res.status).toBe(404);
    expect(await res.json()).toStrictEqual(NOT_FOUND);
  });

  it.each([
    ["POST", "/api/pairs"],
    ["HEAD", "/api/pairs"],
    ["POST", "/api/health"],
  ])("허용하지 않는 메서드는 405: %s %s", async (method, path) => {
    const res = await request(path, { method });
    expect(res.status).toBe(405);
    if (method !== "HEAD") expect(await res.json()).toStrictEqual({ detail: "Method Not Allowed" });
  });
});

describe("예외 처리", () => {
  it("R2 오류는 502 {detail} JSON 이고 CORS 헤더도 붙는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request("/api/pairs", { headers: { Origin: ORIGIN } }, BROKEN);
    expect(res.status).toBe(502);
    expect(await res.json()).toStrictEqual({ detail: "응답 조회 실패" });
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Vary")).toBe("Origin");
  });
});

describe("catalysts?days=", () => {
  const paths = ["/api/pairs/KOR-PRK/catalysts", "/api/countries/KOR/catalysts"];

  it.each(paths)("90 이면 200: %s", async (path) => {
    expect((await request(`${path}?days=90`)).status).toBe(200);
  });

  it.each(paths.flatMap((path) => ["30", "365", "abc", "", "90&days=30"].map((days) => [path, days])))(
    "다른 값은 422: %s?days=%s",
    async (path, days) => {
      const res = await request(`${path}?days=${days}`);
      expect(res.status).toBe(422);
      expect(await res.json()).toStrictEqual({ detail: "days 는 90 만 지원함" });
    },
  );

  it("검사는 pair 확인보다 먼저다(FastAPI 처럼 쿼리 검증이 먼저)", async () => {
    expect((await request("/api/pairs/USA-CHN/catalysts?days=30")).status).toBe(422);
  });

  it("catalysts 가 아닌 경로는 days 를 보지 않는다", async () => {
    expect((await request("/api/pairs/KOR-PRK/index?days=30")).status).toBe(200);
  });
});

describe("health", () => {
  // [이름, 현재 시각(UTC), status.json(null 이면 없음), 상태 코드, live_age_minutes, index_age_days]
  const fresh = { live_as_of: SLOT, index_date: "2024-02-27" };
  const cases: [string, string, Status | null, number, number | null, number | null][] = [
    ["실시간 60분·일별 3일은 200(경계 포함)", "2024-03-01T00:45:00Z", fresh, 200, 60, 3],
    ["60분 59초는 분 단위 내림이라 200", "2024-03-01T00:45:59Z", fresh, 200, 60, 3],
    ["실시간 61분은 503", "2024-03-01T00:46:00Z", fresh, 503, 61, 3],
    ["일별 4일은 503", "2024-03-01T00:44:00Z", { live_as_of: SLOT, index_date: "2024-02-26" }, 503, 59, 4],
    ["UTC 하루 끝에도 3일 전은 3일", "2024-03-01T23:59:59Z", { live_as_of: "20240301231500", index_date: "2024-02-27" }, 200, 44, 3],
    ["미래 key(음수 나이)도 200", "2024-02-29T23:33:45Z", fresh, 200, -12, 2],
    ["live_as_of 가 null 이면 503", "2024-03-01T00:44:00Z", { live_as_of: null, index_date: "2024-02-27" }, 503, null, 3],
    ["index_date 가 null 이면 503", "2024-03-01T00:44:00Z", { live_as_of: SLOT, index_date: null }, 503, 59, null],
    ["status.json 이 없으면 503", "2024-03-01T00:44:00Z", null, 503, null, null],
  ];

  it.each(cases)("%s", async (_, now, status, code, liveAge, indexAge) => {
    await putStatus(status);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(now));
    const res = await request("/api/health");
    expect(res.status).toBe(code);
    expect(await res.json()).toStrictEqual({
      ok: code === 200,
      live_as_of: status?.live_as_of ?? null,
      live_age_minutes: liveAge,
      index_date: status?.index_date ?? null,
      index_age_days: indexAge,
    });
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each([
    ["깨진 JSON", "{", EMPTY_HEALTH],
    ["null", "null", EMPTY_HEALTH],
    ["배열", JSON.stringify([SLOT, "2024-02-27"]), EMPTY_HEALTH],
    // 문자열이 아닌 필드만 null 이 된다
    ["문자열이 아닌 값", JSON.stringify({ live_as_of: Number(SLOT), index_date: "2024-02-27" }),
      { ...EMPTY_HEALTH, index_date: "2024-02-27", index_age_days: 3 }],
  ])("status.json 이 %s 이면 파일이 없을 때처럼 null 로 보고 503", async (_, raw, expected) => {
    await env.BUCKET.put(STATUS_KEY, raw);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2024-03-01T00:44:00Z"));
    const res = await request("/api/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toStrictEqual(expected);
  });

  it("R2 오류도 500·502 가 아니라 503 본문", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request("/api/health", undefined, BROKEN);
    expect(res.status).toBe(503);
    expect(await res.json()).toStrictEqual(EMPTY_HEALTH);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each([
    ["2024-03-01T00:45:00Z", 200],
    ["2024-03-01T00:46:00Z", 503],
  ])("HEAD 도 같은 상태 코드이고 본문이 없다: %s → %i", async (now, code) => {
    await putStatus(fresh);
    vi.spyOn(Date, "now").mockReturnValue(Date.parse(now));
    const res = await request("/api/health", { method: "HEAD" });
    expect(res.status).toBe(code);
    expect(await res.text()).toBe("");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("CORS", () => {
  it("허용 출처면 그 출처를 돌려주고 Vary: Origin 을 붙인다", async () => {
    const res = await request("/api/pairs", { headers: { Origin: ORIGIN } });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it.each([["https://evil.example"], ["http://localhost:3000.evil.example"], [null]])(
    "허용하지 않은 출처·출처 없음에는 Allow-Origin 이 없다: %s",
    async (origin) => {
      const res = await request("/api/pairs", origin ? { headers: { Origin: origin } } : undefined);
      expect(res.status).toBe(200);
      expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
      expect(res.headers.get("Vary")).toBe("Origin"); // 출처마다 응답이 달라 캐시가 섞이지 않게 항상 붙인다
    },
  );

  it("오류 응답에도 붙는다(프론트가 404 를 읽도록)", async () => {
    const res = await request("/api/countries/XYZ/index", { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(404);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });

  it.each<Env>([{ BUCKET: env.BUCKET }, { BUCKET: env.BUCKET, CORS_ORIGINS: "" }])(
    "CORS_ORIGINS 가 없거나 비어도 응답하고 어떤 출처도 허용하지 않는다: '$CORS_ORIGINS'",
    async (e) => {
      const res = await request("/api/pairs", { headers: { Origin: ORIGIN } }, e);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(body("api/pairs.json"));
      expect(res.headers.has("Access-Control-Allow-Origin")).toBe(false);
    },
  );

  it("CORS_ORIGINS 는 쉼표로 여러 출처를 받는다", async () => {
    const e = { ...env, CORS_ORIGINS: `${ORIGIN},https://war-risk.example` } as Env;
    const res = await request("/api/live", { headers: { Origin: "https://war-risk.example" } }, e);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://war-risk.example");
  });

  it("OPTIONS 는 204 와 허용 메서드만 준다", async () => {
    const res = await request("/api/pairs", {
      method: "OPTIONS",
      headers: { Origin: ORIGIN, "Access-Control-Request-Method": "GET" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe("GET, HEAD");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
  });
});
