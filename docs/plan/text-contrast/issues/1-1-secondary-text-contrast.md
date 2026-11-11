# 보조 글자 명도 대비 4.5:1 (WCAG 1.4.3)

## 배경

M7 리뷰에서 12px 보조 글자 `text-neutral-500`이 약 3.8~4.2:1로 WCAG AA(작은 글자 4.5:1)에 못 미친다는 지적이 나왔다. 화면 전체의 관행이라 M7 범위에서 뺐다. 조사해 보니 `text-neutral-500`은 이 사이트의 어떤 배경에서도 최대 4.23:1이고, 더 흐린 `text-neutral-600`(10~11px 힌트)은 대상 6곳 모두 카드 위에서 2.43:1이다. 보조 글자를 4.5:1을 넘는 가장 어두운 팔레트 단계인 `text-neutral-400`으로 모은다(`plan.md` 5절, Q1·Q2 2026-11-11 확정).

## 범위

- 포함
  - `frontend/src` 17개 파일의 글자 색: `text-neutral-500` 44건·`text-neutral-600` 6건 → `text-neutral-400`(그중 위협·경고 사건 범례 `<b>` 2건은 `text-neutral-300`)
  - 추이 차트 축 SVG `fill-neutral-500` 2건 → `fill-neutral-400`
  - 지도 데이터 없는 나라 이름 `#6b7280` → `#9ca3af`
  - 바꾼 뒤 부모와 같은 색이 되는 자식의 글자 색 클래스 삭제
  - 소스 계약 `tests/test_m8_contrast.py`, 화면 실측 `frontend/e2e/contrast.spec.ts`(새 파일)
- 제외(범위 밖)
  - 링크 밑줄 색과 체크리스트 출처 링크 hover(1-2)
  - 글자 크기·굵기·문구·배치, 애니메이션(`animate-pulse` 포함)
  - 비활성 컨트롤의 `disabled:opacity-*`·`aria-disabled:opacity-*`(WCAG 예외)
  - 장식 선·경계(`border-white/*`, `divide-white/5`, 차트 격자선, 지도 경위선), 입력창·select 경계(`plan.md` Q4)
  - 이미 통과하는 색 글자(red-400 등)와 대피소 검색창 placeholder(6.94)

## 바꿀 곳 (`plan.md` 5·6절, 줄 번호는 2026-11-11 `main` d2a50ad 기준)

경로는 `frontend/src/` 기준. "카드"는 `bg-white/[0.03]`, "페이지"는 `#07090d`. 대비는 소수 둘째 자리.

