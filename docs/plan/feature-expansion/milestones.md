# 마일스톤

- **기획안:** `docs/plan/feature-expansion/plan.md`
- **이슈 본문:** `docs/plan/feature-expansion/issues/`
- **번호:**
  - 아래 M1~M4는 이 기획 안의 순번이다.
  - GitHub 마일스톤 이름은 메인 세션이 정한다(예: M13~).
  - 지금 GitHub에는 M1~M12가 있고, M12가 열려 있다.
- **이슈 번호:** 이슈 번호(예: 1-1)도 기획 안의 순번이다. GitHub 이슈 번호는 등록한 뒤 각 목록에 적는다.

## 공통 검증 (모든 이슈의 인수 조건에 포함)

- **pytest:**
  - 루트에서 `.venv\Scripts\python.exe -m pytest tests`가 전부 통과한다.
  - 새 파일도 아래 두 테스트에 걸리지 않는다.
    - `test_no_key_like_strings_in_repo`: 영숫자나 `%XX`가 32자 이상 이어지면 실패한다. `docs/`도 검사한다.
    - `test_no_threat_references_in_repo`
- **프론트 검사(프론트를 바꾼 이슈):**
  - `frontend`에서 `npx tsc --noEmit`, `npm run lint` 오류 0건
  - 루트에서 `node --test frontend/src/**/*.test.ts` 통과
- **Worker 검사(`worker/`를 바꾼 이슈):** `worker`에서 `npm test` 통과
- **e2e(화면을 바꾼 이슈):**
  - `frontend`에서 `npm run e2e`(Firefox·WebKit)가 통과한다.
  - 새 화면과 새 상태는 `e2e/contrast.spec.ts`에도 넣는다.
- **프로덕션 빌드(정적 생성·재생성·서비스 워커·sitemap·OG 이미지를 다룬 이슈):**
  - `frontend`에서 `npm run build`가 성공하고, `npm run start`로 확인한다. 이 기능들은 `npm run dev`와 동작이 다르다.
  - 환경변수는 셸에서 넣고 `frontend/.env*` 파일로 남기지 않는다. 예:
    ```powershell
    $env:NEXT_PUBLIC_SITE_URL='https://example.com'; $env:NEXT_PUBLIC_API_BASE_URL='http://localhost:8000'; npm run build
    ```
- **브라우저 확인:** 폭 360/768/1080/1440(높이 800)에서 다음을 본다.
  - `document.documentElement.scrollWidth <= window.innerWidth`가 true
  - 콘솔 오류 0건(하이드레이션 포함)
- **인수 조건 표시:** 각 인수 조건 끝에 확인 방법을 붙인다.
  - `[테스트]`: 자동 테스트(pytest, `node --test`, Playwright, vitest)
  - `[명령]`: 명령을 실행해 결과로 확인한다. PR 본문에 명령과 결과 요약을 적는다.
  - `[수동]`: 문서화된 절차로 사람이 확인한다. PR 본문에 날짜와 결과를 적는다.
- **0원과 의존성:**
  - 유료 API·유료 플랜은 0개다.
  - 새 npm·Python 패키지는 0개가 목표다. 꼭 필요하면 구현 전에 이슈 코멘트로 알리고 이유를 적는다.
- **출처:**
  - 콘텐츠는 자체 문구로 쓴다.
  - 화면에 출처 이름, 링크(새 탭, `rel="noreferrer"`), 확인일을 보인다.
  - PR에 공식 요지와 자체 문구의 대조표를 붙인다.
- **위치 개인정보:**
  - 기존 테스트가 통과한다: 로드 시 위치 팝업 없음, 좌표 소수 2자리, 위치·검색어 브라우저 저장소 미사용.
  - Q4 결정으로 바뀌면 2-6에서 명세를 바꾼다.
