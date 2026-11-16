/**
 * 뉴스(/api/pairs/{id}/news, /api/countries/{code}/news, #54) 테스트. 배치 뉴스 단계(news_publish.py)가 R2 에 올린
 * api/news/{pairs|countries}/{id}/{range}.json 을 파싱하지 않고 그대로 내주는지 본다. 기대값은 backend/app/main.py 의
 * pair_news·country_news 를 따른다: 쿼리 검사(range, 나라는 name 1~40자)가 pair·code 확인보다 먼저, 없는 대상은 404,
 * 뉴스를 못 받았으면 502 {"detail": "뉴스 조회 실패: …"}. 대상이 있는지는 publish 가 쌍·나라마다 만드는 index.json 으로 본다.
 */
import { env } from "cloudflare:workers";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const NEWS_CACHE = "public, max-age=600"; // 지금 API 의 뉴스 캐시(backend/app/news.py CACHE_SECONDS)와 같은 10분
const NOT_READY = { detail: "뉴스 조회 실패: 아직 수집 전" };
const BAD_RANGE = { detail: "range 는 24h·7d 만 지원함" };
const BAD_NAME = { detail: "name 은 1~40자만 지원함" };
const NAME = `name=${encodeURIComponent("대한민국")}`; // 화면이 붙이는 이름(값은 쓰지 않는다)
// RUS-UKR·JPN 은 대상은 있지만(index.json) 뉴스가 아직 없다
const INDEX_KEYS = ["api/pairs/KOR-PRK/index.json", "api/pairs/RUS-UKR/index.json", "api/countries/KOR/index.json",
  "api/countries/JPN/index.json"];
// [경로, R2 키]
const ROUTES: [string, string][] = [
  ["/api/pairs/KOR-PRK/news", "api/news/pairs/KOR-PRK/24h.json"], // range 기본값 24h
  ["/api/pairs/KOR-PRK/news?range=24h", "api/news/pairs/KOR-PRK/24h.json"],
  ["/api/pairs/KOR-PRK/news?range=7d", "api/news/pairs/KOR-PRK/7d.json"],
  ["/api/pairs/KOR-PRK/news?range=30d&range=7d", "api/news/pairs/KOR-PRK/7d.json"], // FastAPI 처럼 마지막 값
  [`/api/countries/KOR/news?${NAME}`, "api/news/countries/KOR/24h.json"],
  [`/api/countries/KOR/news?${NAME}&range=7d`, "api/news/countries/KOR/7d.json"],
];

/** 키마다 다른 기사 목록. 한글은 바이트를 다시 인코딩하지 않고 그대로 흘려보내는지 보려고 넣었다. */
function body(key: string): string {
  return JSON.stringify([{ title: `${key} 북한 미사일 발사`, url: "https://news.example/1", source: "연합뉴스",
    published_at: "2026-11-16T00:00:00+00:00" }]);
}

function request(path: string, init?: RequestInit, e: Env = env): Promise<Response> {
  return worker.fetch(new Request(`https://api.test${path}`, init), e);
}

/** head·get 한 키를 keys 에 모으는 R2. 읽지 않아야 할 키를 읽었는지 본다. */
function recording(keys: string[]): Env {
  const bucket = {
    head: (key: string) => (keys.push(key), env.BUCKET.head(key)),
    get: (key: string) => (keys.push(key), env.BUCKET.get(key)),
  };
  return { ...env, BUCKET: bucket } as unknown as Env;
}

