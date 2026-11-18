"""M17 이슈 #107(1-8 장보기 목록·가방/집 물 나누기·복사) llms.txt "## 비상 대비" 절 인수 테스트.

계약 (구현은 이 계약을 따른다)
- 절 범위는 tests/test_m13_llms.py 와 같다("## 비상 대비" 제목 다음 줄부터 다음 "## " 제목 전까지).
- #102 의 장보기 기준 줄(tests/test_m17_shopping_llms.py 의 SHOPPING_BASIS 가 한 줄에 다 있는 줄)은 그대로 두고,
  그 아래의 다른 한 줄에 장보기 목록 설명이 있다(새 줄은 장보기 기준 줄 바로 아래에 넣는다).
  한 줄 안에 "장보기"·"6병 묶음"·"3일 가방"·"집"·"복사"가 모두 있다(6병 묶음 단위, 3일 가방의 가방/집 나누기, 복사).
  예: "- 장보기 목록(/emergency#calc): 물은 2L 생수 6병 묶음 수로 적고, 3일 가방은 가방에 넣을 몫과 집에 둘 몫을 나눔. 목록 글자를 복사할 수 있음"
  6병·3일 앞에 숫자가 붙은 것(16병·13일 등)은 치지 않는다.
- 기존 llms.txt 검사(tests/test_m13_llms.py·tests/test_m17_shopping_llms.py 등)는 그대로 통과해야 한다.

화면 실측: frontend/e2e/emergency-shopping.spec.ts
"""

import re
from pathlib import Path

LLMS = Path(__file__).resolve().parents[1] / "frontend" / "public" / "llms.txt"
SECTION = re.compile(r"^## 비상 대비[ \t]*\n(.*?)(?=^## |\Z)", re.M | re.S)  # test_m13_llms.py 와 같은 절 범위
# #102 장보기 기준 줄(test_m17_shopping_llms.py 와 같음)
SHOPPING_BASIS = [re.compile(p) for p in ("장보기", "농림수산성", r"(?<!\d)2(?:인|명)", r"(?<!\d)1주", "인원", "한국 품목")]
# 장보기 목록 설명: 한 줄에 모두
SHOPPING_LIST = [re.compile(p) for p in ("장보기", r"(?<!\d)6병 묶음", r"(?<!\d)3일 가방", "집", "복사")]


def test_section_has_shopping_list_line_below_basis() -> None:
    section = SECTION.search(LLMS.read_text(encoding="utf-8"))
    assert section, "llms.txt 에 '## 비상 대비' 절 없음"
    lines = section.group(1).splitlines()
    basis = [i for i, line in enumerate(lines) if all(p.search(line) for p in SHOPPING_BASIS)]
    assert basis, "#102 장보기 기준 줄 없음(tests/test_m17_shopping_llms.py)"
    below = lines[basis[0] + 1 :]
    assert any(all(p.search(line) for p in SHOPPING_LIST) for line in below), (
        "장보기 기준 줄 아래에 '장보기'·'6병 묶음'·'3일 가방'·'집'·'복사'가 한 줄에 있는 장보기 목록 설명 없음"
    )