- **색:** M1~M3에서 새로 만드는 화면은 1-1의 토큰만 쓴다(팔레트 색 클래스·hex 금지).
- **배포:**
  - `main` 머지는 곧 운영 배포다.
    - Vercel이 자동으로 배포한다.
    - `worker/` 변경은 `worker.yml`이 배포한다.
    - `publish.py`·`batch.py` 변경은 다음 15분 배치부터 반영된다.
  - PR 하나가 혼자 배포돼도 깨진 화면이 나가지 않는다.
- **기존 테스트 변경:** 기존 테스트를 바꿔야 하면 명세가 바뀐 이유를 PR 본문에 적는다. 통과시키려고 고치지 않는다.
- **커밋:**
  - Conventional Commits 형식으로 쓴다.
  - 이슈별 브랜치를 쓴다(예: `feat/<이슈번호>-<slug>`).
  - 커밋 제목 끝에 `(#이슈번호)`를 붙인다.
  - `main`에 직접 커밋하지 않는다.

---

## M1. 민방위 경보 행동요령과 비상 가방

- **만드는 것:**
  - 새 페이지 `/emergency`에 민방공 경보별 행동요령을 둔다.
  - 3일 가방·7일 비축 체크리스트와 물·식량 계산기를 둔다.
- **첫 이슈:** 새 화면이 처음부터 쓸 의미 색 토큰을 정한다(plan.md 5절, Q13).
- **독립 확인:** 이 마일스톤만 끝나도 홈에서 들어가 안내를 읽고, 체크하고, 계산할 수 있다.

**완료 조건**
- **진입과 콘텐츠:**
  - 홈 헤더의 "비상 대비"를 누르면 `/emergency`가 열린다.
  - 경보 5종(Q1)의 언제·알리는 방법·할 일이 보이고, 모든 영역에 출처 링크와 확인일이 있다.
- **계산기:** 4명·7일 비축을 넣으면 "물 84L"와 "84끼"가 보인다.
- **체크:** 가방 목록을 체크하고 새로 고쳐도 체크가 남는다.
- **정적 페이지:**
  - 빌드 경로 표에서 `/emergency`가 동적(ƒ)이 아니다.
  - 열 때 브라우저의 API 요청이 0건이다.
  - `sitemap.xml`과 `llms.txt`에 들어 있다.
- **화면 품질:** 4폭에서 가로 스크롤 0, `e2e/contrast.spec.ts`(AA) 통과
- **토큰:**
  - `globals.css`에 의미 색 토큰이 정의돼 있다.
  - 새 화면 파일에 팔레트 색 클래스가 0건이다.
- 공통 검증을 통과한다.

**이슈**
- 1-1 의미 색 토큰 정의(다크 값)와 공용 패널·선택 버튼 전환 (`issues/1-1-semantic-color-tokens.md`)
- 1-2 민방위 경보 5종 행동요령 콘텐츠와 출처 (`issues/1-2-civil-alert-content.md`)
- 1-3 비상 가방·비축 목록과 물·식량 계산 함수 (`issues/1-3-emergency-kit-model.md`)
- 1-4 `/emergency` 페이지와 경보별 행동요령 화면 (`issues/1-4-emergency-page-alerts.md`)
- 1-5 비상 가방 체크리스트와 물·식량 계산기 화면 (`issues/1-5-kit-checklist-calculator.md`)

---

## M2. 오프라인 비상 정보(PWA)

- **만드는 것:**
  - 직접 만든 서비스 워커가 `/emergency`(행동요령·가방·계산기·전체 재외공관 연락처)를 기기에 저장한다. 인터넷 없이 열 수 있다.
  - 공관 연락처는 새 묶음 응답(`/api/embassies`)을 서버에서 HTML에 넣는다(Q5).
- **Q4:** 대피소 저장은 Q4 결정에 따라 2-6에서만 다룬다.

**완료 조건**
- **오프라인 열기:**
  - Chrome·Edge에서 사이트를 한 번 온라인으로 연 뒤 오프라인으로 `/emergency`를 새로 고친다.
  - 경보 5종, 가방 두 목록, 재외공관 접기 목록이 보이고, 계산기가 동작한다.
  - 다른 주소를 열면 `/emergency`로 간다.
