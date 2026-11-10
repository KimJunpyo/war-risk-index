"""M4 이슈 #10(4-2 외교부 여행경보)·#11(4-3 민방위 대피시설 API)·#13(4-5 재외공관) 백엔드 인수 테스트.

네트워크를 쓰지 않는다. 공공데이터포털 호출은 아래 대체 지점 하나로만 일어나야 하고, 테스트는 그 함수를
픽스처(tests/fixtures/m4/*.json = 응답의 response.body.items.item 배열)로 바꾼다.

계약 (구현은 이 계약을 따른다)

[공통] 루트 data_go_kr.py (신규)
- KEY_ENV = "DATA_GO_KR_SERVICE_KEY"
- service_key() -> str | None
    호출 시점의 os.environ 을 읽는다(import 시점 고정 금지). 비었으면 None.
    포털 "인코딩 키"(% 포함)를 urllib.parse.unquote 한 값을 돌려준다(unquote_plus 금지).
- _get_json(url: str) -> dict      ← 유일한 네트워크 지점. 테스트는 data_go_kr._get_json 을 monkeypatch 한다.
- fetch_all(url: str, page_size: int, **params: str) -> list[dict]
    키 없으면 _get_json 을 부르지 않고 RuntimeError.
    쿼리: serviceKey(unquote 한 키를 한 번만 인코딩) · pageNo(1부터) · numOfRows=page_size · returnType=json(대소문자 무관) · params.
    response.header.resultCode != "0" 이면 RuntimeError. items.item 이 dict 1건이면 [dict], 비었으면 [].
    totalCount 를 다 받을 때까지 pageNo 를 올린다. 국가 필터(cond[...]) 없이 전체를 받는다.
- main.py 는 요청 시점에 ROOT / <모듈>.<파일 상수> 로 데이터 경로를 만든다(테스트가 상수를 tmp 경로로 바꿈).
- main._daily_refresh 는 travel_advisory.update · shelters.update · embassies.update 를 각각 try/except +
  log.exception 으로 감싸, _recently_written 조기 반환보다 먼저 부른다.

[#10] travel_advisory.py
- MOFA_URL = "https://apis.data.go.kr/1262000/TravelAlarmService2/getTravelAlarmList2", SOURCES["kr_mofa"] = "외교부"
- parse_mofa(items: list[dict]) -> tuple[list[dict], list[str]]
    행 = COLUMNS 키. iso3 = country_iso_alp2 → ISO alpha-3, level = int(alarm_lvl),
    label = {1: "여행유의", 2: "여행자제", 3: "출국권고", 4: "여행금지"}[level], date = written_dt[:10] 또는 None,
    summary = remark, url = "https://www.0404.go.kr" 로 시작. 매핑 실패는 failed 에 country_nm.
    한 나라 여러 행은 기존 dedupe() 가 최고 단계 하나로 줄인다.
- update(): 키 없음 → 외교부 행 0건(직전 값도 버림), data.go.kr 호출 없음. 외교부 호출 실패 → 직전 외교부 행 유지.
  어느 경우든 미·영은 정상 갱신.
- GET /api/countries: 키 없으면 advisory 에서 kr_mofa 를 뺀다(CSV 에 남아 있어도). us_state·uk_fcdo 는 키 유무와 무관.

[#11] 루트 shelters.py (신규)
- SHELTER_URL = "https://apis.data.go.kr/1741000/civil_defense_shelter_info/info", SHELTER_FILE = Path("data/shelters.csv"),
  PAGE_SIZE (≤100, 테스트가 바꿀 수 있게 update 안에서 모듈 상수를 읽는다)
- haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float, self_check() -> None
- update(force: bool = False) -> bool
    키 없음 → False, 호출·파일 쓰기 없음. 실패 → 예외 전파, 기존 파일 그대로(임시 파일 후 교체).
    저장 행 = RMV_YMD 비었고 OPER_STTS == "사용중" 이고 LAT_EPSG4326·LOT_EPST4326(원문 오타) 가 있는 시설, 1행 1시설.
    주소 = ROAD_NM_WHOL_ADDR, 비었으면 LCTN_WHOL_ADDR. 시·도는 옛 명칭만 현행 이름으로 정규화(강원도 → 강원특별자치도 등)하고
    그 밖에는 원천 표기를 따른다. 허용 목록 = 기존 17개 + "전남광주통합특별시"(2026-11-09 원천이 광주·전남 대부분을 이 이름으로 표기).
    시·군·구 = 주소 두 번째 낱말이 시·군·구로 끝날 때만, 아니면 없음(세종).
- GET /api/shelters?lat=&lon=  → {"available": bool, "as_of": "YYYY-MM-DD" | null, "items": [...]}
    소수점 3자리 이상이면 422. 위도 33~39·경도 124~132 밖이면 items []. 반경 5000m, 가까운 순 최대 10곳.
    item = {name, address, lat, lon, distance_m, capacity(int | null), kind(=FCLT_SE)}.
    as_of = DAT_UPDT_PNT 최댓값의 날짜. 키가 없거나 파일이 없으면 available false, items [].
- GET /api/shelters?region=<시·도>[ <시·군·구>] → 같은 모양, 해당 지역 최대 50곳, distance_m null.
  lat·lon·region 모두 없으면 422.
- GET /api/shelters/regions → {"available": bool, "regions": [{"sido": str, "sigungu": [str, ...]}]}
- 요청 좌표를 로그·파일에 쓰지 않는다.

[#13] 루트 embassies.py (신규)
- EMBASSY_URL = "https://apis.data.go.kr/1262000/EmbassyService2/getEmbassyList2", EMBASSY_FILE = Path("data/embassies.csv")
- update(force: bool = False) -> bool : 키 없음 → False·호출 없음, 실패 → 예외 전파·기존 파일 유지.
- 영사콜센터 상수(출처 https://www.0404.go.kr, 확인일 2026-11-09): 국내 "02-3210-0404", 해외 "+82-2-3210-0404"
- GET /api/countries/{code}/embassies (code = 다른 국가 API 와 같은 CAMEO 코드, 모르는 코드 404)
    → {"available": bool, "as_of": "YYYY-MM-DD" | null,
       "call_center": {"tel": "02-3210-0404", "tel_overseas": "+82-2-3210-0404", "source": "https://www.0404.go.kr..."},
       "embassies": [{name, kind, address, tel, emergency_tel}]}
    필드 원천: embassy_kor_nm, embassy_ty_cd_nm, emblgbd_addr(실제 응답 이름), tel_no, urgency_tel_no.
    대사관(embassy_ty_cd 10)이 총영사관보다 먼저. KOR·키 없음·데이터 없음 → embassies [] (call_center 는 항상).

수동: 실제 키로 수집(행 수·totalCount 대조, 연결 안 되는 나라 목록), compileall, uvicorn 30초 Traceback, PR 설명 항목.
"""

