"""#55 운영 런북(deploy/RUNBOOK.md, Workers 구조)이 실제 설정과 어긋나지 않는지 본다.

글자로만 읽는다(네트워크·aws·wrangler 없음). 설정 값은 하드코딩하지 않고 설정 파일·모듈에서 읽어 비교한다.

계약
- 절 제목(# ~ ###, 코드 블록 밖)에 개요·처음 한 번·첫 업로드·Worker 배포·화면·15분 갱신·백업·복원·가동 감시·비용 이 있다.
- 워크플로가 쓰는 GitHub 시크릿(${{ secrets.X }}), Worker 시크릿(GITHUB_DISPATCH_TOKEN), 프론트 환경변수(NEXT_PUBLIC_*)가
  모두 런북에 있다(빠지면 다시 만들 때 놓친다).
- Worker 이름(workers.dev 주소), Cron 시각, CORS 출처, 백업 접두사·보관 수가 설정 값과 같다.
- 코드 블록의 R2 안 복사(aws s3 cp·sync 의 원본과 대상이 모두 버킷)에는 --copy-props none 이 붙는다
  (R2 는 GetObjectTagging 을 지원하지 않아 큰 파일 복사가 실패한다, #66).
"""

import re
from pathlib import Path

import batch

ROOT = Path(__file__).resolve().parents[1]
RUNBOOK = ROOT / "deploy" / "RUNBOOK.md"
WRANGLER = ROOT / "worker" / "wrangler.jsonc"
SECTIONS = ("개요", "처음 한 번", "첫 업로드", "Worker 배포", "화면", "15분 갱신", "백업", "복원", "가동 감시", "비용")
FENCE = re.compile(r"^\s*(```|~~~)")
BUCKET_PATH = r'"?(?:\$B|s3://)[^"\s]*"?'  # 런북의 버킷 경로 표기($B/… 또는 s3://…)
R2_COPY = re.compile(rf"aws s3 (?:cp|sync) {BUCKET_PATH} {BUCKET_PATH}")


def _text() -> str:
    return RUNBOOK.read_text(encoding="utf-8")


def _split() -> tuple[list[str], list[str]]:
    """런북 줄 → (코드 블록 밖 줄, 코드 블록 안 줄)."""
    outside: list[str] = []
    inside: list[str] = []
    fenced = False
    for line in _text().splitlines():
        if FENCE.match(line):
            fenced = not fenced
            continue
        (inside if fenced else outside).append(line)
    return outside, inside


def _wrangler(key: str) -> str:
    """wrangler.jsonc(주석 있는 JSON)에서 "key": 다음 값(문자열 또는 [ … ])을 글자 그대로 꺼낸다."""
    match = re.search(rf'"{key}"\s*:\s*("[^"]*"|\[[^\]]*\])', WRANGLER.read_text(encoding="utf-8"))
    assert match, key
    return match.group(1)


def test_runbook_is_utf8_without_bom() -> None:
    assert not RUNBOOK.read_bytes().startswith(b"\xef\xbb\xbf")


def test_sections() -> None:
    headings = [line for line in _split()[0] if re.match(r"^ {0,3}#{1,3} ", line)]
    missing = [name for name in SECTIONS if not any(name in heading for heading in headings)]
    assert not missing, missing


def test_github_secrets_documented() -> None:
    """워크플로가 쓰는 GitHub 시크릿 이름이 모두 런북에 있다."""
    secrets = {name for wf in (ROOT / ".github" / "workflows").glob("*.yml")
               for name in re.findall(r"secrets\.([A-Z0-9_]+)", wf.read_text(encoding="utf-8"))}
    assert secrets  # 워크플로에서 시크릿을 하나도 못 읽으면 테스트가 헛돈다
    text = _text()
    assert not [name for name in sorted(secrets) if name not in text]


def test_worker_secret_and_front_env_documented() -> None:
    worker = (ROOT / "worker" / "src" / "index.ts").read_text(encoding="utf-8")
    front = (ROOT / "frontend" / "src" / "shared" / "config" / "env.ts").read_text(encoding="utf-8")
    names = set(re.findall(r"env\.(GITHUB_[A-Z_]+)", worker)) | set(re.findall(r"(NEXT_PUBLIC_[A-Z_]+)", front))
    assert {"GITHUB_DISPATCH_TOKEN", "NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_SITE_URL"} <= names
    text = _text()
    assert not [name for name in sorted(names) if name not in text]


def test_worker_values_match_config() -> None:
    text = _text()
    name = _wrangler("name").strip('"')
    assert f"https://{name}." in text and f"`{name}`" in text
    for cron in re.findall(r'"([^"]+)"', _wrangler("crons")):  # 예: 7,22,37,52 * * * *
        minutes = cron.split()[0].split(",")
        assert "·".join(minutes) + "분" in text, cron
    for origin in _wrangler("CORS_ORIGINS").strip('"').split(","):
        if not origin.startswith("http://localhost"):
            assert origin in text, origin


def test_backup_values_match_batch() -> None:
    text = _text()
    assert f"{batch.BACKUP_PREFIX}<날짜>/" in text
    assert f"{batch.BACKUP_KEEP}개만 남긴다" in text


def test_r2_copies_skip_tagging() -> None:
    """R2 안 복사 명령(코드 블록)에는 모두 --copy-props none 이 붙는다. 복사 명령이 하나도 없으면 테스트가 헛돈다."""
    copies = [line for line in _split()[1] if R2_COPY.search(line)]
    assert copies
    assert not [line for line in copies if "--copy-props none" not in line]
