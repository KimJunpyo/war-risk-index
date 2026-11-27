/**
 * 대피소 좌표·지역 검색(/api/shelters, #54) 테스트. fixtures/shelters.json 은 fixtures/make_shelters.py 가 #50 회귀 픽스처
 * (tests/fixtures/m12)로 만든 R2 파일(publish._shelter_payloads)과 main.list_shelters 의 기대 응답이다(다시 만드는 방법도 거기).
 * 그 파일을 가짜 R2 에 넣고 Worker 응답을 기대 응답과 대조한다.
 */
import { env } from "cloudflare:workers";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import fixture from "./fixtures/shelters.json";

type Shelter = {
  name: string; address: string; lat: number; lon: number;
  distance_m: number | null; capacity: number | null; kind: string;
};
type Body = { available: boolean; as_of: string | null; items: Shelter[]; total: number };
type Coords = { lat: string; lon: string };
type Query = Coords | { region: string };

const { files, cases } = fixture as unknown as { files: Record<string, unknown>; cases: [Query, Body][] };
const META_KEY = "api/shelters/meta.json";
const META = files[META_KEY] as { available: boolean; as_of: string | null };
const EMPTY = { ...META, items: [], total: 0 }; // 목록에 없는 지역·경로 주입의 응답
const UNAVAILABLE = { available: false, as_of: null, items: [], total: 0 }; // 공공데이터 키가 없을 때 main 의 응답
const PUBLIC = "public, max-age=3600";
const NO_STORE = "no-store"; // 빈 결과와 좌표 검색(위치가 든 URL)은 브라우저에도 남기지 않는다
const FIELDS = ["name", "address", "lat", "lon", "distance_m", "capacity", "kind"]; // main.SHELTER_FIELDS 순서
const NEED = { detail: "lat·lon 또는 region 이 필요함" };
const BAD_COORD = { detail: "lat·lon 은 소수점 2자리까지의 숫자만 지원함" };
const BAD_REGION = { detail: "region 은 2~40자만 지원함" };
const CONSOLE = ["log", "info", "warn", "error", "debug"] as const;
const coords = cases.filter((c): c is [Coords, Body] => "lat" in c[0]);
const regions = cases.filter((c): c is [{ region: string }, Body] => "region" in c[0]);

function request(query: string, init?: RequestInit, e: Env = env): Promise<Response> {
  return worker.fetch(new Request(`https://api.test/api/shelters?${query}`, init), e);
}

/** 프론트(entities/shelter/model/coords.ts)처럼 좌표는 URLSearchParams, 지역은 encodeURIComponent 로 붙인다. */
function toQuery(q: Query): string {
  return "region" in q ? `region=${encodeURIComponent(q.region)}` : new URLSearchParams(q).toString();
}

const TILE_SCALE = 20; // publish.TILE_SCALE

/** publish.tile_key */
function tileKey(lat: number, lon: number): string {
  return `${Math.floor(lat * TILE_SCALE)}_${Math.floor(lon * TILE_SCALE)}`;
}

/** get 한 키를 keys 에 모으는 R2. 읽지 않아야 할 키를 읽었는지 본다. */
function recording(keys: string[]): Env {
  return { ...env, BUCKET: { get: (key: string) => (keys.push(key), env.BUCKET.get(key)) } } as unknown as Env;
}

/** prefix 로 시작하는 키만 get 이 실패하는 R2. 오류 문구에 키를 넣어 그 문구가 로그로 새는지 본다. */
function failing(prefix: string): Env {
  const get = (key: string) => (key.startsWith(prefix) ? Promise.reject(new Error(`R2 장애: ${key}`)) : env.BUCKET.get(key));
  return { ...env, BUCKET: { get } } as unknown as Env;
}

/** console 을 모두 가로채고, 지금까지 찍힌 내용을 한 문자열로 돌려주는 함수를 준다. */
function captureConsole(): () => string {
  const spies = CONSOLE.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
  return () => spies.flatMap((s) => s.mock.calls.flat())
    .map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join("\n");
}

/** test_m12_publish._tie_order: 거리가 같은 시설끼리의 순서는 정렬 구현마다 달라(pandas 기본 정렬은 불안정) 동점 안에서만 다시 정렬한다. */
function tieOrder(body: Body): Body {
  const key = (s: Shelter) => JSON.stringify([s.name, s.address, s.lat, s.lon]);
  const byKey = (a: Shelter, b: Shelter) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  return { ...body, items: body.items.toSorted((a, b) => a.distance_m! - b.distance_m! || byKey(a, b)) };
}

beforeAll(async () => {
  for (const [key, value] of Object.entries(files)) await env.BUCKET.put(key, JSON.stringify(value));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await env.BUCKET.put(META_KEY, JSON.stringify(META)); // meta.json 을 바꾸는 테스트가 있다
});

