# 링크 밑줄 대비 3:1 (WCAG 1.4.11)

## 배경

이 화면의 링크와 글자 버튼("단계 설명", "단계별 가이드")은 밑줄로 누를 수 있는 것임을 알린다. 밑줄은 링크를 알아보는 데 필요한 시각 정보라 WCAG 1.4.11(비텍스트 대비, Non-text Contrast) 3:1을 기준으로 본다. 지금 밑줄 `decoration-neutral-700`은 배경과 1.76~1.92:1이다. 또 1-1로 체크리스트 출처 링크의 바탕 글자가 400이 되면 그 링크의 `hover:text-neutral-400`은 마우스를 올려도 색이 바뀌지 않는다. 밑줄을 `decoration-neutral-500`으로 올리고 hover 색을 정리한다(`plan.md` 5-3, Q3 2026-11-11 확정).

## 범위

- 포함
  - `decoration-neutral-700` 8건/6파일(`LINK` 상수 3개 포함) → `decoration-neutral-500`
  - `ActionGuide.tsx` 체크리스트 출처 링크 `hover:text-neutral-400` → `hover:text-neutral-200`
  - `tests/test_m8_contrast.py`에 [1-2] 계약 추가, `frontend/e2e/contrast.spec.ts`에 밑줄 검사 추가
- 제외(범위 밖)
  - 글자 색(1-1)
  - 밑줄 두께·위치(`underline-offset` 등), 다른 링크의 hover·focus 동작
  - 입력창·select 경계, 포커스 표시 대비(`plan.md` 10절)

## 바꿀 곳 (`plan.md` 5·6절, 줄 번호는 2026-11-11 `main` d2a50ad 기준)

경로는 `frontend/src/` 기준. 밑줄 대비는 밑줄 색과 배경의 대비다.

| 파일 | 줄 | 대상 | 배경 | 지금 → 바꿀 값 | 대비 전 → 후 |
|---|---|---|---|---|---|
| `entities/guide/ui/ActionGuide.tsx` | 40 | "단계별 가이드" 버튼 밑줄 | 카드 white/3% | `decoration-neutral-700` → `decoration-neutral-500` | 1.83 → 4.00 |
| 〃 | 61 | 체크리스트 출처 링크 밑줄 | 카드 | 〃 | 1.83 → 4.00 |
| 〃 | 61 | 같은 링크의 hover 글자 색 | 카드 | `hover:text-neutral-400` → `hover:text-neutral-200` | hover 때 색 변화 없음 → 400에서 200으로 밝아짐(40줄 버튼 hover와 같은 값) |
| `views/home/ui/HomePage.tsx` | 153 | "단계 설명" 버튼 밑줄 | 페이지 `#07090d` | `decoration-neutral-700` → `decoration-neutral-500` | 1.92 → 4.20(맨 위 파란 빛이 가장 셀 때 3.93) |
| 〃 | 244 | 여행경보 기관 링크 밑줄 | 페이지 | 〃 | 1.92 → 4.20 |
| `widgets/embassy-contacts/ui/EmbassyContacts.tsx` | 6 | `LINK` 상수 밑줄 | 카드 | 〃 | 1.83 → 4.00 |
| `widgets/nearby-shelters/ui/NearbyShelters.tsx` | 11 | `LINK` 상수 밑줄(결과 카드 위) | 카드 안 카드 3%+2% | 〃 | 1.76 → 3.85 |
| `widgets/guide-modal/ui/GuideModal.tsx` | 82 | 안내 문단 출처 링크 밑줄 | neutral-950 | 〃 | 1.91 → 4.18 |
| `widgets/site-footer/ui/SiteFooter.tsx` | 12 | `LINK` 상수 밑줄 | 페이지 | 〃 | 1.92 → 4.20 |

- 건수: `decoration-neutral-700` 8건/6파일, `hover:text-neutral-400` 1건.
- `decoration-neutral-600`은 같은 위치에서 2.34~2.57이라 3:1에 못 미친다(후보 아님).
- 위계: 밑줄 500은 글자(400 이상)보다 옅어 밑줄이 글자보다 튀지 않는다.
- 바꾸지 않는 곳: `GuideModal.tsx` 82 출처 링크의 `hover:text-neutral-300`은 1-1 뒤에도 400 → 300으로 바뀌므로 그대로 둔다.

## 할 일

1. **테스트 먼저**: 1-1 커밋 위에서 아래 "테스트"의 [1-2] 계약과 e2e 밑줄 검사를 더하고, 수정 전 코드에서 실패하는 것을 확인한다. 실패 건수를 PR에 적는다.
2. "바꿀 곳" 표대로 밑줄 색 8곳과 hover 색 1곳을 바꾼다. `LINK` 상수 3개는 상수 값만 바꾼다.
3. 앱 브라우저에서 체크리스트 출처 링크와 "단계별 가이드" 버튼에 마우스를 올려 hover 색을 확인한다.
4. PR 본문의 전·후 대비 표(1-1)에 밑줄 행 8개와 hover 행을 더한다.
5. 커밋 하나: `fix: 링크 밑줄 대비 3:1 (#이슈 번호)`.

## 테스트 (계약, 구현 전에 먼저 작성)

### 소스 계약 `tests/test_m8_contrast.py`에 추가 (pytest)

