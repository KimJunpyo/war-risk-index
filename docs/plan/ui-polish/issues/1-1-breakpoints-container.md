# 커스텀 브레이크포인트(768·1080·1440)와 페이지 컨테이너 정의

## 배경

지금은 Tailwind 기본 브레이크포인트 `sm`(640px)·`lg`(1024px)만 일부 컴포넌트에서 쓰고, 기준 폭 360/768/1080/1440과 맞지 않는다. 이후 화면별 이슈(2-1~3-3)가 같은 기준을 쓰도록 브레이크포인트와 페이지 컨테이너를 먼저 정한다.

## 범위

- 포함: `globals.css` `@theme` 브레이크포인트 재정의, 기존 `sm:`·`lg:` 사용처의 기계적 이전, `HomePage.tsx`의 `main` 컨테이너 여백·최대 폭
- 제외: 영역별 배치 변경(2-1, 2-2), 가이드 모달(2-3), 대피소 내부(3-2), 푸터(3-3)

## 할 일

1. `frontend/app/globals.css`의 `@theme`에서 기본 브레이크포인트를 지우고(`--breakpoint-*: initial;`) 아래만 정의한다. 이름은 plan.md Q1 확정안(`md`/`lg`/`xl` 재정의).
   - `--breakpoint-md: 48rem;` (768px)
   - `--breakpoint-lg: 67.5rem;` (1080px)
   - `--breakpoint-xl: 90rem;` (1440px)
2. 기존 `sm:` 접두사를 `md:`로 바꾼다. 대상(2026-11-10 grep): `features/select-pair/ui/PairTabs.tsx`, `entities/guide/ui/ActionGuide.tsx`, `widgets/weekly-movers/ui/WeeklyMovers.tsx`, `views/home/ui/HomePage.tsx`(`sm:px-6`). 기존 `lg:`는 그대로 둔다(값만 1080으로 바뀜).
3. `HomePage.tsx` `main`을 plan.md 5-2 "페이지 컨테이너" 행대로 바꾼다: 기본 좌우 16px·위아래 24px, `md` 좌우 24px·위아래 32px, `lg` 이상 좌우 32px, 콘텐츠 최대 폭 1280px(`max-w-6xl` 대체) 가운데 정렬. 최대 폭 값은 Tailwind 클래스 또는 `@theme` 변수로 둔다(매직 넘버를 컴포넌트에 흩지 않음).
4. 브레이크포인트 정의 존재와 `sm:`·`2xl:` 미사용을 확인하는 소스 grep 테스트를 `tests/`에 추가한다(기존 `tests/test_m*_frontend.py` 형식).

## 인수 조건

- [ ] `frontend/app/globals.css`에 `--breakpoint-md: 48rem`, `--breakpoint-lg: 67.5rem`, `--breakpoint-xl: 90rem`이 있고 다른 `--breakpoint-` 정의가 없다(기본값 초기화 구문 제외).
- [ ] `frontend/src`, `frontend/app`의 `.ts`·`.tsx`에서 `sm:`·`2xl:` 접두사 grep 결과 0건이다.
- [ ] 폭 360px에서 `main`의 계산된 좌우 padding이 각각 16px이다.
- [ ] 폭 768px에서 `main`의 좌우 padding이 각각 24px이다.
- [ ] 폭 1080px에서 `main`의 좌우 padding이 각각 32px이다.
- [ ] 폭 1440px에서 `main` 콘텐츠 영역(padding 안쪽) 폭이 1280px이고, 왼쪽 여백과 오른쪽 여백 차이가 1px 이하다.
- [ ] 폭 767px에서 국가 쌍 탭이 1열, 768px에서 2열이다(브레이크포인트 경계 확인. 열 수 최종값은 2-1에서 바뀜).
- [ ] 폭 1079px에서 지도 옆 주목 국가 목록이 지도 아래에, 1080px에서 지도 오른쪽에 있다.
- [ ] 위 grep 테스트가 `tests/`에 추가돼 통과한다.
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] `.venv\Scripts\python.exe -m pytest tests` 전부 통과한다.
- [ ] `node --test frontend/src/**/*.test.ts` 전부 통과한다.
- [ ] 브라우저 폭 360 / 768 / 1080 / 1440px에서 홈 전체를 확인했고, 각 폭에서 `document.documentElement.scrollWidth <= window.innerWidth`가 `true`, 콘솔 오류 0건이다.

## 영향 파일

- `frontend/app/globals.css`
- `frontend/src/views/home/ui/HomePage.tsx`
- `frontend/src/features/select-pair/ui/PairTabs.tsx`
- `frontend/src/entities/guide/ui/ActionGuide.tsx`
- `frontend/src/widgets/weekly-movers/ui/WeeklyMovers.tsx`
- `tests/test_ui_breakpoints.py` (신규, 이름은 제안)

## 관련 시안

없음(`docs/plan/ui-polish/plan.md` 5-1, 5-2 "페이지 컨테이너" 행)

## 선행 이슈

없음

## 라벨

`enhancement`
