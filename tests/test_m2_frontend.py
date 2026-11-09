"""M2 이슈 #3(2-1)·#4(2-2)·#5(2-3) 인수 테스트.

자동화 가능한 조건만 소스 grep 으로 확인한다. 제목 매칭 로직은
frontend/src/shared/lib/news-match.test.ts (node --test) 에서 확인.
화면 DOM·disabled·502·폭·콘솔 확인과 tsc·lint 는 브라우저 수동.
"""

import re
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SRC = FRONTEND / "src"
SOURCE_SUFFIXES = {".ts", ".tsx"}
# 주석 제거: 블록 주석(/* */, JSX {/* */} 포함)과 줄 주석. "http://" 같은 문자열은 남김
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")

CATALYST_PANEL = SRC / "widgets" / "catalyst-panel" / "ui" / "CatalystPanel.tsx"
CATALYST_ITEM = SRC / "entities" / "catalyst" / "ui" / "CatalystItem.tsx"
CATALYST_BARS = SRC / "entities" / "catalyst" / "ui" / "CatalystBars.tsx"
NEWS_MATCH = SRC / "shared" / "lib" / "news-match.ts"
LIB_INDEX = SRC / "shared" / "lib" / "index.ts"


def _code(path: Path) -> str:
    """주석을 뺀 소스 (화면 문구 검사용)."""
    text = path.read_text(encoding="utf-8")
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", text))


def _src_files() -> list[Path]:
    files = [p for p in SRC.rglob("*") if p.is_file() and p.suffix in SOURCE_SUFFIXES]
    assert files, "frontend/src 소스 파일을 찾지 못함"
    return files


def _grep(pattern: str, comments: bool) -> list[str]:
    hits = []
    for p in _src_files():
        body = p.read_text(encoding="utf-8") if comments else _code(p)
        hits += [f"{p.relative_to(FRONTEND)}:{n}: {line.strip()}"
                 for n, line in enumerate(body.splitlines(), 1) if pattern in line]
    return hits


# --- #3 (2-1) 뉴스 제목 필터 ---

def test_news_empty_message_removed() -> None:
    hits = _grep("해당 기간 뉴스가 없습니다.", comments=True)
    assert not hits, "\n".join(hits)


def test_news_match_module_is_alias_free() -> None:
    # node --test 가 @/ 별칭을 못 풀므로 단일 파일 계약
    assert NEWS_MATCH.exists(), f"없음: {NEWS_MATCH.relative_to(FRONTEND)}"
    code = _code(NEWS_MATCH)
    assert re.search(r"export\s+(function|const)\s+titleMentions\b", code), "titleMentions export 없음"
    assert not re.search(r"from\s+[\"']@/", code), "@/ 별칭 import 사용"


def test_title_mentions_exported_from_lib_index() -> None:
    assert "titleMentions" in _code(LIB_INDEX), "shared/lib/index.ts 에서 titleMentions 를 내보내지 않음"


# --- #4 (2-2) 실시간 칸 숨김 ---

def test_baseline_pending_text_removed() -> None:
    hits = _grep("기준선 준비 중", comments=True)
    assert not hits, "\n".join(hits)


# --- #5 (2-3) 위협·경고 사건 문구 ---

def test_no_catalyst_word_in_screen_text() -> None:
    # 코드 주석은 범위 밖이라 제외
    hits = _grep("촉매", comments=False)
    assert not hits, "\n".join(hits)


# (파일, 화면에 있어야 할 문구). 숫자 보간(LIST_DAYS 등) 위치는 구현에 맡기고 고정 부분만 확인
PROPOSED_TEXT = [
    (CATALYST_PANEL, "⚡ 위협·경고 사건"),
    (CATALYST_PANEL, "군사 위협 · 최후통첩 · 무력 시위 보도"),
    (CATALYST_PANEL, "뉴스에 보도된 군사 위협·최후통첩·무력 시위 건수입니다. 많다고 전쟁이 난다는 뜻은 아닙니다."),
    (CATALYST_PANEL, "하루별 보도량"),
    (CATALYST_PANEL, "많이 보도된 사건"),
    (CATALYST_PANEL, "최후통첩 보도가"),
    (CATALYST_PANEL, "건 있었습니다."),
    (CATALYST_BARS, "하루별 위협·경고 사건 보도량"),
]


@pytest.mark.parametrize(("path", "text"), PROPOSED_TEXT, ids=[t for _, t in PROPOSED_TEXT])
def test_proposed_text_present(path: Path, text: str) -> None:
    assert text in _code(path), f"{path.name} 에 문구 없음: {text}"


def test_bars_aria_label_text() -> None:
    assert re.search(r'aria-label="하루별 위협·경고 사건 보도량"', _code(CATALYST_BARS))


def test_item_shows_report_count() -> None:
    # "보도 N건", N = event.mentions
    code = _code(CATALYST_ITEM)
    assert re.search(r"보도\s*\{event\.mentions\}\s*건", code), "'보도 {event.mentions}건' 형식 아님"
    assert "언급 {event.mentions}" not in code


OLD_TEXT = ["최근 90일 일별 언급량", "주요 사건", "최후통첩 신호가", "위협 · 최후통첩 · 무력 시위<"]


@pytest.mark.parametrize("text", OLD_TEXT)
def test_old_catalyst_text_removed(text: str) -> None:
    hits = [f"{p.name}: {text}" for p in (CATALYST_PANEL, CATALYST_ITEM, CATALYST_BARS) if text in _code(p)]
    assert not hits, "\n".join(hits)


# 사건 유형 배지 이름과 색은 그대로
TYPE_STYLE_LINES = [
    '최후통첩: "bg-red-500/15 text-red-300"',
    '"군사력 위협": "bg-orange-500/15 text-orange-300"',
    '"무력 시위": "bg-sky-500/15 text-sky-300"',
]


@pytest.mark.parametrize("line", TYPE_STYLE_LINES)
def test_type_badges_unchanged(line: str) -> None:
    assert line in _code(CATALYST_ITEM)
