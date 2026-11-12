"""이슈 #41(2-3 운영 런북 2: 데이터 이전·백업·복원·가동 감시와 백업 스크립트) 인수 테스트.

런북은 글자로만 읽는다. deploy/backup.sh 는 tmp_path 에 만든 가짜 APP_DIR·BACKUP_DIR 로 실제 bash 에서 실행한다.
실제 data/·out/ 와 서버 경로(/srv, /var/backups)는 건드리지 않는다.

계약 (구현은 이 계약을 따른다)

[deploy/RUNBOOK.md]
- # ~ ### 제목 줄(펜스 코드 블록 밖)의 글에 "데이터 이전", "백업·복원"(가운뎃점 U+00B7), "가동 감시" 가 들어 있다.
    번호·덧붙인 말은 자유(예: ## 5. 백업·복원). 코드 블록 안의 # 줄은 셸 주석이라 제목으로 치지 않는다.
[deploy/backup.sh]
- 저장소 루트에서 bash deploy/backup.sh 로 부른다(실행 비트·shebang 에 기대지 않음). 작업 트리 파일도 LF 만, UTF-8(BOM 없음).
    이 PC 는 core.autocrlf=true 라 다시 checkout 하면 CRLF 가 될 수 있다. 막는 방법(.gitattributes eol=lf 등)은 구현자가 정한다.
- APP_DIR·BACKUP_DIR·KEEP_DAYS 는 환경변수가 있으면 그 값을 쓴다. 받은 경로는 바꾸지 않고 그대로 쓴다.
    기본값(/srv/war-risk-index, /var/backups/war-risk-index, 7)과 BACKUP_DIR 이 없을 때 만드는지는 보지 않는다(리뷰 몫).
- 입력 확인: APP_DIR/data·APP_DIR/out 중 하나라도 폴더가 아니면 압축·정리 전에 0 이 아닌 코드로 끝나고,
    BACKUP_DIR 은 그대로다(지우지도, 반쯤 만든 압축을 남기지도 않는다). 테스트는 이 바깥 결과만 본다.
- KEEP_DAYS 가 0 이상의 정수가 아니면(-1·abc·3.5) 압축 전에 0 이 아닌 코드로 끝나고 BACKUP_DIR 은 그대로다(-1 은 find 가 새 백업까지 지운다).
- 압축: BACKUP_DIR 에 war-risk-<YYYYmmdd-HHMM>.tgz(gzip tar) 하나. 시각대(TZ)는 자유다.
    안의 경로는 APP_DIR 기준 data/…·out/… 다(앞의 ./ 는 허용). 그래야 tar -xzf <백업> -C <APP_DIR> 로 복원된다.
    data/·out/ 아래 파일에서 data/npm_cache·data/gdelt_tmp(폴더 항목까지), *.part, *.tmp 를 뺀 것이 모두 들어간다.
    .env 처럼 APP_DIR 의 다른 파일은 넣지 않는다.
- 정리: 새 백업을 만든 뒤 BACKUP_DIR 의 war-risk-*.tgz 는 KEEP_DAYS 일보다 오래된 것을 지운다.
    정확히 KEEP_DAYS 일인 경계는 보지 않는다. 테스트는 KEEP_DAYS+1일+1시간(지움)과 KEEP_DAYS-1일-1시간(남김)만 쓴다.
    trap 이 못 지운 임시 압축 war-risk-*.part 는 24시간 넘게 안 바뀐 것만 지운다(이틀 된 것 지움, 10분 된 것 남김).
    그 밖의 파일은 오래돼도 둔다.

테스트 방식
- bash: Windows 는 Git Bash 만 쓴다. git.exe 위치(<설치 폴더>\\cmd·bin·mingw64\\bin)에서 <설치 폴더>\\bin\\bash.exe 를 찾고,
    없으면 C:\\Program Files\\Git\\bin\\bash.exe. PATH 의 bash 는 WSL 실행기(System32·WindowsApps)일 수 있어 쓰지 않는다.
    bin\\bash.exe 는 PATH 앞에 /mingw64/bin:/usr/bin 을 둬 GNU tar·find 를 부른다(Windows 의 tar.exe·find.exe 아님).
    리눅스·맥은 PATH 의 bash. 못 찾으면 실행 테스트는 skip 한다.
- Git Bash 는 CRLF 스크립트의 \\r 을 무시하고 돌린다(실측). 그래서 Windows 의 실행 테스트는 CRLF 를 못 잡고
    test_backup_script_has_no_cr 가 막는다(서버 bash 는 $'\\r' 로 깨진다).
- Windows 경로: Git Bash 의 GNU tar 는 -f 인자의 C: 를 원격 호스트로 읽어 실패한다(Cannot connect to C:, 종료 코드 2).
    그래서 APP_DIR·BACKUP_DIR 을 /c/Users/… 꼴(MSYS 경로)로 바꿔 넘긴다. cygpath -u 대신 작은 변환 함수를 쓴다
    (프로세스를 하나 덜 띄우고, tmp_path 는 드라이브 경로라 이것으로 충분하다).
- KEEP_DAYS 는 기본값과 다른 3 으로 넘겨 환경변수로 덮어쓰는지도 본다. 압축 목록은 Python tarfile 로 읽는다.
- 구현 전(54c00e9)에는 RUNBOOK·backup.sh 를 쓰는 테스트가 모두 '파일 없음' 으로 실패했다. test_headings_parser 는 통과했다.

못 잡는 것: 기본값, tar 종료 코드 1(읽는 동안 바뀐 파일)을 성공으로 치는지(이슈 문서대로 코드 리뷰), cron 예시, 리눅스와의 차이.

인수 조건 → 테스트
- 절 제목: test_runbook_sections (제목 읽기 자체: test_headings_parser).
    이슈 할 일 6 은 test_deploy_config.py 에 넣자고 했지만 2-3 테스트를 이 파일에 모았다.
- 종료 코드 0, war-risk-*.tgz 1개, 목록에 data/npm_cache/·.env 없음: test_backup_archive
- KEEP_DAYS+1일 전 war-risk-old.tgz 만 지우고 새 백업은 남음: test_backup_prunes_only_old (리뷰로 더한 .part 정리도 본다)
- 없는 APP_DIR → 0 아닌 종료 코드, BACKUP_DIR 그대로: test_backup_rejects_missing_input[app] (data·out 없음도 같이 본다)
- (리뷰) KEEP_DAYS 가 0 이상의 정수가 아님 → 0 아닌 종료 코드, BACKUP_DIR 그대로: test_backup_rejects_bad_keep_days
- 작업 트리 backup.sh 에 CR 없음: test_backup_script_has_no_cr

명령·서버(이 파일 밖): 커밋 뒤 git ls-files --eol deploy/backup.sh 가 i/lf, 압축 크기 PR 기록, 이전용 압축·리허설, [수동] 항목, 3-1·3-2.
"""

