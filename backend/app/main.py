"""전쟁 가능성 지수 API. 프로젝트 루트에서 실행: uvicorn backend.app.main:app
Windows에서는 --loop asyncio:SelectorEventLoop 를 붙인다(기본 Proactor 루프는 연결 수락 오류 시 서버 소켓을 닫아 이후 연결을 모두 거부).
루트 .env 가 있으면 시작 시 읽는다(.env.example 참고, 이미 설정된 환경변수가 우선).

시작하면 백그라운드 스레드가 15분마다 GDELT 2.0 실시간 슬롯을 갱신하고,
새 GDELT 1.0 일별 파일이 나오면 수집·지수 계산을 다시 돌린다.
"""

import logging
import math
import os
import threading
import time
import urllib.parse
import urllib.request
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import dotenv
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

import blend
import build_country_index
import build_index
import case_backtest  # CASES 만 사용. main() 은 __main__ 가드 안이라 import 부작용 없음
import country_collect
import data_go_kr
import embassies
import gdelt_collect
import index_v1
import live
import shelters
import travel_advisory
import ucdp
from backend.app.news import RANGES, fetch_news
from backend.app.pairs import ACTOR_NAMES, PAIRS

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / ".env"
if ENV_FILE.is_file():  # 아래 os.getenv 들보다 먼저 읽어야 .env 값이 반영됨
    dotenv.load_dotenv(ENV_FILE, override=False)
# 공공데이터포털(data.go.kr) 일반 인증키 환경변수 이름
DATA_GO_KR_SERVICE_KEY = "DATA_GO_KR_SERVICE_KEY"
INDEX_FILE = ROOT / "out" / "index_v1.csv"
CATALYST_FILE = ROOT / "data" / "gdelt_catalyst.csv"
COUNTRY_INDEX_FILE = ROOT / build_country_index.COUNTRY_INDEX_FILE
COUNTRY_META_FILE = ROOT / build_country_index.COUNTRY_META_FILE
CATALYST_ALL_FILE = ROOT / country_collect.CATALYST_ALL_FILE
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
GZIP_MINIMUM_SIZE = 1000  # 이 바이트보다 작은 응답은 압축하지 않음
LIVE_UPDATES = os.getenv("LIVE_UPDATES", "1") == "1"
LIVE_INTERVAL_SECONDS = live.SLOT_MINUTES * 60
COLLECTOR_IDLE_SECONDS = 600  # 이 시간 안에 수집 파일이 바뀌었으면 수동 수집 중으로 보고 일별 갱신을 미룸
LIVE_STALE_MINUTES = 60  # /api/health: 최신 실시간 슬롯이 이 분을 넘게 지났으면 503
INDEX_STALE_DAYS = 3  # /api/health: 일별 지수 최신 날짜가 이 일수를 넘게 지났으면 503
COUNTRY_NEWS_QUERY = "{name} (군사 OR 국방 OR 분쟁 OR 공격 OR 미사일)"
# 대피소 조회: 좌표는 소수점 2자리(약 1km)까지만 받음(정밀 위치를 받지 않도록)
COORD_PATTERN = r"^-?\d{1,3}(\.\d{1,2})?$"
KOREA_LAT, KOREA_LON = (33.0, 39.0), (124.0, 132.0)
SHELTER_RADIUS_M = 5000
SHELTER_NEARBY_LIMIT = 1000  # 위치 조회 안전 상한(실데이터 5km 안 최대 약 600곳)
SHELTER_REGION_LIMIT = 1000  # 지역 조회 안전 상한(시·군·구 최대 527곳. 시·도만 주면 상한에 걸릴 수 있음)
METERS_PER_DEG_LAT = 111_000  # 반경 사전 필터용 근사
SHELTER_FIELDS = ["name", "address", "lat", "lon", "distance_m", "capacity", "kind"]
# 지수 표의 공통 열 (v1 7일, v2 7일, 종합, 24시간, 등급)
INDEX_COLUMNS = ["date", "daily", "weekly", "v2_weekly", "blended", "grade"]