import json
import logging
import re
import urllib.parse
from datetime import date
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).parent / "fixtures" / "m4"
KEY_ENV = "DATA_GO_KR_SERVICE_KEY"
ENCODED_KEY = "ab%2Bcd%2Fef%3D%3D"  # 포털 "인코딩 키" 모양의 가짜 값
RAW_KEY = "ab+cd/ef=="
TRAVEL_PATH = "/1262000/TravelAlarmService2/getTravelAlarmList2"
EMBASSY_PATH = "/1262000/EmbassyService2/getEmbassyList2"
SHELTER_PATH = "/1741000/civil_defense_shelter_info/info"
SEOUL = {"lat": "37.57", "lon": "126.98"}
RADIUS_M = 5000
NEARBY_LIMIT = 10
REGION_LIMIT = 50
SIDO_17 = {
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
    "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
}
# 원천(2026-11-09 수집 18,846건)이 광주 5개 구·전남 대부분을 이 이름으로 표기(담양군 19건만 "전라남도"). 원천 표기를 따름
SIDO_ALLOWED = SIDO_17 | {"전남광주통합특별시"}
CALL_CENTER_TEL = "02-3210-0404"
CALL_CENTER_TEL_OVERSEAS = "+82-2-3210-0404"
SHELTER_FIELDS = {"name", "address", "lat", "lon", "distance_m", "capacity", "kind"}
EMBASSY_FIELDS = {"name", "kind", "address", "tel", "emergency_tel"}


