"""M12 이슈 #50 응답 JSON 생성기(publish.py) 회귀 테스트.

같은 data/·out/ 픽스처(tests/fixtures/m12, make_fixture.py 로 실제 데이터에서 잘라 만듦)로
지금 API(TestClient) 응답과 생성 파일을 JSON 파싱 뒤 대조한다. 실제 data/·out/ 은 읽지 않는다.
공공데이터 키가 있을 때와 없을 때(대피소·공관 available false) 둘 다 본다. 파일은 tmp 폴더에만 쓴다.
대피소 위치 검색은 Worker 로직(타일 합치기 → 사각형·반경 필터 → 거리순)을 Python 으로 흉내 내 대조한다.
"""

import json
import math
from collections.abc import Iterator
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import blend
import embassies
import publish
import shelters
from backend.app import main

KEY_ENV = main.DATA_GO_KR_SERVICE_KEY
FIX = Path(__file__).resolve().parent / "fixtures" / "m12"
# 대표 좌표: 서울 도심·부산·타일 경계(정확히 0.1° 선, 픽스처 구역 가장자리)·제주(픽스처에 시설 없음)·범위 밖
POINTS = [("37.57", "126.98"), ("35.18", "129.08"), ("37.6", "127"), ("33.5", "126.53"), ("40", "127")]
NONEMPTY = POINTS[:3]  # 키가 있으면 반경 안 시설이 있어야 하는 좌표
FIXTURE_COLLECTED = "2026-11-13"  # make_fixture.COLLECTED
# main 이 import 때 ROOT 로 만들어 두는 경로. 나머지는 요청 때 main.ROOT / <모듈 상수> 로 만든다
IMPORT_TIME_PATHS = {"INDEX_FILE": "out/index_v1.csv", "CATALYST_FILE": "data/gdelt_catalyst.csv",
                     "COUNTRY_INDEX_FILE": "out/country_index.csv", "COUNTRY_META_FILE": "out/country_meta.csv",
                     "CATALYST_ALL_FILE": "data/gdelt_catalyst_all.csv"}


@pytest.fixture(scope="module", params=["key", "no_key"])
def published(request: pytest.FixtureRequest, tmp_path_factory: pytest.TempPathFactory) -> Iterator[tuple[str, Path]]:
    """키 유무별로 생성 파일을 tmp 에 쓰고, 그 키 상태를 유지한 채 넘긴다."""
    out_dir = tmp_path_factory.mktemp(f"api_{request.param}")
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv(KEY_ENV, "test-key" if request.param == "key" else "")
        mp.setattr(main, "ROOT", FIX)
        for name, rel in IMPORT_TIME_PATHS.items():
            mp.setattr(main, name, FIX / rel)
        mp.setattr(blend, "BLEND_FILE", FIX / "out" / "blend_weights.json")  # blend.load 는 작업 폴더 기준 상대 경로
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
    assert checked >= 40  # 쌍·나라별 파일까지 실제로 대조했는지


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
    if case == "key" and (lat, lon) in NONEMPTY:
        assert api["total"] > 0  # 빈 결과끼리 같아서 통과하는 일이 없도록
    assert [s["distance_m"] for s in worker["items"]] == sorted(s["distance_m"] for s in worker["items"])
    assert _tie_order(worker) == _tie_order(api)


def test_fixture_is_not_empty(published: tuple[str, Path]) -> None:
    """빈 표끼리 같아서 대조가 통과하는 일이 없도록 픽스처가 실제로 채워졌는지 본다."""
    case, out_dir = published
    assert all(p["latest"] for p in _load(out_dir, "pairs.json"))
    countries = _load(out_dir, "countries.json")
    assert len(countries) == 8 and all(c["live"] for c in countries)
    assert _load(out_dir, "countries/UKR/catalysts.json")["events"]
    assert _load(out_dir, "pairs/RUS-UKR/catalysts.json")["events"]
    assert None not in _load(out_dir, "status.json").values()
    jpn = _load(out_dir, "countries/JPN/embassies.json")
    assert jpn["as_of"] == (FIXTURE_COLLECTED if case == "key" else None)
    assert bool(jpn["embassies"]) == (case == "key")


