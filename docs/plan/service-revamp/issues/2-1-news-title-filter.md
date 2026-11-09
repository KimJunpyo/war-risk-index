# 국방 뉴스 제목 필터와 0건 시 패널 숨김

## 배경

국가 뉴스는 `COUNTRY_NEWS_QUERY = "{name} (군사 OR 국방 OR 분쟁 OR 공격 OR 미사일)"`로 Google News(한국어)를 검색한다. 나라 이름이 본문에만 있거나 다른 나라 기사가 섞여, 일반인에게 "이 나라 뉴스"로 보이지 않는 기사가 나온다. 국가 쌍 뉴스(`backend/app/pairs.py`의 `news_query`)도 같은 문제가 있다. 제목에 나라 이름이 있는 기사만 남기고, 남는 것이 없으면 패널을 보여주지 않는다.

## 범위

- 포함: 프론트에서 기사 제목 필터, 0건 시 NewsFeed 미렌더링, 범위 토글(24시간/7일) 처리
- 제외: 백엔드 검색어 변경, 뉴스 출처 추가

## 동작 정의

- 키워드
  - 국가: `countryName(iso2)`(한국어, Intl) + 영어 이름(`Intl.DisplayNames(["en"])`) + 별칭 표
  - 국가 쌍: 쌍 id(`KOR-PRK` 등)의 각 코드를 `/api/countries` 목록에서 찾아 위와 같은 방식으로 만든 키워드 + `Pair.countries`(한국어 이름)
  - 별칭 표(초안, PR에서 확정): `KR: ["한국", "South Korea"]`, `KP: ["북한", "North Korea"]`, `US: ["미국"]`, `PS: ["팔레스타인", "가자", "하마스"]`, `TW: ["대만"]`, `GB: ["영국"]`. 2글자 이하 영문 약어(US, UK 등)는 오탐 때문에 넣지 않는다.
- 매칭: 제목 끝의 ` - 언론사명`(마지막 ` - ` 뒤)을 떼고 남은 부분에 키워드가 하나라도 포함되면 통과. 영문은 대소문자 무시.
- 국가 쌍은 두 나라 중 하나 이상 포함 시 통과(plan.md Q5, 기본안).
- 범위 처리: 24시간·7일 결과를 모두 받아 필터한다.
  - 둘 다 0건 → 패널 미렌더링
  - 24시간만 0건 → 7일을 기본 선택, 토글의 "24시간" 버튼 비활성
  - 조회 실패(HTTP 502 등) → 패널 미렌더링(Q6 기본안)
- 로딩 중에는 기존 `StatusText` 로딩 표시를 유지한다.

## 할 일

1. `frontend/src/shared/lib/`에 제목 매칭 함수(예: `titleMentions(title, keywords)`)와 키워드 생성 함수를 추가하고 `index.ts`에서 내보낸다.
2. `HomePage.tsx`의 `summarize()`에서 대상별 키워드 배열을 만들어 `NewsFeed`에 넘긴다.
3. `widgets/news-feed/ui/NewsFeed.tsx`에서 두 범위를 조회·필터하고 위 범위 처리 규칙을 적용한다. `features/select-news-range`의 토글에 비활성 옵션 지원이 필요하면 추가한다.
4. PR 설명에 샘플 제목 8건 이상(통과 4, 탈락 4, 언론사명에만 나라 이름이 있는 경우 1건 포함)의 입력·결과 표를 붙인다.

## 인수 조건

- [ ] 대한민국, 북한, 우크라이나, 이란, 대만 5개 대상에서 표시된 기사 제목(언론사명 제외)에 해당 대상 키워드가 모두 포함된다(PR에 각 대상 화면 캡처 또는 제목 목록 첨부).
- [ ] 제목이 "OO 국방부 발표 - Korea Herald"처럼 언론사명에만 나라 이름이 있는 기사는 표시되지 않는다.
- [ ] 영문 제목 "North Korea fires missile"은 북한 선택 시 표시된다(대소문자 무시 확인 포함 "north korea ...").
- [ ] 24시간·7일 모두 필터 후 0건인 대상을 선택하면 "국방 뉴스" 패널 제목이 화면에 없다(DOM에 없음).
- [ ] 24시간만 0건인 대상을 선택하면 7일이 선택된 상태로 기사가 표시되고 "24시간" 버튼은 `disabled`다.
- [ ] 백엔드 뉴스 API가 502를 반환하면(백엔드 인터넷 차단 등으로 재현) 패널이 화면에 없고 콘솔에 처리되지 않은 오류가 없다.
- [ ] "해당 기간 뉴스가 없습니다." 문구가 코드에서 제거되었다(grep 0건).
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] 브라우저(`http://localhost:3000`)에서 위 대상을 선택해 확인했고 콘솔 오류 0건이다.

## 영향 파일

- `frontend/src/widgets/news-feed/ui/NewsFeed.tsx`
- `frontend/src/views/home/ui/HomePage.tsx`
- `frontend/src/shared/lib/country.ts` 또는 새 파일, `frontend/src/shared/lib/index.ts`
- (필요 시) `frontend/src/features/select-news-range/ui/*`, `frontend/src/shared/ui/SegmentedControl.tsx`

## 관련 시안

없음

## 선행 이슈

없음 (M1 이후 진행 권장. 그리드 배치가 1-1에서 바뀜)

## 라벨

`enhancement`
