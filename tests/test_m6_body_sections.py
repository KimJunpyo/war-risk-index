"""M6 이슈 #22(2-2 본문 영역 반응형) 프론트 소스 인수 테스트.

실측(요약 줄, 여행경보 목록, 체크리스트·대피소·재외공관 배치, 패널 그리드, 뉴스 목록 높이, 과거 사례 폭,
상호작용, 가로 넘침·콘솔 오류)은 frontend/e2e/body-sections.spec.ts.
여기서는 그 배치를 만드는 수단이 소스에 있는지만 본다(클래스 이름은 구현이 정한다).

계약 (plan.md 5-2 요약~FAQ 행)
- NewsFeed.tsx: 뉴스 목록 최대 높이 480 / 560(md) / 720(lg 이상)px 를 모듈 상수로 둔다(Tailwind 클래스 문자열째도 됨).
- HomePage.tsx 패널 그리드: 오른쪽 열 lg 360px, xl 400px (lg:grid-cols-[…_360px], xl:grid-cols-[…_400px]).
- CatalystPanel 은 두 열을 차지하지 않는다(감싸는 요소·prop 포함 col-span-2 없음).
- ActionGuide 항목 열 수를 부모 배치로 바꿀 수단: 새 prop(HomePage 가 넘김) 또는 컨테이너 쿼리(@container + @…:grid-cols-2).
- 여행경보 줄(kr_mofa 정렬이 있는 .tsx): md 미만에서만 보이는 기관별 목록 ul > li, 외교부 맨 앞 정렬 유지.
"""

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SRC = FRONTEND / "src"
HOME = SRC / "views" / "home" / "ui" / "HomePage.tsx"
NEWS_FEED = SRC / "widgets" / "news-feed" / "ui" / "NewsFeed.tsx"
CATALYST = SRC / "widgets" / "catalyst-panel" / "ui" / "CatalystPanel.tsx"
ACTION_GUIDE = SRC / "entities" / "guide" / "ui" / "ActionGuide.tsx"
NEWS_MAX_H = [480, 560, 720]  # 기본·md·lg 이상
RIGHT_COL_W = {"lg": 360, "xl": 400}
ACTION_GUIDE_PROPS = {"score", "status", "onMore"}  # 이슈 전부터 있던 prop
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    assert path.exists(), f"없음: {path.relative_to(FRONTEND)}"
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", path.read_text(encoding="utf-8")))


def _module_consts(code: str) -> str:
    """모듈 최상위 const 선언(들여쓰기 없는 줄에서 ; 까지)."""
    return "\n".join(re.findall(r"^(?:export\s+)?const\s+\w+[^;]*;", code, re.M))


def _advisory_code() -> str:
    """여행경보 줄을 그리는 .tsx(외교부 맨 앞 정렬 kr_mofa 가 있는 파일)."""
    files = [p for p in sorted(SRC.rglob("*.tsx")) if "kr_mofa" in _code(p)]
    assert files, "여행경보 줄(kr_mofa 정렬)을 그리는 파일 없음"
    return "\n".join(_code(p) for p in files)


def test_news_list_max_heights_are_constants() -> None:
    consts = _module_consts(_code(NEWS_FEED))
    assert [h for h in NEWS_MAX_H if not re.search(rf"(?<!\d){h}(?:px)?(?!\d)", consts)] == []


def test_panel_grid_right_column_widths() -> None:
    code = _code(HOME)
    # 마지막 트랙(오른쪽 열)이 폭 단계별 값
    missing = [f"{bp}:{px}px" for bp, px in RIGHT_COL_W.items()
               if not re.search(rf"\b{bp}:grid-cols-\[[^\]\s]*(?<!\d){px}px\]", code)]
    assert missing == []


def test_catalyst_panel_not_spanning_two_columns() -> None:
    home = _code(HOME)
    # 왼쪽 열 둘째 행: 감싸는 요소나 prop 으로 두 열을 차지하지 않는다
    assert not re.search(r"col-span-2[^<]*>\s*(?:\{\s*\}\s*)*<CatalystPanel\b", home)
    assert not re.search(r"<CatalystPanel\b[^>]*col-span-2", home)
    assert "col-span-2" not in _code(CATALYST)


def test_action_guide_columns_adjustable() -> None:
    guide = _code(ACTION_GUIDE)
    home = _code(HOME)
    sig = re.search(r"function ActionGuide\(\{([^}]*)\}", guide)
    assert sig, "ActionGuide 함수 없음"
    props = {p.split("=")[0].strip() for p in sig.group(1).split(",") if p.strip()}
    tag = re.search(r"<ActionGuide\b[\s\S]*?/>", home)
    assert tag, "HomePage 에 <ActionGuide /> 없음"
    # (1) 새 prop 을 HomePage 가 넘기거나 (2) 컨테이너 쿼리로 부모 폭에 맞춤
    by_prop = any(re.search(rf"\b{re.escape(p)}\b", tag.group(0)) for p in props - ACTION_GUIDE_PROPS)
    by_container = "@container" in guide + home and re.search(r"@[\w\[\]().-]+:grid-cols-2", guide)
    assert by_prop or by_container, "화면 폭(md:)만으로 열 수를 정하면 대피소·재외공관 옆(lg 이상)에서도 2열이 됨"


def test_advisory_list_below_md() -> None:
    code = _advisory_code()
    assert re.search(r"sort\([^;]*kr_mofa", code), "외교부 맨 앞 정렬 유지"
    assert re.search(r"<ul\b", code) and re.search(r"<li\b", code), "기관별 목록 ul > li"
    assert re.search(r"\bmd:hidden\b|\bmax-md:", code), "기관별 목록은 md 미만에서만"
