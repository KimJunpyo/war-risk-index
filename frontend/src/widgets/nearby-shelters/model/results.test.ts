// 이슈 #25 (3-2 대피소 결과 키워드 검색·페이지네이션) 검색·페이지 나누기·건수 문구 인수 테스트.
// 실행(저장소 루트): node --test "frontend/src/**/*.test.ts"  (Node 24 타입 스트리핑, 별칭 import 불가)
//
// 계약 (구현은 이 계약을 따른다) — frontend/src/widgets/nearby-shelters/model/results.ts, @/ 별칭 import 없음
//   export const PAGE_SIZE = 10;  // 페이지당 대피소 수(plan.md Q7)
//   export function filterShelters<T extends { name: string | null; address: string | null }>(items: readonly T[], query: string): T[];
//   export function paginate<T>(items: readonly T[], page: number, pageSize: number)
//     : { items: T[]; page: number; pageCount: number };
//   export function countText(p: { total?: number; loaded: number; matched: number; query: string }): string;
// 규칙
//   filterShelters
//     - query 앞뒤 공백을 지우고 공백(여러 칸 포함)으로 나눈 단어가 모두 이름 또는 주소에 들어 있으면 남긴다(AND).
//       단어마다 이름·주소 어느 쪽에 있어도 된다. 이름 끝과 주소 앞을 이어 붙여야만 생기는 글자는 일치가 아니다.
//     - 대소문자 구분 없음. 빈 검색어·공백만이면 전부. 원래 순서 유지(위치 조회 거리순이 검색 뒤에도 이어짐).
//     - 이름·주소 밖 필드(kind 등)는 보지 않는다.
//   paginate
//     - page 는 1부터. pageCount = max(1, ceil(items.length / pageSize)).
//     - page < 1 은 1, page > pageCount 는 pageCount 로 보정하고, 돌려주는 page 는 보정한 값.
//     - items 는 그 쪽 항목(최대 pageSize 개, 원래 순서).
//   countText — total: 응답 total(안전 상한으로 자르기 전 건수), loaded: 받은 items 길이,
//               matched: 검색 뒤 남은 수, query: 검색창 원문
//     - N = total ?? loaded (total 이 없는 예전 응답 대비). 숫자는 천 단위 쉼표(1,234).
//     - 검색어(앞뒤 공백 제외)가 없으면 "총 N곳", 있으면 "총 N곳 중 M곳"(M = matched).
//     - total > loaded 면 끝에 " · 상위 L곳만 표시"(L = loaded)를 붙인다.
import assert from "node:assert/strict";
import { test } from "node:test";

import { countText, filterShelters, PAGE_SIZE, paginate } from "./results.ts";

// 응답 항목(Shelter)과 같은 모양. 검색은 이름·주소만 본다
type Item = {
  name: string;
  address: string;
  lat: number;
  lon: number;
  distance_m: number | null;
  capacity: number | null;
  kind: string | null;
};
const shelter = (name: string, address: string, extra: Partial<Item> = {}): Item =>
  ({ name, address, lat: 35.2, lon: 128.6, distance_m: null, capacity: 100, kind: "공공용시설", ...extra });

const KT = shelter("KT창원지사 지하1층", "경상남도 창원시 의창구 중앙대로 49");
const SEOKDONG = shelter("석동아파트 지하주차장", "경상남도 창원시 진해구 석동로 10");
const JINHAE_OFFICE = shelter("진해구청 별관", "경상남도 창원시 진해구 충장로 2");
const SCHOOL = shelter("마산초등학교 강당", "경상남도 창원시 마산합포구 완월동 1");
const MANSION = shelter("동화맨션 A동 뒤 지하주차장", "경상남도 창원시 성산구 상남로 5", { kind: "정부지원시설" });
const YONGJI = shelter("용지아파트 101동", "경상남도 창원시 성산구 용지로 7");
const ITEMS = [KT, SEOKDONG, JINHAE_OFFICE, SCHOOL, MANSION, YONGJI];

const names = (xs: Item[]) => xs.map((x) => x.name);
const find = (query: string) => names(filterShelters(ITEMS, query));

/** from 부터 to 까지 정수 */
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const CHANGWON = range(1, 527); // 창원시 527곳(로컬 데이터 기준) → 53쪽, 마지막 쪽 7곳

