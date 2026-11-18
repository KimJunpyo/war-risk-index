# 색 토큰 전환 2: 지도·차트·등급·상태 색

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **대상:** 데이터를 그리는 색이다. Tailwind 클래스와 TS hex가 섞여 있고, hex는 SVG `fill`·`stroke`와 인라인 `style`에 쓰인다.
  - 지도: `widgets/world-map/ui/WorldMap.tsx`
  - 추이 차트: `entities/risk-index/ui/RiskChart.tsx`
  - 등급 색: `shared/lib/grade.ts`의 `GRADE_STYLE`
  - 상태 색: `entities/country/model/types.ts`의 `STATUS_STYLE`
  - 촉매: `entities/catalyst/ui/CatalystBars.tsx`, `CatalystItem.tsx`
  - 점수 구간 색: `entities/guide/model/guide.ts`의 `tone`
- **CSS 변수로 옮기는 이유:**
  - 라이트에서는 같은 색이 밝은 배경과 대비가 부족할 수 있다(예: 옅은 노랑 선).
  - 그래서 테마별로 다른 값을 둘 수 있게 CSS 변수로 옮긴다.
- **이번 값:** 다크 값만 넣는다. 화면은 바뀌지 않는다.

## 범위

- **포함:**
  - 위 파일의 색을 데이터 시각화 토큰으로 옮긴다(이름 예: `--grade-*`, `--status-*`, `--map-*`, `--chart-*`).
  - TS에는 토큰 참조(`var(--…)`나 토큰 클래스)만 남긴다.
  - 가이드 모달 "지도 상태" 범례 점이 같은 토큰을 쓰게 한다.
- **제외:**
  - 라이트 값(4-4)
  - 아이콘·OG·manifest 색

## 인수 조건

- [ ] `frontend/src`의 .ts/.tsx에서 hex 색(`#` 뒤 16진수 3~8자리)과 `rgb(`·`rgba(`가 0건이다. [테스트]
- [ ] 위 파일에서 팔레트 색 클래스가 0건이다(4-1과 같은 패턴). [테스트]
- [ ] 다음 요소의 계산된 색(`fill`, `stroke`, `color`, `background-color`)이 바꾸기 전과 같다. [테스트]
  - 지도 나라 채움 1개
  - 등급 배지 4종
  - 상태 점 5종
  - 차트 선
  - 기대값은 지금 hex·팔레트 값이다.
- [ ] 가이드 모달 "지도 상태" 범례 점의 계산된 색이 같은 상태의 지도 채움 색과 같다. [테스트]
- [ ] 기존 e2e 전체(contrast 포함)가 Firefox·WebKit에서 통과한다. [테스트]
- [ ] 폭 360·1440px 홈(지도·차트·가이드 모달)의 바꾸기 전·후 스크린숏이 PR 본문에 있다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- 배경의 파일들
- `frontend/src/widgets/guide-modal/ui/GuideModal.tsx`(범례 점만)
- `frontend/app/globals.css`(토큰)
- `frontend/e2e/theme-tokens.spec.ts`
- 등급·상태 값을 검사하는 기존 테스트가 있으면 확인한다. 바꾸면 명세 변경 이유를 PR에 적는다.

## 관련 시안

없음

## 선행 이슈

- 1-1: 토큰
- 4-1과 병렬 가능. `GuideModal.tsx`는 이 이슈에서 범례 점만 고치고, 나머지는 4-3에서 고친다.

## 라벨

`enhancement`