import codecs
import os
import re
import shutil
import subprocess
import tarfile
import time
from datetime import timedelta
from pathlib import Path, PurePosixPath, PureWindowsPath

import pytest

ROOT = Path(__file__).resolve().parents[1]
ENCODING = "utf-8"
NEWLINES = ("\n", "\r\n")  # 자체 검사는 표본을 두 줄바꿈으로 모두 돌린다

# deploy/RUNBOOK.md
RUNBOOK = "deploy/RUNBOOK.md"
RUNBOOK_SECTIONS = ("데이터 이전", "백업·복원", "가동 감시")  # 가운뎃점은 U+00B7
HEADING = re.compile(r"#{1,3}\s+(?P<title>.+)")  # 줄 처음부터 match. ####·#글(공백 없음)은 제목이 아니다
FENCES = ("```", "~~~")  # 펜스 코드 블록을 여닫는 줄의 시작(들여쓰기는 떼고 본다)

# deploy/backup.sh
BACKUP_SCRIPT = "deploy/backup.sh"  # 저장소 루트 기준. 런북 리허설처럼 루트에서 bash deploy/backup.sh 로 부른다
GIT_BASH = Path("bin", "bash.exe")  # Git for Windows 설치 폴더 기준
GIT_BASH_DEFAULT = Path(r"C:\Program Files\Git") / GIT_BASH
RUN_TIMEOUT = 60  # 초. 가짜 APP_DIR 이 작아 보통 1초 안에 끝난다
KEEP_DAYS = 3  # 기본값(7)과 다르게 넘겨 환경변수로 덮어쓰는지도 본다
BACKUP_GLOB = "war-risk-*.tgz"
BACKUP_NAME = re.compile(r"war-risk-\d{8}-\d{4}\.tgz")  # war-risk-<YYYYmmdd-HHMM>.tgz
# 가짜 APP_DIR 에서 압축에 들어가야 하는 파일(인수 조건의 세 파일과 복원에 쓰는 out/ 파일)
KEPT_FILES = ("data/shelters.csv", "data/live/country_15min.csv", "out/index_v1.csv", "out/country_meta.csv",
              "out/blend_weights.json")