def _items(name: str) -> list[dict]:
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


class FakePortal:
    """data_go_kr._get_json 대체. 경로별 픽스처를 pageNo·numOfRows 로 잘라 포털 응답 모양으로 돌려준다."""

    def __init__(self, routes: dict[str, list[dict]], fail_on_page: int | None = None, result_code: str = "0"):
        self.routes, self.fail_on_page, self.result_code = routes, fail_on_page, result_code
        self.urls: list[str] = []

    def __call__(self, url: str) -> dict:
        self.urls.append(url)
        u = urllib.parse.urlsplit(url)
        q = dict(urllib.parse.parse_qsl(u.query))
        page, rows = int(q.get("pageNo", 1)), int(q.get("numOfRows", 10))
        if page == self.fail_on_page:
            raise OSError("가짜 네트워크 실패")
        items = self.routes.get(u.path, [])
        chunk = items[(page - 1) * rows: page * rows]
        return {"response": {"header": {"resultCode": self.result_code, "resultMsg": "정상"},
                             "body": {"dataType": "JSON", "items": {"item": chunk}, "numOfRows": rows,
                                      "pageNo": page, "totalCount": len(items)}}}


@pytest.fixture
def portal(monkeypatch):
    """키를 넣고 포털을 픽스처로 바꾼다. 반환된 FakePortal 의 routes 를 테스트가 고칠 수 있다."""
    import data_go_kr

    fake = FakePortal({TRAVEL_PATH: _items("travel"), EMBASSY_PATH: _items("embassy"), SHELTER_PATH: _items("shelter")})
    monkeypatch.setattr(data_go_kr, "_get_json", fake)
    monkeypatch.setenv(KEY_ENV, ENCODED_KEY)
    return fake


@pytest.fixture
def no_key(monkeypatch):
    import data_go_kr

    fake = FakePortal({})
    monkeypatch.setattr(data_go_kr, "_get_json", fake)
    monkeypatch.delenv(KEY_ENV, raising=False)
    return fake


# ---------- 공통: data_go_kr ----------

def test_service_key_is_unquoted_at_call_time(monkeypatch) -> None:
    import data_go_kr

    assert data_go_kr.KEY_ENV == KEY_ENV
    monkeypatch.setenv(KEY_ENV, ENCODED_KEY)
    assert data_go_kr.service_key() == RAW_KEY
    monkeypatch.setenv(KEY_ENV, "")
    assert data_go_kr.service_key() is None
    monkeypatch.delenv(KEY_ENV)
    assert data_go_kr.service_key() is None


def test_fetch_all_encodes_key_once(portal) -> None:
    import data_go_kr

    data_go_kr.fetch_all("https://apis.data.go.kr" + TRAVEL_PATH, 100)
    url = portal.urls[0]
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
    assert q["serviceKey"] == [RAW_KEY], url  # 인코딩 안 하면 + 가 공백으로, 이중 인코딩이면 %2B 로 남음
    assert "%25" not in url, "이중 인코딩"
    assert q["returnType"][0].lower() == "json"


def test_fetch_all_paginates(portal) -> None:
    import data_go_kr

    got = data_go_kr.fetch_all("https://apis.data.go.kr" + TRAVEL_PATH, 2)
    assert got == _items("travel")
    pages = [urllib.parse.parse_qs(urllib.parse.urlsplit(u).query)["pageNo"] for u in portal.urls]
    assert pages == [["1"], ["2"], ["3"]]


