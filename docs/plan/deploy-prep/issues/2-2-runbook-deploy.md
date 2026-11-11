# 운영 런북 1: 서버 준비·첫 배포·업데이트·되돌리기

## 배경

운영자는 사용자 혼자다. 리눅스 경험 없이도 따라 할 수 있는 문서가 필요하다.

- 서버가 아직 없으므로 이 이슈의 범위는 두 가지다.
  - 문서를 쓴다.
  - OS와 상관없는 단계(설치·빌드)를 로컬에서 실제로 돌려 본다.
- 서버에서만 되는 명령은 3-1에서 실행하면서 고친다.
- 데이터 이전, 백업·복원, 가동 감시 절은 2-3에서 쓴다.

## 범위

- **포함:**
  - `deploy/RUNBOOK.md`(신규, 이름은 제안): 개요, 서버 준비, 첫 배포, 업데이트, 되돌리기 절
  - 절 제목 정적 검사
  - 저장소 밖 새 사본에서의 리허설
- **제외:** 데이터 이전·백업·복원·가동 감시 절(2-3), 서버에서 실행(3-1), CI·자동 배포(Q8)

## 이 이슈에서 쓰는 절

0. **개요**
   - 구성도(`plan.md` 5절)와 서버 규약 표
   - "서버 사양" 절: 1-5 측정값, 그리고 권고 RAM·스왑·디스크(Q2)
   - 명령 표시 규칙: 블록마다 실행 위치를 "로컬 PowerShell" 또는 "서버 bash"로 적는다.
1. **서버 준비** (Ubuntu 24.04 LTS 기준, 단계마다 복사해서 실행할 수 있는 bash 명령)
   - 관리 사용자 SSH 키 접속, 비밀번호 로그인 끄기
   - 방화벽(ufw): 22·80·443만 연다.
   - 시간대 Asia/Seoul. 이유는 한 줄로 적는다(`plan.md` 4절 사실 7).
   - 스왑 파일. 크기는 서버 사양 절을 따른다.
   - 패키지 설치: git, python3.12-venv, Node 24 LTS, Caddy(공식 저장소). 설치 경로가 서비스 파일의 `ExecStart`와 맞아야 한다.
   - 서비스 사용자 `warrisk`를 만들고 `/srv/war-risk-index`의 소유자로 둔다.
   - 배포 키(U3)로 저장소를 clone 한다.
2. **첫 배포**
   1. venv를 만들고 `pip install -r backend/requirements.txt`를 실행한다.
   2. `.env`를 둔다(U4: `scp`, 소유자 `warrisk`, 권한 600). Q10 결정을 반영한다.
   3. 데이터를 옮긴다. 방법은 2-3 "데이터 이전" 절로 연결한다.
   4. `npm ci`를 실행한다. `deploy/web.env.example`을 복사해 `frontend/.env.production.local`을 만들고, `npm run build`를 실행한다.
   5. systemd 서비스를 연결하고 `enable --now`로 시작한다. 연결 방법은 `systemctl link`와 복사 중 한 가지로 정한다.
   6. Caddy를 설정한다.
      - `systemctl edit caddy`로 `SITE_DOMAIN`을 지정한다.
      - `/etc/caddy/Caddyfile`에서 저장소의 `deploy/Caddyfile`을 `import`하거나 복사한다. 한 가지로 정한다.
      - `systemctl reload caddy`로 반영한다.
   7. 국내 공공 API를 확인한다(U5).
      - 서비스 사용자로 `.env`를 읽은 뒤 여행경보·대피소·재외공관의 `update(force=True)`를 실행해서 모두 `True`인지 본다.
      - 키 값은 명령줄과 셸 기록에 남기지 않는다.
   8. 최종 확인
      - `curl -fsS https://<도메인>/api/health`
      - `systemctl status war-risk-api war-risk-web caddy`
      - 로컬에서 `Test-NetConnection <서버 IP> -Port 8000`과 `3000`이 실패하는지 본다.
3. **업데이트**
   1. 배포 중인 커밋 해시를 기록한다(`git rev-parse --short HEAD`).
   2. `git pull`을 하고, `git diff --name-only <이전 해시>..HEAD`로 requirements·`package-lock.json`이 바뀌었는지 본다. 바뀌었으면 설치한다.
   3. 웹: `systemctl stop war-risk-web` → (필요하면 `npm ci`) → `npm run build` → `systemctl start war-risk-web`
      - Q9: 빌드하는 동안(1-5 빌드 시간) 화면은 502가 되고 API는 계속 동작한다.
      - 멈추는 이유: `next start`가 쓰는 `.next`를 빌드가 다시 만든다.
   4. 백엔드: `systemctl restart war-risk-api`
      - 일별 재계산 중에 재시작하면 재계산이 끊긴다.
      - 원자적 쓰기(1-1) 덕분에 결과 파일은 잘리지 않고, 다음 주기(15분)에 다시 돈다.
      - append 파일의 한계는 2-3 복원 절을 참조한다.
   5. `/api/health`로 확인한다.
