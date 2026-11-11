"""M8 이슈 #31(1-1 보조 글자 명도 대비 4.5:1)·#32(1-2 링크 밑줄 대비 3:1) 프론트 소스 인수 테스트.

계약 (구현은 이 계약을 따른다)
[1-1 #31]
- frontend/src, frontend/app 의 .ts/.tsx(주석 제외)에 어두운 회색 글자·채움 클래스
  `(text|fill)-(neutral|gray|zinc|slate|stone)-(500|600|700|800|900|950)` 0건.
  변형 접두사(hover:·group-hover:·md:·placeholder: 등)가 붙어도 같은 패턴으로 잡는다.
- 같은 소스에 옛 지도 나라 이름 회색 `#6b7280` 0건(대소문자 무시).
- 보조 글자는 text-neutral-400(위협·경고 사건 범례 <b> 는 text-neutral-300), 추이 차트 축은 fill-neutral-400,
  지도 데이터 없는 나라 이름은 #9ca3af 로 모은다(docs/plan/text-contrast/plan.md 5절).
- 이 계약은 "어두운 회색 글자·채움 금지"다. 밝은 배경 위 어두운 글자나 어두운 SVG 도형 채움이 필요해지면 계약을 다시 정한다.
[1-2 #32]
- 같은 소스에 어두운 밑줄 색 `decoration-(neutral|gray|zinc|slate|stone)-(600|700|800|900|950)` 0건(변형 접두사 포함).
  링크·글자 버튼 밑줄은 decoration-neutral-500 으로 모은다(배경과 3:1 이상이면서 글자보다 옅음, plan.md 5-3 Q3).
- hover 글자 색은 대비 계약이 아니라 여기 넣지 않는다(앱 브라우저로 확인).

화면 실측: frontend/e2e/contrast.spec.ts(Firefox·WebKit, 폭 360/768/1080/1440 × 상태별 보이는 글자 전부,
기준 4.5:1·큰 글자 3:1, 밑줄 3:1·같은 요소의 글자 대비 이하). 로드 중에만 보이는 글자("불러오는 중…")는 이 소스 계약이 막는다.
"""

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SRC = FRONTEND / "src"
APP = FRONTEND / "app"
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")
# 앞뒤로 붙은 변형 접두사·투명도(/50)까지 클래스 한 덩어리로 잡아 메시지에 남긴다
DARK_GRAY = re.compile(r"[^\s\"'`{}]*(?:text|fill)-(?:neutral|gray|zinc|slate|stone)-(?:500|600|700|800|900|950)[^\s\"'`{}]*")
OLD_MAP_GRAY = re.compile(r"#6b7280", re.I)
DARK_UNDERLINE = re.compile(r"[^\s\"'`{}]*decoration-(?:neutral|gray|zinc|slate|stone)-(?:600|700|800|900|950)[^\s\"'`{}]*")


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    assert path.exists(), f"없음: {path.relative_to(FRONTEND)}"
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", path.read_text(encoding="utf-8")))


def _offenders(pattern: re.Pattern[str]) -> list[str]:
    """위반 위치: '파일: 클래스(또는 값)'."""
    files = [p for d in (SRC, APP) for p in sorted(d.rglob("*.ts*")) if p.suffix in (".ts", ".tsx")]
    return [f"{p.relative_to(FRONTEND).as_posix()}: {m.group(0)}" for p in files for m in pattern.finditer(_code(p))]


def test_no_dark_gray_text_or_fill() -> None:
    offenders = _offenders(DARK_GRAY)
    assert offenders == [], f"어두운 회색 글자·채움 {len(offenders)}건\n" + "\n".join(offenders)


def test_no_old_map_gray() -> None:
    offenders = _offenders(OLD_MAP_GRAY)
    assert offenders == [], f"옛 지도 회색 {len(offenders)}건\n" + "\n".join(offenders)


def test_no_dark_underline() -> None:
    offenders = _offenders(DARK_UNDERLINE)
    assert offenders == [], f"어두운 밑줄 색 {len(offenders)}건\n" + "\n".join(offenders)