test("페이지 크기 상수는 10", () => {
  assert.equal(PAGE_SIZE, 10);
});

test("빈 검색어는 전부, 순서 그대로", () => {
  assert.deepEqual(filterShelters(ITEMS, ""), ITEMS);
});

test("공백만인 검색어는 빈 검색어와 같음", () => {
  assert.deepEqual(filterShelters(ITEMS, "   "), ITEMS, "띄어쓰기");
  assert.deepEqual(filterShelters(ITEMS, " \t "), ITEMS, "탭 섞임");
});

test("앞뒤 공백은 지움", () => {
  assert.deepEqual(find("  아파트  "), names([SEOKDONG, YONGJI]));
});

test("대소문자 구분 없음", () => {
  assert.deepEqual(find("kt"), names([KT]), "소문자로 대문자 이름");
  assert.deepEqual(find("Kt창원"), names([KT]), "섞어 씀");
  assert.deepEqual(find("a동"), names([MANSION]), "이름 안 대문자 A");
});

test("주소에만 있는 단어도 일치", () => {
  assert.deepEqual(find("의창구"), names([KT]), "이름에는 없는 구 이름");
  assert.deepEqual(find("진해구"), names([SEOKDONG, JINHAE_OFFICE]), "주소만 일치 + 이름·주소 둘 다 일치");
});

test("여러 단어는 모두 포함(AND), 단어마다 이름·주소 어느 쪽이든", () => {
  assert.deepEqual(find("진해구 아파트"), names([SEOKDONG]), "진해구는 주소, 아파트는 이름");
  assert.deepEqual(find("성산구 아파트"), names([YONGJI]));
  assert.deepEqual(find("  진해구    아파트 "), names([SEOKDONG]), "단어 사이 여러 칸");
  assert.deepEqual(find("진해구 초등학교"), [], "한 단어만 맞으면 제외");
});

test("주소도 대소문자 구분 없음", () => {
  const latin = [shelter("가 대피소", "ABC로 1")];
  assert.deepEqual(filterShelters(latin, "abc"), latin);
});

test("단어 사이 탭·전각 공백도 구분자", () => {
  assert.deepEqual(find("진해구\t아파트"), names([SEOKDONG]), "탭");
  assert.deepEqual(find("진해구　아파트"), names([SEOKDONG]), "전각 공백");
});

test("이름·주소가 비어(null) 와도 멈추지 않고 다른 쪽으로 찾음", () => {
  const blanks: { name: string | null; address: string | null }[] = [
    { name: "가 대피소", address: null },
    { name: null, address: "경상남도 창원시 의창구" },
  ];
  assert.deepEqual(filterShelters(blanks, ""), blanks, "빈 검색어");
  assert.deepEqual(filterShelters(blanks, "대피소"), [blanks[0]], "이름으로");
  assert.deepEqual(filterShelters(blanks, "의창구"), [blanks[1]], "주소로");
});

test("일치 0건이면 빈 배열", () => {
  assert.deepEqual(filterShelters(ITEMS, "zzzz"), []);
});

test("이름·주소 밖 필드(kind)는 검색하지 않음", () => {
  assert.deepEqual(find("정부지원"), []);
});

test("이름 끝과 주소 앞을 이어 붙여야 생기는 글자는 일치가 아님", () => {
  const station = [shelter("서울역", "중구 세종대로")];
  assert.deepEqual(filterShelters(station, "역중"), []);
  assert.deepEqual(filterShelters(station, "서울역 세종대로"), station);
});

test("검색 뒤에도 원래 순서(거리순) 유지", () => {
  const near = [100, 250, 400, 900].map((d, i) =>
    shelter(`${i % 2 ? "가" : "나"}아파트 ${i}`, "서울특별시 중구", { distance_m: d }));
  assert.deepEqual(filterShelters(near, "아파트").map((s: Item) => s.distance_m), [100, 250, 400, 900]);
  assert.deepEqual(find("지하"), names([KT, SEOKDONG, MANSION]));
});

test("1쪽: 앞 10곳, 쪽 수 53", () => {
  assert.deepEqual(paginate(CHANGWON, 1, PAGE_SIZE), { items: range(1, 10), page: 1, pageCount: 53 });
});

test("가운데 쪽", () => {
  assert.deepEqual(paginate(CHANGWON, 3, PAGE_SIZE), { items: range(21, 30), page: 3, pageCount: 53 });
});

