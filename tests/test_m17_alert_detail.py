"""M17 이슈 #104(1-5 경보 상세 페이지 `/emergency/[alert]`) 프론트 소스·llms.txt 인수 테스트.

계약 (구현은 이 계약을 따른다)
- 핵심 행동 아이콘 대응표(KeyActionIcon 12개 → 그림)는 frontend/src/views/emergency/ui/key-action-icons.tsx 에 둔다
  (쓰는 화면 폴더 안. 다른 이슈와 같은 파일을 고치지 않게). 모양은 #100 과 같다: shared/ui 의 Icon 틀 + 그림 함수(() => ReactNode).
  대피소 링크의 지도 핀 그림도 이 파일에 두기를 권한다.
- 이 파일 맨 앞 주석(코드보다 먼저 오는 // 줄·/* */ 블록)에 고지 두 가지가 있다. 주석 기호를 빼고 줄바꿈·공백을 한 칸으로 줄인 글자에
  - lucide ISC 고지: 낱말 "ISC", 저작권 줄 ISC_COPYRIGHT 와 허가 문구 ISC_PERMISSION 그대로, 출처 URL https://lucide.dev
    (tests/test_m17_icons.py 와 같은 글자)
  - Feather MIT 고지: radio 그림을 lucide radio 로 옮긴다. radio 는 lucide LICENSE 의 "derived from the Feather project" 목록에 있다.
    낱말 "MIT", 저작권 줄 MIT_COPYRIGHT 와 허가 문구 MIT_PERMISSION·MIT_CONDITION 그대로(주석 안에서 줄을 나눠도 됨)
- frontend/app/emergency/** 와 frontend/src/views/emergency/** 의 .tsx 중 SVG 도형 요소(<path·<circle·<rect·<line·<polyline·
  <polygon·<ellipse, 주석 제외)를 담은 파일은 모두 맨 앞 주석에 lucide ISC 고지가 있다(그림을 옮긴 파일마다 고지).
- frontend/public/llms.txt "## 비상 대비" 절(tests/test_m13_llms.py 와 같은 범위)에 상세 주소 /emergency/<경보 id> 5개.
  상대 주소든 https://…/emergency/<id> 든 된다. 뒤에 다른 글자가 붙은 것(/emergency/alert-x 등)은 치지 않는다.

서버 컴포넌트·토큰 색만·text-alert-* 글자 그대로는 tests/test_m13_emergency.py(새 파일도 대상)가 본다.
명령으로 보는 것: 핵심 행동 그림 12개(대응표를 Record<KeyActionIcon, () => ReactNode> 로 두면 빠질 때 npx tsc --noEmit 실패),
npm run build 경로 표의 /emergency/[alert] 사전 렌더 5개(ƒ 아님).
화면 실측: frontend/e2e/emergency-detail.spec.ts(핵심 행동 li 마다 aria-hidden 아이콘, 대피소 링크 아이콘),
명도 대비: frontend/e2e/contrast.spec.ts 의 "경보 상세 기본(공습경보)"·"경보 상세 더 보기 펼침(핵경보)" 상태.
"""

import re
from pathlib import Path

import pytest

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
APP_EMERGENCY = FRONTEND / "app" / "emergency"
VIEW_EMERGENCY = FRONTEND / "src" / "views" / "emergency"
KEY_ACTION_ICONS = VIEW_EMERGENCY / "ui" / "key-action-icons.tsx"  # 핵심 행동 아이콘 대응표
LLMS = FRONTEND / "public" / "llms.txt"
ALERT_IDS = ["alert", "air-raid", "cbr", "nuclear", "all-clear"]  # 이슈 #72 CIVIL_ALERTS 의 id·순서
SECTION = re.compile(r"^## 비상 대비[ \t]*\n(.*?)(?=^## |\Z)", re.M | re.S)  # tests/test_m13_llms.py 와 같음
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
SVG_SHAPE = re.compile(r"<(?:path|circle|rect|line|polyline|polygon|ellipse)\b")
# 맨 앞 주석 읽기와 주석 빼기는 tests/test_m17_icons.py 와 같다
HEAD_COMMENT = re.compile(r"(?:\s*(?://[^\n]*|/\*.*?\*/))+", re.S)
COMMENT_END = re.compile(r"\*+/")
COMMENT_MARK = re.compile(r"^[ \t]*(?://+|/\*+|\*+)", re.M)  # 줄 앞 주석 기호. 줄 가운데 // 는 URL 이라 남긴다
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT = re.compile(r"(?<![:\"'`])//.*")


def _rel(path: Path) -> str:
    return path.relative_to(FRONTEND).as_posix()


def _read(path: Path) -> str:
    assert path.is_file(), f"파일 없음: {_rel(path)}"
    return path.read_text(encoding="utf-8")


def _head_comment(path: Path) -> str:
    """파일 맨 앞 주석의 글자. 주석 기호를 빼고 줄바꿈·공백을 한 칸으로 줄인다."""
    m = HEAD_COMMENT.match(_read(path))
    return " ".join(COMMENT_MARK.sub(" ", COMMENT_END.sub(" ", m.group(0) if m else "")).split())


def _code(path: Path) -> str:
    """주석을 뺀 소스."""
    return LINE_COMMENT.sub("", BLOCK_COMMENT.sub("", _read(path)))


def _isc_missing(head: str) -> list[str]:
    missing = [s for s in (ISC_COPYRIGHT, ISC_PERMISSION, SOURCE_URL) if s not in head]
    return (["ISC"] if not ISC.search(head) else []) + missing


def test_key_action_icons_isc_notice_in_head_comment() -> None:
    head = _head_comment(KEY_ACTION_ICONS)
    missing = _isc_missing(head)
    assert missing == [], f"{KEY_ACTION_ICONS.name} 맨 앞 주석에 lucide ISC 고지 없음: {missing}\n맨 앞 주석: {head!r}"


def test_key_action_icons_feather_mit_notice_in_head_comment() -> None:
    head = _head_comment(KEY_ACTION_ICONS)
    missing = [s for s in (MIT_COPYRIGHT, MIT_PERMISSION, MIT_CONDITION) if s not in head]
    if not MIT.search(head):
        missing.insert(0, "MIT")
    assert missing == [], f"{KEY_ACTION_ICONS.name} 맨 앞 주석에 Feather MIT 고지 없음(radio 그림): {missing}\n맨 앞 주석: {head!r}"


def test_svg_drawings_carry_isc_notice() -> None:
    offenders = []
    for p in (p for d in (APP_EMERGENCY, VIEW_EMERGENCY) for p in sorted(d.rglob("*.tsx"))):
        if SVG_SHAPE.search(_code(p)) and (missing := _isc_missing(_head_comment(p))):
            offenders.append(f"{_rel(p)}: {missing}")
    assert offenders == [], "SVG 도형을 옮긴 파일 맨 앞 주석에 lucide ISC 고지 없음\n" + "\n".join(offenders)


@pytest.mark.parametrize("alert_id", ALERT_IDS)
def test_llms_section_has_detail_path(alert_id: str) -> None:
    sections = SECTION.findall(_read(LLMS))
    assert len(sections) == 1, f"llms.txt 에 '## 비상 대비' 절이 {len(sections)}개(하나여야 함)"
    assert re.search(rf"/emergency/{re.escape(alert_id)}(?![\w-])", sections[0]), f"'/emergency/{alert_id}' 주소 없음"
