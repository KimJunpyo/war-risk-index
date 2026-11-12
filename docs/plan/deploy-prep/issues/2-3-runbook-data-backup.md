# 운영 런북 2: 데이터 이전·백업·복원·가동 감시와 백업 스크립트

## 배경

- **데이터 이전:**
  - 데이터(`data/`, `out/`)는 git에 올리지 않고 DB도 없으므로 파일을 복사해서 옮긴다.
  - "하루 1회" 판단은 `time.time() - mtime`으로 하므로 이전할 때 mtime을 보존해야 한다.
  - 보존하지 않으면 여행경보·대피소·재외공관 갱신이 하루 가까이 밀린다. 일별 재계산도 10분 미뤄진다(`backend/app/main.py`의 `COLLECTOR_IDLE_SECONDS`).
  - **`out/`도 반드시 함께 옮긴다(M9 리뷰):** 일별 재계산은 `build_index`를 `build_country_index`보다 먼저 돌려서, 쌍 지수가 직전 주기 가중치(`out/blend_weights.json`)를 쓴다(`plan.md` 4절 사실 7). 가중치 파일 없이 새 서버를 띄우면 첫날 쌍 지수 `blended`가 최대 약 34점 틀린다(리뷰어 계산).
- **자동 보충:** 서비스가 멈춘 기간의 데이터는 백엔드가 다시 뜨면 저절로 채워진다.
  - 실시간 최근 26시간 슬롯: `live.update`
  - 2.0 일별: `live.backfill`
  - 1.0 일별: `country_collect`
- **백업이 필요한 이유:**
  - 처음부터 다시 수집하면 2013-04부터의 GDELT 일별 파일을 모두 받아야 해서 오래 걸린다(확실하지 않음).
  - append 방식 수집 파일은 줄 중간에서 프로세스가 끝나면 다음 append가 그 줄에 이어 붙어 파싱 오류가 날 수 있다(범위 밖, `plan.md` 10절). 이번에는 매일 백업과 복원 절차로 대비한다.
- **가동 감시:** 외부 서비스가 1-3의 `/api/health`(데이터가 오래되면 503)를 5분 간격으로 본다(Q7).

## 범위

- **포함:**
  - 런북의 "데이터 이전", "백업·복원", "가동 감시" 절
  - `deploy/backup.sh`(신규, 이름은 제안)
  - 로컬 리허설, 절 제목 검사
- **제외:**
  - 서버에서 실행(3-1, 3-2)
  - 서버 밖 자동 백업(`plan.md` 12절 제안)
  - 감시 서비스 가입(U7)

## 할 일

1. **런북 "데이터 이전" 절**
   - 로컬(PowerShell)
     1. 백엔드를 멈춘다. 또는 `LIVE_UPDATES=0`으로 다시 띄운다.
     2. 저장소 루트에서 압축한다. 압축 파일은 저장소 밖에 만든다.
        `tar -czf "$env:TEMP\war-risk-data.tgz" --exclude=data/npm_cache --exclude=data/gdelt_tmp data out`
     3. 크기를 확인하고 `scp`로 서버 `/tmp`에 보낸다.
   - 서버(bash)
     1. 백엔드를 멈춘 상태에서 서비스 사용자로 압축을 푼다.
        `sudo -u warrisk tar -xzf /tmp/war-risk-data.tgz -C /srv/war-risk-index`
        - 서비스 사용자로 풀어야 파일 소유자가 그 사용자가 된다.
        - mtime은 GNU tar 기본 동작으로 보존된다.
     2. 파일 2개의 mtime을 `stat -c %Y`로 확인한다.
     3. 폴더 쓰기 권한을 확인한다: `sudo -u warrisk find /srv/war-risk-index/data /srv/war-risk-index/out -type d ! -writable`의 출력이 없어야 한다. 원자적 쓰기(1-1)가 같은 폴더에 `<파일>.part`를 만들기 때문이다(M9 리뷰).
     4. 백엔드를 시작하고 자동 보충을 확인한다.
     5. `/tmp`의 압축 파일을 지운다.
   - mtime을 보존해야 하는 이유를 한 줄로 적는다.
   - `out/`를 함께 옮기는 이유를 한 줄로 적는다. 못 옮겼으면 첫 기동 전에, 백엔드를 멈춘 상태에서 서비스 사용자로 한 번만 국가 → 쌍 순서로 돌린다. 이 순서여야 쌍 지수가 새 가중치를 쓴다. `out/` 폴더부터 만든다. `out/`은 git 추적 대상이 아니라 새로 clone하면 없고, 지수 쓰기는 폴더를 만들지 않는다(M9 문서 리뷰 실측).
     `cd /srv/war-risk-index && sudo -u warrisk mkdir -p out && sudo -u warrisk .venv/bin/python -c "import build_country_index, build_index; build_country_index.main(); build_index.main()"`
