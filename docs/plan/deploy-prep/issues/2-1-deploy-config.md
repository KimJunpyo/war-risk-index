# 배포 설정 파일: Caddy·systemd·환경변수 예시

## 배경

서버에서는 세 프로그램을 항상 켜 두고, 재부팅하거나 비정상 종료되면 다시 띄워야 한다: Caddy, uvicorn, `next start`. 설정 파일에 반영할 제약은 다음과 같다(`plan.md` 3절·5절).

- **작업 디렉터리는 저장소 루트:** 수집 모듈이 `Path("data/...")` 상대 경로를 쓴다.
- **워커는 1개:** 워커마다 갱신 스레드가 떠서 같은 CSV를 동시에 쓰기 때문이다. 원자적 쓰기(1-1)의 임시 파일 이름도 `<파일>.part`로 고정이라 작성자 1명을 전제한다.
- **폴더 쓰기 권한(M9 리뷰):** 원자적 쓰기(1-1)와 기존 임시 파일→교체 4곳은 같은 폴더에 임시 파일(`<파일>.part`, `.tmp`)을 만든 뒤 교체한다. 그래서 `User=warrisk`는 파일뿐 아니라 `data/`·`out/` 폴더(하위 폴더 포함) 자체에 쓰기 권한이 있어야 한다. 권한 설정과 확인은 런북(2-2·2-3)이 맡는다.
- **`/api/health`는 외부 감시 전용(M9 리뷰):** 데이터가 오래되면 일부러 503을 준다(1-3). Caddy 업스트림 헬스 체크(능동 `health_uri`, 수동 `unhealthy_status` 등)에 쓰면, 데이터만 멈춰도 Caddy가 하나뿐인 백엔드를 비정상으로 보고 정상 파일로 응답하던 `/api/pairs`·`/api/countries`까지 막는다.
- **이벤트 루프(M9 리뷰):** `uvicorn[standard]`는 Linux에서 버전을 고정하지 않은 uvloop를 함께 설치하고, 기본값(`--loop auto`)이면 그것을 쓴다(1-4). 로컬 개발·테스트는 asyncio 루프다.
- **종료(M9 리뷰):** 갱신 스레드는 daemon 스레드라 종료가 기다리지 않는다. 다운로드·재계산 중에 멈추면 그 작업이 끊기고 `<파일>.part`가 남을 수 있지만, 결과 파일은 원자적 쓰기(1-1)라 잘리지 않고 다음 실행이 덮어쓴다. append 파일 3곳의 한계는 `plan.md` 10절 그대로다.
  - 단, 캐치업 때 수집(`gdelt_collect`·`country_collect`)이 쓰는 스레드 풀은 보통의 파이썬 종료라면 남은 작업을 다 처리할 때까지 기다린다. 서비스 종료에서는 uvicorn이 정리를 마친 뒤 받은 SIGTERM을 기본 처리로 다시 일으켜 프로세스가 바로 끝나므로 기다리지 않는다(uvicorn 0.54의 `Server.capture_signals` 코드와 Windows 스크래치 실험 기준, 서버 실측은 3-1).
- **비밀값은 서비스 파일에 넣지 않는다:** `backend/app/main.py`가 시작할 때 루트 `.env`를 읽는다.
- **좌표 쿼리를 로그에 남기지 않는다:**
  - Caddy 접근 로그는 켜지 않는다.
  - uvicorn 접근 로그도 끈다. Q11 추천안이다.
- **바인딩:** 백엔드와 프론트는 `127.0.0.1`에만 바인딩하고, 밖에는 Caddy만 노출한다.
- **프론트 빌드 값:**
  - `NEXT_PUBLIC_*`는 빌드 전에 정해야 한다.
  - `frontend/.gitignore`의 `.env*` 규칙 때문에 예시 파일은 `deploy/`에 둔다.
- **`.env.example` 제약:** 모든 항목 값이 비어 있어야 한다(`test_m4_env.py::test_env_example_exists_with_empty_values`).

## 범위

- **포함:** `deploy/`의 Caddy 설정, 서비스 파일 2개, 프론트 빌드 환경변수 예시, 루트 `.env.example` 주석, 정적 검사 테스트
- **제외:**
  - 백업 스크립트(2-3), 런북(2-2·2-3), 서버에서 실행·검증(3-1)
  - systemd 보안 옵션 강화, HSTS, 요청 수 제한(`plan.md` 12절 제안)
  - Docker(Q4)

