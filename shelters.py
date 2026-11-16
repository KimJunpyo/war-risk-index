"""행정안전부 민방위 대피시설 → data/shelters.csv (국내 전용, WGS84 위경도).

공공데이터포털 civil_defense_shelter_info. serviceKey 가 없으면 받지 않는다.
저장 대상은 철거되지 않고(RMV_YMD 없음) 운영 상태가 "사용중"이며 좌표가 있는 시설뿐이다.
"""

import json
import math
import time
from pathlib import Path

import pandas as pd

import atomic_write
import data_go_kr

SHELTER_URL = "https://apis.data.go.kr/1741000/civil_defense_shelter_info/info"
SHELTER_FILE = Path("data/shelters.csv")
PAGE_SIZE = 100  # 포털 numOfRows 최대
MAX_PAGES = 400  # 약 1.9만 건 / 100. data_go_kr 기본 상한(50쪽)으로는 모자람
REFRESH_SECONDS = 20 * 3600  # 파일이 이보다 새로우면 다시 받지 않음(하루 1회)
# 실패 뒤 이 시간 동안은 다시 받지 않음(15분 주기 갱신 대비). 실패 시각은 data_go_kr.mark_failed 가 파일에 남긴다.
# 이어 받기라 한 번 시도가 FETCH_BUDGET_SECONDS 안에 끝나고 받은 쪽도 남으므로 길게 쉬지 않는다(#52)
RETRY_SECONDS = 3600
# 한 번 호출(배치 한 실행)에 받는 시간. 못 받은 쪽은 다음 호출이 이어 받는다(#52).
# 러너는 쪽당 약 6초(2026-11-16 실측: 5분에 50쪽)라 전량 약 190쪽은 4번쯤 걸린다. 로컬은 쪽당 0.3~0.5초라 한 번에 끝난다.
# 15분 배치의 워크플로 제한(refresh.yml timeout-minutes)은 이 값을 넣어 잡았다
FETCH_BUDGET_SECONDS = 5 * 60
# 이어 받는 중인 원문 쪽(data/shelters.partial.json). R2 state 로 다음 실행에 넘어간다. 원문 그대로라 전량이면 약 16MB
# (2026-11-16 실측: 14,100건에 12.3MB). 이어 받는 동안만 실행마다 올리고, 다 받으면 {} 로 비운다
PARTIAL_SUFFIX = ".partial.json"
PARTIAL_MAX_SECONDS = 24 * 3600  # 이보다 오래된 이어 받기는 버리고 처음부터(그 사이 원천이 바뀌었을 수 있음)
EARTH_RADIUS_M = 6371008.8  # 평균 지구 반지름
IN_USE = "사용중"
COLUMNS = ["mng_no", "name", "address", "sido", "sigungu", "lat", "lon", "capacity", "kind", "updated"]
# 허용 시·도: 현행 17개 + 원천 통합 표기 (화면 목록 순서)
SIDO = ("서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
        "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도",
        "전남광주통합특별시")  # 원천이 광주·전남 대부분을 이 이름으로 표기(2026-07~). 원천 표기를 그대로 따름
