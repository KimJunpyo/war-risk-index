# 서버 첫 배포와 데이터 이전

## 배경

M1·M2 결과를 실제 서버에 처음 적용하고, 로컬에서 확인할 수 없던 항목을 여기서 확인한다.

- **시작 조건:** `plan.md` 9절 사용자 행동 4가지가 끝나야 시작할 수 있다.
  - U1: 서버
  - U2: 도메인·DNS
  - U3: 배포 키
  - U4: `.env`
- **키 넣는 시점:** 공공데이터 키를 처음부터 넣을지는 Q10 결정을 따른다. 추천안은 위치정보법 확인(U6) 전까지 키 없이 공개하는 것이다.
- **실행자:** 서버에 접속할 수 있는 사람이 한다. 사용자 본인이거나, 사용자가 접속을 승인한 메인 세션이다.

## 범위

- **포함:**
  - 런북 "서버 준비", "첫 배포", "데이터 이전" 실행
  - 런북과 다르게 동작한 곳 수정
  - 서버 실측값 기록
- **제외:**
  - 백업·복원·감시·되돌리기 리허설과 다음 날 확인(3-2)
  - 공개 홍보

## 할 일

1. 런북대로 서버 준비 → 첫 배포 → 데이터 이전을 실행한다. 명령이 다르게 동작하면 같은 PR에서 런북을 고친다.
2. 첫 캐치업이 끝나면 다음 값을 런북 "서버 사양" 절에 반영한다.
   - 백엔드 `VmHWM`: `grep VmHWM /proc/$(systemctl show -p MainPID --value war-risk-api)/status`
   - 스왑 사용량: `free -m`
   - OOM 기록 수: `journalctl -k | grep -ci "out of memory"`
   - 서버 빌드 시간
3. Q10 결정에 따라 키가 들어 있는지 확인하고, 키 상태에 맞는 인수 조건을 체크한다.

## 인수 조건

### 서버에서 확인

- [ ] 두 서비스 파일을 `systemd-analyze verify`로 검사하면 오류가 0건이다. `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`가 성공한다. [명령]
- [ ] Ubuntu 24.04의 Python 3.12 venv에서 `pip install -r backend/requirements.txt`가 오류 없이 끝난다. [명령]
- [ ] 로컬 PC에서 HTTPS 접속과 리디렉션을 확인한다. [명령·수동]
  - `curl.exe -sI https://<도메인>/`가 200이다.
  - `curl.exe -sI http://<도메인>/`가 HTTPS 주소로 리디렉션(301 또는 308)한다.
  - 브라우저에 인증서 경고가 없다.
- [ ] 로컬 PC에서 `Test-NetConnection <서버 IP> -Port 8000`과 `-Port 3000`이 모두 `TcpTestSucceeded : False`다. [명령]
- [ ] 옮긴 `data/shelters.csv`와 `out/country_meta.csv`의 mtime(`stat -c %Y`)이 로컬 원본과 1초 이내로 같다. [명령]
- [ ] 백엔드를 시작하고 30분 안에 `https://<도메인>/api/health`가 200이 된다. 이전 직전 로컬 지수 날짜가 3일보다 오래됐다면 캐치업이 끝날 때까지 기다리고 걸린 시간을 적는다. [명령]
- [ ] `https://<도메인>`에서 1-5의 메타데이터 경로가 모두 200이다. [명령]
  - 대상: `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/icon.svg`, `/apple-icon`, `/llms.txt`, `og:image` 주소
  - `robots.txt`·`sitemap.xml`·canonical의 주소는 `https://<도메인>`으로 시작한다.
- [ ] 브라우저 폭 360·1440px에서 `https://<도메인>/`를 확인한다. [수동]
  - 지도, 국가 쌍, 추이, 뉴스가 보인다.
  - 콘솔 오류가 0건이다.
  - Network의 API 요청이 모두 `https://<도메인>/api/...`로 가고, CORS 오류가 0건이다.
- [ ] **키를 넣은 경우** [명령·수동]
  - 런북의 국내 공공 API 확인 명령(U5)이 성공한다.
  - 한국을 선택하고 지역·위치로 대피소를 조회하면 결과가 보인다.
  - 그 뒤 `journalctl -u war-risk-api -u caddy | grep -c "lat="`이 0이다.
- [ ] **키를 뺀 경우** [명령·수동]
  - `/api/shelters/regions` 응답이 `"available": false`이고, 홈에 대피소 영역이 없다.
  - 재외공관·여행경보 영역이 어떻게 보이는지 PR에 적는다.
- [ ] 재시작과 재부팅 뒤 복구를 확인한다. [명령]
  - `sudo systemctl restart war-risk-api` 뒤 60초 안에 `/api/health`가 다시 200이 된다.
  - `sudo reboot` 뒤 `war-risk-api`, `war-risk-web`, `caddy`가 모두 `active`다.
- [ ] 런북 "서버 사양" 절에 서버 실측값 4개가 반영돼 있다. [수동]
  - VmHWM
  - 스왑 사용량
  - OOM 기록 수(0이어야 함)
  - 서버 빌드 시간
- [ ] 런북과 실제가 달랐던 곳을 고친 커밋이 있다. 다른 곳이 없었으면 PR에 "차이 없음"이라고 적는다. [수동]

## 영향 파일

- `deploy/RUNBOOK.md`(실행하면서 고친 내용, 서버 실측값)
- 필요하면 `deploy/` 설정 파일

## 관련 시안

없음(`plan.md` 5절 구성도·서버 규약)

## 선행 이슈

- M1·M2 전체
- 사용자 행동 U1~U4
- Q10 결정. 키를 넣는다면 U5·U6도 끝나야 한다.

## 라벨

`documentation`
