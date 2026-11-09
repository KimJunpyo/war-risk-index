# 뉴스룸 위협 신호 백엔드·수집 스크립트 제거

## 배경

1-1에서 화면 사용처를 지운 뒤, 백엔드의 `/api/threat`, 1시간 주기 뉴스룸 수집(`_threat_refresh`), 관련 스크립트와 설정 파일을 지운다. 이 수집은 백엔드가 떠 있는 동안 매시간 외부 RSS 수십 개를 호출하고 `data/newsroom/`에 기사를 쌓는다.

## 범위

- 포함: `backend/app/main.py`의 위협 관련 코드, 루트 스크립트 `ai_threat.py`·`newsroom.py`·`threat_lexicon.py`, 설정 `newsroom.json`
- 확인 후 결정: `case_articles.py`(plan.md Q2), 로컬 데이터(Q3)
- 제외: 촉매 신호(`군사력 위협`·`최후통첩`·`무력 시위`, `gdelt_collect.py`·`country_collect.py`·`case_backtest.py`). 이름에 "위협"이 들어가지만 GDELT 기반 별개 기능이다.

## 할 일

1. 삭제 대상 목록을 PR 설명에 먼저 적고 사용자 확인을 받는다.
   - 삭제(git 추적): `ai_threat.py`, `newsroom.py`, `threat_lexicon.py`(`ai_threat.py`에서만 import), `newsroom.json`
   - 삭제 여부 확인(git 추적): `case_articles.py` — `ai_threat.py cases`의 입력(`data/case_articles/articles.jsonl`)만 만든다
   - `backend/app/main.py` 수정
     - 20행 `import ai_threat`, 28행 `import newsroom`
     - 40~41행 `THREAT_FILE`, `THREAT_REFRESH_SECONDS`
     - 130~135행 `_threat_refresh()`
     - 140행 `for job in (live.update, _daily_refresh, _threat_refresh)`에서 `_threat_refresh` 제거
     - 333~339행 `@app.get("/api/threat")` 엔드포인트
     - 7행 `import json`(위 엔드포인트에서만 사용, 제거 후 미사용)
   - 로컬 데이터(git 제외, 코드 PR과 별개): `data/newsroom/`, `data/ai_threat/`, `data/case_articles/`, `out/ai_threat_cases.csv`, `data/case_*.log`
2. 1의 코드 변경을 적용한다. 로컬 데이터는 목록만 PR에 적고 사용자가 직접 지운다.
3. 모듈 docstring(`main.py` 1~5행)에 뉴스룸 언급이 없음을 확인한다(현재 없음).
4. (Q4 결정 시) `FORMULA_v1.md` "알려진 한계" 근처에 "뉴스룸 키워드 신호는 AUC 0.23으로 제외" 한 줄을 남긴다.

## 인수 조건

- [ ] PR 설명에 삭제 대상 파일 목록(git 추적 파일, `main.py` 수정 행, 로컬 데이터 경로)이 있고, 사용자가 확인한 뒤 병합된다.
- [ ] PowerShell에서 `curl.exe -s -o NUL -w "%{http_code}" http://localhost:8000/api/threat` 결과가 `404`다.
- [ ] 저장소 전체(`node_modules`·`.venv`·`.git`·`data`·`out`·`__pycache__` 제외)에서 `newsroom|ai_threat|threat_lexicon|_threat_refresh|THREAT_FILE` grep 결과 0건이다.
- [ ] 백엔드를 `LIVE_UPDATES=1`로 1시간 10분 이상 띄워도 `data/newsroom/`, `data/ai_threat/` 아래 파일의 수정 시각이 바뀌지 않는다(폴더를 지웠다면 다시 생기지 않는다).
- [ ] 같은 실행에서 15분 실시간 갱신(`live.update`)은 계속 동작한다: `GET /api/live`의 `as_of`가 30분 안에 1회 이상 바뀐다.
- [ ] `/api/pairs`, `/api/countries`, `/api/countries/KOR/index`, `/api/countries/KOR/catalysts`, `/api/blend`, `/api/live`가 모두 200을 반환한다.
- [ ] `.\.venv\Scripts\python -m compileall -q backend` 오류 0건, `uvicorn backend.app.main:app` 기동 후 30초 동안 Traceback 0건이다.
- [ ] 브라우저(`http://localhost:3000`)에서 홈 화면 전체가 1-1 완료 시점과 같게 표시되고 콘솔 오류 0건이다.

## 영향 파일

- 삭제: `ai_threat.py`, `newsroom.py`, `threat_lexicon.py`, `newsroom.json`, (Q2 결정 시) `case_articles.py`
- 수정: `backend/app/main.py`, (Q4 결정 시) `FORMULA_v1.md`
- 로컬 데이터(참고): `data/newsroom/`, `data/ai_threat/`, `data/case_articles/`, `out/ai_threat_cases.csv`

## 관련 시안

없음

## 선행 이슈

1-1

## 라벨

`enhancement`
