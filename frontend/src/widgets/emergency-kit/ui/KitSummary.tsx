"use client";

import { GO_BAG_ITEMS, KIT_PERIODS, shoppingList, STOCK_ITEMS, supplies } from "@/entities/guide";
import { useKitChecked } from "../model/kit-checked";
import { useKitCalc } from "../model/use-kit-calc";

const KIT_HREF = "#kit"; // EmergencyPage 의 가방 영역 id
const CALC_HREF = "#calc"; // EmergencyPage 의 계산 영역 id
// 가방 카드 줄: 아래 가방 영역(KitChecklist) 두 목록과 같은 순서, 이름만 짧게
const BAG_ROWS = [
  { name: "3일 가방", items: GO_BAG_ITEMS },
  { name: "7일 비축", items: STOCK_ITEMS },
];
const WATER_PACK = "2L 생수 6병 묶음"; // shopping.ts waterPacks 의 묶음 단위
// 카드 전체가 링크다. 포커스 표시는 가방 타일과 같다
const CARD =
  "block rounded-2xl border border-line bg-surface p-5 transition hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-soft";
const CARD_TITLE = "block font-semibold text-fg-strong";
const NOTE = "block text-sm text-fg-soft";

/** 첫 화면 "미리 준비하기" 카드 둘(1-9): 비상 가방 챙긴 수(→ #kit)·우리 집 물(→ #calc). 360 위아래, md 이상 2열(plan.md 7-7).
 *  아래 가방 타일·계산기와 같은 저장 상태(useKitChecked·useKitCalc)를 읽어 같은 탭에서 바꾸면 바로 따라간다.
 *  서버 렌더·하이드레이션 때는 기본값(0/7·0/8, 4명·7일 비축)이고 저장값은 그 뒤에 들어온다 */
export function KitSummary() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <BagCard />
      <WaterCard />
    </div>
  );
}

function BagCard() {
  const checked = useKitChecked();
  return (
    <a href={KIT_HREF} className={CARD}>
      <span className={CARD_TITLE}>비상 가방</span>
      {BAG_ROWS.map(({ name, items }) => {
        const done = items.filter((it) => checked.includes(it.id)).length;
        return (
          <span key={name} className="mt-3 flex items-center gap-3 text-sm">
            <span className="w-16 shrink-0 text-fg">{name}</span>
            {/* 값은 옆 글자(n/전체 챙김)와 같아 보조 기술에서는 숨긴다(링크 이름에 같은 내용이 두 번 들어가지 않게) */}
            <span
              role="progressbar"
              aria-hidden="true"
              aria-valuemin={0}
              aria-valuemax={items.length}
              aria-valuenow={done}
              className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-track"
            >
              <span className="block h-full bg-success" style={{ width: `${(done / items.length) * 100}%` }} />
            </span>
            <span className="shrink-0 text-fg-soft">{done}/{items.length} 챙김</span>
          </span>
        );
      })}
    </a>
  );
}

function WaterCard() {
  const [calc] = useKitCalc();
  const period = KIT_PERIODS.find((p) => p.id === calc.period);
  const total = period ? supplies(calc.people, period.days) : null;
  const list = shoppingList(calc.people, calc.period);
  if (!period || !total || !list) return null; // useKitCalc 는 바른 값만 준다(readKitCalc·계산기가 검사)
  return (
    <a href={CALC_HREF} className={CARD}>
      <span className={CARD_TITLE}>우리 집 물</span>
      {/* 무게는 물 1L ≈ 1kg 로만 보인다(계산기와 같음) */}
      <span className="mt-2 block text-lg font-semibold text-fg-strong">물 {total.waterL}L(약 {total.waterL}kg)</span>
      <span className={`mt-1 ${NOTE}`}>{calc.people}명 · {period.label}</span>
      <span className={NOTE}>
        {list.kind === "stock"
          ? `${WATER_PACK} ${list.water.packs}팩`
          : `가방 ${list.bag.perPersonL * list.bag.bags}L · 집 ${list.home.waterL}L`}
      </span>
    </a>
  );
}
