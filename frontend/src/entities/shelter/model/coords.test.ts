// 이슈 #12 (4-4 내 주변 대피소 화면) 위치 반올림·요청 경로 인수 테스트.
// 실행(저장소 루트): node --test frontend/src/**/*.test.ts  (Node 24 타입 스트리핑, 별칭 import 불가)
//
// 계약: frontend/src/entities/shelter/model/coords.ts (별칭 import 없는 단일 파일)
//   export function roundCoord(v: number): number           소수점 2자리 반올림(약 1km)
//   export function sheltersPath(lat: number, lon: number): string
//     "/api/shelters?lat=..&lon=.." — 반올림은 이 함수 안에서 하고, 좌표 요청 경로는 여기서만 만든다.
//   export function regionPath(region: string): string     "/api/shelters?region=.." (URL 인코딩)
import assert from "node:assert/strict";
import { test } from "node:test";

import { regionPath, roundCoord, sheltersPath } from "./coords.ts";

const TWO_DECIMALS = /^-?\d+(\.\d{1,2})?$/;

const query = (path: string) => {
  const [pathname, qs] = path.split("?");
  return { pathname, params: new URLSearchParams(qs) };
};

test("좌표를 소수점 2자리로 반올림", () => {
  assert.equal(roundCoord(37.56654), 37.57);
  assert.equal(roundCoord(126.97796), 126.98);
  assert.equal(roundCoord(37.5), 37.5);
  assert.equal(roundCoord(-33.8688), -33.87);
});

test("요청 경로의 lat·lon 은 반올림된 값이고 소수점 2자리 이하", () => {
  const { pathname, params } = query(sheltersPath(37.566535, 126.9779692));
  assert.equal(pathname, "/api/shelters");
  assert.equal(params.get("lat"), "37.57");
  assert.equal(params.get("lon"), "126.98");
  for (const [lat, lon] of [[37.123456, 127.000001], [33.1, 131.999], [0.1 + 0.2, 126.555]]) {
    const p = query(sheltersPath(lat, lon)).params;
    assert.match(p.get("lat") ?? "", TWO_DECIMALS);
    assert.match(p.get("lon") ?? "", TWO_DECIMALS);
  }
});

test("요청 경로에 원래 좌표의 3자리 이상 숫자가 남지 않음", () => {
  const path = sheltersPath(37.566535, 126.9779692);
  assert.ok(!path.includes("37.566") && !path.includes("126.977"), path);
});

test("지역 경로는 한글·공백을 인코딩", () => {
  const { pathname, params } = query(regionPath("서울특별시 중구"));
  assert.equal(pathname, "/api/shelters");
  assert.equal(params.get("region"), "서울특별시 중구");
  assert.ok(!regionPath("서울특별시 중구").includes(" "));
});