# 빠져야 하는 파일: 제외 폴더 안, 원자적 쓰기(.part)·live.py(.tmp) 임시 파일, 루트 .env(비밀값)
DROPPED_FILES = ("data/npm_cache/_cacache/index-v5/00", "data/gdelt_tmp/20261111.export.CSV.zip",
                 "out/index_v1.csv.part", "data/live/country_15min.tmp", ".env")
EXCLUDED_DIRS = ("data/npm_cache", "data/gdelt_tmp")  # 폴더 항목(tar -tzf 의 data/npm_cache/ 줄)도 없어야 한다
# BACKUP_DIR 에 미리 두는 파일 → 수정 시각을 얼마나 과거로 돌릴지. PRUNED 만 지워져야 한다
OLD_BACKUP = "war-risk-old.tgz"
OLD_PART = "war-risk-20000101-0000.tgz.111.part"  # trap 이 못 지운 임시 압축(<백업 이름>.<pid>.part)
PRUNED = {OLD_BACKUP, OLD_PART}
OLD_AGE = timedelta(days=KEEP_DAYS + 1, hours=1)  # 1시간 더 둬 경계 오차를 피한다
SEEDED = {
    OLD_BACKUP: OLD_AGE,
    OLD_PART: timedelta(days=2),  # 24시간 넘게 안 바뀜
    "war-risk-20000101-0001.tgz.222.part": timedelta(minutes=10),  # 다른 실행이 쓰는 중일 수 있다
    "war-risk-recent.tgz": timedelta(days=KEEP_DAYS - 1, hours=-1),  # 덜 오래된 백업
    "war-risk-old.txt": OLD_AGE,  # 오래됐지만 war-risk-*.tgz 가 아니다
}
MISSING_INPUTS = ("app", "data", "out")  # app 은 APP_DIR 자체가 없는 경우
BAD_KEEP_DAYS = ("-1", "abc", "3.5")  # -1 이면 find -mtime +-1 이 새 백업까지 지운다(구현자 실측)


def _read_bytes(rel: str) -> bytes:
    """저장소 기준 파일 바이트(UTF-8, BOM 없음). 없으면 '파일 없음' 으로 실패한다."""
    path = ROOT / rel
    assert path.is_file(), f"파일 없음: {rel}"
    data = path.read_bytes()
    assert not data.startswith(codecs.BOM_UTF8), f"BOM 이 있음: {rel}"
    return data


def _headings(text: str) -> list[str]:
    """# ~ ### 제목 줄의 글. 펜스 코드 블록 안의 # 줄은 셸 주석이라 뺀다."""
    titles: list[str] = []
    fenced = False
    for line in text.splitlines():
        if line.lstrip().startswith(FENCES):
            fenced = not fenced
        elif not fenced and (m := HEADING.match(line)):
            titles.append(m["title"])
    return titles


# ---------- backup.sh 실행 준비 ----------