# 과거 위기 사례 일반인용 이름 (FORMULA_v1.md 검증 표 표기, case_backtest.CASES 이름 기준)
CASE_LABELS = {
    "러우 2022": "러시아–우크라이나 개전",
    "이란 2025": "이스라엘–이란 개전",
    "아르-아제 2020": "아르메니아–아제르바이잔 개전",
    "인도-파키 2025": "인도–파키스탄 개전",
    "하마스 2023": "하마스 기습",
    "남북 2017": "남북 화염과 분노",
    "남북 2015": "남북 서부전선 포격",
    "미-이란 2020": "미국–이란 솔레이마니",
    "중-대만 2022": "중국–대만 펠로시 방문 후 훈련",
    "인도-파키 2019": "인도–파키스탄 발라코트",
    "러우 2021 집결": "러시아–우크라이나 병력 집결",
}

log = logging.getLogger("war-risk")
if not os.getenv(DATA_GO_KR_SERVICE_KEY):
    log.warning("%s 가 없어 공공데이터 API 기능은 꺼진 상태로 기동함", DATA_GO_KR_SERVICE_KEY)


class _NoShelterQueryLog(logging.Filter):
    """uvicorn 접근 로그에 대피소 조회 요청(좌표 쿼리)을 남기지 않는다."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args if isinstance(record.args, tuple) else ()
        if len(args) <= 2:
            return True
        path = urllib.parse.unquote(str(args[2]))  # args[2] = 경로+쿼리. 퍼센트 인코딩·끝 슬래시(307) 우회 방지
        return not ("/api/shelters" in path and "?" in path)


logging.getLogger("uvicorn.access").addFilter(_NoShelterQueryLog())
_cache: dict[tuple[Path, str], tuple[float, pd.DataFrame]] = {}
_live_cache: dict[tuple, pd.DataFrame] = {}


def _mtime(path: Path) -> float:
    return path.stat().st_mtime if path.exists() else 0.0


def _csv(path: Path, **kwargs) -> pd.DataFrame:
    """파일이 바뀌었을 때만 다시 읽는 CSV 캐시. 읽기 옵션이 다르면 따로 캐시(dtype 섞임 방지)."""
    m = _mtime(path)
    key = (path, repr(sorted(kwargs.items())))
    hit = _cache.get(key)
    if hit and hit[0] == m:
        return hit[1]
    df = pd.read_csv(path, **kwargs) if m else pd.DataFrame()
    _cache[key] = (m, df)
    return df


def _live(entity: str) -> pd.DataFrame:
    slots_path, daily_path = ((ROOT / live.COUNTRY_LIVE, ROOT / live.V2_DAILY_COUNTRY) if entity == "country"
                              else (ROOT / live.DYAD_LIVE, ROOT / live.V2_DAILY_DYAD))
    key = (entity, _mtime(slots_path), _mtime(daily_path))
    if key not in _live_cache:
        _live_cache.clear()
        _live_cache[key] = live.live_scores(_csv(slots_path, dtype={"key": str}),
                                            _csv(daily_path, dtype={"key": str}), entity)
    return _live_cache[key]


def _live_value(scores: pd.DataFrame, ids: list[str]) -> dict | None:
    s = scores.reindex(ids)["score"].dropna() if len(scores) else pd.Series(dtype=float)
    if s.empty:
        return None
    return {"score": round(float(s.max()), 1), "as_of": str(scores["as_of"].iloc[0])}


def _records(df: pd.DataFrame) -> list[dict]:
    return df.astype(object).where(df.notna(), None).to_dict("records")


# ---------- 백그라운드 갱신 ----------

def _recently_written(*paths: Path) -> bool:
    return any(time.time() - _mtime(p) < COLLECTOR_IDLE_SECONDS for p in paths)


def _url_exists(url: str) -> bool:
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=30):
            return True
    except Exception:
        return False


def _daily_refresh() -> None:
    try:
        travel_advisory.update()  # 파일 mtime 으로 하루 1회만 실제 수신
    except Exception:  # 여행경보 실패가 지수 갱신을 막지 않도록
        log.exception("여행경보 갱신 실패")
    try:
        shelters.update()  # 파일 mtime 으로 하루 1회만 실제 수신
    except Exception:
        log.exception("대피시설 갱신 실패")
    try:
        embassies.update()  # 파일 mtime 으로 하루 1회만 실제 수신
    except Exception:
        log.exception("재외공관 갱신 실패")
    yesterday = pd.Timestamp.utcnow().tz_localize(None).normalize() - pd.Timedelta(days=1)
    if _recently_written(ROOT / country_collect.COUNTRY_FILE, ROOT / live.V2_DAILY_COUNTRY):
        return
    daily_v2 = _csv(ROOT / live.V2_DAILY_COUNTRY, dtype={"key": str})
    if daily_v2.empty or yesterday.strftime("%Y%m%d") not in set(daily_v2["key"]):
        live.backfill()
    meta = _csv(COUNTRY_META_FILE)
    key = yesterday.strftime("%Y%m%d")
    if (meta.empty or meta["date"].max() < yesterday.strftime("%Y-%m-%d")) and \
            _url_exists(gdelt_collect.url_for(key)):
        log.info("새 일별 파일 %s: 수집·지수 재계산", key)
        ucdp.update()
        gdelt_collect.main()
        country_collect.main()
        build_index.main()
        build_country_index.main()


def _updater() -> None:
    while True:
        for job in (live.update, _daily_refresh):
            try:
                job()
            except Exception:  # 한 주기 실패가 스레드를 죽이지 않도록
                log.exception("갱신 실패: %s", job.__name__)
        # shortcut: 시작 시각 기준 15분 간격. GDELT 발행 시각에 맞추려면 lastupdate 폴링 주기를 줄일 것
        time.sleep(LIVE_INTERVAL_SECONDS)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if LIVE_UPDATES:
        threading.Thread(target=_updater, daemon=True, name="live-updater").start()
    yield


app = FastAPI(title="War Risk Index API", version="1.1", lifespan=lifespan)
# 나중에 추가한 미들웨어가 바깥(CORS 가 GZip 을 감쌈). 어느 순서든 응답 헤더는 같고, CORS 가 바깥이면 preflight 에 압축 단계 없이 바로 답함
app.add_middleware(GZipMiddleware, minimum_size=GZIP_MINIMUM_SIZE)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET"])


# ---------- 국가 쌍 ----------

def _index() -> pd.DataFrame:
    return _csv(INDEX_FILE)


def _pair_or_404(pair_id: str) -> dict:
    if pair_id not in PAIRS:
        raise HTTPException(404, f"알 수 없는 국가 쌍: {pair_id}")
    return PAIRS[pair_id]


@app.get("/api/pairs")
def list_pairs() -> list[dict]:
    idx = _index()
    dyad_live = _live("dyad")
    out = []
    for pid, meta in PAIRS.items():
        rows = idx[idx["pair"] == pid]
        latest = _records(rows.tail(1)[INDEX_COLUMNS])
        out.append({
            "id": pid, "name": meta["name"], "countries": meta["countries"],
            "latest": latest[0] if latest else None,
            "live": _live_value(dyad_live, index_v1.PAIR_DYADS[pid]),
            "wars": [{"start": s, "end": e} for s, e in index_v1.WAR_PERIODS.get(pid, [])],
        })
    return out


@app.get("/api/pairs/{pair_id}/index")
def pair_index(pair_id: str) -> list[dict]:
    _pair_or_404(pair_id)
    idx = _index()
    return _records(idx[idx["pair"] == pair_id][INDEX_COLUMNS])


@app.get("/api/cases")
def list_cases() -> list[dict]:
    """과거 위기 사례별 T-0 전날 7일 점수(weekly). 여러 쌍이면 최댓값, index_v1.csv 에 없는 쌍(USA-IRN 등)은 빠짐."""
    idx = _index()
    out = []
    for name, is_war, t0, pairs in case_backtest.CASES:
        t1 = (pd.Timestamp(t0) - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
        score = idx[(idx["date"] == t1) & idx["pair"].isin(pairs)]["weekly"].max() if len(idx) else None
        out.append({"name": name, "label": f"{CASE_LABELS.get(name, name)} ({t0})", "is_war": is_war, "t0": t0,
                    "pairs": pairs, "score": None if pd.isna(score) else float(score)})
    return out


def _iso2(code: str) -> str | None:
    info = build_country_index.iso_info(code) if code else None
    return info["iso2"] if info else None


def _catalyst_response(cat: pd.DataFrame, days: int) -> dict:
    """촉매 행(key=YYYYMMDD, src, dst, type, mentions, events) → 최근 days 일 사건 목록 + 일별 합계."""
    cat = cat.copy()
    cat["date"] = pd.to_datetime(cat["key"].str[:8], format="%Y%m%d")
    since = cat["date"].max() - pd.Timedelta(days=days - 1) if len(cat) else None
    cat = cat[cat["date"] >= since] if since is not None else cat
    cat = cat.groupby(["date", "src", "dst", "type"], as_index=False)[["mentions", "events"]].sum()
    events = (cat.sort_values(["date", "mentions"], ascending=[False, False])
              .assign(date=lambda d: d["date"].dt.strftime("%Y-%m-%d"),
                      src_name=lambda d: d["src"].map(ACTOR_NAMES),
                      dst_name=lambda d: d["dst"].map(ACTOR_NAMES),
                      src_iso2=lambda d: d["src"].map(_iso2),
                      dst_iso2=lambda d: d["dst"].map(_iso2)))
    daily = cat.groupby(cat["date"].dt.strftime("%Y-%m-%d"))["mentions"].sum()
    return {
        "events": _records(events[["date", "src", "dst", "src_name", "dst_name", "src_iso2", "dst_iso2", "type",
                                   "mentions", "events"]]),
        "daily": [{"date": d, "mentions": int(m)} for d, m in daily.items()],
    }


@app.get("/api/pairs/{pair_id}/catalysts")
def pair_catalysts(pair_id: str, days: int = Query(90, ge=1, le=365)) -> dict:
    _pair_or_404(pair_id)
    cat = _csv(CATALYST_FILE, dtype={"key": str}).dropna(subset=["type"])  # type 빈 행 = 수집 완료 표시
    # 월별 샘플 key(6자리) 제외
    cat = cat[cat["dyad"].isin(index_v1.PAIR_DYADS[pair_id]) & (cat["key"].str.len() == 8)]
    return _catalyst_response(cat[["key", "src", "dst", "type", "mentions", "events"]], days)


@app.get("/api/pairs/{pair_id}/news")
def pair_news(pair_id: str, range: str = Query("24h", pattern="^(24h|7d)$")) -> list[dict]:  # noqa: A002
    meta = _pair_or_404(pair_id)
    return _news(meta["news_query"], range)


def _news(query: str, range_key: str) -> list[dict]:
    try:
        return fetch_news(query, range_key)
    except Exception as e:  # 외부 RSS 장애가 화면 전체를 깨지 않도록 502 로 전달
        raise HTTPException(502, f"뉴스 조회 실패: {e}") from e


# ---------- 국가 ----------

def _country_pairs(code: str) -> list[str]:
    return [pid for pid in PAIRS if code in pid.split("-")]


def _country_wars(code: str) -> list[dict]:
    return [{"start": s, "end": e, "pair": pid} for pid in _country_pairs(code)
            for s, e in index_v1.WAR_PERIODS.get(pid, [])]


def _split(v: object) -> list[str]:
    """'A|B' 형식 메타 열 → 목록 (빈 값·NaN 은 빈 목록)."""
    return [x for x in str(v).split("|") if x] if isinstance(v, str) else []


def _meta() -> pd.DataFrame:
    return _csv(COUNTRY_META_FILE, dtype={"numeric": str})


def _country_or_404(code: str) -> pd.Series:
    meta = _meta()
    row = meta[meta["code"] == code] if len(meta) else meta
    if row.empty:
        raise HTTPException(404, f"알 수 없는 국가: {code}")
    return row.iloc[0]


def _week_ago(meta: pd.DataFrame) -> dict[str, dict]:
    """나라별 기준일(meta date) − 7일 행의 종합 점수 {code: {date, blended}}. 그 날 행이 없으면 키 없음."""
    idx = _csv(COUNTRY_INDEX_FILE)
    if idx.empty:
        return {}
    wanted = pd.DataFrame({"country": meta["code"],
                           "date": (pd.to_datetime(meta["date"]) - pd.Timedelta(days=7)).dt.strftime("%Y-%m-%d")})
    rows = wanted.merge(idx[["country", "date", "blended"]], on=["country", "date"])
    return {r["country"]: {"date": r["date"], "blended": r["blended"]} for r in _records(rows)}


@app.get("/api/countries")
def list_countries() -> list[dict]:
    meta = _meta()
    if meta.empty:
        return []
    country_live = _live("country")
    advisory_df = _csv(ROOT / travel_advisory.ADVISORY_FILE, keep_default_na=False, na_values=[""])
    if not data_go_kr.service_key() and not advisory_df.empty:  # 키를 뺀 뒤 CSV 에 남은 외교부 값은 숨김
        advisory_df = advisory_df[advisory_df["source"] != "kr_mofa"]
    advisory = travel_advisory.by_iso3(advisory_df)
    week_ago = _week_ago(meta)
    return [{
        "code": r["code"], "iso2": r["iso2"], "numeric": r["numeric"],
        "latest": {k: r[k] for k in INDEX_COLUMNS},
        "week_ago": week_ago.get(r["code"]),
        "live": _live_value(country_live, [r["code"]]),
        "status": r["status"], "status_reason": r["status_reason"],
        # 교전 상대: 나라(ISO alpha-2, 화면에서 한국어로) / 무장단체(UCDP 원문 이름)
        "opponents": _split(r.get("opponents")), "armed_groups": _split(r.get("armed_groups")),
        "ucdp": {"state_12m": r["ucdp_state_12m"], "all_12m": r["ucdp_all_12m"], "as_of": r["ucdp_as_of"]},
        "advisory": advisory.get(build_country_index.CAMEO_TO_ISO.get(r["code"], r["code"]), []),
        "pairs": _country_pairs(r["code"]), "wars": _country_wars(r["code"]),
    } for r in _records(meta)]


@app.get("/api/countries/{code}/index")
def country_index(code: str) -> list[dict]:
    _country_or_404(code)
    idx = _csv(COUNTRY_INDEX_FILE)
    rows = idx[idx["country"] == code][INDEX_COLUMNS[:-1]].copy()
    rows["grade"] = rows["blended"].fillna(rows["weekly"]).map(index_v1.grade)
    dates = pd.to_datetime(rows["date"])
    for pid in _country_pairs(code):
        rows.loc[index_v1.at_war(pd.DatetimeIndex(dates), pid), "grade"] = index_v1.WAR_LABEL
    return _records(rows)


@app.get("/api/countries/{code}/catalysts")
def country_catalysts(code: str, days: int = Query(90, ge=1, le=365)) -> dict:
    _country_or_404(code)
    hist = _csv(CATALYST_ALL_FILE, dtype={"key": str}, keep_default_na=False)
    recent = _csv(ROOT / live.CAT_LIVE, dtype={"key": str}, keep_default_na=False)
    # 일별 파일이 아직 없는 날(오늘·어제)은 15분 실시간 슬롯으로 채움
    if len(recent) and len(hist):
        recent = recent[recent["key"].str[:8] > hist["key"].max()]
    cat = pd.concat([hist, recent], ignore_index=True)
    cat = cat[(cat["src"] == code) | (cat["dst"] == code)] if len(cat) else cat
    if cat.empty:
        return {"events": [], "daily": []}
    return _catalyst_response(cat, days)


@app.get("/api/countries/{code}/news")
def country_news(code: str, name: str = Query(..., min_length=1, max_length=40),
                 range: str = Query("24h", pattern="^(24h|7d)$")) -> list[dict]:  # noqa: A002
    _country_or_404(code)
    return _news(COUNTRY_NEWS_QUERY.format(name=name), range)


@app.get("/api/blend")
def blend_weights() -> dict:
    """종합 점수 가중치와 추정 근거 (화면 설명용)."""
    return blend.load()


@app.get("/api/live")
def live_status() -> dict:
    slots = _csv(ROOT / live.COUNTRY_LIVE, dtype={"key": str})
    if slots.empty:
        return {"as_of": None, "slots": 0}
    end = slots["key"].max()
    return {"as_of": end, "slots": int(live.window(slots, end)[1])}


# ---------- 민방위 대피시설 (국내) ----------

def _shelters() -> pd.DataFrame:
    """키가 없거나 파일이 없으면 빈 표."""
    if not data_go_kr.service_key():
        return pd.DataFrame()
    return _csv(ROOT / shelters.SHELTER_FILE, dtype={"mng_no": str, "capacity": "Int64"},
                keep_default_na=False, na_values=[""])


def _shelter_items(df: pd.DataFrame) -> list[dict]:
    return [{**r, "capacity": None if r["capacity"] is None else int(r["capacity"])}
            for r in _records(df[SHELTER_FIELDS])]


@app.get("/api/shelters")
def list_shelters(lat: str | None = Query(None, pattern=COORD_PATTERN),
                  lon: str | None = Query(None, pattern=COORD_PATTERN),
                  region: str | None = Query(None, min_length=2, max_length=40)) -> dict:
    """좌표(소수 2자리까지) 기준 5km 안 전부(가까운 순), 또는 region="시·도[ 시·군·구]" 의 전부(이름순).
    둘 다 안전 상한에서 자르고 total 은 자르기 전 건수. 요청 좌표는 로그·파일에 남기지 않는다."""
    if (lat is None or lon is None) and not region:
        raise HTTPException(422, "lat·lon 또는 region 이 필요함")
    df = _shelters()
    out = {"available": not df.empty, "as_of": df["updated"].max() if len(df) else None, "items": [], "total": 0}
    if df.empty:
        return out
    if lat is not None and lon is not None:
        y, x = float(lat), float(lon)
        if not (KOREA_LAT[0] <= y <= KOREA_LAT[1] and KOREA_LON[0] <= x <= KOREA_LON[1]):
            return out
        dy = SHELTER_RADIUS_M / METERS_PER_DEG_LAT
        dx = dy / math.cos(math.radians(y))
        near = df[df["lat"].between(y - dy, y + dy) & df["lon"].between(x - dx, x + dx)].copy()
        near["distance_m"] = [round(shelters.haversine_m(y, x, a, b)) for a, b in zip(near["lat"], near["lon"])]
        near = near[near["distance_m"] <= SHELTER_RADIUS_M]  # total 은 사각형 사전 필터가 아니라 반경 안 건수
        out["total"] = len(near)
        out["items"] = _shelter_items(near.sort_values("distance_m").head(SHELTER_NEARBY_LIMIT))
        return out
    sido, _, sigungu = region.strip().partition(" ")
    rows = df[df["sido"] == sido]
    if sigungu.strip():
        rows = rows[rows["sigungu"] == sigungu.strip()]
    out["total"] = len(rows)
    out["items"] = _shelter_items(rows.sort_values("name").head(SHELTER_REGION_LIMIT).assign(distance_m=None))
    return out


@app.get("/api/shelters/regions")
def shelter_regions() -> dict:
    """시·도 → 시·군·구 목록 (위치 권한 없는 사용자의 지역 선택용)."""
    df = _shelters()
    if df.empty:
        return {"available": False, "regions": []}
    present = set(df["sido"].dropna())
    return {"available": True, "regions": [
        {"sido": s, "sigungu": sorted(set(df.loc[df["sido"] == s, "sigungu"].dropna()))}
        for s in shelters.SIDO if s in present]}



# ---------- 재외공관·영사콜센터 ----------

@app.get("/api/countries/{code}/embassies")
def country_embassies(code: str) -> dict:
    """나라의 대한민국 재외공관(대사관 먼저)과 영사콜센터. 키·파일 없음·KOR 이면 공관은 빈 목록."""
    _country_or_404(code)
    path = ROOT / embassies.EMBASSY_FILE
    df = _csv(path, dtype=str, keep_default_na=False) if data_go_kr.service_key() else pd.DataFrame()
    out = {"available": not df.empty,
           "as_of": time.strftime("%Y-%m-%d", time.localtime(_mtime(path))) if len(df) else None,  # 수집일
           "call_center": embassies.CALL_CENTER, "embassies": []}
    iso2 = _iso2(code)
    if df.empty or not iso2 or code == "KOR":
        return out
    rows = df[df["iso2"] == iso2]  # 파일은 이미 대사관 먼저 정렬돼 있음
    out["embassies"] = [{k: r[k] or None for k in ("name", "kind", "address", "tel", "emergency_tel")}
                        for r in rows.to_dict("records")]
    return out


# ---------- 데이터 신선도 헬스 체크 (외부 가동 감시용) ----------

def _utcnow() -> datetime:
    """현재 UTC 시각(시간대 있음). 테스트가 현재 시각을 바꿔 끼우는 유일한 지점."""
    return datetime.now(timezone.utc)


def _max_or_none(df: pd.DataFrame, column: str) -> str | None:
    """열의 최댓값. 파일이 없거나(열 없음) 행·값이 없으면 None."""
    value = df[column].max() if column in df else None
    return None if pd.isna(value) else value


@app.get("/api/health")
@app.head("/api/health")  # HEAD 로 확인하는 감시 서비스용(GET 만 등록하면 405). api_route 는 두 메서드에 같은 operationId 를 붙임
def health() -> JSONResponse:
    """최신 실시간 슬롯이 LIVE_STALE_MINUTES 분, 일별 지수 날짜가 INDEX_STALE_DAYS 일 이내면 200, 아니면 503.
    파일·값이 없으면 그 파일의 두 필드는 null 이고 503. LIVE_UPDATES=0 이어도 같은 기준이다."""
    now = _utcnow()
    live_as_of = _max_or_none(_csv(ROOT / live.COUNTRY_LIVE, dtype={"key": str}), "key")  # = /api/live 의 as_of
    index_date = _max_or_none(_meta(), "date")
    live_age = index_age = None
    if live_as_of is not None:  # 슬롯 key 는 UTC 시각
        slot = datetime.strptime(live_as_of, live.KEY_FORMAT).replace(tzinfo=timezone.utc)
        live_age = (now - slot) // timedelta(minutes=1)  # 분 단위 내림. 판정도 이 정수로 함
    if index_date is not None:  # 하루 중 시각과 무관한 UTC 달력 날짜 차
        index_age = (now.date() - date.fromisoformat(index_date)).days
    # GDELT 슬롯 key 는 실제 발행 시각보다 약 10분 뒤라 갱신 직후 나이가 음수일 수 있고 정상이다. 하한 검사를 두지 않는다
    ok = (live_age is not None and index_age is not None
          and live_age <= LIVE_STALE_MINUTES and index_age <= INDEX_STALE_DAYS)
    return JSONResponse({"ok": ok, "live_as_of": live_as_of, "live_age_minutes": live_age,
                         "index_date": index_date, "index_age_days": index_age}, status_code=200 if ok else 503)


assert set(RANGES) == {"24h", "7d"}  # news 쿼리 패턴과 동기화
