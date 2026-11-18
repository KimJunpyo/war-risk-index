"""M17 이슈 #100(1-1 아이콘 방식 확정과 경보 아이콘) 프론트 소스 인수 테스트.

계약 (구현은 이 계약을 따른다)
- 아이콘 틀 frontend/src/shared/ui/Icon.tsx 와 경보 아이콘 대응표 frontend/src/entities/guide/ui/alert-icons.tsx 가 있다.
- 두 파일 맨 앞 주석(코드보다 먼저 오는 // 줄·/* */ 블록)에 lucide ISC 고지가 있다. 주석 기호를 빼고 줄바꿈·공백을
  한 칸으로 줄인 글자에
  - 낱말 "ISC"
  - lucide 저장소 LICENSE(ISC) 의 저작권 줄 COPYRIGHT 와 허가 문구 PERMISSION 그대로(주석 안에서 줄을 나눠도 됨)
  - 출처 URL https://lucide.dev
- 두 파일(주석 제외)에 "use client" 가 없다. 서버 컴포넌트에서 그려 브라우저 JS 가 늘지 않게 한다.

명령으로 보는 것: ALERT_ICON 키 5개(Record 타입이라 빠지면 npx tsc --noEmit 실패), npm run build 경로 표의 /emergency ○,
.next/static/chunks 증가 1KB 이하, package.json·package-lock.json 그대로.
화면 실측: frontend/e2e/emergency.spec.ts 의 경보 카드 제목 아이콘(svg 하나·aria-hidden·선 색·접근 이름),
명도 대비: frontend/e2e/contrast.spec.ts 의 "비상 대비 페이지 기본" 상태.
"""

import re
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
ICON = FRONTEND / "src" / "shared" / "ui" / "Icon.tsx"  # 아이콘 틀
ALERT_ICONS = FRONTEND / "src" / "entities" / "guide" / "ui" / "alert-icons.tsx"  # 경보 아이콘 대응표(ALERT_ICON)
# lucide 저장소 LICENSE(github.com/lucide-icons/lucide, 2026-03-20 판) 문구 그대로
COPYRIGHT = "Copyright (c) 2026 Lucide Icons and Contributors"
PERMISSION = (
    "Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby"
    " granted, provided that the above copyright notice and this permission notice appear in all copies."
)
SOURCE_URL = "https://lucide.dev"
ISC = re.compile(r"\bISC\b")  # 낱말로만 찾는다(면책 문구의 DISCLAIMS 에도 ISC 가 들어 있음)
HEAD_COMMENT = re.compile(r"(?:\s*(?://[^\n]*|/\*.*?\*/))+", re.S)
COMMENT_END = re.compile(r"\*+/")
# 줄 앞 주석 기호(//·/*·*). 줄 가운데 // 는 URL 이라 남긴다
COMMENT_MARK = re.compile(r"^[ \t]*(?://+|/\*+|\*+)", re.M)
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")
USE_CLIENT = re.compile(r"[\"']use client[\"']")


def _read(path: Path) -> str:
    assert path.is_file(), f"파일 없음: {path.relative_to(FRONTEND).as_posix()}"
    return path.read_text(encoding="utf-8")


def _head_comment(path: Path) -> str:
    """파일 맨 앞 주석의 글자. 주석 기호를 빼고 줄바꿈·공백을 한 칸으로 줄인다."""
    m = HEAD_COMMENT.match(_read(path))
    return " ".join(COMMENT_MARK.sub(" ", COMMENT_END.sub(" ", m.group(0) if m else "")).split())


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", _read(path)))


@pytest.mark.parametrize("path", [ICON, ALERT_ICONS], ids=["Icon", "alert-icons"])
def test_lucide_isc_notice_in_head_comment(path: Path) -> None:
    head = _head_comment(path)
    missing = [s for s in (COPYRIGHT, PERMISSION, SOURCE_URL) if s not in head]
    if not ISC.search(head):
        missing.insert(0, "ISC")
    assert missing == [], f"{path.name} 맨 앞 주석에 없음: {missing}\n맨 앞 주석: {head!r}"


@pytest.mark.parametrize("path", [ICON, ALERT_ICONS], ids=["Icon", "alert-icons"])
def test_no_use_client(path: Path) -> None:
    assert not USE_CLIENT.search(_code(path)), f'{path.name} 에 "use client" 있음(서버 컴포넌트로 만든다)'
