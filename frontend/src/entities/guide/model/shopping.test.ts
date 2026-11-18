// 이슈 #102 (1-3 장보기 단위 환산 모델과 출처) 환산 수치·복사 글자·출처 인수 테스트.
// 실행(저장소 루트): node --test "frontend/src/**/*.test.ts"  (Node 24 타입 스트리핑, 별칭 import 불가)
//
// 계약: frontend/src/entities/guide/model/shopping.ts (별칭 import 없는 단일 파일, 같은 폴더 ./kit.ts 만 import)
//   export function waterPacks(liters: number): { packs: number; bottles: number; kg: number }
//     2L 6병 묶음으로 올림: packs = ⌈liters ÷ 12⌉, bottles = packs × 6, kg = bottles × 2
//   export function shoppingList(people: number, periodId: string): ShoppingList | null
//     ShoppingList 는 kind 리터럴("stock" | "bag")로 가르는 유니온으로 적는다(테스트가 kind 로 좁힌다).
//     7·14일: { kind: "stock"; waterL: number; water: waterPacks(waterL); stove: 1;
//               items: { id: string; name: string; qty: number; unit: string }[] }
//       items 는 아래 7종뿐(물·가스레인지는 water·stove 칸): 부탄가스, 쌀, 봉지라면, 컵라면, 즉석밥,
//       "레토르트 식품(카레·짜장·덮밥 소스 등)", "통조림(고기·생선)". 단위는 쌀 "kg", 통조림 "캔", 나머지 "개"
//     3일: { kind: "bag"; bag: { perPersonL: 2; bottles500PerPerson: 4; mealsPerPerson: 9; bags: people };
//            home: { waterL: number; packs: number; bottles: number; kg: number } }  // 품목·부탄가스 없음
//     가구원 수가 1~MAX_PEOPLE 정수가 아니거나 periodId 가 KIT_PERIODS 의 id 가 아니면 null (supplies() 와 같은 검증)
//   export function shoppingText(people: number, periodId: string): string | null  // 복사용 여러 줄("\n") 글자
// kit.ts KIT_SOURCES 에 농림수산성 출처 maff·maff-water·maff-carry 를 더한다(이슈 출처 키 표, 1-8 이 maff·maff-carry 를 쓴다).
// 상수(STOCK_WEEK_PER_PERSON·BOTTLE_L 등) 이름, 품목 id·순서, 복사 글자의 나머지 문장은 확인하지 않는다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { KIT_SOURCES, supplies } from "./kit.ts";
import { shoppingList, shoppingText, waterPacks } from "./shopping.ts";

const RETORT = "레토르트 식품(카레·짜장·덮밥 소스 등)";
const CANNED = "통조림(고기·생선)";
const NEW_SOURCE_KEYS = ["maff", "maff-water", "maff-carry"]; // 이슈 #102 출처 키 표

/** 7·14일 결과. kind 가 "stock" 이 아니면(null 포함) 실패 */
function stockOf(people: number, periodId: string) {
  const list = shoppingList(people, periodId);
  assert.ok(list?.kind === "stock", `${people}명·${periodId}: kind 가 "stock" 아님`);
  return list;
}

/** 물·가스레인지 1대·품목 수량이 기대값과 같다. 품목은 이름 → "수량단위"(예: 쌀 → "4kg")로 맞춰 다른 이름이 끼면 실패 */
function assertStock(
  people: number,
  periodId: string,
  want: { waterL: number; water: ReturnType<typeof waterPacks>; items: Record<string, string> },
) {
  const { items, ...rest } = stockOf(people, periodId);
  assert.deepEqual(rest, { kind: "stock", waterL: want.waterL, water: want.water, stove: 1 });
  assert.deepEqual(Object.fromEntries(items.map((it) => [it.name, `${it.qty}${it.unit}`])), want.items);
  assert.equal(items.length, Object.keys(want.items).length, "같은 이름 품목이 두 번 있음");
}

test("waterPacks: 2L 6병 묶음으로 올림 (84·21·42·168L)", () => {
  assert.deepEqual(waterPacks(84), { packs: 7, bottles: 42, kg: 84 });
  assert.deepEqual(waterPacks(21), { packs: 2, bottles: 12, kg: 24 });
  assert.deepEqual(waterPacks(42), { packs: 4, bottles: 24, kg: 48 }); // 농림수산성 2인 1주 "2L×6병×4상자"
  assert.deepEqual(waterPacks(168), { packs: 14, bottles: 84, kg: 168 });
});

test('shoppingList(2, "stock7"): 농림수산성 2인 1주 대응표의 "대체 뒤" 수량, 품목은 9종뿐', () => {
  assertStock(2, "stock7", {
    waterL: 42,
    water: { packs: 4, bottles: 24, kg: 48 }, // 원문 물 2L×6병×4상자. 가스레인지 1대는 원문 카세트 곤로
    items: {
      "부탄가스": "12개", // 원문 카세트 가스 12개
      "쌀": "4kg", // 원문 2kg×2봉
      "봉지라면": "18개", // 원문 소면 300g×2봉 + 파스타 600g×2봉(마른 면 1.8kg)
      "컵라면": "6개",
      "즉석밥": "6개",
      [RETORT]: "24개", // 원문 레토르트 18 + 파스타 소스 6
      [CANNED]: "18캔",
    },
  });
});