def test_fetch_all_single_item_dict(portal, monkeypatch) -> None:
    import data_go_kr

    one = _items("travel")[0]
    monkeypatch.setattr(data_go_kr, "_get_json", lambda url: {"response": {
        "header": {"resultCode": "0"}, "body": {"items": {"item": one}, "totalCount": 1}}})
    assert data_go_kr.fetch_all("https://apis.data.go.kr" + TRAVEL_PATH, 100) == [one]


def test_fetch_all_raises_on_error_code(portal) -> None:
    import data_go_kr

    portal.result_code = "30"  # SERVICE_KEY_IS_NOT_REGISTERED_ERROR
    with pytest.raises(RuntimeError):
        data_go_kr.fetch_all("https://apis.data.go.kr" + TRAVEL_PATH, 100)


def test_fetch_all_without_key_makes_no_call(no_key) -> None:
    import data_go_kr

    with pytest.raises(RuntimeError):
        data_go_kr.fetch_all("https://apis.data.go.kr" + TRAVEL_PATH, 100)
    assert no_key.urls == []


def test_daily_refresh_survives_m4_failures(monkeypatch, caplog) -> None:
    import embassies
    import shelters
    import travel_advisory

    import backend.app.main as main

    called = []

    def boom(name):
        def f(*a, **k):
            called.append(name)
            raise RuntimeError(f"{name} 실패")
        return f
    monkeypatch.setattr(travel_advisory, "update", boom("travel"))
    monkeypatch.setattr(shelters, "update", boom("shelters"))
    monkeypatch.setattr(embassies, "update", boom("embassies"))
    monkeypatch.setattr(main, "_recently_written", lambda *p: True)  # GDELT 갱신 단계는 건너뜀
    with caplog.at_level(logging.ERROR):
        main._daily_refresh()
    assert sorted(called) == ["embassies", "shelters", "travel"]
    assert len([r for r in caplog.records if r.exc_info]) >= 3


# ---------- #10 외교부 여행경보 ----------

US_ROW = {"iso3": "UKR", "source": "us_state", "level": 4, "label": "Do Not Travel", "date": "2026-10-01",
          "summary": "Do not travel.", "url": "https://travel.state.gov/x"}
UK_ROW = {"iso3": "UKR", "source": "uk_fcdo", "level": 2, "label": "일부 지역 모든 여행 자제 권고",
          "date": "2026-10-02", "summary": "", "url": "https://www.gov.uk/foreign-travel-advice/ukraine"}
OLD_MOFA_ROW = {"iso3": "UKR", "source": "kr_mofa", "level": 3, "label": "출국권고", "date": "2025-01-01",
                "summary": "직전 값", "url": "https://www.0404.go.kr/"}


@pytest.fixture
def advisory_file(monkeypatch, tmp_path):
    import travel_advisory

    path = tmp_path / "travel_advisory.csv"
    monkeypatch.setattr(travel_advisory, "ADVISORY_FILE", path)
    monkeypatch.setattr(travel_advisory, "fetch_us", lambda: ([US_ROW], []))
    monkeypatch.setattr(travel_advisory, "fetch_uk", lambda: ([UK_ROW], []))
    pd.DataFrame([OLD_MOFA_ROW], columns=travel_advisory.COLUMNS).to_csv(path, index=False)
    return path


def _saved(path: Path, source: str) -> list[dict]:
    df = pd.read_csv(path, keep_default_na=False, na_values=[""])
    return df[df["source"] == source].to_dict("records")


def test_parse_mofa_maps_fields() -> None:
    import travel_advisory

    rows, failed = travel_advisory.parse_mofa(_items("travel"))
    assert failed == ["가상국"]
    ukr = [r for r in rows if r["iso3"] == "UKR"]
    assert len(ukr) == 1
    assert {k: ukr[0][k] for k in ("source", "level", "label", "date", "summary")} == {
        "source": "kr_mofa", "level": 4, "label": "여행금지", "date": "2026-10-01", "summary": "전 지역"}
    assert ukr[0]["url"].startswith("https://www.0404.go.kr")
    assert set(ukr[0]) == set(travel_advisory.COLUMNS)
    jpn = next(r for r in rows if r["iso3"] == "JPN")
    assert (jpn["level"], jpn["label"]) == (1, "여행유의")


