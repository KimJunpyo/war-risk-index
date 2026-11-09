"""전쟁 가능성 지수 공식 v1 (자세한 정의는 FORMULA_v1.md).

입력: 국가 쌍별 일별 (갈등 언급 수, 전체 언급 수) — gdelt_collect 캐시 형식.
출력: 날짜별 24시간 점수(daily), 7일 점수(weekly = 대표 지수), 등급.
"""

import numpy as np
import pandas as pd

from gpr_backtest import SCORE_AT_Z0, SCORE_PER_Z

DAILY_BASELINE_DAYS = 365
DAILY_MIN_DAYS = 180
WEEK_DAYS = 7
WEEK_MIN_DAYS = 5  # 7일 중 최소 수집일 (GDELT 결측일 허용)
WEEKLY_BASELINE_DAYS = 728  # 104주
WEEKLY_MIN_DAYS = 364

# 점수 하한 → 등급 (위에서부터 판정)
GRADES = [(100, "고위험"), (50, "긴장"), (-np.inf, "안정")]

# 화면에 보여줄 국가 쌍 → 점수에 쓰는 GDELT 쌍들 (최고값 사용)
PAIR_DYADS = {
    "RUS-UKR": ["RUS-UKR"],
    "ISR-IRN": ["ISR-IRN", "USA-IRN"],
    "KOR-PRK": ["KOR-PRK", "USA-PRK"],
    "ARM-AZE": ["ARM-AZE"],
    "IND-PAK": ["IND-PAK"],
    "ISR-PSE": ["ISR-PSE"],
    "CHN-TWN": ["CHN-TWN", "USA-CHN"],
}

# 국가 쌍별 전쟁 기간 (시작일, 종료일). 종료일 None = 진행 중.
# 전쟁이 길어지면 전쟁 상태가 기준선이 되어 점수가 내려가므로, 이 기간은 점수와 무관하게 '전쟁 중'으로 표시
# shortcut: 수동 입력. 쌍이 늘어나면 UCDP 분쟁 데이터로 자동화할 것
WAR_PERIODS = {
    "RUS-UKR": [("2022-02-24", None)],
    # 2026 전쟁(미국·이스라엘 vs 이란): 휴전 발효(현지 04-08)까지. 7월 휴전 파기 선언·9월 미국 공습은 저강도라 제외
    "ISR-IRN": [("2025-06-13", "2025-06-24"), ("2026-02-28", "2026-04-08")],
    "KOR-PRK": [],
    "ARM-AZE": [("2020-09-27", "2020-11-10"), ("2023-09-19", "2023-09-20")],
    "IND-PAK": [("2025-05-07", "2025-05-10")],
    # 2023 전쟁은 2025-01~03 휴전 기간을 포함해 2025-10-10 휴전까지 하나로 봄
    "ISR-PSE": [("2014-07-08", "2014-08-26"), ("2021-05-10", "2021-05-21"), ("2023-10-07", "2025-10-10")],
    "CHN-TWN": [],
}
WAR_LABEL = "전쟁 중"


def to_score(share: pd.Series, baseline: int, min_periods: int, lag: int) -> pd.Series:
    """log(share) 를 lag 일 이전까지의 baseline 일 기준선으로 z-score 화 → 점수."""
    log_s = np.log(share.where(share > 0))
    past = log_s.shift(lag).rolling(baseline, min_periods=min_periods)
    return SCORE_AT_Z0 + (log_s - past.mean()) / past.std() * SCORE_PER_Z


def dyad_scores(counts: pd.DataFrame) -> pd.DataFrame:
    """counts: index=날짜, columns=[conflict_mentions, total_mentions]."""
    c = counts.asfreq("D")  # 결측일은 NaN 으로 두어 기간 계산이 날짜 기준이 되게
    share1 = c["conflict_mentions"] / c["total_mentions"]
    roll = c.rolling(WEEK_DAYS, min_periods=WEEK_MIN_DAYS).sum()
    share7 = roll["conflict_mentions"] / roll["total_mentions"]
    return pd.DataFrame({
        "daily": to_score(share1, DAILY_BASELINE_DAYS, DAILY_MIN_DAYS, lag=1),
        # 7일 창이 기준선과 겹치지 않도록 lag=7
        "weekly": to_score(share7, WEEKLY_BASELINE_DAYS, WEEKLY_MIN_DAYS, lag=WEEK_DAYS),
    })


def pair_index(cache: pd.DataFrame, pair: str) -> pd.DataFrame:
    """cache: gdelt_collect 캐시 (일별 key 행만 사용). 쌍별 점수 중 최고값."""
    daily = cache[cache["key"].astype(str).str.len() == 8]
    parts = []
    for dyad in PAIR_DYADS[pair]:
        d = daily[daily["dyad"] == dyad]
        counts = d.set_index(pd.to_datetime(d["key"].astype(str), format="%Y%m%d"))[
            ["conflict_mentions", "total_mentions"]].sort_index()
        parts.append(dyad_scores(counts))
    out = pd.concat(parts).groupby(level=0).max()
    out["grade"] = out["weekly"].map(grade)
    out.loc[at_war(out.index, pair), "grade"] = WAR_LABEL
    return out


def at_war(dates: pd.DatetimeIndex, pair: str) -> np.ndarray:
    mask = np.zeros(len(dates), dtype=bool)
    for start, end in WAR_PERIODS[pair]:
        mask |= (dates >= pd.Timestamp(start)) & (dates <= (pd.Timestamp(end) if end else pd.Timestamp.max))
    return mask


def grade(score: float) -> str | None:
    if pd.isna(score):
        return None
    return next(label for low, label in GRADES if score >= low)


def self_check() -> None:
    days = pd.date_range("2020-01-01", periods=800)
    rng = np.random.default_rng(0)
    counts = pd.DataFrame({"conflict_mentions": rng.integers(90, 110, 800).astype(float),
                           "total_mentions": 10_000.0}, index=days)
    counts.iloc[-7:, 0] = 300  # 마지막 7일 급등
    s = dyad_scores(counts)
    assert s["daily"].iloc[-1] > 100 and s["weekly"].iloc[-1] > 100
    assert s["weekly"].iloc[-30] < 100  # 급등 전에는 평시
    assert grade(120) == "고위험" and grade(70) == "긴장" and grade(10) == "안정"
    d = pd.to_datetime(["2025-06-12", "2025-06-13", "2025-06-24", "2025-06-25"])
    assert list(at_war(d, "ISR-IRN")) == [False, True, True, False]
    d = pd.to_datetime(["2026-02-27", "2026-02-28", "2026-04-08", "2026-04-09"])
    assert list(at_war(d, "ISR-IRN")) == [False, True, True, False]
    assert at_war(pd.to_datetime(["2030-01-01"]), "RUS-UKR")[0]  # 종료일 없음 = 진행 중


if __name__ == "__main__":
    self_check()
    print("self_check ok")
