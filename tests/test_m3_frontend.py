"""M3 이슈 #6(3-1)·#7(3-2)·#8(3-3) 프론트 소스 인수 테스트.

순수 로직은 node --test 로 확인한다:
  frontend/src/widgets/weekly-movers/model/movers.test.ts, frontend/src/entities/guide/model/checklist.test.ts
여기서는 그 모듈이 별칭 없이 import 되는지와 고정 문구·속성만 소스 grep 으로 확인한다.
렌더·클릭·새로고침 후 체크 유지·Network 0건·하이드레이션 경고·폭·콘솔·tsc·lint 는 브라우저 수동.
"""

import re
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SRC = FRONTEND / "src"
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")

MOVERS = SRC / "widgets" / "weekly-movers" / "model" / "movers.ts"
CHECKLIST = SRC / "entities" / "guide" / "model" / "checklist.ts"
GUIDE = SRC / "entities" / "guide" / "model" / "guide.ts"
GRADE = SRC / "shared" / "lib" / "grade.ts"
ACTION_GUIDE = SRC / "entities" / "guide" / "ui" / "ActionGuide.tsx"
PAST_CASES = SRC / "widgets" / "past-cases" / "ui" / "PastCases.tsx"
PAST_CASES_NOTICE = "과거 11건 중 개전 5건, 전쟁 없이 지나간 위기 6건입니다. 점수만으로는 전쟁이 날지 구분할 수 없었습니다."


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    assert path.exists(), f"없음: {path.relative_to(FRONTEND)}"
    text = path.read_text(encoding="utf-8")
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", text))


# node --test 가 @/ 별칭을 못 풀므로 단일 파일 계약
@pytest.mark.parametrize("path", [MOVERS, CHECKLIST], ids=["movers", "checklist"])
def test_pure_module_is_alias_free(path: Path) -> None:
    assert not re.search(r"from\s+[\"']@/", _code(path)), "@/ 별칭 import 사용"


# --- #6 (3-1) ---

def test_weekly_movers_widget_exists() -> None:
    assert (SRC / "widgets" / "weekly-movers" / "index.ts").exists()
    assert "weeklyMovers" in _code(SRC / "widgets" / "weekly-movers" / "ui" / "WeeklyMovers.tsx")


# --- #7 (3-2) ---

def test_past_cases_fixed_notice() -> None:
    assert PAST_CASES_NOTICE in _code(PAST_CASES)


# --- #8 (3-3) ---

def test_band_boundaries_unchanged() -> None:
    # 구간 경계 50/100/150 유지
    assert re.search(r"\bEXTREME\s*=\s*150\b", _code(GUIDE))
    grade = _code(GRADE)
    assert re.search(r"\bHIGH_RISK\s*=\s*100\b", grade)
    assert re.search(r"\bTENSION\s*=\s*50\b", grade)


def test_guide_uses_checklist() -> None:
    assert re.search(r"from\s+[\"']\./checklist(\.ts)?[\"']", _code(GUIDE)), "guide.ts 가 checklist.ts 를 쓰지 않음"


def test_action_guide_checkbox_and_storage() -> None:
    code = _code(ACTION_GUIDE)
    assert 'type="checkbox"' in code
    assert "<label" in code
    assert "CHECKLIST_STORAGE_KEY" in code and "localStorage" in code
    assert "useEffect" in code, "마운트 후 localStorage 읽기(하이드레이션 불일치 방지)"


def test_action_guide_source_link_new_tab() -> None:
    code = _code(ACTION_GUIDE)
    assert "CHECKLIST_SOURCE" in code
    assert 'target="_blank"' in code and 'rel="noreferrer"' in code


def test_action_guide_no_network() -> None:
    code = _code(ACTION_GUIDE)
    assert not re.search(r"\bfetch\s*\(|useFetch|/api/", code)