| 파일 | 줄 | 글자 (크기) | 배경 | 지금 → 바꿀 값 | 대비 전 → 후 |
|---|---|---|---|---|---|
| `widgets/catalyst-panel/ui/CatalystPanel.tsx` | 24, 26, 37, 39, 41 | action 문구, 설명, 소제목(xs), "없음"(sm) | 카드 | 500 → 400 | 4.00 → 7.35 |
| 〃 | 47 | 범례(11px) | 카드 | 600 → 400 | 2.43 → 7.35 |
| 〃 | 48, 49 | 범례 안 `<b>` | 카드 | 500 → **300** | 4.00 → 12.81 |
| `entities/guide/ui/ActionGuide.tsx` | 39, 54 | 점수 구간(11px), 체크한 항목(xs, 취소선) | 카드 | 500 → 400 | 4.00 → 7.35 |
| 〃 | 59, 66 | 참고·고지(10px) | 카드 | 600 → 400 | 2.43 → 7.35 |
| `views/home/ui/HomePage.tsx` | 115, 122, 130, 136, 146 | 기준일, "종합 7일", "실시간 24시간"(xs), 종합 점수 구성, 여행경보(11px) | 페이지 | 500 → 400 | 4.20 → 7.71 |
| `shared/ui/Panel.tsx` | 23 | StatusText "불러오는 중…"(sm, `animate-pulse`) | 카드·페이지 | 500 → 400 | 4.00~4.20 → 7.35~7.71 |
| `widgets/embassy-contacts/ui/EmbassyContacts.tsx` | 31, 32, 37 | 공관 종류·주소(xs), 출처(11px) | 카드 | 500 → 삭제(카드 400 상속) | 4.00 → 7.35 |
| `entities/catalyst/ui/CatalystItem.tsx` | 20, 30, 35 | 날짜(xs, mono), "→"(sm), "보도 N건"(xs) | 카드 | 500 → 400 | 4.00 → 7.35 |
| `widgets/nearby-shelters/ui/NearbyShelters.tsx` | 180 | 결과 카드 주소(xs) | 카드 안 카드 3%+2% | 500 → 삭제(섹션 400 상속) | 3.85 → 7.06 |
| 〃 | 208 | 위치·출처 안내(11px) | 카드 | 500 → 삭제(섹션 400 상속) | 4.00 → 7.35 |
| `features/select-pair/ui/PairTabs.tsx` | 37 | "실시간 24시간 N"(xs) | 선택 탭 white/8% | 500 → 400 | 3.57 → 6.55 |
| `entities/pair/ui/GradeBadge.tsx` | 4 | "데이터 없음"(xs) | 탭·페이지 | 500 → 400 | 3.57~4.20 → 6.55~7.71 |
| `widgets/world-map/ui/WorldMap.tsx` | 274 | 데이터 없는 나라 이름(SVG `fill` 속성) | 글자 테두리 `#05080e` | `#6b7280` → `#9ca3af` | 4.15 → 7.90 |
| 〃 | 305, 308 | hover 툴팁 상태 사유(11px), "데이터 없음"(xs) | neutral-900/95 | 500 → 400 | 3.80 → 6.97 |
| 〃 | 328 | "N개국"(11px) | 카드 | 600 → 400 | 2.43 → 7.35 |
| 〃 | 351, 354, 367 | "없음"(sm), 주목 국가 기준 본문(11px), 범례(11px) | 카드 | 500 → 400 | 4.00 → 7.35 |
| 〃 | 384, 387 | 범례 안 "(빗금+점)", 조작 안내(11px) | 카드 | 600 → 삭제(범례 줄 400 상속) | 2.43 → 7.35 |
| `widgets/guide-modal/ui/GuideModal.tsx` | 22, 72, 80, 94, 119, 128 | 단계 보조 이름(11px), 점수 구간, 안내, 표 머리, 기관 `dt`, FCDO 안내(xs) | neutral-950 | 500 → 400 | 4.18 → 7.66 |
| `widgets/weekly-movers/ui/WeeklyMovers.tsx` | 30 | 소제목(xs) | 카드 | 500 → 400 | 4.00 → 7.35 |
| `widgets/site-footer/ui/SiteFooter.tsx` | 25, 38, 55 | "(개전 예측 아님)" 설명, 출처 용도, 저작권 줄(xs) | 페이지 | 500 → 삭제(`footer` 400 상속) | 4.20 → 7.71 |
| `entities/live/ui/LiveBadge.tsx` | 23 | "15분 갱신 · N분 전"(xs) | 파란 빛 최대 + white/4% | 500 → 400 | 3.60 → 6.61 |
| `entities/news/ui/NewsCard.tsx` | 18 | 언론사·시간(xs) | 카드(hover: + white/5%) | 500 → 400 | 4.00(hover 3.59) → 7.35(hover 6.58) |
| `entities/risk-index/ui/RiskChart.tsx` | 95, 99 | 축 숫자·연도(SVG, 11px) | 카드 | `fill-neutral-500` → `fill-neutral-400` | 4.00 → 7.35 |
| 〃 | 114 | 범례(11px) | 카드 | 500 → 400 | 4.00 → 7.35 |
| `widgets/past-cases/ui/PastCases.tsx` | 39 | 비교 기준(11px) | 카드 | 500 → 400 | 4.00 → 7.35 |

- 건수: `text-neutral-500` 44건/17파일(`<b>` 2건 포함), `text-neutral-600` 6건/3파일, `fill-neutral-500` 2건, `#6b7280` 1건.
- 바꾸지 않는 곳: `NearbyShelters.tsx` 15 검색창 `placeholder:text-neutral-400`(neutral-900 위 6.94), 선택된 주목 국가의 이유 칩(이미 400, 4.90).
- 위계(바꾼 뒤): 체크 안 한 항목 300 > 체크한 항목 400 + 취소선, 범례 `<b>` 300 > 범례 바탕 400, 지도 데이터 있음 `#e5e7eb` > 없음 `#9ca3af`.

