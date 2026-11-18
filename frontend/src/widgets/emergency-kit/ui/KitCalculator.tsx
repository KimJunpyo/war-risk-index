"use client";

import { useId, useState } from "react";
import { KIT_PERIODS, KIT_SOURCES, MAX_PEOPLE, MEALS_PER_PERSON_DAY, supplies, WATER_L_PER_PERSON_DAY } from "@/entities/guide";
import { SegmentedControl } from "@/shared/ui";
import { SourceLinks } from "./SourceLinks";

const MIN_PEOPLE = 1; // supplies() 의 가구원 하한과 같음
const DEFAULT_PEOPLE = "4"; // 첫 화면 값: 기획 예시(4인 가구·7일 비축 → 물 84L)
const DEFAULT_PERIOD_ID = "stock7"; // 처음 고른 기간: 7일 비축(Q2 의 비축 기본). 목록 순서가 아니라 id 로 고른다
const BAG_PERIOD_ID = "bag"; // 3일 가방: 가방은 한 사람에 하나라 1인분 물 무게를 따로 보인다
const PERIOD_OPTIONS = KIT_PERIODS.map((p) => ({ value: p.id, label: p.label }));
// 계산 기준 출처: 물 3L·7일은 스웨덴 MCF, 3일·14일은 국민안전24 비상대비
const BASIS_SOURCES = [KIT_SOURCES.mcf, KIT_SOURCES["mois-emergency"]];
const LABEL = "text-xs text-fg-muted";

/** 물·식량 계산기: 가구원 수·기간 → 물 L(무게 kg)·식량 끼니와 1인당 값. 브라우저 안에서만 계산한다(요청 없음).
 *  md 미만은 입력 아래에 결과, md 이상은 입력 오른쪽에 결과 */
export function KitCalculator() {
  const id = useId();
  const errorId = `${id}-error`;
  const [people, setPeople] = useState(DEFAULT_PEOPLE);
  const [period, setPeriod] = useState(DEFAULT_PERIOD_ID);
  const days = KIT_PERIODS.find((p) => p.id === period)?.days ?? NaN; // 목록에 없는 id 면 supplies 가 null
  // 입력 글자를 그대로 숫자로 바꿔 넘긴다. 빈칸(0)·소수·범위 밖이면 supplies 가 null
  const total = supplies(Number(people), days);
  const each = supplies(1, days); // 1인분

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
        <div className="shrink-0 space-y-3">
          <div>
            <label htmlFor={id} className={`block ${LABEL}`}>가구원 수</label>
            {/* max-md:text-base: 16px 보다 작은 입력창은 iOS Safari 가 포커스 때 화면을 확대함.
                autoComplete off: 새로 고침·뒤로 가기 때 브라우저가 되살린 값은 하이드레이션이 그대로 둬 상태(첫 값)와 어긋남 */}
            <input
              id={id}
              type="number"
              inputMode="numeric"
              autoComplete="off"
              min={MIN_PEOPLE}
              max={MAX_PEOPLE}
              value={people}
              onChange={(e) => setPeople(e.target.value)}
              aria-invalid={!total}
              aria-describedby={total ? undefined : errorId}
              className="mt-1 w-24 rounded-md border border-line-strong bg-field px-2 py-1 text-fg max-md:text-base"
            />
          </div>
          <div>
            {/* 보이는 제목. 접근 이름은 SegmentedControl 의 aria-label 이라 두 번 읽지 않게 숨김 */}
            <p aria-hidden="true" className={`mb-1 ${LABEL}`}>기간</p>
            <SegmentedControl label="기간" value={period} options={PERIOD_OPTIONS} onChange={setPeriod} />
          </div>
        </div>
        {/* live 영역은 값이 잘못돼도 DOM 에 둔다(결과와 함께 새로 붙으면 읽지 않는 스크린리더가 많음).
            숫자만 바뀌어도 문장 전체를 읽게 atomic */}
        <div aria-live="polite" aria-atomic="true" className="min-w-0 md:flex-1">
          {total && each ? (
            <>
              {/* 무게는 물 1L ≈ 1kg 로만 보인다(Q3) */}
              <p className="text-lg font-semibold text-fg-strong">물 {total.waterL}L(약 {total.waterL}kg) · 식량 {total.meals}끼</p>
              <p className="mt-1 text-sm text-fg-soft">1인당 물 {each.waterL}L · {each.meals}끼</p>
              {period === BAG_PERIOD_ID && (
                <p className="mt-2 text-sm text-fg-soft">가방은 한 사람에 하나입니다. 가방 하나에 넣을 물만 약 {each.waterL}kg입니다.</p>
              )}
            </>
          ) : (
            <p id={errorId} className="text-sm text-warning">{MIN_PEOPLE}~{MAX_PEOPLE} 사이 정수로 입력해 주세요</p>
          )}
        </div>
      </div>
      <p className={`mt-4 leading-relaxed ${LABEL}`}>
        계산 기준: 1인 1일 물 {WATER_L_PER_PERSON_DAY}L·{MEALS_PER_PERSON_DAY}끼, 물 1L는 약 1kg. 물은 스웨덴 MCF 권고(성인 1일 3~5L)의 하한이고,
        기간은 국민안전24 생존배낭(2~3일분)·핵 폭발 이후 대비(2주)와 스웨덴 MCF 가정 대비(1주)를 따랐습니다.
      </p>
      <SourceLinks sources={BASIS_SOURCES} />
    </div>
  );
}
