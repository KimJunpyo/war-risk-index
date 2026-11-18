"""M13 이슈 #74(1-4 `/emergency` 페이지와 경보별 행동요령 화면) 프론트 소스 인수 테스트.

계약 (구현은 이 계약을 따른다)
- 새 화면 소스: frontend/app/emergency/** 와 frontend/src/views/emergency/** 의 .ts/.tsx. 두 폴더 모두 하나 이상 있다.
- 색은 #71(1-1) 의미 색 토큰만 쓴다. 위 소스(주석 제외)에
  - 팔레트 색 클래스 `(text|bg|border|ring|divide|decoration|fill|stroke|outline|from|to|via|shadow|accent|caret|placeholder)-`
    `(white|black|neutral|gray|zinc|slate|stone|red|rose|amber|emerald|fuchsia|sky|blue|orange|violet|yellow|green|lime|teal|`
    `cyan|indigo|purple|pink)` 0건. 변형 접두사(hover:·md: 등)·투명도(/50)가 붙어도, border-t-·ring-offset- 처럼
    방향·offset 이 붙어도 같은 패턴으로 잡는다.
  - hex 색(#fff·#07090d 등, HTML 문자 참조 &#...; 는 제외)과 rgb()·hsl()·oklch() 같은 색 함수 0건.
- 경보 이름 색 클래스 5개(text-alert-alert·text-alert-air-raid·text-alert-cbr·text-alert-nuclear·text-alert-all-clear)가
  views/emergency 소스에 글자 그대로 있다. Tailwind 는 소스에 적힌 클래스만 만들므로 `text-alert-${id}` 처럼 조립하면 안 된다.
- 서버 컴포넌트·정적 렌더링: 위 소스에 "use client" 없음. 현재 시각(Date.now·new Date())과 cookies()·headers() 를 읽지 않는다.
  (`npm run build` 경로 표에서 /emergency 가 ƒ 가 아닌지는 명령으로 확인한다. 이 테스트는 소스 쪽 대리 검사)
- frontend/app/sitemap.ts 에 /emergency 주소가 있다.

화면 실측: frontend/e2e/emergency.spec.ts(카드 순서·할 일 수·목차·홈 헤더 링크·메타데이터·HTML·넘침·콘솔 오류·API 요청),
명도 대비: frontend/e2e/contrast.spec.ts 의 "비상 대비 페이지 기본" 상태.
"""

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
APP_EMERGENCY = FRONTEND / "app" / "emergency"
VIEW_EMERGENCY = FRONTEND / "src" / "views" / "emergency"
SITEMAP = FRONTEND / "app" / "sitemap.ts"
ALERT_IDS = ["alert", "air-raid", "cbr", "nuclear", "all-clear"]  # 이슈 #72 CIVIL_ALERTS 의 id·순서
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")
UTILITY = r"(?:text|bg|border(?:-[xytrblse])?|ring(?:-offset)?|divide|decoration|fill|stroke|outline|from|to|via|shadow|accent|caret|placeholder)"
PALETTE_NAME = (
    r"(?:white|black|neutral|gray|zinc|slate|stone|red|rose|amber|emerald|fuchsia|sky|blue|orange|violet"
    r"|yellow|green|lime|teal|cyan|indigo|purple|pink)"
)
# 앞뒤로 붙은 변형 접두사·투명도(/50)까지 클래스 한 덩어리로 잡아 메시지에 남긴다
PALETTE = re.compile(r"[^\s\"'`{}]*" + UTILITY + "-" + PALETTE_NAME + r"(?![a-z])[^\s\"'`{}]*")
HEX = re.compile(r"(?<!&)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])")
COLOR_FN = re.compile(r"\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(")
USE_CLIENT = re.compile(r"[\"']use client[\"']")
DYNAMIC = re.compile(r"\bDate\.now\b|\bnew\s+Date\s*\(|\bcookies\s*\(|\bheaders\s*\(")


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", path.read_text(encoding="utf-8")))


def _sources(*dirs: Path) -> list[Path]:
    """새 화면 소스(.ts/.tsx). 폴더마다 하나 이상 있어야 한다(검사할 파일이 없어 통과하는 것을 막음)."""
    files: list[Path] = []
    for d in dirs:
        found = [p for p in sorted(d.rglob("*.ts*")) if p.suffix in (".ts", ".tsx")]
        assert found, f"소스 없음: {d.relative_to(FRONTEND).as_posix()}"
        files += found
    return files


def _offenders(pattern: re.Pattern[str]) -> list[str]:
    """위반 위치: '파일: 클래스(또는 값)'."""
    return [
        f"{p.relative_to(FRONTEND).as_posix()}: {m.group(0)}"
        for p in _sources(APP_EMERGENCY, VIEW_EMERGENCY)
        for m in pattern.finditer(_code(p))
    ]


def test_no_palette_color_class() -> None:
    offenders = _offenders(PALETTE)
    assert offenders == [], f"팔레트 색 클래스 {len(offenders)}건(1-1 토큰만)\n" + "\n".join(offenders)


def test_no_raw_color_value() -> None:
    offenders = _offenders(HEX) + _offenders(COLOR_FN)
    assert offenders == [], f"hex·색 함수 {len(offenders)}건(1-1 토큰만)\n" + "\n".join(offenders)


def test_alert_token_classes_written_literally() -> None:
    code = "\n".join(_code(p) for p in _sources(VIEW_EMERGENCY))
    classes = [f"text-alert-{i}" for i in ALERT_IDS]
    missing = [c for c in classes if not re.search(rf"(?<![\w-]){re.escape(c)}(?![\w-])", code)]
    assert missing == [], f"경보 토큰 클래스가 views/emergency 소스에 글자 그대로 없음: {missing}"


def test_server_component_without_request_or_clock() -> None:
    files = _sources(APP_EMERGENCY, VIEW_EMERGENCY)
    client = [p.relative_to(FRONTEND).as_posix() for p in files if USE_CLIENT.search(_code(p))]
    assert client == [], f'"use client" 있음(서버 컴포넌트로 만든다): {client}'
    offenders = _offenders(DYNAMIC)
    assert offenders == [], "현재 시각·요청 정보 읽기(정적 렌더링이 깨짐)\n" + "\n".join(offenders)


def test_sitemap_has_emergency() -> None:
    assert re.search(r"/emergency\b", _code(SITEMAP)), "sitemap.ts 에 /emergency 없음"
