"""M17 이슈 #107(1-8 장보기 목록 복사 버튼) 아이콘 소스 인수 테스트.

계약 (구현은 이 계약을 따른다)
- 복사 버튼 그림 파일 frontend/src/widgets/emergency-kit/ui/shopping-icons.tsx 가 있다(쓰는 위젯 폴더 안. 다른 이슈와 같은 파일을 고치지 않게).
  모양은 #100 alert-icons.tsx·#106 calc-icons.tsx 와 같다: 그림 함수(() => ReactNode)를 shared/ui 의 Icon 으로 감싼다.
- 복사 아이콘은 lucide copy(icons/copy.svg, dcf396f 2023-04-16 판)의 도형 COPY_SHAPES 를 글자 그대로 옮긴다.
  copy 는 lucide LICENSE(e715245)의 "derived from the Feather project" 목록에 없어 lucide ISC 고지만 있으면 된다.
- 맨 앞 주석(코드보다 먼저 오는 // 줄·/* */ 블록)에 lucide ISC 고지가 있다. 주석 기호를 빼고 줄바꿈·공백을 한 칸으로 줄인 글자에
  낱말 "ISC", 저작권 줄 ISC_COPYRIGHT, 허가 문구 ISC_PERMISSION, 출처 URL https://lucide.dev (tests/test_m17_icons.py 와 같음)
- 그 목록에 있는 Feather 유래 그림(check·clipboard 등)을 더 옮기면 Feather MIT 고지도 둔다. 이 테스트는 복사 성공 표시로 쓰기 쉬운
  lucide check 도형(CHECK_SHAPE)이 있으면 낱말 "MIT", MIT_COPYRIGHT, MIT_PERMISSION 을 확인한다(tests/test_m17_calc_icons.py 와 같은 글자).
화면(버튼 접근 이름·아이콘 aria-hidden·높이 44px)은 frontend/e2e/emergency-shopping.spec.ts 가 본다.
"""

import re
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
SHOPPING_ICONS = FRONTEND / "src" / "widgets" / "emergency-kit" / "ui" / "shopping-icons.tsx"  # 복사 버튼 그림
# lucide 저장소 icons/copy.svg(dcf396f) 도형 그대로(닫는 /> 앞까지)
COPY_SHAPES = (
    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"',
    '<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"',
)
CHECK_SHAPE = '<path d="M20 6 9 17l-5-5"'  # lucide icons/check.svg(66cfe52). Feather 유래
# lucide 저장소 LICENSE(github.com/lucide-icons/lucide, e715245 2026-03-20 판) 문구 그대로
ISC_COPYRIGHT = "Copyright (c) 2026 Lucide Icons and Contributors"
ISC_PERMISSION = (
    "Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby"
    " granted, provided that the above copyright notice and this permission notice appear in all copies."
)
SOURCE_URL = "https://lucide.dev"
MIT_COPYRIGHT = "Copyright (c) 2013-present Cole Bemis"
MIT_PERMISSION = (
    "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated"
    ' documentation files (the "Software"), to deal in the Software without restriction, including without limitation'
    " the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to"
    " permit persons to whom the Software is furnished to do so, subject to the following conditions:"
    " The above copyright notice and this permission notice shall be included in all copies or substantial portions of"
    " the Software."
)
# 낱말로만 찾는다(면책 문구의 DISCLAIMS 에도 ISC, LIMITATION 에도 MIT 가 들어 있음)
LICENSE_WORDS = {"ISC": re.compile(r"\bISC\b"), "MIT": re.compile(r"\bMIT\b")}
# 맨 앞 주석 읽기는 tests/test_m17_icons.py 와 같다
HEAD_COMMENT = re.compile(r"(?:\s*(?://[^\n]*|/\*.*?\*/))+", re.S)
COMMENT_END = re.compile(r"\*+/")
COMMENT_MARK = re.compile(r"^[ \t]*(?://+|/\*+|\*+)", re.M)  # 줄 앞 주석 기호. 줄 가운데 // 는 URL 이라 남긴다


def _read() -> str:
    assert SHOPPING_ICONS.is_file(), f"파일 없음: {SHOPPING_ICONS.relative_to(FRONTEND).as_posix()}"
    return SHOPPING_ICONS.read_text(encoding="utf-8")


def _head_comment(source: str) -> str:
    """파일 맨 앞 주석의 글자. 주석 기호를 빼고 줄바꿈·공백을 한 칸으로 줄인다."""
    m = HEAD_COMMENT.match(source)
    return " ".join(COMMENT_MARK.sub(" ", COMMENT_END.sub(" ", m.group(0) if m else "")).split())


def _missing(head: str, word: str, texts: tuple[str, ...]) -> list[str]:
    """맨 앞 주석에 없는 고지 낱말·문구."""
    return ([] if LICENSE_WORDS[word].search(head) else [word]) + [s for s in texts if s not in head]


def test_copy_icon_is_lucide_copy() -> None:
    source = _read()
    missing = [s for s in COPY_SHAPES if s not in source]
    assert missing == [], f"{SHOPPING_ICONS.name} 에 lucide copy 도형 없음: {missing}"


def test_lucide_isc_notice_in_head_comment() -> None:
    head = _head_comment(_read())
    missing = _missing(head, "ISC", (ISC_COPYRIGHT, ISC_PERMISSION, SOURCE_URL))
    assert missing == [], f"{SHOPPING_ICONS.name} 맨 앞 주석에 lucide ISC 고지 없음: {missing}\n맨 앞 주석: {head!r}"


def test_feather_mit_notice_when_check_drawn() -> None:
    source = _read()
    if CHECK_SHAPE not in source:
        pytest.skip("lucide check 도형이 없음(copy 만 옮기면 Feather MIT 고지가 필요 없음)")
    head = _head_comment(source)
    missing = _missing(head, "MIT", (MIT_COPYRIGHT, MIT_PERMISSION))
    assert missing == [], f"{SHOPPING_ICONS.name} 맨 앞 주석에 Feather MIT 고지 없음(check 도형): {missing}\n맨 앞 주석: {head!r}"