describe("좌표 검색: main.list_shelters 와 같다", () => {
  it("픽스처에 반경 안 시설이 있는 좌표가 있다(빈 결과끼리 같아서 통과하는 일이 없도록)", () => {
    expect(coords.filter(([, b]) => b.total > 0).length).toBeGreaterThanOrEqual(4); // test_m12_publish.NONEMPTY
  });

  it.each(coords)("%j", async (query, expected) => {
    const res = await request(toQuery(query));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE); // 결과가 있어도 위치가 든 응답은 저장하지 않는다(#92)
    const body = await res.json<Body>();
    const distances = body.items.map((s) => s.distance_m!);
    expect(distances).toStrictEqual(distances.toSorted((a, b) => a - b)); // tieOrder 가 거리순으로 다시 정렬하므로 따로 본다
    expect(tieOrder(body)).toStrictEqual(tieOrder(expected));
    // toStrictEqual 은 키 순서를 보지 않는다
    expect(Object.keys(body)).toStrictEqual(Object.keys(expected));
    expect(body.items.filter((s) => Object.keys(s).join() !== FIELDS.join())).toStrictEqual([]);
  });

  it.each(["lat=37.5&lon=127", "lat=37&lon=126.98", "lat=-37.5&lon=127"])("소수점 2자리까지는 받는다: ?%s", async (query) => {
    expect((await request(query)).status).toBe(200);
  });

  it("lat·lon 이 둘 다 있으면 region 이 있어도 좌표 검색이다", async () => {
    const [query, expected] = coords[0];
    const res = await request(`${toQuery(query)}&region=${encodeURIComponent("부산광역시 서구")}`);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    expect((await res.json<Body>()).total).toBe(expected.total);
  });

  it.each([["없을", null], ["빈 배열일", "[]"]])("가운데 타일이 %s 때도 나머지 타일로 계산한다", async (_, text) => {
    const [query, expected] = coords[0];
    const center = tileKey(Number(query.lat), Number(query.lon));
    const key = `api/shelters/tiles/${center}.json`;
    await (text === null ? env.BUCKET.delete(key) : env.BUCKET.put(key, text));
    try {
      const body = await (await request(toQuery(query))).json<Body>();
      const items = expected.items.filter((s) => tileKey(s.lat, s.lon) !== center);
      expect(expected.items).toHaveLength(expected.total); // 상한에서 잘리지 않은 사례라야 아래 total 이 맞다
      expect(items.length).toBeGreaterThan(0); // 가운데 타일 몫만 빠지고 나머지 타일 몫은 남는다
      expect(items.length).toBeLessThan(expected.total);
      expect(tieOrder(body)).toStrictEqual(tieOrder({ ...expected, items, total: items.length }));
    } finally {
      await env.BUCKET.put(key, JSON.stringify(files[key]));
    }
  });
});

describe("지역 검색", () => {
  it("픽스처에 시설이 있는 지역이 있다", () => {
    expect(regions.filter(([, b]) => b.total > 0).length).toBeGreaterThanOrEqual(2);
  });

  it.each(regions)("main.list_shelters 와 같다: %j", async (query, expected) => {
    const res = await request(toQuery(query));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Cache-Control")).toBe(expected.total ? PUBLIC : NO_STORE); // 지역 파일이 있을 때만 캐시
    const body = await res.json<Body>();
    expect(body).toStrictEqual(expected);
    expect(Object.keys(body)).toStrictEqual(Object.keys(expected));
  });

  it("시·도만 주면 api/shelters/region/{시·도}.json 을 그대로 준다", async () => {
    const body = JSON.stringify({ key: "부산광역시" }); // 픽스처는 작게 두려고 시·도 파일을 넣지 않았다
    await env.BUCKET.put("api/shelters/region/부산광역시.json", body);
    const res = await request(`region=${encodeURIComponent(" 부산광역시 ")}`);
    expect(await res.text()).toBe(body);
    expect(res.headers.get("Cache-Control")).toBe(PUBLIC);
  });

  it.each([
    "서울특별시/노원구", // 시·도에 / (있는 파일을 가리킨다)
    "서울특별시 노원구/..",
    "부산광역시 ..",
    "..",
    "부산광역시 서구\\",
    "부산광역시 서\u0000구",
    "부산광역시\n서구",
    "부산광역시 서구\u007f",
  ])("경로 주입은 지역 파일을 읽지 않고 빈 결과: %j", async (region) => {
    const keys: string[] = [];
    const res = await request(`region=${encodeURIComponent(region)}`, undefined, recording(keys));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(await res.json()).toStrictEqual(EMPTY);
    expect(keys).toStrictEqual([META_KEY]);
  });
});