test('shoppingList(4, "stock7"): 물 84L·7팩(42병, 84kg), 가스레인지 1대, 부탄가스 24개, 쌀 8kg 등', () => {
  assertStock(4, "stock7", {
    waterL: 84,
    water: { packs: 7, bottles: 42, kg: 84 },
    items: { "부탄가스": "24개", "쌀": "8kg", "봉지라면": "36개", "컵라면": "12개", "즉석밥": "12개", [RETORT]: "48개", [CANNED]: "36캔" },
  });
});

test('shoppingList(4, "stock14"): 물 168L·14팩(84병, 168kg), 부탄가스 48개, 쌀 16kg 등', () => {
  assertStock(4, "stock14", {
    waterL: 168,
    water: { packs: 14, bottles: 84, kg: 168 },
    items: { "부탄가스": "48개", "쌀": "16kg", "봉지라면": "72개", "컵라면": "24개", "즉석밥": "24개", [RETORT]: "96개", [CANNED]: "72캔" },
  });
});

test("레토르트 식품 + 통조림 = supplies().meals (인원 1·4·20, 7·14일)", () => {
  for (const people of [1, 4, 20]) {
    for (const [periodId, days] of [["stock7", 7], ["stock14", 14]] as const) {
      const qty = Object.fromEntries(stockOf(people, periodId).items.map((it) => [it.name, it.qty]));
      assert.equal(qty[RETORT] + qty[CANNED], supplies(people, days)?.meals, `${people}명·${days}일`);
    }
  }
});

test('shoppingList(4, "bag"): 가방 몫 1인 2L·500mL 4병·9끼·가방 4개, 집 몫 28L·3팩(18병, 36kg), 품목·부탄가스 없음', () => {
  assert.deepEqual(shoppingList(4, "bag"), {
    kind: "bag",
    bag: { perPersonL: 2, bottles500PerPerson: 4, mealsPerPerson: 9, bags: 4 },
    home: { waterL: 28, packs: 3, bottles: 18, kg: 36 },
  });
});

test('shoppingList(1, "bag"): 가방 몫 1인 2L·500mL 4병·9끼, 집 몫 7L·1팩(6병, 12kg)', () => {
  assert.deepEqual(shoppingList(1, "bag"), {
    kind: "bag",
    bag: { perPersonL: 2, bottles500PerPerson: 4, mealsPerPerson: 9, bags: 1 },
    home: { waterL: 7, packs: 1, bottles: 6, kg: 12 },
  });
});

test("가구원 수가 1~20 정수가 아니거나 기간 id 가 KIT_PERIODS 에 없으면 shoppingList·shoppingText 모두 null", () => {
  for (const people of [0, -1, 1.5, 21, NaN]) {
    for (const periodId of ["bag", "stock7", "stock14"]) {
      assert.equal(shoppingList(people, periodId), null, `shoppingList ${people}명·${periodId}`);
      assert.equal(shoppingText(people, periodId), null, `shoppingText ${people}명·${periodId}`);
    }
  }
  assert.equal(shoppingList(4, "stock30"), null, "shoppingList stock30");
  assert.equal(shoppingText(4, "stock30"), null, "shoppingText stock30");
});

test('shoppingText(4, "stock7"): 첫 줄 "4명 · 7일 비축", 물·봉지라면·레토르트·출처 줄, 가격 없음, 주소는 KIT_SOURCES 뿐', () => {
  const text = shoppingText(4, "stock7");
  assert.ok(text, "null");
  const lines = text.split("\n");
  assert.ok(lines[0].includes("4명 · 7일 비축"), `첫 줄: ${lines[0]}`);
  for (const want of ["2L 생수 6병 묶음 7팩(42병, 약 84kg)", "봉지라면 36개", `${RETORT} 48개`, KIT_SOURCES.maff.url]) {
    assert.ok(lines.some((line) => line.includes(want)), `줄 없음: ${want}`);
  }
  assert.doesNotMatch(text, /\d ?원/, "숫자 뒤 '원'(가격)");
  // KIT_SOURCES url 을 모두 지웠는데 http 가 남으면 다른 주소가 있는 것
  const rest = Object.values(KIT_SOURCES).reduce((t, s) => t.replaceAll(s.url, ""), text);
  assert.doesNotMatch(rest, /http/, "KIT_SOURCES 밖 주소");
});

test('shoppingText(4, "bag"): "가방에 넣을 몫"과 "집에 둘 몫"이 서로 다른 줄에 있다', () => {
  const text = shoppingText(4, "bag");
  assert.ok(text, "null");
  const lines = text.split("\n");
  const bag = lines.findIndex((line) => line.includes("가방에 넣을 몫"));
  const home = lines.findIndex((line) => line.includes("집에 둘 몫"));
  assert.ok(bag >= 0 && home >= 0 && bag !== home, `가방 몫 ${bag}번 줄, 집 몫 ${home}번 줄`);
});

test("KIT_SOURCES 에 새 농림수산성 출처 maff·maff-water·maff-carry 가 https 링크·확인일(YYYY-MM-DD)과 함께 있다", () => {
  const sources = new Map(Object.entries(KIT_SOURCES));
  for (const key of NEW_SOURCE_KEYS) {
    const s = sources.get(key);
    assert.ok(s, `${key} 없음`);
    assert.match(s.url, /^https:\/\//, `${key}: url`);
    assert.match(s.checkedAt, /^\d{4}-\d{2}-\d{2}$/, `${key}: checkedAt`);
  }
});

test("shopping.ts 에 별칭(@/) import 가 없다 (node --test 는 @/ 를 풀지 못한다)", () => {
  const src = readFileSync(new URL("./shopping.ts", import.meta.url), "utf8");
  assert.doesNotMatch(src, /\b(?:from|import)\s*\(?\s*["'`]@\//);
});
