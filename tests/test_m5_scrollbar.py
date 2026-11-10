"""M5 이슈 #20(1-2 오버레이 스크롤바 직접 구현) 프론트 소스 인수 테스트.

thumb 크기·위치 계산은 node --test 로 확인한다(계약은 그 파일 상단 주석):
  frontend/src/shared/lib/scrollbar.test.ts
여기서는 숨김 CSS, 모듈 배치·공개, 위젯 적용, 의존성 불변만 소스 grep 으로 확인한다.

계약 (구현은 이 계약을 따른다)
- frontend/app/globals.css: `scrollbar-width: none` 과 `::-webkit-scrollbar { display: none }` (예: @utility no-native-scrollbar).
- frontend/src/shared/lib/scrollbar.ts: 별칭(@/) import 없음, shared/lib/index.ts 에서 thumbMetrics·scrollTopFromDrag 공개.
- frontend/src/shared/ui/index.ts 에서 ScrollArea(내부 스크롤 컴포넌트)·useOverlayScrollbar(훅)·PageScrollbar(페이지용) 공개.
- 주목 국가 목록(WorldMap)·뉴스 목록(NewsFeed)·가이드 모달(GuideModal)은 "@/shared/ui" 에서 ScrollArea 또는 useOverlayScrollbar 를 쓴다.
- app/layout.tsx 또는 HomePage.tsx 가 PageScrollbar 를 쓴다.
- shared/ui 구현: thumb 에 aria-hidden="true", setPointerCapture, ResizeObserver(+disconnect), requestAnimationFrame(+cancelAnimationFrame),
  removeEventListener 로 해제.
- frontend/package.json dependencies·devDependencies 는 아래 스냅샷과 같다(새 라이브러리 없음).

브라우저 수동: Chrome·Edge·Firefox(Windows)에서 네 곳 offsetWidth - clientWidth == 0(페이지는 innerWidth - clientWidth),
뉴스 기간 전환 시 첫 항목 left·right·width 변화 0px, 네이티브 트랙·화살표 안 보임(스크린샷), 안 넘치는 영역에 thumb DOM 없음,
맨 아래에서 thumb 끝·영역 끝 차 1px 이하, 드래그 추종·끝까지 끌기·텍스트 선택 없음·영역 밖 포인터 유지,
숨김 지연 뒤 opacity 0·hover 재표시, 휠·키보드(방향키·PageDown·End)·Tab·터치 스크롤, thumb Tab 포커스 안 됨,
reduced-motion 시 transition-duration 0.01ms 이하, 모달 thumb·닫기 줄 겹침·닫은 뒤 페이지 thumb, 1분 스크롤 long task 50ms 초과 없음,
macOS·iOS 이중 thumb 없음, 360/768/1080/1440px scrollWidth <= innerWidth·콘솔 오류 0건, tsc·lint.
"""

import json
import re
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SRC = FRONTEND / "src"
GLOBALS_CSS = FRONTEND / "app" / "globals.css"
LAYOUT = FRONTEND / "app" / "layout.tsx"
HOME = SRC / "views" / "home" / "ui" / "HomePage.tsx"
SHARED_LIB = SRC / "shared" / "lib"
SHARED_UI = SRC / "shared" / "ui"
SCROLLBAR = SHARED_LIB / "scrollbar.ts"
SCROLLBAR_TEST = SHARED_LIB / "scrollbar.test.ts"
WIDGETS = {
    "world-map": SRC / "widgets" / "world-map" / "ui" / "WorldMap.tsx",
    "news-feed": SRC / "widgets" / "news-feed" / "ui" / "NewsFeed.tsx",
    "guide-modal": SRC / "widgets" / "guide-modal" / "ui" / "GuideModal.tsx",
}
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")

