"""tests/test_m12_publish.py 용 작은 data/·out/ 픽스처를 실제 data/·out/ 에서 잘라 만든다.

저장소 루트에서 실행: python tests/fixtures/m12/make_fixture.py
나라 몇 개·최근 기간·대피소 두 구역만 남긴다. 입력 파일 형식이 바뀌면 다시 만든다.
"""

import shutil
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

import case_backtest  # noqa: E402
import embassies  # noqa: E402
import index_v1  # noqa: E402

FIX = Path(__file__).resolve().parent
CODES = ["KOR", "PRK", "UKR", "RUS", "ISR", "IRN", "USA", "JPN"]
INDEX_DAYS, CATALYST_DAYS = 60, 100  # 일별 지수·촉매를 남길 최근 일수
# 대피소를 남길 구역 (위도, 경도, 위도 반폭, 경도 반폭): 서울 도심, 부산
SHELTER_BOXES = [(37.57, 126.98, 0.06, 0.08), (35.18, 129.08, 0.06, 0.08)]
EMBASSY_ISO2 = ["JP", "UA"]
COLLECTED = "2026-11-13"  # 공관 수집일 열 고정값


def _csv(rel: str) -> pd.DataFrame:
    """원문 글자를 그대로 두려고 모든 열을 문자열로 읽는다(다시 쓸 때 3 → 3.0 같은 변형 방지)."""
    return pd.read_csv(ROOT / rel, dtype=str, keep_default_na=False)


def _save(df: pd.DataFrame, rel: str) -> None:
    path = FIX / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8", lineterminator="\n")


def _since(dates: pd.Series, days: int) -> pd.Series:
    d = pd.to_datetime(dates.str[:8], format="%Y%m%d")
    return d >= d.max() - pd.Timedelta(days=days)


def main() -> None:
    meta = _csv("out/country_meta.csv")
    _save(meta[meta["code"].isin(CODES)], "out/country_meta.csv")
    idx = _csv("out/country_index.csv")
    idx = idx[idx["country"].isin(CODES)]
    _save(idx[_since(idx["date"].str.replace("-", ""), INDEX_DAYS)], "out/country_index.csv")

    pair = _csv("out/index_v1.csv")
    case_days = {(pd.Timestamp(t0) - pd.Timedelta(days=1)).strftime("%Y-%m-%d") for _, _, t0, _ in case_backtest.CASES}
    _save(pair[_since(pair["date"].str.replace("-", ""), INDEX_DAYS) | pair["date"].isin(case_days)],
          "out/index_v1.csv")
    shutil.copy(ROOT / "out/blend_weights.json", FIX / "out/blend_weights.json")

    cat = _csv("data/gdelt_catalyst.csv")
    cat = cat[cat["key"].str.len() == 8]
    _save(cat[_since(cat["key"], CATALYST_DAYS)], "data/gdelt_catalyst.csv")
    cat_all = _csv("data/gdelt_catalyst_all.csv")
    cat_all = cat_all[cat_all["src"].isin(CODES) | cat_all["dst"].isin(CODES)]
    _save(cat_all[_since(cat_all["key"], CATALYST_DAYS)], "data/gdelt_catalyst_all.csv")

    dyads = {d for ds in index_v1.PAIR_DYADS.values() for d in ds}
    for name, col, keep in [("country_15min", "country", CODES), ("country_v2_daily", "country", CODES),
                            ("dyad_15min", "dyad", dyads), ("dyad_v2_daily", "dyad", dyads)]:
        df = _csv(f"data/live/{name}.csv")
        _save(df[df[col].isin(keep)], f"data/live/{name}.csv")
    live_cat = _csv("data/live/catalyst_15min.csv")
    _save(live_cat[live_cat["src"].isin(CODES) | live_cat["dst"].isin(CODES)], "data/live/catalyst_15min.csv")

    adv = _csv("data/travel_advisory.csv")
    _save(adv[adv["iso3"].isin(CODES)], "data/travel_advisory.csv")

    sh = _csv("data/shelters.csv")
    lat, lon = sh["lat"].astype(float), sh["lon"].astype(float)
    inside = pd.concat([lat.between(y - dy, y + dy) & lon.between(x - dx, x + dx)
                        for y, x, dy, dx in SHELTER_BOXES], axis=1).any(axis=1)
    _save(sh[inside], "data/shelters.csv")
    emb = _csv("data/embassies.csv")
    _save(emb[emb["iso2"].isin(EMBASSY_ISO2)].assign(**{embassies.COLLECTED_COLUMN: COLLECTED}), "data/embassies.csv")


if __name__ == "__main__":
    main()
