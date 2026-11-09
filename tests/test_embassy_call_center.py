"""#13 영사콜센터 번호: 백엔드 상수와 프론트 상수(API 실패 시 표시용)가 같은지 확인."""

import re
from pathlib import Path

import embassies

EMBASSY_MODEL = Path(__file__).resolve().parents[1] / "frontend/src/widgets/embassy-contacts/model/embassy.ts"


def test_frontend_call_center_matches_backend() -> None:
    m = re.search(r"CALL_CENTER = \{([^}]*)\}", EMBASSY_MODEL.read_text(encoding="utf-8"))
    assert m, "프론트 CALL_CENTER 없음"
    front = dict(re.findall(r'(\w+): "([^"]*)"', m.group(1)))
    assert front == embassies.CALL_CENTER