# 옛 이름 → 현행 이름
SIDO_ALIASES = {"강원도": "강원특별자치도", "전라북도": "전북특별자치도", "제주도": "제주특별자치도"}
SIGUNGU_SUFFIXES = ("시", "군", "구")


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """두 위경도 사이 대원 거리(m)."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def _region(address: str) -> tuple[str | None, str]:
    """주소 → (현행 시·도 또는 None, 시·군·구 또는 ""). 시·군·구는 두 번째 낱말이 시·군·구로 끝날 때만."""
    words = address.split()
    sido = SIDO_ALIASES.get(words[0], words[0]) if words else None
    sigungu = words[1] if len(words) > 1 and words[1].endswith(SIGUNGU_SUFFIXES) else ""
    return (sido if sido in SIDO else None), sigungu


def parse(items: list[dict]) -> pd.DataFrame:
    """응답 item → 저장 표. 철거·운영 중지·좌표 없음 제외, 관리번호 기준 1행 1시설."""
    rows = []
    for x in items:
        lat, lon = (x.get("LAT_EPSG4326") or "").strip(), (x.get("LOT_EPST4326") or "").strip()  # LOT_EPST: 원문 오타
        if (x.get("RMV_YMD") or "").strip() or (x.get("OPER_STTS") or "").strip() != IN_USE or not (lat and lon):
            continue
        address = (x.get("ROAD_NM_WHOL_ADDR") or "").strip() or (x.get("LCTN_WHOL_ADDR") or "").strip()
        sido, sigungu = _region(address)
        rows.append({"mng_no": x.get("MNG_NO"), "name": (x.get("FCLT_NM") or "").strip(), "address": address,
                     "sido": sido, "sigungu": sigungu, "lat": float(lat), "lon": float(lon),
                     "capacity": x.get("MAX_ACTC_PERNE"), "kind": (x.get("FCLT_SE") or "").strip(),
                     "updated": (x.get("DAT_UPDT_PNT") or "")[:10] or None})
    df = pd.DataFrame(rows, columns=COLUMNS)
    df["capacity"] = pd.to_numeric(df["capacity"], errors="coerce").astype("Int64")  # 빈 값·숫자 아님 → 없음
    return df.drop_duplicates("mng_no").reset_index(drop=True)


def _partial_file() -> Path:
    return SHELTER_FILE.with_suffix(PARTIAL_SUFFIX)


def _load_partial() -> dict:
    """이어 받을 상태 {started(epoch 초), total, next_page, items(원문)}. 없거나 깨졌거나 비었거나 오래됐으면 새 상태."""
    try:
        partial = json.loads(_partial_file().read_text(encoding="utf-8"))
        if (time.time() - partial["started"] < PARTIAL_MAX_SECONDS and partial["next_page"] > 1
                and isinstance(partial["items"], list)):
            return partial
    except (OSError, ValueError, KeyError, TypeError):  # 없음·깨짐·{}(다 받아 비운 파일)
        pass
    return {"started": time.time(), "total": None, "next_page": 1, "items": []}


def _save_partial(partial: dict) -> None:
    _partial_file().parent.mkdir(parents=True, exist_ok=True)
    atomic_write.write_text(_partial_file(), json.dumps(partial, ensure_ascii=False))


def _complete(partial: dict) -> bool:
    return partial["total"] is not None and len(partial["items"]) >= partial["total"]


def update(force: bool = False) -> bool:
    """하루 1회 받아 저장. 키 없으면 False(호출·쓰기 없음). 실패는 예외로 올리고 기존 파일은 그대로.

    한 번에 FETCH_BUDGET_SECONDS 까지만 받고(force 는 끝까지), 받은 원문 쪽은 이어 받기 파일에 남겨 다음 호출이 잇는다.
    이어 받는 중이면 False. 실패해도 받은 쪽은 남긴다(#52: 러너에서는 전량을 15분 배치 한 번에 못 받는다).
    """
    if not data_go_kr.service_key():
        print(f"대피시설: {data_go_kr.KEY_ENV} 없음, 건너뜀")
        return False
    if not force and SHELTER_FILE.exists() and time.time() - SHELTER_FILE.stat().st_mtime < REFRESH_SECONDS:
        return False
    if not force and data_go_kr.failed_recently(SHELTER_FILE, RETRY_SECONDS):
        return False
    partial = _load_partial()
    started = time.monotonic()
    if not _complete(partial):  # 지난번에 다 받고 만들기만 실패했으면 다시 받지 않는다
        try:
            for page, items, total in data_go_kr.fetch_pages(
                    SHELTER_URL, PAGE_SIZE, first_page=partial["next_page"], received=len(partial["items"]),
                    max_pages=MAX_PAGES, budget_seconds=None if force else FETCH_BUDGET_SECONDS):
                # shortcut: 건수가 같고 쪽 경계만 밀린 변경(한 건 추가·한 건 삭제)은 못 알아챈다. 중복은 parse 가 거르고
                #   빠진 시설은 다음 갱신(하루 뒤)에 채워진다. 빠짐이 보이면 이어 받기 시간(PARTIAL_MAX_SECONDS)을 줄일 것
                if partial["total"] not in (None, total):  # 이어 받는 사이 원천이 바뀜: 쪽 경계가 밀렸을 수 있어 처음부터
                    print(f"대피시설: 원천 건수가 바뀜({partial['total']} → {total}), 다음에 처음부터 다시 받음")
                    _save_partial({})
                    return False
                partial["items"] += items
                partial.update(total=total, next_page=page + 1)
        except Exception:
            _save_partial(partial)  # 받은 쪽은 남겨 다음 시도가 그 쪽부터 잇는다
            data_go_kr.mark_failed(SHELTER_FILE)
            raise
        if not _complete(partial):
            _save_partial(partial)
            print(f"대피시설: {len(partial['items'])}/{partial['total']}건 받음, 다음에 {partial['next_page']}쪽부터"
                  f" 이어 받음({time.monotonic() - started:.0f}초)")
            return False
    items = partial["items"]
    try:
        df = parse(items)
        if df.empty:  # 정상 응답 0건도 실패로 보고 직전 파일 유지
            raise RuntimeError("대피시설 0건")
    except Exception:
        _save_partial(partial if items else {})  # 받은 원문은 남긴다(고친 뒤 다시 받지 않고 바로 만든다). 0건은 다시 받는다
        data_go_kr.mark_failed(SHELTER_FILE)
        raise
    SHELTER_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = SHELTER_FILE.with_suffix(".csv.part")
    df.to_csv(tmp, index=False, encoding="utf-8")
    tmp.replace(SHELTER_FILE)
    _save_partial({})  # 다 씀: 지우지 않고 비운다(배치는 R2 state/ 키를 지우지 않아 지운 파일의 지난 내용이 다시 내려온다)
    # 걸린 시간은 FETCH_BUDGET_SECONDS 를 실제 값으로 맞추는 근거다(배치 로그)
    print(f"대피시설: 원문 {len(items)}건 → 저장 {len(df)}건, 이번 {time.monotonic() - started:.0f}초,"
          f" 받기 시작 뒤 {(time.time() - partial['started']) / 60:.0f}분")
    return True


def self_check() -> None:
    # 서울시청 ↔ 광화문 약 1.0km, 서울시청 ↔ 부산시청 약 325km (구면 코사인 법칙으로 따로 계산한 값과 1% 이내)
    for a, b, expected in (((37.5663, 126.9779), (37.5759, 126.9769), 1071.0),
                           ((37.5666, 126.9784), (35.1798, 129.0750), 325_000.0)):
        d = haversine_m(*a, *b)
        assert abs(d - expected) / expected < 0.01, (a, b, d)
    assert _region("강원도 춘천시 중앙로 1") == ("강원특별자치도", "춘천시")
    assert _region("세종특별자치시 한누리대로 2130") == ("세종특별자치시", "")
    df = parse([{"MNG_NO": "1", "FCLT_NM": "a", "OPER_STTS": IN_USE, "LAT_EPSG4326": "37.5", "LOT_EPST4326": "127",
                 "LCTN_WHOL_ADDR": "서울특별시 중구 x", "MAX_ACTC_PERNE": ""},
                {"MNG_NO": "2", "OPER_STTS": "사용중지", "LAT_EPSG4326": "37.5", "LOT_EPST4326": "127"}])
    assert len(df) == 1 and df["address"][0] == "서울특별시 중구 x" and pd.isna(df["capacity"][0])
    print("shelters self_check OK")


if __name__ == "__main__":
    self_check()
    update(force=True)