def test_embassy_as_of_fallback_mtime(tmp_path: Path) -> None:
    """수집일 열이 없는 예전 파일만 mtime(KST 날짜)을 쓴다."""
    path = tmp_path / "embassies.csv"
    path.write_text("iso2,name\nJP,x\n", encoding="utf-8")
    expected = main.datetime.fromtimestamp(path.stat().st_mtime, embassies.KST).strftime("%Y-%m-%d")
    assert main._embassy_as_of(pd.DataFrame({"iso2": ["JP"]}), path) == expected
    df = pd.DataFrame({"iso2": ["JP"], embassies.COLLECTED_COLUMN: ["2026-01-02"]})
    assert main._embassy_as_of(df, path) == "2026-01-02"


def test_write_removes_stale_files(tmp_path: Path) -> None:
    (tmp_path / "shelters/tiles").mkdir(parents=True)
    (tmp_path / "shelters/tiles/1_2.json").write_text("[]", encoding="utf-8")
    publish.write({"live.json": {"as_of": None, "slots": 0}}, tmp_path)
    assert _files(tmp_path) == ["live.json"]
    assert _load(tmp_path, "live.json") == {"as_of": None, "slots": 0}


def test_tile_key_floor() -> None:
    assert publish.tile_key(37.5, 127.0) == "375_1270"
    assert publish.tile_key(37.49, 126.99) == "374_1269"


def test_write_refuses_to_drop_public_data(tmp_path: Path) -> None:
    """키 누락·상태 동기화 실패로 공공데이터가 빠지면, 이미 쓴 available=true 응답과 타일을 지우지 않고 멈춘다."""
    publish.write({"shelters/meta.json": {"available": True, "as_of": "2026-11-13"},
                   "shelters/tiles/1_2.json": []}, tmp_path)
    with pytest.raises(RuntimeError, match="shelters/meta.json"):
        publish.write({"shelters/meta.json": {"available": False, "as_of": None}}, tmp_path)
    assert _files(tmp_path) == ["shelters/meta.json", "shelters/tiles/1_2.json"]
    assert _load(tmp_path, "shelters/meta.json")["available"] is True


EMBASSY_ITEM = {"country_iso_alp2": "JP", "embassy_kor_nm": "주일본 대사관", "embassy_ty_cd": "10",
                "embassy_ty_cd_nm": "대사관", "emblgbd_addr": "Tokyo", "tel_no": "1", "urgency_tel_no": "2"}


@pytest.mark.parametrize(("collected_days_ago", "fetched"), [(1, True), (0, False)])
def test_embassy_refresh_by_collected_date(tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
                                           collected_days_ago: int, fetched: bool) -> None:
    """복사·복원으로 mtime 이 방금이어도 수집일(KST)이 오늘 전이면 다시 받고, 오늘이면 받지 않는다."""
    path = tmp_path / "embassies.csv"
    collected = (datetime.now(embassies.KST) - timedelta(days=collected_days_ago)).strftime("%Y-%m-%d")
    path.write_text(f"iso2,name,{embassies.COLLECTED_COLUMN}\nJP,x,{collected}\n", encoding="utf-8")  # mtime = 지금
    monkeypatch.setattr(embassies, "EMBASSY_FILE", path)
    monkeypatch.setattr(embassies, "_last_failure", 0.0)
    monkeypatch.setenv(KEY_ENV, "test-key")
    calls: list[str] = []
    monkeypatch.setattr(embassies.data_go_kr, "fetch_all", lambda url, *_: calls.append(url) or [EMBASSY_ITEM])
    assert embassies.update() is fetched
    assert bool(calls) == fetched
