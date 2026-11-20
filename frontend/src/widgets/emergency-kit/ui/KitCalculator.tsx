"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { KIT_PERIODS, KIT_SOURCES, MAX_PEOPLE, MEALS_PER_PERSON_DAY, supplies, WATER_L_PER_PERSON_DAY } from "@/entities/guide";
import { Icon, SegmentedControl } from "@/shared/ui";
import { useKitCalc } from "../model/use-kit-calc";
import { CALC_ICON } from "./calc-icons";
import { SourceLinks } from "./SourceLinks";

const MIN_PEOPLE = 1; // supplies() 의 가구원 하한과 같음
const BAG_PERIOD_ID = "bag"; // 3일 가방: 가방은 한 사람에 하나라 1인분 물 무게를 따로 보인다
const PERIOD_OPTIONS = KIT_PERIODS.map((p) => ({ value: p.id, label: p.label }));
// 계산 기준 출처: 물 3L·7일은 스웨덴 MCF, 3일·14일은 국민안전24 비상대비
const BASIS_SOURCES = [KIT_SOURCES.mcf, KIT_SOURCES["mois-emergency"]];
const LABEL = "text-xs text-fg-muted";
// −/+ 는 44×44px(plan.md 7-8). 끝값은 disabled 대신 aria-disabled: disabled 가 되면 브라우저가 그 버튼의 포커스를 버려 키보드 위치를 잃음
const STEP_BUTTON =
  "flex h-11 w-11 items-center justify-center rounded-md border border-line-strong text-fg transition hover:bg-surface-hover aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-transparent";
const NO_SUBSCRIBE = () => () => {}; // 하이드레이션 여부는 바뀐 뒤 다시 바뀌지 않아 구독할 것이 없음

/** 물·식량 계산기: 가구원 수(−/+·숫자 칸)·기간(칩) → 물 L(무게 kg)·식량 끼니와 1인당 값. 브라우저 안에서만 계산한다(요청 없음).
 *  바른 입력은 이 브라우저에 저장한다(useKitCalc). md 미만은 입력 아래에 결과, md 이상은 입력 오른쪽에 결과 */
export function KitCalculator() {
  const id = useId();
  const errorId = `${id}-error`;
  const [calc, setCalc] = useKitCalc();
  const hydrated = useSyncExternalStore(NO_SUBSCRIBE, () => true, () => false); // 서버 렌더·하이드레이션 첫 렌더는 false
  // 숫자 칸의 잘못된 글자(빈칸·0·21·1.5 등). 저장하지 않고 칸에만 둔다. 바른 값이면 null 이고 칸은 저장값을 보인다
  const [draft, setDraft] = useState<string | null>(null);
  const people = draft ?? String(calc.people);
  const days = KIT_PERIODS.find((p) => p.id === calc.period)?.days ?? NaN; // 목록에 없는 id 면 supplies 가 null
  // 입력 글자를 그대로 숫자로 바꿔 넘긴다. 빈칸(0)·소수·범위 밖이면 supplies 가 null
  const total = supplies(Number(people), days);
  const each = supplies(1, days); // 1인분

  const typePeople = (value: string) => {
    const n = Number(value);
    if (supplies(n, days)) {
      setCalc({ people: n });
      setDraft(null);
    } else setDraft(value);
  };
  // 바른 값은 한 명씩(끝값에서는 그대로). 잘못된 값은 1~MAX_PEOPLE 안으로: 빈칸·0·음수 → 1, 넘치면 MAX_PEOPLE, 소수는 누른 방향의 정수
  const step = (dir: 1 | -1) => {
    const n = Number(people) || 0;
    const next = total ? n + dir : dir > 0 ? Math.ceil(n) : Math.floor(n);
    setCalc({ people: Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, next)) });
    setDraft(null);
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
        <div className="shrink-0 space-y-3">
          <div>
            <label htmlFor={id} className={`block ${LABEL}`}>가구원 수</label>
            <div className="mt-1 flex items-center gap-2">
              <button type="button" aria-label="가구원 수 줄이기" aria-disabled={!!total && calc.people === MIN_PEOPLE} onClick={() => step(-1)} className={STEP_BUTTON}>
                <Icon className="h-5 w-5">{CALC_ICON.minus()}</Icon>
              </button>
              {/* max-md:text-base: 16px 보다 작은 입력창은 iOS Safari 가 포커스 때 화면을 확대함.
                  autoComplete off: 새로 고침·뒤로 가기 때 브라우저가 되살린 값은 하이드레이션이 그대로 둬 상태(첫 값)와 어긋남.
                  readOnly(하이드레이션 전): 그때 친 글자는 React 가 받지 못하고, WebKit 은 하이드레이션하는 동안 넣은 글자를 잃음(실측) */}
              <input
                id={id}
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={MIN_PEOPLE}
                max={MAX_PEOPLE}
                value={people}
                readOnly={!hydrated}
                onChange={(e) => typePeople(e.target.value)}
                aria-invalid={!total}
                aria-describedby={total ? undefined : errorId}
                className="h-11 w-16 rounded-md border border-line-strong bg-field px-2 text-center text-fg max-md:text-base"
              />
              <button type="button" aria-label="가구원 수 늘리기" aria-disabled={!!total && calc.people === MAX_PEOPLE} onClick={() => step(1)} className={STEP_BUTTON}>
                <Icon className="h-5 w-5">{CALC_ICON.plus()}</Icon>
              </button>
            </div>
          </div>
          <div>
            {/* 보이는 제목. 접근 이름은 SegmentedControl 의 aria-label 이라 두 번 읽지 않게 숨김. h-11: 칩 높이 40px(plan.md 7-8) */}
            <p aria-hidden="true" className={`mb-1 ${LABEL}`}>기간</p>
            <SegmentedControl
              label="기간"
              value={calc.period}
              options={PERIOD_OPTIONS}
              onChange={(period) => setCalc({ period })}
              className="h-11"
            />
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
              {calc.period === BAG_PERIOD_ID && (
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
