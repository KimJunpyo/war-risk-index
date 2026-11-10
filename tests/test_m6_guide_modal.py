"""M6 이슈 #23(2-3 가이드 모달 반응형과 여행경보 4단계 표 줄바꿈) 프론트 소스 인수 테스트.

실측(셀 줄 수·모달 크기·가로 넘침·닫기·포커스)은 Playwright 로 확인한다:
  frontend/e2e/guide-modal.spec.ts
여기서는 데이터 형태와 클래스 적용만 소스 grep 으로 확인한다.

계약 (구현은 이 계약을 따른다)
- guide.ts ADVISORY_LEVELS: 기관별 이름을 주 문구(main)·보조 문구(sub, 선택)로 나눈다. 영국 FCDO 는 주 문구만.
  백엔드 travel_advisory.py 와 일치 주석 유지.
- GuideModal.tsx: 여행경보 표는 md 이상에서만(hidden md:table), md 미만은 단계별 카드(md:hidden).
  "N단계"·이름 주 문구에 whitespace-nowrap, 보조 문구·의미에 break-keep(이 표에만, 전역 word-break 변경 없음).
  "N단계"는 텍스트 노드 하나(템플릿 문자열). JSX {l.level}단계 는 노드 둘이라 Chrome getClientRects() 가 2.
- 모달 크기: 기본 화면 전체(w-screen h-dvh rounded-none), md 폭 min(720px,100vw-48px)·max-h-[85vh],
  lg 760px, xl 880px. 본문 좌우 padding 기본 px-4, md px-6.
  md 이상 높이 h-fit(내용 높이). h-auto 는 modal dialog 를 85vh 로 늘려 빈 영역(누르면 닫힘)을 만든다.
"""

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SRC = FRONTEND / "src"
GUIDE = SRC / "entities" / "guide" / "model" / "guide.ts"
MODAL = SRC / "widgets" / "guide-modal" / "ui" / "GuideModal.tsx"
GLOBALS_CSS = FRONTEND / "app" / "globals.css"
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")

# 외교부·미 국무부 주/보조 문구 (백엔드 travel_advisory.py 와 같은 단계 이름)
KR_SPLIT = [("여행유의", "남색경보"), ("여행자제", "황색경보"), ("출국권고", "적색경보"), ("여행금지", "흑색경보")]
US_SPLIT = [
    ("일반적 주의", "Exercise Normal Precautions"),
    ("각별한 주의", "Exercise Increased Caution"),
    ("여행 재고", "Reconsider Travel"),
    ("여행 금지", "Do Not Travel"),
]


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    assert path.exists(), f"없음: {path.relative_to(FRONTEND)}"
    text = BLOCK_COMMENT.sub("", path.read_text(encoding="utf-8"))
    return text if path.suffix == ".css" else LINE_COMMENT.sub("", text)


def _advisory_block() -> str:
    code = _code(GUIDE)
    start = code.index("ADVISORY_LEVELS")
    return code[start:code.index("];", start)]


# --- 데이터: 주/보조 문구 분리 ---

def test_advisory_keeps_backend_sync_comment() -> None:
    assert re.search(r"travel_advisory\.py\s*와\s*일치", GUIDE.read_text(encoding="utf-8"))


def test_advisory_kr_us_split_main_sub() -> None:
    block = _advisory_block()
    for main, sub in KR_SPLIT + US_SPLIT:
        assert re.search(rf'main:\s*"{re.escape(main)}"\s*,\s*sub:\s*"{re.escape(sub)}"', block), (main, sub)
    # 괄호로 이어 붙인 옛 형태가 남아 있지 않아야 한다
    assert "(남색경보)" not in block and "(Exercise" not in block


def test_advisory_uk_main_only() -> None:
    block = _advisory_block()
    uks = re.findall(r"uk:\s*\{([^}]*)\}", block)
    assert len(uks) == 4, uks
    assert all("main:" in u and "sub:" not in u for u in uks), uks


# --- 표(md 이상)·카드(md 미만) ---

def test_table_md_up_cards_below() -> None:
    code = _code(MODAL)
    assert re.search(r"<table[^>]*\bhidden\b[^>]*\bmd:table\b", code), "표는 md 이상에서만"
    assert re.search(r"\bmd:hidden\b", code), "md 미만 카드"
    # 표와 카드가 같은 데이터에서 그린다
    assert len(re.findall(r"ADVISORY_LEVELS\.map", code)) >= 2


def test_nowrap_and_break_keep() -> None:
    code = _code(MODAL)
    assert len(re.findall(r"\bwhitespace-nowrap\b", code)) >= 2, "N단계·주 문구 한 줄"
    assert re.search(r"\bbreak-keep\b", code), "보조 문구·의미 한국어 어절 단위 줄바꿈"
    assert re.search(r"\.main\b", code) and re.search(r"\.sub\b", code)


def test_level_label_one_text_node() -> None:
    code = _code(MODAL)
    assert not re.search(r"(?<!\$)\{l\.level\}단계", code), "JSX {l.level}단계 는 텍스트 노드 둘"
    assert len(re.findall(r"`\$\{l\.level\}단계`", code)) >= 2, "표 셀·카드 제목"


def test_no_global_word_break() -> None:
    assert not re.search(r"word-break\s*:", _code(GLOBALS_CSS)), "전역 word-break 변경 금지"


# --- 모달 크기·padding ---

def test_dialog_sizes() -> None:
    code = _code(MODAL)
    for cls in ("w-screen", "h-dvh", "rounded-none", r"md:w-\[min\(720px,calc\(100vw-48px\)\)\]",
                r"md:max-h-\[85vh\]", r"lg:w-\[760px\]", r"xl:w-\[880px\]", "px-4", "md:px-6", "md:h-fit"):
        assert re.search(rf"(?<![\w:-]){cls}(?![\w-])", code), cls
    assert "md:h-auto" not in code


def test_modal_keeps_scroll_area() -> None:
    code = _code(MODAL)
    assert re.search(r'<ScrollArea[^>]*label="가이드 본문"', code)