## 할 일

1. **테스트 먼저**: 아래 "테스트"의 소스 계약([1-1] 부분)과 e2e를 쓰고, 수정 전 코드에서 둘 다 실패하는 것을 확인한다. 실패 건수와 대표 항목(예: 홈 기준일 4.20:1)을 PR에 적는다.
2. "바꿀 곳" 표대로 글자 색을 바꾼다. 위협·경고 사건 범례 `<b>` 2건만 `text-neutral-300`이다.
3. "삭제" 행은 글자 색 클래스를 지워 부모 색(neutral-400)을 상속하게 한다. 구현 중 같은 경우(바꾼 뒤 부모와 같은 색)를 더 찾으면 같이 지우고, 지운 위치 목록을 PR에 적는다.
4. `WorldMap.tsx` 274 나라 이름 `fill`의 `#6b7280`을 `#9ca3af`로 바꾼다. 데이터 있는 나라 `#e5e7eb`와 글자 테두리 `#05080e`는 그대로 둔다.
5. 지도 hover 툴팁(305·308)은 앱 브라우저에서 수동으로 확인하고 결과를 PR에 적는다.
6. PR 본문에 전·후 대비 표("바꿀 곳" 표 형식)를 넣는다. 폭 360·1440px 기본 홈 전·후 화면은 앱 브라우저로 찍어 사용자에게 보여 준다(위계 육안 확인용. 이전 PR처럼 본문에는 이미지를 넣지 않음).
7. 커밋 하나: `fix: 보조 글자 명도 대비 4.5:1 (#이슈 번호)`.

## 테스트 (계약, 구현 전에 먼저 작성)

### 소스 계약 `tests/test_m8_contrast.py` (pytest, 새 파일)

- `tests/test_m5_breakpoints.py`처럼 모듈 docstring에 계약을 적고, 같은 방식(`_code()`)으로 주석(`/* */`, `//`)을 뺀 소스를 검사한다.
- 대상: `frontend/src`·`frontend/app`의 `.ts`·`.tsx` 전부.
- [1-1] `(text|fill)-(neutral|gray|zinc|slate|stone)-(500|600|700|800|900|950)` 0건. 변형 접두사(`hover:`, `group-hover:`, `md:` 등)와 `placeholder:text-…`도 같은 패턴으로 잡는다.
- [1-1] `#6b7280` 0건(대소문자 무시).
- 실패 메시지에 위반 위치(파일·클래스)를 담는다.
- 이 계약은 "어두운 회색 글자·채움 금지"다. 밝은 배경 위 어두운 글자나 어두운 SVG 도형 채움이 필요해지면(지금 0건) 계약을 다시 정한다.

### 화면 실측 `frontend/e2e/contrast.spec.ts` (Playwright, 새 파일)

- **실행 환경**: 기존 `frontend/playwright.config.ts` 그대로(Firefox·WebKit, `npm run e2e`). 폭 360/768/1080/1440, 높이 900(기존 spec과 같음). 상태마다 새 페이지에서 시작한다.
- **준비**: 페이지를 열기 전에 `page.emulateMedia({ reducedMotion: "reduce" })`를 호출해 fade-up·pulse 애니메이션이 끝난 상태에서 잰다. 홈 데이터가 그려진 뒤 잰다(기존 spec의 대기 방식을 따름).
- **상태**(폭마다 6개)
  1. 기본 홈
  2. 가이드 모달 열림. 이 상태에서는 `dialog` 안쪽만 잰다(바깥은 inert이고 backdrop에 덮임).
  3. "주목 국가 기준" 펼침
  4. 비상 대비 체크리스트 항목 하나 체크
  5. 국가 쌍 탭 하나 선택
  6. 대피소 위치 조회 결과. 서울시청 좌표 geolocation과 위치 권한 허용(`e2e/shelters.spec.ts`·`e2e/body-sections.spec.ts`의 `test.use({ geolocation, permissions: ["geolocation"] })` 방식)
