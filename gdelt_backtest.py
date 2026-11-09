"""GDELT 국가 쌍 갈등 언급 비중으로 점수를 내고 GPR 점수와 나란히 비교."""

import matplotlib.pyplot as plt
import pandas as pd

from gdelt_collect import CACHE_FILE
from gpr_backtest import CASES, DATA_FILE, HIGH_RISK, OUT_DIR, WINDOW_MONTHS, dyad_score, load_gpr, risk_score

# gpr_backtest.CASES 이름 → (당사국 쌍, 미국 쌍 또는 None)
CASE_DYAD = {
    "러시아↔우크라이나": ("RUS-UKR", None),
    "이스라엘↔이란": ("ISR-IRN", "USA-IRN"),
    "남북 2010 연평도": ("KOR-PRK", "USA-PRK"),
    "남북 2017 화염과분노": ("KOR-PRK", "USA-PRK"),
    "남북 2015 서부전선 포격": ("KOR-PRK", "USA-PRK"),
}


def monthly_share(cache: pd.DataFrame, dyad: str) -> pd.Series:
    """월별 (쌍 갈등 언급 / 전체 언급). GDELT 전체 기사량 변화를 상쇄한다."""
    m = cache[cache["dyad"] == dyad].groupby("month")[["conflict_mentions", "total_mentions"]].sum()
    s = m["conflict_mentions"] / m["total_mentions"]
    s.index = pd.PeriodIndex(s.index, freq="M").to_timestamp()
    return s.sort_index()


def window_stats(score: pd.Series, t0_month: pd.Timestamp) -> dict:
    w = score[t0_month - pd.DateOffset(months=WINDOW_MONTHS): t0_month - pd.DateOffset(months=1)].dropna()
    over = w[w >= HIGH_RISK]
    return {
        "T-1": round(w.iloc[-1], 1) if len(w) else None,
        "최고": round(w.max(), 1) if len(w) else None,
        "첫100+": over.index[0].strftime("%Y-%m") if len(over) else "-",
    }


def main() -> None:
    cache = pd.read_csv(CACHE_FILE)
    gpr = load_gpr(DATA_FILE)
    rows = []
    fig, axes = plt.subplots(len(CASES), 1, figsize=(10, 3 * len(CASES)))
    plt.rcParams["font.family"] = "Malgun Gothic"
    for ax, (name, codes, t0, is_war) in zip(axes, CASES):
        t0_month = pd.Timestamp(t0).to_period("M").to_timestamp()
        start = t0_month - pd.DateOffset(months=48)
        main_dyad, us_dyad = CASE_DYAD[name]

        def g_score_of(dyad: str) -> pd.Series:
            # 사례마다 자기 48개월 구간 안에서만 기준선 계산(다른 사례 구간과 섞이지 않게)
            return risk_score(monthly_share(cache, dyad)[start: t0_month - pd.DateOffset(months=1)])

        g_main = g_score_of(main_dyad)
        g_us = g_score_of(us_dyad) if us_dyad else None
        # 한쪽 쌍만 급등해도 위험 신호로 보기 위해 max (gpr_backtest.dyad_score 와 같은 규칙)
        g_comb = g_main if g_us is None else pd.concat([g_main, g_us], axis=1).max(axis=1)
        p_score = dyad_score(gpr, codes)
        gm, gc, ps = (window_stats(s, t0_month) for s in (g_main, g_comb, p_score))
        gu = window_stats(g_us, t0_month) if g_us is not None else {"T-1": "-", "최고": "-"}
        rows.append({
            "사례": name, "개전": "예" if is_war else "아니오",
            "당사국쌍 T-1": gm["T-1"], "당사국쌍 최고": gm["최고"],
            "미국쌍 T-1": gu["T-1"], "미국쌍 최고": gu["최고"],
            "GDELT결합 T-1": gc["T-1"], "GDELT결합 첫100+": gc["첫100+"],
            "GPR T-1": ps["T-1"], "GPR 최고": ps["최고"],
        })
        view = slice(t0_month - pd.DateOffset(months=WINDOW_MONTHS), t0_month - pd.DateOffset(months=1))
        ax.plot(g_main[view].index, g_main[view].values, label=f"GDELT {main_dyad}")
        if g_us is not None:
            ax.plot(g_us[view].index, g_us[view].values, label=f"GDELT {us_dyad}")
        ax.plot(p_score[view].index, p_score[view].values, label=f"GPR {'+'.join(codes)}", alpha=0.7)
        ax.axhline(HIGH_RISK, color="red", ls="--", lw=1)
        ax.set_title(f"{name} — T-0 {t0}", fontfamily="Malgun Gothic")
        ax.legend(loc="upper left")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "gdelt_vs_gpr.png", dpi=110)
    result = pd.DataFrame(rows)
    result.to_csv(OUT_DIR / "gdelt_vs_gpr.csv", index=False, encoding="utf-8")
    print(result.to_string(index=False))


if __name__ == "__main__":
    main()
