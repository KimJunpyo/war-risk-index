# 나라 상세 페이지 서버 렌더(요약·여행경보·공관)

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **목적:** 나라마다 한 주소에서 점수, 여행경보, 공관을 보여 준다. 검색에 노출되고 공유되게 하려는 것이다.
- **서버 HTML에 넣는 이유:** 검색 엔진이 자바스크립트 없이 읽을 수 있어야 한다. 그래서 하루 한 번 바뀌는 값은 서버 HTML에 넣는다.
  - Q9 결정: 정적으로 생성하고 6시간마다 다시 생성한다.
- **서버 데이터:**
  - 서버는 Worker에서 `countries.json`과 공관 묶음(2-1)을 받는다.
  - 서버리스에서는 캐시 함수가 재생성할 때마다 다시 실행된다. 그래서 재생성 1회에 Worker 요청이 2건 생긴다(plan.md 8절).
- **CORS:** 서버에서 Worker를 부르는 요청은 CORS 영향이 없다.
- **ISR 쓰기:** 내용이 같으면 Vercel ISR 쓰기가 생기지 않는다. 그래서 서버 출력에 현재 시각에 따라 바뀌는 값을 넣지 않는다.

## 범위

- **포함:**
  - `frontend/app/countries/[code]/page.tsx`와 `frontend/src/views/country/`
  - `generateStaticParams`: `low_mentions === false`인 나라만. null도 제외한다.
  - 대상 밖 코드, 없는 코드, 소문자 코드는 `notFound()`(Q8)
  - 캐시 함수: `'use cache'`와 사용자 정의 `cacheLife`(stale 5분, revalidate 6시간, expire 2일, Q9)
  - 서버 렌더 영역(아래)
  - `generateMetadata`: title, description, canonical, openGraph url
  - 재생성 시간 측정
- **제외:**
  - 추이·뉴스·실시간(3-3)
  - sitemap·OG 이미지(3-4)
  - 국가 쌍 페이지, `/countries` 목록 페이지

## 서버 렌더 영역 (plan.md 7-2)

- **머리말:**
  - "← 전체 지도"
  - h1 "{한국어 이름} 전쟁 가능성 지수"
  - 상태 배지(없으면 등급 배지), 기준일
- **요약:**
  - 종합 7일 점수
  - 1주 전 대비(`week_ago`가 있을 때만)
  - 상태 근거와 교전 상대(있을 때만)
  - 설명 "100점 = 평시 대비 +2σ, 개전 예측 아님"
- **여행경보:** 외교부를 맨 앞에 둔다. 기관·단계·이름·발표일·링크를 보인다. 경보가 없으면 영역을 숨긴다.
- **재외공관:**
  - 묶음 응답에서 그 나라(iso2)의 공관과 영사콜센터를 보인다.
  - 공관이 0곳이면 영사콜센터만 보인다.
  - `KOR`은 이 영역이 없다.
- **출처 줄:** GDELT·UCDP(점수·상태), 여행경보 기관, 외교부 재외공관 정보(수집일)
- **색:** 1-1 토큰만 쓴다.

## 인수 조건

- [ ] `npm run build` 경로 표에 `/countries/[code]`가 있다. 사전 렌더 경로 수는 빌드 때 `low_mentions === false`인 나라 수와 같다. 이 이슈 전후의 빌드 시간이 PR 본문에 있다. [명령]
- [ ] `curl.exe -s http://localhost:3000/countries/UKR`로 받은 본문(자바스크립트 실행 전 HTML)에 다음이 있다. [명령]
  - "우크라이나"
  - 기준일(`YYYY-MM-DD`)
  - 종합 점수 숫자
  - 여행경보 기관 이름 1개 이상
- [ ] 다음 주소가 404다. [명령]
  - `/countries/BEN`(`low_mentions`)
  - `/countries/XXX`(없는 코드)
  - `/countries/ukr`(소문자)
- [ ] `<title>`이 "우크라이나 전쟁 가능성 지수"를 포함하고, canonical이 `<SITE_URL>/countries/UKR`이다. [명령]
- [ ] 데이터가 없는 영역은 보이지 않는다. [테스트]
  - 여행경보가 없는 나라(로컬 데이터의 VAT)에는 여행경보 영역이 없다.
  - 공관이 0곳인 나라에는 영사콜센터만 있다.
  - `KOR`에는 공관 영역이 없다.
- [ ] 서버 컴포넌트와 캐시 함수 파일에 `Date.now`, 인자 없는 `new Date()`, `useNow`가 0건이다. [테스트]
- [ ] API에 닿지 않는 주소로 빌드하면 빌드가 실패한다(빈 페이지를 배포하지 않는다). [명령]
- [ ] `npm run start`에서 한 나라 페이지를 다시 생성하며 다음을 잰다. [명령]
  - Worker로 가는 서버 요청이 2건(countries, embassies)이다.
  - 재생성 1회의 서버 처리 시간(ms, 5회 중앙값)과 페이지 출력 크기(KB)가 PR 본문에 있다.
  - 이 값으로 계산한 월 최악 Active CPU(나라 수 × 하루 4회 × 30일 × 처리 시간)가 1시간 이하다. 이는 Hobby 4시간의 25%다. 넘으면 재생성 주기를 12시간으로 늘린다.
- [ ] `e2e/contrast.spec.ts`에 `/countries/UKR` 기본 상태를 넣었고, 4폭에서 통과한다. [테스트]
- [ ] 2-3이 머지돼 있으면, 서비스 워커가 `/countries/…` 응답을 Cache Storage에 넣지 않는다. [수동]
- [ ] 4폭에서 가로 스크롤이 0이고 콘솔 오류(하이드레이션 포함)가 0건이다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- `frontend/app/countries/[code]/page.tsx`(신규)
- `frontend/src/views/country/`(신규)
- 서버 데이터 함수(위치 제안: `frontend/src/entities/country/api/`)
- `frontend/e2e/country-page.spec.ts`(신규, 이름 제안), `frontend/e2e/contrast.spec.ts`

## 관련 시안

없음(plan.md 7-2, 7-4)

## 선행 이슈

- 1-1: 토큰
- 2-1: 공관 묶음 응답
- 3-1: `low_mentions`

## 라벨

`enhancement`
