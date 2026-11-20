"""M17 이슈 #108(1-9 `/emergency` 첫 화면: 경보 타일과 미리 준비하기) llms.txt "## 비상 대비" 절 인수 테스트.

계약 (구현은 이 계약을 따른다)
- 절 범위는 tests/test_m13_llms.py 와 같다("## 비상 대비" 제목 다음 줄부터 다음 "## " 제목 전까지).
- 첫 화면 설명은 절의 앞쪽 줄("페이지"·경보·"비상 가방" 줄)에 둔다. 절 안에
  - 첫 화면 두 영역의 제목 "지금 어떤 경보인가요"(경보 타일 → 상세)와 "미리 준비하기"(가방 진행·우리 집 물 카드)가 있다(물음표는 보지 않음).
  - "체크리스트"가 없다. 가방은 #105 부터 아이콘 타일로 담고 첫 화면 가방 카드에 "n/7 챙김"으로 보인다(체크박스 목록이 아님).
- 경보 이름·/emergency·3·7·14일·계산 기준·출처 이름은 tests/test_m13_llms.py, 상세 주소 5개는 tests/test_m17_alert_detail.py 가 본다.

화면 실측: frontend/e2e/emergency.spec.ts(경보 타일·준비 카드·page.tsx 설명 글자),
명도 대비: frontend/e2e/contrast.spec.ts 의 "비상 대비 페이지 기본"·"준비 카드 진행 중" 상태.
"""

import re
from pathlib import Path

import pytest

LLMS = Path(__file__).resolve().parents[1] / "frontend" / "public" / "llms.txt"
SECTION = re.compile(r"^## 비상 대비[ \t]*\n(.*?)(?=^## |\Z)", re.M | re.S)  # tests/test_m13_llms.py 와 같은 절 범위
FIRST_SCREEN_TITLES = ["지금 어떤 경보인가요", "미리 준비하기"]  # 첫 화면 두 영역의 h2 글자
OLD_WORD = "체크리스트"  # 개편 전 가방 영역 설명


def _section() -> str:
    """llms.txt "## 비상 대비" 절 본문."""
    sections = SECTION.findall(LLMS.read_text(encoding="utf-8"))
    assert len(sections) == 1, f"llms.txt 에 '## 비상 대비' 절이 {len(sections)}개(하나여야 함)"
    return sections[0]


@pytest.mark.parametrize("title", FIRST_SCREEN_TITLES)
def test_section_describes_first_screen(title: str) -> None:
    assert title in _section(), f"첫 화면 영역 '{title}' 설명 없음"


def test_section_has_no_checklist_word() -> None:
    lines = [line for line in _section().splitlines() if OLD_WORD in line]
    assert lines == [], f"'{OLD_WORD}'가 남은 줄(가방은 아이콘 타일로 담는다): {lines}"
