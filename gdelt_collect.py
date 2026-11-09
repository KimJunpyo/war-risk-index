"""GDELT 1.0 사건 파일에서 국가 쌍별 갈등 언급량과 촉매 사건을 함께 수집.

파일을 받아 필요한 집계만 CACHE_FILE / CATALYST_FILE 에 남기고 원본 zip 은 바로 지운다.
중단돼도 다시 실행하면 (파일, 쌍) 단위로 이미 처리한 것은 건너뛴다. 쌍을 추가하면 그 쌍만 다시 집계한다.
"""

import csv
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd

from gpr_backtest import CASES

BASE_URL = "https://data.gdeltproject.org/events/"
TMP_DIR = Path("data/gdelt_tmp")
CACHE_FILE = Path("data/gdelt_dyad_monthly.csv")
CATALYST_FILE = Path("data/gdelt_catalyst.csv")
DAILY_START = pd.Timestamp("2013-04-01")  # 이전은 월 단위 파일만 있음
# shortcut: 일별 파일은 월 4일만 표본 수집(용량 1/7). 노이즈가 크면 일수를 늘릴 것
SAMPLE_DAYS = [1, 8, 15, 22]
MONTHS_NEEDED = 48  # 기준선 36 + 관찰 구간 12
WORKERS = 4

# (쌍 이름, CAMEO 국가 코드 2개)
DYADS = {
    "RUS-UKR": ("RUS", "UKR"),
    "ISR-IRN": ("ISR", "IRN"),
    "KOR-PRK": ("KOR", "PRK"),
    "USA-IRN": ("USA", "IRN"),
    "USA-PRK": ("USA", "PRK"),
    "ARM-AZE": ("ARM", "AZE"),
    "IND-PAK": ("IND", "PAK"),
    "ISR-PSE": ("ISR", "PSE"),  # 하마스 등 팔레스타인 행위자
    "CHN-TWN": ("CHN", "TWN"),
    "USA-CHN": ("USA", "CHN"),
}
# 관찰할 T-0 날짜 (gpr_backtest.CASES 와 동일한 사례)
T0_DATES = [pd.Timestamp(c[2]) for c in CASES]
WEEKLY_DAYS = 3 * 365  # 주 단위 분석용 전수 수집 기간: 기준선 104주 + 관찰 52주

# GDELT 1.0 이벤트 컬럼 위치(0부터)
COL_A1, COL_A2, COL_CODE, COL_ROOT, COL_QUAD, COL_MENTIONS = 7, 17, 26, 28, 29, 31
CONFLICT_QUADS = {3, 4}  # 3=언어적 갈등, 4=물리적 갈등
CATALYST_FIELDS = ["key", "dyad", "src", "dst", "type", "mentions", "events"]


def catalyst_type(code: str, root: str) -> str | None:
    """CAMEO 코드 → 촉매 유형. 해당 없으면 None."""
    if code.startswith("138"):
        return "군사력 위협"
    if code.startswith("139"):
        return "최후통첩"
    if root == "15":
        return "무력 시위"
    return None


def file_keys() -> list[tuple[str, str]]:
    """(파일 키, 소속 월) 목록. 월 파일은 YYYYMM, 일 파일은 YYYYMMDD."""
    months: set[pd.Period] = set()
    days: set[pd.Timestamp] = set()
    for t0 in T0_DATES:
        end = t0.to_period("M") - 1
        months.update(pd.period_range(end - (MONTHS_NEEDED - 1), end, freq="M"))
        # 주 단위용: T-0 직전 WEEKLY_DAYS 일 전수 (일별 파일이 있는 기간만)
        days.update(d for d in pd.date_range(t0 - pd.Timedelta(days=WEEKLY_DAYS), t0 - pd.Timedelta(days=1))
                    if d >= DAILY_START)
    keys: dict[str, str] = {}
    for m in sorted(months):
        if m.to_timestamp() < DAILY_START:
            keys[m.strftime("%Y%m")] = str(m)
        else:
            keys.update({f"{m.strftime('%Y%m')}{d:02d}": str(m) for d in SAMPLE_DAYS})
    # 사이트용 연속 데이터: 일별 파일 시작일부터 어제까지 전수
    days.update(pd.date_range(DAILY_START, pd.Timestamp.today().normalize() - pd.Timedelta(days=1)))
    keys.update({d.strftime("%Y%m%d"): str(d.to_period("M")) for d in days})
    return sorted(keys.items())


def url_for(key: str) -> str:
    return BASE_URL + (f"{key}.zip" if len(key) == 6 else f"{key}.export.CSV.zip")