beforeAll(async () => {
  for (const key of INDEX_KEYS) await env.BUCKET.put(key, "[]");
  for (const [, key] of ROUTES) await env.BUCKET.put(key, body(key));
  // 패턴에 어긋나는 코드는 키가 있어도 내주지 않는다
  await env.BUCKET.put("api/countries/kor/index.json", "[]");
  await env.BUCKET.put("api/news/countries/kor/24h.json", body("api/news/countries/kor/24h.json"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("뉴스 경로", () => {
  it.each(ROUTES)("%s → %s 를 그대로 준다", async (path, key) => {
    const res = await request(path);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(body(key));
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Cache-Control")).toBe(NEWS_CACHE);
  });

  it("나라 name 은 길이만 보고 값은 쓰지 않는다(배치가 화면과 같은 이름으로 받아 둠)", async () => {
    const res = await request(`/api/countries/KOR/news?name=${encodeURIComponent("다른 이름")}`);
    expect(await res.text()).toBe(body("api/news/countries/KOR/24h.json"));
  });

  it("국가 쌍은 name 을 보지 않는다", async () => {
    expect((await request("/api/pairs/KOR-PRK/news?name=")).status).toBe(200);
  });

  it.each(["/api/pairs/KOR-PRK/news/extra", "/api/countries/KOR/newsfeed", "/api/news/pairs/KOR-PRK/24h"])(
    "다른 경로는 FastAPI 처럼 Not Found: %s",
    async (path) => {
      const res = await request(path);
      expect(res.status).toBe(404);
      expect(await res.json()).toStrictEqual({ detail: "Not Found" });
    },
  );

  it.each([["POST", "/api/pairs/KOR-PRK/news"], ["HEAD", `/api/countries/KOR/news?${NAME}`]])(
    "GET 만 받는다: %s %s",
    async (method, path) => {
      const res = await request(path, { method });
      expect(res.status).toBe(405);
    },
  );
});

describe("쿼리 검사(422)", () => {
  it.each(["/api/pairs/KOR-PRK/news", `/api/countries/KOR/news?${NAME}`].flatMap((path) =>
    ["30d", "", "24H", "1d", "7d&range=1d"].map((range) => [path, range])))(
    "range 는 24h·7d 만: %s&range=%s",
    async (path, range) => {
      const res = await request(`${path}${path.includes("?") ? "&" : "?"}range=${range}`);
      expect(res.status).toBe(422);
      expect(await res.json()).toStrictEqual(BAD_RANGE);
      expect(res.headers.get("Content-Type")).toBe("application/json");
    },
  );

  it.each([
    ["없음", ""],
    ["빈 값", "?name="],
    ["41자", `?name=${encodeURIComponent("가".repeat(41))}`],
    ["41자(코드 포인트)", `?name=${encodeURIComponent("😀".repeat(41))}`],
    ["마지막 값이 빈 값", `?${NAME}&name=`],
  ])("나라 name 은 1~40자: %s", async (_, query) => {
    const res = await request(`/api/countries/KOR/news${query}`);
    expect(res.status).toBe(422);
    expect(await res.json()).toStrictEqual(BAD_NAME);
  });

  it.each([["40자", "가".repeat(40)], ["40자(코드 포인트, UTF-16 으로는 80)", "😀".repeat(40)], ["1자", "가"]])(
    "나라 name 경계는 받는다(Python len 처럼 코드 포인트로 센다): %s",
    async (_, name) => {
      expect((await request(`/api/countries/KOR/news?name=${encodeURIComponent(name)}`)).status).toBe(200);
    },
  );

  it.each([
    "/api/pairs/USA-CHN/news?range=30d",
    "/api/countries/XYZ/news",
    "/api/countries/kor/news?name=",
  ])("검사는 pair·code 확인보다 먼저다(FastAPI 처럼): %s", async (path) => {
    expect((await request(path)).status).toBe(422);
  });
});

describe("없는 대상(404)·아직 수집 전(502)", () => {
  it.each([
    ["/api/pairs/USA-CHN/news", "알 수 없는 국가 쌍: USA-CHN"],
    [`/api/countries/XYZ/news?${NAME}`, "알 수 없는 국가: XYZ"],
    // 패턴 위반: 소문자(키가 있어도), 길이, 인코딩된 / 로 다른 키를 가리키려는 시도
    [`/api/countries/kor/news?${NAME}`, "알 수 없는 국가: kor"],
    [`/api/countries/KOREA/news?${NAME}`, "알 수 없는 국가: KOREA"],
    ["/api/pairs/KOR/news", "알 수 없는 국가 쌍: KOR"],
    ["/api/pairs/KOR-PRK%2F..%2F..%2Fstatus/news", "알 수 없는 국가 쌍: KOR-PRK%2F..%2F..%2Fstatus"],
  ])("없는 pair·code 와 패턴 위반은 404: %s", async (path, detail) => {
    const res = await request(path);
    expect(res.status).toBe(404);
    expect(await res.json()).toStrictEqual({ detail });
    expect(res.headers.get("Content-Type")).toBe("application/json");
  });

  it("패턴에 어긋나면 R2 를 읽지 않는다", async () => {
    const keys: string[] = [];
    await request(`/api/countries/kor/news?${NAME}`, undefined, recording(keys));
    await request("/api/pairs/KOR-PRK%2F..%2Fx/news", undefined, recording(keys));
    expect(keys).toStrictEqual([]);
  });

  it.each([
    "/api/pairs/RUS-UKR/news",
    "/api/pairs/RUS-UKR/news?range=7d",
    `/api/countries/JPN/news?${NAME}`,
    `/api/countries/JPN/news?${NAME}&range=7d`,
  ])("대상은 있는데 뉴스 파일이 아직 없으면 502: %s", async (path) => {
    const res = await request(path);
    expect(res.status).toBe(502);
    expect(await res.json()).toStrictEqual(NOT_READY);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.has("Cache-Control")).toBe(false); // 수집되면 바로 보이게 캐시하지 않는다
  });

  it("R2 오류는 다른 경로처럼 502 응답 조회 실패", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fail = () => Promise.reject(new Error("R2 장애"));
    const res = await request("/api/pairs/KOR-PRK/news", undefined, { BUCKET: { head: fail, get: fail } } as unknown as Env);
    expect(res.status).toBe(502);
    expect(await res.json()).toStrictEqual({ detail: "응답 조회 실패" });
  });
});
