"""M17 이슈 #105(1-6 비상 가방 아이콘 타일과 진행 막대) 프론트 소스 인수 테스트.

계약 (구현은 이 계약을 따른다)
- 가방 항목 아이콘 대응표(GO_BAG_ITEMS·STOCK_ITEMS id 15개 → 그림)와 담은 타일의 체크 아이콘 그림을
  frontend/src/widgets/emergency-kit/ui/kit-item-icons.tsx 한 파일에 둔다(쓰는 위젯 폴더 안. 다른 이슈와 같은 파일을 고치지 않게).
  모양은 #100 과 같다: shared/ui 의 Icon 틀 + 그림 함수(() => ReactNode).
- 이 파일 맨 앞 주석(코드보다 먼저 오는 // 줄·/* */ 블록)에 고지 두 가지가 있다. 주석 기호를 빼고 줄바꿈·공백을 한 칸으로 줄인 글자에
  - lucide ISC 고지: 낱말 "ISC", lucide 저장소 LICENSE(ISC) 의 저작권 줄 ISC_COPYRIGHT 와 허가 문구 ISC_PERMISSION 그대로,
    출처 URL https://lucide.dev (tests/test_m17_icons.py 와 같은 글자)
  - Feather MIT 고지: 체크 아이콘(lucide check)이 Feather 유래라서 붙인다. 낱말 "MIT", lucide LICENSE 의 Feather 몫 저작권 줄
    MIT_COPYRIGHT 와 MIT 허가 문구 MIT_PERMISSION·MIT_CONDITION 그대로(주석 안에서 줄을 나눠도 됨)

화면 실측: frontend/e2e/emergency-kit.spec.ts 가방 테스트(타일마다 aria-hidden 아이콘, 담으면 체크 아이콘),
명도 대비: frontend/e2e/contrast.spec.ts 의 "가방 타일 담음" 상태.
"""

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
KIT_ICONS = FRONTEND / "src" / "widgets" / "emergency-kit" / "ui" / "kit-item-icons.tsx"  # 항목 아이콘 대응표·체크 아이콘
# lucide 저장소 LICENSE(github.com/lucide-icons/lucide) 문구 그대로. ISC 몫은 tests/test_m17_icons.py 와 같다
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
)
MIT_CONDITION = (
    "The above copyright notice and this permission notice shall be included in all copies or substantial portions of"
    " the Software."
)
ISC = re.compile(r"\bISC\b")  # 낱말로만 찾는다(면책 문구의 DISCLAIMS 에도 ISC 가 들어 있음)
MIT = re.compile(r"\bMIT\b")  # 낱말로만 찾는다(LIMITATION·PERMITTED 에도 MIT 가 들어 있음)
HEAD_COMMENT = re.compile(r"(?:\s*(?://[^\n]*|/\*.*?\*/))+", re.S)
COMMENT_END = re.compile(r"\*+/")
# 줄 앞 주석 기호(//·/*·*). 줄 가운데 // 는 URL 이라 남긴다
COMMENT_MARK = re.compile(r"^[ \t]*(?://+|/\*+|\*+)", re.M)


def _head_comment(path: Path) -> str:
    """파일 맨 앞 주석의 글자. 주석 기호를 빼고 줄바꿈·공백을 한 칸으로 줄인다."""
    assert path.is_file(), f"파일 없음: {path.relative_to(FRONTEND).as_posix()}"
    m = HEAD_COMMENT.match(path.read_text(encoding="utf-8"))
    return " ".join(COMMENT_MARK.sub(" ", COMMENT_END.sub(" ", m.group(0) if m else "")).split())


def test_lucide_isc_notice_in_head_comment() -> None:
    head = _head_comment(KIT_ICONS)
    missing = [s for s in (ISC_COPYRIGHT, ISC_PERMISSION, SOURCE_URL) if s not in head]
    if not ISC.search(head):
        missing.insert(0, "ISC")
    assert missing == [], f"{KIT_ICONS.name} 맨 앞 주석에 lucide ISC 고지 없음: {missing}\n맨 앞 주석: {head!r}"


def test_feather_mit_notice_in_head_comment() -> None:
    head = _head_comment(KIT_ICONS)
    missing = [s for s in (MIT_COPYRIGHT, MIT_PERMISSION, MIT_CONDITION) if s not in head]
    if not MIT.search(head):
        missing.insert(0, "MIT")
    assert missing == [], f"{KIT_ICONS.name} 맨 앞 주석에 Feather MIT 고지 없음(체크 아이콘): {missing}\n맨 앞 주석: {head!r}"