- **저장 상태와 개인정보:**
  - 머리말에 저장 시각과 오프라인 안내가 보인다.
  - Cache Storage에 `/api/`나 `lat=`가 든 항목이 0건이다.
  - 기존 위치 개인정보 테스트가 통과한다.
- **공관 응답:** 운영 Worker `/api/embassies`가 200이고, `/emergency` HTML에 영사콜센터와 나라별 공관 접기가 있다.
- **운영 확인:** 운영 주소에서 오프라인 열기를 한 번 확인했다.
- **오프라인 자동 테스트:** Chromium 오프라인 spec이 통과한다(Q6).
- **지역 대피소 저장:** 지역으로 찾은 결과를 저장하고 지울 수 있다(Q4 B).
- 공통 검증을 통과한다.

**이슈**
- 2-1 재외공관 묶음 응답 `/api/embassies` (`issues/2-1-embassies-bundle-api.md`)
- 2-2 `/emergency` 재외공관 연락처 영역(서버 렌더) (`issues/2-2-emergency-embassy-contacts.md`)
- 2-3 서비스 워커 직접 구현: `/emergency` 사전 저장과 오프라인 응답 (`issues/2-3-service-worker.md`)
- 2-4 오프라인 안내·저장 시각·아이폰 안내·설치 조건 (`issues/2-4-offline-status-install.md`)
- 2-5 오프라인 자동 테스트(Playwright Chromium) (`issues/2-5-offline-e2e-chromium.md`)
- 2-6 지역으로 찾은 대피소를 이 기기에 저장 (`issues/2-6-save-region-shelters.md`)

---

## M3. 국가별 상세 페이지

- **만드는 것:** 대상 나라마다 `/countries/{코드}`를 정적으로 생성하고 6시간마다 다시 생성한다(Q9).
  - 서버 HTML: 이름, 기준일, 종합 점수, 상태, 여행경보, 공관 연락처
  - 브라우저: 점수 추이, 뉴스, 실시간 점수
- **대상:** 데이터가 적은 나라(`low_mentions`)는 만들지 않는다(Q7).
- **검색·공유:** sitemap과 나라별 OG 이미지를 둔다.
- **독립 확인:** 2-1(공관 묶음)만 끝나 있으면 M2의 나머지와 상관없이 확인할 수 있다.

**완료 조건**
- **생성 범위:**
  - 빌드 경로 표에서 `/countries/[code]` 사전 렌더 수가 `low_mentions === false`인 나라 수와 같다(로컬 기준 81).
  - `low_mentions`인 나라, 없는 코드, 소문자 코드는 404다.
- **서버 HTML:** 자바스크립트 실행 전 `/countries/UKR` HTML에 "우크라이나", 기준일, 종합 점수, 여행경보가 있다.
- **브라우저 영역:**
  - 추이 차트가 보인다. 뉴스와 실시간 점수는 데이터가 있을 때만 보인다.
  - 홈 요약 제목에서 상세로, 상세에서 홈으로 가는 링크가 동작한다.
- **검색·공유:**
  - `sitemap.xml`에 대상 나라 주소가 모두 있다.
  - `/countries/UKR`의 OG 이미지가 1200×630 PNG다.
- **무료 한도:**
  - 운영 배포 24시간 뒤 사용량이 런북에 기록돼 있다(Vercel 함수 호출·ISR 쓰기·Active CPU, Worker 요청).
  - 월로 환산한 값이 각 무료 포함량의 25% 이하다.
- 공통 검증을 통과한다.

**이슈**
- 3-1 나라 상세 대상 표시: `countries.json`에 `low_mentions` (`issues/3-1-country-eligibility-flag.md`)
- 3-2 나라 상세 페이지 서버 렌더(요약·여행경보·공관) (`issues/3-2-country-page-server.md`)
- 3-3 나라 상세 브라우저 영역(추이·뉴스·실시간)과 홈 연결 (`issues/3-3-country-page-client.md`)
- 3-4 나라 상세 sitemap·나라별 OG 이미지·llms.txt (`issues/3-4-country-sitemap-og.md`)
- 3-5 나라 상세·오프라인 운영 배포 확인과 무료 한도 기록 (`issues/3-5-deploy-check-free-tier.md`)

