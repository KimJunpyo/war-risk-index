# 서비스 워커 직접 구현: `/emergency` 사전 저장과 오프라인 응답

기준 코드: `5acdd59`(`main`, 2026-11-17)

## 배경

- **목적:** `/emergency`(행동요령·가방·계산기·공관)를 기기에 저장해 인터넷 없이 연다.
- **서비스 워커가 필요한 이유:** Next 16 문서는 전체 오프라인 로드에 서비스 워커가 필요하다고 적는다. `experimental.useOffline`은 소프트 이동만 다룬다(plan.md 사실 4).
- **직접 만드는 이유:**
  - 라이브러리(Serwist 등)를 쓰지 않는다.
  - 필요한 동작은 "한 페이지와 그 정적 파일 저장, 오프라인일 때 그 페이지로 대체"뿐이라 직접 만들어도 짧다.
- **원칙:** 위치에서 나온 정보와 API 응답은 저장하지 않는다.

## 범위

- **포함:**
  - `frontend/public/sw.js`
  - 등록 컴포넌트. 프로덕션에서만 등록하고, 범위는 `/`다.
  - `next.config.ts` `headers()`의 `/sw.js` 헤더
  - 캐시 이름의 버전과 옛 캐시 삭제
  - 아래 동작 규칙
- **제외:**
  - 오프라인 안내 UI(2-4), 자동 테스트(2-5), 대피소 저장(2-6)
  - 푸시 알림, 백그라운드 동기화

## 동작 규칙

| 요청 | 처리 |
|---|---|
| 설치(install) | `/emergency` HTML과 그 HTML이 가리키는 `/_next/static/…` 파일(JS·CSS·글꼴), `/manifest.webmanifest`, `/icon.svg`를 저장한다 |
| `/emergency`로 이동 | 네트워크 먼저. 성공하면 저장본을 바꾸고, 새 HTML이 가리키는 정적 파일도 저장한다. 실패하면 저장본을 준다 |
| 그 밖의 페이지로 이동 | 네트워크 그대로. 실패하면(오프라인) `/emergency`로 보낸다 |
| 저장본에 있는 같은 출처 GET(`/_next/static/…` 등) | 저장본 먼저 |
| 그 밖의 요청 | 가로채지 않는다(`respondWith`를 부르지 않는다). 다른 출처 Worker API, 좌표가 든 주소도 여기에 든다 |
| 활성화(activate) | 현재 버전이 아닌 캐시를 지운다 |

- **개발 서버:** `npm run dev`에서는 등록하지 않는다. 개발 파일을 저장하지 않고, 기존 e2e에도 영향이 없다.
- **캐시 이름:** 영숫자 32자 이상(해시)을 넣지 않는다(`test_no_key_like_strings_in_repo`).
- **헤더:** `/sw.js`에는 Next PWA 가이드의 값을 붙인다.
  - `Content-Type: application/javascript; charset=utf-8`
  - `Cache-Control: no-cache, no-store, must-revalidate`

## 인수 조건

- [ ] `npm run build`·`npm run start` 뒤 `curl.exe -sI http://localhost:3000/sw.js`의 결과가 다음과 같다. [명령]
  - 상태 200
  - `Content-Type`에 `javascript`가 있다.
  - `Cache-Control`이 `no-cache, no-store, must-revalidate`다.
- [ ] Chrome 또는 Edge에서 `npm run start`로 띄운 홈을 처음 열고 30초 안에 다음을 확인한다. [수동]
  - 개발자 도구 Application > Service workers가 activated다.
  - Cache Storage에 `/emergency` 항목이 있다.
- [ ] 이어서 Network를 Offline으로 바꾸고 `/emergency`를 새로 고친다. 경보 5종, 가방 두 목록, 공관 목록이 보이고, 계산기에 4명·7일 비축을 넣으면 "84L"가 나온다. [수동]
- [ ] 오프라인에서 `/`와 `/countries/UKR`로 가면 주소가 `/emergency`로 바뀌고 본문이 보인다. [수동]
- [ ] Cache Storage의 모든 항목 주소에 `/api/`와 `lat=`가 0건이다. 홈에서 위치로 대피소를 찾은 뒤에도 같다. [수동]
- [ ] 온라인에서 홈의 Worker API 요청이 Network 탭에서 서비스 워커를 거치지 않는다(Size 열에 "(ServiceWorker)" 없음). [수동]
- [ ] `sw.js`를 한 줄 바꿔 다시 빌드·실행한 뒤 온라인으로 홈을 열면 새 서비스 워커가 활성화되고, 이전 버전 캐시 이름이 Cache Storage에서 사라진다. [수동]
- [ ] `npm run dev`로 띄운 홈에서 `navigator.serviceWorker.getRegistrations()` 결과가 빈 배열이다. [테스트]
- [ ] Cache Storage 항목 수와 합계 크기(개발자 도구 Storage 사용량)가 PR 본문에 있다. [수동]
- [ ] 기존 위치 개인정보 e2e(`shelters.spec.ts`의 저장소·위치 요청 검사)가 통과한다. [테스트]
- [ ] `frontend/package.json`의 의존성이 바뀌지 않았다. [명령]
- [ ] 머지 뒤 운영 주소(`https://war-risk-index.vercel.app`)에서 온라인 1회 방문, 오프라인 전환, `/emergency` 열림을 한 번 확인했다. 날짜와 브라우저를 이슈 코멘트에 적는다. [수동]
- [ ] 공통 검증을 통과한다: pytest 전부, `npx tsc --noEmit`·`npm run lint` 오류 0건, `node --test frontend/src/**/*.test.ts` 통과, `npm run e2e` 통과. [명령]

## 영향 파일

- `frontend/public/sw.js`(신규)
- 등록 컴포넌트(위치 제안: `frontend/src/shared/ui/ServiceWorkerRegistration.tsx`)와 `frontend/app/layout.tsx`
- `frontend/next.config.ts`(`headers()`)
- 등록 조건 확인 e2e(이름 제안 `frontend/e2e/service-worker.spec.ts`, 개발 서버에서 등록 0건)

## 관련 시안

없음(plan.md 7-1, 이 이슈의 동작 규칙)

## 선행 이슈

- 2-2: 저장할 페이지가 완성된 뒤 시작한다(1-5도 포함).

## 라벨

`enhancement`