# 이슈 #20 착수 전(2026-11-10) frontend/package.json 스냅샷
DEPENDENCIES = {
    "d3-geo": "^3.1.2",
    "d3-selection": "^3.0.1",
    "d3-zoom": "^3.0.1",
    "next": "16.4.5",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "topojson-client": "^3.1.0",
    "world-atlas": "^2.0.2",
}
DEV_DEPENDENCIES = {
    "@tailwindcss/turbopack": "^4",
    "@types/d3-geo": "^3.1.1",
    "@types/d3-selection": "^3.0.12",
    "@types/d3-zoom": "^3.0.9",
    "@types/geojson": "^7946.0.16",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@types/topojson-client": "^3.1.5",
    "eslint": "^9",
    "eslint-config-next": "16.4.5",
    "tailwindcss": "^4",
    "typescript": "^5",
}


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    assert path.exists(), f"없음: {path.relative_to(FRONTEND)}"
    text = BLOCK_COMMENT.sub("", path.read_text(encoding="utf-8"))
    return text if path.suffix == ".css" else LINE_COMMENT.sub("", text)


def _dir_code(path: Path) -> str:
    """디렉터리 아래 .ts/.tsx(테스트 제외) 소스를 이어 붙임."""
    assert path.is_dir(), f"없음: {path.relative_to(FRONTEND)}"
    return "\n".join(_code(p) for p in sorted(path.rglob("*.ts*")) if ".test." not in p.name)


def _imports_from(code: str, module: str) -> set[str]:
    """`import { a, type B } from "module"` 의 이름 목록."""
    names: set[str] = set()
    for m in re.finditer(r"import\s*\{([^}]*)\}\s*from\s*[\"']" + re.escape(module) + r"[\"']", code):
        names |= {n.strip().removeprefix("type ").strip() for n in m.group(1).split(",") if n.strip()}
    return names


# --- 숨김 CSS ---

def test_native_scrollbar_hidden_css() -> None:
    css = _code(GLOBALS_CSS)
    assert re.search(r"scrollbar-width\s*:\s*none", css)
    assert re.search(r"::-webkit-scrollbar\s*\{[^}]*display\s*:\s*none", css)


# --- 순수 함수 모듈 ---

def test_scrollbar_lib_exists_and_alias_free() -> None:
    assert SCROLLBAR_TEST.exists(), "scrollbar.test.ts 없음"
    # node --test 가 @/ 별칭을 못 풀므로 단일 파일 계약
    assert not re.search(r"from\s+[\"']@/", _code(SCROLLBAR)), "@/ 별칭 import 사용"


def test_scrollbar_lib_exported() -> None:
    code = _code(SHARED_LIB / "index.ts")
    m = re.search(r"export\s*\{([^}]*)\}\s*from\s*[\"']\./scrollbar[\"']", code)
    assert m and {"thumbMetrics", "scrollTopFromDrag"} <= {n.strip() for n in m.group(1).split(",")}


# --- 공용 훅·컴포넌트 ---

def test_shared_ui_exports() -> None:
    code = _code(SHARED_UI / "index.ts")
    for name in ("ScrollArea", "useOverlayScrollbar", "PageScrollbar"):
        assert re.search(rf"\b{name}\b", code), name


def test_shared_ui_thumb_behavior() -> None:
    code = _dir_code(SHARED_UI)
    for needle in ('aria-hidden="true"', "setPointerCapture", "ResizeObserver", "disconnect",
                   "requestAnimationFrame", "cancelAnimationFrame", "removeEventListener",
                   "thumbMetrics", "scrollTopFromDrag"):
        assert needle in code, needle


@pytest.mark.parametrize("name", list(WIDGETS))
def test_widget_uses_overlay_scrollbar(name: str) -> None:
    code = _code(WIDGETS[name])
    names = _imports_from(code, "@/shared/ui")
    # import 에 더해 본문에서 한 번 이상 써야 한다
    used = [n for n in names & {"ScrollArea", "useOverlayScrollbar"} if len(re.findall(rf"\b{n}\b", code)) >= 2]
    assert used, name


def test_page_scrollbar_mounted() -> None:
    assert any("PageScrollbar" in _imports_from(_code(p), "@/shared/ui") for p in (LAYOUT, HOME))


# --- 새 라이브러리 없음 ---

def test_package_dependencies_unchanged() -> None:
    pkg = json.loads((FRONTEND / "package.json").read_text(encoding="utf-8"))
    assert pkg.get("dependencies") == DEPENDENCIES
    assert pkg.get("devDependencies") == DEV_DEPENDENCIES
