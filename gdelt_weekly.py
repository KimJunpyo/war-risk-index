"""GDELT 국가 쌍 갈등 언급 비중을 주 단위로 점수화.

주는 T-0 기준으로 자른다: 주 -1 = T-0 직전 7일, 주 -2 = 그 전 7일 ...
그래서 개전 당일 이후 기사는 어떤 주에도 섞이지 않는다.
"""

import matplotlib.pyplot as plt
import pandas as pd

from gdelt_backtest import CASE_DYAD
from gdelt_collect import CACHE_FILE, DAILY_START, WEEKLY_DAYS
from gpr_backtest import CASES, HIGH_RISK, OUT_DIR, risk_score

BASELINE_WEEKS = 104
MIN_BASELINE_WEEKS = 52  # 2015 사례는 일별 파일 시작(2013-04)이 늦어 기준선을 다 못 채움
WINDOW_WEEKS = 52


def weekly_share(daily: pd.DataFrame, dyad: str, t0: pd.Timestamp) -> pd.Series:
    d = daily[(daily["dyad"] == dyad) & (daily["date"] < t0) & (daily["date"] >= t0 - pd.Timedelta(days=WEEKLY_DAYS))]
    week = (d["date"] - t0).dt.days // 7  # -1, -2, ...
    g = d.groupby(week)[["conflict_mentions", "total_mentions"]].sum()
    return (g["conflict_mentions"] / g["total_mentions"]).sort_index()


def stats(score: pd.Series, t0: pd.Timestamp) -> dict:
    w = score.loc[-WINDOW_WEEKS:-1].dropna()
    if w.empty:
        return {"T-1주": "-", "최고": "-", "첫100+": "-", "리드(주)": "-", "점수낸 주": 0}
    over = w[w >= HIGH_RISK]
    first = over.index[0] if len(over) else None
    return {
        "T-1주": round(w.iloc[-1], 1) if w.index[-1] == -1 else "-",
        "최고": round(w.max(), 1),
        "첫100+": (t0 + pd.Timedelta(weeks=int(first))).strftime("%Y-%m-%d") if first is not None else "-",
        "리드(주)": -int(first) if first is not None else "-",
        "점수낸 주": len(w),
    }


def main() -> None:
    cache = pd.read_csv(CACHE_FILE, dtype={"key": str})
    daily = cache[cache["key"].str.len() == 8].copy()
    daily["date"] = pd.to_datetime(daily["key"], format="%Y%m%d")

    rows = []
    fig, axes = plt.subplots(len(CASES), 1, figsize=(10, 3 * len(CASES)))
    plt.rcParams["font.family"] = "Malgun Gothic"
    for ax, (name, _codes, t0, is_war) in zip(axes, CASES):
        t0 = pd.Timestamp(t0)
        ax.set_title(f"{name} — T-0 {t0.date()} (주 단위)", fontfamily="Malgun Gothic")
        if t0 - pd.Timedelta(weeks=WINDOW_WEEKS) < DAILY_START:
            rows.append({"사례": name, "개전": "예" if is_war else "아니오", "비고": "일별 데이터 없음"})
            continue
        scores = {}
        for dyad in filter(None, CASE_DYAD[name]):
            scores[dyad] = risk_score(weekly_share(daily, dyad, t0), BASELINE_WEEKS, MIN_BASELINE_WEEKS)
            s = scores[dyad].loc[-WINDOW_WEEKS:-1]
            ax.plot(s.index, s.values, label=dyad)
        # 한쪽 쌍만 급등해도 위험 신호 (월 단위와 같은 규칙)
        comb = pd.concat(scores.values(), axis=1).max(axis=1)
        row = {"사례": name, "개전": "예" if is_war else "아니오"}
        row.update({f"결합 {k}": v for k, v in stats(comb, t0).items()})
        row.update({f"{d} 최고": stats(s, t0)["최고"] for d, s in scores.items()})
        rows.append(row)
        ax.axhline(HIGH_RISK, color="red", ls="--", lw=1)
        ax.set_xlabel("T-0 기준 주", fontfamily="Malgun Gothic")
        ax.legend(loc="upper left")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "gdelt_weekly.png", dpi=110)
    result = pd.DataFrame(rows)
    result.to_csv(OUT_DIR / "gdelt_weekly.csv", index=False, encoding="utf-8")
    print(result.to_string(index=False))


if __name__ == "__main__":
    main()
