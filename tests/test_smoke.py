"""백엔드 기존 엔드포인트 스모크 테스트. 로컬 out/·data/ 산출물을 그대로 읽는다."""

import pytest


@pytest.mark.parametrize("path", ["/api/countries", "/api/pairs"])
def test_list_endpoints_ok(client, path: str) -> None:
    res = client.get(path)
    assert res.status_code == 200, res.text
    assert isinstance(res.json(), list)
