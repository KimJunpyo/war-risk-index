"""개전 사례와 대조군(위기였지만 전쟁 없음)을 같은 방식으로 비교: 공식 v1 지수 + 촉매 신호.

지수: index_v1 의 7일·24시간 점수 (여러 GDELT 쌍이면 최고값).
촉매: 주별 촉매 언급 / 전체 언급 (100만 건당). 배수 = 앞쪽 10주(-24~-15주) 중앙값 대비.
"""

import pandas as pd

import index_v1
from gdelt_collect import CACHE_FILE, CATALYST_FILE

WEEKS = 24
BASELINE_WEEKS = range(-24, -14)
LAST_WEEKS = 4
DAILY_LOOKBACK_DAYS = 14
TYPES = ["군사력 위협", "최후통첩", "무력 시위"]

# (이름, 개전 여부, T-0, GDELT 쌍)
CASES = [
    ("러우 2022", True, "2022-02-24", ["RUS-UKR"]),
    ("이란 2025", True, "2025-06-13", ["ISR-IRN", "USA-IRN"]),
    ("아르-아제 2020", True, "2020-09-27", ["ARM-AZE"]),
    ("인도-파키 2025", True, "2025-05-07", ["IND-PAK"]),
    ("하마스 2023", True, "2023-10-07", ["ISR-PSE"]),
    ("남북 2017", False, "2017-09-03", ["KOR-PRK", "USA-PRK"]),
    ("남북 2015", False, "2015-08-20", ["KOR-PRK", "USA-PRK"]),
    ("미-이란 2020", False, "2020-01-03", ["USA-IRN", "ISR-IRN"]),
    ("중-대만 2022", False, "2022-08-04", ["CHN-TWN", "USA-CHN"]),
    ("인도-파키 2019", False, "2019-02-26", ["IND-PAK"]),
    ("러우 2021 집결", False, "2021-04-15", ["RUS-UKR"]),
]


def index_scores(cache: pd.DataFrame, dyads: list[str]) -> pd.DataFrame:
    daily = cache[cache["key"].str.len() == 8]
    parts = []
    for dyad in dyads:
        d = daily[daily["dyad"] == dyad]
        counts = d.set_index(pd.to_datetime(d["key"], format="%Y%m%d"))[["conflict_mentions", "total_mentions"]]
        parts.append(index_v1.dyad_scores(counts.sort_index()))
    return pd.concat(parts).groupby(level=0).max()


def catalyst_rates(cat: pd.DataFrame, totals: pd.Series, dyads: list[str], t0: pd.Timestamp) -> pd.DataFrame:
    start = t0 - pd.Timedelta(weeks=WEEKS)
    c = cat[cat["dyad"].isin(dyads) & (cat["date"] < t0) & (cat["date"] >= start)]
    counts = c.groupby([(c["date"] - t0).dt.days // 7, "type"])["mentions"].sum().unstack(fill_value=0)
    counts = counts.reindex(columns=TYPES, fill_value=0)
    tot = totals[(totals.index < t0) & (totals.index >= start)]
    tot = tot.groupby((tot.index - t0).days // 7).sum()
    return counts.reindex(tot.index, fill_value=0).div(tot, axis=0) * 1e6


def main() -> None:
    cache = pd.read_csv(CACHE_FILE, dtype={"key": str})
    cat = pd.read_csv(CATALYST_FILE, dtype={"key": str}).dropna(subset=["type"])
    cat = cat[cat["key"].str.len() == 8].copy()  # 월별 샘플 key(6자리) 제외
    cat["date"] = pd.to_datetime(cat["key"], format="%Y%m%d")
    daily = cache[cache["key"].str.len() == 8].drop_duplicates("key")  # 전체 언급 수는 쌍과 무관
    totals = daily.set_index(pd.to_datetime(daily["key"], format="%Y%m%d"))["total_mentions"].sort_index()

    rows = []
    for name, is_war, t0, dyads in CASES:
        t0 = pd.Timestamp(t0)
        s = index_scores(cache, dyads).loc[: t0 - pd.Timedelta(days=1)]
        recent = s.loc[t0 - pd.Timedelta(days=DAILY_LOOKBACK_DAYS):]
        r = catalyst_rates(cat, totals, dyads, t0)
        base = r.loc[r.index.isin(BASELINE_WEEKS)].median()
        threat = r["군사력 위협"] / base["군사력 위협"] if base["군사력 위협"] > 0 else r["군사력 위협"] * float("nan")
        rows.append({
            "사례": name, "개전": "예" if is_war else "아니오",
            "7일 T-1": round(s["weekly"].dropna().iloc[-1], 0),
            "24h 최고(14일)": round(recent["daily"].max(), 0),
            "위협 최고배수": round(threat.max(), 1),
            "위협 직전4주 배수": round(threat.loc[-LAST_WEEKS:].mean(), 1),
            "최후통첩 주수": int((r["최후통첩"] > 0).sum()),
            "최후통첩 직전4주": round(r["최후통첩"].loc[-LAST_WEEKS:].sum(), 1),
            "무력시위 직전4주 배수": round((r["무력 시위"].loc[-LAST_WEEKS:].mean() / base["무력 시위"]), 1)
            if base["무력 시위"] > 0 else None,
        })
    out = pd.DataFrame(rows)
    out.to_csv("out/case_backtest.csv", index=False, encoding="utf-8")
    print(out.to_string(index=False))


if __name__ == "__main__":
    main()
