# war-risk-index 운영 런북

서버를 준비하고, 처음 배포하고, 업데이트하고, 되돌리는 순서다. 리눅스 경험이 없어도 위에서부터 복사해 실행할 수 있게 썼다.

- 대상: Ubuntu 24.04 LTS 서버 한 대, 운영자 한 명
- 데이터 이전(2.3), 백업·복원(6절), 가동 감시(7절)는 2-3(#41)에서 덧붙였다.
- 아래 열린 질문은 미결이라 추천안을 기준으로 썼다. 결정이 달라지면 해당 단계만 고친다.
  - Q2(RAM 2GB + 스왑 2GB), Q4(systemd), Q5(프론트도 같은 서버), Q6(서버 안 백업 + 주 1회 로컬 사본), Q7(외부 가동 감시 서비스), Q9(업데이트 중 화면 중단 허용), Q10(위치정보법 확인 전에는 키 없이 공개), Q12(constraints 파일)
- 번호 읽는 법: 1-1·2-3 같은 번호는 `docs/plan/deploy-prep/issues/`의 이슈 문서다. U1 같은 번호는 `docs/plan/deploy-prep/plan.md` 9절 사용자 행동, Q1 같은 번호는 11절 열린 질문이다.

## 0. 개요

### 구성도

`plan.md` 5절의 그림이다(명령 아님).

```text
브라우저 ──HTTPS──▶ Caddy (:80→:443 리디렉션, 인증서 자동 발급·갱신, 접근 로그 끔)
                     ├─ /api/*  ──▶ 127.0.0.1:8000  uvicorn 워커 1 (+ 갱신 스레드) ── data/, out/ 읽기·쓰기
                     └─ 그 외   ──▶ 127.0.0.1:3000  next start
외부 가동 감시 ──▶ https://<도메인>/api/health, https://<도메인>/
cron(매일) ──▶ deploy/backup.sh ──▶ 서버 안 백업 폴더 (+ 주 1회 서버 밖 사본, Q6)
```

### 서버 규약

경로·사용자·포트는 `deploy/`의 설정 파일(`Caddyfile`, `war-risk-api.service`, `war-risk-web.service`)과 같다. 바꿀 때는 설정 파일과 이 표를 함께 바꾼다.

| 항목 | 값 | 이유 |
|---|---|---|
| OS | Ubuntu 24.04 LTS | 기본 Python이 3.12라 로컬(3.12.10)과 마이너 버전이 같다 |
| 저장소 위치 | `/srv/war-risk-index`(백엔드 작업 디렉터리) | 수집 모듈이 상대 경로(`data/…`)를 쓴다 |
| 서비스 사용자 | `warrisk`(로그인 셸 없는 시스템 사용자). 저장소 전체의 소유자 | 두 서비스가 이 사용자로 돈다. `data/`·`out/`은 폴더 자체에도 쓰기 권한이 필요하다(1.8) |
| 포트 | 백엔드 8000, 프론트 3000. 둘 다 `127.0.0.1`에만 바인딩. 들어오는 연결은 22·80·443만 연다. 나가는 80·443과 git SSH용 22는 막지 않는다 | 밖에는 Caddy만 노출한다. 나가는 포트의 이유는 1.2 |
| 런타임 | Python 3.12 venv(`/srv/war-risk-index/.venv`), Node 24 LTS(NodeSource, `/usr/bin/node`) | 로컬과 같은 메이저 버전. 두 서비스 파일의 `ExecStart`가 이 경로를 쓴다 |
| 시간대 | Asia/Seoul | 로컬 날짜를 쓰는 코드가 있다(1.3) |
| 비밀값 | `/srv/war-risk-index/.env`(소유자 `warrisk`, 권한 600) | `backend/app/main.py`가 시작할 때 읽는다 |
| 프론트 빌드 값 | `frontend/.env.production.local`(`deploy/web.env.example`을 복사) | 빌드할 때 박힌다 |
| 설정 파일 위치 | 서비스 파일은 `/etc/systemd/system/`에, `Caddyfile`은 `/etc/caddy/`에 복사한다 | 2.5·2.6 |

### 서버 사양

**권고: RAM 2GB + 스왑(swap) 2GB, 디스크 25GB 이상.** Q2 추천안이고 미결이다. 3-1 서버 실측 뒤 확정한다.

- 가장 큰 값은 `next build` 최대 1,989MB다. 2GB 서버에서 빌드하면 스왑을 쓸 수 있다.
- 스왑은 빌드와 캐치업(catch-up)이 겹칠 때 메모리 부족 종료를 막는 여유다.

1-5 측정값(1-5 이슈 문서의 "측정 결과" 절, PR #45)이다. Windows 11, 논리 CPU 12개에서 쟀다. Windows Working Set(WS)은 리눅스 RSS와 다른 참고치다.

| 항목 | 값 |
|---|---|
| `next build` 시간 | 첫 빌드 31.0초(지난 캐시 있음), 캐시 없는 빌드 8.9초, 캐시 있는 재빌드 5.8초 |
| 빌드 최대 메모리 | 캐시 없는 빌드 1,989MB(가장 큼), 첫 빌드 1,306MB, 캐시 있는 재빌드 1,179MB. 빌드 프로세스 트리 WS 합계다. 정적 생성 워커 10개가 도는 단계에서 최대이고, 워커 수는 CPU 수에 비례한다 |
| `next start` 기동 뒤 | 183MB(프로세스 트리 합계). `/` 첫 요청 뒤 184MB |
| 백엔드 기동 직후 | WS 91MB(Private 422MB). 첫 `/api/countries` 요청 뒤 WS 126MB, Peak 158MB |
| 지수 재계산 최대 | PeakWorkingSet 223MB, 최대 커밋 926MB. 별도 프로세스에서 `build_country_index.main()`(5.9초)과 `build_index.main()`(0.4초)을 돌린 값이다 |

서버 실측값(백엔드 `VmHWM`, 스왑 사용량, OOM 기록 수, 서버 빌드 시간)은 3-1에서 이 절에 더한다(M3에서 확인).

### 명령 표시 규칙

- 명령 블록 바로 앞에 실행 위치를 적는다.
  - **로컬 PowerShell**: 운영자 PC(Windows)의 PowerShell
  - **서버 bash**: SSH로 접속한 서버의 bash. 관리 사용자로 실행한다.
- **M3에서 확인**: 서버가 없어 아직 실행해 보지 못한 단계다. 3-1(서버 준비·첫 배포·데이터 이전)과 3-2(업데이트·되돌리기·백업·복원·가동 감시)에서 실행하며 다르게 동작한 곳을 고친다. 절 제목에 붙어 있으면 그 절 전체에 해당한다.
- `<도메인>`·`<서버 IP>`처럼 `< >`로 감싼 말은 자리표시자(placeholder)다. 실제 값으로 바꿔 실행하고, 이 문서에는 실제 값을 적지 않는다.
- `sudo -H -u warrisk`는 서비스 사용자로 실행한다는 뜻이다. 저장소 안 파일을 만들거나 바꾸는 명령(git, pip, npm 등)은 모두 이렇게 실행해 소유자를 `warrisk` 하나로 유지한다. `-H`는 HOME을 `warrisk`의 홈(`/home/warrisk`)으로 바꿔 npm·pip 캐시가 그 아래 생기게 한다.
- 로컬 PowerShell에서는 `curl` 대신 `curl.exe`를 쓴다. PowerShell 5.1의 `curl`은 `Invoke-WebRequest`의 별칭이다.
- 명령 뒤의 `# 기대:` 주석은 정상일 때 보이는 결과다.

## 1. 서버 준비 (M3에서 확인)

U1(서버 생성)이 끝난 뒤 한다.

### 1.1 SSH 키 접속과 비밀번호 로그인 끄기

서버를 만들 때 등록한 SSH 키로 관리 사용자(업체 기본 사용자, `<관리 사용자>`)에 접속한다.

로컬 PowerShell:

```powershell
ssh <관리 사용자>@<서버 IP>
```

키로 들어온 것을 확인한 뒤 비밀번호 로그인을 끈다. 설정이 잘못돼도 고칠 수 있게 지금 세션은 확인이 끝날 때까지 닫지 않는다.

서버 bash:

```bash
echo 'PasswordAuthentication no' | sudo tee /etc/ssh/sshd_config.d/00-no-password.conf
sudo systemctl reload ssh
sudo sshd -T | grep -i '^passwordauthentication'   # 기대: passwordauthentication no
```

- 파일 이름을 `00-`으로 시작하는 이유: sshd는 같은 설정이 여러 번 나오면 처음 읽은 값을 쓰고, `sshd_config.d`의 파일은 이름 순서로 읽는다. 업체 이미지가 넣은 설정(예: `50-cloud-init.conf`)보다 먼저 읽히게 한다.

새 PowerShell 창에서 비밀번호 로그인이 거절되는지 본다. 그다음 같은 창에서 키 접속(`ssh <관리 사용자>@<서버 IP>`)이 되는지도 본다.

로컬 PowerShell:

```powershell
ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password <관리 사용자>@<서버 IP>
# 기대: Permission denied (publickey).
```

### 1.2 방화벽

들어오는 연결은 22·80·443만 연다.

서버 bash:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp    # HTTP/3. Caddy가 기본으로 켠다
sudo ufw enable           # SSH 연결이 끊길 수 있다는 질문에 y. 22를 먼저 열어 두었다
sudo ufw status verbose   # 기대: deny (incoming), allow (outgoing), 22·80·443/tcp, 443/udp ALLOW IN
```

여는 포트는 22·80·443 그대로다. 443만 TCP(HTTPS)와 UDP(HTTP/3) 둘 다 연다.

나가는 연결은 80·443과 git SSH용 22를 막지 않는다. ufw는 기본으로 나가는 연결을 허용한다.

- 80·443: GDELT 2.0을 `http://`(80)로 부르고, 지금은 `https://`(443)로 301 리디렉션된다(`plan.md` 4절 사실 7).
- 22: 배포 키로 GitHub에서 clone·pull 한다(U3). 1.7의 `ssh -T`로 확인한다.
- 업체 콘솔에 방화벽이 따로 있으면 거기서도 들어오는 22·80·443(443은 TCP·UDP)을 연다. 나가는 규칙이 있으면 나가는 80·443·22도 연다.

80·443 확인. 서버 bash:

```bash
curl -sIL http://data.gdeltproject.org/gdeltv2/lastupdate.txt | grep '^HTTP'
# 기대: 301 줄 다음에 200 줄
```

### 1.3 시간대

서버 bash:

```bash
sudo timedatectl set-timezone Asia/Seoul
timedatectl | grep 'Time zone'   # 기대: Asia/Seoul (KST, +0900)
```

이유: 수집 스크립트 일부가 로컬 날짜(`Timestamp.today()`)를 써서, 로컬 PC와 같은 시간대여야 로컬에서 확인한 동작이 그대로다(`plan.md` 4절 사실 7).

### 1.4 스왑

크기는 서버 사양 절의 권고(2GB)를 따른다. 먼저 `swapon --show`로 스왑이 이미 있는지 본다. 2GB 이상 있으면 나머지 줄은 건너뛴다.

서버 bash:

```bash
swapon --show
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # 재부팅 뒤에도 켠다
free -m   # 기대: Swap 줄 total 약 2047
```

### 1.5 패키지 설치

설치 경로가 서비스 파일의 `ExecStart`와 맞아야 한다. Python은 `/srv/war-risk-index/.venv/bin/python`(2.1에서 만든다), Node는 `/usr/bin/node`다.

git·Python venv. 서버 bash:

```bash
sudo apt update
sudo apt install -y git python3.12-venv curl
python3.12 --version   # 기대: Python 3.12.x
```

Node 24 LTS(NodeSource apt 저장소, NodeSource 안내의 설치 스크립트 방식). 서버 bash:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh
sudo apt install -y nodejs
command -v node   # 기대: /usr/bin/node (war-risk-web.service 의 ExecStart 경로)
node -v           # 기대: v24.x
```

Caddy(공식 apt 저장소, Caddy 설치 문서의 명령). 설치하면 `caddy` 서비스가 기본 설정으로 바로 뜬다. 서버 bash:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
systemctl is-active caddy   # 기대: active
```

### 1.6 서비스 사용자

서버 bash:

```bash
sudo useradd --system --create-home --home-dir /home/warrisk --shell /usr/sbin/nologin warrisk
getent passwd warrisk   # 기대: 홈 /home/warrisk, 셸 /usr/sbin/nologin
ls -ld /home/warrisk    # 기대: 소유자 warrisk
sudo mkdir /srv/war-risk-index
sudo chown warrisk:warrisk /srv/war-risk-index
```

- 로그인 셸은 없지만 `warrisk`가 쓸 수 있는 홈 폴더(`/home/warrisk`)를 만든다. `--system`만 쓰면 홈을 만들지 않아서 `--create-home --home-dir`를 붙인다.
- 홈에는 배포 키(`~/.ssh`), npm 캐시(`~/.npm`), pip 캐시(`~/.cache/pip`)가 생긴다.
- 이후 저장소 안의 파일은 모두 `sudo -H -u warrisk`로 만든다(명령 표시 규칙).

### 1.7 배포 키와 clone

저장소가 비공개라 배포 키(deploy key)가 필요하다(U3). 키는 `warrisk`의 것으로 만든다.

서버 bash:

```bash
sudo -H -u warrisk mkdir -p -m 700 /home/warrisk/.ssh
sudo -H -u warrisk ssh-keygen -t ed25519 -N '' -C war-risk-index-deploy -f /home/warrisk/.ssh/id_ed25519
sudo cat /home/warrisk/.ssh/id_ed25519.pub
```

출력된 공개 키 한 줄을 GitHub 저장소 Settings → Deploy keys에 읽기 전용으로 등록한다. 개인 키(`id_ed25519`)는 서버 밖으로 꺼내지 않는다.

서버 bash:

```bash
sudo -H -u warrisk ssh -T git@github.com
# 처음에는 호스트 키 지문을 묻는다. GitHub 문서(SSH key fingerprints)의 값과 같으면 yes
# 기대: successfully authenticated 문구. 종료 코드 1은 정상이다(셸 접속을 주지 않아서)
cd /srv   # warrisk가 들어갈 수 있는 폴더에서 실행한다(관리 사용자 홈은 막혀 있을 수 있다)
sudo -H -u warrisk git clone <저장소 SSH 주소> /srv/war-risk-index
```

- `<저장소 SSH 주소>`: GitHub 저장소 Code → SSH의 `git@github.com:…` 주소
- `ssh -T`가 되면 나가는 22도 열려 있다.

### 1.8 data/·out/ 폴더

`data/`·`out/`은 git에 없어서 clone 직후에는 없다. 지수 쓰기는 `out/`을 만들지 않으므로(없으면 매 주기 실패한다) 먼저 만든다.

서버 bash:

```bash
sudo -H -u warrisk mkdir -p /srv/war-risk-index/data /srv/war-risk-index/out
```

- `warrisk`는 파일뿐 아니라 `data/`·`out/` 폴더(하위 폴더 포함) 자체에 쓰기 권한이 있어야 한다. 원자적 쓰기(atomic write, 1-1)가 같은 폴더에 `<파일>.part`를 만든 뒤 교체하기 때문이다.
- `warrisk`로 만든 폴더는 이 조건을 만족한다. 데이터를 옮긴 뒤 확인하는 명령은 2.3에 있다.

## 2. 첫 배포 (M3에서 확인)

- U2(DNS)·U3(배포 키)·U4(`.env`)가 끝난 뒤 한다.
- 2.1·2.4의 설치·빌드 명령은 저장소 밖 새 clone에서 로컬 리허설을 마쳤다(Windows, 종료 코드 0). 서버에서의 실행은 M3에서 확인한다.

### 2.1 Python 패키지

서버 bash:

```bash
cd /srv/war-risk-index
sudo -H -u warrisk python3.12 -m venv .venv
sudo -H -u warrisk .venv/bin/pip install -r backend/requirements.txt
```

- 로컬 리허설: venv 생성 9.5초, `pip install` 46초
- Q12(전이 의존성 고정)는 미결이다. 추천안대로 정해지면 3-1에서 `backend/constraints.txt`를 만들고, 그 뒤로는 이 명령에 `-c backend/constraints.txt`를 붙인다(3-1에서 런북을 고친다).

### 2.2 .env

로컬 `.env`를 `scp`로 보내고, 서버에서 소유자 `warrisk`, 권한 600으로 둔다(U4).

먼저 관리 사용자만 들어갈 수 있는 업로드 폴더(권한 700)를 만든다. 올린 파일의 권한(보통 644)과 상관없이 다른 사용자는 읽지 못한다. 중간에 멈춰도 파일은 이 폴더 안에 남는다. 서버 bash:

```bash
install -d -m 700 ~/wri-upload
```

로컬 PowerShell(저장소 루트에서):

```powershell
scp .env <관리 사용자>@<서버 IP>:wri-upload/war-risk.env
```

서버 bash:

```bash
sed -i '/^LIVE_UPDATES=/d' ~/wri-upload/war-risk.env   # 서버 .env 에는 LIVE_UPDATES 를 넣지 않는다(주의 절)
# Q10 추천안(키 없이 공개)이면 키 값을 비운다. 키를 넣어 공개할 때는 다음 한 줄을 건너뛴다
sed -i 's/^DATA_GO_KR_SERVICE_KEY=.*/DATA_GO_KR_SERVICE_KEY=/' ~/wri-upload/war-risk.env
sudo install -o warrisk -g warrisk -m 600 ~/wri-upload/war-risk.env /srv/war-risk-index/.env
rm ~/wri-upload/war-risk.env && rmdir ~/wri-upload
ls -l /srv/war-risk-index/.env   # 기대: -rw------- 1 warrisk warrisk
```

- Q10은 미결이다. 추천안은 위치정보법 확인(U6) 전에는 키 없이 공개하는 것이다. 키가 없으면 대피소, 재외공관 연락처, 외교부 여행경보가 빠진다.
- 확인이 끝나 키를 넣을 때는 위 세 블록을 키 줄 `sed`만 빼고 다시 한 뒤 2.7을 한다. 2.7이 백엔드를 다시 시작하므로 웹은 건드리지 않는다.

### 2.3 데이터 이전

`data/`·`out/`은 git에 없고 DB도 없어서 로컬 PC의 파일을 압축해 옮긴다. 백엔드를 시작(2.5)하기 전에 한다.

- **mtime을 보존하는 이유:** "하루 1회" 판단을 `time.time() - mtime`으로 한다. 보존하지 않으면 여행경보·대피소·재외공관 갱신이 하루 가까이 밀리고, 일별 재계산도 10분 미뤄진다(`backend/app/main.py`의 `COLLECTOR_IDLE_SECONDS`). 서버의 GNU tar는 풀 때 기본으로 mtime을 보존한다.
- **`out/`도 함께 옮기는 이유:** 일별 재계산은 쌍 지수(`build_index`)를 국가 지수(`build_country_index`)보다 먼저 돌려서, 쌍 지수가 직전 주기 가중치(`out/blend_weights.json`)를 쓴다. 이 파일 없이 띄우면 첫날 쌍 지수 `blended`가 최대 약 34점 틀린다.

1. 로컬 백엔드를 멈춘다. 계속 띄워 둬야 하면 `LIVE_UPDATES=0`으로 다시 띄운다(같은 창에서 `$env:LIVE_UPDATES = '0'`을 넣은 뒤 평소 실행 명령). 압축하는 동안 갱신 스레드가 파일을 쓰지 않게 하려는 것이다.
2. 저장소 루트에서 압축하고, 크기와 비교용 mtime 두 개를 본 뒤 서버 `/tmp`로 보낸다. 압축 파일은 저장소 밖(`$env:TEMP`)에 만든다. 로컬 PowerShell(저장소 루트에서):

   ```powershell
   tar -czf "$env:TEMP\war-risk-data.tgz" --exclude=data/npm_cache --exclude=data/gdelt_tmp data out
   (Get-Item "$env:TEMP\war-risk-data.tgz").Length / 1MB   # 기대: 약 60
   Get-Item data\shelters.csv, out\country_meta.csv | ForEach-Object { '{0} {1}' -f ([DateTimeOffset]$_.LastWriteTimeUtc).ToUnixTimeSeconds(), $_.Name }
   scp "$env:TEMP\war-risk-data.tgz" <관리 사용자>@<서버 IP>:/tmp/
   ```

   - `tar`는 Windows에 들어 있는 `tar.exe`(bsdtar)다. `data/npm_cache`·`data/gdelt_tmp`는 캐시·임시 폴더라 뺀다.
   - 셋째 줄이 출력하는 초 단위 mtime 두 개를 적어 둔다(3에서 비교한다).

3. 서버에서 서비스 사용자로 푼다. 그래야 파일 소유자가 `warrisk`가 된다. root(`sudo`만)로 풀면 Windows tar가 넣은 소유자(0, root)와 권한(폴더 777, 파일 666)이 그대로 남는다. 백엔드가 이미 떠 있으면 먼저 `sudo systemctl stop war-risk-api`를 한다. 서버 bash:

   ```bash
   cd /srv/war-risk-index
   sudo -H -u warrisk tar -xzf /tmp/war-risk-data.tgz -C /srv/war-risk-index
   stat -c '%Y %n' data/shelters.csv out/country_meta.csv   # 기대: 2에서 적어 둔 값과 같거나 1초 이내
   sudo -H -u warrisk find data out -type d ! -writable      # 기대: 출력 없음
   ```

   - `find`는 `warrisk`가 쓸 수 없는 폴더를 찾는다. 원자적 쓰기(1-1)가 같은 폴더에 `<파일>.part`를 만들기 때문에 폴더 자체에 쓰기 권한이 있어야 한다(1.8).

4. 백엔드를 시작(2.5)하면 멈춰 있던 기간을 저절로 채운다. 실시간 최근 26시간 슬롯은 `live.update`, 2.0 일별은 `live.backfill`, 1.0 일별은 `country_collect`가 채운다. 2.8의 `/api/health`가 200이고 두 나이가 정상 범위(7.2의 3)면 채워진 것이다. 그다음 서버 bash에서 `rm /tmp/war-risk-data.tgz`로 압축 파일을 지운다.

**`out/`을 못 옮겼을 때:** 첫 기동(2.5) 전에, 백엔드를 멈춘 상태에서 서비스 사용자로 국가 → 쌍 순서로 한 번 돌린다. 이 순서여야 쌍 지수가 새 가중치를 쓴다. `out/`은 git에 없어 새로 clone하면 없고 지수 쓰기는 폴더를 만들지 않으므로 먼저 만든다(1.8에서 만들었으면 그대로 지나간다). 서버 bash:

```bash
cd /srv/war-risk-index
sudo -H -u warrisk mkdir -p out
sudo -H -u warrisk .venv/bin/python -c "import build_country_index, build_index; build_country_index.main(); build_index.main()"
```

- 1-5에서 잰 시간은 국가 5.9초, 쌍 0.4초다.
- 로컬 확인: 2의 압축 명령을 이 저장소에서 실행했다(종료 코드 0, 4.3초, 60.2MB). 목록에 `data/npm_cache/`·`data/gdelt_tmp/`가 없고 `out/index_v1.csv`·`data/shelters.csv`·`data/live/country_15min.csv`가 있다. GNU tar(1.35)로 목록을 읽어도 경고가 없다.

### 2.4 프론트 빌드

서버 bash:

```bash
cd /srv/war-risk-index/frontend
sudo -H -u warrisk npm ci
sudo -H -u warrisk cp ../deploy/web.env.example .env.production.local
sudo -H -u warrisk sed -i 's|=$|=https://<도메인>|' .env.production.local   # 값이 빈 두 줄을 채운다
grep -v '^#' .env.production.local   # 기대: 두 줄 모두 =https://<도메인> (끝에 / 없음)
sudo -H -u warrisk npm run build
```

- **빌드는 `warrisk`로 한다.** 웹 서비스(`next start`)가 `warrisk`로 돌면서 `frontend/.next/cache`에 쓴다. 빌드한 사용자가 `.next`의 소유자가 되므로, `warrisk`로 빌드하면 빌드 뒤 `chown`을 잊을 일이 없다.
- `NEXT_PUBLIC_*` 값은 빌드할 때 박힌다. 값을 바꾸면 다시 빌드한다.
- 2GB 서버에서는 빌드 중 스왑을 쓸 수 있다(서버 사양 절).
- 로컬 리허설(`https://example.com`으로 채운 같은 파일): `npm ci` 118.5초, `npm run build` 12.3초

### 2.5 systemd 서비스

서비스 파일은 `systemctl link` 대신 **복사**한다. 링크하면 systemd(root)가 `warrisk` 소유 파일을 읽게 돼, 서비스 사용자가 유닛(`User=` 등)을 고칠 수 있다. 저장소의 서비스 파일이 바뀌면 다시 복사한다(업데이트 3.2).

서버 bash:

```bash
cd /srv/war-risk-index
sudo cp deploy/war-risk-api.service deploy/war-risk-web.service /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/war-risk-api.service /etc/systemd/system/war-risk-web.service
sudo systemctl daemon-reload
sudo systemctl enable --now war-risk-api war-risk-web
```

몇 초 뒤 서버 안에서 응답을 본다. 서버 bash:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/            # 기대: 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/api/pairs   # 기대: 200
```

### 2.6 Caddy

`Caddyfile`도 서비스 파일과 같은 이유로 `import` 대신 **복사**한다. DNS(U2)가 서버 IP를 가리켜야 인증서가 발급된다.

로컬 PowerShell:

```powershell
Resolve-DnsName <도메인>   # 기대: <서버 IP>
```

서버 bash:

```bash
sudo cp /srv/war-risk-index/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl edit caddy
```

`Caddyfile`의 사이트 주소는 `{$SITE_DOMAIN}`인데, apt로 설치한 `caddy.service`에는 이 환경변수가 없다. 열린 편집기에서 맨 위 주석 두 줄(`### Anything between here …`, `### Edits below …`) 사이에 아래 두 줄을 넣고 저장한다(nano: Ctrl+O, Enter, Ctrl+X). `systemctl edit`가 drop-in 파일을 만들고 daemon-reload까지 한다.

편집기에 넣을 내용(명령 아님):

```ini
[Service]
Environment=SITE_DOMAIN=<도메인>
```

서버 bash:

```bash
systemctl show caddy -p Environment   # 기대: Environment=SITE_DOMAIN=<도메인>
SITE_DOMAIN=<도메인> caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

- `caddy validate`는 서비스 밖에서 돌아 drop-in의 환경변수를 모른다. 그래서 같은 `SITE_DOMAIN`을 앞에 붙인다. 빠지면 사이트 주소가 빈 값이 된다.
- 인증서 발급 기록은 `sudo journalctl -u caddy -n 30 --no-pager`로 본다.

### 2.7 국내 공공 API 확인

`.env`에 키를 넣었을 때만 한다(U5). Q10 추천안대로 키 없이 공개했다면 키를 넣을 때 한다.

서버 bash:

```bash
cd /srv/war-risk-index
sudo systemctl stop war-risk-api   # 같은 파일을 동시에 쓰지 않게 먼저 멈춘다(주의 절)
sudo -H -u warrisk .venv/bin/python -c "import dotenv; dotenv.load_dotenv('.env'); import travel_advisory, shelters, embassies; print([m.update(force=True) for m in (travel_advisory, shelters, embassies)])"
sudo systemctl start war-risk-api
```

- 키는 서비스 사용자가 `.env`에서 읽는다. 키 값이 명령줄과 셸 기록에 남지 않는다.
- 기대: 마지막 줄이 `[True, True, True]`다(여행경보·대피소·재외공관 순서).
- 대피소·재외공관은 실패하면 예외를 낸다. 여행경보는 출처 하나가 실패해도 `True`이므로 `여행경보 외교부: …건` 줄이 있는지도 본다. `수신 실패`나 `없음, 건너뜀`이 보이면 실패다.
- 실패하면 결과를 기록한다. 해외 IP 차단 여부는 확실하지 않다. Q1(업체)을 다시 본다.

### 2.8 최종 확인

로컬 PowerShell:

```powershell
curl.exe -fsS https://<도메인>/api/health
Test-NetConnection <서버 IP> -Port 8000   # 기대: TcpTestSucceeded : False
Test-NetConnection <서버 IP> -Port 3000   # 기대: TcpTestSucceeded : False
```

- `/api/health`는 200이고 본문에 `"ok":true`가 있어야 한다. 첫 기동 뒤에는 캐치업이 끝날 때까지 503일 수 있다(걸린 시간은 3-1에서 잰다). 503이면 `-f`를 빼고 다시 실행해 본문의 `live_age_minutes`·`index_age_days`를 본다.
- 8000·3000은 열리지 않아야 한다. 두 서비스는 `127.0.0.1`에만 바인딩한다.

서버 bash:

```bash
systemctl status war-risk-api war-risk-web caddy --no-pager   # 기대: 셋 다 active (running)
```

## 3. 업데이트 (M3에서 확인)

로컬에서 PR을 `main`에 머지한 뒤 서버에서 한다.

### 3.1 배포 중인 커밋 기록

되돌리기에 쓴다.

서버 bash:

```bash
cd /srv/war-risk-index
sudo -H -u warrisk git rev-parse --short HEAD   # 출력을 <이전 해시>로 적어 둔다
```

### 3.2 받기와 바뀐 파일 확인

서버 bash:

```bash
sudo -H -u warrisk git pull
sudo -H -u warrisk git diff --name-only <이전 해시>..HEAD -- backend/requirements.txt frontend/package-lock.json deploy/war-risk-api.service deploy/war-risk-web.service deploy/Caddyfile deploy/web.env.example
```

출력된 파일마다 아래를 한다. 출력이 없으면 3.3으로 간다.

| 바뀐 파일 | 할 일 |
|---|---|
| `backend/requirements.txt` | 2.1의 `pip install` 명령을 다시 실행한다 |
| `frontend/package-lock.json` | 3.3에서 `npm ci`를 한다 |
| `deploy/war-risk-api.service`, `deploy/war-risk-web.service` | 2.5처럼 다시 복사하고 `sudo systemctl daemon-reload` |
| `deploy/Caddyfile` | 2.6처럼 다시 복사하고 `caddy validate` 뒤 `sudo systemctl reload caddy` |
| `deploy/web.env.example` | 새 항목을 `frontend/.env.production.local`에 채운다(3.3 빌드 전) |

### 3.3 웹: 멈추고 빌드하고 시작

서버 bash:

```bash
sudo systemctl stop war-risk-web
cd /srv/war-risk-index/frontend
sudo -H -u warrisk npm ci   # package-lock.json 이 바뀌었을 때만
sudo -H -u warrisk npm run build
sudo systemctl start war-risk-web
```

- **멈추는 이유:** `next start`가 쓰는 `.next`를 `next build`가 다시 만든다. 멈추지 않으면 깨진 응답이 나갈 수 있다.
- **예상 중단 시간:** 빌드하는 동안 화면은 502가 되고 API는 계속 동작한다. 1-5 로컬 빌드 시간은 5.8~31.0초다(서버 값은 3-1에서 서버 사양 절에 적는다). `npm ci`를 하면 그만큼 길어진다(로컬 리허설 118.5초).
- Q9(미결)의 추천안이 이 중단을 허용한다. 무중단 업데이트는 범위 밖이다.

### 3.4 백엔드 재시작

서버 bash:

```bash
sudo systemctl restart war-risk-api
```

일별 재계산 중에 재시작하면 재계산이 끊긴다.

- 갱신 스레드는 daemon 스레드라 재시작을 기다리게 하지 않는다(2-1). 다운로드·재계산 중이었다면 그 작업이 끊기고 `<파일>.part`가 남을 수 있다. 남은 `.part`는 다음 실행이 덮어쓴다.
- 결과 파일은 원자적 쓰기(1-1) 덕분에 잘리지 않는다. 끊긴 작업은 다음 주기(15분)에 다시 돈다.
- append 방식 수집 파일은 줄 중간에서 끊기면 다음 append가 그 줄에 이어 붙을 수 있다. 이 한계와 대처는 6.5(파싱 오류)를 본다.

### 3.5 확인

로컬 PowerShell:

```powershell
curl.exe -fsS https://<도메인>/api/health
```

- 기대: 200. 화면은 브라우저로 `https://<도메인>/`을 열어 본다.

## 4. 되돌리기 (M3에서 확인)

업데이트 뒤 문제가 생기면 3.1에서 적어 둔 `<이전 해시>`로 돌아간다.

1. 지금 커밋을 적고 직전 커밋으로 옮긴 뒤, 바뀐 파일을 본다. 서버 bash:

   ```bash
   cd /srv/war-risk-index
   sudo -H -u warrisk git rev-parse --short HEAD   # 출력을 <문제 해시>로 적어 둔다
   sudo -H -u warrisk git checkout <이전 해시>
   sudo -H -u warrisk git diff --name-only <이전 해시> <문제 해시> -- backend/requirements.txt frontend/package-lock.json deploy/war-risk-api.service deploy/war-risk-web.service deploy/Caddyfile deploy/web.env.example
   ```

2. 업데이트 3.2의 표 → 3.3 → 3.4 → 3.5 순서로 설치·빌드·재시작하고 확인한다. `git pull`은 하지 않는다.
3. 되돌린 상태를 유지하는 동안에는 `main`으로 돌아가지 않는다. 로컬 `main`은 3.2의 `git pull`로 이미 문제 커밋에 와 있다. `git checkout main`만 하면 작업 트리가 문제 코드가 되고, 그 상태에서 백엔드가 다시 뜨면(재시작·재부팅) 문제 코드가 돈다.
4. 고친 커밋이 `origin/main`에 들어온 뒤에만 돌아온다. `git checkout main` 바로 다음에 `git pull`을 한다. 그다음 업데이트 3.2의 `git diff`부터 3.5까지(빌드 포함) 한다. 3.1의 `<이전 해시>`는 지금 돌고 있는 되돌린 커밋 그대로 둔다. 서버 bash:

   ```bash
   cd /srv/war-risk-index
   sudo -H -u warrisk git fetch
   sudo -H -u warrisk git log --oneline -3 origin/main   # 고친 커밋이 없으면 여기서 멈춘다
   sudo -H -u warrisk git checkout main
   sudo -H -u warrisk git pull
   ```

5. 데이터까지 되돌릴 때는 6.4(복원)의 순서를 따른다.

## 5. 주의

- **백엔드 uvicorn 워커는 1개로 고정한다**(`war-risk-api.service`의 `--workers 1`). 워커마다 갱신 스레드가 떠서 같은 파일을 동시에 쓰기 때문이다.
- **수집·지수 스크립트를 손으로 돌릴 때는 백엔드를 먼저 멈춘다**(`sudo systemctl stop war-risk-api`). 원자적 쓰기의 임시 파일 이름이 `<파일>.part`로 고정이라 작성자가 하나뿐이라고 전제하기 때문이다(1-1). 스크립트도 `warrisk`로 돌려 파일 소유자를 유지한다. 서버 bash(M3에서 확인):

  ```bash
  sudo systemctl stop war-risk-api
  cd /srv/war-risk-index
  sudo -H -u warrisk .venv/bin/python <스크립트>.py
  sudo systemctl start war-risk-api
  ```

- **서버 `.env`에 `LIVE_UPDATES`를 넣지 않는다.** `1`이 아닌 값은 빈 값이라도 갱신 스레드를 끈다.
- **문서에 비밀값, 실제 도메인, 서버 IP를 쓰지 않는다.** 자리표시자 `<도메인>`·`<서버 IP>`를 쓴다.

## 6. 백업·복원 (M3에서 확인)

`deploy/backup.sh`가 매일 `data/`·`out/`을 `/var/backups/war-risk-index/war-risk-<YYYYmmdd-HHMM>.tgz` 하나로 묶고 오래된 백업을 지운다. 백업 하나는 60.1MB다(Git Bash에서 실제 `data/`·`out/`으로 실행, 6초).

- **필요한 이유:** 처음부터 다시 수집하면 2013-04부터의 GDELT 일별 파일을 모두 받아야 해서 오래 걸린다(확실하지 않음). append 방식 수집 파일은 줄 중간에서 끊기면 줄이 깨질 수 있다(3.4). 매일 백업과 복원으로 대비한다.
- **도는 중 백업:** 백엔드가 도는 중에 돌아도 된다. 쓰는 중인 임시 파일(`*.part`, `*.tmp`)은 빼고, 압축하는 동안 바뀐 파일이 있으면(tar 종료 코드 1) 경고만 남기고 성공으로 친다.
- **보관 기간:** 새 백업을 만든 뒤 `KEEP_DAYS`(기본 7)를 넘긴 `war-risk-*.tgz`를 지운다. `find -mtime +7`이라 나이를 일 단위로 내림해 8일째부터 지운다. 하루 넘게 남은 임시 파일(`war-risk-*.part`)도 지운다.
- **비밀값:** `.env`는 넣지 않는다. 원본은 로컬 PC의 `.env`다(2.2).
- **권한:** 백업은 `warrisk` 소유 600(`umask 077`)이고 폴더는 700이다. 서버에서 목록·내용을 보거나 서버 밖으로 꺼낼 때 `sudo`가 필요하다.

### 6.1 백업 폴더와 cron 등록

`backup.sh`는 백업 폴더를 만들지 않으므로 먼저 만든다. 로그 파일도 같은 폴더에 만든다. 서버 bash:

```bash
sudo install -d -m 700 -o warrisk -g warrisk /var/backups/war-risk-index
sudo install -m 600 -o warrisk -g warrisk /dev/null /var/backups/war-risk-index/backup.log
echo '30 4 * * * warrisk /bin/bash /srv/war-risk-index/deploy/backup.sh >> /var/backups/war-risk-index/backup.log 2>&1' | sudo tee /etc/cron.d/war-risk-backup
systemctl is-active cron   # 기대: active
```

- **시각:** 매일 04:30(서버 시간대 Asia/Seoul). 일별 재계산이 도는 16:00(07:00 UTC, GDELT 1.0 일별 파일이 올라오는 때) 무렵을 피했다. 15분 갱신은 백엔드 시작 시각 기준이라 피할 수 없어서 가끔 tar 경고가 남는다(정상).
- **`/etc/cron.d`:** root 소유라 서비스 사용자가 고칠 수 없다(2.5의 서비스 파일 복사와 같은 이유). 여섯째 칸이 실행 사용자 `warrisk`다. 이 폴더의 파일 이름에 점(`.`)이 있으면 cron이 읽지 않는다.
- **`/bin/bash`로 부르는 이유:** 실행 비트(`+x`)에 기대지 않는다.
- **로그:** `/var/backups/war-risk-index/backup.log`(`warrisk` 소유 600). 출력을 여기로 돌려, tar 경고가 cron 메일로 쌓이거나 그냥 버려지지 않게 한다. 백업 정리는 이 파일을 지우지 않는다. 로테이션(logrotate)은 두지 않는다. 하루 몇 줄(tar 경고 정도)이라 1년이 지나도 수백 KB 정도로 예상한다.

### 6.2 확인

cron을 기다리지 않고 한 번 돌려 본다. 서버 bash:

```bash
cd /srv/war-risk-index
sudo -H -u warrisk /bin/bash deploy/backup.sh; echo "종료 코드 $?"   # 기대: 종료 코드 0
sudo -H -u warrisk ls -lh /var/backups/war-risk-index   # 기대: war-risk-<날짜-시각>.tgz(-rw------- warrisk, 약 60M)와 backup.log
sudo -H -u warrisk tar -tzf /var/backups/war-risk-index/<백업 파일> | head   # 기대: data/… 와 out/… 줄
```

- `<백업 파일>`은 `ls`에 나온 `war-risk-<날짜-시각>.tgz` 이름이다. 관리 사용자는 백업 폴더를 읽지 못해 `*`로 고를 수 없다.
- 다음 날 04:30 뒤에 같은 `ls`로 새 백업이 생겼는지 보고, `sudo -H -u warrisk tail /var/backups/war-risk-index/backup.log`로 로그를 본다. 비어 있거나 tar 경고(`file changed as we read it`)뿐이면 정상이다.

### 6.3 서버 밖 사본 (주 1회)

Q6(미결) 추천안대로 주 1회 최신 백업을 로컬 PC로 받는다. 서버를 잃었을 때 쓴다(사본이 며칠 오래돼도 빈 기간은 자동으로 채워진다). 백업은 `warrisk`만 읽을 수 있어서 관리 사용자 폴더(권한 700)에 복사한 뒤 받는다.

서버 bash:

```bash
sudo -H -u warrisk ls /var/backups/war-risk-index   # 이름의 날짜가 가장 늦은 파일을 <백업 파일>로 쓴다
install -d -m 700 ~/wri-download
sudo -H -u warrisk cat /var/backups/war-risk-index/<백업 파일> > ~/wri-download/<백업 파일>
```

로컬 PowerShell(`<로컬 보관 폴더>`는 저장소 밖):

```powershell
scp <관리 사용자>@<서버 IP>:wri-download/<백업 파일> <로컬 보관 폴더>
```

서버 bash:

```bash
rm ~/wri-download/<백업 파일> && rmdir ~/wri-download
```

### 6.4 복원

현재 `data/`·`out/`은 지우지 않고 이름을 바꿔 보관한 뒤 백업을 푼다. 서버를 새로 만들었으면 1절과 2.1·2.2를 한 뒤, 2.5(백엔드 시작) 전에 2.3 대신 백업을 푼다. 로컬 사본(6.3)을 `scp`로 서버 `/tmp`에 보내고, 2.3의 3을 `war-risk-data.tgz` 대신 `<백업 파일>`로 한 다음 2.4부터 이어 간다(압축 안 경로가 같다).

1. 압축을 검사한다. 백엔드를 멈추기 전에 한다. `검사 통과`가 나오지 않으면(파일 이름 오타, 깨진 압축) 여기서 멈추고 다른 백업을 고른다. 서버 bash:

   ```bash
   sudo -H -u warrisk tar -tzf /var/backups/war-risk-index/<백업 파일> > /dev/null && echo 검사 통과   # 기대: 검사 통과
   ```

2. 백엔드를 멈추고, 현재 `data/`·`out/`을 시각을 붙인 이름으로 바꿔 보관한 뒤(지우지 않는다), 서비스 사용자로 백업을 푼다. 넷째 줄부터는 `&&`로 이어져 있어 하나가 실패하면 뒤는 돌지 않는다. 서버 bash:

   ```bash
   sudo systemctl stop war-risk-api
   cd /srv/war-risk-index
   stamp=$(date +%Y%m%d-%H%M); echo "$stamp"   # 출력을 <시각>으로 적어 둔다
   sudo -H -u warrisk mv data "data.before-$stamp" &&
     sudo -H -u warrisk mv out "out.before-$stamp" &&
     sudo -H -u warrisk tar -xzf /var/backups/war-risk-index/<백업 파일> -C /srv/war-risk-index &&
     echo 풀기 완료   # 기대: 풀기 완료
   ```

   `풀기 완료`가 나오지 않으면 백엔드를 시작하지 말고 아래 "풀기가 실패했을 때"로 되돌린다.

3. 백엔드를 시작한다. 서버 bash:

   ```bash
   sudo systemctl start war-risk-api
   ```

4. API를 확인한다. 서버 bash:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/api/pairs       # 기대: 200
   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8000/api/countries   # 기대: 200
   curl -s http://127.0.0.1:8000/api/health; echo   # 기대: 보충이 끝나면 "ok":true (읽는 법은 7.2의 3)
   ```

5. 하루쯤 정상으로 돌면 보관본을 지운다. 지우기 전에 대상 목록을 본다. 서버 bash:

   ```bash
   cd /srv/war-risk-index
   ls -d data.before-* out.before-*   # 지울 대상을 확인한다
   sudo -H -u warrisk rm -rf data.before-<시각> out.before-<시각>
   ```

**풀기가 실패했을 때:** 풀다 만 `data/`·`out/`을 치우고 보관본을 원래 이름으로 되돌린 뒤 시작한다. 보관본(`*.before-<시각>`)이 있는 쪽만 치우므로, 이름을 바꾸기 전에 실패했으면 아무것도 지우지 않는다. 서버 bash:

```bash
cd /srv/war-risk-index
ls -d data* out*   # 지우기 전에 확인한다: 풀다 만 data·out 과 data.before-<시각>·out.before-<시각>
if [ -d "data.before-<시각>" ]; then sudo -H -u warrisk rm -rf data && sudo -H -u warrisk mv "data.before-<시각>" data; fi
if [ -d "out.before-<시각>" ]; then sudo -H -u warrisk rm -rf out && sudo -H -u warrisk mv "out.before-<시각>" out; fi
sudo systemctl start war-risk-api
```

### 6.5 파싱 오류

로그에 CSV 파싱 오류가 보이면 append가 줄 중간에서 끊겨 줄이 깨진 것이다(3.4). 직전 백업으로 복원한다(6.4). 빈 기간은 자동으로 채워진다. 서버 bash:

```bash
sudo journalctl -u war-risk-api --since "1 day ago" | grep -c ParserError   # 기대: 0
```

- 복원한 뒤에도 파싱 오류가 나면 하루 더 앞선 백업으로 다시 복원한다. 백업하던 순간에 append 중이었으면 그 백업 안의 파일도 마지막 줄이 잘렸을 수 있다(그날 `backup.log`에 tar 경고가 남는다).

## 7. 가동 감시 (M3에서 확인)

외부 감시 서비스가 5분마다 두 주소를 부르고, 실패하면 메일로 알린다. Q7(미결) 추천안 기준이다. 가입(U7)이 끝난 뒤 한다.

### 7.1 감시 등록

감시 서비스 화면에서 아래 두 주소를 HTTP(S) 감시로 등록한다(명령 아님). 간격은 5분, 방식은 가능하면 GET, 알림은 메일이다.

- `https://<도메인>/api/health`: 데이터가 오래되면 일부러 503을 준다(1-3). 서비스가 멈춘 것뿐 아니라 데이터가 멈춘 것도 알린다.
- `https://<도메인>/`: 화면(웹 서비스·Caddy)

### 7.2 알림을 받았을 때 점검 순서

1번부터 차례로 본다. 6번은 알림과 별개로 월 1회 본다.

1. 서비스 상태. 서버 bash:

   ```bash
   systemctl status war-risk-api war-risk-web caddy --no-pager   # 기대: 셋 다 active (running)
   ```

2. 백엔드 로그. `갱신 실패`, `Traceback`을 찾는다. UCDP 갱신은 실패해도 헬스 체크가 200이라 알림이 오지 않으므로 6번에서 따로 본다(1-2). 서버 bash:

   ```bash
   sudo journalctl -u war-risk-api --since "1 hour ago" --no-pager
   ```

3. 헬스 본문. 실시간과 일별 중 무엇이 늦었는지 본다. 서버 bash:

   ```bash
   curl -s https://<도메인>/api/health; echo
   ```

   - `live_age_minutes`: 최신 실시간 슬롯(`live_as_of`, UTC)부터 지금까지의 분이고 내림한 정수다. 정상 범위는 약 −11~+20분이고 음수도 정상이다. GDELT 2.0 슬롯 key가 실제 발행보다 약 10~11분 늦기 때문이다. 60을 넘으면 503이다.
   - `index_age_days`: 오늘(UTC)과 `index_date`의 달력 날짜 차다. 정상값은 1~2다. D일 GDELT 1.0 파일이 D+1일 07:00 UTC 무렵 올라오기 때문이다. 3을 넘으면 503이다.
   - 값이 `null`이면 그 파일이나 값이 없다는 뜻이고 503이다.

4. GDELT 접속. 301 다음 200이 보이면 나가는 80·443이 모두 열려 있다(1.2). 서버 bash:

   ```bash
   curl -sIL http://data.gdeltproject.org/gdeltv2/lastupdate.txt | grep '^HTTP'   # 기대: 301 줄 다음에 200 줄
   ```

5. 디스크·메모리·OOM. 서버 bash:

   ```bash
   df -h
   free -m
   sudo journalctl -k | grep -i "out of memory"   # 기대: 출력 없음
   ```

6. **UCDP 기준일(월 1회, 알림과 별개).** 기준일이 오늘보다 90일 넘게 오래됐으면 UCDP 갱신이 멈춘 것이다. 서버 bash:

   ```bash
   cat /srv/war-risk-index/data/ucdp_country_monthly.csv.asof; echo   # 기준일(YYYY-MM-DD)
   sudo journalctl -u war-risk-api --since "30 days ago" | grep -c "UCDP 갱신 실패"   # 접속 실패면 하루 1번씩 는다
   cd /srv/war-risk-index
   sudo -H -u warrisk .venv/bin/python -c "import ucdp; print(ucdp.latest_urls())"
   ```

   - 정상은 약 60일 이내다(확실하지 않음). UCDP 후보판은 한 달 이내 지연으로 월 1회 공개되므로, 다음 공개 직전에 가장 오래돼 약 60일이 된다. 공개일은 정해져 있지 않다. 2026-11-12 기준 값은 2026-10-04(39일)다.
   - 원인은 마지막 명령의 결과로 가린다.
     - **접속 실패**(오류가 나고, 로그 수가 날마다 는다): 다음 일별 주기에 저절로 다시 시도한다. 계속되면 서버의 나가는 443과 UCDP 사이트 상태를 본다.
     - **페이지 모양 변경**(`[]` 빈 목록, 로그 없음): `ucdp.py`의 `GED_PATTERN`·`CANDIDATE_PATTERN`을 고쳐 PR로 머지한 뒤 업데이트(3절)한다.
     - **집계 실패**(주소 목록이 나온다): 받은 뒤 집계가 실패하면 그날 한 번만 로그가 남고, 다음 UCDP 버전까지 다시 집계하지 않는다(1-2). 백엔드를 멈추고 서비스 사용자로 한 번 다시 집계한다. 다시 집계해도 기준일이 그대로면 UCDP 공개가 늦은 것이라 할 일이 없다. 서버 bash:

       ```bash
       sudo systemctl stop war-risk-api
       cd /srv/war-risk-index
       sudo -H -u warrisk .venv/bin/python -c "import ucdp; print(ucdp.update(force=True))"   # 기대: UCDP 갱신: … 줄과 True
       sudo systemctl start war-risk-api
       ```

### 7.3 조치

점검 결과에 따라 하나를 고른다.

- 서비스가 멈췄거나 응답하지 않는다: 재시작(`sudo systemctl restart war-risk-api`. 웹은 `war-risk-web`, 프록시는 `caddy`)
- 업데이트 뒤부터 문제가 생겼다: 되돌리기(4절)
- 데이터 파일이 깨졌다(`ParserError` 등): 복원(6.4·6.5)
