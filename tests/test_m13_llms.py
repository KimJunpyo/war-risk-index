"""M13 이슈 #75(1-5 비상 가방 체크리스트와 물·식량 계산기 화면) llms.txt "## 비상 대비" 절 인수 테스트.

계약 (구현은 이 계약을 따른다)
- frontend/public/llms.txt 에 줄 전체가 "## 비상 대비"(뒤 공백만 허용)인 제목이 하나 있다.
  절은 그 제목 다음 줄부터 다음 "## " 제목 전까지(없으면 파일 끝)다. 아래 글자는 모두 이 절 안에 있어야 한다.
  - 페이지 주소: "/emergency". 상대 주소든 https://…/emergency 든 되고, 뒤에 #kit 같은 앵커가 붙어도 된다(/emergency-x 는 안 됨).
  - 경보 종류: alerts.ts CIVIL_ALERTS 의 name 5개(경계경보·공습경보·화생방경보·핵경보·경보해제) 글자 그대로.
  - 가방·비축 기준: "3일"·"7일"·"14일"(kit.ts KIT_PERIODS 의 days). 바로 앞에 숫자가 붙은 것(13일·17일 등)은 치지 않는다.
  - 계산 기준: 한 줄 안에 "1인 1일"·"3L"·"3끼"(kit.ts WATER_L_PER_PERSON_DAY·MEALS_PER_PERSON_DAY). 예: "1인 1일 물 3L·3끼".
    3L·3끼 앞에 숫자·소수점이 붙은 것(13L·0.3L)은 치지 않는다.
  - 출처 이름: kit.ts KIT_SOURCES 와 alerts.ts ALERT_SOURCES 의 name 글자 그대로(공백·괄호 포함, 이 테스트가 소스에서 읽는다).
- 출처 이름은 이 절 안에 둔다. "## 출처" 절은 푸터 출처 배열과 같아야 하므로(tests/test_m7_footer.py) 거기에 더하지 않는다.
- 기존 llms.txt 검사(tests/test_m4_public_data.py 의 "여행경보:…외교부" 줄, tests/test_m7_footer.py 의 "## 출처",
  tests/test_m1_frontend.py 의 금지어)는 그대로 통과해야 한다. 이 파일은 "## 비상 대비" 절만 본다.

화면 실측: frontend/e2e/emergency-kit.spec.ts
"""

import re
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"
LLMS = FRONTEND / "public" / "llms.txt"
GUIDE_MODEL = FRONTEND / "src" / "entities" / "guide" / "model"
KIT_TS = GUIDE_MODEL / "kit.ts"
ALERTS_TS = GUIDE_MODEL / "alerts.ts"
SECTION = re.compile(r"^## 비상 대비[ \t]*\n(.*?)(?=^## |\Z)", re.M | re.S)
PAGE_PATH = re.compile(r"/emergency(?![\w-])")
PERIOD_DAYS = [3, 7, 14]  # 이슈 #73 KIT_PERIODS 의 days(Q2)
# 계산 기준(Q3): 한 줄에 셋 다
BASIS = [re.compile(r"1인 1일"), re.compile(r"(?<![\d.])3L"), re.compile(r"(?<![\d.])3끼")]


def _section() -> str:
    """llms.txt "## 비상 대비" 절 본문."""
    sections = SECTION.findall(LLMS.read_text(encoding="utf-8"))
    assert len(sections) == 1, f"llms.txt 에 '## 비상 대비' 절이 {len(sections)}개(하나여야 함)"
    return sections[0]


def _ts_names(path: Path, const: str) -> list[str]:
    """TS 소스의 `export const <const> … = { … };`(또는 [ … ];) 블록 안 `name: "…"` 값."""
    block = re.search(rf"export const {const}\b[^=]*=\s*[\[{{](.*?)\n[\]}}];", path.read_text(encoding="utf-8"), re.S)
    assert block, f"{path.name} 에 {const} 없음"
    names = re.findall(r'\bname:\s*"([^"]+)"', block.group(1))
    assert names, f"{path.name} {const} 에서 name 을 찾지 못함"
    return names


def test_section_has_page_path() -> None:
    assert PAGE_PATH.search(_section()), "'/emergency' 주소 없음"


def test_section_has_alert_names() -> None:
    section = _section()
    missing = [n for n in _ts_names(ALERTS_TS, "CIVIL_ALERTS") if n not in section]
    assert missing == [], f"경보 이름 없음: {missing}"


def test_section_has_kit_periods() -> None:
    section = _section()
    missing = [f"{d}일" for d in PERIOD_DAYS if not re.search(rf"(?<!\d){d}일", section)]
    assert missing == [], f"가방·비축 기준 없음: {missing}"


def test_section_has_calc_basis() -> None:
    lines = _section().splitlines()
    assert any(all(p.search(line) for p in BASIS) for line in lines), "한 줄에 '1인 1일'·'3L'·'3끼'가 있는 계산 기준 없음"


def test_section_has_source_names() -> None:
    section = _section()
    names = _ts_names(KIT_TS, "KIT_SOURCES") + _ts_names(ALERTS_TS, "ALERT_SOURCES")
    missing = [n for n in names if n not in section]
    assert missing == [], f"출처 이름 없음: {missing}"
