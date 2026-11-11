"""공식 v1 로 국가 쌍별 연속 지수를 계산해 사이트용 파일로 저장."""

import pandas as pd

import atomic_write
import blend
import index_v1
import live
from gdelt_collect import CACHE_FILE, DAILY_START
from gpr_backtest import HIGH_RISK, OUT_DIR

INDEX_FILE = OUT_DIR / "index_v1.csv"


def v2_pair_weekly() -> pd.DataFrame:
    """2.0 쌍별 7일 점수 → 국가 쌍(관련 쌍 중 최고값). index=date, columns=pair."""
    if not live.V2_DAILY_DYAD.exists():
        return pd.DataFrame()
    s = live.v2_scores(pd.read_csv(live.V2_DAILY_DYAD, dtype={"key": str}), "dyad")
    w = s.pivot_table(index="date", columns="dyad", values="weekly")
    return pd.DataFrame({p: w.reindex(columns=d).max(axis=1) for p, d in index_v1.PAIR_DYADS.items()})


def main() -> None:
    cache = pd.read_csv(CACHE_FILE, dtype={"key": str})
    v2 = v2_pair_weekly()
    weights = blend.load()  # 가중치는 국가 단위로 추정한 값(build_country_index)을 공유
    frames = []
    for pair in index_v1.PAIR_DYADS:
        x = index_v1.pair_index(cache, pair).loc[DAILY_START:]
        x["v2_weekly"] = v2[pair].reindex(x.index) if pair in v2 else float("nan")
        x["blended"] = blend.combine(x["weekly"], x["v2_weekly"], weights)
        # 등급은 종합 점수 기준 (전쟁 기간은 그대로 '전쟁 중')
        war = x["grade"] == index_v1.WAR_LABEL
        x["grade"] = x["blended"].map(index_v1.grade).where(~war, index_v1.WAR_LABEL)
        # 점수가 없어도 전쟁 기간은 상태 표시를 위해 남김 (예: 2025-06 GDELT 결측)
        x = x[x["weekly"].notna() | (x["grade"] == index_v1.WAR_LABEL)].round(1)
        x.insert(0, "pair", pair)
        frames.append(x)
        peace = x[x["grade"] != index_v1.WAR_LABEL].dropna(subset=["weekly"])  # 비율은 전쟁 기간 제외
        print(f"{pair}: {x.index.min():%Y-%m-%d} ~ {x.index.max():%Y-%m-%d}, "
              f"전쟁 중 {(x['grade'] == index_v1.WAR_LABEL).sum()}일, "
              f"비전쟁 주간 100+ {100 * (peace['weekly'] >= HIGH_RISK).mean():.1f}%, "
              f"비전쟁 24시간 100+ {100 * (peace['daily'] >= HIGH_RISK).mean():.1f}%, "
              f"최신 {x['weekly'].iloc[-1]} ({x['grade'].iloc[-1]})")
    out = pd.concat(frames).rename_axis("date").reset_index()
    atomic_write.write_csv(out, INDEX_FILE, index=False, encoding="utf-8")
    print(f"저장: {INDEX_FILE} ({len(out)}행)")


if __name__ == "__main__":
    main()
