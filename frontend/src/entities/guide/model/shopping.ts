// 장보기 단위 환산: 물·식량 계산(kit.ts supplies)을 실제로 살 단위(2L 생수 6병 묶음, 품목 개수)로 바꾼다(plan.md 7-5, Q4~Q6).
// node --test 로 바로 돌리므로 별칭(@/) import 없이 같은 폴더 ./kit.ts 만 import 한다. 가격·브랜드·쇼핑몰은 넣지 않는다.
import { KIT_PERIODS, KIT_SOURCES, MEALS_PER_PERSON_DAY, supplies, WATER_L_PER_PERSON_DAY } from "./kit.ts";

interface ShoppingItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
}

interface WaterPacks {
  packs: number; // 2L 6병 묶음 수
  bottles: number;
  kg: number;
}

/** 7·14일 비축은 물·가스레인지·품목, 3일 가방은 물만 가방 몫과 집 몫으로 나눈다(식량은 모두 가방 몫) */
export type ShoppingList =
  | { kind: "stock"; waterL: number; water: WaterPacks; stove: number; items: ShoppingItem[] }
  | {
      kind: "bag";
      bag: { perPersonL: number; bottles500PerPerson: number; mealsPerPerson: number; bags: number };
      home: { waterL: number } & WaterPacks;
    };

const BOTTLE_L = 2; // 물 1L ≈ 1kg 라 병 무게도 약 2kg
const PACK_BOTTLES = 6; // 농림수산성도 2인 1주 42L 를 2L 6병 4상자(48L)로 올렸다
const STOVES = 1; // 휴대용 가스레인지는 가구당 1대
const BUTANE_ID = "butane"; // 복사 글자에서 휴대용 가스레인지와 한 줄에 적는 품목
const BAG_WATER_L_PER_PERSON = 2; // 국민안전24 비상대비 그림 29 "성인 기준 하루 약 2L" × 가방에 1일분(농림수산성 가이드 (6)), Q6 결정 A
const BAG_BOTTLE_ML = 500;

// 1인 1주 = 농림수산성 aff 2026년 3월호 "가정 비축 예(1주·어른 2명)" ÷ 2. 주식·반찬 일부는 한국 품목으로 바꿈(Q4 보완)
const STOCK_WEEK_PER_PERSON: ShoppingItem[] = [
  { id: BUTANE_ID, name: "부탄가스", qty: 6, unit: "개" }, // 원문 카세트 가스 12개
  { id: "rice", name: "쌀", qty: 2, unit: "kg" }, // 원문 2kg×2봉
  // 원문 마른 면 1.8kg(소면 300g/봉×2 + 파스타 600g/봉×2) ÷ 2 = 900g ÷ 1인분 약 100g.
  // 마른 면 약 100g·봉지라면 1개를 각각 1인분으로 본 근사는 확실하지 않음(일반 포장 표기 기준 근사)
  { id: "ramen", name: "봉지라면", qty: 9, unit: "개" },
  { id: "cup-ramen", name: "컵라면", qty: 3, unit: "개" }, // 원문 컵라면류 6
  { id: "instant-rice", name: "즉석밥", qty: 3, unit: "개" }, // 원문 즉석밥 6
  // 원문 (레토르트 18 + 파스타 소스 6) ÷ 2. 통조림 9 와 더하면 1인 1주 끼니 수 21
  { id: "retort", name: "레토르트 식품(카레·짜장·덮밥 소스 등)", qty: 12, unit: "개" },
  { id: "canned", name: "통조림(고기·생선)", qty: 9, unit: "캔" }, // 원문 18캔
];

/** 물(L) → 2L 6병 묶음으로 올림한 팩 수·병 수·무게(kg) */
export function waterPacks(liters: number): WaterPacks {
  const packs = Math.ceil(liters / (BOTTLE_L * PACK_BOTTLES));
  const bottles = packs * PACK_BOTTLES;
  return { packs, bottles, kg: bottles * BOTTLE_L };
}

