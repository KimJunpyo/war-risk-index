# GDELT·UCDP 다운로드 타임아웃

인용 줄 번호는 `466b1a9`(M9 시작 전 main) 기준이다.

## 배경

**다운로드 두 곳에 타임아웃이 없다**
- `gdelt_collect.py:89`(`load_events`)와 `ucdp.py:121`(`update`)는 `urllib.request.urlretrieve`로 파일을 받는다.
- 이 함수에는 타임아웃 인자가 없고, 저장소 어디에도 `socket.setdefaulttimeout`이 없다.

**영향 범위:** `load_events`는 다음 세 곳이 모두 쓴다.
- 15분 실시간 갱신: `live.fetch_slot`
- 2.0 일별 백필: `live.day_rows`
- 1.0 일별 수집: `gdelt_collect`, `country_collect`

**일어나는 일**
- 상대 서버가 연결을 끊지 않은 채 응답만 멈추면 갱신 스레드(`backend/app/main.py:188`)가 영원히 멈춘다.
- 프로세스는 살아 있으므로 systemd도 재시작하지 않는다. 15분 데이터와 일별 지수가 함께 멈춘다.

**다른 호출은 이미 타임아웃이 있다:** `live.py:50`(30초), `main.py:151`(30초), `backend/app/news.py`, `data_go_kr.py`, `travel_advisory.py`.

헬스 체크(1-3)로 멈춤을 알아챌 수는 있지만, 사람이 재시작해야 한다. 타임아웃을 넣으면 다음 주기에 스스로 회복한다.

## 범위

