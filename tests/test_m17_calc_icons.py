"""M17 이슈 #106(1-7 계산기 입력 −/+ 버튼) 아이콘 소스 인수 테스트.

계약 (구현은 이 계약을 따른다)
- −/+ 그림 파일 frontend/src/widgets/emergency-kit/ui/calc-icons.tsx 가 있다(쓰는 위젯 폴더 안).
  모양은 #100 alert-icons.tsx 와 같다: 그림 함수(() => ReactNode)를 shared/ui 의 Icon 으로 감싼다.
- 맨 앞 주석(코드보다 먼저 오는 // 줄·/* */ 블록)에 lucide ISC 고지와 Feather MIT 고지가 둘 다 있다.
  minus·plus 는 lucide LICENSE 의 "derived from the Feather project" 목록에 있다. 주석 기호를 빼고 줄바꿈·공백을
  한 칸으로 줄인 글자에
  - ISC: 낱말 "ISC", 저작권 줄 ISC_COPYRIGHT, 허가 문구 ISC_PERMISSION, 출처 URL https://lucide.dev (tests/test_m17_icons.py 와 같음)
  - MIT: 낱말 "MIT", 저작권 줄 MIT_COPYRIGHT, 허가 문구 MIT_PERMISSION 그대로(주석 안에서 줄을 나눠도 됨)
화면(버튼 접근 이름·아이콘 aria-hidden·44×44px)은 frontend/e2e/emergency-kit.spec.ts 가 본다.
"""

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
CALC_ICONS = FRONTEND / "src" / "widgets" / "emergency-kit" / "ui" / "calc-icons.tsx"  # −/+ 그림
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
# 낱말로만 찾는다(면책 문구의 DISCLAIMS 에도 ISC 가 들어 있음)
LICENSE_WORDS = {"ISC": re.compile(r"\bISC\b"), "MIT": re.compile(r"\bMIT\b")}
# 맨 앞 주석 읽기는 tests/test_m17_icons.py 와 같다
HEAD_COMMENT = re.compile(r"(?:\s*(?://[^\n]*|/\*.*?\*/))+", re.S)
COMMENT_END = re.compile(r"\*+/")
COMMENT_MARK = re.compile(r"^[ \t]*(?://+|/\*+|\*+)", re.M)  # 줄 앞 주석 기호. 줄 가운데 // 는 URL 이라 남긴다


def _head_comment(path: Path) -> str:
    """파일 맨 앞 주석의 글자. 주석 기호를 빼고 줄바꿈·공백을 한 칸으로 줄인다."""
    assert path.is_file(), f"파일 없음: {path.relative_to(FRONTEND).as_posix()}"
    m = HEAD_COMMENT.match(path.read_text(encoding="utf-8"))
    return " ".join(COMMENT_MARK.sub(" ", COMMENT_END.sub(" ", m.group(0) if m else "")).split())


def test_lucide_isc_and_feather_mit_notice_in_head_comment() -> None:
    head = _head_comment(CALC_ICONS)
    missing = [word for word, pattern in LICENSE_WORDS.items() if not pattern.search(head)]
    missing += [s for s in (ISC_COPYRIGHT, ISC_PERMISSION, SOURCE_URL, MIT_COPYRIGHT, MIT_PERMISSION) if s not in head]
    assert missing == [], f"{CALC_ICONS.name} 맨 앞 주석에 없음: {missing}\n맨 앞 주석: {head!r}"