## 할 일

1. **`deploy/Caddyfile`**
   - 사이트 주소는 `{$SITE_DOMAIN}`로 환경변수에서 받는다. 도메인을 하드코딩하지 않는다.
   - `/api/*`는 `127.0.0.1:8000`으로, 나머지는 `127.0.0.1:3000`으로 `reverse_proxy` 한다.
   - `log` 지시어를 넣지 않고, 이유(대피소 좌표 쿼리)를 주석으로 적는다.
   - `encode`를 넣지 않는다. 백엔드 GZip과 Next 기본 gzip이 이미 있다.
   - 업스트림 헬스 체크를 넣지 않는다: 능동(`health_`로 시작하는 하위 지시어)과 수동(`fail_duration`·`max_fails`·`unhealthy_`로 시작하는 하위 지시어) 모두다. "`/api/health`는 외부 가동 감시 전용이고 Caddy 헬스 체크에는 쓰지 않는다"는 점과 이유를 주석으로 적는다. Caddy 동작은 문서 기준이라 3-1·3-2에서 확인한다.
   - 인증서 발급·갱신과 HTTP→HTTPS 리디렉션은 Caddy 기본 동작을 쓴다.
2. **`deploy/war-risk-api.service`**
   - `User=warrisk`, `WorkingDirectory=/srv/war-risk-index`
   - `ExecStart=/srv/war-risk-index/.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --workers 1 --loop asyncio --no-access-log`
     - `--no-access-log`는 Q11 추천안이다. 결정이 다르면 뺀다.
     - `--loop asyncio`(판단: 넣는다): 로컬에서 개발·테스트한 것과 같은 asyncio 루프로 돌려서, 버전을 고정하지 않은 uvloop를 서버에서만 쓰는 일을 막는다. 접속이 적은 사이트라 uvloop의 성능 이점은 필요 없다. Windows용 `asyncio:SelectorEventLoop` 대신 이 값을 쓴다. Linux의 asyncio 기본 루프도 셀렉터 기반이다.
   - `Environment=PYTHONUNBUFFERED=1`: 수집 스크립트의 `print`가 바로 journald에 보이게 한다.
   - `Restart=always`, `RestartSec=5`, `After=`·`Wants=network-online.target`
   - `TimeoutStopSec`은 따로 두지 않는다(systemd 기본 90초). 갱신 스레드가 종료를 막지 않아 늘릴 이유가 없다. 실제 정지 시간은 3-1에서 `time sudo systemctl restart war-risk-api`로 잰다.
   - 주석: 작업 디렉터리와 워커 1개의 이유, 비밀값은 루트 `.env`에 둔다는 점
3. **`deploy/war-risk-web.service`**
   - `User=warrisk`, `WorkingDirectory=/srv/war-risk-index/frontend`
   - `ExecStart`는 `next start --hostname 127.0.0.1 --port 3000`이다.
     - npm 래퍼 대신 `node_modules/.bin/next`를 직접 부르는 방식을 제안한다. npm이 종료 신호를 자식에게 전달하는지 확실하지 않기 때문이다.
     - Node 경로는 런북의 설치 방식(2-2)에 맞춘다.
   - `Restart=always`
   - `TimeoutStopSec=30`: Next 문서가 종료 신호 뒤 10~30초 기다리기를 권한다.
4. **`deploy/web.env.example`**
   - `NEXT_PUBLIC_SITE_URL=`, `NEXT_PUBLIC_API_BASE_URL=`를 빈 값으로 둔다.
   - 주석으로 적을 내용:
     - 서버에서 `frontend/.env.production.local`로 복사해 채운다.
     - 빌드 전에 두 값을 모두 채워야 하고, 값을 바꾸면 다시 빌드해야 한다.
     - 같은 주소로 배포하면(추천) 두 값 모두 `https://<도메인>`이다.
5. **루트 `.env.example`**
   - 기존 `DATA_GO_KR_SERVICE_KEY=` 줄은 그대로 둔다.
   - 주석 줄로 두 변수를 설명한다.
     - `CORS_ORIGINS`: 기본 `http://localhost:3000`, 쉼표로 구분한다. 같은 주소로 배포하면 넣지 않고, 프론트를 다른 주소에 둘 때만 쓴다.
     - `LIVE_UPDATES`: 기본 `1`이다. 서버에서는 넣지 않는다. 빈 값으로 넣으면 갱신 스레드가 꺼진다.
