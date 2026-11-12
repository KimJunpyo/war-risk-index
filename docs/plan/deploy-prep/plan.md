# 전쟁 가능성 지수 배포 준비 기획안

작성일: 2026-11-11(2026-11-12 M9 구현 결과 반영) · 상태: M1(GitHub M9) 구현 완료, PR #45에 포함. 열린 질문 Q1~Q12는 미결이며 추천안 기준으로 진행 · 이전 기획: `docs/plan/service-revamp/`, `docs/plan/ui-polish/`(모두 완료) · 코드 위치·줄 번호는 `466b1a9`(M9 시작 전 `main`, 2026-11-11) 기준

## 1. 목표

지금은 로컬(Windows)에서만 돌아가는 사이트를, 공개 주소에서 사람이 지켜보지 않아도 돌아가게 만든다. 새 기능은 넣지 않는다. 배포, 데이터 이전, 운영에 꼭 필요한 것만 다룬다.

1. 백엔드는 실행 중에 데이터 파일을 다시 쓴다. 이때 API가 반쯤 쓴 파일을 읽거나, 프로세스가 끝나서 잘린 파일이 남지 않게 한다. 이를 위해 임시 파일에 쓴 뒤 교체하는 원자적 쓰기(atomic write)를 쓴다.
2. 다운로드 타임아웃을 넣어 갱신 스레드가 멈추지 않게 한다. 데이터가 오래되면 밖에서 알 수 있도록 헬스 체크(health check)를 둔다.
3. 서버에서 로컬과 같은 버전으로 설치·빌드·실행되게 한다. 의존성 버전을 고정하고 프로덕션 빌드를 확인한다.
4. 배포 설정 파일과 운영 런북(runbook)을 만든다. 서버 준비부터 되돌리기까지 문서만 보고 따라 할 수 있어야 한다.
5. 로컬 데이터(`data/`, `out/`)를 서버로 옮긴다. 백업·복원·가동 감시(uptime monitoring)는 실제 서버에서 한 번씩 리허설한다.

## 2. 대상 사용자

- **운영자:** 사용자 본인 1명이다.
  - 리눅스 서버 운영 경험은 가정하지 않는다. 런북 명령은 복사해서 그대로 실행할 수 있어야 한다.
  - 로컬 명령은 PowerShell, 서버 명령은 bash로 쓴다.
- **방문자:** 기존과 같다. 화면은 바뀌지 않고 접속 주소(`https://<도메인>/`)만 생긴다.

## 3. 원칙

1. **새 기능과 화면 변경은 없다.** 새 API는 운영용 `GET /api/health` 하나뿐이다(6절).
2. **유료 API와 새 런타임 라이브러리는 쓰지 않는다.**
   - 코드는 표준 라이브러리와 기존 의존성만 쓴다.
   - Caddy·Node·Python은 서버에만 설치하는 실행 환경이다.
3. **백엔드는 프로세스·워커 1개로, 저장소 루트에서 실행한다.**
   - 워커가 여럿이면 워커마다 갱신 스레드가 떠서 같은 CSV를 동시에 쓴다.
   - 원자적 쓰기(1-1)의 임시 파일 이름도 `<파일>.part`로 고정이라, 같은 파일을 쓰는 프로세스가 하나뿐이라고 전제한다. 그래서 수집·지수 스크립트를 손으로 돌릴 때는 백엔드를 먼저 멈춘다(2-2).
   - 수집 모듈이 `Path("data/...")` 상대 경로를 쓰므로 작업 디렉터리는 저장소 루트여야 한다.
4. **비밀값은 저장소 밖에 둔다.**
   - 비밀값은 `.env`(권한 600)에만 둔다. 설정 파일, 문서, 이슈, PR에는 넣지 않는다.
   - 도메인과 서버 IP도 설정 파일에 하드코딩하지 않는다. 환경변수나 자리표시자(placeholder) `<도메인>`·`<서버 IP>`를 쓴다.
5. **위치 개인정보 원칙을 유지한다.** 대피소 좌표 쿼리는 앞단 웹 서버를 포함해 어느 로그에도 남기지 않는다.
6. **확인을 로컬과 서버로 나눈다.** 로컬(Windows)에서 확인할 수 있는 것은 M1·M2에서, 서버가 있어야 확인할 수 있는 것은 M3에서 확인한다.

## 4. 현재 상태 (2026-11-11 저장소 확인)