describe("검증", () => {
  it.each([
    ["", NEED],
    ["lat=37.57", NEED],
    ["lon=126.98", NEED],
    ["lat=37.5665&lon=126.98", BAD_COORD], // 소수점 3자리 이상(정밀 위치)은 받지 않는다
    ["lat=37.57&lon=126.978", BAD_COORD],
    ["lat=abc&lon=126.98", BAD_COORD],
    ["lat=&lon=126.98", BAD_COORD],
    ["lat=1234&lon=126.98", BAD_COORD],
    ["lat=37.5%0A&lon=126.98", BAD_COORD], // 끝 줄바꿈도 거부(FastAPI 도 422)
    ["lat=abc&region=서울특별시", BAD_COORD], // 지역 검색이어도 좌표를 검사한다(FastAPI 처럼)
    ["region=", BAD_REGION],
    ["region=서", BAD_REGION],
    [`region=${"가".repeat(41)}`, BAD_REGION],
    ["lat=37.57&lon=126.98&region=서", BAD_REGION], // 좌표 검색이어도 region 을 검사한다
  ])("422: ?%s", async (query, detail) => {
    const res = await request(query);
    expect(res.status).toBe(422);
    expect(await res.json()).toStrictEqual(detail);
  });

  it("region 40자는 받는다", async () => {
    expect((await request(`region=${"가".repeat(40)}`)).status).toBe(200);
  });

  it.each(["POST", "HEAD"])("GET 이 아니면 405: %s", async (method) => {
    expect((await request("region=서울특별시", { method })).status).toBe(405);
  });
});

describe("같은 이름의 쿼리가 여러 번 오면 FastAPI(Starlette)처럼 마지막 값을 쓴다", () => {
  it("lat·lon", async () => {
    const [query, expected] = coords[0];
    const res = await request(`lat=40&lon=127&${toQuery(query)}`); // 앞의 값이면 범위 밖이라 빈 결과
    expect(tieOrder(await res.json<Body>())).toStrictEqual(tieOrder(expected));
    expect((await request(`${toQuery(query)}&lat=abc`)).status).toBe(422);
  });

  it("region", async () => {
    const [query, expected] = regions.find(([, b]) => b.total > 0)!;
    const res = await request(`region=${encodeURIComponent("없는지역")}&${toQuery(query)}`);
    expect(await res.json()).toStrictEqual(expected);
    expect((await request(`${toQuery(query)}&region=서`)).status).toBe(422);
  });
});

describe("meta.json 이 없거나 available 이 false", () => {
  it.each([
    ["없음", null],
    ["available false", { available: false, as_of: null }],
  ])("%s: 좌표 검색은 타일을 읽지 않고, 둘 다 키 없음일 때의 main 응답을 캐시 없이 준다", async (_, meta) => {
    await (meta ? env.BUCKET.put(META_KEY, JSON.stringify(meta)) : env.BUCKET.delete(META_KEY));
    const keys: string[] = [];
    const res = await request("lat=37.57&lon=126.98", undefined, recording(keys));
    expect(await res.json()).toStrictEqual(UNAVAILABLE);
    expect(res.headers.get("Cache-Control")).toBe(NO_STORE);
    expect(keys).toStrictEqual([META_KEY]);
    const region = await request(`region=${encodeURIComponent("없는지역")}`);
    expect(await region.json()).toStrictEqual(UNAVAILABLE);
    expect(region.headers.get("Cache-Control")).toBe(NO_STORE);
  });
});

describe("요청 좌표를 로그에 남기지 않는다", () => {
  it("성공·빈 결과·422 는 console 을 부르지 않는다", async () => {
    const logged = captureConsole();
    for (const query of ["lat=37.57&lon=126.98", "lat=33.5&lon=126.53", "lat=37.5665&lon=126.98"]) await request(query);
    expect(logged()).toBe("");
  });

  it.each([
    ["meta.json(좌표 검색)", "lat=37.57&lon=126.98", META_KEY],
    ["타일", "lat=37.57&lon=126.98", "api/shelters/tiles/"],
    ["지역 파일", `region=${encodeURIComponent("부산광역시 서구")}`, "api/shelters/region/"],
    ["meta.json(없는 지역)", `region=${encodeURIComponent("없는지역")}`, META_KEY],
  ])("%s 읽기 실패는 502 이고, 로그에는 고정 문구만 남는다(원래 문구·키·좌표 없음)", async (_, query, prefix) => {
    const logged = captureConsole();
    const res = await request(query, undefined, failing(prefix));
    expect(res.status).toBe(502);
    expect(await res.json()).toStrictEqual({ detail: "응답 조회 실패" });
    const text = logged();
    expect(text).toContain("대피소 조회 실패");
    for (const leak of ["R2 장애", "api/shelters", "tiles/", "region/", "37.57", "126.98", "lat="]) {
      expect(text).not.toContain(leak);
    }
  });
});