def test_mofa_labels_all_levels() -> None:
    import travel_advisory

    base = _items("travel")[0]
    labels = {lv: travel_advisory.parse_mofa([{**base, "alarm_lvl": str(lv)}])[0][0]["label"] for lv in range(1, 5)}
    assert labels == {1: "여행유의", 2: "여행자제", 3: "출국권고", 4: "여행금지"}


def test_mofa_multiple_regions_keep_highest() -> None:
    import travel_advisory

    rows, _ = travel_advisory.parse_mofa(_items("travel"))
    d = travel_advisory.dedupe(pd.DataFrame(rows, columns=travel_advisory.COLUMNS))
    assert d.loc[d["iso3"] == "THA", "level"].tolist() == [3]


def test_mofa_by_iso3_name() -> None:
    import travel_advisory

    rows, _ = travel_advisory.parse_mofa(_items("travel"))
    a = travel_advisory.by_iso3(pd.DataFrame(rows, columns=travel_advisory.COLUMNS))["UKR"][0]
    assert (a["source"], a["name"], a["max_level"]) == ("kr_mofa", "외교부", 4)


def test_update_with_key_adds_mofa(portal, advisory_file) -> None:
    import travel_advisory

    assert travel_advisory.update(force=True) is True
    mofa = {r["iso3"]: r for r in _saved(advisory_file, "kr_mofa")}
    assert set(mofa) == {"UKR", "JPN", "THA"}
    assert (mofa["UKR"]["level"], mofa["UKR"]["date"]) == (4, "2026-10-01")
    assert len(_saved(advisory_file, "us_state")) == 1 and len(_saved(advisory_file, "uk_fcdo")) == 1


def test_update_without_key_drops_mofa_keeps_us_uk(no_key, advisory_file) -> None:
    import travel_advisory

    assert travel_advisory.update(force=True) is True
    assert _saved(advisory_file, "kr_mofa") == []
    assert _saved(advisory_file, "us_state")[0]["label"] == US_ROW["label"]
    assert _saved(advisory_file, "uk_fcdo")[0]["date"] == UK_ROW["date"]
    assert no_key.urls == []


def test_update_mofa_failure_keeps_previous_and_refreshes_us_uk(portal, advisory_file) -> None:
    import travel_advisory

    portal.result_code = "30"  # 잘못된 키 재현
    assert travel_advisory.update(force=True) is True
    assert [r["summary"] for r in _saved(advisory_file, "kr_mofa")] == ["직전 값"]
    assert _saved(advisory_file, "us_state")[0]["date"] == US_ROW["date"]
    assert _saved(advisory_file, "uk_fcdo")[0]["date"] == UK_ROW["date"]


def test_api_hides_mofa_without_key(client, monkeypatch, tmp_path) -> None:
    import travel_advisory

    path = tmp_path / "advisory_api.csv"
    pd.DataFrame([US_ROW, UK_ROW, {**OLD_MOFA_ROW, "summary": "API 표본"}],
                 columns=travel_advisory.COLUMNS).to_csv(path, index=False)
    monkeypatch.setattr(travel_advisory, "ADVISORY_FILE", path)

    def ukr_advisory() -> list[dict]:
        res = client.get("/api/countries")
        assert res.status_code == 200
        return next(c for c in res.json() if c["code"] == "UKR")["advisory"]
    monkeypatch.setenv(KEY_ENV, ENCODED_KEY)
    with_key = ukr_advisory()
    monkeypatch.delenv(KEY_ENV)
    without_key = ukr_advisory()
    assert [a["source"] for a in with_key if a["source"] == "kr_mofa"] == ["kr_mofa"]
    assert [a for a in without_key if a["source"] == "kr_mofa"] == []
    assert [a for a in with_key if a["source"] != "kr_mofa"] == without_key