def _find_bash() -> str | None:
    """Windows 는 Git Bash, 다른 OS 는 PATH 의 bash. 없으면 None."""
    if os.name != "nt":
        return shutil.which("bash")
    git = shutil.which("git")
    # git.exe 는 <설치 폴더>\cmd·bin·mingw64\bin 에 있다. 그 위 1·2단계 폴더에서 bin\bash.exe 를 찾는다
    roots = list(Path(git).parents)[1:3] if git else []
    candidates = [root / GIT_BASH for root in roots] + [GIT_BASH_DEFAULT]
    return next((str(path) for path in candidates if path.is_file()), None)


def _bash_path(path: Path) -> str:
    """bash 에 넘길 경로. Windows 는 C:\\a\\b → /c/a/b(MSYS 경로), 다른 OS 는 그대로."""
    if os.name != "nt":
        return str(path)
    drive, *rest = PureWindowsPath(path).parts
    return "/".join([f"/{drive[0].lower()}", *rest])


def _make_app(tmp_path: Path) -> Path:
    """가짜 APP_DIR(tmp_path/app). 파일마다 자기 상대 경로를 내용으로 쓴다."""
    app_dir = tmp_path / "app"
    for rel in KEPT_FILES + DROPPED_FILES:
        path = app_dir / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rel, encoding=ENCODING)
    return app_dir


def _backup_dir(tmp_path: Path) -> Path:
    """빈 BACKUP_DIR(tmp_path/backups). 없을 때 만드는지는 계약 밖이라 미리 만든다."""
    path = tmp_path / "backups"
    path.mkdir()
    return path


def _seed(backup_dir: Path) -> None:
    """SEEDED 파일을 만들고 수정 시각을 그만큼 과거로 돌린다."""
    now = time.time()
    for name, age in SEEDED.items():
        path = backup_dir / name
        path.write_text(name, encoding=ENCODING)
        then = now - age.total_seconds()
        os.utime(path, (then, then))


def _snapshot(folder: Path) -> dict[str, tuple[int, bytes]]:
    """폴더 바로 아래 파일 → (수정 시각 ns, 내용). 지우거나 새로 만들거나 고치면 달라진다."""
    return {path.name: (path.stat().st_mtime_ns, path.read_bytes()) for path in folder.iterdir()}


def _members(archive: Path) -> tuple[set[str], set[str]]:
    """gzip tar 안의 (폴더 이름들, 파일 이름들). 앞의 ./ 는 뗀다(PurePosixPath 가 . 을 지운다)."""
    with tarfile.open(archive, "r:gz") as tar:
        members = [(PurePosixPath(m.name).as_posix(), m) for m in tar.getmembers()]
    return {name for name, m in members if m.isdir()}, {name for name, m in members if m.isfile()}


def _run(bash: str, app_dir: Path, backup_dir: Path,
         keep_days: str = str(KEEP_DAYS)) -> subprocess.CompletedProcess[str]:
    """저장소 루트에서 bash deploy/backup.sh 를 APP_DIR·BACKUP_DIR·KEEP_DAYS 환경변수로 실행한다."""
    assert (ROOT / BACKUP_SCRIPT).is_file(), f"파일 없음: {BACKUP_SCRIPT}"
    env = {**os.environ, "APP_DIR": _bash_path(app_dir), "BACKUP_DIR": _bash_path(backup_dir),
           "KEEP_DAYS": keep_days}
    return subprocess.run([bash, BACKUP_SCRIPT], cwd=ROOT, env=env, capture_output=True, text=True,
                          encoding=ENCODING, errors="replace", timeout=RUN_TIMEOUT)


@pytest.fixture(scope="module")
def bash() -> str:
    """backup.sh 를 돌릴 bash. 못 찾으면 이 픽스처를 쓰는 테스트를 skip 한다."""
    found = _find_bash()
    if found is None:
        pytest.skip("bash 를 찾지 못함(Windows 는 Git Bash 만 쓴다)")
    return found


# ---------- 런북 ----------

def test_runbook_sections() -> None:
    """deploy/RUNBOOK.md 의 # ~ ### 제목에 데이터 이전·백업·복원·가동 감시 절이 있다."""
    titles = _headings(_read_bytes(RUNBOOK).decode(ENCODING))
    assert [section for section in RUNBOOK_SECTIONS if not any(section in t for t in titles)] == [], titles


