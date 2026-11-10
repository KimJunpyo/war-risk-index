# 푸터 개편: 개인 작업물 고지·데이터 출처·만든 사람 링크

## 배경

지금 푸터(`views/home/ui/HomePage.tsx` 하단 `<footer>`)는 데이터 출처를 한 문단으로 나열하고 끝에 "공식: FORMULA_v1.md"를 적는다. 일반 사용자는 이 파일을 볼 수 없고(저장소 비공개), 개인이 만든 서비스라는 고지와 만든 사람 연락 경로가 없다. 일반적인 웹 푸터 형태(소개 / 출처 / 만든 사람 / 하단 저작권 바)로 바꾼다.

## 범위

- 포함: 푸터 위젯 분리, 개인 작업물 고지, 데이터 출처 목록(링크), GitHub·LinkedIn 링크, FORMULA 언급 제거, 푸터 반응형, `llms.txt` 출처 목록 동기화
- 제외: FAQ 내용 변경, JSON-LD `isBasedOn` 변경, 코드 주석·테스트 안의 FORMULA 언급(사용자에게 보이지 않음), 라이선스 파일 추가·표기(Q8 확정: 표기 없음)

## FORMULA 언급 확인 결과 (grep, 2026-11-10, `node_modules`·`.venv`·`.git`·`data`·`out` 제외)

| 위치 | 내용 | 처리 |
|---|---|---|
| `frontend/src/views/home/ui/HomePage.tsx` 푸터 | "공식: FORMULA_v1.md." | 제거(이 이슈) |
| `frontend/public/llms.txt` | 없음 | 처리 없음 |
| `frontend/app/page.tsx` JSON-LD | 없음 | 처리 없음 |
| `frontend/app/layout.tsx` 메타데이터 | 없음 | 처리 없음 |
| `backend/app/main.py` 66행 주석, `index_v1.py` 1행 docstring | 개발자용 참조 | 유지 |
| `tests/test_m3_backend.py`, `tests/test_m4_public_data.py` | 테스트 설명·파일 읽기 | 유지 |
| `docs/plan/service-revamp/*` | 이전 기획 | 유지 |

푸터 둘째 문장 "종합 = 두 뉴스 집계의 7일 점수를 …"도 함께 뺀다. 같은 설명이 FAQ("종합 점수와 실시간 24시간 점수는 무엇이 다른가요?")와 요약 영역 점수 구성 문장에 이미 있다.

## 푸터 구성

1. **소개·고지**
   - 서비스명 "전쟁 가능성 지수"와 한 줄 설명(기존 헤더 설명 요약)
   - 개인 작업물 고지(Q8 확정 문구): "개인이 만든 비영리 실험 프로젝트입니다. 정부·공공기관·언론사와 관련이 없으며, 정부·민방위·외교부의 공식 경보와 안내가 항상 우선합니다."
2. **데이터 출처** (실제 코드에서 쓰는 것만, 이름·용도·링크)

   | 출처 | 화면 용도 | 링크 | 코드 근거 |
   |---|---|---|---|
   | GDELT 1.0 일별 이벤트 파일 | 일별 뉴스 집계·과거 추이 | https://www.gdeltproject.org/ | `gdelt_collect.py`, `country_collect.py` |
   | GDELT 2.0 15분 이벤트 파일 | 15분 뉴스 집계·실시간 24시간 | https://www.gdeltproject.org/ | `live.py` |
   | UCDP GED (웁살라 분쟁 데이터) | 전쟁·내전·무력 충돌 상태(약 1개월 지연) | https://ucdp.uu.se/ | `ucdp.py` |
   | 미 국무부 여행경보 | 여행경보 | https://travel.state.gov/ | `travel_advisory.py` (`US_URL`) |
   | 영국 FCDO 해외여행 안내 | 여행경보(자체 환산) | https://www.gov.uk/foreign-travel-advice | `travel_advisory.py` (`UK_INDEX_URL`) |
   | 외교부 국가·지역별 여행경보(공공데이터포털) | 여행경보 | https://www.data.go.kr/ | `travel_advisory.py` (`MOFA_URL`) |
   | 외교부 재외공관 정보(공공데이터포털) | 현지 긴급 연락처 | https://www.data.go.kr/ | `embassies.py` |
   | 외교부 영사콜센터 | 영사콜센터 번호 | https://www.0404.go.kr/ | `widgets/embassy-contacts/model/embassy.ts` |
   | 행정안전부 민방위 대피시설(공공데이터포털) | 내 주변 대피소 | https://www.data.go.kr/ | `shelters.py` |
   | Google News RSS | 국방 뉴스 | https://news.google.com/ | `backend/app/news.py` |
   | 국민재난안전포털(행정안전부) | 행동 권고 참고 | https://www.safekorea.go.kr/ | `entities/guide/model/checklist.ts` |
   | world-atlas | 세계 지도 경계 | https://github.com/topojson/world-atlas | `widgets/world-map/ui/WorldMap.tsx` |

   - 미 국무부 링크는 API 주소(`cadataapi.state.gov`) 대신 사용자용 사이트로 둔다. 링크 주소는 구현 시 열어 보고 PR에 확인일을 적는다.
   - world-atlas가 Natural Earth 기반이라는 표기는 패키지 README로 확인한 뒤에만 넣는다(확인 전 단정하지 않음).
   - 카카오맵(대피소 "지도에서 보기")은 데이터가 아닌 외부 링크라 넣지 않는다(Q9 확정).
   - 목록은 `widgets/site-footer/model/sources.ts` 같은 상수 배열로 두고 화면은 그 배열을 그린다.
