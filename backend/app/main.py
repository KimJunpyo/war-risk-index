"""전쟁 가능성 지수 API. 프로젝트 루트에서 실행: uvicorn backend.app.main:app

시작하면 백그라운드 스레드가 15분마다 GDELT 2.0 실시간 슬롯을 갱신하고,
새 GDELT 1.0 일별 파일이 나오면 수집·지수 계산을 다시 돌린다.
"""

import logging
import os
import threading
import time
import urllib.request
from contextlib import asynccontextmanager
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import blend
import build_country_index
import build_index
import country_collect
import gdelt_collect
import index_v1
import live
import travel_advisory
import ucdp
from backend.app.news import RANGES, fetch_news
from backend.app.pairs import ACTOR_NAMES, PAIRS

ROOT = Path(__file__).resolve().parents[2]
INDEX_FILE = ROOT / "out" / "index_v1.csv"
CATALYST_FILE = ROOT / "data" / "gdelt_catalyst.csv"
COUNTRY_INDEX_FILE = ROOT / build_country_index.COUNTRY_INDEX_FILE
COUNTRY_META_FILE = ROOT / build_country_index.COUNTRY_META_FILE
CATALYST_ALL_FILE = ROOT / country_collect.CATALYST_ALL_FILE
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
LIVE_UPDATES = os.getenv("LIVE_UPDATES", "1") == "1"
LIVE_INTERVAL_SECONDS = live.SLOT_MINUTES * 60
COLLECTOR_IDLE_SECONDS = 600  # 이 시간 안에 수집 파일이 바뀌었으면 수동 수집 중으로 보고 일별 갱신을 미룸
COUNTRY_NEWS_QUERY = "{name} (군사 OR 국방 OR 분쟁 OR 공격 OR 미사일)"
# 지수 표의 공통 열 (v1 7일, v2 7일, 종합, 24시간, 등급)
INDEX_COLUMNS = ["date", "daily", "weekly", "v2_weekly", "blended", "grade"]

log = logging.getLogger("war-risk")
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
    advisory = travel_advisory.by_iso3(_csv(ROOT / travel_advisory.ADVISORY_FILE, keep_default_na=False,
                                            na_values=[""]))
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


assert set(RANGES) == {"24h", "7d"}  # news 쿼리 패턴과 동기화
