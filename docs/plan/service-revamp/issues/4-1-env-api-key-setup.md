# 공공데이터 API 키 `.env` 설정 기반

## 배경

M4의 공공데이터포털 API는 serviceKey가 필요하다. 저장소에는 아직 `.env` 파일·예시 파일·로딩 방법이 없다. 키를 코드에 넣지 않고 `.env`로 받으며, 키가 없을 때는 해당 기능만 꺼지게 하는 공통 기반을 먼저 만든다.

확인한 사실(2026-11-09):
- `.gitignore`에 `.env`, `.env.*`가 있어 `.env.example`도 무시된다. 예외 규칙이 필요하다.
- `.venv`에 `python-dotenv`가 이미 설치되어 있다(`uvicorn[standard]`의 의존성). `uvicorn --env-file .env`를 쓰면 새 라이브러리 추가가 필요 없다.
- 실행 설정: `.claude/launch.json`의 backend 항목, `backend/app/main.py` docstring.

## 범위

- 포함: `.env.example`, `.gitignore` 예외, 실행 명령에 `--env-file`, 키 이름 상수
- 제외: 실제 API 호출(4-2~4-5), 배포 환경의 비밀값 관리

## 할 일

1. 루트에 `.env.example`을 만든다. 값은 비우고 한국어 주석으로 발급처를 적는다.
   - `DATA_GO_KR_SERVICE_KEY=` (공공데이터포털 일반 인증키. API별로 키가 다르면 4-2~4-5에서 이름을 나눈다)
2. `.gitignore`에 `!.env.example`을 추가한다.
3. `.claude/launch.json` backend `runtimeArgs`와 `main.py` docstring의 실행 명령에 `--env-file .env`를 추가한다. `.env`가 없을 때 uvicorn이 기동에 실패하면, 대신 `main.py`에서 `.env`가 있을 때만 `dotenv.load_dotenv()`를 호출하는 방식으로 바꾼다(동작 확인 후 택일, PR에 기록).
4. 키 이름을 `backend/app/main.py`(또는 공용 위치)에 상수로 둔다. 키가 없으면 `log.warning` 1회만 남기고 계속 기동한다.

## 인수 조건

- [ ] `git status`에서 `.env.example`은 추적 대상으로 보이고 `.env`는 보이지 않는다.
- [ ] `.env.example`의 모든 값이 빈 문자열이다(실제 키 0건).
- [ ] 저장소 전체 grep에서 serviceKey 실제 값(32자 이상 영숫자·`%` 인코딩 문자열) 패턴이 0건이다.
- [ ] `.env` 없이 백엔드를 기동하면 정상 기동되고, 키 없음 경고가 1회만 출력되며 Traceback 0건이다.
- [ ] `.env`에 임의 값(`DATA_GO_KR_SERVICE_KEY=dummy`)을 넣고 기동하면 `os.getenv("DATA_GO_KR_SERVICE_KEY")`가 `dummy`로 읽힌다(임시 로그 또는 `python -c`로 확인, PR에 방법 기록).
- [ ] 기존 엔드포인트(`/api/pairs`, `/api/countries`, `/api/live`)가 두 경우 모두 200을 반환한다.
- [ ] `.\.venv\Scripts\python -m compileall -q backend` 오류 0건이다.
- [ ] 브라우저(`http://localhost:3000`)에서 홈 화면이 변경 전과 같게 표시되고 콘솔 오류 0건이다.

## 영향 파일

- `.env.example` (신규)
- `.gitignore`
- `.claude/launch.json`
- `backend/app/main.py`

## 관련 시안

없음

## 선행 이슈

없음

## 라벨

`enhancement`, `documentation`
