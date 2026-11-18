# 의미 색 토큰 정의(다크 값)와 공용 패널·선택 버튼 전환

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **지금 색 쓰는 방식:**
  - Tailwind 팔레트 클래스(`text-neutral-400`, `bg-white/[0.03]`, `border-white/10` 등)가 컴포넌트에 직접 들어 있다(23개 파일, 약 265곳).
  - 지도·차트·등급·상태 색은 TS 안 hex다(4개 파일).
- **왜 토큰이 필요한가:**
  - 라이트 테마(M4)를 넣으려면 색을 의미별 토큰으로 바꿔야 한다.
  - M1~M3에서 새로 만드는 화면(`/emergency`, `/countries/[code]`)이 처음부터 토큰을 쓰도록, 토큰 정의만 먼저 한다(plan.md 5절, Q13).
- **이 이슈의 범위:**
  - 다크 값만 정한다. 화면은 바뀌지 않는다.
  - 토큰을 실제로 쓰는 첫 곳으로 공용 `Panel`·`SegmentedControl`을 바꾼다. 새 화면도 이 둘을 쓴다.
- **바뀌는 결정:** M8 Q1의 "새 색 토큰은 만들지 않는다"를 이번 기획에서 바꾼다(테마는 사용자가 고른 기능).

## 범위

- **포함:**
  - `frontend/app/globals.css`에 토큰(CSS 변수, 다크 값)과 `@theme inline`의 `--color-*` 매핑
  - 토큰과 지금 클래스의 대응표(globals.css 주석)
  - `shared/ui/Panel.tsx`, `shared/ui/SegmentedControl.tsx` 전환
  - 토큰 값 확인 e2e
- **제외:**
  - 그 밖의 컴포넌트 전환(4-1, 4-3)
  - 지도·차트·등급·상태 색(4-2)
  - 라이트 값(4-4), 전환 UI(4-5)

## 토큰 (제안, 최종 목록은 PR 대응표)

- **규칙:**
  - 지금 쓰는 색 값 하나에 토큰 하나를 둔다.
  - 다크 값은 지금 클래스와 같은 Tailwind 팔레트 변수(`var(--color-neutral-400)` 등)나 같은 값을 가리킨다. 계산값이 같아야 화면이 바뀌지 않는다.

| 토큰 변수 | 유틸리티 예 | 다크 값(지금 클래스) | 용도 |
|---|---|---|---|
| `--color-page` | `bg-page` | `#07090d`(지금 `--background`) | 페이지 배경 |
| `--color-fg-strong` | `text-fg-strong` | `white` | 제목 |
| `--color-fg-bright` | `text-fg-bright` | `neutral-100` | 강조 본문 |
| `--color-fg` | `text-fg` | `neutral-200` | 본문 |
| `--color-fg-soft` | `text-fg-soft` | `neutral-300` | 보조 본문 |
| `--color-fg-muted` | `text-fg-muted` | `neutral-400` | 보조 글자(4.5:1 계약 대상) |
| `--color-link-line` | `decoration-link-line` | `neutral-500` | 링크 밑줄(3:1 계약 대상) |
| `--color-surface` | `bg-surface` | `white/[0.03]` | 카드 면 |
| `--color-surface-inner` | `bg-surface-inner` | `white/[0.02]` | 카드 안 카드 |
| `--color-surface-hover` | `hover:bg-surface-hover` | `white/10` | 누를 수 있는 요소의 hover |
| `--color-field` | `bg-field` | `neutral-900` | 입력 칸·선택 상자 |
| `--color-overlay` | `bg-overlay` | `neutral-950` | 대화상자 |
| `--color-line` | `border-line` | `white/10` | 기본 선 |
| `--color-line-strong` | `border-line-strong` | `white/15` | 버튼 테두리 |
| `--color-line-soft` | `divide-line-soft` | `white/5` | 목록 구분선 |
| `--color-danger`, `--color-warning`, `--color-success`, `--color-info` | `text-danger` 등 | `rose-300`, `amber-300`, `emerald-300`, `sky-300` | 의미 강조 글자 |
| `--color-alert-alert`, `-air-raid`, `-cbr`, `-nuclear`, `-all-clear` | `text-alert-air-raid` 등 | 제안: `amber-300`, `red-300`, `violet-200`, `fuchsia-300`, `emerald-300` | 경보 카드 이름(1-4) |

## 할 일

1. **토큰 정의:**
   - `globals.css`의 `:root`에 토큰 변수(다크 값)를 둔다.
   - `@theme inline`에 `--color-*` 매핑을 둔다.
   - 기존 `--background`·`--foreground`·스크롤바 변수와 `forced-colors` 처리는 그대로 둔다.
2. **대응표:** 토큰과 지금 클래스의 대응표를 `globals.css` 주석으로 둔다. M1~M3의 새 화면은 이 표의 토큰만 쓴다.
3. **첫 사용처 전환:** `Panel.tsx`, `SegmentedControl.tsx`의 팔레트 색 클래스를 토큰으로 바꾼다.
4. **토큰 값 확인 e2e(이름 제안 `e2e/theme-tokens.spec.ts`):**
   - 탐침 요소 두 개에 토큰 클래스와 원래 클래스를 각각 붙인다.
   - `color`, `background-color`, `border-color`, `text-decoration-color` 계산값이 같은지 본다.
   - M4에서 라이트 값이 들어오면 이 검사는 다크 쪽 검사로 남는다.

## 인수 조건

- [ ] 대응표의 토큰이 `globals.css`에 모두 정의돼 있다. 각 토큰 클래스의 다크 계산값이 대응하는 원래 클래스의 계산값과 같다(탐침 e2e, Firefox·WebKit). [테스트]
- [ ] `Panel.tsx`, `SegmentedControl.tsx`에서 다음 패턴의 팔레트 색 클래스가 0건이다: `(text|bg|border|ring|divide|decoration)-(white|black|neutral|gray|zinc|slate|stone|red|rose|amber|emerald|fuchsia|sky|blue|orange|violet)`. [테스트]
- [ ] PR 본문에 바꾼 클래스와 토큰의 목록이 있고, 대응표와 일치한다. [수동]
- [ ] 기존 `e2e/contrast.spec.ts`가 Firefox·WebKit에서 그대로 통과한다. [테스트]
- [ ] `npm run build` 뒤 `.next/static` CSS에 이번에 쓴 토큰 유틸리티(예: `text-fg-muted`)가 있다. [명령]
- [ ] 홈 폭 360·1440px의 바꾸기 전·후 스크린숏이 PR 본문에 있다. [수동]
- [ ] `frontend/package.json`의 의존성이 바뀌지 않았다. [명령]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과. [명령]

## 영향 파일

- `frontend/app/globals.css`
- `frontend/src/shared/ui/Panel.tsx`, `frontend/src/shared/ui/SegmentedControl.tsx`
- `frontend/e2e/theme-tokens.spec.ts`(신규, 이름 제안)

## 관련 시안

없음(plan.md 7-3, 이 이슈의 토큰 표)

## 선행 이슈

없음

## 라벨

`enhancement`
