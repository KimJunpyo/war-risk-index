"""M17 이슈 #102(1-3 장보기 단위 환산 모델과 출처) llms.txt "## 비상 대비" 절 인수 테스트.

계약 (구현은 이 계약을 따른다)
- 절 범위는 tests/test_m13_llms.py 와 같다("## 비상 대비" 제목 다음 줄부터 다음 "## " 제목 전까지).
- 장보기 기준 한 줄: 한 줄 안에 "장보기"·"농림수산성"·"2인"(또는 "2명")·"1주"·"인원"·"한국 품목"이 모두 있다.
  예: "- 장보기 목록: 일본 농림수산성 가정 비축 예(어른 2명·1주)를 인원·기간에 맞춰 늘리고 주식·반찬 일부를 한국 품목으로 바꿈"
  2인·1주 앞에 숫자가 붙은 것(12인·11주 등)은 치지 않는다.
- 새 출처(kit.ts KIT_SOURCES 에 더한 농림수산성 출처) 이름은 tests/test_m13_llms.py 의 test_section_has_source_names 가 확인한다.
"""

import re
from pathlib import Path

LLMS = Path(__file__).resolve().parents[1] / "frontend" / "public" / "llms.txt"
SECTION = re.compile(r"^## 비상 대비[ \t]*\n(.*?)(?=^## |\Z)", re.M | re.S)  # test_m13_llms.py 와 같은 절 범위
# 장보기 기준(plan.md 7-5, Q4 보완): 한 줄에 모두
SHOPPING_BASIS = [re.compile(p) for p in ("장보기", "농림수산성", r"(?<!\d)2(?:인|명)", r"(?<!\d)1주", "인원", "한국 품목")]


def test_section_has_shopping_basis() -> None:
    section = SECTION.search(LLMS.read_text(encoding="utf-8"))
    assert section, "llms.txt 에 '## 비상 대비' 절 없음"
    lines = section.group(1).splitlines()
    assert any(all(p.search(line) for p in SHOPPING_BASIS) for line in lines), (
        "한 줄에 '장보기'·'농림수산성'·'2인(2명)'·'1주'·'인원'·'한국 품목'이 있는 장보기 기준 없음"
    )
