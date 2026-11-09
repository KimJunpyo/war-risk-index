"""11개 사례(case_backtest.CASES)의 T-0 직전 기사 확보 가능성 측정.

1) GDELT 1.0 일별 export 에서 해당 쌍 사건의 SOURCEURL 을 뽑아 data/case_articles/urls.csv 에 저장
2) 사례별로 SAMPLE_PER_CASE 개를 골라 원 URL → (실패 시) Wayback 스냅샷 순으로 다시 받아
   제목·요약(meta description)을 data/case_articles/articles.jsonl 에 저장하고 성공률을 출력

python case_articles.py urls      → 1 단계
python case_articles.py sample    → 2 단계 (+ 성공률 표)
"""

import csv
import html
import json
import random
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd

from case_backtest import CASES
from gdelt_collect import DYADS, TMP_DIR, in_pair, url_for

OUT_DIR = Path("data/case_articles")
URLS_FILE = OUT_DIR / "urls.csv"
ARTICLES_FILE = OUT_DIR / "articles.jsonl"
WINDOW_DAYS = 14   # T-14 ~ T-1
DAY_STEP = 2       # shortcut: 이틀에 하루만 받음(다운로드 절반). 시범 표본이 모자라면 1 로
SAMPLE_PER_CASE = 25
SEED = 0
GDELT_WORKERS = 4
FETCH_WORKERS = 16
WAYBACK_WORKERS = 2
TIMEOUT_SECONDS = 15
MAX_BYTES = 1_500_000
MIN_TITLE_CHARS = 10
USER_AGENT = "Mozilla/5.0 (war-risk-index research)"
WAYBACK = "https://web.archive.org/web/{ts}id_/{url}"  # id_ = 원본 HTML 그대로
WAYBACK_API = "https://archive.org/wayback/available?url={url}&timestamp={ts}"

# GDELT 1.0 열 (0부터): 날짜, 행위자1·2 국가, 사분면, 언급 수, SOURCEURL
COL_DATE, COL_A1, COL_A2, COL_QUAD, COL_MENTIONS, COL_URL = 1, 7, 17, 29, 31, 57


def window_days(t0: str) -> list[pd.Timestamp]:
    t = pd.Timestamp(t0)
    return [t - pd.Timedelta(days=d) for d in range(1, WINDOW_DAYS + 1, DAY_STEP)]


def day_urls(day: pd.Timestamp, dyads: list[str]) -> list[dict]:
    key = day.strftime("%Y%m%d")
    tmp = TMP_DIR / f"ca_{key}.zip"
    try:
        urllib.request.urlretrieve(url_for(key), tmp)
        df = pd.read_csv(tmp, sep="\t", header=None, compression="zip", dtype=str, quoting=csv.QUOTE_NONE,
                         usecols=[COL_DATE, COL_A1, COL_A2, COL_QUAD, COL_MENTIONS, COL_URL]).fillna("")
    finally:
        tmp.unlink(missing_ok=True)
    rows = []
    for name in dyads:
        sub = df[in_pair(df, *DYADS[name]) & df[COL_URL].str.startswith("http")]
        for url, g in sub.groupby(COL_URL):
            rows.append({"day": key, "dyad": name, "url": url,
                         "conflict": int(g[COL_QUAD].isin(["3", "4"]).any()),
                         "mentions": int(pd.to_numeric(g[COL_MENTIONS], errors="coerce").fillna(0).sum())})
    return rows


def collect_urls() -> pd.DataFrame:
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    jobs = [(name, day, dyads) for name, _, t0, dyads in CASES for day in window_days(t0)]
    with ThreadPoolExecutor(GDELT_WORKERS) as ex:
        results = list(ex.map(lambda j: [{"case": j[0], **r} for r in day_urls(j[1], j[2])], jobs))
    df = pd.DataFrame([r for rs in results for r in rs])
    df.to_csv(URLS_FILE, index=False, encoding="utf-8")
    return df


def _charset(raw: bytes, header: str | None) -> str:
    m = re.search(rb'charset=["\']?([\w-]+)', raw[:4000])
    return header or (m.group(1).decode() if m else "utf-8")


def _meta(page: str, *names: str) -> str:
    for n in names:
        for pat in (rf'<meta[^>]+(?:property|name)=["\']{n}["\'][^>]+content=["\']([^"\']*)',
                    rf'<meta[^>]+content=["\']([^"\']*)["\'][^>]+(?:property|name)=["\']{n}["\']'):
            m = re.search(pat, page, re.I)
            if m and m.group(1).strip():
                return " ".join(html.unescape(m.group(1)).split())
    return ""


def extract(page: str) -> tuple[str, str]:
    """(제목, 요약). og 태그 우선, 없으면 <title>."""
    title = _meta(page, "og:title", "twitter:title")
    if not title:
        m = re.search(r"<title[^>]*>(.*?)</title>", page, re.I | re.S)
        title = " ".join(html.unescape(m.group(1)).split()) if m else ""
    return title, _meta(page, "og:description", "description", "twitter:description")


