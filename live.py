"""GDELT 2.0 15분 파일로 최근 24시간 실시간 집계.

15분 슬롯마다 국가별·쌍별 갈등 언급과 촉매 사건을 LIVE_DIR 에 쌓고, 최근 KEEP_HOURS 시간만 남긴다.
실시간 24시간 점수 = 최근 24시간 비중을 **2.0 일별 집계** 기준선과 비교.
1.0 일별 파일은 2.0 15분 파일의 합과 수준이 달라(2026-11-04 비교: 국가별 log 차 표준편차 0.37) 섞지 않는다.
주간 점수는 1.0 일별 파일로 하루 1번 갱신.
"""

import csv
import re
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

import country_collect
import index_v1
from gdelt_collect import COL_MENTIONS, COL_QUAD, CONFLICT_QUADS, DYADS, TMP_DIR, in_pair, load_events
from gpr_backtest import SCORE_AT_Z0, SCORE_PER_Z
from index_v1 import DAILY_BASELINE_DAYS as BASELINE_DAYS
from index_v1 import DAILY_MIN_DAYS

V2_BASE = "http://data.gdeltproject.org/gdeltv2/"
LAST_UPDATE_URL = V2_BASE + "lastupdate.txt"
SLOT_MINUTES = 15
LIVE_HOURS = 24
KEEP_HOURS = 26  # 24시간 창 + 여유
MIN_SLOT_RATIO = 0.8  # 24시간 중 이 비율 이상 슬롯이 있어야 점수 계산
WORKERS = 4
SLOT_WORKERS = 6  # 하루치 백필에서 날마다 동시에 받는 슬롯 수 (총 동시 요청 = WORKERS × SLOT_WORKERS)
KEY_FORMAT = "%Y%m%d%H%M%S"

LIVE_DIR = Path("data/live")
COUNTRY_LIVE = LIVE_DIR / "country_15min.csv"
DYAD_LIVE = LIVE_DIR / "dyad_15min.csv"
CAT_LIVE = LIVE_DIR / "catalyst_15min.csv"
DYAD_FIELDS = ["key", "dyad", "conflict_mentions", "total_mentions"]
V2_DAILY_COUNTRY = LIVE_DIR / "country_v2_daily.csv"
V2_DAILY_DYAD = LIVE_DIR / "dyad_v2_daily.csv"
SLOTS_PER_DAY = 24 * 60 // SLOT_MINUTES
V2_WEEKLY_MIN_DAYS = 180

_missing: set[str] = set()  # GDELT 가 건너뛴 슬롯(404). 재시도하지 않음


def latest_slot() -> pd.Timestamp:
    with urllib.request.urlopen(LAST_UPDATE_URL, timeout=30) as r:
        text = r.read().decode()
    return pd.Timestamp(re.search(r"/(\d{14})\.export", text).group(1))


def slot_keys(end: pd.Timestamp, hours: int) -> list[str]:
    start = end - pd.Timedelta(hours=hours) + pd.Timedelta(minutes=SLOT_MINUTES)
    return [t.strftime(KEY_FORMAT) for t in pd.date_range(start, end, freq=f"{SLOT_MINUTES}min")]


def fetch_slot(key: str) -> tuple[list[dict], list[dict], list[dict]]:
    df = load_events(f"{V2_BASE}{key}.export.CSV.zip", TMP_DIR / f"v2_{key}.zip")
    rows, cat_rows = country_collect.aggregate(df, key)
    mentions = pd.to_numeric(df[COL_MENTIONS], errors="coerce").fillna(0)
    conflict = pd.to_numeric(df[COL_QUAD], errors="coerce").isin(CONFLICT_QUADS)
    total = int(mentions.sum())
    dyad_rows = [{"key": key, "dyad": name, "conflict_mentions": int(mentions[in_pair(df, a, b) & conflict].sum()),
                  "total_mentions": total} for name, (a, b) in DYADS.items()]
    return rows, dyad_rows, cat_rows


def _read(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, dtype={"key": str}) if path.exists() else pd.DataFrame()


def update() -> int:
    """빠진 슬롯을 받아 붙이고 오래된 슬롯을 지운다. 새로 받은 슬롯 수를 돌려준다."""
    LIVE_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    wanted = slot_keys(latest_slot(), KEEP_HOURS)
    have = set(_read(COUNTRY_LIVE).get("key", pd.Series(dtype=str)))
    todo = [k for k in wanted if k not in have and k not in _missing]
    new = {COUNTRY_LIVE: [], DYAD_LIVE: [], CAT_LIVE: []}
    with ThreadPoolExecutor(WORKERS) as pool:
        for key, fut in [(k, pool.submit(fetch_slot, k)) for k in todo]:
            try:
                rows, dyad_rows, cat_rows = fut.result()
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    _missing.add(key)
                continue
            except Exception as e:  # 일시 오류는 다음 주기에 다시 시도
                print(f"[live 실패] {key}: {e}", flush=True)
                continue
            new[COUNTRY_LIVE] += rows
            new[DYAD_LIVE] += dyad_rows
            new[CAT_LIVE] += cat_rows
    oldest = wanted[0]
    fields = {COUNTRY_LIVE: country_collect.COUNTRY_FIELDS, DYAD_LIVE: DYAD_FIELDS,
              CAT_LIVE: country_collect.CAT_FIELDS}
    for path, rows in new.items():
        df = pd.concat([_read(path), pd.DataFrame(rows, columns=fields[path])], ignore_index=True)
        df = df[df["key"] >= oldest] if len(df) else pd.DataFrame(columns=fields[path])
        tmp = path.with_suffix(".tmp")
        df.to_csv(tmp, index=False, quoting=csv.QUOTE_MINIMAL)
        tmp.replace(path)  # 읽는 쪽이 반쯤 쓴 파일을 보지 않도록 교체
    return len(todo) - len(_missing & set(todo))


