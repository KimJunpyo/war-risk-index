# 테마 수동 전환(시스템·라이트·다크)·저장·첫 화면 깜빡임 방지

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **수동 전환:** 기본은 시스템 설정이고, 사용자가 손으로 바꿀 수 있어야 한다(Q11 결정: 3단).
- **저장:**
  - 테마는 보는 사람별 편의 설정이라 `localStorage`를 써도 된다.
  - 쿠키로 서버가 읽으면 루트 레이아웃이 요청 시점 렌더로 바뀐다. 그러면 모든 페이지가 정적 사전 렌더에서 빠진다(plan.md 사실 4).
- **깜빡임 방지:**
  - 저장된 테마를 자바스크립트가 늦게 적용하면, 첫 화면이 다른 테마로 잠깐 보인다(깜빡임).
  - Next 16 문서의 방식을 따른다(`preventing-flash-before-hydration.md`):
    - `<head>` 인라인 스크립트가 그리기 전에 `data-theme`을 붙인다.
    - `<html suppressHydrationWarning>`
    - 개발 모드 Strict Mode가 속성을 지우므로 `useLayoutEffect`로 다시 붙인다.

## 범위

- **포함:**
  - 전환 컴포넌트: 기존 `SegmentedControl`을 다시 쓴다. 선택지는 "시스템·라이트·다크"다.
  - 위치: 홈, `/emergency`, `/countries/[code]` 머리말의 오른쪽(Q11)
  - 저장: `localStorage` `war-risk:theme:v1`에 `light` 또는 `dark`. 시스템을 고르면 키를 지운다.
  - 루트 레이아웃 `<head>` 인라인 스크립트
  - 개발 모드 다시 적용
- **제외:**
  - 쿠키 저장
  - 수동 선택에 맞춘 `theme-color` 변경
  - 계정별 저장

## 인수 조건

- [ ] 시스템 다크(`colorScheme: 'dark'`)에서 "라이트"를 고르면 1초 안에 라이트가 되고, 새로 고쳐도 라이트다. `localStorage`의 `war-risk:theme:v1`이 `light`다. [테스트]
- [ ] "시스템"을 고르면 키가 지워지고, 에뮬레이션을 light와 dark로 바꾸면 화면이 따라 바뀐다. [테스트]
- [ ] `light`를 저장한 상태에서 `/_next/static/` JS 응답을 2초 늦춘 채 새로 고쳐도, `DOMContentLoaded` 시점의 `body` 배경이 라이트 색이다(깜빡임 없음). [테스트]
- [ ] 첫 로딩 콘솔에 하이드레이션 경고와 오류가 0건이다. 라이트를 저장한 경우와 다크를 저장한 경우를 각각 본다. [테스트]
- [ ] `localStorage` 접근이 예외를 던지는 환경(테스트에서 흉내)에서도 오류 없이 시스템 테마로 보인다. [테스트]
- [ ] 키보드 조작: [테스트]
  - 전환 컴포넌트에 Tab으로 갈 수 있다.
  - Space나 Enter로 바꿀 수 있다.
  - 현재 선택이 `aria-pressed="true"`(또는 라디오 checked)다.
- [ ] 홈, `/emergency`, `/countries/UKR` 세 머리말에 같은 전환 컴포넌트가 있고, 360px에서 머리말 가로 스크롤이 0이다. [테스트]
- [ ] 빌드 경로 표에서 `/`와 `/emergency`가 동적(ƒ)이 아니다(쿠키·헤더를 읽지 않는다). [명령]
- [ ] 2-3이 머지돼 있으면, 오프라인 `/emergency`에서도 저장된 테마로 보인다. [수동]
- [ ] `e2e/contrast.spec.ts`가 전환 컴포넌트를 포함해 두 테마에서 통과한다. [테스트]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- `frontend/app/layout.tsx`(`<head>` 스크립트, `suppressHydrationWarning`)
- 전환 컴포넌트(위치 제안: `frontend/src/features/switch-theme/`)
- 세 머리말: `HomePage.tsx`, `views/emergency/`, `views/country/`
- `frontend/e2e/theme.spec.ts`(신규, 이름 제안), `frontend/e2e/contrast.spec.ts`
- 헤더 배치가 바뀌면 `frontend/e2e/top-sections.spec.ts`를 확인한다. 바꾸면 명세 변경 이유를 PR에 적는다.

## 관련 시안

없음(plan.md 7-3)

## 선행 이슈

- 4-4: 라이트 값

## 라벨

`enhancement`