- **측정 대상**: 보이는 글자 요소 전부. 공백이 아닌 직접 텍스트 노드를 가진 HTML 요소와 SVG `text`·`tspan`.
- **제외**
  - 안 보이는 것: `getBoundingClientRect()`의 폭 또는 높이가 1px 이하(`display: none`, 크기 0, `sr-only`), `visibility: hidden`
  - `aria-hidden="true"` 요소와 그 안쪽
  - `disabled`·`aria-disabled="true"` 컨트롤과 그 안쪽(WCAG 1.4.3 비활성 예외)
  - `option`(브라우저가 따로 그리는 목록)
- **색 계산**
  - 글자 색: HTML은 계산된 `color`, SVG 글자는 계산된 `fill`.
  - 배경: 자기 요소부터 조상으로 올라가며 계산된 `background-color`를 알파 합성하고, 알파가 1인 배경에서 멈춘다(늦어도 `body`의 `#07090d`). `background-image`(그라데이션)는 무시한다. 한계: `body`의 파란 빛은 최대 8%이고 400 기준 6.6:1 이상이라 결론이 바뀌지 않는다(`plan.md` 7절).
  - 글자 색에 알파가 있으면 합성한 배경 위에 겹친 색으로 비교한다.
  - 색 문자열(oklch 등)은 1×1 canvas 2D에 `fillStyle`로 칠하고 `getImageData`로 sRGB 8비트를 읽는다. 라이브러리는 쓰지 않는다.
  - 대비는 WCAG 2.2 상대 휘도 공식으로 계산한다.
- **기준**: 계산된 `font-size`가 24px 이상이거나, 18.66px 이상이면서 `font-weight`가 700 이상이면 3:1, 나머지는 4.5:1. SVG 글자는 viewBox 배율 때문에 실제 크기가 다를 수 있어 크기와 관계없이 4.5:1.
- **단언**: 실패 목록(글자 앞 20자, 글자 색, 합성한 배경색, 비율, 적용 기준)을 메시지에 담고 0건을 단언한다. 테스트 이름에 폭과 상태를 넣는다.
- **위계**: 상태 4에서 체크한 항목 글자의 대비가 체크 안 한 항목 글자의 대비보다 낮다.
- **빈 검사 방지**: 상태마다 잰 글자 요소가 1개 이상이다(요소 수집이 깨져 0건으로 통과하는 것을 막음).
- **측정 코드 자체 확인**(브라우저마다)
  - 대비 함수가 `#a1a1a1`/`#07090d` → 7.71, `#737373`/`#07090d` → 4.20을 ±0.01로 낸다.
  - 임시 요소에 `text-neutral-400`을 붙여 계산된 색을 canvas로 바꾸면 `#a1a1a1`(채널별 ±1)이다.
- **e2e에서 빼는 것**: 지도 hover 툴팁(SVG hover가 불안정). 앱 브라우저 수동 확인(할 일 5).

## 인수 조건

