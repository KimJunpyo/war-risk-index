"""이슈 1-1 (뉴스룸 위협 신호 프론트엔드 제거) 인수 테스트.

자동화 가능한 조건만 소스 grep 으로 확인한다. 화면·Network·콘솔 확인과
tsc·lint 는 수동(frontend 에서 npx tsc --noEmit, npm run lint).
"""

import re
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SOURCE_DIRS = [FRONTEND / "src", FRONTEND / "app"]
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".json", ".txt", ".md"}
# 이슈 인수 조건의 패턴 + 위젯 import 경로
THREAT_CODE = re.compile(r"ThreatPanel|useThreat|entities/threat|widgets/threat-panel|/api/threat|뉴스룸")
THREAT_TEXT = re.compile(r"뉴스룸|위협 신호|threat")
TEXT_FILES = [
    FRONTEND / "public" / "llms.txt",
    FRONTEND / "src" / "entities" / "guide" / "model" / "faq.ts",
    FRONTEND / "app" / "page.tsx",
]
REMOVED_DIRS = [FRONTEND / "src" / "widgets" / "threat-panel", FRONTEND / "src" / "entities" / "threat"]


def _hits(path: Path, pattern: re.Pattern[str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return [f"{path.relative_to(FRONTEND)}:{n}: {line.strip()}"
            for n, line in enumerate(text.splitlines(), 1) if pattern.search(line)]


def test_no_threat_references_in_source() -> None:
    files = [p for d in SOURCE_DIRS for p in d.rglob("*") if p.is_file() and p.suffix in SOURCE_SUFFIXES]
    assert files, "frontend 소스 파일을 찾지 못함"
    hits = [h for p in files for h in _hits(p, THREAT_CODE)]
    assert not hits, "\n".join(hits)


@pytest.mark.parametrize("path", TEXT_FILES, ids=lambda p: p.name)
def test_no_threat_mentions_in_public_text(path: Path) -> None:
    assert path.exists(), f"확인 대상 파일 없음: {path}"
    hits = _hits(path, THREAT_TEXT)
    assert not hits, "\n".join(hits)


@pytest.mark.parametrize("path", REMOVED_DIRS, ids=lambda p: p.name)
def test_threat_dirs_removed(path: Path) -> None:
    assert not path.exists(), f"삭제되지 않음: {path.relative_to(FRONTEND)}"
