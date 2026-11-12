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
  - M9 리뷰에서 넘어온 서버 확인: UCDP 실제 다운로드, 설치 로케일, 나가는 80·443, 폴더 쓰기 권한, 이벤트 루프, 재시작 정지 시간
  - `backend/constraints.txt`(Q12 추천안)
- **제외:**
  - 백업·복원·감시·되돌리기 리허설과 다음 날 확인(3-2)
  - 공개 홍보

## 할 일

1. 런북대로 서버 준비 → 첫 배포 → 데이터 이전을 실행한다. 명령이 다르게 동작하면 같은 PR에서 런북을 고친다.
   - `out/`를 반드시 함께 옮긴다. 못 옮겼으면 첫 기동 전에 `build_country_index` → `build_index` 순서로 한 번 돌린다(`out/` 폴더부터 만든다, 2-3, `plan.md` 4절 사실 7).
2. 첫 캐치업이 끝나면 다음 값을 런북 "서버 사양" 절에 반영한다.
   - 백엔드 `VmHWM`: `grep VmHWM /proc/$(systemctl show -p MainPID --value war-risk-api)/status`
   - 스왑 사용량: `free -m`
   - OOM 기록 수: `journalctl -k | grep -ci "out of memory"`
   - 서버 빌드 시간
   - 비교 기준은 1-5 로컬 측정값(Windows 참고치)이다: 백엔드 기동 직후 WS 91MB(첫 요청 뒤 126MB), 지수 재계산 최대 223MB, `next start` 183MB, 빌드 최대 1,989MB(논리 CPU 12개, 정적 생성 워커 10개). 1-5 "측정 결과" 절에 자세히 있다.
3. Q10 결정에 따라 키가 들어 있는지 확인하고, 키 상태에 맞는 인수 조건을 체크한다.
4. **UCDP 실제 다운로드(M9 리뷰 제안):** 타임아웃(1-2) 뒤 실제 UCDP 다운로드는 아직 돌려 보지 않았다. 60초 읽기 한도로 충분한지 한 번 본다.
   - 옮긴 `data/ucdp/`에 원본이 이미 있어서, 저장소 폴더에서 `ucdp.update(force=True)`를 돌리면 내려받지 않고 집계만 다시 한다. `force`는 "새 버전 없음" 판단만 건너뛰고, 다운로드는 `data/ucdp/`에 없는 파일만 하기 때문이다.
   - 그래서 빈 임시 폴더를 작업 디렉터리로 두고 실행한다. 수집 모듈이 상대 경로를 쓰므로 받은 원본과 집계 결과는 그 임시 폴더에만 생기고 서비스 데이터는 건드리지 않는다. 예(서버 bash):
     `cd "$(mktemp -d)" && PYTHONPATH=/srv/war-risk-index /srv/war-risk-index/.venv/bin/python -c "import ucdp; print(ucdp.update(force=True))"`
   - 끝나면 `pwd`로 경로를 확인한 뒤 `cd ~ && rm -rf <경로>`로 임시 폴더를 지운다. 지우기 전에 대상 경로를 보여 준다.
5. **설치 로케일(M9 리뷰 제안):** requirements 두 파일 첫 줄의 coding 선언(1-4)으로 서버 로케일과 상관없이 설치되는지 본다. `pip --version`과 `locale`의 `LANG`을 PR에 적는다.
6. **전이 의존성 고정(Q12 추천안, 결정이 다르면 뺀다):** 서버 설치와 기동 확인이 끝나면 서버 venv의 `pip freeze` 결과를 `backend/constraints.txt`로 커밋한다. `pip freeze` 출력을 그대로(해시 없이) 쓴다. `--hash`를 넣으면 SHA-256 값이 키 모양 문자열 검사(`test_no_key_like_strings_in_repo`)에 걸린다. 런북의 설치·업데이트 명령을 `pip install -r backend/requirements.txt -c backend/constraints.txt`로 바꾸고, requirements를 바꿀 때 서버에서 constraints를 다시 만드는 순서를 업데이트 절에 적는다.
7. **메타데이터 경로 확인:** 1-5에서 쓴 프로덕션 확인 스크립트는 저장소에 없고 작업 세션의 임시 폴더에만 있어 다시 쓸 수 없다. 인수 조건의 `curl` 확인으로 대신한다. 확인 스크립트를 저장소에 넣을지는 2-1·2-3(M10)에서 판단한다.

## 인수 조건

### 서버에서 확인

