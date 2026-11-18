# 나라 상세 브라우저 영역(추이·뉴스·실시간)과 홈 연결

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **브라우저에서 받는 것:**
  - 점수 추이(약 4,770행), 뉴스, 15분 실시간 점수는 자주 바뀌거나 크다.
  - 그래서 서버 HTML에 넣지 않고, 지금 홈처럼 브라우저에서 받는다(Q9).
  - 기존 위젯 `RiskHistory`, `NewsFeed`를 다시 쓴다.
- **링크:** 홈 요약에서 상세로, 상세에서 홈으로 가는 링크를 둔다.

## 범위

- **포함:**
  - `RiskHistory`(`/api/countries/{code}`)
  - `NewsFeed`: 홈과 같은 나라 이름 검색어를 쓴다.
  - 실시간 24시간 점수(있을 때만)
  - 데이터가 없는 영역 숨기기
  - 홈 요약 제목에서 상세로 가는 링크(대상 나라만)
  - 상세에서 홈으로 가는 링크 확인
- **제외:** 상세에 가이드 모달 넣기, 지도, 국가 쌍

## 인수 조건

- [ ] `/countries/UKR`에 "지수 추이" 패널과 차트 SVG가 보인다. 기간 버튼(예: 1년)을 누르면 차트가 바뀐다. [테스트]
- [ ] 뉴스가 1건 이상이면 뉴스 패널이 보인다. 0건이거나 오류면 뉴스 패널이 DOM에 없다. [테스트]
- [ ] 응답에 실시간 24시간 점수가 있으면 숫자가 보이고, `live`가 null이면 그 줄이 없다. [테스트]
- [ ] 상세 페이지를 열 때 브라우저가 Worker로 보내는 요청이 4건 이하다. 건수와 경로를 PR에 적는다. [테스트]
- [ ] 홈 요약 제목 링크: [테스트]
  - 대상 나라(`low_mentions === false`)를 고르면 요약 제목이 `/countries/<코드>` 링크다.
  - 국가 쌍이나 `low_mentions === true`인 나라를 고르면 링크가 아니다.
- [ ] 상세의 "← 전체 지도"를 누르면 `/`로 간다. [테스트]
- [ ] `e2e/contrast.spec.ts`의 `/countries/UKR` 상태가 차트와 뉴스가 그려진 뒤의 글자를 포함하고, 4폭에서 통과한다. [테스트]
- [ ] 4폭에서 가로 스크롤이 0이고 콘솔 오류가 0건이다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- `frontend/src/views/country/`(브라우저 영역)
- `frontend/src/views/home/ui/HomePage.tsx`(요약 제목 링크)
- `frontend/e2e/country-page.spec.ts`, `frontend/e2e/contrast.spec.ts`
- 홈 요약 구조가 바뀌면 `frontend/e2e/body-sections.spec.ts`와 `tests/test_m6_body_sections.py`를 확인한다. 바꾸면 명세 변경 이유를 PR에 적는다.

## 관련 시안

없음(plan.md 7-2, 7-4)

## 선행 이슈

- 3-2: 서버 렌더 페이지

## 라벨

`enhancement`
