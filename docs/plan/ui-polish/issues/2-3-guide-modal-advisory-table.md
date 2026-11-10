# 가이드 모달 반응형과 여행경보 4단계 표 줄바꿈 수정

## 배경

가이드 모달의 "여행경보 4단계" 표에서 단계 이름이 화면 폭과 관계없이 항상 줄바꿈된다는 사용자 보고가 있다. 같은 모달을 네 폭에 맞추는 작업(`plan.md` 5-2 "가이드 모달" 행)도 이 이슈에서 함께 한다.

## 원인 (코드 정적 분석, 2026-11-10)

`widgets/guide-modal/ui/GuideModal.tsx`와 `entities/guide/model/guide.ts`를 읽고 정리했다. 브라우저에서 재현해 열 폭을 재 보지는 못했다(확실하지 않음). 구현 첫 단계에서 개발자 도구로 확인해 PR에 적는다.

1. **표가 들어갈 자리가 내용보다 좁다.**
   - `dialog` 폭은 `w-[min(760px,calc(100vw-32px))]`, 본문 좌우 padding `px-6`(24px씩) → 표 컨테이너 폭은 최대 712px, 폭 360px 화면에서는 280px.
   - 표는 5열(단계 / 외교부 / 미 국무부 / 영국 FCDO / 의미), 글자 12px(`text-xs`). 각 열의 한 줄 길이(max-content)가 길다. 예: 미 국무부 "각별한 주의 (Exercise Increased Caution)", 의미 "생명 위협이 커 방문하지 말고, 체류 중이면 떠날 것을 권하는 수준"(약 30자). 다섯 열 합이 712px을 넘는 것으로 추정된다.
2. **브라우저 자동 표 배치가 열을 줄인다.** `table`이 `w-full`이고 `table-layout`이 기본 `auto`라, 내용 합이 컨테이너보다 넓으면 각 열을 min-content와 max-content 사이로 줄인다. 이때 짧은 "단계" 열과 단계 이름 열도 같이 줄어든다.
3. **한국어는 음절 사이에서 줄바꿈된다.** 기본 `word-break: normal`에서 한글은 음절마다 줄바꿈이 허용되어 min-content가 한 음절 폭이다. 그래서 "1단계"가 "1단 / 계", "여행유의 (남색경보)"가 중간에서 쪼개진다. `whitespace-nowrap`·`break-keep`이 어느 셀에도 없다.
4. **`overflow-x-auto`가 작동하지 않는다.** 표가 컨테이너 안으로 먼저 줄어들기 때문에 가로 스크롤이 생길 일이 없다.
5. 1~3이 최대 폭(760px)에서도 성립하므로 "항상" 줄바꿈된다.

## 범위

- 포함: 여행경보 단계 표의 구조·데이터 형태, 가이드 모달의 폭·높이·padding(네 폭), 모달 안 다른 섹션(점수 의미, 행동 권고, 지도 상태)이 360px에서 넘치지 않는지 확인
- 제외: 단계 설명 문구 내용 변경, 모달 열기·닫기 동작 변경(Esc, 바깥 클릭, 포커스 가둠은 유지), 전역 `word-break` 변경(plan.md Q11 확정: 이 표에만 적용)

## 할 일

1. 원인 확인: 개발자 도구에서 폭 1440px·360px의 각 열 폭을 측정해 PR에 적는다.
2. `ADVISORY_LEVELS` 데이터에서 단계 이름 주 문구와 보조 문구를 나눈다. 예: 외교부 `여행유의` + `남색경보`, 미 국무부 `일반적 주의` + `Exercise Normal Precautions`, 영국 FCDO는 주 문구만. `tests/test_m4_frontend.py::test_guide_has_mofa_levels`(외교부 단계 이름 4개 존재)는 계속 통과해야 한다. 백엔드 `travel_advisory.py`와 일치 주석은 유지한다.
3. 폭 768px 이상(`md`): 표 유지. "단계" 열과 각 이름 주 문구에 `whitespace-nowrap`, 보조 문구는 같은 셀 둘째 줄 작은 글씨(줄바꿈 허용, 한국어는 `break-keep`). "의미" 열이 남는 폭을 쓰게 한다. 필요하면 `xl`에서 모달 폭 880px.
4. 폭 768px 미만: 표 대신 단계별 카드(`1단계` 제목 + 외교부 / 미 국무부 / 영국 FCDO 이름 목록 + 의미). 같은 데이터에서 그린다.
5. 모달 크기: 360은 화면 전체(폭 100vw, 높이 100dvh, 모서리 0), `md` 폭 `min(720px, 100vw - 48px)`·최대 높이 85vh, `lg` 760px, `xl` 880px. 360에서 본문 좌우 padding 16px. 값은 상수·Tailwind 클래스로.
6. 모달 안 스크롤은 1-2의 공용 오버레이 스크롤바를 쓴다(1-2에서 적용됨, 반응형 변경 후에도 동작 확인). 닫기 버튼이 있는 상단 줄은 스크롤해도 보이게 유지(현행 `sticky`).

## 인수 조건

- [ ] PR 본문에 수정 전 폭 1440px·360px에서 측정한 여행경보 표 각 열 폭(px)과 원인 확인 결과가 있다.
- [ ] 폭 768 / 1080 / 1440px에서 표의 각 "N단계" 셀 텍스트 요소의 `getClientRects().length`가 1이다(한 줄).
- [ ] 같은 폭에서 외교부·미 국무부·영국 FCDO 각 셀의 이름 주 문구 요소의 `getClientRects().length`가 1이다.
- [ ] 폭 360px에서 여행경보가 단계별 카드 4개로 보이고, 각 카드의 "N단계" 제목과 기관별 이름 주 문구 요소의 `getClientRects().length`가 1이다.
- [ ] 네 폭 모두 여행경보 영역 요소의 `scrollWidth <= clientWidth`다(가로 넘침 없음).
- [ ] 폭 360px에서 모달의 `getBoundingClientRect()`가 `left = 0`, `width = window.innerWidth`, `height = window.innerHeight`(±1px)다.
- [ ] 폭 768px에서 모달 폭 720px, 1080px에서 760px, 1440px에서 880px이다(±1px).
- [ ] 네 폭에서 모달을 끝까지 스크롤해도 닫기 버튼이 보이고, Esc·닫기 버튼·바깥 클릭(768px 이상)으로 닫힌다. 모달이 열린 동안 Tab 포커스가 모달 밖으로 나가지 않는다.
- [ ] `tests/test_m4_frontend.py::test_guide_has_mofa_levels`가 수정 없이 통과한다.
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] `.venv\Scripts\python.exe -m pytest tests` 전부 통과한다.
- [ ] `node --test frontend/src/**/*.test.ts` 전부 통과한다.
- [ ] 브라우저 폭 360 / 768 / 1080 / 1440px에서 모달 전체를 확인했고, 각 폭에서 `document.documentElement.scrollWidth <= window.innerWidth`가 `true`, 콘솔 오류 0건이다.

## 영향 파일

- `frontend/src/widgets/guide-modal/ui/GuideModal.tsx`
- `frontend/src/entities/guide/model/guide.ts` (`ADVISORY_LEVELS`)

## 관련 시안

없음(`plan.md` 5-2 "가이드 모달" 행)

## 선행 이슈

1-1 (브레이크포인트), 1-2 (모달 오버레이 스크롤바)

## 라벨

`bug`