4. **되돌리기**
   1. 기록해 둔 직전 커밋으로 `git checkout <해시>` 한다.
   2. 업데이트와 같은 순서로 설치·빌드·재시작하고 확인한다.
   3. 문제를 고친 뒤 `git checkout main`으로 돌아온다.
   4. 데이터까지 되돌릴 때는 2-3 복원 절을 따른다.
5. **주의**
   - 서버에서 수집·지수 스크립트를 손으로 돌릴 때는 백엔드를 먼저 멈춘다. 같은 파일을 동시에 쓰지 않게 하려는 것이다.
   - 서버 `.env`에 `LIVE_UPDATES`를 넣지 않는다.
   - 문서에 비밀값, 실제 도메인, 서버 IP를 쓰지 않는다. 자리표시자 `<도메인>`·`<서버 IP>`를 쓴다.

## 할 일

1. 위 구성으로 `deploy/RUNBOOK.md`를 쓴다. 1-5 PR의 측정값은 "서버 사양" 절로 옮긴다.
2. `tests/test_deploy_config.py`에 절 제목 검사를 추가한다: 개요, 서버 준비, 첫 배포, 업데이트, 되돌리기.
3. 로컬 리허설을 한다.
   - 저장소 밖 임시 폴더에 사본을 새로 clone 한다. 예: `git clone <저장소 경로> "$env:TEMP\wri-clone"`
   - OS와 상관없는 단계를 런북 순서대로 PowerShell로 실행한다: venv 생성, `pip install`, `npm ci`, `npm run build`.
   - 빌드 값은 `https://example.com`으로 채운 `frontend/.env.production.local`을 쓴다.
   - 사본은 2-3에서 다시 쓰므로 2-3이 끝날 때 지운다.

## 인수 조건

### 로컬에서 확인

- [ ] `deploy/RUNBOOK.md`에 "개요", "서버 준비", "첫 배포", "업데이트", "되돌리기" 절 제목이 있다. [테스트]
- [ ] 개요의 서버 규약 표에 경로, 서비스 사용자, 포트, Python·Node 버전, 시간대가 있다. 경로와 포트는 2-1 설정 파일의 값과 같다. [테스트]
- [ ] "서버 사양" 절에 1-5 측정값 5개와 권고(RAM·스왑·디스크)가 있다. [수동]
- [ ] 모든 명령 블록 앞에 실행 위치("로컬 PowerShell" 또는 "서버 bash")가 적혀 있다. 서버에서만 확인할 수 있는 단계에는 "M3에서 확인" 표시가 있다. [수동]
- [ ] 업데이트 절에 다음 4가지가 있다. [수동]
  - 웹 서비스를 멈춘 뒤 빌드하는 이유
  - 예상 중단 시간(1-5 빌드 시간)
  - 배포 커밋 해시를 기록하는 명령
  - 재계산 중에 재시작하면 생기는 영향
- [ ] 첫 배포 절에 국내 공공 API 확인 명령이 있고, 그 명령은 키 값을 명령줄에 쓰지 않는다. [수동]
- [ ] 저장소 밖에 새로 clone한 사본에서 런북 순서대로 실행한 다음 명령이 모두 종료 코드 0으로 끝난다. [명령]
  - venv 생성, `pip install -r backend/requirements.txt`
  - `npm ci`, `npm run build`
- [ ] 문서에 비밀값, 실제 도메인, 서버 IP가 없고 자리표시자를 쓴다. [수동]
- [ ] `.venv\Scripts\python.exe -m pytest tests`가 전부 통과한다. [테스트]

### 서버에서 확인(M3)

- 3-1: 서버 준비와 첫 배포 절을 처음부터 끝까지 실행하고, 다르게 동작한 곳을 고친다.
- 3-2: 업데이트와 되돌리기 절을 리허설한다.

## 영향 파일

- `deploy/RUNBOOK.md`(신규, 이름은 제안)
- `tests/test_deploy_config.py`(절 제목 검사 추가)

## 관련 시안

없음(`plan.md` 5절 구성도, 7절 운영자 흐름)

## 선행 이슈

- 2-1: 설정 파일 경로와 이름
- 1-4: 설치 명령
- 1-5: 빌드 명령과 측정값

## 라벨

`documentation`
