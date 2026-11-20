"use client";

import { useState } from "react";
import { KIT_PERIODS, KIT_SOURCES, shoppingList, shoppingText } from "@/entities/guide";
import { Icon } from "@/shared/ui";
import { SHOPPING_ICON } from "./shopping-icons";
import { SourceLinks } from "./SourceLinks";

const WATER_PACK = "2L 생수 6병 묶음"; // shopping.ts waterPacks 의 묶음 단위
const COPIED = "복사했습니다";
const COPY_FAILED = "복사하지 못했습니다. 목록을 길게 눌러 직접 복사해 주세요.";
// 안내를 비운 뒤 다시 채우기까지. writeText 가 바로 끝나면 비움·채움이 한 프레임에 합쳐져 스크린리더가 바뀐 줄 모르므로 틈을 둔다.
// 인수 조건 "1초 안에 안내"보다 충분히 짧게
const REFILL_MS = 100;
// 비축: 품목·수량은 농림수산성 가정 비축 예, 데우기·설거지 물 안내는 농림수산성 식품 비축 가이드: 물.
// 3일 가방: 2~3일분·성인 하루 식수 약 2L 는 국민안전24, 가방에 1일분은 농림수산성 재해 발생 당일
const STOCK_SOURCES = [KIT_SOURCES.maff, KIT_SOURCES["maff-water"]];
const BAG_SOURCES = [KIT_SOURCES["mois-emergency"], KIT_SOURCES["maff-carry"]];
const SUBTITLE = "mt-3 text-sm font-semibold text-fg";
const LIST = "mt-2 list-disc space-y-1 pl-5 text-sm text-fg";
const NOTE = "mt-2 text-sm text-fg-soft";
// 높이 44px(plan.md 7-8). 테두리·hover 는 계산기 −/+ 버튼과 같다
const COPY_BUTTON =
  "inline-flex h-11 items-center gap-2 rounded-md border border-line-strong px-4 text-sm text-fg transition hover:bg-surface-hover";

/** 계산 결과 아래 장보기 목록(shoppingList)과 복사 버튼. 가구원 수·기간이 잘못되면 그리지 않는다.
 *  복사 글자는 shoppingText 그대로이고, 클립보드에 못 넣으면 다른 복사 방법 대신 직접 복사하라고 안내한다 */
export function KitShoppingList({ people, period }: { people: number; period: string }) {
  // 마지막으로 복사를 시도한 글자와 결과. 지금 목록 글자와 다르면(입력을 바꿈) 안내를 비워 지난 결과가 남지 않게 한다
  const [copied, setCopied] = useState<{ text: string; ok: boolean } | null>(null);
  const list = shoppingList(people, period);
  const text = shoppingText(people, period);
  if (!list || !text) return null;

  const copy = async () => {
    setCopied(null); // 같은 입력으로 다시 눌러도 스크린리더가 다시 읽게 안내를 한 번 비운다
    let ok = true;
    try {
      // 누를 때 읽는다. clipboard 가 없으면(보안 출처가 아님 등) TypeError, 권한이 없으면 거절이라 둘 다 catch
      await navigator.clipboard.writeText(text);
    } catch {
      ok = false;
    }
    setTimeout(() => setCopied({ text, ok }), REFILL_MS);
  };
  const status = copied?.text === text ? copied : null;

  return (
    // break-keep: 좁은 폭에서 "48개"·"먹는" 같은 낱말 가운데서 줄을 바꾸지 않게(띄어쓰기에서만)
    <div className="mt-4 break-keep border-t border-line pt-4">
      <h3 className="font-semibold text-fg">
        장보기 목록 ({people}명 · {KIT_PERIODS.find((p) => p.id === period)?.label})
      </h3>
      {list.kind === "stock" ? (
        <>
          <ul className={LIST}>
            <li>{WATER_PACK} {list.water.packs}팩({list.water.bottles}병, 약 {list.water.kg}kg)</li>
            <li>휴대용 가스레인지 {list.stove}대</li>
            {list.items.map((it) => (
              <li key={it.id}>{it.name} {it.qty}{it.unit}</li>
            ))}
          </ul>
          <p className={NOTE}>조리용 물은 위 물에 들어 있습니다. 데우기·설거지 물은 따로 준비하세요.</p>
          <p className={NOTE}>주식은 농림수산성 예시를 따라 끼니 수보다 넉넉합니다.</p>
        </>
      ) : (
        <>
          <h4 className={SUBTITLE}>가방에 넣을 몫 (가방 {list.bag.bags}개, 1인 1개)</h4>
          <ul className={LIST}>
            <li>
              1인: 마실 물 {list.bag.perPersonL}L(500mL {list.bag.bottles500PerPerson}병) · 조리 없이 먹는 식량 {list.bag.mealsPerPerson}끼
            </li>
          </ul>
          <h4 className={SUBTITLE}>집에 둘 몫</h4>
          <ul className={LIST}>
            <li>{WATER_PACK} {list.home.packs}팩({list.home.bottles}병, 약 {list.home.kg}kg) · 필요 {list.home.waterL}L</li>
          </ul>
          <p className={NOTE}>국민안전24는 생존배낭에 2~3일분을 가방·캐리어 등으로 준비하라고 안내합니다. 들 수 있으면 더 넣으세요.</p>
          <p className={NOTE}>7일 비축을 준비했다면 집에 둘 몫은 그 안에 들어 있습니다.</p>
        </>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={copy} className={COPY_BUTTON}>
          <Icon className="h-4 w-4">{SHOPPING_ICON.copy()}</Icon>
          장보기 목록 복사
        </button>
        {/* 안내 live 영역은 누르기 전부터 비워 둔다(새로 붙는 live 영역은 읽지 않는 스크린리더가 많음) */}
        <p aria-live="polite" className={`text-sm ${status?.ok ? "text-success" : "text-warning"}`}>
          {status ? (status.ok ? COPIED : COPY_FAILED) : ""}
        </p>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-fg-muted">
        {list.kind === "stock" ? (
          <>
            목록 기준: 물은 필요량을 {WATER_PACK} 단위로 올렸습니다. 품목은 일본 농림수산성 가정 비축 예(어른 2명·1주)를
            인원·기간에 맞춰 늘리고, 주식·반찬 일부를 한국 품목으로 바꿨습니다(마른 면 → 봉지라면, 파스타 소스 → 레토르트 식품).
          </>
        ) : (
          <>
            목록 기준: 가방에는 식량 전부와 하루 마실 물 {list.bag.perPersonL}L(국민안전24 성인 하루 식수 약 2L, 농림수산성
            가방에 1일분 안내)를 넣고, 나머지 물은 집에 둡니다.
          </>
        )}
      </p>
      <SourceLinks sources={list.kind === "stock" ? STOCK_SOURCES : BAG_SOURCES} />
    </div>
  );
}