2. **`deploy/backup.sh`** (bash. tar·find·date만 쓰고 새 의존성 없음)
   - **변수:** 맨 위에 두고, 환경변수로 덮어쓸 수 있게 한다.
     - `APP_DIR`: 기본 `/srv/war-risk-index`
     - `BACKUP_DIR`: 기본 `/var/backups/war-risk-index`
     - `KEEP_DAYS`: 기본 7
   - **입력 확인:** `APP_DIR`에 `data`나 `out`이 없으면 0이 아닌 종료 코드로 끝나고 아무것도 지우지 않는다.
   - **압축:** `data/`·`out/`을 `war-risk-<YYYYmmdd-HHMM>.tgz`로 묶는다. 제외 대상: `data/npm_cache`, `data/gdelt_tmp`, `*.part`, `*.tmp`
     - `*.part`는 원자적 쓰기(1-1)·UCDP 다운로드·기존 교체 쓰기의 임시 파일이고, `*.tmp`는 `live.py`의 임시 파일이다(M9에서 이름 확인).
   - **tar 종료 코드:**
     - 1(읽는 동안 파일이 바뀜)은 경고만 남기고 성공으로 처리한다. 2 이상이면 실패다.
     - 일부러 재현하기 어려우므로 코드 리뷰로 확인한다.
   - **오래된 백업 정리:** 새 백업을 만든 뒤에만 `KEEP_DAYS`일보다 오래된 `war-risk-*.tgz`를 지운다.
   - **cron 예시:** `/etc/cron.d/war-risk-backup`에 하루 1회(시각은 런북에서 정한다), 실행 사용자는 `warrisk`. 실행 권한 비트에 기대지 않도록 `/bin/bash`로 호출한다.
3. **런북 "백업·복원" 절**
   - **등록·확인:** cron을 등록하고, 백업이 생기는지 `ls -lh`, `tar -tzf … | head`로 확인한다.
   - **비밀값:** 백업에 `.env`는 넣지 않는다. 원본은 로컬 PC의 `.env`다.
   - **서버 밖 사본:** Q6 추천대로 주 1회 로컬 PC로 `scp` 한다.
   - **복원 절차:**
     1. 백엔드를 멈춘다.
     2. 현재 `data`·`out`은 지우지 않고 날짜를 붙인 이름으로 바꿔 보관한다.
     3. 서비스 사용자로 백업을 푼다.
     4. 백엔드를 시작한다.
     5. `/api/health`, `/api/pairs`, `/api/countries`를 확인한다.
     6. 문제가 없으면 보관본을 지운다. 지우기 전에 대상 목록을 확인한다.
   - **파싱 오류:** 로그에 CSV 파싱 오류가 보이면 직전 백업으로 복원한다. append가 끊겨 줄이 깨진 경우다. 빈 기간은 자동으로 채워진다.
