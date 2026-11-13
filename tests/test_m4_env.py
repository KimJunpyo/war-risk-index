"""이슈 4-1 (공공데이터 API 키 .env 설정 기반) 인수 테스트.

자동화 가능한 조건만 확인한다. 수동: compileall, uvicorn 실제 기동 후 Traceback 확인,
.env 파일에 dummy 를 넣은 기동 확인, 브라우저 화면·콘솔 확인.
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
MAIN_FILE = ROOT / "backend" / "app" / "main.py"
ENV_EXAMPLE = ROOT / ".env.example"
KEY_NAME = "DATA_GO_KR_SERVICE_KEY"
ENDPOINTS = ["/api/pairs", "/api/countries", "/api/live"]
# serviceKey 실제 값 모양: 영숫자 또는 %XX 인코딩 문자가 32자 이상 연속
KEY_LIKE = re.compile(rb"(?:[A-Za-z0-9]|%[0-9A-Fa-f]{2}){32,}")
# package-lock.json 의 integrity(sha512 base64) 해시가 걸림(frontend 444건, worker 도 같음). 비밀값이 아니라 패키지 검증용 공개 해시
KEY_SCAN_EXCLUDED = {"frontend/package-lock.json", "worker/package-lock.json"}
SUBPROCESS_TIMEOUT = 120

# 별도 파이썬에서 실행: lifespan 까지 타도록 with TestClient 사용(LIVE_UPDATES=0 이라 수집 스레드는 안 뜸)
CHILD_SCRIPT = f"""
import json, logging, os, sys
sys.path.insert(0, {str(ROOT)!r})
logging.basicConfig(level=logging.WARNING, stream=sys.stderr, format="%(levelname)s|%(name)s|%(message)s")
from fastapi.testclient import TestClient
import backend.app.main as main
with TestClient(main.app) as c:
    codes = {{p: c.get(p).status_code for p in {ENDPOINTS!r}}}
print(json.dumps({{"codes": codes, "key": os.getenv({KEY_NAME!r}), "const": getattr(main, {KEY_NAME!r}, None)}}))
"""


def _git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")


def _env_example_entries() -> dict[str, str]:
    entries = {}
    for line in ENV_EXAMPLE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name, sep, value = line.partition("=")
        assert sep, f"KEY=VALUE 형식이 아닌 줄: {line!r}"
        entries[name.strip()] = value.strip()
    return entries


def _run_child(key: str | None) -> tuple[dict, str]:
    env = {k: v for k, v in os.environ.items() if k != KEY_NAME}
    env["LIVE_UPDATES"] = "0"
    env["PYTHONIOENCODING"] = "utf-8"
    if key is not None:
        env[KEY_NAME] = key
    proc = subprocess.run([sys.executable, "-c", CHILD_SCRIPT], cwd=ROOT, env=env, capture_output=True,
                          text=True, encoding="utf-8", timeout=SUBPROCESS_TIMEOUT)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout.strip().splitlines()[-1]), proc.stderr


def _key_warnings(stderr: str) -> list[str]:
    return [ln for ln in stderr.splitlines() if ln.startswith("WARNING|") and KEY_NAME in ln]


def test_env_example_exists_with_empty_values() -> None:
    assert ENV_EXAMPLE.is_file()
    entries = _env_example_entries()
    assert KEY_NAME in entries
    assert {k: v for k, v in entries.items() if v} == {}


def test_gitignore_keeps_env_ignored_and_example_tracked() -> None:
    assert "!.env.example" in (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    # check-ignore: 무시되면 0, 무시되지 않으면 1
    assert _git("check-ignore", "-q", ".env").returncode == 0
    assert _git("check-ignore", "-q", ".env.example").returncode == 1


def test_no_key_like_strings_in_repo() -> None:
    # 추적 파일 + 아직 add 안 된 비무시 파일(.env.example 등 새 파일 포함)
    files = _git("ls-files", "--cached", "--others", "--exclude-standard").stdout.splitlines()
    hits = []
    for rel in files:
        path = ROOT / rel
        if rel in KEY_SCAN_EXCLUDED or not path.is_file():
            continue
        hits += [f"{rel}: {m[:20]!r}..." for m in KEY_LIKE.findall(path.read_bytes())]
    assert hits == []


def test_main_defines_key_name_constant() -> None:
    assert re.search(rf'^{KEY_NAME}\s*=\s*["\']{KEY_NAME}["\']', MAIN_FILE.read_text(encoding="utf-8"), re.M)


def test_runs_without_key_and_warns_once() -> None:
    root_env = ROOT / ".env"
    if root_env.is_file() and re.search(rf"^\s*{KEY_NAME}\s*=\s*\S", root_env.read_text(encoding="utf-8"), re.M):
        pytest.skip("루트 .env 에 키가 있어 키 없는 상태를 만들 수 없음")
    result, stderr = _run_child(None)
    assert result["const"] == KEY_NAME
    assert result["codes"] == {p: 200 for p in ENDPOINTS}
    assert len(_key_warnings(stderr)) == 1, stderr
    assert "Traceback" not in stderr


def test_runs_with_dummy_key_without_warning() -> None:
    result, stderr = _run_child("dummy")
    assert result["key"] == "dummy"
    assert result["const"] == KEY_NAME
    assert result["codes"] == {p: 200 for p in ENDPOINTS}
    assert _key_warnings(stderr) == [], stderr
    assert "Traceback" not in stderr
