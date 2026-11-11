# GDELT·UCDP 다운로드 타임아웃

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

- **포함:** 다운로드 두 곳, 타임아웃 상수, 테스트
- **제외:**
  - 재시도 정책 변경
  - `ucdp.update()` 실패가 일별 재계산을 막는 기존 동작(`plan.md` 12절 제안)
  - 전역 `socket.setdefaulttimeout`. uvicorn이 쓰는 소켓에도 영향을 줄 수 있어 쓰지 않는다(확실하지 않음).

## 할 일

1. **`gdelt_collect.load_events`:** `urllib.request.urlopen(url, timeout=DOWNLOAD_TIMEOUT_SECONDS)`로 받아 `tmp`에 쓴다(`shutil.copyfileobj`).
   - 상수는 `gdelt_collect.py`에 둔다. 값은 120초를 제안한다.
   - 연결과 읽기가 각각 이 시간 동안 데이터 없이 멈추면 실패한다. 전체 다운로드 시간의 상한은 아니다.
2. **`ucdp.update`:** 같은 방식으로 바꾸고, 기존 `TIMEOUT_SECONDS`(60)를 쓴다.
3. **실패 시 동작은 지금과 같다.**
   - `load_events`는 `finally`에서 임시 파일을 지우고 예외를 올린다.
   - `live.update`는 다음 주기에 다시 시도한다.
   - `country_collect`는 `[실패]`를 출력하고 다음 실행에서 다시 시도한다.
   - `ucdp`가 남긴 `.part`는 다음 실행에서 덮어쓴다.
4. **테스트:** `tests/test_deploy_download_timeout.py`(이름은 제안)
   - **응답 없는 서버:** 테스트 안에서 로컬 소켓 서버를 띄운다. 연결은 받지만 아무것도 보내지 않는다. 타임아웃 상수를 1초로 바꾸고 두 다운로드를 호출한다.
   - **타임아웃 인자:** 가짜 `urlopen`으로 `timeout` 인자가 상수 값으로 넘어가는지 확인한다.
   - **정상 응답:** 작은 테스트 zip을 주고 결과 표를 확인한다.

## 인수 조건

### 로컬에서 확인

- [ ] 저장소 루트의 `*.py`와 `backend/`에서 `urlretrieve`를 grep한 결과가 0건이다. [테스트]
- [ ] 응답을 보내지 않는 로컬 서버를 상대로 `gdelt_collect.load_events`가 5초 안에 예외로 끝나고, 임시 zip 파일이 남지 않는다. 테스트용 타임아웃은 1초다. [테스트]
- [ ] 같은 조건에서 `ucdp.update`의 다운로드도 5초 안에 예외로 끝난다. [테스트]
- [ ] 두 다운로드가 `urlopen`에 각 모듈의 타임아웃 상수를 넘긴다. [테스트]
- [ ] 정상 응답(테스트 zip)에서 `load_events`가 바꾸기 전과 같은 표를 돌려준다. 열은 6개이고 행 수도 같다. [테스트]
- [ ] 백엔드를 멈춘 상태에서 `.venv\Scripts\python.exe live.py`가 오류 없이 `새 슬롯 N개`를 출력한다. 실제 GDELT를 호출하는 확인이다. [명령]
- [ ] `.venv\Scripts\python.exe -m pytest tests`가 전부 통과한다. [테스트]

### 서버에서 확인(M3)

- 없음. 3-1·3-2의 `/api/health` 확인에 포함된다.

## 영향 파일

- `gdelt_collect.py`, `ucdp.py`
- `tests/test_deploy_download_timeout.py`(신규, 이름은 제안)

## 관련 시안

없음(`plan.md` 4절 사실 2)

## 선행 이슈

1-1. 둘 다 `ucdp.py`를 고치므로 1-1을 먼저 머지한다.

## 라벨

`bug`