def load_events(url: str, tmp: Path) -> pd.DataFrame:
    """GDELT 사건 zip 을 받아 필요한 열만 읽고 원본은 지운다. (1.0·2.0 export 열 위치 동일)"""
    try:
        urllib.request.urlretrieve(url, tmp)
        return pd.read_csv(
            tmp, sep="\t", header=None, compression="zip", dtype=str, quoting=csv.QUOTE_NONE,
            usecols=[COL_A1, COL_A2, COL_CODE, COL_ROOT, COL_QUAD, COL_MENTIONS],
        ).fillna("")
    finally:
        tmp.unlink(missing_ok=True)


def in_pair(df: pd.DataFrame, a: str, b: str) -> pd.Series:
    """양방향 쌍 사건 여부."""
    return ((df[COL_A1] == a) & (df[COL_A2] == b)) | ((df[COL_A1] == b) & (df[COL_A2] == a))


def process(key: str, month: str, dyads: dict[str, tuple[str, str]],
            cat_dyads: dict[str, tuple[str, str]]) -> tuple[list[dict], list[dict]]:
    """(쌍 집계 행, 촉매 행). 촉매는 쌍마다 표시 행(type='')을 남겨 '수집 완료'를 기록한다."""
    df = load_events(url_for(key), TMP_DIR / f"{key}.zip")
    mentions = pd.to_numeric(df[COL_MENTIONS], errors="coerce").fillna(0)
    conflict = pd.to_numeric(df[COL_QUAD], errors="coerce").isin(CONFLICT_QUADS)
    total = int(mentions.sum())

    rows = [{
        "key": key, "month": month, "dyad": name,
        "conflict_mentions": int(mentions[in_pair(df, a, b) & conflict].sum()),
        "dyad_mentions": int(mentions[in_pair(df, a, b)].sum()),
        "total_mentions": total,
    } for name, (a, b) in dyads.items()]

    cat_rows = []
    for name, (a, b) in cat_dyads.items():
        sub = df[in_pair(df, a, b)]
        types = pd.Series([catalyst_type(c, r) for c, r in zip(sub[COL_CODE], sub[COL_ROOT])], index=sub.index)
        sub = sub.assign(type=types, m=mentions[sub.index]).dropna(subset=["type"])
        g = sub.groupby([COL_A1, COL_A2, "type"])["m"].agg(["sum", "count"]).reset_index()
        cat_rows += [{"key": key, "dyad": name, "src": s, "dst": d, "type": t, "mentions": int(m), "events": int(n)}
                     for s, d, t, m, n in g.itertuples(index=False)]
        cat_rows.append({"key": key, "dyad": name, "src": "", "dst": "", "type": "", "mentions": 0, "events": 0})
    return rows, cat_rows


def _done(path: Path) -> dict[str, set[str]]:
    done: dict[str, set[str]] = {}
    if path.exists():
        for key, dyad in pd.read_csv(path, dtype=str)[["key", "dyad"]].itertuples(index=False):
            done.setdefault(key, set()).add(dyad)
    return done


def self_check() -> None:
    assert catalyst_type("1381", "13") == "군사력 위협"
    assert catalyst_type("139", "13") == "최후통첩"
    assert catalyst_type("150", "15") == "무력 시위"
    assert catalyst_type("130", "13") is None


def main() -> None:
    self_check()
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    done, cat_done = _done(CACHE_FILE), _done(CATALYST_FILE)
    todo = []
    for k, m in file_keys():
        missing = {n: p for n, p in DYADS.items() if n not in done.get(k, set())}
        cat_missing = {n: p for n, p in DYADS.items() if n not in cat_done.get(k, set())}
        if missing or cat_missing:
            todo.append((k, m, missing, cat_missing))
    print(f"남은 파일 {len(todo)}개", flush=True)

    write_header = not CACHE_FILE.exists()
    cat_header = not CATALYST_FILE.exists()
    with (open(CACHE_FILE, "a", newline="", encoding="utf-8") as f,
          open(CATALYST_FILE, "a", newline="", encoding="utf-8") as cf,
          ThreadPoolExecutor(WORKERS) as pool):
        writer = csv.DictWriter(f, fieldnames=["key", "month", "dyad", "conflict_mentions", "dyad_mentions",
                                               "total_mentions"])
        cat_writer = csv.DictWriter(cf, fieldnames=CATALYST_FIELDS)
        if write_header:
            writer.writeheader()
        if cat_header:
            cat_writer.writeheader()
        futures = {pool.submit(process, *t): t[0] for t in todo}
        for i, fut in enumerate(futures, 1):
            try:
                rows, cat_rows = fut.result()
            except Exception as e:  # 실패 파일은 기록이 안 남으므로 재실행 시 다시 시도
                print(f"[실패] {futures[fut]}: {e}", flush=True)
                continue
            writer.writerows(rows)
            cat_writer.writerows(cat_rows)
            f.flush()
            cf.flush()
            if i % 50 == 0 or i == len(todo):
                print(f"{i}/{len(todo)} 처리", flush=True)


if __name__ == "__main__":
    main()
