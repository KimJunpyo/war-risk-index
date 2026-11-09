"""GDELT 1.0 일별 파일에서 전 세계 국가별 갈등 언급량과 촉매 사건(모든 국가 쌍)을 수집.

국가 = 사건의 행위자1 또는 행위자2 국가. 같은 사건에서 한 나라를 두 번 세지 않는다(내전: A1=A2).
중단돼도 다시 실행하면 COUNTRY_FILE 에 있는 파일 키는 건너뛴다.
"""

import csv
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd

from gdelt_collect import (COL_A1, COL_A2, COL_CODE, COL_MENTIONS, COL_QUAD, COL_ROOT, CONFLICT_QUADS,
                           DAILY_START, TMP_DIR, WORKERS, load_events, url_for)

COUNTRY_FILE = Path("data/gdelt_country_daily.csv")
CATALYST_ALL_FILE = Path("data/gdelt_catalyst_all.csv")
COUNTRY_FIELDS = ["key", "country", "conflict_mentions", "mentions", "total_mentions"]
CAT_FIELDS = ["key", "src", "dst", "type", "mentions", "events"]
CATALYST_TYPES = ["군사력 위협", "최후통첩", "무력 시위"]  # gdelt_collect.catalyst_type 과 같은 분류


def catalyst_types(df: pd.DataFrame) -> pd.Series:
    """gdelt_collect.catalyst_type 의 벡터화 버전 (전 세계 행 수가 많아서)."""
    code, root = df[COL_CODE], df[COL_ROOT]
    conds = [code.str.startswith("138"), code.str.startswith("139"), root == "15"]
    return pd.Series(np.select(conds, CATALYST_TYPES, default=""), index=df.index).replace("", None)


def aggregate(df: pd.DataFrame, key: str) -> tuple[list[dict], list[dict]]:
    """사건 표 → (국가별 집계 행, 국가 쌍별 촉매 행)."""
    mentions = pd.to_numeric(df[COL_MENTIONS], errors="coerce").fillna(0)
    conflict = pd.to_numeric(df[COL_QUAD], errors="coerce").isin(CONFLICT_QUADS)
    total = int(mentions.sum())

    long = pd.concat([df[COL_A1], df[COL_A2]]).rename("country").reset_index()
    long = long[long["country"] != ""].drop_duplicates()
    long["m"] = mentions[long["index"]].to_numpy()
    long["cm"] = long["m"] * conflict[long["index"]].to_numpy()
    g = long.groupby("country")[["cm", "m"]].sum()
    rows = [{"key": key, "country": c, "conflict_mentions": int(cm), "mentions": int(m), "total_mentions": total}
            for c, cm, m in g.itertuples()]

    sub = df.assign(type=catalyst_types(df), m=mentions).dropna(subset=["type"])
    sub = sub[(sub[COL_A1] != "") | (sub[COL_A2] != "")]
    cg = sub.groupby([COL_A1, COL_A2, "type"])["m"].agg(["sum", "count"]).reset_index()
    cat_rows = [{"key": key, "src": s, "dst": d, "type": t, "mentions": int(m), "events": int(n)}
                for s, d, t, m, n in cg.itertuples(index=False)]
    return rows, cat_rows


def process(key: str) -> tuple[list[dict], list[dict]]:
    return aggregate(load_events(url_for(key), TMP_DIR / f"c{key}.zip"), key)


def self_check() -> None:
    df = pd.DataFrame({COL_A1: ["KOR", "SDN", "USA", ""], COL_A2: ["PRK", "SDN", "", "IRN"],
                       COL_CODE: ["138", "190", "139", "150"], COL_ROOT: ["13", "19", "13", "15"],
                       COL_QUAD: ["3", "4", "3", "1"], COL_MENTIONS: ["10", "5", "2", "4"]})
    rows, cats = aggregate(df, "20250101")
    by = {r["country"]: r for r in rows}
    assert by["SDN"]["mentions"] == 5  # 내전은 한 번만
    assert by["KOR"]["conflict_mentions"] == 10 and by["IRN"]["conflict_mentions"] == 0
    assert all(r["total_mentions"] == 21 for r in rows)
    assert {(c["src"], c["dst"], c["type"]) for c in cats} == {
        ("KOR", "PRK", "군사력 위협"), ("USA", "", "최후통첩"), ("", "IRN", "무력 시위")}


def main() -> None:
    self_check()
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    done = set(pd.read_csv(COUNTRY_FILE, dtype=str, usecols=["key"])["key"]) if COUNTRY_FILE.exists() else set()
    yesterday = pd.Timestamp.today().normalize() - pd.Timedelta(days=1)
    todo = [d.strftime("%Y%m%d") for d in pd.date_range(DAILY_START, yesterday)]
    todo = [k for k in todo if k not in done]
    print(f"남은 파일 {len(todo)}개", flush=True)

    header, cat_header = not COUNTRY_FILE.exists(), not CATALYST_ALL_FILE.exists()
    with (open(COUNTRY_FILE, "a", newline="", encoding="utf-8") as f,
          open(CATALYST_ALL_FILE, "a", newline="", encoding="utf-8") as cf,
          ThreadPoolExecutor(WORKERS) as pool):
        writer, cat_writer = csv.DictWriter(f, COUNTRY_FIELDS), csv.DictWriter(cf, CAT_FIELDS)
        if header:
            writer.writeheader()
        if cat_header:
            cat_writer.writeheader()
        futures = {pool.submit(process, k): k for k in todo}
        for i, fut in enumerate(futures, 1):
            try:
                rows, cat_rows = fut.result()
            except Exception as e:  # 기록이 안 남으므로 재실행 시 다시 시도
                print(f"[실패] {futures[fut]}: {e}", flush=True)
                continue
            # 촉매를 먼저 쓰고 국가 행(완료 표시)을 나중에 씀
            cat_writer.writerows(cat_rows)
            cf.flush()
            writer.writerows(rows)
            f.flush()
            if i % 50 == 0 or i == len(todo):
                print(f"{i}/{len(todo)} 처리", flush=True)


if __name__ == "__main__":
    main()