- **포함:**
  - 다운로드 두 곳, 타임아웃 상수, 테스트
  - `ucdp.update()` 실패 격리(할 일 5). 처음에는 제외(`plan.md` 12절 제안 5)였지만, M9 최종 리뷰 뒤 사용자 결정으로 M9에 포함했다(PR #45).
- **제외:**
  - 재시도 정책 변경
  - 다운로드 전체 시간의 상한(`plan.md` 12절 제안 9)
  - 전역 `socket.setdefaulttimeout`. uvicorn이 쓰는 소켓에도 영향을 줄 수 있어 쓰지 않는다(확실하지 않음).

## 할 일

1. **`gdelt_collect.load_events`:** `urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT_SECONDS)`로 받아 `tmp`에 쓴다(`shutil.copyfileobj`).
   - 상수는 `gdelt_collect.py`에 둔다. 값은 120초를 제안한다.
   - 연결과 읽기가 각각 이 시간 동안 데이터 없이 멈추면 실패한다. 전체 다운로드 시간의 상한은 아니다.
   - 알려진 한계(M9 리뷰): 타임아웃이 소켓 연산 단위라 DNS 조회와, 조금씩 계속 보내는 서버에는 전체 시간 상한이 없다. 이런 멈춤은 헬스 체크(1-3)로 감지한다. 본문 중간 정지와 HTTPS 핸드셰이크 정지는 리뷰어가 1초 상수로 끊기는 것을 확인했다.
2. **`ucdp.update`:** 같은 방식으로 바꾸고, 기존 `TIMEOUT_SECONDS`(60)를 쓴다.
3. **실패 시 동작은 지금과 같다.**
   - `load_events`는 `finally`에서 임시 파일을 지우고 예외를 올린다.
   - `live.update`는 다음 주기에 다시 시도한다.
   - `country_collect`는 `[실패]`를 출력하고 다음 실행에서 다시 시도한다.
   - `ucdp`가 남긴 `.part`는 다음 실행에서 덮어쓴다.
   - **잘린 응답(구현 중 추가):** Content-Length보다 덜 받고 연결이 닫히면 예전 `urlretrieve`는 `ContentTooShortError`를 냈지만, `urlopen` + `copyfileobj`는 예외 없이 잘린 파일을 남긴다. 그래서 모듈별로 실패시킨다.
     - `ucdp`: 받은 바이트를 Content-Length와 비교해 모자라면 `urllib.error.ContentTooShortError`를 내고 최종 파일로 교체하지 않는다. 교체해 버리면 다음 실행부터 받은 것으로 보고 다시 받지 않기 때문이다. Content-Length가 없으면 비교하지 않는다(`urlretrieve`와 같음).
     - `gdelt_collect`: 크기를 검사하지 않는다. 잘린 zip은 `read_csv`가 `zipfile.BadZipFile`로 실패하고 `finally`가 임시 zip을 지운다. 호출부가 모두 예외를 받아 다음에 다시 시도하므로 동작은 같다. 검사하지 않는 이유는 코드 주석으로 남겼다.
4. **테스트:** `tests/test_deploy_download_timeout.py`(이름은 제안)
   - **응답 없는 서버:** 테스트 안에서 로컬 소켓 서버를 띄운다. 연결은 받지만 아무것도 보내지 않는다. 타임아웃 상수를 1초로 바꾸고 두 다운로드를 호출한다.
   - **타임아웃 인자:** 가짜 `urlopen`으로 `timeout` 인자가 상수 값으로 넘어가는지 확인한다.
   - **정상 응답:** 작은 테스트 zip을 주고 결과 표를 확인한다.
   - **잘린 응답(테스트 2개 추가):** 테스트 서버가 Content-Length는 전체 길이로 알리고 일부만 보낸 뒤 연결을 닫는다. 두 테스트는 Python 3.12 `http.client`의 동작(잘린 본문에서 예외 대신 빈 바이트를 돌려줌)을 전제로 한다. Python을 올릴 때 먼저 확인한다.
5. **UCDP 실패 격리(M9 최종 리뷰 뒤 사용자 결정으로 추가, PR #45)**
   - 문제: `backend/app/main.py`의 `_daily_refresh`는 새 일별 파일이 나오면 다섯 단계를 차례로 부른다: `ucdp.update()` → `gdelt_collect.main()` → `country_collect.main()` → `build_index.main()` → `build_country_index.main()`. 여행경보·대피소·재외공관 갱신은 실패를 따로 잡지만, 외부 사이트에 기대는 맨 앞의 `ucdp.update()`는 잡지 않는다. 그래서 ucdp.uu.se가 막히면 GDELT가 정상이어도 뒤의 수집·지수 재계산이 15분마다 함께 건너뛰어지고, 며칠 뒤 헬스 체크가 지수 날짜 기준(3일)으로 503이 된다.
   - `ucdp.update()`만 `try`/`except Exception`으로 감싸고 `log.exception`으로 남긴다(여행경보 등 다른 갱신 실패와 같은 방식). 실패해도 기존 UCDP 집계로 GDELT 수집(`gdelt_collect.main()`, `country_collect.main()`)과 지수 재계산(`build_index.main()`, `build_country_index.main()`)을 지금 순서대로 계속한다.
   - 다섯 단계의 순서와 나머지 네 단계의 실패 처리는 바꾸지 않는다. `ucdp.update()`는 지금처럼 새 일별 파일이 있을 때만 부른다. 블록 밖으로 옮기면 15분마다 ucdp.uu.se에 접속한다.
   - 결과: UCDP 실패는 헬스 체크에 드러나지 않고 로그(journald)에만 남는다. UCDP 원본은 월 1회 갱신되므로 며칠 실패해도 기존 집계로 계속 돈다. 단 새 원본을 받은 뒤 집계가 실패하면 다음 UCDP 버전까지 다시 집계하지 않는다(`ucdp.py`, 기존 동작). 몇 달 막히면 UCDP 기반 상태가 옛 기준일에 멈추므로 `.asof`를 월 1회 확인한다(2-3).

## 인수 조건

### 로컬에서 확인

- [x] 저장소 루트의 `*.py`와 `backend/`에서 `urlretrieve`를 grep한 결과가 0건이다. [테스트]
- [x] 응답을 보내지 않는 로컬 서버를 상대로 `gdelt_collect.load_events`가 5초 안에 예외로 끝나고, 임시 zip 파일이 남지 않는다. 테스트용 타임아웃은 1초다. [테스트]
- [x] 같은 조건에서 `ucdp.update`의 다운로드도 5초 안에 예외로 끝난다. [테스트]
- [x] 두 다운로드가 `urlopen`에 각 모듈의 타임아웃 상수를 넘긴다. [테스트]
- [x] 정상 응답(테스트 zip)에서 `load_events`가 바꾸기 전과 같은 표를 돌려준다. 열은 6개이고 행 수도 같다. [테스트]
- [x] (구현 중 추가) 잘린 응답에서 `load_events`는 예외(`BadZipFile`)로 끝나고 임시 zip이 남지 않는다. `ucdp.update`는 `ContentTooShortError`로 끝나고 최종 파일을 만들지 않으며, 다음 실행이 정상 응답을 받으면 최종 파일이 생기고 `.part`는 남지 않는다. [테스트]
- [x] 백엔드를 멈춘 상태에서 `.venv\Scripts\python.exe live.py`가 오류 없이 `새 슬롯 N개`를 출력한다. 실제 GDELT를 호출하는 확인이다. [명령]
- [x] `.venv\Scripts\python.exe -m pytest tests`가 전부 통과한다. [테스트]

### 로컬에서 확인: UCDP 실패 격리(M9 최종 리뷰 뒤 추가)

- [x] `ucdp.update()`가 예외를 내도 `_daily_refresh`는 예외 없이 끝나고, `gdelt_collect.main()` → `country_collect.main()` → `build_index.main()` → `build_country_index.main()`이 이 순서로 한 번씩 불린다. 사이트 막힘(`URLError`)과 그 밖의 실패(`ValueError`) 두 경우 모두 그렇다. [테스트]
- [x] 그때 `war-risk` 로거에 `log.exception`으로 남긴 ERROR 기록이 한 건 있고, 그 기록에 UCDP가 낸 예외가 들어 있다. [테스트]
- [x] UCDP가 정상이면 다섯 단계가 지금 순서대로 한 번씩 불리고, 새 일별 파일이 없으면 UCDP를 포함해 하나도 불리지 않는다. [테스트]
- [x] 나머지 네 단계의 실패는 지금처럼 `_daily_refresh` 밖으로 올라가고, 실패한 단계 뒤의 단계는 불리지 않는다. [테스트]
- [x] 격리를 넣은 뒤 `.venv\Scripts\python.exe -m pytest tests`가 전부 통과한다. [테스트]

### 서버에서 확인(M3)

- 3-1·3-2: 타임아웃 동작은 `/api/health` 확인에 포함된다.
- 3-1: 타임아웃 뒤 실제 UCDP 다운로드는 아직 돌려 보지 않았다. 한 번 실행해 60초 읽기 한도로 충분한지 본다(M9 리뷰 제안, 3-1 할 일).

## 영향 파일

- `gdelt_collect.py`, `ucdp.py`
- `tests/test_deploy_download_timeout.py`(신규, 이름은 제안)
- UCDP 실패 격리: `backend/app/main.py`(`_daily_refresh`), `tests/test_deploy_daily_refresh.py`(신규)

## 관련 시안

없음(`plan.md` 4절 사실 2)

## 선행 이슈

1-1. 둘 다 `ucdp.py`를 고치므로 1-1을 먼저 머지한다.

## 라벨

`bug`