6. **정적 검사 테스트:** `tests/test_deploy_config.py`(이름은 제안). 아래 인수 조건을 확인한다.

경로·사용자·포트 값은 `plan.md` 5절 서버 규약과 같게 둔다. 바꿀 때는 세 파일과 런북을 함께 바꾼다.

## 인수 조건

### 로컬에서 확인

- [ ] `deploy/Caddyfile`의 사이트 주소가 `{$SITE_DOMAIN}`이다. `/api/*`는 `127.0.0.1:8000`으로, 나머지는 `127.0.0.1:3000`으로 보낸다. [테스트]
- [ ] `deploy/Caddyfile`에 `log`·`encode` 지시어가 없다. [테스트]
- [ ] `deploy/Caddyfile`의 주석이 아닌 줄에 업스트림 헬스 체크 하위 지시어가 없다: `health_`·`unhealthy_`로 시작하는 것, `fail_duration`, `max_fails`. 그리고 `/api/health`를 Caddy 헬스 체크에 쓰지 않는다는 주석이 있다. [테스트]
- [ ] API 서비스 파일의 `ExecStart`에 다음이 모두 있다. `--no-access-log`는 Q11 결정이 다르면 이 조건에서 뺀다. [테스트]
  - `backend.app.main:app`
  - `--host 127.0.0.1`, `--port 8000`, `--workers 1`
  - `--loop asyncio`
  - `--no-access-log`
- [ ] API 서비스의 `WorkingDirectory`는 웹 서비스 `WorkingDirectory`의 상위 폴더(저장소 루트)다. `ExecStart`의 python은 그 아래 `.venv`에 있다. [테스트]
- [ ] API 서비스 파일에 `PYTHONUNBUFFERED=1`이 있다. [테스트]
- [ ] 웹 서비스의 `ExecStart`가 `next start`를 `127.0.0.1`, 포트 3000으로 띄운다. `TimeoutStopSec`은 10~30초다. [테스트]
- [ ] 두 서비스 파일에 `User=warrisk`와 `Restart=always`가 있다. `Environment=` 줄에는 이름에 `KEY`·`TOKEN`·`SECRET`·`PASSWORD`가 들어간 변수가 없다. [테스트]
- [ ] Caddyfile의 두 포트가 두 서비스 파일의 포트와 같다. [테스트]
- [ ] `.env.example`에 `CORS_ORIGINS`·`LIVE_UPDATES` 설명이 주석 줄로 있다. `test_env_example_exists_with_empty_values`는 고치지 않은 채 통과한다. [테스트]
- [ ] `deploy/web.env.example`에 `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_BASE_URL`이 빈 값으로 있다. `git check-ignore -q deploy/web.env.example`의 종료 코드가 1이다(무시되지 않음). [테스트]
- [ ] 커밋한 뒤 `git ls-files --eol deploy/` 결과가 모두 `i/lf`다. [명령]
- [ ] `.venv\Scripts\python.exe -m pytest tests`가 전부 통과한다. 새 파일이 `test_no_key_like_strings_in_repo`, `test_no_threat_references_in_repo`에 걸리지 않는다. [테스트]

### 서버에서 확인(M3)

- 3-1:
  - 두 서비스 파일을 `systemd-analyze verify`로 검사하면 오류가 0건이다.
  - `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`가 성공한다.
  - 세 서비스가 `active`다.
  - 백엔드가 uvloop를 불러오지 않는다(`--loop asyncio`). 확인 명령은 3-1 인수 조건에 있다.
- 3-2: 백엔드가 멈춘 동안 들어온 대피소 요청도 Caddy 로그에 좌표를 남기지 않는다.

## 영향 파일

- `deploy/Caddyfile`, `deploy/war-risk-api.service`, `deploy/war-risk-web.service`, `deploy/web.env.example`(모두 신규, 이름은 제안)
- `.env.example`
- `tests/test_deploy_config.py`(신규, 이름은 제안)

## 관련 시안

없음(`plan.md` 5절 구성도·서버 규약)

## 선행 이슈

없음. Q4·Q5·Q11 추천안을 기준으로 진행하고, 결정이 다르면 해당 부분만 고친다. `--loop asyncio`도 판단이 바뀌면 해당 부분만 뺀다.

## 라벨

`enhancement`
