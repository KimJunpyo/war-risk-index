"""M12 이슈 #50 응답 JSON 생성기(publish.py) 회귀 테스트.

같은 data/·out/ 로 지금 API(TestClient) 응답과 생성 파일을 JSON 파싱 뒤 대조한다.
공공데이터 키가 있을 때와 없을 때(대피소·공관 available false) 둘 다 본다. 파일은 tmp 폴더에만 쓴다.
대피소 위치 검색은 Worker 로직(타일 합치기 → 사각형·반경 필터 → 거리순)을 Python 으로 흉내 내 대조한다.
"""

import json
import math
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

import publish
import shelters
from backend.app import main

KEY_ENV = main.DATA_GO_KR_SERVICE_KEY
# 대표 좌표: 서울 도심·부산·제주·타일 경계(정확히 0.1° 선)·세종·범위 밖
POINTS = [("37.57", "126.98"), ("35.18", "129.08"), ("33.5", "126.53"), ("37.5", "127"),
          ("36.48", "127.29"), ("40", "127")]


@pytest.fixture(scope="module", params=["key", "no_key"])
def published(request: pytest.FixtureRequest, tmp_path_factory: pytest.TempPathFactory) -> Iterator[tuple[str, Path]]:
    """키 유무별로 생성 파일을 tmp 에 쓰고, 그 키 상태를 유지한 채 넘긴다."""
    out_dir = tmp_path_factory.mktemp(f"api_{request.param}")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv(KEY_ENV, "test-key" if request.param == "key" else "")
        publish.write(publish.build(), out_dir)
        yield request.param, out_dir


def _load(out_dir: Path, rel: str) -> Any:
    return json.loads((out_dir / rel).read_text(encoding="utf-8"))


def _files(out_dir: Path) -> list[str]:
    return sorted(p.relative_to(out_dir).as_posix() for p in out_dir.rglob("*.json"))


def _url(rel: str) -> str | None:
    """생성 파일 → 같은 응답을 내는 지금 API 경로. 따로 대조하는 파일은 None."""
    if rel in ("status.json", "shelters/meta.json") or rel.startswith("shelters/tiles/"):
        return None
    if rel.startswith("shelters/region/"):
        return "/api/shelters?region=" + rel.removeprefix("shelters/region/").removesuffix(".json").replace("/", " ")
    return "/api/" + rel.removesuffix(".json")


def test_fixed_files_exist(published: tuple[str, Path]) -> None:
    case, out_dir = published
    files = set(_files(out_dir))
    fixed = {"pairs.json", "countries.json", "cases.json", "blend.json", "live.json", "status.json",
             "shelters/regions.json", "shelters/meta.json"}
    assert fixed <= files
    for pid in publish.PAIRS:
        assert {f"pairs/{pid}/index.json", f"pairs/{pid}/catalysts.json"} <= files
    codes = [c["code"] for c in _load(out_dir, "countries.json")]
    assert codes
    for code in codes:
        assert {f"countries/{code}/{n}.json" for n in ("index", "catalysts", "embassies")} <= files
    has_shelters = any(f.startswith("shelters/tiles/") for f in files)
    assert has_shelters == (case == "key")
    assert any(f.startswith("shelters/region/") for f in files) == (case == "key")


def test_files_match_api(published: tuple[str, Path], client: TestClient) -> None:
    _, out_dir = published
    checked = 0
    for rel in _files(out_dir):
        url = _url(rel)
        if url is None:
            continue
        res = client.get(url)
        assert res.status_code == 200, url
        assert _load(out_dir, rel) == res.json(), url
        checked += 1
    assert checked > 100


def test_status_matches_health(published: tuple[str, Path], client: TestClient) -> None:
    _, out_dir = published
    body = client.get("/api/health").json()
    assert _load(out_dir, "status.json") == {"live_as_of": body["live_as_of"], "index_date": body["index_date"]}


def test_unknown_region_from_meta(published: tuple[str, Path], client: TestClient) -> None:
    """목록에 없는 지역: Worker 는 meta.json 으로 빈 응답을 만든다."""
    _, out_dir = published
    meta = _load(out_dir, "shelters/meta.json")
    assert client.get("/api/shelters?region=없는지역").json() == {**meta, "items": [], "total": 0}


def _worker_nearby(out_dir: Path, lat: str, lon: str) -> dict:
    """Worker 위치 검색 흉내: main.list_shelters 의 좌표 분기와 같은 순서로 계산한다."""
    meta = _load(out_dir, "shelters/meta.json")
    out = {**meta, "items": [], "total": 0}
    if not meta["available"]:
        return out
    y, x = float(lat), float(lon)
    if not (main.KOREA_LAT[0] <= y <= main.KOREA_LAT[1] and main.KOREA_LON[0] <= x <= main.KOREA_LON[1]):
        return out
    dy = main.SHELTER_RADIUS_M / main.METERS_PER_DEG_LAT
    dx = dy / math.cos(math.radians(y))
    near = []
    for ty in range(math.floor((y - dy) * publish.TILE_SCALE), math.floor((y + dy) * publish.TILE_SCALE) + 1):
        for tx in range(math.floor((x - dx) * publish.TILE_SCALE), math.floor((x + dx) * publish.TILE_SCALE) + 1):
            tile = out_dir / f"shelters/tiles/{ty}_{tx}.json"
            for s in json.loads(tile.read_text(encoding="utf-8")) if tile.exists() else []:
                if y - dy <= s["lat"] <= y + dy and x - dx <= s["lon"] <= x + dx:
                    d = round(shelters.haversine_m(y, x, s["lat"], s["lon"]))
                    if d <= main.SHELTER_RADIUS_M:
                        near.append({**s, "distance_m": d})
    near.sort(key=lambda s: s["distance_m"])
    out["total"] = len(near)
    out["items"] = near[:main.SHELTER_NEARBY_LIMIT]
    return out


def _tie_order(res: dict) -> dict:
    """거리가 같은 시설의 순서는 정렬 구현마다 다를 수 있어(pandas 기본 정렬은 불안정) 동점 안에서만 다시 정렬."""
    return {**res, "items": sorted(res["items"], key=lambda s: (s["distance_m"], s["name"], s["address"],
                                                                 s["lat"], s["lon"]))}


@pytest.mark.parametrize(("lat", "lon"), POINTS)
def test_nearby_from_tiles_matches_api(published: tuple[str, Path], client: TestClient, lat: str, lon: str) -> None:
    case, out_dir = published
    api = client.get(f"/api/shelters?lat={lat}&lon={lon}").json()
    worker = _worker_nearby(out_dir, lat, lon)
    if case == "key" and lat != "40":
        assert api["total"] > 0  # 빈 결과끼리 같아서 통과하는 일이 없도록
    assert [s["distance_m"] for s in worker["items"]] == sorted(s["distance_m"] for s in worker["items"])
    assert _tie_order(worker) == _tie_order(api)


def test_write_removes_stale_files(tmp_path: Path) -> None:
    (tmp_path / "shelters/tiles").mkdir(parents=True)
    (tmp_path / "shelters/tiles/1_2.json").write_text("[]", encoding="utf-8")
    publish.write({"live.json": {"as_of": None, "slots": 0}}, tmp_path)
    assert _files(tmp_path) == ["live.json"]
    assert _load(tmp_path, "live.json") == {"as_of": None, "slots": 0}


def test_tile_key_floor() -> None:
    assert publish.tile_key(37.5, 127.0) == "375_1270"
    assert publish.tile_key(37.49, 126.99) == "374_1269"