4. **런북 "가동 감시" 절**
   - **등록:** 외부 감시(Q7)에 두 주소를 등록한다. 5분 간격, 가능하면 GET 방식, 알림은 메일이다.
     - `https://<도메인>/api/health`
     - `https://<도메인>/`
   - **알림을 받았을 때 점검 순서:**
     1. `systemctl status war-risk-api war-risk-web caddy`
     2. `journalctl -u war-risk-api --since "1 hour ago"`. 이 순서는 알림이 왔을 때 쓴다. UCDP 갱신은 실패해도 헬스 체크가 200이라 알림이 오지 않으므로 아래 6번으로 따로 본다(1-2).
     3. `curl -s https://<도메인>/api/health`: 실시간과 일별 중 무엇이 늦었는지 본다. 나이 두 값을 읽는 법을 한 줄씩 적는다(1-3, M9 실측).
        - `live_age_minutes`: 분 단위 내림 정수다. 정상 범위는 약 −11~+20분이고 음수도 정상이다. GDELT 2.0 슬롯 key가 실제 발행보다 약 10~11분 늦기 때문이다. 60을 넘으면 503이다.
        - `index_age_days`: UTC 달력 날짜 차다. 정상값은 1~2다. D일 GDELT 1.0 파일이 D+1일 07:00 UTC 무렵 올라오기 때문이다. 3을 넘으면 503이다.
     4. GDELT 접속: `curl -sIL http://data.gdeltproject.org/gdeltv2/lastupdate.txt`. 301 다음 200이 보이면 나가는 80·443이 모두 열려 있다.
     5. 디스크 `df -h`, 메모리 `free -m`, OOM `journalctl -k | grep -i "out of memory"`
     6. **UCDP 기준일(월 1회, 알림과 별개):** `cat /srv/war-risk-index/data/ucdp_country_monthly.csv.asof`가 오늘보다 90일 넘게 오래됐으면 UCDP 갱신이 멈춘 것이다.
        - 정상은 약 60일 이내다(확실하지 않음). UCDP 후보판은 한 달 이내 지연으로 월 1회 공개되므로, 다음 공개 직전에 가장 오래돼 약 60일이 된다. 공개일은 정해져 있지 않다. 지금 값 2026-10-04는 2026-11-12 기준 39일이다.
        - 접속 실패는 `journalctl -u war-risk-api --since "30 days ago" | grep -c "UCDP 갱신 실패"`로 보인다.
        - 페이지 모양이 바뀐 경우는 로그가 없다. 받은 뒤 집계가 실패한 경우는 실패한 날 한 번만 남고, 다음 UCDP 버전까지 다시 집계하지 않는다(1-2). 어느 쪽인지는 `ucdp.latest_urls()`가 빈 목록인지로 가린다(빈 목록이면 페이지 모양이 바뀐 것).
        - 집계 실패였다면 백엔드를 멈추고 서비스 사용자로 `ucdp.update(force=True)`를 한 번 실행한다. 페이지 모양이 바뀐 경우는 `ucdp.py`의 `GED_PATTERN`·`CANDIDATE_PATTERN`을 고쳐야 한다.
   - **조치:** 점검 결과에 따라 재시작, 되돌리기(2-2), 복원 중 하나를 고른다.
5. **로컬 리허설** (2-2에서 만든 저장소 밖 사본을 쓴다)
   - 이전용 압축을 만들어 사본에 풀고 원본과 비교한다. 사본에서 백엔드(포트 8001, `LIVE_UPDATES=0`)를 띄워 API를 확인한다.
   - Git Bash에서 `APP_DIR=<사본 경로> BACKUP_DIR=<임시 폴더> bash deploy/backup.sh`를 실행한다.
   - 끝나면 사본, 임시 폴더, 압축 파일을 지운다. 지우기 전에 대상 목록을 보여 준다.
6. **절 제목 검사:** `tests/test_deploy_config.py`에 추가한다. 대상은 데이터 이전, 백업·복원, 가동 감시다.

## 인수 조건

### 로컬에서 확인