- [ ] `tests/test_m8_contrast.py`가 추가되고 [1-1] 계약(금지 글자·채움 색 패턴 0건, `#6b7280` 0건)이 통과한다.
- [ ] 수정 전 코드에서 위 pytest와 e2e가 실패했고, PR 본문에 실패 건수와 대표 항목이 있다.
- [ ] `frontend/e2e/contrast.spec.ts`가 Firefox·WebKit에서 폭 360/768/1080/1440 × 상태 6개 모두 기준 미달 글자 0건으로 통과한다.
- [ ] 측정 코드 자체 확인(대비 7.71·4.20 재현, canvas 변환 `#a1a1a1`)이 두 브라우저에서 통과한다.
- [ ] 체크리스트 항목 하나를 체크한 상태에서 체크한 항목 글자의 대비가 체크 안 한 항목보다 낮다(e2e).
- [ ] `CatalystPanel.tsx` 범례 안 `<b>` 2개의 클래스가 `text-neutral-300`이고, 범례 바탕 글자는 `text-neutral-400`이다.
- [ ] 지도에서 데이터 없는 나라 이름의 `fill`이 `#9ca3af`, 데이터 있는 나라 이름이 `#e5e7eb`다.
- [ ] 폭 1440px 앱 브라우저에서 지도 나라에 마우스를 올려 뜬 툴팁의 상태 사유·"데이터 없음" 글자 색이 neutral-400이다(수동 확인, 결과를 PR에 적음).
- [ ] "바꿀 곳" 표의 "삭제" 행 요소에 글자 색 클래스가 없고, PR 본문에 지운 위치 목록이 있다.
- [ ] PR 본문에 전·후 대비 표가 있고, 폭 360·1440px 기본 홈 전·후 화면을 사용자에게 보여 줬다.
- [ ] `frontend/package.json`·`package-lock.json`이 바뀌지 않았고, `git diff --stat main` 기준 테스트 쪽 변경은 새 파일 `tests/test_m8_contrast.py`, `frontend/e2e/contrast.spec.ts` 두 개뿐이다(기존 `tests/test_m*.py`, `frontend/e2e/*.spec.ts`, `frontend/src/**/*.test.ts` 수정 없음).
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] `.venv\Scripts\python.exe -m pytest tests` 전부 통과한다.
- [ ] `node --test frontend/src/**/*.test.ts` 전부 통과한다.
- [ ] `frontend`에서 `npm run e2e` 전체(Firefox·WebKit)가 통과한다(다른 세션의 e2e와 동시에 돌리지 않음).
- [ ] 브라우저 폭 360 / 768 / 1080 / 1440px에서 홈 전체와 가이드 모달을 확인했고, 각 폭에서 `document.documentElement.scrollWidth <= window.innerWidth`가 `true`, 콘솔 오류 0건이다.

## 확인 못 한 것 (구현 중 확인)

- 상태 6개로 "바꿀 곳" 표의 글자가 모두 화면에 나오는지 확인하지 않았다. 예: 재외공관 연락처는 대상 국가에 따라, LIVE 배지는 실시간 데이터에 따라, "불러오는 중…"은 로드 중에만 보인다. 테스트 작성 단계에서 상태별 측정 요소 수를 PR에 적고, 한 번도 측정되지 않은 파일이 있으면 상태를 더하거나 수동 확인 결과를 적는다.
- 대상 목록은 neutral 계열 클래스 grep으로 만들었다. 색 글자(red-400 6.3~6.9 등)는 표본 계산으로만 통과를 봤다. e2e가 목록 밖 글자에서 실패하면 테스트나 기준을 고치지 말고 실패 목록을 보고해 범위를 다시 정한다.
- Firefox·WebKit canvas의 `fillStyle`이 계산된 oklch 문자열을 그대로 받는지: 확실하지 않음. "측정 코드 자체 확인"으로 검증한다.

## 영향 파일

- `frontend/src/widgets/catalyst-panel/ui/CatalystPanel.tsx`
- `frontend/src/entities/guide/ui/ActionGuide.tsx`
- `frontend/src/views/home/ui/HomePage.tsx`
- `frontend/src/shared/ui/Panel.tsx`
- `frontend/src/widgets/embassy-contacts/ui/EmbassyContacts.tsx`
- `frontend/src/entities/catalyst/ui/CatalystItem.tsx`
- `frontend/src/widgets/nearby-shelters/ui/NearbyShelters.tsx`
- `frontend/src/features/select-pair/ui/PairTabs.tsx`
- `frontend/src/entities/pair/ui/GradeBadge.tsx`
- `frontend/src/widgets/world-map/ui/WorldMap.tsx`
- `frontend/src/widgets/guide-modal/ui/GuideModal.tsx`
- `frontend/src/widgets/weekly-movers/ui/WeeklyMovers.tsx`
- `frontend/src/widgets/site-footer/ui/SiteFooter.tsx`
- `frontend/src/entities/live/ui/LiveBadge.tsx`
- `frontend/src/entities/news/ui/NewsCard.tsx`
- `frontend/src/entities/risk-index/ui/RiskChart.tsx`
- `frontend/src/widgets/past-cases/ui/PastCases.tsx`
- `tests/test_m8_contrast.py` (신규)
- `frontend/e2e/contrast.spec.ts` (신규)

## 관련 시안

없음(`docs/plan/text-contrast/plan.md` 5절 배경별 대비 표, 6절 화면별 대상)

## 선행 이슈

없음(M7 머지 이후 `main`에서 시작)

## 라벨

`bug`
