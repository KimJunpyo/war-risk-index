"""M3 이슈 #6(3-1)·#7(3-2) 백엔드 인수 테스트.

기대값은 out/ 로컬 CSV 를 pandas 로 직접 계산해 API 응답과 비교한다.

계약 (구현은 이 계약을 따른다)
- GET /api/countries: 모든 항목에 "week_ago" 키.
    D = 그 나라 out/country_index.csv 최신 date(= latest.date), 같은 나라 D-7 행이 없으면 null,
    있으면 {"date": "YYYY-MM-DD", "blended": float | null} (blended 가 비어 있으면 null).
- GET /api/cases: 11건 [{name, label, is_war, t0, pairs, score}]
    name·is_war·t0·pairs = case_backtest.CASES 그대로 (t0 "YYYY-MM-DD", pairs 는 CASES 의 GDELT 쌍 목록 전체).
    score = T-1 날 out/index_v1.csv weekly 중 파일에 있는 쌍의 최댓값 (float, 없으면 null). 순서는 정하지 않음.
    label = 일반인용 이름 (FORMULA_v1.md 검증 표 표기 + " (t0)").

수동: 화면 목록·클릭·DOM 숨김·네트워크 0건·폭 375/1280·콘솔, uvicorn 30초 Traceback, tsc·lint.
"""

import math
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
COUNTRY_INDEX = ROOT / "out" / "country_index.csv"
PAIR_INDEX = ROOT / "out" / "index_v1.csv"
CASE_BACKTEST = ROOT / "out" / "case_backtest.csv"
WEEK = timedelta(days=7)
TOP_N = 5
CASE_TOLERANCE = 1.0  # 이슈: case_backtest.csv 7일 T-1 과 차이 1.0 이하


def _nan_to_none(v: object) -> float | None:
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else float(v)


# --- #6 (3-1) 이번 주 변화 Top 5 ---

@pytest.fixture(scope="module")
def countries(client) -> list[dict]:
    res = client.get("/api/countries")
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture(scope="module")
def country_csv() -> pd.DataFrame:
    return pd.read_csv(COUNTRY_INDEX)


def test_every_country_has_week_ago_key(countries: list[dict]) -> None:
    missing = [c["code"] for c in countries if "week_ago" not in c]
    assert not missing, missing


def test_week_ago_matches_csv(countries: list[dict], country_csv: pd.DataFrame) -> None:
    by_key = country_csv.set_index(["country", "date"])["blended"]
    errors = []
    for c in countries:
        d = date.fromisoformat(c["latest"]["date"])
        key = (c["code"], (d - WEEK).isoformat())
        wa = c["week_ago"]
        if key not in by_key.index:
            if wa is not None:
                errors.append(f"{c['code']}: D-7 행이 없는데 week_ago={wa}")
            continue
        if wa is None:
            errors.append(f"{c['code']}: D-7 행이 있는데 week_ago=null")
            continue
        if date.fromisoformat(wa["date"]) != d - WEEK:
            errors.append(f"{c['code']}: week_ago.date={wa['date']}, latest.date={d}")
        expected = _nan_to_none(by_key[key])
        got = wa["blended"]
        if (expected is None) != (got is None) or (expected is not None and abs(got - expected) > 1e-6):
            errors.append(f"{c['code']}: week_ago.blended={got}, CSV={expected}")
    assert not errors, "\n".join(errors)


def _movers_from_csv(df: pd.DataFrame) -> tuple[list[tuple[str, float]], list[tuple[str, float]]]:
    """이슈 동작 정의대로 손계산: 변화량 = blended(D) - blended(D-7), 빈 값 제외, 동률은 코드 오름차순."""
    df = df.assign(date=pd.to_datetime(df["date"]))
    d = df.groupby("country")["date"].max().rename("d")
    now = df.merge(d, left_on=["country", "date"], right_on=["country", "d"])[["country", "date", "blended"]]
    now["prev_date"] = now["date"] - pd.Timedelta(days=7)
    prev = df[["country", "date", "blended"]].rename(columns={"date": "prev_date", "blended": "prev"})
    m = now.merge(prev, on=["country", "prev_date"]).dropna(subset=["blended", "prev"])
    m["delta"] = m["blended"] - m["prev"]
    up = m[m["delta"] > 0].sort_values(["delta", "country"], ascending=[False, True]).head(TOP_N)
    down = m[m["delta"] < 0].sort_values(["delta", "country"], ascending=[True, True]).head(TOP_N)
    return ([(r.country, round(r.delta, 1)) for r in up.itertuples()],
            [(r.country, round(r.delta, 1)) for r in down.itertuples()])


