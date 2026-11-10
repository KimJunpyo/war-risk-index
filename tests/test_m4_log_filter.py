"""#11 uvicorn 접근 로그 필터. TestClient 는 uvicorn.access 레코드를 만들지 않아 필터를 직접 부른다."""

import logging

import pytest

from backend.app.main import _NoShelterQueryLog

ACCESS_FORMAT = '%s - "%s %s HTTP/%s" %d'  # uvicorn 접근 로그 형식


def _keep(path: str) -> bool:
    record = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, ACCESS_FORMAT,
                               ("127.0.0.1:50000", "GET", path, "1.1", 200), None)
    return _NoShelterQueryLog().filter(record)


@pytest.mark.parametrize("path", [
    "/api/shelters?lat=37.57&lon=126.98",
    "/api/shelters/?lat=37.57&lon=126.98",  # redirect_slashes 307
    "/api/%73helters?lat=37.57&lon=126.98",  # 퍼센트 인코딩 경로
    "/api/shelters?region=%EC%84%9C%EC%9A%B8",
])
def test_shelter_queries_dropped(path: str) -> None:
    assert _keep(path) is False


@pytest.mark.parametrize("path", ["/api/countries", "/api/shelters/regions", "/api/pairs?x=1"])
def test_other_requests_kept(path: str) -> None:
    assert _keep(path) is True