def test_travel_advisory_self_check() -> None:
    import travel_advisory

    travel_advisory.self_check()


def test_mofa_exclusion_sentences_removed() -> None:
    assert "제외했다" not in (ROOT / "travel_advisory.py").read_text(encoding="utf-8")
    formula = (ROOT / "FORMULA_v1.md").read_text(encoding="utf-8")
    assert "외교부 여행경보는 공공데이터포털 serviceKey가 필요해 아직 넣지 않았다" not in formula
    llms = (ROOT / "frontend" / "public" / "llms.txt").read_text(encoding="utf-8")
    assert re.search(r"여행경보:.*외교부", llms)


# ---------- #11 민방위 대피시설 ----------

def _near_items(n: int, base: dict, address: str) -> list[dict]:
    """시청 부근 400m 안에 n 곳."""
    return [{**base, "FCLT_NM": f"근처{i:02d}", "MNG_NO": f"G-{i:03d}", "LAT_EPSG4326": f"{37.5665 + i * 0.00005:.6f}",
             "ROAD_NM_WHOL_ADDR": f"{address} {i}"} for i in range(n)]


@pytest.fixture
def shelter_file(monkeypatch, tmp_path):
    import shelters

    path = tmp_path / "shelters.csv"
    monkeypatch.setattr(shelters, "SHELTER_FILE", path)
    return path


@pytest.fixture
def shelter_data(portal, shelter_file):
    import shelters

    assert shelters.update(force=True) is True
    return shelter_file


def test_haversine_known_distances() -> None:
    import shelters

    shelters.self_check()
    # 서울시청 ↔ 부산시청 약 325km (독립 계산: 구면 코사인 법칙)
    import math
    a, b = (37.5666, 126.9784), (35.1798, 129.0750)
    r = 6371008.8
    p1, p2, dl = math.radians(a[0]), math.radians(b[0]), math.radians(b[1] - a[1])
    expected = r * math.acos(math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dl))
    assert abs(shelters.haversine_m(*a, *b) - expected) / expected < 0.01
    assert shelters.haversine_m(37.57, 126.98, 37.57, 126.98) == pytest.approx(0, abs=1e-6)


def test_update_paginates_and_filters(portal, shelter_file, monkeypatch) -> None:
    import shelters

    assert shelters.PAGE_SIZE <= 100
    monkeypatch.setattr(shelters, "PAGE_SIZE", 3)
    assert shelters.update(force=True) is True
    assert len([u for u in portal.urls if SHELTER_PATH in u]) == 4  # 10건 / 3
    assert len(pd.read_csv(shelter_file)) == 7  # 철거·사용중지·좌표 없음 3건 제외
    text = shelter_file.read_text(encoding="utf-8")
    assert RAW_KEY not in text and ENCODED_KEY not in text


def test_update_without_key(no_key, shelter_file) -> None:
    import shelters

    assert shelters.update(force=True) is False
    assert not shelter_file.exists()
    assert no_key.urls == []


def test_update_failure_keeps_old_file(portal, shelter_data, monkeypatch) -> None:
    import shelters

    before = shelter_data.read_bytes()
    monkeypatch.setattr(shelters, "PAGE_SIZE", 3)
    portal.fail_on_page = 2
    with pytest.raises(Exception):
        shelters.update(force=True)
    assert shelter_data.read_bytes() == before


def test_nearby_seoul(client, shelter_data) -> None:
    res = client.get("/api/shelters", params=SEOUL)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["available"] is True
    assert body["as_of"] == "2026-10-14"
    items = body["items"]
    assert [s["name"] for s in items] == ["시청 지하", "광화문 지하", "서울역 지하"]  # 잠실(약 11km)·제외 대상 빠짐
    assert all(set(s) >= SHELTER_FIELDS for s in items)
    dist = [s["distance_m"] for s in items]
    assert dist == sorted(dist) and all(0 <= d <= RADIUS_M for d in dist)
    by_name = {s["name"]: s for s in items}
    assert by_name["시청 지하"]["capacity"] == 1200 and by_name["광화문 지하"]["capacity"] is None
    assert by_name["시청 지하"]["kind"] == "공공용시설"
    assert by_name["서울역 지하"]["address"] == "서울특별시 용산구 동자동 43-205"  # 도로명 없으면 지번
    assert by_name["시청 지하"]["lat"] == pytest.approx(37.5663)