def test_api_reproduces_expected_top5(countries: list[dict], country_csv: pd.DataFrame) -> None:
    # 화면 순서는 node 테스트(weekly-movers/model/movers.test.ts)로, 여기선 API 값이 손계산과 같은지만 확인
    expected_up, expected_down = _movers_from_csv(country_csv)
    rows = [(c["code"], c["latest"]["blended"] - c["week_ago"]["blended"]) for c in countries
            if c.get("week_ago") and c["latest"]["blended"] is not None and c["week_ago"]["blended"] is not None]
    up = sorted([r for r in rows if r[1] > 0], key=lambda r: (-r[1], r[0]))[:TOP_N]
    down = sorted([r for r in rows if r[1] < 0], key=lambda r: (r[1], r[0]))[:TOP_N]
    # PR 첨부용 기대 Top 5 (pytest -s 로 확인)
    print("\n오른 나라:", expected_up, "\n내린 나라:", expected_down)
    assert [(c, round(v, 1)) for c, v in up] == expected_up
    assert [(c, round(v, 1)) for c, v in down] == expected_down


# --- #7 (3-2) 과거 위기 사례 비교 ---

@pytest.fixture(scope="module")
def cases(client) -> list[dict]:
    res = client.get("/api/cases")
    assert res.status_code == 200, res.text
    return res.json()


def _case_defs() -> list[tuple]:
    import case_backtest

    return case_backtest.CASES


def test_cases_count_and_split(cases: list[dict]) -> None:
    assert len(cases) == 11
    assert sum(c["is_war"] is True for c in cases) == 5
    assert sum(c["is_war"] is False for c in cases) == 6


def test_cases_fields_match_case_backtest(cases: list[dict]) -> None:
    expected = {name: (is_war, t0, pairs) for name, is_war, t0, pairs in _case_defs()}
    got = {c["name"]: (c["is_war"], c["t0"], c["pairs"]) for c in cases}
    assert got == expected
    for c in cases:
        assert isinstance(c["label"], str) and c["t0"] in c["label"], c


@pytest.mark.parametrize(("name", "label"), [
    ("러우 2022", "러시아–우크라이나 개전 (2022-02-24)"),
    ("중-대만 2022", "중국–대만 펠로시 방문 후 훈련 (2022-08-04)"),
])
def test_case_label_examples(cases: list[dict], name: str, label: str) -> None:
    # 이슈 할 일 1 에 적힌 예시 표기
    assert {c["name"]: c["label"] for c in cases}[name] == label


def test_case_scores_hand_calculated(cases: list[dict]) -> None:
    idx = pd.read_csv(PAIR_INDEX)
    backtest = pd.read_csv(CASE_BACKTEST).set_index("사례")["7일 T-1"]
    got = {c["name"]: c["score"] for c in cases}
    errors = []
    for name, _, t0, pairs in _case_defs():
        t1 = (date.fromisoformat(t0) - timedelta(days=1)).isoformat()
        expected = idx[(idx["date"] == t1) & idx["pair"].isin(pairs)]["weekly"].max()
        if got[name] is None or abs(got[name] - expected) > 1e-6:
            errors.append(f"{name}: score={got[name]}, 손계산={expected}")
        elif abs(got[name] - backtest[name]) > CASE_TOLERANCE:
            errors.append(f"{name}: score={got[name]}, case_backtest.csv={backtest[name]}")
    assert not errors, "\n".join(errors)


def test_russia_2022_score(cases: list[dict]) -> None:
    score = {c["name"]: c["score"] for c in cases}["러우 2022"]
    assert round(score, 1) == 142.3
    assert round(score) == 142
