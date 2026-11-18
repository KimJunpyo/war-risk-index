# 라이트 테마 값·시스템 설정 따르기·두 테마 명도 대비 검사

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **할 일:** 모든 토큰에 라이트 값을 넣고, 시스템 설정(`prefers-color-scheme`)을 따르게 한다.
- **머지하면 바로 공개된다:**
  - 머지하는 순간 시스템이 라이트인 사용자에게 라이트 화면이 나간다.
  - 그래서 두 테마의 명도 대비 검사를 이 이슈에서 함께 통과시킨다.
- **값을 고르는 방법(Q12):**
  - `docs/design/`가 없다.
  - Tailwind 기본 팔레트에서 대비 기준을 만족하는 값을 고르고, 스크린숏으로 사용자가 확인한다.

## 범위

- **포함:**
  - 모든 토큰의 라이트 값
  - `@media (prefers-color-scheme: light)`로 라이트 적용. 단, `data-theme="dark"`면 다크
  - `[data-theme="light"]`면 라이트로 강제
  - 테마별 `color-scheme`
  - `body` 배경 그라데이션과 스크롤바 thumb의 라이트 값
  - `viewport.themeColor` 두 값(light·dark media)
  - `e2e/contrast.spec.ts` 두 테마 실행
- **제외:**
  - 수동 전환 UI와 저장(4-5)
  - 아이콘·OG·manifest 색
- **크기 주의:** 대비를 맞추는 데 하루를 넘기면, 지도·차트 값만 떼어 이슈를 나눈다.

## 인수 조건

- [ ] Playwright `colorScheme: 'light'`에서 홈 `body` 배경이 라이트 페이지 색이고, `getComputedStyle(document.documentElement).colorScheme`이 `light`다. `'dark'`에서는 지금과 같다. [테스트]
- [ ] `e2e/contrast.spec.ts`가 두 테마(light·dark) × 4폭에서 통과한다. [테스트]
  - 대상: 기존 상태와 `/emergency`·`/countries/UKR` 상태
  - 기준: 글자 4.5:1, 큰 글자 3:1, 밑줄 3:1
- [ ] 라이트에서 다음 색이 배경과 3:1 이상이다(WCAG 1.4.11, e2e 계산). [테스트]
  - 지도 상태 색 5개
  - 등급 색
  - 차트 선 색
- [ ] HTML에 `<meta name="theme-color">`가 두 개 있다: `media="(prefers-color-scheme: light)"`와 `media="(prefers-color-scheme: dark)"`. [명령]
- [ ] `forced-colors: active`에서 스크롤바 thumb가 시스템 색이다(기존 처리 유지). [수동]
- [ ] PR 본문에 두 테마의 스크린숏이 있고, 사용자가 확인했다(Q12). [수동]
  - 화면: 홈, 가이드 모달, `/emergency`, `/countries/UKR`
  - 폭: 360px, 1440px
- [ ] 빌드 경로 표에서 `/`와 `/emergency`가 동적(ƒ)으로 바뀌지 않았다. [명령]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- `frontend/app/globals.css`
- `frontend/app/layout.tsx`(`viewport`)
- `frontend/e2e/contrast.spec.ts`(테마 매개변수, 그래픽 대비 검사)
- `frontend/e2e/theme-tokens.spec.ts`(라이트 쪽 탐침)

## 관련 시안

없음(Q12: 스크린숏 확인으로 대신)

## 선행 이슈

- 4-1, 4-2, 4-3: 모든 색이 토큰이어야 라이트 값이 전체에 적용된다.

## 라벨

`enhancement`
