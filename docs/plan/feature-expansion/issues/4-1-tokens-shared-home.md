# 색 토큰 전환 1: 공용 UI·홈 골격

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **M4 첫 단계:** 1-1에서 정의한 토큰으로 기존 컴포넌트를 바꾼다.
- **화면:** 이 이슈는 다크 화면을 바꾸지 않는다. 라이트 값은 4-4에서 넣는다.
- **나누는 기준:** 전환 대상 23개 파일(약 265곳)을 세 이슈로 나눈다. 이 이슈는 홈의 뼈대와 여러 화면이 함께 쓰는 작은 컴포넌트를 맡는다.

## 범위

- **포함:**
  - `frontend/src/views/home/ui/HomePage.tsx`
  - `frontend/src/entities/live/ui/LiveBadge.tsx`
  - `frontend/src/features/select-pair/ui/PairTabs.tsx`
  - `frontend/src/widgets/weekly-movers/ui/WeeklyMovers.tsx`
  - `frontend/src/widgets/site-footer/ui/SiteFooter.tsx`
  - `frontend/src/entities/news/ui/NewsCard.tsx`
  - `frontend/src/entities/country/ui/Opponents.tsx`
  - `frontend/src/entities/pair/ui/GradeBadge.tsx`(배지 틀. 등급 색 값은 4-2)
  - `frontend/app/globals.css`의 `body` 배경·글자, 스크롤바 thumb 변수
- **토큰 추가:** 필요한 토큰이 1-1 대응표에 없으면 같은 규칙으로 더한다. 값 하나에 토큰 하나를 두고, 다크 값은 지금 값과 같게 한다.
- **제외:** 지도·차트·등급·상태 색(4-2), 나머지 위젯(4-3)

## 인수 조건

- [ ] 위 파일에서 팔레트 색 클래스(`(text|bg|border|ring|divide|decoration|fill|stroke|accent|placeholder)-(white|black|neutral|gray|zinc|slate|stone|red|rose|amber|emerald|fuchsia|sky|blue|orange|violet)`)가 0건이다. [테스트]
- [ ] 이번에 더한 토큰이 탐침 e2e(1-1)에 들어 있고, 원래 색과 계산값이 같다. [테스트]
- [ ] PR 본문에 바꾼 클래스와 토큰의 목록이 있고, 대응표와 일치한다. [수동]
- [ ] 기존 e2e 전체(contrast 포함)가 Firefox·WebKit에서 통과한다. [테스트]
- [ ] 폭 360·1440px 홈의 바꾸기 전·후 스크린숏이 PR 본문에 있다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- 범위의 파일들
- `frontend/e2e/theme-tokens.spec.ts`(토큰을 더했을 때)

## 관련 시안

없음(1-1 대응표)

## 선행 이슈

- 1-1: 토큰
- 3-3: 같은 `HomePage.tsx`. 충돌을 막으려고 M3가 끝난 뒤에 한다.

## 라벨

`enhancement`