def _fetch_or_none(key: str) -> tuple[list[dict], list[dict], list[dict]] | None:
    try:
        return fetch_slot(key)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def day_rows(day: str) -> tuple[list[dict], list[dict]]:
    """UTC 하루(15분 슬롯 96개)를 합친 (국가 행, 쌍 행). slots = 실제로 받은 슬롯 수."""
    keys = slot_keys(pd.Timestamp(day) + pd.Timedelta(hours=24) - pd.Timedelta(minutes=SLOT_MINUTES), 24)
    with ThreadPoolExecutor(SLOT_WORKERS) as pool:
        got = [r for r in pool.map(_fetch_or_none, keys) if r is not None]
    c = pd.DataFrame([x for r in got for x in r[0]], columns=country_collect.COUNTRY_FIELDS)
    d = pd.DataFrame([x for r in got for x in r[1]], columns=DYAD_FIELDS)
    total = int(c.drop_duplicates("key")["total_mentions"].sum())
    cg = c.groupby("country")[["conflict_mentions", "mentions"]].sum().reset_index()
    dg = d.groupby("dyad")[["conflict_mentions"]].sum().reset_index()
    meta = {"key": day, "total_mentions": total, "slots": len(got)}
    return ([{**meta, **r} for r in cg.to_dict("records")] or [{**meta, "country": "", "conflict_mentions": 0,
                                                                "mentions": 0}],
            [{**meta, **r} for r in dg.to_dict("records")])


def backfill(days: int = BASELINE_DAYS) -> int:
    """기준선용 2.0 일별 집계를 어제까지 days 일 채운다. 받은 날 수를 돌려준다."""
    LIVE_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    yesterday = pd.Timestamp.utcnow().tz_localize(None).normalize() - pd.Timedelta(days=1)
    want = [d.strftime("%Y%m%d") for d in pd.date_range(end=yesterday, periods=days)]
    have = set(_read(V2_DAILY_COUNTRY).get("key", pd.Series(dtype=str)))
    todo = [d for d in want if d not in have]
    print(f"2.0 기준선: 남은 날 {len(todo)}일", flush=True)
    header = not V2_DAILY_COUNTRY.exists()
    with (open(V2_DAILY_COUNTRY, "a", newline="", encoding="utf-8") as cf,
          open(V2_DAILY_DYAD, "a", newline="", encoding="utf-8") as df_,
          ThreadPoolExecutor(WORKERS) as pool):
        cw = csv.DictWriter(cf, ["key", "country", "conflict_mentions", "mentions", "total_mentions", "slots"])
        dw = csv.DictWriter(df_, ["key", "dyad", "conflict_mentions", "total_mentions", "slots"])
        if header:
            cw.writeheader()
            dw.writeheader()
        futures = {pool.submit(day_rows, d): d for d in todo}
        for i, fut in enumerate(futures, 1):
            try:
                c_rows, d_rows = fut.result()
            except Exception as e:  # 기록이 안 남으므로 다음 실행에서 다시 시도
                print(f"[기준선 실패] {futures[fut]}: {e}", flush=True)
                continue
            dw.writerows(d_rows)  # 쌍 먼저, 국가 행(완료 표시)은 나중에
            df_.flush()
            cw.writerows(c_rows)
            cf.flush()
            if i % 20 == 0 or i == len(todo):
                print(f"{i}/{len(todo)}일", flush=True)
    return len(todo)