test("마지막 쪽: 남은 7곳", () => {
  assert.deepEqual(paginate(CHANGWON, 53, PAGE_SIZE), { items: range(521, 527), page: 53, pageCount: 53 });
});

test("범위 밖 page 는 첫 쪽·마지막 쪽으로 보정", () => {
  const first = { items: range(1, 10), page: 1, pageCount: 53 };
  const last = { items: range(521, 527), page: 53, pageCount: 53 };
  assert.deepEqual(paginate(CHANGWON, 0, PAGE_SIZE), first, "0쪽");
  assert.deepEqual(paginate(CHANGWON, -3, PAGE_SIZE), first, "음수");
  assert.deepEqual(paginate(CHANGWON, 54, PAGE_SIZE), last, "마지막 바로 다음");
  assert.deepEqual(paginate(CHANGWON, 1000, PAGE_SIZE), last, "훨씬 뒤");
});

test("검색으로 결과가 줄어 지금 쪽이 사라지면 마지막 쪽으로", () => {
  assert.deepEqual(paginate(range(1, 25), 5, PAGE_SIZE), { items: range(21, 25), page: 3, pageCount: 3 });
});

test("10곳 이하는 한 쪽", () => {
  assert.deepEqual(paginate(range(1, 10), 1, PAGE_SIZE), { items: range(1, 10), page: 1, pageCount: 1 }, "딱 10곳");
  assert.deepEqual(paginate(range(1, 10), 2, PAGE_SIZE), { items: range(1, 10), page: 1, pageCount: 1 }, "10곳에서 2쪽");
  assert.deepEqual(paginate(range(1, 7), 1, PAGE_SIZE), { items: range(1, 7), page: 1, pageCount: 1 }, "7곳");
});

test("11곳이면 두 쪽, 둘째 쪽은 1곳", () => {
  assert.deepEqual(paginate(range(1, 11), 2, PAGE_SIZE), { items: [11], page: 2, pageCount: 2 });
});

test("0곳이면 빈 1쪽", () => {
  assert.deepEqual(paginate([], 1, PAGE_SIZE), { items: [], page: 1, pageCount: 1 });
  assert.deepEqual(paginate([], 3, PAGE_SIZE), { items: [], page: 1, pageCount: 1 }, "범위 밖");
});

test("검색 없을 때 \"총 N곳\"", () => {
  assert.equal(countText({ total: 527, loaded: 527, matched: 527, query: "" }), "총 527곳");
  assert.equal(countText({ total: 527, loaded: 527, matched: 527, query: "   " }), "총 527곳", "공백만은 검색 없음");
});

test("검색 중 \"총 N곳 중 M곳\"", () => {
  assert.equal(countText({ total: 527, loaded: 527, matched: 1, query: "초등학교" }), "총 527곳 중 1곳");
  assert.equal(countText({ total: 527, loaded: 527, matched: 6, query: "  학교 " }), "총 527곳 중 6곳", "앞뒤 공백");
  assert.equal(countText({ total: 527, loaded: 527, matched: 0, query: "zzzz" }), "총 527곳 중 0곳", "0건");
});

test("숫자는 천 단위 쉼표", () => {
  assert.equal(countText({ total: 1500, loaded: 1500, matched: 1200, query: "아파트" }), "총 1,500곳 중 1,200곳");
});

test("total 이 받은 수보다 크면(안전 상한) \"상위 L곳만 표시\"를 덧붙임", () => {
  assert.equal(countText({ total: 1234, loaded: 1000, matched: 1000, query: "" }), "총 1,234곳 · 상위 1,000곳만 표시");
  assert.equal(countText({ total: 1234, loaded: 1000, matched: 37, query: "학교" }), "총 1,234곳 중 37곳 · 상위 1,000곳만 표시");
});

test("total 이 받은 수와 같으면 안내 없음", () => {
  assert.equal(countText({ total: 1000, loaded: 1000, matched: 1000, query: "" }), "총 1,000곳");
});

test("total 이 없으면(예전 응답) 받은 수를 씀", () => {
  assert.equal(countText({ loaded: 527, matched: 527, query: "" }), "총 527곳", "필드 없음");
  assert.equal(countText({ total: undefined, loaded: 527, matched: 3, query: "학교" }), "총 527곳 중 3곳", "undefined");
});