- 1-1과 같은 대상(`frontend/src`·`frontend/app`의 `.ts`·`.tsx`, 주석 제외)과 같은 방식.
- [1-2] `decoration-(neutral|gray|zinc|slate|stone)-(600|700|800|900|950)` 0건.
- hover 색은 대비 계약이 아니라 소스 계약에 넣지 않는다(할 일 3에서 앱 브라우저로 확인).

### 화면 실측 `frontend/e2e/contrast.spec.ts`에 추가 (Playwright)

- 1-1과 같은 폭 4개 × 상태 6개, 같은 준비(`reducedMotion: "reduce"`), 같은 제외 규칙(안 보이는 것, `aria-hidden` 안쪽, 비활성 컨트롤과 그 안쪽, `option`), 가이드 모달 상태는 `dialog` 안쪽만.
- 대상: 계산된 `text-decoration-line`에 `underline`이 있는 보이는 요소. 기본 상태(마우스·포커스 없음)만 잰다.
- 계산: 계산된 `text-decoration-color`를 1-1과 같은 방법(canvas 변환, 배경 알파 합성, `background-image` 무시)으로 배경과 비교한다.
- 기준: 3:1 이상. 실패 목록(글자 앞 20자, 밑줄 색, 합성한 배경색, 비율)을 메시지에 담고 0건을 단언한다.
- 위계: 같은 요소의 밑줄 대비가 글자 대비보다 크지 않다.
- 빈 검사 방지: 기본 홈 상태에서 잰 밑줄 요소가 1개 이상이다(푸터 링크는 항상 보임).

## 인수 조건

- [ ] `tests/test_m8_contrast.py`의 [1-2] 계약(어두운 밑줄 색 패턴 0건)이 통과한다.
- [ ] 1-1 커밋 직후(1-2 수정 전) 코드에서 [1-2] pytest와 e2e 밑줄 검사가 실패했고, PR 본문에 실패 건수가 있다.
- [ ] e2e 밑줄 검사가 Firefox·WebKit에서 폭 360/768/1080/1440 × 상태 6개 모두 3:1 미달 0건으로 통과한다.
- [ ] 기본 홈 상태에서 밑줄 검사가 잰 요소가 1개 이상이다.
- [ ] e2e로 잰 모든 밑줄 요소에서 밑줄 대비가 같은 요소의 글자 대비보다 크지 않다.
- [ ] 앱 브라우저에서 체크리스트 출처 링크에 마우스를 올리면 계산된 글자 색이 바뀌고, 그 값이 같은 카드 "단계별 가이드" 버튼의 hover 글자 색과 같다.
- [ ] 1-1의 e2e 글자 검사와 [1-1] 소스 계약이 계속 통과한다.
- [ ] PR 본문의 전·후 대비 표에 밑줄 행 8개와 hover 행이 있다.
- [ ] `frontend/package.json`·`package-lock.json`이 바뀌지 않았고, 기존 테스트 파일(`tests/test_m*.py` 중 이번에 만든 `test_m8_contrast.py` 제외, `frontend/e2e/*.spec.ts` 중 `contrast.spec.ts` 제외, `frontend/src/**/*.test.ts`)이 수정되지 않았다.
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] `.venv\Scripts\python.exe -m pytest tests` 전부 통과한다.
- [ ] `node --test frontend/src/**/*.test.ts` 전부 통과한다.
- [ ] `frontend`에서 `npm run e2e` 전체(Firefox·WebKit)가 통과한다(다른 세션의 e2e와 동시에 돌리지 않음).
- [ ] 브라우저 폭 360 / 768 / 1080 / 1440px에서 바꾼 밑줄 8곳이 보이는 화면을 확인했고, 각 폭에서 `document.documentElement.scrollWidth <= window.innerWidth`가 `true`, 콘솔 오류 0건이다.

## 확인 못 한 것 (구현 중 확인)

- 상태 6개에서 밑줄 8곳이 모두 화면에 나오는지 확인하지 않았다. 예: 재외공관 링크와 여행경보 기관 링크는 대상 국가에 따라 보인다. 상태별로 잰 밑줄 요소 수를 PR에 적고, 빠진 곳은 앱 브라우저 수동 확인 결과를 적는다.
- hover·focus 상태의 밑줄 색은 재지 않는다(기본 상태만).

## 영향 파일

- `frontend/src/entities/guide/ui/ActionGuide.tsx`
- `frontend/src/views/home/ui/HomePage.tsx`
- `frontend/src/widgets/embassy-contacts/ui/EmbassyContacts.tsx`
- `frontend/src/widgets/nearby-shelters/ui/NearbyShelters.tsx`
- `frontend/src/widgets/guide-modal/ui/GuideModal.tsx`
- `frontend/src/widgets/site-footer/ui/SiteFooter.tsx`
- `tests/test_m8_contrast.py` (1-1에서 만든 파일에 추가)
- `frontend/e2e/contrast.spec.ts` (1-1에서 만든 파일에 추가)

## 관련 시안

없음(`docs/plan/text-contrast/plan.md` 5-2 배경별 대비 표의 500·600·700 열, 5-4 위계)

## 선행 이슈

1-1 (같은 파일 6개 수정, hover 정리는 1-1로 바탕 글자가 400이 된 뒤에 의미가 있음. 같은 브랜치 `feat/m8-text-contrast`에서 1-1 커밋 다음에 커밋)

## 라벨

`bug`
