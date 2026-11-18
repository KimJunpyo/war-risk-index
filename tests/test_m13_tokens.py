"""M13 이슈 #71(1-1 의미 색 토큰 정의(다크 값)와 공용 패널·선택 버튼 전환) 프론트 소스 인수 테스트.

계약 (구현은 이 계약을 따른다)
- frontend/app/globals.css(주석 제외)의 `@theme inline` 블록에 아래 TOKENS 가 모두 `--color-<토큰>` 으로 정의돼 있다
  (text-fg-muted·bg-surface 같은 토큰 유틸리티가 생기는 매핑). 다크 값을 어디에 어떻게 두는지는 정하지 않는다.
- 토큰은 이슈 표 24개 + track(SegmentedControl 바탕 white/5)·selected(선택된 버튼 바탕 white/15)·error(StatusText 오류 문구 red-400).
- 같은 파일의 기존 정의는 그대로다: :root 의 --background·--foreground·스크롤바 변수 5개,
  @theme inline 의 --color-background·--color-foreground 매핑(e2e 의 page 원래 클래스 bg-background 등이 여기서 생김),
  forced-colors 블록의 스크롤바 시스템 색.
- frontend/src/shared/ui/Panel.tsx·SegmentedControl.tsx(주석 제외)에 팔레트 색 클래스
  `(text|bg|border|ring|divide|decoration)-(white|black|neutral|gray|zinc|slate|stone|red|rose|amber|emerald|fuchsia|sky|blue|orange|violet)`
  0건. 변형 접두사(hover:·enabled:hover: 등)·투명도(/10, /[0.03])가 붙어도 같은 패턴으로 잡는다.

화면 실측: frontend/e2e/theme-tokens.spec.ts(Firefox·WebKit, 다크). 토큰 클래스마다 글자·배경·테두리·밑줄 색의
계산값이 원래 팔레트 클래스와 같은지 본다.
"""

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
GLOBALS_CSS = FRONTEND / "app" / "globals.css"
SHARED_UI = FRONTEND / "src" / "shared" / "ui"
CONVERTED = [SHARED_UI / "Panel.tsx", SHARED_UI / "SegmentedControl.tsx"]
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")
# 앞뒤로 붙은 변형 접두사·투명도까지 클래스 한 덩어리로 잡아 메시지에 남긴다
PALETTE = re.compile(
    r"[^\s\"'`{}]*(?:text|bg|border|ring|divide|decoration)-"
    r"(?:white|black|neutral|gray|zinc|slate|stone|red|rose|amber|emerald|fuchsia|sky|blue|orange|violet)[^\s\"'`{}]*"
)
# 블록의 마지막 선언은 ; 를 빼도 되므로 값은 ;·중괄호 앞까지
DECLARATION = re.compile(r"(--[\w-]+)\s*:\s*([^;{}]+)")
# frontend/e2e/theme-tokens.spec.ts TOKENS 와 같은 목록
TOKENS = [
    "page", "fg-strong", "fg-bright", "fg", "fg-soft", "fg-muted", "link-line",
    "surface", "surface-inner", "surface-hover", "field", "overlay", "line", "line-strong", "line-soft",
    "danger", "warning", "success", "info",
    "alert-alert", "alert-air-raid", "alert-cbr", "alert-nuclear", "alert-all-clear",
    "track", "selected", "error",
]
# 이슈 #71 착수 전(5acdd59) globals.css 값
ROOT_VARS = {
    "--background": "#07090d",
    "--foreground": "#e5e7eb",
    "--scrollbar-thumb": "rgb(255 255 255 / 0.22)",
    "--scrollbar-thumb-hover": "rgb(255 255 255 / 0.4)",
    "--scrollbar-size": "6px",
    "--scrollbar-size-hover": "8px",
    "--scrollbar-inset": "2px",
}
THEME_VARS = {"--color-background": "var(--background)", "--color-foreground": "var(--foreground)"}
FORCED_COLORS_VARS = {"--scrollbar-thumb": "CanvasText", "--scrollbar-thumb-hover": "Highlight"}


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    assert path.exists(), f"없음: {path.relative_to(FRONTEND)}"
    text = BLOCK_COMMENT.sub("", path.read_text(encoding="utf-8"))
    return text if path.suffix == ".css" else LINE_COMMENT.sub("", text)


def _blocks(css: str, prelude: str) -> str:
    """앞머리(선택자·at 규칙)가 prelude 정규식과 맞는 블록 본문을 이어 붙임(중괄호 짝 맞춤)."""
    out = []
    for m in re.finditer(r"([^{};]*)\{", css):
        if not re.fullmatch(prelude, m.group(1).strip()):
            continue
        depth, i = 1, m.end()
        while depth and i < len(css):
            depth += {"{": 1, "}": -1}.get(css[i], 0)
            i += 1
        out.append(css[m.end():i - 1])
    return "\n".join(out)


def _theme_inline(css: str) -> str:
    return _blocks(css, r"@theme\b.*\binline\b.*")


def _missing(expected: dict[str, str], block: str) -> list[str]:
    """block 에 그대로 없는 선언 '이름: 값'. 다른 선언이 더 있는 것은 괜찮다."""
    found = {(k, v.strip()) for k, v in DECLARATION.findall(block)}
    return [f"{k}: {v}" for k, v in expected.items() if (k, v) not in found]


def test_tokens_mapped_in_theme_inline() -> None:
    defined = {k for k, _ in DECLARATION.findall(_theme_inline(_code(GLOBALS_CSS)))}
    missing = [t for t in TOKENS if f"--color-{t}" not in defined]
    assert missing == [], f"@theme inline 에 없는 토큰 {len(missing)}개: " + ", ".join(missing)


def test_existing_variables_kept() -> None:
    css = _code(GLOBALS_CSS)
    assert _missing(ROOT_VARS, _blocks(css, r":root")) == []
    assert _missing(THEME_VARS, _theme_inline(css)) == []


def test_forced_colors_block_kept() -> None:
    forced = _blocks(_code(GLOBALS_CSS), r"@media\s*\(\s*forced-colors\s*:\s*active\s*\)")
    assert _missing(FORCED_COLORS_VARS, _blocks(forced, r":root")) == []


def test_no_palette_color_in_panel_and_segmented_control() -> None:
    offenders = [f"{p.relative_to(FRONTEND).as_posix()}: {m.group(0)}"
                 for p in CONVERTED for m in PALETTE.finditer(_code(p))]
    assert offenders == [], f"팔레트 색 클래스 {len(offenders)}건\n" + "\n".join(offenders)