---

## M4. 라이트/다크 테마

- **만드는 것:**
  - 기존 컴포넌트의 색을 1-1 토큰으로 바꾼다. 이 단계에서는 다크 화면이 바뀌지 않는다.
  - 라이트 값을 더해 시스템 설정을 따르게 한다.
  - 수동 전환을 둔다. 저장은 `localStorage`로 하고, 첫 화면이 깜빡이지 않게 한다.
- **대비 검사:** 두 테마 모두에서 명도 대비 AA를 지킨다.

**완료 조건**
- **토큰만 쓰기:**
  - `frontend/src`·`frontend/app`의 .ts/.tsx에 팔레트 색 클래스와 hex가 0건이다. 아이콘·OG·manifest 파일과 `viewport.themeColor`는 제외한다.
  - 이 내용을 검사하는 소스 계약 테스트가 통과한다.
- **대비:** Playwright `colorScheme` light·dark 각각에서 `e2e/contrast.spec.ts`가 통과한다(4폭, 홈·가이드 모달·`/emergency`·`/countries/UKR`).
- **전환과 저장:**
  - "라이트"를 고르고 새로 고치면 라이트가 유지된다.
  - "시스템"을 고르면 OS 설정을 따른다.
- **깜빡임:** JS 응답을 2초 늦춰도 첫 화면 배경이 저장된 테마 색이다.
- **정적 렌더 유지:** 빌드 경로 표에서 `/`·`/emergency`가 동적(ƒ)으로 바뀌지 않는다.
- 공통 검증을 통과한다.

**이슈**
- 4-1 색 토큰 전환 1: 공용 UI·홈 골격 (`issues/4-1-tokens-shared-home.md`)
- 4-2 색 토큰 전환 2: 지도·차트·등급·상태 색 (`issues/4-2-tokens-dataviz.md`)
- 4-3 색 토큰 전환 3: 나머지 위젯과 "팔레트 색 금지" 소스 계약 (`issues/4-3-tokens-widgets-contract.md`)
- 4-4 라이트 테마 값·시스템 설정 따르기·두 테마 명도 대비 검사 (`issues/4-4-light-theme-contrast.md`)
- 4-5 테마 수동 전환·저장·첫 화면 깜빡임 방지 (`issues/4-5-theme-switch-fouc.md`)

---

## 이슈 의존 관계

```
1-1 → 1-4, 1-5, 2-2, 3-2, 3-3   (새 화면은 토큰을 쓴다)
1-2 → 1-4
1-3 → 1-5
1-4 → 1-5            (같은 /emergency 파일. 1-4 먼저 머지)
1-5 → 2-2            (같은 /emergency 파일. 1-5 먼저 머지)
2-1 → 2-2
2-1 → 3-2            (공관 묶음 응답을 서버에서 다시 쓴다)
2-2 → 2-3            (저장할 페이지가 완성된 뒤 서비스 워커)
2-3 → 2-4
2-3 → 2-5
2-3 → 2-6
3-1 → 3-2
3-2 → 3-3
3-2 → 3-4
1-4 → 3-4            (같은 sitemap.ts. /emergency 먼저)
2-3, 3-3, 3-4 → 3-5
3-3 → 4-1            (같은 HomePage.tsx. 충돌 방지)
M1~M3 화면 이슈 → 4-3 (새 화면까지 한 번에 계약 적용)
4-1, 4-2, 4-3 → 4-4
4-4 → 4-5
```

**병렬 진행:**
- 1-1, 1-2, 1-3, 2-1, 3-1은 동시에 시작할 수 있다.
- 2-4와 2-5는 2-3 뒤에 동시에 할 수 있다. 3-3과 3-4도 동시에 할 수 있다. 4-1과 4-2도 동시에 할 수 있다.
- M3는 2-1만 끝나면 M2의 나머지와 동시에 할 수 있다.