# ---------- deploy/backup.sh ----------

def test_backup_archive(bash: str, tmp_path: Path) -> None:
    """종료 코드 0, BACKUP_DIR 에 war-risk-<YYYYmmdd-HHMM>.tgz 가 하나. 제외 대상·.env 없이 data/·out/ 파일이 다 있다."""
    app_dir, backup_dir = _make_app(tmp_path), _backup_dir(tmp_path)
    proc = _run(bash, app_dir, backup_dir)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    names = [path.name for path in backup_dir.glob(BACKUP_GLOB)]
    assert len(names) == 1 and BACKUP_NAME.fullmatch(names[0]), names
    dirs, files = _members(backup_dir / names[0])
    assert dirs & set(EXCLUDED_DIRS) == set(), "제외 폴더 항목이 남음"
    assert files == set(KEPT_FILES)


def test_backup_prunes_only_old(bash: str, tmp_path: Path) -> None:
    """KEEP_DAYS+1일 전 war-risk-old.tgz 와 이틀 된 .part 만 지우고, 새 백업·덜 오래된 백업·10분 된 .part·
    이름이 다른 옛 파일은 남긴다."""
    app_dir, backup_dir = _make_app(tmp_path), _backup_dir(tmp_path)
    _seed(backup_dir)
    proc = _run(bash, app_dir, backup_dir)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    new = [path.name for path in backup_dir.glob(BACKUP_GLOB) if path.name not in SEEDED]
    assert len(new) == 1 and BACKUP_NAME.fullmatch(new[0]), new
    assert {name for name in SEEDED if (backup_dir / name).exists()} == set(SEEDED) - PRUNED


@pytest.mark.parametrize("missing", MISSING_INPUTS)
def test_backup_rejects_missing_input(bash: str, tmp_path: Path, missing: str) -> None:
    """APP_DIR 이 없거나 그 안에 data·out 이 없으면 0 이 아닌 종료 코드이고, BACKUP_DIR 은 그대로다(옛 백업·.part 도 안 지움)."""
    if missing == "app":
        app_dir = tmp_path / "no-such-app"
    else:
        app_dir = _make_app(tmp_path)
        shutil.rmtree(app_dir / missing)
    backup_dir = _backup_dir(tmp_path)
    _seed(backup_dir)
    before = _snapshot(backup_dir)
    proc = _run(bash, app_dir, backup_dir)
    assert proc.returncode != 0, proc.stdout + proc.stderr
    assert _snapshot(backup_dir) == before


@pytest.mark.parametrize("keep_days", BAD_KEEP_DAYS)
def test_backup_rejects_bad_keep_days(bash: str, tmp_path: Path, keep_days: str) -> None:
    """KEEP_DAYS 가 0 이상의 정수가 아니면 0 이 아닌 종료 코드이고, BACKUP_DIR 은 그대로다(새 백업도 남기지 않음)."""
    app_dir, backup_dir = _make_app(tmp_path), _backup_dir(tmp_path)
    _seed(backup_dir)
    before = _snapshot(backup_dir)
    proc = _run(bash, app_dir, backup_dir, keep_days)
    assert proc.returncode != 0, proc.stdout + proc.stderr
    assert _snapshot(backup_dir) == before


def test_backup_script_has_no_cr() -> None:
    """작업 트리의 deploy/backup.sh 에 CR 이 없다(CRLF 면 bash 가 줄 끝 \\r 을 명령 글자로 읽어 깨진다)."""
    assert b"\r" not in _read_bytes(BACKUP_SCRIPT)


# ---------- 판정 함수 자체 검사 ----------

def test_headings_parser() -> None:
    """# ~ ### 줄만 제목이다. 펜스 코드 블록 안의 # 줄(셸 주석), ####, #글(공백 없음)은 제목이 아니다."""
    text = "# 런북\n## 5. 백업·복원\n  ```bash\n# 데이터 이전\n  ```\n#### 가동 감시\n#가동 감시\n"
    for newline in NEWLINES:
        assert _headings(text.replace("\n", newline)) == ["런북", "5. 백업·복원"]