/** 가구원 수·기간 id → 장보기 목록. 가구원이 1~MAX_PEOPLE 정수가 아니거나 기간 id 가 KIT_PERIODS 에 없으면 null(supplies 검증 그대로) */
export function shoppingList(people: number, periodId: string): ShoppingList | null {
  const period = KIT_PERIODS.find((p) => p.id === periodId);
  const total = period ? supplies(people, period.days) : null;
  if (!period || !total) return null;
  if (period.id === "bag") {
    const homeL = total.waterL - people * BAG_WATER_L_PER_PERSON;
    return {
      kind: "bag",
      bag: {
        perPersonL: BAG_WATER_L_PER_PERSON,
        bottles500PerPerson: (BAG_WATER_L_PER_PERSON * 1000) / BAG_BOTTLE_ML,
        mealsPerPerson: period.days * MEALS_PER_PERSON_DAY,
        bags: people, // 1인 1개
      },
      home: { waterL: homeL, ...waterPacks(homeL) },
    };
  }
  const weeks = period.days / 7; // 7·14일이라 정수
  return {
    kind: "stock",
    waterL: total.waterL,
    water: waterPacks(total.waterL),
    stove: STOVES,
    items: STOCK_WEEK_PER_PERSON.map((it) => ({ ...it, qty: it.qty * people * weeks })),
  };
}

/** 복사용 여러 줄 글자(줄 구분 "\n"). 주소는 KIT_SOURCES 의 url 뿐이다. 잘못된 입력이면 null */
export function shoppingText(people: number, periodId: string): string | null {
  const list = shoppingList(people, periodId);
  if (!list) return null;
  const title = `${people}명 · ${KIT_PERIODS.find((p) => p.id === periodId)?.label}`;
  const water = (w: WaterPacks) => `${BOTTLE_L}L 생수 ${PACK_BOTTLES}병 묶음 ${w.packs}팩(${w.bottles}병, 약 ${w.kg}kg)`;
  const item = (it: ShoppingItem) => `${it.name} ${it.qty}${it.unit}`;
  if (list.kind === "bag") {
    const { bag, home } = list;
    return [
      `비상 가방 장보기 목록 (${title})`,
      `가방에 넣을 몫 (가방 ${bag.bags}개, 1인 1개)`,
      `- 1인: 마실 물 ${bag.perPersonL}L(${BAG_BOTTLE_ML}mL ${bag.bottles500PerPerson}병), 조리 없이 먹는 식량 ${bag.mealsPerPerson}끼`,
      "집에 둘 몫",
      `- ${water(home)}, 필요 ${home.waterL}L`,
      "국민안전24는 생존배낭에 2~3일분을 가방·캐리어 등으로 준비하라고 안내합니다. 들 수 있으면 더 넣으세요.",
      "7일 비축을 준비했다면 집에 둘 몫은 그 안에 들어 있습니다.",
      `기준: 1인 1일 물 ${WATER_L_PER_PERSON_DAY}L·${MEALS_PER_PERSON_DAY}끼. 가방에는 식량 전부와 하루 마실 물 ${bag.perPersonL}L, 나머지 물은 집에 둠`,
      `출처: ${KIT_SOURCES["mois-emergency"].url}`,
      `출처: ${KIT_SOURCES["maff-carry"].url}`,
    ].join("\n");
  }
  // 부탄가스는 가스레인지 줄에 붙이고 나머지는 한 줄씩. 품목 순서가 바뀌어도 맞게 id 로 가른다
  const butane = list.items.find((it) => it.id === BUTANE_ID);
  return [
    `비상 비축 장보기 목록 (${title})`,
    `- ${water(list.water)}`,
    `- 휴대용 가스레인지 ${list.stove}대` + (butane ? `, ${item(butane)}` : ""),
    ...list.items.filter((it) => it.id !== BUTANE_ID).map((it) => `- ${item(it)}`),
    "조리용 물은 위 물에 들어 있습니다. 데우기·설거지 물은 따로 준비하세요.",
    `기준: 1인 1일 물 ${WATER_L_PER_PERSON_DAY}L, 일본 농림수산성 가정 비축 예(어른 2명·1주)를 인원·기간에 맞춰 늘리고 주식·반찬 일부를 한국 품목으로 바꿈`,
    `출처: ${KIT_SOURCES.maff.url}`,
  ].join("\n");
}