def live_scores(slots: pd.DataFrame, daily: pd.DataFrame, entity: str) -> pd.DataFrame:
    """최근 24시간 갈등 비중을 2.0 일별 기준선(어제까지 BASELINE_DAYS 일)과 비교한 점수.

    slots: 15분 행(key, entity, conflict_mentions, total_mentions), daily: 2.0 일별 행(+slots).
    반환: index=entity, columns=[share, score, slots, as_of]
    """
    if slots.empty or daily.empty:
        return pd.DataFrame(columns=["share", "score", "slots", "as_of"])
    end = max(slots["key"])
    w, n = window(slots, end)
    total = w.drop_duplicates("key")["total_mentions"].sum()
    share = w.groupby(entity)["conflict_mentions"].sum() / total
    # 백필이 중간에 끊겨 같은 날이 두 번 기록됐으면 마지막 것만
    d = daily.drop_duplicates(["key", entity], keep="last")
    d = d[d["slots"] >= SLOTS_PER_DAY * MIN_SLOT_RATIO]
    d = d[d["key"] < end[:8]].copy()
    d = d[d["key"].isin(sorted(d["key"].unique())[-BASELINE_DAYS:])]
    d["log"] = np.log((d["conflict_mentions"] / d["total_mentions"]).where(lambda s: s > 0))
    stats = d.groupby(entity)["log"].agg(["mean", "std", "count"])
    stats = stats[stats["count"] >= DAILY_MIN_DAYS]
    log_now = np.log(share.where(share > 0)).reindex(stats.index)
    score = SCORE_AT_Z0 + (log_now - stats["mean"]) / stats["std"] * SCORE_PER_Z
    out = pd.DataFrame({"share": share.reindex(stats.index), "score": score})
    out["slots"], out["as_of"] = n, end
    # 슬롯이 모자라면(수집 지연) 점수를 내지 않음
    return out if n >= SLOTS_PER_DAY * MIN_SLOT_RATIO else out.assign(score=np.nan)


def v2_scores(daily: pd.DataFrame, entity: str) -> pd.DataFrame:
    """2.0 일별 집계 → (date, entity, daily, weekly) 점수. 공식은 index_v1 과 같음.

    shortcut: 2.0 기준선은 1년치만 받아 7일 점수 최소 기준선을 V2_WEEKLY_MIN_DAYS(180일)로 낮춤.
    2.0 을 2년 이상 받으면 index_v1.WEEKLY_MIN_DAYS(364일)로 맞출 것
    """
    d = daily.drop_duplicates(["key", entity], keep="last")
    d = d[d["slots"] >= SLOTS_PER_DAY * MIN_SLOT_RATIO]
    totals = d.drop_duplicates("key").set_index(pd.to_datetime(d.drop_duplicates("key")["key"], format="%Y%m%d"))
    totals = totals["total_mentions"].sort_index()
    frames = []
    for name, g in d.groupby(entity):
        conflict = g.set_index(pd.to_datetime(g["key"], format="%Y%m%d"))["conflict_mentions"]
        c = pd.DataFrame({"conflict_mentions": conflict.reindex(totals.index, fill_value=0),
                          "total_mentions": totals}).asfreq("D")
        share1 = c["conflict_mentions"] / c["total_mentions"]
        roll = c.rolling(index_v1.WEEK_DAYS, min_periods=index_v1.WEEK_MIN_DAYS).sum()
        share7 = roll["conflict_mentions"] / roll["total_mentions"]
        frames.append(pd.DataFrame({
            "date": c.index, entity: name,
            "daily": index_v1.to_score(share1, BASELINE_DAYS, DAILY_MIN_DAYS, lag=1).to_numpy(),
            "weekly": index_v1.to_score(share7, index_v1.WEEKLY_BASELINE_DAYS, V2_WEEKLY_MIN_DAYS,
                                        lag=index_v1.WEEK_DAYS).to_numpy(),
        }))
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=["date", entity, "daily", "weekly"])


def window(df: pd.DataFrame, end_key: str, hours: int = LIVE_HOURS) -> tuple[pd.DataFrame, int]:
    """end_key 까지 최근 hours 시간 행과 그 안의 슬롯 수."""
    keys = set(slot_keys(pd.Timestamp(end_key), hours))
    w = df[df["key"].isin(keys)]
    return w, w["key"].nunique()


def self_check() -> None:
    ks = slot_keys(pd.Timestamp("2026-11-06 03:45"), 24)
    assert len(ks) == 96 and ks[-1] == "20261106034500" and ks[0] == "20261105040000"
    # 기준선 비중이 1% 근처에서 흔들리고 지금 24시간이 4% → 고위험
    rng = np.random.default_rng(0)
    days = [d.strftime("%Y%m%d") for d in pd.date_range(end="2026-11-05", periods=DAILY_MIN_DAYS)]
    daily = pd.DataFrame({"key": days, "country": "AAA", "conflict_mentions": rng.integers(90, 110, len(days)),
                          "total_mentions": 10_000, "slots": SLOTS_PER_DAY})
    slots = pd.DataFrame({"key": ks, "country": "AAA", "conflict_mentions": 4, "total_mentions": 100})
    s = live_scores(slots, daily, "country")
    assert s.loc["AAA", "score"] > 100 and s.loc["AAA", "slots"] == 96
    assert np.isnan(live_scores(slots.iloc[-50:], daily, "country").loc["AAA", "score"])  # 슬롯 부족


if __name__ == "__main__":
    import sys

    self_check()
    if "--backfill" in sys.argv:
        backfill()
    print(f"새 슬롯 {update()}개")
