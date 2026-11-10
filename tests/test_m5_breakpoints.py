"""M5 이슈 #19(1-1 브레이크포인트·페이지 컨테이너) 프론트 소스 인수 테스트.

계약 (구현은 이 계약을 따른다)
- frontend/app/globals.css 의 @theme 블록에서 기본 브레이크포인트를 `--breakpoint-*: initial;` 로 지우고
  --breakpoint-md: 48rem / --breakpoint-lg: 67.5rem / --breakpoint-xl: 90rem 만 정의한다.
- frontend/src, frontend/app 의 .ts/.tsx 에 `sm:`·`2xl:` 접두사 0건(max-sm: 같은 변형 포함).
- HomePage.tsx: max-w-6xl 제거, 임의 값 max-w-[...] 금지(최대 폭은 Tailwind 클래스 또는 @theme 변수),
  여백 클래스 px-4 py-6 / md:px-6 md:py-8 / lg:px-8 사용(plan.md 5-2 "페이지 컨테이너").

브라우저 수동: 360/768/1080/1440px 에서 main 좌우 padding(16/24/32/32px), 1440px 에서 padding 안쪽 폭 1280px·좌우 여백 차 1px 이하,
767↔768px 국가 쌍 탭 1열↔2열, 1079↔1080px 주목 국가 목록 지도 아래↔오른쪽,
각 폭 scrollWidth <= innerWidth·콘솔 오류 0건, tsc·lint.
"""

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SRC = FRONTEND / "src"
APP = FRONTEND / "app"
GLOBALS_CSS = APP / "globals.css"
HOME = SRC / "views" / "home" / "ui" / "HomePage.tsx"
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")
EXPECTED_BREAKPOINTS = {"*": "initial", "md": "48rem", "lg": "67.5rem", "xl": "90rem"}
BANNED_PREFIX = re.compile(r"\b(sm|2xl):")
CONTAINER_CLASSES = ["px-4", "py-6", "md:px-6", "md:py-8", "lg:px-8"]


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    assert path.exists(), f"없음: {path.relative_to(FRONTEND)}"
    text = BLOCK_COMMENT.sub("", path.read_text(encoding="utf-8"))
    return text if path.suffix == ".css" else LINE_COMMENT.sub("", text)


def _theme_blocks(css: str) -> str:
    """@theme 블록 본문을 이어 붙임(중괄호 짝 맞춤)."""
    out = []
    for m in re.finditer(r"@theme\b[^{]*\{", css):
        depth, i = 1, m.end()
        while depth and i < len(css):
            depth += {"{": 1, "}": -1}.get(css[i], 0)
            i += 1
        out.append(css[m.end():i - 1])
    return "\n".join(out)


def _breakpoints(css: str) -> dict[str, str]:
    return {k: v.strip() for k, v in re.findall(r"--breakpoint-([\w*-]+)\s*:\s*([^;]+);", css)}


def test_breakpoints_defined_in_theme() -> None:
    assert _breakpoints(_theme_blocks(_code(GLOBALS_CSS))) == EXPECTED_BREAKPOINTS


def test_no_breakpoints_outside_theme() -> None:
    # @theme 밖에 같은 변수를 또 두지 않는다(숫자는 @theme 에만)
    css = _code(GLOBALS_CSS)
    assert len(re.findall(r"--breakpoint-", css)) == len(re.findall(r"--breakpoint-", _theme_blocks(css)))


def test_no_sm_or_2xl_prefix() -> None:
    files = [p for d in (SRC, APP) for p in sorted(d.rglob("*.ts*")) if p.suffix in (".ts", ".tsx")]
    offenders = [f"{p.relative_to(FRONTEND).as_posix()}: {m.group(0)}"
                 for p in files for m in BANNED_PREFIX.finditer(_code(p))]
    assert offenders == []


def test_home_container_max_width() -> None:
    code = _code(HOME)
    assert "max-w-6xl" not in code
    assert not re.search(r"max-w-\[", code), "최대 폭 매직 넘버"


def test_home_container_padding_classes() -> None:
    tokens = set(re.findall(r"[\w:\[\]-]+", _code(HOME)))
    assert [c for c in CONTAINER_CLASSES if c not in tokens] == []
