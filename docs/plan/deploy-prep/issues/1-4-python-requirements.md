# Python 런타임 의존성 고정과 백테스트·테스트 의존성 분리

## 배경

서버에서는 `pip install -r backend/requirements.txt`로 로컬과 같은 버전이 깔려야 한다. 지금 목록은 첫 커밋(`a99a880`)부터 있지만 그대로 쓰기 어렵다.

- **버전 미고정:** pandas, numpy, matplotlib, xlrd. 서버에 설치하는 날 나온 최신 버전이 깔린다. 확인된 고정 패키지는 fastapi 0.162.0, uvicorn[standard] 0.54.0, python-dotenv 1.2.4, pycountry 26.2.16이다.
- **백테스트 전용 패키지가 런타임 목록에 있다:** matplotlib, xlrd
  - xlrd는 `gpr_backtest.py:33`(`read_excel`)에서만 쓴다.
- **matplotlib은 지금 구조에서 실제로 런타임에 불린다.**
  - `gpr_backtest.py:10`이 모듈 맨 위에서 `matplotlib.pyplot`을 불러온다.
  - 다음 모듈이 `gpr_backtest`에서 상수를 가져온다: `blend.py:14`, `index_v1.py:10`, `live.py:22`, `build_index.py:9`, `build_country_index.py:14`, `gdelt_collect.py:14`.
  - 그래서 목록에서 빼기만 하면 백엔드가 `ImportError`로 뜨지 않는다.
- **테스트 의존성은 이미 나뉘어 있다:** `requirements-dev.txt`의 pytest 9.2.0, httpx 0.28.1(`TestClient`용)
- **로컬 venv 버전(메인 세션 `pip freeze`):** pandas 3.1.1, numpy 2.5.4, matplotlib 3.11.2, xlrd 2.0.2, Python 3.12.10. 구현할 때 다시 확인한다.

## 범위

- **포함:** 두 requirements 파일, `gpr_backtest.py`의 import 위치, 테스트, 새 venv 확인
- **제외:**
  - 전이 의존성까지 고정하는 잠금 파일(새 도구 필요, `plan.md` 10절)
  - `gdelt_backtest.py`·`gdelt_weekly.py`. 런타임에서 import하지 않아서 그대로 둔다.
  - 패키지 업그레이드

## 할 일

1. **`backend/requirements.txt`:** 런타임 의존성만 두고 모두 `==`로 고정한다(로컬 `.venv` 버전).
   - 대상: fastapi, uvicorn[standard], python-dotenv, pandas, numpy, pycountry
   - 맨 위 주석에 Python 3.12를 적는다(로컬 3.12.10에서 확인).
2. **`backend/requirements-dev.txt`:** `-r requirements.txt`에 다음을 `==`로 고정해서 더한다. 각각 주석으로 용도를 적는다.
   - 테스트: pytest, httpx
   - 백테스트: matplotlib, xlrd
3. **`gpr_backtest.py`:** `import matplotlib.pyplot as plt`를 그림을 그리는 `main()` 안으로 옮긴다. 다른 동작은 바꾸지 않는다.
4. **테스트:** `tests/test_deploy_requirements.py`(이름은 제안)
   - 두 파일의 모든 패키지 줄이 `이름[extras]==버전` 형식이고, 버전이 현재 venv의 `importlib.metadata.version()`과 같다.
   - 런타임 목록에 matplotlib, xlrd, pytest, httpx가 없다.
   - 별도 파이썬 프로세스(`LIVE_UPDATES=0`)에서 `import backend.app.main`을 한 뒤 `sys.modules`에 `matplotlib`이 없다.
5. **새 venv 확인:** 저장소 밖 임시 폴더에서 한다.
   1. `py -3.12 -m venv "$env:TEMP\wri-runtime"`
   2. `& "$env:TEMP\wri-runtime\Scripts\python.exe" -m pip install -r backend\requirements.txt`
   3. 저장소 루트에서 `$env:LIVE_UPDATES='0'` 상태로 uvicorn을 포트 8001에 띄운다. 개발 백엔드 8000과 겹치지 않게 하려는 포트다.
   4. 주요 엔드포인트를 확인한다.
   5. 확인이 끝나면 임시 venv를 지운다. 지우기 전에 대상 경로를 보여 준다.

## 인수 조건

### 로컬에서 확인

- [ ] `backend/requirements.txt`의 패키지 줄이 모두 `==`로 고정돼 있고, 현재 `.venv`에 설치된 버전과 같다. [테스트]
- [ ] `backend/requirements.txt`에는 matplotlib, xlrd, pytest, httpx가 없고, `backend/requirements-dev.txt`에는 네 개가 모두 있다. [테스트]
- [ ] `LIVE_UPDATES=0`인 별도 프로세스에서 `import backend.app.main`을 한 뒤 `sys.modules`에 `matplotlib`이 없다. [테스트]
- [ ] 런타임 목록만 설치한 새 venv(Python 3.12)로 백엔드를 띄우면 `/api/pairs`, `/api/countries`, `/api/live`, `/api/blend`가 모두 200이다. PR에 설치 결과 요약과 응답 코드를 적는다. [명령]
- [ ] `.venv`(dev 포함)에서 `.venv\Scripts\python.exe gpr_backtest.py`가 오류 없이 끝나고, `out/gpr_backtest.png`의 수정 시각이 실행 시각으로 바뀐다. [명령]
- [ ] `.venv\Scripts\python.exe -m pytest tests`가 전부 통과한다. [테스트]

### 서버에서 확인(M3)

- 3-1: Ubuntu 24.04의 Python 3.12 venv에서 `pip install -r backend/requirements.txt`가 오류 없이 끝나고 백엔드 서비스가 뜬다.

## 영향 파일

- `backend/requirements.txt`, `backend/requirements-dev.txt`
- `gpr_backtest.py`
- `tests/test_deploy_requirements.py`(신규, 이름은 제안)

## 관련 시안

없음(`plan.md` 4절 사실 4)

## 선행 이슈

없음

## 라벨

`enhancement`
