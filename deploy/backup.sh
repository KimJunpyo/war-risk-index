#!/usr/bin/env bash
# war-risk-index 데이터 백업: APP_DIR 의 data/·out/ 를 BACKUP_DIR/war-risk-<YYYYmmdd-HHMM>.tgz 로 묶고 오래된 백업을 지운다.
# 값은 서버 규약(docs/plan/deploy-prep/plan.md 5절)을 따른다. cron 등록·복원은 deploy/RUNBOOK.md "백업·복원" 절.
# cron(/etc/cron.d/war-risk-backup, 사용자 warrisk)은 실행 비트에 기대지 않게 /bin/bash <이 파일> 로 부른다.
# 백엔드 갱신 스레드가 도는 중에 돌아도 된다: 쓰는 중인 임시 파일은 빼고, 읽는 동안 바뀐 파일은 경고만 남긴다.
set -euo pipefail
umask 077  # 백업(600)을 실행 사용자만 읽게 한다. 기본 umask 022 면 서버의 다른 사용자도 읽을 수 있다

# 환경변수가 있으면 그 값을 그대로 쓴다.
APP_DIR="${APP_DIR:-/srv/war-risk-index}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/war-risk-index}"  # 만들지 않는다(런북에서 서비스 사용자 소유로 미리 만든다)
KEEP_DAYS="${KEEP_DAYS:-7}"  # find -mtime +KEEP_DAYS 로 지운다: 나이를 일 단위로 내림하므로 KEEP_DAYS+1일 이상 지난 백업부터 지운다

NAME_PREFIX=war-risk-  # 백업 이름 앞부분. 정리도 이 이름(war-risk-*.tgz)만 지운다
# 뺄 것: 다시 받는 캐시·임시 다운로드 폴더, 원자적 쓰기·UCDP 다운로드(*.part)와 live.py(*.tmp)의 임시 파일
EXCLUDES=(--exclude=data/npm_cache --exclude=data/gdelt_tmp --exclude='*.part' --exclude='*.tmp')

die() {
  echo "backup.sh: $*" >&2
  exit 1
}

# 입력 확인은 압축·정리보다 먼저 한다. 여기서 끝나면 BACKUP_DIR 은 그대로다.
for dir in "$APP_DIR/data" "$APP_DIR/out" "$BACKUP_DIR"; do
  [[ -d "$dir" ]] || die "폴더가 없음: $dir"
done
# find 는 -mtime +-1 같은 값도 받아 새 백업까지 지우므로 0 이상의 정수만 받는다
[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || die "KEEP_DAYS 는 0 이상의 정수여야 함: $KEEP_DAYS"

archive="$BACKUP_DIR/$NAME_PREFIX$(date +%Y%m%d-%H%M).tgz"
# 임시 이름에 다 쓴 뒤 mv 로 바꿔 반쯤 만든 압축이 war-risk-*.tgz 로 보이지 않게 한다. $$ 는 같은 분에 두 번 돌 때 겹치지 않게
part="$archive.$$.part"
trap 'rm -f "$part"' EXIT  # 실패·중단 때 임시 파일을 지운다(mv 뒤에는 없어서 그냥 지나간다)

# -C 로 안의 경로를 data/…·out/… 로 둬 tar -xzf <백업> -C <APP_DIR> 로 복원되게 한다
status=0
tar -czf "$part" "${EXCLUDES[@]}" -C "$APP_DIR" data out || status=$?
# 1 = 읽는 동안 바뀌거나 지워진 파일이 있음(갱신 스레드가 쓰는 중): 경고만 남기고 성공으로 친다. 2 이상은 실패다.
if (( status == 1 )); then
  echo "backup.sh: 경고: 압축하는 동안 바뀐 파일이 있음(tar 종료 코드 1). 백업은 성공으로 친다" >&2
elif (( status != 0 )); then
  exit "$status"
fi
mv "$part" "$archive"

# 새 백업을 만든 뒤에만 오래된 백업을 지운다.
find "$BACKUP_DIR" -maxdepth 1 -type f -name "$NAME_PREFIX*.tgz" -mtime +"$KEEP_DAYS" -delete
# SIGKILL·OOM·전원 차단으로 trap 이 못 지운 임시 파일. 하루 넘게 안 바뀐 것만 지워 다른 실행이 쓰는 중인 것은 둔다
find "$BACKUP_DIR" -maxdepth 1 -type f -name "$NAME_PREFIX*.part" -mtime +0 -delete
