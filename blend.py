"""v1(GDELT 1.0 일별)·v2(GDELT 2.0 15분) 7일 점수를 합친 종합 점수.

두 점수는 같은 '갈등 고조'를 서로 다른 기사 묶음으로 잰 것: X1 = 신호 + 잡음1, X2 = 신호 + 잡음2.
- 같은 날 두 점수의 공분산 = 신호 분산, 각자 분산 - 공분산 = 잡음 분산
- 가중치 = 잡음 분산의 역수 비율 (덜 출렁이는 쪽을 더 믿음)
- 섞으면 분산이 줄어들므로 다시 표준화해 '100 = 평시 대비 +2σ' 의미를 유지
"""

import json

import numpy as np
import pandas as pd

from gpr_backtest import OUT_DIR, SCORE_AT_Z0, SCORE_PER_Z

BLEND_FILE = OUT_DIR / "blend_weights.json"
MIN_OVERLAP_DAYS = 60  # 국가별로 두 점수가 함께 있는 날이 이보다 적으면 가중치 추정에서 제외
MIN_NOISE = 1e-3
DEFAULT = {"w1": 0.5, "w2": 0.5, "rho": 0.0, "estimated": False}


def _z(score: pd.Series) -> pd.Series:
    return (score - SCORE_AT_Z0) / SCORE_PER_Z


def estimate(pairs: pd.DataFrame, entity: str) -> dict:
    """pairs: (date, entity, s1, s2) — 같은 날의 v1·v2 7일 점수. 반환: 가중치·상관·근거 통계."""
    p = pairs.dropna(subset=["s1", "s2"])
    stats = []
    for name, g in p.groupby(entity):
        if len(g) < MIN_OVERLAP_DAYS:
            continue
        z1, z2 = _z(g["s1"]), _z(g["s2"])
        cov = float(np.cov(z1, z2)[0, 1])
        stats.append({"entity": name, "var1": z1.var(), "var2": z2.var(), "cov": cov, "corr": z1.corr(z2)})
    if not stats:
        return DEFAULT
    s = pd.DataFrame(stats)
    var1, var2, cov = s["var1"].mean(), s["var2"].mean(), s["cov"].mean()
    noise1, noise2 = max(var1 - cov, MIN_NOISE), max(var2 - cov, MIN_NOISE)
    w1 = (1 / noise1) / (1 / noise1 + 1 / noise2)
    return {
        "w1": round(w1, 3), "w2": round(1 - w1, 3), "rho": round(cov / np.sqrt(var1 * var2), 3),
        "noise1": round(noise1, 3), "noise2": round(noise2, 3), "signal": round(cov, 3),
        "median_corr": round(float(s["corr"].median()), 3), "entities": len(s),
        "overlap_days": int(p["date"].nunique()), "estimated": True,
    }


def combine(s1: pd.Series | float | None, s2: pd.Series | float | None, w: dict) -> pd.Series | float | None:
    """종합 점수. 한쪽이 없으면 있는 쪽 그대로."""
    scalar = not isinstance(s1, pd.Series) and not isinstance(s2, pd.Series)
    if scalar:  # pd.Series(None) 은 빈 시리즈가 되므로 한 칸짜리로 감쌈
        s1, s2 = [s1], [s2]
    a, b = pd.Series(s1, dtype=float), pd.Series(s2, dtype=float)
    norm = np.sqrt(w["w1"] ** 2 + w["w2"] ** 2 + 2 * w["w1"] * w["w2"] * w["rho"])
    z = (w["w1"] * _z(a) + w["w2"] * _z(b)) / norm
    out = (SCORE_AT_Z0 + z * SCORE_PER_Z).where(a.notna() & b.notna(), a.fillna(b))
    if not scalar:
        return out
    return None if pd.isna(out.iloc[0]) else float(out.iloc[0])


def save(w: dict) -> None:
    BLEND_FILE.write_text(json.dumps(w, ensure_ascii=False, indent=2), encoding="utf-8")


def load() -> dict:
    return json.loads(BLEND_FILE.read_text(encoding="utf-8")) if BLEND_FILE.exists() else DEFAULT


def self_check() -> None:
    rng = np.random.default_rng(0)
    days = pd.date_range("2026-01-01", periods=300)
    rows = []
    for e in ["A", "B", "C"]:
        signal = rng.normal(0, 1, len(days))
        rows.append(pd.DataFrame({"date": days, "c": e,
                                  "s1": 50 + 25 * (signal + rng.normal(0, 0.5, len(days))),  # 잡음 작음
                                  "s2": 50 + 25 * (signal + rng.normal(0, 1.0, len(days)))}))  # 잡음 큼
    w = estimate(pd.concat(rows), "c")
    assert 0.7 < w["w1"] < 0.9, w  # 이론값 1/0.25 : 1/1 → 0.8
    assert combine(150.0, 150.0, w) > 150  # 두 출처가 같이 높으면 하나보다 강한 증거
    assert combine(None, 80.0, w) == 80.0 and combine(70.0, None, w) == 70.0


if __name__ == "__main__":
    self_check()
    print("self_check ok")
