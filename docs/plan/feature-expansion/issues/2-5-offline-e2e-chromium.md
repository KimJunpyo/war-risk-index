# 오프라인 자동 테스트(Playwright Chromium)

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **왜 자동 테스트가 필요한가:** 서비스 워커 동작은 수동 확인(2-3)만으로는 회귀를 막기 어렵다.
- **왜 Chromium인가:**
  - Playwright의 서비스 워커 기능은 Chromium 계열만 지원한다(plan.md 사실 6).
  - 지금 e2e는 Firefox·WebKit만 돈다.
  - Q6 결정대로 오프라인 spec 하나에만 Chromium을 쓴다.
- **대상 서버:** 서비스 워커는 개발 모드에서 등록하지 않는다(2-3). 그래서 이 spec은 프로덕션 빌드(`next build` + `next start`)를 대상으로 한다.

## 범위

- **포함:**
  - Chromium 프로젝트(오프라인 spec 전용)
  - 프로덕션 서버를 띄우는 설정(별도 설정 파일 또는 프로젝트, PR에 방식을 적는다)
  - `e2e:install`에 chromium 추가
  - `frontend/e2e/offline.spec.ts`
- **제외:**
  - 다른 spec을 Chromium으로 돌리기. 지금처럼 앱 브라우저에서 수동으로 확인한다.
  - 새 npm 패키지

## 인수 조건

- [ ] `frontend`에서 오프라인 spec 실행 명령 하나(예: `npm run e2e:offline`)로 빌드, 실행, 테스트가 돌고 통과한다. [테스트]
- [ ] spec이 다음을 확인한다. [테스트]
  - 홈을 연 뒤 30초 안에 서비스 워커가 activated다.
  - `context.setOffline(true)` 뒤 `/emergency`를 새로 고치면 경보 5종, 가방 목록, 공관 접기가 보인다.
  - 오프라인에서 계산기에 4명·7일 비축을 넣으면 "84L"가 나온다.
  - 오프라인에서 `/`로 가면 `/emergency`가 열린다.
  - Cache Storage 키에 `/api/`와 `lat=`가 0건이다.
- [ ] 기존 `npm run e2e`(Firefox·WebKit)는 실행 대상과 결과가 이전과 같다. 오프라인 spec을 돌리지 않는다. [테스트]
- [ ] `frontend/package.json`의 `dependencies`·`devDependencies`가 바뀌지 않았다(스크립트만 추가). [명령]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건. [명령]

## 영향 파일

- `frontend/playwright.config.ts` 또는 새 설정 파일(이름 제안 `playwright.offline.config.ts`)
- `frontend/package.json`(`scripts`만)
- `frontend/e2e/offline.spec.ts`(신규)

## 관련 시안

없음

## 선행 이슈

- 2-3: 서비스 워커

## 라벨

`enhancement`
