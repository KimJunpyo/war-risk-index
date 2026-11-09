"""이슈 1-2 (뉴스룸 위협 신호 백엔드·수집 스크립트 제거) 인수 테스트.

자동화 가능한 조건만 확인한다. 수동: PR 삭제 목록 확인, LIVE_UPDATES=1 로 1시간 10분
이상 띄워 data/newsroom·data/ai_threat 수정 시각 불변, 같은 실행에서 /api/live as_of
30분 내 갱신, uvicorn 기동 후 30초 Traceback 0건, 브라우저 화면·콘솔 확인.
"""

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
THREAT_PATTERN = re.compile(rb"newsroom|ai_threat|threat_lexicon|_threat_refresh|THREAT_FILE")
# 이슈의 제외 목록 + 캐시(.pytest_cache), 기획 기록(docs), 이 테스트 자신(tests),
# Next 빌드 산출물(.next: dev 서버가 lock 파일을 잡고 있어 읽기 실패)
EXCLUDED_DIRS = {"node_modules", ".venv", ".git", "data", "out", "__pycache__", ".pytest_cache", "docs", "tests",
                 ".next"}
REMOVED_FILES = ["newsroom.py", "newsroom.json", "ai_threat.py", "threat_lexicon.py"]
OK_ENDPOINTS = [
    "/api/pairs",
    "/api/countries",
    "/api/countries/KOR/index",
    "/api/countries/KOR/catalysts",
    "/api/blend",
    "/api/live",
]


def test_threat_endpoint_removed(client) -> None:
    assert client.get("/api/threat").status_code == 404


def test_no_threat_references_in_repo() -> None:
    hits = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIRS]
        for name in filenames:
            path = Path(dirpath) / name
            # 바이너리도 걸러내지 않고 바이트 단위로 찾는다
            for n, line in enumerate(path.read_bytes().splitlines(), 1):
                if THREAT_PATTERN.search(line):
                    hits.append(f"{path.relative_to(ROOT)}:{n}")
    assert not hits, "\n".join(hits)


@pytest.mark.parametrize("name", REMOVED_FILES)
def test_threat_scripts_removed(name: str) -> None:
    assert not (ROOT / name).exists(), f"삭제되지 않음: {name}"


@pytest.mark.parametrize("path", OK_ENDPOINTS)
def test_remaining_endpoints_ok(client, path: str) -> None:
    res = client.get(path)
    assert res.status_code == 200, res.text


def test_backend_compiles() -> None:
    res = subprocess.run([sys.executable, "-m", "compileall", "-q", "backend"],
                         cwd=ROOT, capture_output=True, text=True)
    assert res.returncode == 0, res.stdout + res.stderr