3. **만든 사람**: 표시 이름 "KimJunpyo"
   - GitHub: https://github.com/KimJunpyo
   - LinkedIn: https://www.linkedin.com/in/%EC%A4%80%ED%91%9C-%EA%B9%80-0bab72265/
   - 저장소는 비공개이므로 저장소 링크는 넣지 않는다. URL은 상수로 둔다.
4. **하단 바**: "© 2026 KimJunpyo"(연도는 빌드 시점 연도 또는 상수, PR에 방식 적음), "데이터 저작권은 각 출처에 있습니다."

## 폭별 배치 (plan.md 5-2 "푸터" 행)

| 360 | 768 | 1080 | 1440 |
|---|---|---|---|
| 세로 쌓기: 소개·고지 → 출처(1열) → 만든 사람 → 하단 바 | 2열: 왼쪽 소개·만든 사람 / 오른쪽 출처(1열), 하단 바 전체 폭 | 3열: 소개·고지 / 출처(2열 목록) / 만든 사람, 하단 바 전체 폭 | 1080과 같음 |

- 푸터 위에 구분선(`border-t`)을 두고 페이지 컨테이너(1-1) 폭을 따른다.
- 링크는 모두 새 탭(`target="_blank" rel="noreferrer"`), 밑줄 또는 hover 시 색 변화로 링크임을 구분한다.

## 할 일

1. `widgets/site-footer/`(이름은 제안)를 만들고 `HomePage.tsx`의 `<footer>`를 이 위젯으로 바꾼다.
2. 위 출처 배열·만든 사람 링크 상수·고지 문구를 둔다.
3. `tests/test_m4_frontend.py::test_home_uses_widgets_and_footer_sources`는 `HomePage.tsx`에 "외교부"·"행정안전부"가 있어야 통과한다. 푸터를 위젯으로 옮기면 검사 대상을 푸터 위젯 디렉터리로 바꾼다. PR 본문에 "푸터 위치 이동에 따른 검사 경로 변경"이라고 적는다.
4. 새 소스 grep 테스트: 푸터 위젯에 GitHub·LinkedIn URL과 "KimJunpyo"가 있다, 출처 배열에 위 12개 이름 키워드가 있다, `frontend/src`·`frontend/app`·`frontend/public`에 "FORMULA"가 없다.
5. `frontend/public/llms.txt` "## 출처"를 같은 목록(이름·URL)으로 맞춘다.

## 인수 조건

- [ ] 홈 맨 아래 `<footer>` 안에 개인 작업물 고지 문구(이 이슈 "푸터 구성" 1번 문구)가 있다.
- [ ] 푸터 출처 목록에 위 표의 12개 출처가 각각 링크로 있고, 각 링크를 눌렀을 때 새 탭에서 열리며 HTTP 오류 페이지가 아니다(PR에 확인일 기재).
- [ ] 푸터에 "KimJunpyo" 표시 이름과 GitHub(`https://github.com/KimJunpyo`), LinkedIn(`https://www.linkedin.com/in/%EC%A4%80%ED%91%9C-%EA%B9%80-0bab72265/`) 링크가 있고 둘 다 `target="_blank"`, `rel`에 `noreferrer`가 있다.
- [ ] `frontend/src`, `frontend/app`, `frontend/public` grep에서 "FORMULA" 0건이다.
- [ ] 푸터가 폭 360px에서 1열(소개 → 출처 → 만든 사람 → 하단 바 순서), 768px에서 2열, 1080·1440px에서 3열이고 1080·1440px 출처 목록이 2열이다.
- [ ] 360px에서 푸터 안 링크 각각의 세로 간격이 24px 이상이다(터치로 잘못 누르지 않도록, WCAG 2.5.8 최소 대상 크기 24px 기준).
- [ ] 푸터 링크를 Tab으로 순서대로 이동할 수 있고 포커스 표시가 보인다.
- [ ] 변경·추가된 소스 grep 테스트가 통과한다(`test_home_uses_widgets_and_footer_sources` 경로 변경 포함).
- [ ] `llms.txt` 출처 목록이 푸터 출처 이름과 일치한다.
- [ ] `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건이다.
- [ ] `.venv\Scripts\python.exe -m pytest tests` 전부 통과한다.
- [ ] `node --test frontend/src/**/*.test.ts` 전부 통과한다.
- [ ] 브라우저 폭 360 / 768 / 1080 / 1440px에서 푸터를 확인했고, 각 폭에서 `document.documentElement.scrollWidth <= window.innerWidth`가 `true`, 콘솔 오류 0건이다.

## 영향 파일

- `frontend/src/widgets/site-footer/` (신규: `index.ts`, `ui/SiteFooter.tsx`, `model/sources.ts`)
- `frontend/src/views/home/ui/HomePage.tsx`
- `tests/test_m4_frontend.py` (검사 경로 변경), `tests/test_ui_footer.py` (신규, 이름은 제안)
- `frontend/public/llms.txt`

## 관련 시안

없음(이 이슈 "푸터 구성"·"폭별 배치", `plan.md` 5-2 "푸터" 행)

## 선행 이슈

1-1 (컨테이너·브레이크포인트), 2-2 (같은 `HomePage.tsx` 수정, 먼저 머지)

## 라벨

`enhancement`, `documentation`
