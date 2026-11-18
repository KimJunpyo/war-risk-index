# 색 토큰 전환 3: 나머지 위젯과 "팔레트 색 금지" 소스 계약

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **남은 파일:**
  - `widgets/guide-modal/ui/GuideModal.tsx`
  - `widgets/nearby-shelters/ui/NearbyShelters.tsx`
  - `widgets/past-cases/ui/PastCases.tsx`
  - `entities/guide/ui/ActionGuide.tsx`
  - `widgets/catalyst-panel/ui/CatalystPanel.tsx`
  - `widgets/embassy-contacts/ui/EmbassyContacts.tsx`
  - M1~M3에서 만든 화면 중 토큰을 쓰지 않은 곳(있다면)
- **이 이슈가 끝나면:** UI 소스 전체가 토큰만 쓴다.
- **계약 변경:**
  - `tests/test_m8_contrast.py`의 계약을 "어두운 회색 글자 금지"에서 "팔레트 색·hex 금지, 토큰만"으로 바꾼다.
  - 라이트 테마에서는 어두운 글자가 필요하다. 그래서 옛 계약이 맞지 않는다(테스트 docstring에 이미 예고돼 있다).
  - 명세가 바뀐 것이지, 통과시키려고 고치는 것이 아니다. 이유를 PR에 적는다.

## 범위

- **포함:**
  - 위 파일 전환
  - 소스 계약 변경
  - 새 화면을 포함한 계산값 비교
- **제외:** 라이트 값(4-4), 전환 UI(4-5)
- **계약에서 빼는 것:**
  - 아이콘·OG·manifest 파일(`app/icon.svg`, `app/apple-icon.tsx`, `app/opengraph-image.tsx`, `app/countries/[code]/opengraph-image.tsx`, `app/manifest.ts`)은 다크 브랜드 색을 그대로 둔다.
  - `app/layout.tsx`의 `viewport.themeColor` 값도 뺀다. 브라우저 UI 색 메타 태그라 CSS 변수를 쓸 수 없고, 4-4에서 라이트·다크 hex 두 개가 들어간다.

## 인수 조건

- [ ] `frontend/src`·`frontend/app`의 .ts/.tsx(범위의 "계약에서 빼는 것" 제외)에서 팔레트 색 클래스와 hex가 0건이다. 이 검사가 `tests/test_m8_contrast.py`(또는 그 뒤를 잇는 새 파일)에 있다. [테스트]
- [ ] 바뀐 계약의 이유가 테스트 docstring과 PR 본문에 있다. 이유: "라이트 테마에서 어두운 글자가 필요하다. 색은 토큰으로만 쓴다." [수동]
- [ ] 보조 글자·밑줄 대비 계약을 토큰 단위로 지킨다: 탐침 e2e에서 `text-fg-muted`는 다크 페이지 배경과 4.5:1 이상, 밑줄 토큰은 3:1 이상이다. [테스트]
- [ ] 다음 상태의 계산된 색이 바꾸기 전과 같다(탐침 또는 요소 계산값 비교). [테스트]
  - 가이드 모달을 연 상태
  - 대피소 결과 상태
  - 공관 상태
  - `/emergency`, `/countries/UKR`
- [ ] 기존 e2e 전체(contrast 포함)가 Firefox·WebKit에서 통과한다. [테스트]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- 배경의 파일들
- `tests/test_m8_contrast.py`(계약 변경)
- `frontend/e2e/theme-tokens.spec.ts`

## 관련 시안

없음

## 선행 이슈

- 1-1: 토큰
- M1~M3의 화면 이슈(1-4, 1-5, 2-2, 2-4, 3-2, 3-3): 새 화면까지 한 번에 계약을 적용한다.

## 라벨

`enhancement`