def test_nearby_limit(client, portal, shelter_file) -> None:
    import shelters

    portal.routes[SHELTER_PATH] = _near_items(15, _items("shelter")[0], "서울특별시 중구 세종대로")
    shelters.update(force=True)
    items = client.get("/api/shelters", params=SEOUL).json()["items"]
    assert len(items) == NEARBY_LIMIT


@pytest.mark.parametrize("params", [{"lat": "37.5665", "lon": "126.98"}, {"lat": "37.57", "lon": "126.978"}])
def test_more_than_two_decimals_is_422(client, shelter_data, params) -> None:
    assert client.get("/api/shelters", params=params).status_code == 422


@pytest.mark.parametrize("params", [{"lat": "37.5", "lon": "127"}, {"lat": "37", "lon": "126.98"}])
def test_up_to_two_decimals_ok(client, shelter_data, params) -> None:
    assert client.get("/api/shelters", params=params).status_code == 200


def test_missing_params_is_422(client, shelter_data) -> None:
    assert client.get("/api/shelters").status_code == 422


def test_outside_korea_is_empty(client, shelter_data) -> None:
    body = client.get("/api/shelters", params={"lat": "35.68", "lon": "139.69"}).json()
    assert body["available"] is True and body["items"] == []


def test_no_file_is_unavailable(client, portal, shelter_file) -> None:
    res = client.get("/api/shelters", params=SEOUL)
    assert res.status_code == 200
    assert res.json()["available"] is False and res.json()["items"] == []
    regions = client.get("/api/shelters/regions").json()
    assert regions["available"] is False and regions["regions"] == []


def test_no_key_is_unavailable(client, shelter_data, monkeypatch) -> None:
    monkeypatch.delenv(KEY_ENV)
    body = client.get("/api/shelters", params=SEOUL).json()
    assert body["available"] is False and body["items"] == []


def test_regions(client, shelter_data) -> None:
    body = client.get("/api/shelters/regions").json()
    assert body["available"] is True
    regions = {r["sido"]: r["sigungu"] for r in body["regions"]}
    assert set(regions) <= SIDO_ALLOWED
    assert set(regions) == {"서울특별시", "강원특별자치도", "세종특별자치시"}  # 강원도 → 강원특별자치도
    assert sorted(regions["서울특별시"]) == ["송파구", "용산구", "종로구", "중구"]  # 철거·중지 시설만 있는 구 없음
    assert sorted(regions["강원특별자치도"]) == ["원주시", "춘천시"]
    assert regions["세종특별자치시"] == []


@pytest.mark.parametrize(("region", "names"), [
    ("서울특별시 중구", ["시청 지하"]),
    ("강원특별자치도 춘천시", ["춘천 지하(옛 시·도명)"]),
    ("세종특별자치시", ["세종 지하"]),
    ("서울특별시 없는구", []),
])
def test_region_query(client, shelter_data, region, names) -> None:
    body = client.get("/api/shelters", params={"region": region}).json()
    assert body["available"] is True
    assert sorted(s["name"] for s in body["items"]) == names
    assert all(set(s) >= SHELTER_FIELDS and s["distance_m"] is None for s in body["items"])


def test_region_limit(client, portal, shelter_file) -> None:
    import shelters

    portal.routes[SHELTER_PATH] = _near_items(55, _items("shelter")[0], "서울특별시 중구 세종대로")
    shelters.update(force=True)
    assert len(client.get("/api/shelters", params={"region": "서울특별시 중구"}).json()["items"]) == REGION_LIMIT


