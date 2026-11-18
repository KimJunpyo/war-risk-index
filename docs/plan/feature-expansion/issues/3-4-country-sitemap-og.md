# 나라 상세 sitemap·나라별 OG 이미지·llms.txt

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **sitemap:** 검색 엔진이 상세 페이지를 찾도록 sitemap에 넣는다.
- **OG 이미지:**
  - 링크를 공유하면 나라 이름이 든 미리보기 이미지가 나오게 한다.
  - 한글 글꼴을 넣으면 `ImageResponse`의 500KB 번들 제한에 걸릴 수 있다. 그래서 지금처럼 영문으로 만든다.
  - 점수와 상태는 공유 서비스 캐시에 낡은 채 남으므로 넣지 않는다(Q10 결정).
- **llms.txt:** AI 답변 엔진용 안내다. 푸터 개편 때 출처를 맞춘 것처럼 나라 페이지 주소 형식을 적는다.

## 범위

- **포함:**
  - `frontend/app/sitemap.ts`에 대상 나라 주소. `lastModified`는 그 나라 기준일이다.
  - `frontend/app/countries/[code]/opengraph-image.tsx`: 영문 나라 이름(`Intl.DisplayNames("en")`)과 "War Risk Index"
  - `frontend/public/llms.txt`에 나라 페이지 주소 형식 한 줄
- **제외:** 한글 OG(Q10), JSON-LD 추가, `/countries` 목록 페이지

## 인수 조건

- [ ] `$env:NEXT_PUBLIC_SITE_URL='https://example.com'`으로 빌드한 `/sitemap.xml`이 다음과 같다. [명령]
  - `<loc>` 수가 기존 2개, `/emergency` 1개, 대상 나라 수를 더한 값과 같다.
  - 모든 `<loc>`가 `https://example.com`으로 시작하고, `localhost`가 없다.
- [ ] 나라 주소마다 `<lastmod>`가 그 나라 기준일이다. [명령]
- [ ] `/countries/UKR` HTML의 `og:image`와 `twitter:image` 주소가 200이고, `Content-Type`이 `image/png`, 크기가 1200×630이다. [명령]
- [ ] OG 이미지 파일 소스에 점수·상태 필드(`blended`, `weekly`, `live`, `status`)를 읽는 코드가 0건이다. [테스트]
- [ ] `frontend/public/llms.txt`에 `/countries/{코드}` 주소 형식과 담긴 정보(점수, 추이, 여행경보, 공관)를 적은 줄이 있다. [테스트]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과. [명령]

## 영향 파일

- `frontend/app/sitemap.ts`
- `frontend/app/countries/[code]/opengraph-image.tsx`(신규)
- `frontend/public/llms.txt`
- 소스 검사 테스트(pytest, 이름 제안 `tests/test_country_seo.py`)

## 관련 시안

없음(plan.md 7-2)

## 선행 이슈

- 3-2: 상세 페이지와 대상 목록 함수
- 1-4: 같은 `sitemap.ts`. `/emergency`를 먼저 넣는다.

## 라벨

`enhancement`
