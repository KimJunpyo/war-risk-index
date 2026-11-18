# `/emergency` 재외공관 연락처 영역(서버 렌더)

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **목적:** 해외에서 통신이 끊겨도 공관 번호를 볼 수 있게 한다.
- **방식(Q5 결정):**
  - 공관 묶음 응답(2-1)을 서버에서 받아 `/emergency` HTML에 넣는다.
  - 그러면 서비스 워커(2-3)는 페이지 하나만 저장하면 된다.
- **재생성:** 공관 정보는 하루 한 번 바뀐다. 그래서 `'use cache'`와 `cacheLife('days')`로 다시 생성한다.
- **원칙:**
  - 불완전한 것은 보여 주지 않는다.
  - 응답을 못 받으면 연락처가 빠진 페이지를 배포하지 않고 빌드를 실패시킨다. 이때 Vercel은 이전 배포를 그대로 둔다.

## 범위

- **포함:**
  - 서버에서 `/api/embassies`를 받는 캐시 함수
  - 영사콜센터 상시 표시(기존 `CALL_CENTER` 상수)
  - 나라별 `<details>`: 한국어 이름 가나다순. 이름은 기존 `countryName`으로 만든다.
  - 전화 `tel:` 링크(기존 `telHref` 재사용)
  - 출처와 수집일, 목차 항목
- **제외:**
  - 나라 검색 입력(브라우저 찾기로 대신한다)
  - 지도
  - 나라별 상세 링크(3-3 이후 제안)

## 인수 조건

- [ ] `npm run build`·`npm run start` 뒤 받은 `/emergency` HTML(자바스크립트 실행 전)에 다음이 있다. [명령]
  - 영사콜센터 번호 `+82-2-3210-0404`
  - 응답의 나라 수만큼의 나라별 `<details>`
- [ ] `/emergency` HTML 크기(gzip 전·후)가 PR 본문에 있다. [명령]
- [ ] 나라 접기가 `Intl.Collator("ko")` 기준 가나다순이다. [테스트]
- [ ] "일본"을 펼치면 공관이 1곳 이상 보이고, 전화가 있는 공관의 전화는 `tel:+81`로 시작하는 링크다. [테스트]
- [ ] 묶음 응답이 `available: false`면 영사콜센터만 보이고 나라 접기는 0개다. [테스트]
- [ ] API에 닿지 않는 주소(`$env:NEXT_PUBLIC_API_BASE_URL='http://127.0.0.1:9'`)로 빌드하면 빌드가 실패하고, 로그에 공관 응답 실패가 나온다. [명령]
- [ ] `/emergency`를 열 때 브라우저의 API 요청은 여전히 0건이다(공관은 서버에서 받는다). [테스트]
- [ ] 영역 끝에 "외교부 재외공관 정보(공공데이터포털)" 출처 링크와 수집일(`as_of`)이 있다. [테스트]
- [ ] `e2e/contrast.spec.ts`에 공관을 펼친 상태를 넣었고, 4폭에서 통과한다. [테스트]
- [ ] 4폭에서 가로 스크롤이 0이고 콘솔 오류가 0건이다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- `frontend/src/views/emergency/`(공관 영역, 목차)
- 서버 데이터 함수(위치 제안: `frontend/src/entities/embassy/api/` 또는 `widgets/embassy-contacts/api/`)
- `frontend/src/widgets/embassy-contacts/model/embassy.ts`(타입·`telHref` 재사용)
- `frontend/e2e/emergency.spec.ts`, `frontend/e2e/contrast.spec.ts`

## 관련 시안

없음(plan.md 7-1, 7-4)

## 선행 이슈

- 1-5: 같은 페이지 파일. 1-5를 먼저 머지한다.
- 2-1: 묶음 응답

## 라벨

`enhancement`
