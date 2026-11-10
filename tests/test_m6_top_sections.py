"""M6 이슈 #21(2-1 상단 영역 반응형) 프론트 소스 인수 테스트.

계약 (구현은 이 계약을 따른다, plan.md 5-2 헤더~국가 쌍 탭 행)
- HomePage.tsx 헤더: 제목 text-xl md:text-2xl, 한 줄(flex-nowrap). 가이드 버튼 aria-label 은 "가이드 · 여행경보 단계",
  " · 여행경보 단계" 부분은 hidden md:inline 으로 md 이상에서만 보인다.
- Panel.tsx: header 가 기본 flex-col(action 이 제목 아래 줄), md:flex-row 로 같은 줄.
- WorldMap.tsx: 그리드 lg:grid-cols-[minmax(0,1fr)_260px] / xl:grid-cols-[minmax(0,1fr)_300px],
  주목 국가 목록 max-h-[320px](lg 미만), md:grid-cols-2(md~lg 2열), 예전 max-h-[380px] 제거, ScrollArea 유지.
- WeeklyMovers.tsx: 기본 1열, md:grid-cols-2.
- PairTabs.tsx: grid-cols-2 / md:grid-cols-3 / lg:grid-cols-4.

실측(헤더 한 줄·폭·높이·열 수·넘침)은 frontend/e2e/top-sections.spec.ts.
"""

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SRC = FRONTEND / "src"
HOME = SRC / "views" / "home" / "ui" / "HomePage.tsx"
PANEL = SRC / "shared" / "ui" / "Panel.tsx"
WORLD_MAP = SRC / "widgets" / "world-map" / "ui" / "WorldMap.tsx"
WEEKLY = SRC / "widgets" / "weekly-movers" / "ui" / "WeeklyMovers.tsx"
PAIR_TABS = SRC / "features" / "select-pair" / "ui" / "PairTabs.tsx"
GUIDE_NAME = "가이드 · 여행경보 단계"
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")
TOKEN = re.compile(r"[\w:\[\]().,/-]+")


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    assert path.exists(), f"없음: {path.relative_to(FRONTEND)}"
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", path.read_text(encoding="utf-8")))


def _tokens(path: Path) -> set[str]:
    return set(TOKEN.findall(_code(path)))


def _missing(path: Path, classes: list[str]) -> list[str]:
    tokens = _tokens(path)
    return [c for c in classes if c not in tokens]


def _header(code: str) -> str:
    m = re.search(r"<header\b.*?</header>", code, re.S)
    assert m, "HomePage 에 <header> 없음"
    return m.group(0)


def test_header_title_size() -> None:
    h1 = re.search(r"<h1\b[^>]*>", _header(_code(HOME)))
    assert h1, "헤더에 h1 없음"
    assert {"text-xl", "md:text-2xl"} <= set(TOKEN.findall(h1.group(0)))


def test_header_guide_button_accessible_name() -> None:
    header = _header(_code(HOME))
    assert f'aria-label="{GUIDE_NAME}"' in header
    # 좁은 폭에서는 "가이드"만, md 이상에서 뒷부분 표시
    assert re.search(r'className="hidden md:inline"[^>]*>\s*·\s*여행경보 단계', header)


def test_panel_action_wraps_below_title() -> None:
    assert _missing(PANEL, ["flex-col", "md:flex-row", "md:items-center", "md:justify-between"]) == []


def test_world_map_grid_and_list() -> None:
    assert _missing(WORLD_MAP, [
        "lg:grid-cols-[minmax(0,1fr)_260px]", "xl:grid-cols-[minmax(0,1fr)_300px]",
        "max-h-[320px]", "md:grid-cols-2",
    ]) == []
    code = _code(WORLD_MAP)
    assert "max-h-[380px]" not in code
    assert "<ScrollArea" in code


def test_weekly_movers_columns() -> None:
    tokens = _tokens(WEEKLY)
    assert "md:grid-cols-2" in tokens
    assert not {"grid-cols-2", "lg:grid-cols-2"} & tokens, "기본 1열, md 부터 2열"


def test_pair_tabs_columns() -> None:
    assert _missing(PAIR_TABS, ["grid-cols-2", "md:grid-cols-3", "lg:grid-cols-4"]) == []
    assert "md:grid-cols-2" not in _tokens(PAIR_TABS)
