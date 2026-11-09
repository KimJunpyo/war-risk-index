"""GPR 국가별 지수로 전쟁 가능성 지수 1차 백테스트.

점수 정의: log(GPRC) 를 '직전 BASELINE_MONTHS 개월'(당월 제외) 평균·표준편차로 z-score 화한 뒤
SCORE_AT_Z0 + z * SCORE_PER_Z 로 변환. 100점 = 평시 대비 +2σ.
과거 데이터만 쓰므로 미래 정보 누출(look-ahead)이 없다.
"""

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

DATA_FILE = Path("data/data_gpr_export.xls")
OUT_DIR = Path("out")
BASELINE_MONTHS = 36
SCORE_AT_Z0 = 50
SCORE_PER_Z = 25  # z=2 → 100점
HIGH_RISK = 100
WINDOW_MONTHS = 12

# (이름, 국가 코드들, 기준 시점 T-0, 실제 개전 여부)
CASES = [
    ("러시아↔우크라이나", ["RUS", "UKR"], "2022-02-24", True),
    ("이스라엘↔이란", ["ISR"], "2025-06-13", True),  # GPR 에 이란 계열 없음
    ("남북 2010 연평도", ["KOR"], "2010-11-23", False),  # GPR 에 북한 계열 없음
    ("남북 2017 화염과분노", ["KOR"], "2017-09-03", False),
    ("남북 2015 서부전선 포격", ["KOR"], "2015-08-20", False),
]


def load_gpr(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path)
    df["month"] = pd.to_datetime(df["month"])
    return df.set_index("month")


def risk_score(series: pd.Series, baseline: int = BASELINE_MONTHS, min_periods: int | None = None) -> pd.Series:
    """직전 baseline 기간(당기 제외) 기준 z-score 를 점수로 변환."""
    log_s = np.log(series.where(series > 0))
    past = log_s.shift(1).rolling(baseline, min_periods=min_periods or baseline)
    z = (log_s - past.mean()) / past.std()
    return SCORE_AT_Z0 + z * SCORE_PER_Z


def dyad_score(df: pd.DataFrame, codes: list[str]) -> pd.Series:
    # 한쪽만 급등해도 위험 신호로 보기 위해 max 사용
    return pd.concat([risk_score(df[f"GPRC_{c}"]) for c in codes], axis=1).max(axis=1)


def self_check() -> None:
    # 당월 급등은 당월 기준선에 섞이지 않아야 한다
    s = pd.Series([1.0] * 40 + [10.0], dtype=float)
    s.iloc[:40] += np.linspace(0, 0.01, 40)  # 표준편차 0 방지
    assert risk_score(s).iloc[-1] > HIGH_RISK


def main() -> None:
    self_check()
    df = load_gpr(DATA_FILE)
    OUT_DIR.mkdir(exist_ok=True)

    fig, axes = plt.subplots(len(CASES), 1, figsize=(10, 3 * len(CASES)))
    rows = []
    for ax, (name, codes, t0, is_war) in zip(axes, CASES):
        t0 = pd.Timestamp(t0)
        score = dyad_score(df, codes)
        t0_month = t0.to_period("M").to_timestamp()
        # 개전 월은 개전 후 기사가 섞이므로 제외: T-12 ~ T-1 개월
        window = score[t0_month - pd.DateOffset(months=WINDOW_MONTHS): t0_month - pd.DateOffset(months=1)]
        over = window[window >= HIGH_RISK]
        rows.append({
            "사례": name,
            "개전": "예" if is_war else "아니오",
            "T-1월 점수": round(window.iloc[-1], 1),
            "최고점": round(window.max(), 1),
            "최고점 월": window.idxmax().strftime("%Y-%m"),
            "첫 100+ 월": over.index[0].strftime("%Y-%m") if len(over) else "-",
            "리드타임(개월)": (t0_month.to_period("M") - over.index[0].to_period("M")).n if len(over) else "-",
            "T-0월 점수": round(score.get(t0_month, np.nan), 1),
            "전체기간 중앙값": round(score.median(), 1),
        })
        plot = score[t0_month - pd.DateOffset(months=24): t0_month + pd.DateOffset(months=3)]
        ax.plot(plot.index, plot.values)
        ax.axhline(HIGH_RISK, color="red", ls="--", lw=1)
        ax.axvline(t0, color="black", lw=1)
        ax.set_title(f"{name} ({'+'.join(codes)}) T-0={t0.date()}")

    plt.rcParams["font.family"] = "Malgun Gothic"
    for ax in axes:
        ax.title.set_fontfamily("Malgun Gothic")
    fig.tight_layout()
    fig.savefig(OUT_DIR / "gpr_backtest.png", dpi=110)

    result = pd.DataFrame(rows)
    result.to_csv(OUT_DIR / "gpr_backtest.csv", index=False, encoding="utf-8")
    print(result.to_string(index=False))

    latest = df.index.max()
    print(f"\n최근 월({latest:%Y-%m}) 국가별 점수:")
    for c in ["RUS", "UKR", "ISR", "KOR", "TWN", "CHN"]:
        print(f"  {c}: {risk_score(df[f'GPRC_{c}']).iloc[-1]:.1f}")


if __name__ == "__main__":
    main()