아래 표와 사실은 M9 전 상태다. M9(PR #45)에서 원자적 쓰기, 다운로드 타임아웃, `/api/health`, 의존성 고정, UCDP 실패 격리가 들어갔다. M9에서 새로 확인한 사실은 해당 항목에 "M9"로 표시했다.

### 이미 있는 것

| 구분 | 내용 | 위치 |
|---|---|---|
| 백엔드 실행 | 저장소 루트에서 `uvicorn backend.app.main:app`. 루트 `.env`를 자동으로 읽는다(이미 설정된 환경변수가 우선) | `backend/app/main.py` 1-3, 41-44행 |
| 백그라운드 갱신 | 15분마다 `live.update` 다음 `_daily_refresh`. 여행경보·대피소·재외공관은 하루 1회, 2.0 일별 백필, 새 1.0 일별 파일이 나오면 수집·지수 재계산 | `main.py` 157-196행 |
| 임시 파일→교체 쓰기 | 이미 4곳에 있다 | `live.py` 103-105, `shelters.py` 86-89, `embassies.py` 71-74, `travel_advisory.py` 209-212행 |
| Python 의존성 목록 | 있다. 일부만 버전이 고정돼 있다(아래 사실 4) | `backend/requirements.txt`, `backend/requirements-dev.txt` |
| 환경변수 예시 | `DATA_GO_KR_SERVICE_KEY`만 있다. 코드에 기본값이 있는 변수: `CORS_ORIGINS`(기본 `http://localhost:3000`), `LIVE_UPDATES`(기본 `"1"`) | `.env.example`, `main.py` 52·54행 |
| 프론트 환경변수 | `NEXT_PUBLIC_API_BASE_URL`(기본 `http://localhost:8000`), `NEXT_PUBLIC_SITE_URL`(기본 `http://localhost:3000`) | `frontend/src/shared/config/env.ts` |
| API 라우트 | 14개 모두 `/api/` 아래 | `main.py` |
| 프론트의 API 호출 | 모두 브라우저에서 한다(`"use client"` 훅). 경로는 `/api/...` | `frontend/src/shared/api/use-fetch.ts`, `http.ts` |
| 응답 압축 | 백엔드는 GZip(1,000바이트 이상). Next는 `next start`에서 기본으로 gzip | `main.py` 208행, Next 문서 `05-config/01-next-config-js/compress.md` |
| 좌표 로그 제외 | uvicorn 접근 로그에서 `/api/shelters?…`를 뺀다 | `main.py` 89-100행 |
| 배포 설정·런북·백업·헬스 체크 | 없다 | – |
| CI | 없다 | – |
| 시안 | `docs/design/`가 없다. 5절 구성도가 시안을 대신한다 | – |

### 확인한 사실 중 기획에 영향 주는 것

**사실 1. 파일 쓰기 방식이 세 가지다.**

| 방식 | 위치 → 파일 | 문제 | 처리 |
|---|---|---|---|
| 대상 파일에 바로 다시 쓰기 | `build_index.py:46` → `out/index_v1.csv`<br>`build_country_index.py:209,216` → `out/country_index.csv`, `out/country_meta.csv`<br>`blend.py:65` → `out/blend_weights.json`<br>`ucdp.py:126-128` → `data/ucdp_country_monthly.csv`, `data/ucdp_opponents_monthly.csv`, `data/ucdp_country_monthly.csv.asof` | (1) API는 mtime이 바뀌면 파일을 다시 읽는다(`main.py:109-118`). 그래서 쓰는 중에 들어온 요청은 잘린 파일을 읽는다.<br>(2) 쓰는 중에 프로세스가 끝나면(재배포, 메모리 부족) 잘린 파일이 남는다.<br>(3) `country_meta.csv`는 일별 재계산 여부를 정할 때도 쓰인다(`main.py:176-178`). 그래서 잘린 채로 하루 이상 남을 수 있고, 파싱 오류가 나면 매 주기 실패한다.<br>(4) UCDP 집계는 UCDP 새 버전(월 1회)이 나올 때만 다시 쓴다(`ucdp.py:116-118`). | 1-1 |
| 임시 파일→교체 | "이미 있는 것" 표의 4곳 | 없다 | 유지 |
| 이어 붙이기(append) | `gdelt_collect.py:157-179`<br>`country_collect.py:79-99`<br>`live.py:143-165`(`backfill`) | (1) 쓰는 중에 읽으면 마지막 줄만 잘린다. 다음 mtime 변경 때 다시 읽으면서 회복된다.<br>(2) 줄 중간에서 프로세스가 끝나면 다음 append가 그 줄에 이어 붙어 파싱 오류가 날 수 있다. | 범위 밖(10절). 백업 복원으로 대비한다(2-3) |

**사실 2. 다운로드 두 곳에 타임아웃이 없다.**
- `gdelt_collect.py:89`와 `ucdp.py:121`은 `urllib.request.urlretrieve`를 쓴다. 이 함수에는 타임아웃 인자가 없고, 저장소 어디에도 `socket.setdefaulttimeout`이 없다.
- `load_events`(`gdelt_collect.py:86`)는 15분 실시간(`live.fetch_slot`)과 일별 수집이 모두 쓴다.
- 상대 서버가 연결을 끊지 않은 채 응답만 멈추면 갱신 스레드(`main.py:188`)가 영원히 멈춘다. 프로세스는 살아 있으므로 자동 재시작도 일어나지 않는다.
- 다른 네트워크 호출(`live.py:50`, `main.py:151`, `backend/app/news.py`, `data_go_kr.py`, `travel_advisory.py`)에는 타임아웃이 있다.
- → 1-2

**사실 3. 데이터가 오래돼도 밖에서 알 수 없다.**
- 갱신이 멈춰도 API는 마지막 파일로 200을 준다.
- `/api/live`가 최신 15분 슬롯(`as_of`)을 주지만, 일반 가동 감시 서비스는 그 시각이 지금보다 얼마나 오래됐는지 계산하지 못한다.
- → 1-3

**사실 4. Python 의존성 목록은 있지만 서버 설치용으로는 부족하다.**
- `backend/requirements.txt`는 첫 커밋(`a99a880`)부터 추적되고 있다.
  - 버전 고정: fastapi, uvicorn[standard], python-dotenv, pycountry
  - 버전 미고정: pandas, numpy, matplotlib, xlrd
- `requirements-dev.txt`는 `-r requirements.txt`에 pytest·httpx를 더한다.
- **matplotlib은 지금 구조에서 런타임 의존성이다.**
  - `gpr_backtest.py:10`이 모듈 맨 위에서 `matplotlib.pyplot`을 불러온다.
  - 다음 모듈이 `gpr_backtest`에서 상수를 가져온다: `blend.py:14`, `index_v1.py:10`, `live.py:22`, `build_index.py:9`, `build_country_index.py:14`, `gdelt_collect.py:14`.
  - 그래서 목록에서 빼기만 하면 백엔드가 뜨지 않는다. → 1-4에서 import 위치를 옮긴다.
- xlrd는 백테스트 전용인 `gpr_backtest.py:33`(`read_excel`)에서만 쓴다. httpx는 테스트(`TestClient`)에서만 쓴다.
- 로컬 버전: Python 3.12.10, Node v24.22.1

**사실 5. 프론트 프로덕션 빌드는 한 번도 확인하지 않았다.**
- **백엔드 불필요:** 데이터 호출이 모두 브라우저에서 일어나므로 `next build`와 `next start`에는 백엔드가 필요 없다.
- **빌드 때 박히는 값:**
  - `NEXT_PUBLIC_*` 값은 빌드할 때 번들에 박힌다(Next 문서 `02-guides/environment-variables.md`).
  - `SITE_URL`은 `metadataBase`, canonical, `robots.txt`, `sitemap.xml`, JSON-LD에 쓰인다.
- **글꼴:** `next/font/google`(Geist, `app/layout.tsx:4`)은 빌드할 때 글꼴을 내려받는다(`03-api-reference/02-components/font.md:13`). 그래서 빌드하는 곳에 인터넷이 필요하다.
- **현재 시각 읽기:** `cacheComponents: true`라서 클라이언트 컴포넌트도 빌드 때 미리 렌더링된다.
  - 렌더 중에 현재 시각을 읽으면 빌드 오류가 날 수 있다(`04-functions/io.md`, `02-guides/client-side-data-fetching/tanstack-query.md:369`).
  - 후보: `shared/lib/format.ts:5`의 기본값 `Date.now()`, `shared/lib/use-now.ts`
  - use-now 개발 모드 경고 수정은 PR #33으로 `main`에 머지됐다(`d209f80`, 2026-11-11). 1-5는 그 뒤의 `main`에서 확인한다.
- **출력 폴더:**
  - Next 16은 `next dev`(`.next/dev`)와 `next build`(`.next`)의 출력 폴더가 달라 동시에 실행할 수 있다(`03-api-reference/06-cli/next.md:60`).
  - 하지만 `next start`가 쓰는 `.next`는 `next build`가 다시 만든다. 그래서 서버를 업데이트할 때는 웹 서비스를 멈추고 빌드한다(Q9).
- **Next 문서의 권장 사항(`02-guides/self-hosting.md`):** 리버스 프록시(reverse proxy) 뒤에 두고, 종료 신호(SIGTERM)를 보낸 뒤 10~30초 기다린다.
- **예시 파일 위치:** `frontend/.gitignore`의 `.env*` 규칙 때문에 `frontend/.env.example`은 git에 올라가지 않는다. 그래서 프론트 빌드용 예시는 `deploy/`에 둔다(2-1).

**사실 6. 기존 테스트가 새 파일에 거는 제약**
- **`test_m4_env.py::test_env_example_exists_with_empty_values`:** `.env.example`의 모든 항목 값이 비어 있어야 통과한다.
  - 그래서 `CORS_ORIGINS`·`LIVE_UPDATES` 설명은 주석 줄로만 넣는다.
  - 빈 값 `LIVE_UPDATES=`를 그대로 `.env`에 복사하면 갱신 스레드가 꺼진다. `main.py:54`는 값이 `"1"`일 때만 켠다.
- **`test_m4_env.py::test_no_key_like_strings_in_repo`:** 추적 파일과 무시되지 않은 새 파일에서 영숫자가 32자 이상 이어진 문자열을 찾는다. 그래서 설정과 문서에 해시나 키를 붙이지 않는다.
- **`test_m1_backend.py::test_no_threat_references_in_repo`:** `docs`·`tests` 등을 뺀 저장소 전체를 바이트 단위로 훑는다. `deploy/`도 대상이므로 이전용 압축 파일은 저장소 밖에 만든다.
- **데이터 의존 테스트:** `test_smoke.py`, `test_m3_backend.py`, `test_m1_backend.py`의 엔드포인트 테스트는 로컬 `out/`·`data/`를 읽는다. 그래서 CI를 붙이려면 데이터를 따로 준비해야 한다(Q8).

**사실 7. 운영에 영향 주는 그 밖의 사실**
- **경로 분기:**
  - Caddy에서 `/api/*`만 백엔드로 보내면 같은 주소로 동작하므로 CORS가 필요 없다.
  - FastAPI 기본 문서(`/docs`, `/openapi.json`)는 `/api/` 밖에 있어서 이 구성에서는 밖으로 노출되지 않는다.
- **좌표 로그:**
  - 대피소 좌표는 쿼리 문자열(`/api/shelters?lat=…&lon=…`)로 온다.
  - uvicorn 접근 로그에서는 빠지지만, 앞단 웹 서버가 접근 로그를 남기면 그대로 기록된다. 그래서 Caddy 접근 로그(`log` 지시어)를 켜지 않는다.
  - 백엔드가 멈췄을 때 Caddy 프록시 오류 로그에 요청 URI가 남는지는 확인하지 못했다(확실하지 않음, 3-2에서 확인).
- **나가는 연결:**
  - 서버에서 호출하는 곳은 data.gdeltproject.org, ucdp.uu.se, apis.data.go.kr, cadataapi.state.gov, www.gov.uk, news.google.com이다.
  - GDELT 2.0은 `http://`(`live.py:26`)를 쓰지만, 지금은 301로 `https://`에 리디렉션된다(M9, 2026-11-11·11-12 확인). 그래서 서버에서 나가는 80·443을 둘 다 열어 둔다(2-2).
  - `www.0404.go.kr`는 링크 상수(`travel_advisory.py:27`, `embassies.py:23`)일 뿐 호출하지 않는다.
- **비공개 저장소:** 서버에서 clone하려면 배포 키(deploy key)가 필요하다(U3).
- **하루 1회 판단과 시간대:**
  - 하루 1회 판단은 `time.time() - mtime`으로 한다(여행경보 20시간 `travel_advisory.py:32,194`, 대피소·재외공관도 같은 방식). 그래서 시간대와 상관없고, 데이터 이전 때 mtime만 보존하면 된다.
  - 반면 `country_collect.py:74`와 `gdelt_collect.py:77`은 로컬 날짜(`Timestamp.today()`)를 쓰고, 재외공관 수집일 표시(`main.py:492`)는 서버 시간대를 따른다.
  - 그래서 서버 시간대를 로컬과 같은 Asia/Seoul로 두면 로컬에서 확인한 동작이 그대로 유지된다.
- **일별 재계산 순서(M9 리뷰에서 확인):**
  - `backend/app/main.py`의 `_daily_refresh`는 `build_index.main()`(쌍 지수)을 `build_country_index.main()`(국가 지수, 가중치 `out/blend_weights.json`, `out/country_meta.csv`)보다 먼저 돌린다. 그래서 쌍 지수는 직전 주기 가중치를 쓴다. 가중치 반영이 1일 늦고, 평상시 영향은 표시값 0.1 수준이다.
  - 순서는 유지한다. `country_meta.csv`가 마지막에 써져야 중간 단계가 실패했을 때 다음 주기가 다시 시도하고, 헬스 체크의 지수 날짜도 실패를 드러낸다(1-1).
  - 가중치 파일이 없으면 기본 가중치로 계산돼 첫날 쌍 지수 `blended`가 최대 약 34점 틀린다(M9 리뷰어 계산). 그래서 데이터를 옮길 때 `out/`를 함께 옮기고, 못 옮기면 첫 기동 전에 `build_country_index` → `build_index` 순서로 손으로 한 번 돌린다(`out/` 폴더부터 만든다, 2-3, 3-1).
- **키 없이 띄우기:**
  - 공공데이터 키가 없으면 대피소 위젯이 렌더링되지 않는다(`frontend/src/widgets/nearby-shelters/ui/NearbyShelters.tsx:43`). 그래서 코드를 고치지 않고 위치 기능을 끈 채 공개할 수 있다(Q10).
  - 같은 키를 쓰는 재외공관 연락처와 외교부 여행경보도 함께 빠진다. 화면에서 어떻게 보이는지는 3-1에서 확인한다.
- **데이터 크기(로컬):**
  - `data/`는 약 186MB이고, 이 중 `data/npm_cache` 49MB를 빼면 약 137MB다. `out/`는 약 16MB다.
  - 큰 파일: `gdelt_catalyst_all.csv` 39MB, `gdelt_country_daily.csv` 30MB, `data/ucdp/` 원본 50MB, `country_index.csv` 14MB
  - `data/gdelt_tmp/`(852KB)는 다운로드 임시 폴더라 옮기지 않는다.
- **메모리(M9, 1-5 측정):** Windows 11·논리 CPU 12개에서 잰 참고치다. Windows Working Set(WS)은 리눅스 RSS와 다르고, 서버 실측은 3-1에서 한다.
  - 백엔드: 기동 직후 WS 91MB(Private 422MB), 첫 `/api/countries` 요청 뒤 126MB. 1-4 뒤라 matplotlib을 불러오지 않는다. 기획 때 값(WS 약 232MB, Private 약 557MB)은 1-4 전 값이다. matplotlib 로드는 약 +25MB(스크래치 실측)라 차이의 일부일 뿐이고 나머지 원인은 확인하지 못했다.
  - 지수 재계산(`build_country_index.main()` + `build_index.main()`): PeakWorkingSet 223MB, 최대 커밋 926MB. 별도 프로세스에서 잰 값이다. 백엔드 안에서 돌 때의 최대(기동 값 + 재계산)는 3-1 `VmHWM`으로 잰다.
  - `next build`: 캐시 없는 빌드 최대 1,989MB로 가장 크다. 정적 생성 워커가 도는 단계에서 최대이고, 워커 수는 CPU 수에 비례한다(측정 때 10개). 첫 빌드 1,306MB, 캐시 있는 재빌드 1,179MB
  - `next start`: 기동 뒤 183MB(프로세스 트리 합계)
  - 멈췄던 기간을 따라잡는 캐치업(catch-up)의 최대치는 재지 않았다. 캐치업 때 `country_collect`는 GDELT 일별 파일을 4개씩 동시에 읽는다(`gdelt_collect.py:24` `WORKERS = 4`). → 3-1에서 `VmHWM`으로 잰다.
- **줄바꿈:** `core.autocrlf=true`이고 추적 파일은 모두 LF로 저장돼 있다(`git ls-files --eol`). 셸 스크립트와 서비스 파일도 LF로 커밋됐는지 확인한다(2-1, 2-3).

## 5. 배포 구성 (목표)

```
브라우저 ──HTTPS──▶ Caddy (:80→:443 리디렉션, 인증서 자동 발급·갱신, 접근 로그 끔)
                     ├─ /api/*  ──▶ 127.0.0.1:8000  uvicorn 워커 1 (+ 갱신 스레드) ── data/, out/ 읽기·쓰기
                     └─ 그 외   ──▶ 127.0.0.1:3000  next start
외부 가동 감시 ──▶ https://<도메인>/api/health, https://<도메인>/
cron(매일) ──▶ deploy/backup.sh ──▶ 서버 안 백업 폴더 (+ 주 1회 서버 밖 사본, Q6)
```

### 서버 규약 (설정 파일과 런북이 따르는 값)

| 항목 | 값 | 이유 |
|---|---|---|
| OS | Ubuntu 24.04 LTS | 기본 Python이 3.12라 로컬(3.12.10)과 마이너 버전이 같다 |
| 저장소 위치 | `/srv/war-risk-index`(백엔드 작업 디렉터리) | 수집 모듈이 상대 경로를 쓴다 |
| 서비스 사용자 | `warrisk`(로그인 셸 없는 시스템 사용자) | `data/`·`out/` 쓰기 권한만 준다. 파일뿐 아니라 폴더(하위 폴더 포함) 자체에도 쓰기 권한이 필요하다. 원자적 쓰기가 같은 폴더에 `<파일>.part`를 만든 뒤 교체한다 |
| 포트 | 백엔드 8000, 프론트 3000. 둘 다 `127.0.0.1`에만 바인딩. 들어오는 연결은 22·80·443만 연다. 나가는 80·443과 git SSH용 22는 막지 않는다 | 밖에는 Caddy만 노출한다. GDELT 2.0이 `http://`에서 `https://`로 리디렉션되고(4절 사실 7), 배포 키로 clone·pull한다(U3) |
| 런타임 | Python 3.12 venv(`/srv/war-risk-index/.venv`), Node 24 LTS | 로컬과 같은 메이저 버전 |
| 시간대 | Asia/Seoul | 4절 사실 7(로컬 날짜를 쓰는 코드) |
| 비밀값 | `/srv/war-risk-index/.env`(소유자 `warrisk`, 권한 600) | `main.py`가 시작할 때 읽는다 |
| 프론트 빌드 값 | `frontend/.env.production.local`(`deploy/web.env.example`을 복사) | 빌드할 때 박힌다 |
| 사양 | 기본안: RAM 2GB + 스왑(swap) 2GB, 디스크 25GB 이상. 1-5 측정으로 기본안을 유지하고, 3-1 서버 실측 뒤 확정(Q2) | 빌드 최대 약 2GB(1-5)가 가장 커서 2GB 서버에서 빌드할 때 스왑이 필요할 수 있다. 빌드와 캐치업이 겹칠 때를 위한 여유 |

## 6. 화면·API 구성

- **화면:** 바뀌지 않는다.
- **바뀌는 동작:** 파일 쓰는 방식과 다운로드 타임아웃뿐이다. 사용자에게 보이는 응답은 같다.
- **새 API(운영용, 1-3):**

| 항목 | 내용 |
|---|---|
| 경로 | `GET /api/health`. `HEAD`도 같은 상태 코드를 준다(`@app.get`과 `@app.head`를 함께 붙임, 1-3) |
| 용도 | 외부 가동 감시 전용이다. Caddy 업스트림 헬스 체크에는 쓰지 않는다. 데이터가 오래되면 일부러 503을 주므로, 쓰면 데이터 정체가 API 전체 장애로 번진다(2-1) |
| 200 | 실시간 최신 슬롯이 현재(UTC)로부터 60분 이내 **그리고** 일별 지수 최신 날짜가 3일 이내. 판정은 본문의 정수로 한다: `live_age_minutes` ≤ 60 **그리고** `index_age_days` ≤ 3 |
| 503 | 둘 중 하나라도 넘었거나 파일·값이 없다(해당 필드 `null`, 500 아님) |
| 본문(200·503 같음) | `ok`, `live_as_of`, `live_age_minutes`, `index_date`, `index_age_days` 5개만 |
| 나이 계산 | `live_age_minutes`: 현재 UTC − 최신 슬롯 시각을 분 단위로 내림한 정수다. 60분 59초는 60이라 200, 61분부터 503이다. 음수도 정상이다(−11분 15초 → −12). 하한 검사는 없다.<br>`index_age_days`: 오늘(UTC) 날짜 − `index_date`의 달력 날짜 차다. 하루 중 시각과 상관없다 |
| 정상 범위(M9 실측) | `live_age_minutes` 약 −11~+20분: GDELT 2.0 슬롯 key가 실제 발행보다 약 10~11분 늦고(599~694초), 갱신은 15분 간격이다.<br>`index_age_days` 1~2: D일 GDELT 1.0 파일이 D+1일 07:00 UTC 무렵 올라온다 |
| 상수 | `main.py`의 `LIVE_STALE_MINUTES = 60`, `INDEX_STALE_DAYS = 3` |

## 7. 사용자 흐름

**방문자:** `https://<도메인>/`에 접속하면 기존과 같은 화면을 본다. Q10에서 "키 없이 공개"를 고르면 대피소 영역이 보이지 않는다.

**운영자**
1. **첫 배포:**
   1. 9절 사용자 행동(서버, 도메인, 배포 키, `.env`)을 끝낸다.
   2. 런북의 "서버 준비" → "첫 배포" → "데이터 이전"을 차례로 따른다.
   3. 가동 감시와 백업 cron을 등록한다.
2. **업데이트:**
   1. 로컬에서 PR을 머지한다.
   2. 서버에서 지금 배포된 커밋 해시를 기록하고 `git pull` 한다. 의존성이 바뀌었으면 설치한다.
   3. 웹 서비스를 멈추고 빌드한 뒤 다시 시작하고, 백엔드를 재시작한다.
   4. `/api/health`로 확인한다.
3. **알림을 받았을 때:**
   1. 감시 서비스에서 메일을 받는다.
   2. 런북 "가동 감시"의 순서대로 점검한다: 서비스 상태 → 로그 → `/api/health` 본문 → 외부 데이터 접속 → 디스크·메모리
   3. 재시작, 되돌리기, 복원 중 하나로 조치한다.
4. **서버를 잃었을 때:**
   1. 새 서버를 준비한다.
   2. 최신 백업을 옮긴다. 백업이 없으면 로컬 PC 데이터를 옮긴다. `out/`도 함께 옮긴다. 못 옮겼으면 첫 기동 전에 지수를 손으로 한 번 계산한다(`out/` 폴더부터 만든다, 4절 사실 7, 2-3).
   3. 빈 기간은 자동으로 채워진다(실시간 최근 26시간 슬롯, 2.0 일별 백필, 1.0 일별 수집).

## 8. 기능 목록

| ID | 기능 | 이슈 |
|---|---|---|
| F1 | 지수·UCDP·가중치 파일 원자적 쓰기 | 1-1 |
| F2 | GDELT·UCDP 다운로드 타임아웃, UCDP 갱신 실패 격리(M9 최종 리뷰 뒤 추가) | 1-2 |
| F3 | 데이터 신선도 헬스 체크 `/api/health` | 1-3 |
| F4 | Python 런타임 의존성 고정과 백테스트·테스트 의존성 분리 | 1-4 |
| F5 | 프로덕션 빌드·실행 확인과 메모리 측정 | 1-5 |
| F6 | 배포 설정 파일(Caddy·systemd·환경변수 예시) | 2-1 |
| F7 | 런북: 서버 준비·첫 배포·업데이트·되돌리기 | 2-2 |
| F8 | 런북: 데이터 이전·백업·복원·가동 감시, 백업 스크립트 | 2-3 |
| F9 | 서버 첫 배포와 데이터 이전 | 3-1 |
| F10 | 백업·복원·가동 감시·되돌리기 리허설 | 3-2 |

## 9. 사용자 행동 체크리스트 (코드 아님, 이슈와 별도)

메인 세션이나 개발자가 대신할 수 없는 일이다. 값 자체가 아니라 완료·실패 여부만 알려 주면 된다.

- [ ] **U1. 업체 가입·서버 생성** (Q1·Q2 결정 후) → 3-1 선행
  - 서울 리전, Ubuntu 24.04 LTS, 디스크 25GB 이상, 고정 공인 IPv4, SSH 키 접속
  - RAM은 1-5 측정(4절 사실 7)으로 기본안 2GB + 스왑 2GB를 유지한다(Q2). 3-1 실측에서 OOM 기록이 있으면 사양을 올린다.
- [ ] **U2. 도메인·DNS** (Q3) → 3-1 선행
  - 도메인을 정하고 A 레코드를 서버 IP로 지정한다.
  - 확인: 로컬 PowerShell에서 `Resolve-DnsName <도메인>`이 서버 IP를 돌려준다.
- [ ] **U3. GitHub 배포 키 등록** → 3-1 선행
  - 서버에서 만든 공개 키를 저장소 Settings → Deploy keys에 읽기 전용으로 등록한다. 저장소가 비공개라 필요하다.
  - 요청 목록에 없던 항목이라 추가했다.
- [ ] **U4. `.env` 복사** → 3-1 선행
  - 로컬 루트 `.env`를 `scp`로 서버의 `/srv/war-risk-index/.env`에 둔다. 소유자는 `warrisk`, 권한은 600이다.
  - 키 값은 채팅, 이슈, 커밋에 붙이지 않는다.
  - Q10에서 "키 없이 공개"를 고르면 공개 확인 전까지 키 줄을 비워 둔다.
- [ ] **U5. 서버에서 국내 공공 API 호출 확인** → 키를 넣는 시점(3-1 또는 공개 확인 뒤)
  - 런북의 확인 명령(여행경보·대피소·재외공관 강제 갱신)이 성공하는지 본다.
  - 해외 IP 차단 여부는 확실하지 않다. 실패하면 결과를 알려 주고 Q1을 다시 본다.
- [ ] **U6. 위치정보법 확인** → 공개 전
  - 대피소 찾기는 브라우저 좌표(소수 2자리, 저장·로그 안 함)를 서버로 보낸다. 이 구조가 신고나 고지 대상인지 확인한다.
  - 서버 로그의 IP 보관(Q11)도 함께 본다.
  - 이 문서는 법적 판단을 하지 않는다. 결과가 나오기 전의 공개 방식은 Q10을 따른다.
- [ ] **U7. 가동 감시 서비스 가입** (Q7) → 3-2 선행
  - 알림 받을 메일 주소를 등록한다.
  - 요청 목록에 없던 항목이라 추가했다.

## 10. 범위 밖

| 항목 | 이유 |
|---|---|
| 새 기능, 화면 변경(데이터 지연 안내 표시 포함) | 요청 범위 밖이다. 아이디어는 12절 |
| append 방식 수집 파일 3곳의 원자적 쓰기 | (1) 실행 중 읽기 위험은 마지막 한 줄이 잠깐 잘리는 정도이고, 다음 mtime 변경 때 회복된다.<br>(2) 줄 중간에서 프로세스가 끝나는 경우는 몇 KB를 붙이는 순간에만 생긴다.<br>(3) 제대로 막으려면 "국가 행 = 수집 완료 표시" 규칙(`country_collect.py:95`, `live.py:159`)을 지키면서 세 수집기를 함께 바꿔야 해서 하루 크기를 넘는다.<br>→ 이번에는 매일 백업과 복원 절차(2-3)로 대비한다 |
| 기존 임시 파일→교체 4곳을 1-1 공용 함수로 통일 | 동작이 이미 맞다. 관련 없는 리팩터링이다 |
| CI, 자동 배포 | Q8 |
| Docker 이미지 | Q4(systemd 추천) |
| 무중단 업데이트 | Q9 |
| 요청 수 제한, HSTS, fail2ban, systemd 보안 옵션 강화 | 이번에는 기본만 한다: 키 접속, 방화벽, 127.0.0.1 바인딩, 비특권 사용자 |
| 전이 의존성까지 고정하는 잠금 파일(lock file) | pip-tools나 uv 같은 새 도구가 필요하다. 이번에는 직접 의존성만 `==`로 고정한다. 새 도구 없이 pip 기본 기능(constraints 파일, `-c`)으로 고정하는 방법은 Q12(3-1)에서 정한다 |
| 개발용 Windows 설정: `package.json` `e2e`의 cmd `set` 문법, `.claude/launch.json`·`playwright.config.ts`의 Selector 루프 옵션 | 서버에서 쓰지 않으므로 그대로 둔다 |
| 수집 스크립트의 로컬 날짜(`Timestamp.today()`)를 UTC로 통일 | 서버 시간대를 Asia/Seoul로 맞춰 로컬과 같은 조건으로 운영한다 |
| 법률 검토 | U6(사용자 확인) |
| GitHub 마일스톤·이슈·라벨 생성 | 사용자 승인 뒤 메인 세션이 한다 |

## 11. 열린 질문

각 질문에 추천안과 이유를 붙였다. 결정 전에 시작하는 이슈는 추천안을 기준으로 진행하고, 결정이 달라지면 해당 이슈만 고친다. 외부 정보 확인일은 2026-11-11이다.

### Q1. 업체: 유료 서울 VPS vs Oracle Cloud 무료 등급
- **추천:** 유료 서울 VPS, RAM 2GB
  - 예: AWS Lightsail 2GB 번들(메모리 2GB, 디스크 60GB, 공인 IPv4 포함)은 월 $12다([공식 번들 문서](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html) 기준).
  - 서울 리전 가격은 확인하지 못했다.
- **이유:**
  - Oracle 무료 등급은 7일 동안 사용률이 모두 기준 미만인 인스턴스를 유휴(idle)로 보고 회수할 수 있다. 기준은 CPU(95번째 백분위수(percentile)), 네트워크, 메모리(A1 셰이프만)다.
  - 기준치는 10%→15%→20%로 바뀌어 왔다. 공식 문서의 현재 수치는 확인하지 못했다([공식 문서](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm), [2026-02 정리 글](https://oracommit.blogspot.com/2026/02/understanding-oci-always-free-compute.html)).
  - 이 서비스는 평소 CPU를 거의 쓰지 않아서 회수 대상이 될 수 있다.
  - 서울 리전의 A1 자리 부족과 ARM 아키텍처 차이도 부담이다.
  - 유료 VPS는 매달 비용이 든다.
- **영향:** U1, 3-1

### Q2. 서버 사양: 2GB + 스왑 vs 4GB
- **추천:** 2GB + 스왑 2GB(기본안 유지). 1-5 측정으로 정했고, 3-1 서버 실측 뒤 확정한다.
- **이유:**
  - 1-5 측정(Windows 참고치, 4절 사실 7)에서 가장 큰 값은 `next build` 최대 1,989MB(캐시 없는 빌드)다. 나머지는 작다: 백엔드 기동 직후 WS 91MB(Private 422MB, 첫 요청 뒤 126MB), 지수 재계산 Peak 223MB(최대 커밋 926MB), `next start` 183MB.
  - 빌드 최대치는 정적 생성 워커 수에 따라 늘고, 워커 수는 CPU 수에 비례한다(측정 PC 논리 CPU 12개에서 10개). 그래서 vCPU가 적은 서버에서는 더 작을 수 있다(확실하지 않음).
  - 서버에서 빌드하는 동안 백엔드도 같이 돌아서 2GB에서는 빌드 때 스왑을 쓸 수 있다. 스왑은 비용 없이 메모리 부족 종료를 막는 안전장치다.
  - 캐치업 최대치는 재지 않았다. 3-1에서 `VmHWM`, 스왑 사용량, OOM 기록으로 확인한다.
- **영향:** U1, 2-2(서버 사양 절), 3-1

### Q3. 도메인 보유 여부
- **추천:** 새 도메인을 산다. 가격은 확인하지 못했다.
- **이유:**
  - Caddy 자동 HTTPS와 `NEXT_PUBLIC_SITE_URL`(canonical, sitemap, OG 이미지)에 고정 주소가 필요하다.
  - 나중에 주소를 바꾸면 다시 빌드해야 하고, 검색 색인도 처음부터 다시 쌓인다.
  - 임시로는 무료 DDNS 하위 도메인을 쓸 수 있다.
- **영향:** U2, 3-1

### Q4. 프로세스 관리: systemd vs Docker Compose
- **추천:** systemd
- **이유:**
  - Ubuntu에 기본으로 있고, 서비스 파일 두 개로 끝난다. 로그는 journald에 쌓인다.
  - 작업 디렉터리와 `data/` 경로를 그대로 쓸 수 있다.
  - Docker는 일이 늘어난다: 2GB 서버에서 이미지를 빌드하는 부담(특히 Next), 볼륨과 mtime 보존 설정, 하나 더 배워야 하는 도구.
- **영향:** 2-1, 2-2

### Q5. 프론트 위치: 같은 VM vs Vercel
- **추천:** 같은 VM
- **이유:**
  - 같은 주소라서 CORS 설정이 필요 없다. 관리할 곳도, 배포 순서도 하나다.
  - Vercel로 나누면 백엔드 주소(예: `api.<도메인>`)와 `CORS_ORIGINS` 설정이 더 필요하고, 배포할 곳이 두 곳이 된다.
  - Vercel 무료 플랜의 이용 조건은 확인하지 않았다.
  - 대신 Vercel을 쓰면 VM에서 빌드하는 메모리 부담이 없어진다.
- **영향:** 2-1, 2-2

### Q6. 백업 보관 위치
- **추천:** 서버 안에 매일 1개씩 7일치를 두고, 주 1회 로컬 PC로 `scp`해 받는다(수동).
- **이유:**
  - 비용이 들지 않는다.
  - 서버 안 백업은 파일 손상과 잘못된 배포에 대비하고, PC 사본은 서버를 잃는 경우에 대비한다. 사본이 며칠 오래돼도 빈 기간은 자동으로 채워진다.
  - 압축본 하나는 수십 MB로 예상한다(확실하지 않음, 2-3에서 측정).
  - 대안인 업체 스냅숏(snapshot)과 객체 저장소는 비용과 설정이 늘어난다.
- **영향:** 2-3, 3-2

### Q7. 가동 감시 서비스
- **추천:** UptimeRobot 무료 등급(모니터 50개, 5분 간격, [가격 페이지](https://uptimerobot.com/pricing/))으로 `/api/health`와 `/`의 HTTP 상태 코드를 감시한다.
  - 무료 등급의 상업적 이용 조건이 바뀌었다는 글들이 서로 엇갈리므로 가입 전에 약관을 확인한다([2026 정리 글](https://dev.to/r0tten0x/uptimerobot-free-plan-in-2026-the-limits-thatll-actually-bite-you-445g)).
- **이유:**
  - `/api/health`가 오래된 데이터를 503으로 알려 주므로 상태 코드만 보면 된다. 키워드 감시가 무료 등급에 포함되는지는 확실하지 않지만 필요 없다.
  - 대안: Better Stack, healthchecks.io(하트비트 방식이라 서버 쪽 설정이 더 필요)
- **영향:** U7, 2-3, 3-2

### Q8. CI(GitHub Actions) 포함 여부
- **추천:** 이번 범위에서 빼고, 배포가 끝난 뒤 따로 기획한다.
- **이유:**
  - 엔드포인트 테스트가 로컬 `out/`·`data/`를 읽고(4절 사실 6), `test_m4_env.py`는 git 상태를 본다.
  - CI에서 돌리려면 작은 테스트 데이터나 "데이터 필요" 표시(marker)를 먼저 설계해야 한다.
  - 그 전까지는 공통 검증(로컬 pytest·tsc·lint)이 기준이다.
- **영향:** 없음(12절 제안)

### Q9. 업데이트 중 화면 중단 허용
- **추천:** 허용한다. 웹 서비스를 멈추고 빌드하는 동안(1-5에서 잰 빌드 시간만큼, 로컬 5.8~31.0초, 서버 값은 3-1) 화면은 502가 되고 API는 계속 동작한다.
- **이유:**
  - 개인 프로젝트라 배포가 드물다.
  - `next start`가 쓰는 `.next`를 빌드가 다시 만들기 때문에, 멈추지 않으면 깨진 응답이 나갈 수 있다.
  - 무중단 업데이트(별도 폴더에 빌드한 뒤 교체)는 제안으로 둔다.
- **영향:** 2-2

### Q10. 위치정보법 확인(U6) 전 공개 방식
- **추천:** 확인이 끝나기 전에는 서버 `.env`에 키를 넣지 않고 공개한다. 확인이 끝나면 키를 넣고 백엔드만 재시작한다.
- **이유:**
  - 코드를 고치지 않아도 대피소 위젯이 숨겨져(4절 사실 7) 좌표 전송이 0이 된다. 나머지 배포·운영 확인(M3)은 그대로 진행할 수 있다.
  - 그 사이에는 같은 키를 쓰는 재외공관 연락처와 외교부 여행경보도 빠진다.
  - 주소를 알리지 않는다고 비공개가 되지는 않는다. 인증서 발급 기록(Certificate Transparency)에 도메인이 공개되고, `robots.txt`도 수집을 허용한다.
- **영향:** U4, U5, 3-1

### Q11. 서버 접근 로그(IP 포함)
- **추천:** uvicorn 접근 로그를 끄고(`--no-access-log`) Caddy 접근 로그도 켜지 않는다. 오류 로그와 갱신 로그는 journald에 남긴다.
- **이유:**
  - 감시는 외부 서비스가, 오류 조사는 오류 로그가 맡으므로 접근 로그 없이도 운영할 수 있다.
  - IP와 경로를 남기지 않으면 보관 기간과 고지 부담(U6)이 줄어든다.
  - 좌표 필터(`_NoShelterQueryLog`)가 실수로 빠져도 안전하다.
  - 대안: 접근 로그를 켜 두고 journald 보관 기간을 30일로 제한한다.
- **영향:** 2-1, 2-2

### Q12. 전이 의존성 고정: 서버 `pip freeze`로 만든 constraints 파일 vs 직접 의존성만 고정
M9 리뷰에서 나온 제안이다(#42 코멘트 2026-11-11, 이 질문은 2026-11-12에 추가).
- **추천:** constraints 파일을 쓴다. 3-1에서 서버 설치·기동 확인이 끝나면 `pip freeze` 결과를 `backend/constraints.txt`로 커밋하고, 이후 설치는 `pip install -r backend/requirements.txt -c backend/constraints.txt`로 한다.
- **이유:**
  - `backend/requirements.txt`는 직접 의존성 6개만 고정한다(1-4). fastapi 0.162.0은 `starlette>=0.46.0`처럼 상한이 없는 의존성을 가져서, 몇 달 뒤 다시 설치하면(서버를 잃었을 때 등) 로컬에서 검증하지 않은 버전이 깔릴 수 있다. 1-4의 새 venv 확인에서도 전이 의존성 2개(annotated-doc, click)가 개발 venv와 달랐다.
  - pip 기본 기능이라 새 도구가 필요 없다(10절의 잠금 파일 제외 이유에 해당하지 않음). 1-4 테스트는 두 requirements 파일만 읽어서 충돌하지 않는다.
  - 비용: requirements를 바꿀 때마다 서버(Linux)에서 constraints를 다시 만들어야 한다. Windows에서 만들면 Linux에서만 깔리는 uvloop가 빠져 고정되지 않는다.
  - 대안: 지금처럼 직접 의존성만 고정하고, 다시 설치할 때마다 `pip freeze` 결과를 PR에 남겨 비교한다.
- **영향:** 3-1, 2-2(설치·업데이트 명령), 10절

## 12. 제안 (범위 밖 아이디어)

1. **append 수집 파일 보강:** 파일 하나 분량을 한 번에 붙인다. 시작할 때 마지막 줄이 줄바꿈으로 끝나지 않으면 잘라 낸다(`gdelt_collect`, `country_collect`, `live.backfill`).
2. **쓰기 방식 통일:** 기존 임시 파일→교체 4곳(`live`, `shelters`, `embassies`, `travel_advisory`)을 1-1 공용 함수로 바꾼다.
3. **CI:** 데이터 없이 도는 테스트만 모아서 돌린다. 데이터가 필요한 테스트에는 표시(marker)를 붙인다.
4. **무중단 업데이트:** 다른 `distDir`에 빌드한 뒤 바꿔 끼운다.
5. **UCDP 실패 분리:** `ucdp.update()` 실패를 여행경보처럼 따로 잡아서 일별 재계산이 계속 돌게 한다(완료, PR #45).
6. **데이터 갱신 지연 안내:** 헬스 상태를 써서 화면에 지연을 알린다. 새 기능이라 별도 기획이 필요하다.
7. **보안 강화:** 요청 수 제한, HSTS, systemd `NoNewPrivileges`·`ProtectSystem`, fail2ban
8. **백업·의존성:** 서버 밖 자동 백업(객체 저장소), 전이 의존성 잠금 파일(pip-tools·uv). constraints 파일 방식은 Q12
9. **다운로드 전체 시간 상한:** 지금 타임아웃은 소켓 연산 단위라 DNS 조회와 조금씩 계속 보내는 서버에는 상한이 없다(1-2, M9 리뷰). 청크 단위로 읽으면서 마감 시각을 검사한다.
10. **pandas 4 대비:** pandas 4에서 없어질 `Timestamp.utcnow`(런타임)와 xlrd 엔진(백테스트)을 정리한다. 지금 고정 버전에서는 경고만 나고 동작한다(M9 리뷰).
11. **결과 폴더 자동 생성:** `atomic_write.write`에 `path.parent.mkdir(parents=True, exist_ok=True)`를 넣는다(새 서버 첫 기동 방어). 지금은 `out/` 없이 처음 띄우면 지수 쓰기가 실패해 매 주기 `갱신 실패: _daily_refresh`가 난다(기존 동작, M9 문서 리뷰).