def test_request_coords_not_logged(client, shelter_data, caplog) -> None:
    with caplog.at_level(logging.DEBUG):
        client.get("/api/shelters", params={"lat": "37.57", "lon": "126.98"})
        client.get("/api/shelters", params={"lat": "37.5665", "lon": "126.98"})  # 422 경로도
    # TestClient 쪽 httpx·httpcore 로그(HTTP Request: GET ...?lat=)는 클라이언트 기록이라 제외, 서버·앱(uvicorn.access 포함)만 판정
    server = [r for r in caplog.records if not r.name.startswith(("httpx", "httpcore"))]
    leaked = [r.getMessage() for r in server if "37.57" in r.getMessage() or "126.98" in r.getMessage()]
    assert leaked == []
    for f in (ROOT / "shelters.py", ROOT / "backend" / "app" / "main.py"):
        calls = re.findall(r"log\.\w+\([^\n]*", f.read_text(encoding="utf-8"))
        assert not [c for c in calls if re.search(r"\b(lat|lon)\b", c)], f


# ---------- #13 재외공관·영사콜센터 ----------

@pytest.fixture
def embassy_file(monkeypatch, tmp_path):
    import embassies

    path = tmp_path / "embassies.csv"
    monkeypatch.setattr(embassies, "EMBASSY_FILE", path)
    return path


@pytest.fixture
def embassy_data(portal, embassy_file):
    import embassies

    assert embassies.update(force=True) is True
    return embassy_file


def _embassies(client, code: str) -> dict:
    res = client.get(f"/api/countries/{code}/embassies")
    assert res.status_code == 200, res.text
    body = res.json()
    cc = body["call_center"]
    assert (cc["tel"], cc["tel_overseas"]) == (CALL_CENTER_TEL, CALL_CENTER_TEL_OVERSEAS)
    assert cc["source"].startswith("https://www.0404.go.kr")
    return body


def test_embassies_japan(client, embassy_data) -> None:
    body = _embassies(client, "JPN")
    assert body["available"] is True
    assert date.fromisoformat(body["as_of"])
    raw = {x["embassy_kor_nm"]: x for x in _items("embassy")}
    got = body["embassies"]
    assert [e["name"] for e in got] == ["주 일본 대한민국 대사관", "주 후쿠오카 대한민국 총영사관"]  # 대사관 먼저
    for e in got:
        assert set(e) >= EMBASSY_FIELDS
        r = raw[e["name"]]
        assert (e["kind"], e["address"], e["tel"], e["emergency_tel"]) == (
            r["embassy_ty_cd_nm"], r["emblgbd_addr"], r["tel_no"], r["urgency_tel_no"])


def test_embassies_ukraine(client, embassy_data) -> None:
    assert [e["name"] for e in _embassies(client, "UKR")["embassies"]] == ["주 우크라이나 대한민국 대사관"]


def test_embassies_country_without_data(client, embassy_data) -> None:
    assert _embassies(client, "USA")["embassies"] == []  # 픽스처에 미국 공관 없음


def test_embassies_korea_empty(client, embassy_data) -> None:
    assert _embassies(client, "KOR")["embassies"] == []


def test_embassies_unknown_code_404(client, embassy_data) -> None:
    assert client.get("/api/countries/ZZZ/embassies").status_code == 404


def test_embassies_without_key(client, embassy_data, monkeypatch) -> None:
    monkeypatch.delenv(KEY_ENV)
    body = _embassies(client, "JPN")
    assert body["available"] is False and body["embassies"] == []


def test_embassies_no_file(client, portal, embassy_file) -> None:
    body = _embassies(client, "JPN")
    assert body["available"] is False and body["embassies"] == []


def test_embassy_update_without_key(no_key, embassy_file) -> None:
    import embassies

    assert embassies.update(force=True) is False
    assert not embassy_file.exists() and no_key.urls == []


def test_embassy_update_failure_keeps_old_file(portal, embassy_data) -> None:
    import embassies

    before = embassy_data.read_bytes()
    portal.result_code = "30"
    with pytest.raises(Exception):
        embassies.update(force=True)
    assert embassy_data.read_bytes() == before