def get_page(url: str) -> tuple[str, str]:
    """(본문 HTML, 최종 URL). 실패하면 예외."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        raw = resp.read(MAX_BYTES)
        return raw.decode(_charset(raw, resp.headers.get_content_charset()), errors="replace"), resp.geturl()


def is_article(url: str, final_url: str, title: str) -> bool:
    """홈페이지로 튕기거나 제목이 없으면 기사 확보 실패로 본다."""
    path = urllib.parse.urlparse(final_url).path.strip("/")
    return len(title) >= MIN_TITLE_CHARS and (bool(path) or not urllib.parse.urlparse(url).path.strip("/"))


def wayback_url(url: str, day: str) -> str:
    """가장 가까운 스냅샷의 https 원본(id_) 주소. 웹 아카이브의 http 리디렉트는 이 망에서 막혀 있어 직접 만든다."""
    api = WAYBACK_API.format(url=urllib.parse.quote(url, safe=""), ts=day)
    with urllib.request.urlopen(urllib.request.Request(api, headers={"User-Agent": USER_AGENT}), timeout=TIMEOUT_SECONDS) as r:
        snap = json.load(r)["archived_snapshots"]["closest"]
    return WAYBACK.format(ts=snap["timestamp"], url=url)


def fetch_article(row: dict) -> dict:
    out = {**row, "source": "", "title": "", "summary": "", "error": ""}
    attempts = [("direct", lambda: row["url"]), ("wayback", lambda: wayback_url(row["url"], row["day"]))]
    for source, make_url in attempts:
        try:
            url = make_url()
            page, final = get_page(url)
            title, summary = extract(page)
            if source == "wayback" or is_article(row["url"], final, title):
                if len(title) >= MIN_TITLE_CHARS:
                    return {**out, "source": source, "title": title, "summary": summary, "error": ""}
            out["error"] = f"{source}: 기사 아님"
        except Exception as e:  # 네트워크·디코딩 오류 모두 실패로 기록
            out["error"] = f"{source}: {type(e).__name__}"[:80]
    return out


def sample(per_case: int = SAMPLE_PER_CASE) -> pd.DataFrame:
    urls = pd.read_csv(URLS_FILE, dtype={"day": str})
    rng = random.Random(SEED)
    picks = []
    for name, *_ in CASES:
        pool = urls[(urls["case"] == name) & (urls["conflict"] == 1)].drop_duplicates("url").to_dict("records")
        picks += rng.sample(pool, min(per_case, len(pool)))
    with ThreadPoolExecutor(FETCH_WORKERS) as ex:
        rows = list(ex.map(fetch_article, picks))
    # archive.org 는 동시 접속이 많으면 연결을 끊으므로 실패분만 적은 동시성으로 다시 시도
    retry = [i for i, r in enumerate(rows) if not r["source"]]
    with ThreadPoolExecutor(WAYBACK_WORKERS) as ex:
        for i, r in zip(retry, ex.map(fetch_article, [picks[i] for i in retry])):
            rows[i] = r
    with ARTICLES_FILE.open("w", encoding="utf-8") as fp:
        for r in rows:
            fp.write(json.dumps(r, ensure_ascii=False) + "\n")
    df = pd.DataFrame(rows)
    pool_n = urls[urls["conflict"] == 1].drop_duplicates(["case", "url"]).groupby("case").size()
    table = df.assign(direct=df["source"] == "direct", wayback=df["source"] == "wayback",
                      ok=df["source"] != "", has_summary=df["summary"] != "").groupby("case", sort=False)[
        ["direct", "wayback", "ok", "has_summary"]].mean().round(2)
    table.insert(0, "gdelt_urls", pool_n.reindex(table.index))
    table.insert(1, "sampled", df.groupby("case", sort=False).size())
    return table


def self_check() -> None:
    page = ('<html><head><title>Old &amp; title</title><meta content="Desc here" property="og:description">'
            '<meta property="og:title" content="Missile test raises tension"></head></html>')
    assert extract(page) == ("Missile test raises tension", "Desc here")
    assert extract("<title> A  b </title>") == ("A b", "")
    assert is_article("http://x.com/a/1", "http://x.com/a/1", "Long enough title")
    assert not is_article("http://x.com/a/1", "http://x.com/", "Long enough title")  # 홈으로 리디렉트
    assert not is_article("http://x.com/a/1", "http://x.com/a/1", "short")
    assert len(window_days("2022-02-24")) == WINDOW_DAYS // DAY_STEP
    assert window_days("2022-02-24")[0] == pd.Timestamp("2022-02-23")


if __name__ == "__main__":
    self_check()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "sample"
    if cmd == "urls":
        print(collect_urls().groupby("case").size())
    elif cmd == "sample":
        print(sample(int(sys.argv[2]) if len(sys.argv) > 2 else SAMPLE_PER_CASE).to_string())