- [ ] 두 서비스 파일을 `systemd-analyze verify`로 검사하면 오류가 0건이다. `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile`가 성공한다. [명령]
- [ ] Ubuntu 24.04의 Python 3.12 venv에서 `pip install -r backend/requirements.txt`가 오류 없이 끝난다. `pip --version`과 `locale`의 `LANG` 값을 PR에 적는다. [명령]
- [ ] 서버에서 `curl -sIL http://data.gdeltproject.org/gdeltv2/lastupdate.txt`의 상태 줄이 301, 200 순서로 나온다(나가는 80·443). [명령]
- [ ] `sudo -u warrisk find /srv/war-risk-index/data /srv/war-risk-index/out -type d ! -writable`의 출력이 없다(폴더 쓰기 권한). [명령]
- [ ] 백엔드가 uvloop를 불러오지 않는다: `sudo grep -c uvloop /proc/$(systemctl show -p MainPID --value war-risk-api)/maps`가 0이다(다른 사용자 프로세스라 `sudo` 필요, 2-1의 `--loop asyncio`). [명령]
- [ ] UCDP 실제 다운로드(할 일 4): 빈 임시 폴더에서 실행한 `ucdp.update(force=True)`가 `UCDP 갱신: …` 줄을 출력하고 `True`를 돌려준다. 걸린 시간과 받은 파일 크기를 PR에 적고, 임시 폴더는 지운다. [명령]
- [ ] (Q12 추천안) `backend/constraints.txt`가 커밋돼 있고, 서버에서 `pip install -r backend/requirements.txt -c backend/constraints.txt`가 오류 없이 끝난다. 런북의 설치·업데이트 명령이 `-c backend/constraints.txt`를 쓴다. Q12 결정이 다르면 이 조건을 뺀다. [명령]
- [ ] 로컬 PC에서 HTTPS 접속과 리디렉션을 확인한다. [명령·수동]
  - `curl.exe -sI https://<도메인>/`가 200이다.
  - `curl.exe -sI http://<도메인>/`가 HTTPS 주소로 리디렉션(301 또는 308)한다.
  - 브라우저에 인증서 경고가 없다.
- [ ] 로컬 PC에서 `Test-NetConnection <서버 IP> -Port 8000`과 `-Port 3000`이 모두 `TcpTestSucceeded : False`다. [명령]
- [ ] 옮긴 `data/shelters.csv`와 `out/country_meta.csv`의 mtime(`stat -c %Y`)이 로컬 원본과 1초 이내로 같다. `out/blend_weights.json`이 있다. 없었다면 첫 기동 전에 `build_country_index` → `build_index`를 돌린 기록이 PR에 있다. [명령]
- [ ] 백엔드를 시작하고 30분 안에 `https://<도메인>/api/health`가 200이 된다. 이전 직전 로컬 지수 날짜가 3일보다 오래됐다면 캐치업이 끝날 때까지 기다리고 걸린 시간을 적는다. 200이 된 뒤 본문의 `live_age_minutes`·`index_age_days`를 PR에 적는다(정상 범위: 약 −11~+20분, 1~2일, 1-3). [명령]
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
  - `time sudo systemctl restart war-risk-api` 뒤 60초 안에 `/api/health`가 다시 200이 된다. `time`이 잰 재시작 시간을 PR에 적는다(2-1의 정지 시간 실측).
  - `sudo reboot` 뒤 `war-risk-api`, `war-risk-web`, `caddy`가 모두 `active`다.
- [ ] 런북 "서버 사양" 절에 서버 실측값 4개가 1-5 로컬 측정값과 함께 반영돼 있다. [수동]
  - VmHWM
  - 스왑 사용량
  - OOM 기록 수(0이어야 함)
  - 서버 빌드 시간
- [ ] 런북과 실제가 달랐던 곳을 고친 커밋이 있다. 다른 곳이 없었으면 PR에 "차이 없음"이라고 적는다. [수동]

## 영향 파일

- `deploy/RUNBOOK.md`(실행하면서 고친 내용, 서버 실측값)
- 필요하면 `deploy/` 설정 파일
- `backend/constraints.txt`(신규, Q12 추천안)

## 관련 시안

없음(`plan.md` 5절 구성도·서버 규약)

## 선행 이슈

- M1·M2 전체
- 사용자 행동 U1~U4
- Q10 결정. 키를 넣는다면 U5·U6도 끝나야 한다.
- Q12는 추천안 기준으로 진행하고, 결정이 다르면 할 일 6과 해당 인수 조건만 뺀다.

## 라벨

`documentation`