- [ ] 런북에 "데이터 이전", "백업·복원", "가동 감시" 절 제목이 있다. [테스트]
- [ ] 런북의 이전 명령으로 만든 압축 파일을 `tar -tzf`로 보면 다음과 같다. [명령]
  - 없어야 하는 것: `data/npm_cache/`, `data/gdelt_tmp/`
  - 있어야 하는 것: `out/index_v1.csv`, `data/shelters.csv`, `data/live/country_15min.csv`
- [ ] 그 압축을 임시 폴더에 풀었을 때 다음을 만족한다. [명령]
  - 파일 수가 원본(`data/npm_cache`·`data/gdelt_tmp` 제외)과 같다.
  - `data/shelters.csv`와 `out/country_meta.csv`의 `LastWriteTimeUtc`가 원본과 1초 이내로 같다.
- [ ] 2-2의 사본에 풀고 `LIVE_UPDATES=0`으로 띄운 백엔드(포트 8001)에서 다음을 확인한다. [명령]
  - `/api/pairs`, `/api/countries`가 200이다.
  - `/api/live`의 `as_of`가 같은 데이터를 쓰는 원본 백엔드와 같다.
- [ ] Git Bash에서 `backup.sh`를 실행하면 종료 코드가 0이고, `BACKUP_DIR`에 `war-risk-*.tgz`가 1개 생긴다. 압축 목록에 `data/npm_cache/`와 `.env`가 없다. 압축 크기를 PR에 적는다(Q6 판단용). [명령]
- [ ] `BACKUP_DIR`에 수정 시각이 `KEEP_DAYS + 1`일 전인 가짜 백업(`war-risk-old.tgz`)을 두고 실행하면 그 파일만 지워지고 새 백업은 남는다. [명령]
- [ ] `APP_DIR`을 없는 경로로 주면 0이 아닌 종료 코드로 끝나고 `BACKUP_DIR`의 파일은 그대로다. [명령]
- [ ] 가동 감시 절에 감시 주소 2개, 알림 때 점검 명령 5단계, UCDP 기준일 점검(6번)이 있다. [수동]
  - 3단계에는 `live_age_minutes`·`index_age_days`의 정상 범위(음수 정상 포함)와 503 기준이 있다.
  - 6번에는 `.asof` 확인 명령, 90일 기준, 원인별 조치(접속 실패·페이지 모양 변경·집계 실패)가 있다.
- [ ] 데이터 이전 절에 다음이 있다. [수동]
  - `out/`를 함께 옮기는 이유, 그리고 못 옮겼을 때 첫 기동 전에 `out/` 폴더를 만들고 `build_country_index` → `build_index` 순서로 돌리는 명령(백엔드 정지 상태)
  - `data/`·`out/` 폴더 쓰기 권한 확인 명령
- [ ] 복원 절은 현재 데이터를 지우지 않고 이름을 바꿔 보관하는 순서로 돼 있다. [수동]
- [ ] 커밋한 뒤 `git ls-files --eol deploy/backup.sh`가 `i/lf`다. [명령]
- [ ] `.venv\Scripts\python.exe -m pytest tests`가 전부 통과한다. [테스트]

### 서버에서 확인(M3)

- 3-1: 데이터 이전 절을 실행하고 mtime 보존, 폴더 쓰기 권한, 자동 보충을 확인한다.
- 3-2: cron 백업, 복원 리허설, 감시 알림 수신, 서버 밖 사본을 확인한다.

## 영향 파일

- `deploy/RUNBOOK.md`(절 추가)
- `deploy/backup.sh`(신규, 이름은 제안)
- `tests/test_deploy_config.py`(절 제목 검사 추가)

## 관련 시안

없음(`plan.md` 5절 구성도, 7절 운영자 흐름)

## 선행 이슈

- 2-2: 같은 런북 파일이고, 2-2의 저장소 밖 사본을 다시 쓴다.
- 1-1: 재시작·복원 설명이 원자적 쓰기를 전제로 한다.
- 1-3: 감시 주소 `/api/health`

## 라벨

`documentation`, `enhancement`
