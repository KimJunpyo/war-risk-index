"""UCDP 조직적 폭력 사건(GED) → 국가·월별 사망자 집계.

API 는 토큰(이메일 신청)이 필요해, 공개 다운로드 파일을 쓴다.
- GED 확정판(연 1회, 전년도 말까지) + Candidate GED 올해 누적본(월 1회, 약 1개월 지연)
- 다운로드 페이지에서 최신 파일명을 찾아 새 버전일 때만 받는다.
"""

import re
import shutil
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd
import pycountry

import atomic_write

DOWNLOADS_URL = "https://ucdp.uu.se/downloads/"
UCDP_DIR = Path("data/ucdp")
MONTHLY_FILE = Path("data/ucdp_country_monthly.csv")
GED_PATTERN = r"https://ucdp\.uu\.se/downloads/ged/ged\d+-csv\.zip"
# 올해 누적 후보판: GEDEvent_v26_01_26_09.csv (26년 1월~9월)
CANDIDATE_PATTERN = r"https://ucdp\.uu\.se/downloads/candidateged/GEDEvent_v\d+_01_\d+_\d+\.csv"
COLUMNS = ["id", "type_of_violence", "country", "date_start", "date_end", "best", "side_a", "side_b"]
TEXT_COLUMNS = ["country", "date_start", "date_end", "side_a", "side_b"]  # 문자열로 읽는 열. 숫자 열은 추론에 맡긴다
OPPONENT_FILE = Path("data/ucdp_opponents_monthly.csv")
GOV_PREFIX = "Government of "
UNKNOWN_PREFIX = "XXX"  # UCDP 의 신원 미상 행위자 코드
TYPE_NAMES = {1: "state", 2: "nonstate", 3: "onesided"}  # 국가 간·정부 대 반군 / 비국가 간 / 민간인 대상
TIMEOUT_SECONDS = 60

# UCDP 국가명(괄호 앞) → ISO alpha-3. pycountry 로 못 찾는 이름만
NAME_TO_ISO = {
    "Bosnia-Herzegovina": "BIH", "Ivory Coast": "CIV", "Kingdom of eSwatini": "SWZ", "DR Congo": "COD",
    "Congo": "COG", "Russia": "RUS", "Laos": "LAO", "Iran": "IRN", "Syria": "SYR", "Turkey": "TUR",
    "Moldova": "MDA", "Tanzania": "TZA", "Venezuela": "VEN", "Bolivia": "BOL",
    "United States of America": "USA", "Cambodia": "KHM", "Madagascar": "MDG", "Myanmar": "MMR",
    "Serbia": "SRB", "Yemen": "YEM", "Zimbabwe": "ZWE", "Vietnam": "VNM", "South Korea": "KOR",
    "North Korea": "PRK", "Taiwan": "TWN", "Czech Republic": "CZE", "Macedonia, FYR": "MKD",
}


def to_iso3(name: str) -> str | None:
    base = re.sub(r"\s*\(.*\)$", "", name).strip()
    if base in NAME_TO_ISO:
        return NAME_TO_ISO[base]
    try:
        return pycountry.countries.lookup(base).alpha_3
    except LookupError:
        return None


def _parties(side: str) -> list[str]:
    """'Government of Israel, Government of United States of America' → 당사자 목록. 미상(XXX…)은 제외."""
    return [p.strip() for p in str(side).split(", ") if p.strip() and not p.startswith(UNKNOWN_PREFIX)]


def _gov_iso3(party: str) -> str | None:
    return to_iso3(party[len(GOV_PREFIX):]) if party.startswith(GOV_PREFIX) else None


def opponents(events: pd.DataFrame) -> pd.DataFrame:
    """국가 관련 교전(type 1) → 정부별 교전 상대 (iso3, month, opponent, opponent_iso3, deaths).

    상대가 다른 정부면 opponent_iso3 가 있고(국가 간), 무장단체면 비어 있음(내전).
    한 사건에 상대가 여럿이면 사망자를 각 상대에 모두 붙인다(상대 순위용이라 합계에 쓰지 않음).
    """
    e = events[events["type_of_violence"] == 1].drop_duplicates("id", keep="last")
    # 사망자는 더하기만 하므로 같은 (양측, 월, 나라) 사건을 먼저 합쳐 아래 루프를 줄인다(사건마다 돈 결과와 같음)
    e = (e.assign(month=e["date_start"].map(lambda s: str(s)[:7]))
         .groupby(["side_a", "side_b", "month", "country"], dropna=False)["best"].sum().reset_index())
    rows = []
    for a, b, month, deaths, where in zip(e["side_a"], e["side_b"], e["month"], e["best"], e["country"]):
        sa, sb = _parties(a), _parties(b)
        for us, them in ((sa, sb), (sb, sa)):
            for gov in filter(None, map(_gov_iso3, us)):
                rows += [{"iso3": gov, "month": month, "opponent": t, "opponent_iso3": _gov_iso3(t), "deaths": deaths}
                         for t in them]
        # 자국 정부가 당사자가 아닌 자국 영토 교전(예: 레바논 땅의 이스라엘-헤즈볼라) → 외국 정부를 상대국으로
        loc = to_iso3(where)
        govs = {g for g in map(_gov_iso3, sa + sb) if g}
        rows += [{"iso3": loc, "month": month, "opponent": GOV_PREFIX + g, "opponent_iso3": g, "deaths": deaths}
                 for g in govs if loc and loc not in govs]
    out = pd.DataFrame(rows, columns=["iso3", "month", "opponent", "opponent_iso3", "deaths"])
    return out.groupby(["iso3", "month", "opponent", "opponent_iso3"], dropna=False)["deaths"].sum().reset_index()


def load_opponents() -> pd.DataFrame:
    if not OPPONENT_FILE.exists():
        return pd.DataFrame(columns=["iso3", "month", "opponent", "opponent_iso3", "deaths"])
    return pd.read_csv(OPPONENT_FILE)


def latest_urls() -> list[str]:
    with urllib.request.urlopen(DOWNLOADS_URL, timeout=TIMEOUT_SECONDS) as r:
        html = r.read().decode("utf-8", "replace")
    urls = []
    for pattern in (GED_PATTERN, CANDIDATE_PATTERN):
        found = sorted(set(re.findall(pattern, html)))
        if found:
            urls.append(found[-1])  # 파일명 정렬 = 버전 순
    return urls


def aggregate(events: pd.DataFrame) -> pd.DataFrame:
    """사건 → (iso3, month, type, deaths, events). 후보판·확정판 중복 사건은 id 로 제거."""
    e = events.drop_duplicates("id", keep="last").copy()
    e["iso3"] = e["country"].map(to_iso3)
    e["month"] = pd.to_datetime(e["date_start"]).dt.strftime("%Y-%m")
    e["type"] = e["type_of_violence"].map(TYPE_NAMES)
    out = (e.dropna(subset=["iso3", "type"])
           .groupby(["iso3", "month", "type"])["best"].agg(deaths="sum", events="count").reset_index())
    out.attrs["as_of"] = pd.to_datetime(e["date_end"]).max().strftime("%Y-%m-%d")
    return out


def _read_events(path: Path) -> pd.DataFrame:
    """GED 파일 → 사건 표(COLUMNS 열). zip(확정판)은 zipfile 로 연 핸들을 넘긴다.

    zip 경로를 그대로 넘기면 pandas 가 압축(풀면 261MB)을 통째로 풀고, low_memory=False 는 49열을 한 번에 토큰화해
    월 1회 재집계의 최대 메모리가 1GB 를 넘었다(#47).
    """
    dtype = dict.fromkeys(TEXT_COLUMNS, str)
    if path.suffix != ".zip":
        return pd.read_csv(path, usecols=COLUMNS, dtype=dtype)
    with zipfile.ZipFile(path) as z:
        names = [n for n in z.namelist() if n.lower().endswith(".csv")]
        if len(names) != 1:
            raise ValueError(f"{path}: zip 안 CSV 가 1개가 아님 {names}")
        with z.open(names[0]) as f:
            return pd.read_csv(f, usecols=COLUMNS, dtype=dtype)


def update(force: bool = False) -> bool:
    """새 버전 파일이 있으면 받아서 월별 집계를 다시 만든다. 갱신했으면 True."""
    UCDP_DIR.mkdir(parents=True, exist_ok=True)
    urls = latest_urls()
    paths = [UCDP_DIR / u.rsplit("/", 1)[1] for u in urls]
    new = [(u, p) for u, p in zip(urls, paths) if not p.exists()]
    if not new and MONTHLY_FILE.exists() and not force:
        return False
    for u, p in new:
        tmp = p.with_suffix(p.suffix + ".part")
        with urllib.request.urlopen(u, timeout=TIMEOUT_SECONDS) as r, open(tmp, "wb") as f:
            shutil.copyfileobj(r, f)
            size = int(r.headers.get("Content-Length", 0))
            # urlopen 은 Content-Length 보다 덜 받고 끊겨도 예외를 내지 않는다. 잘린 파일이 남으면 다음 실행이 건너뜀
            if f.tell() < size:
                raise urllib.error.ContentTooShortError(f"{u}: {size} 바이트 중 {f.tell()} 바이트만 받음", (str(tmp), r.headers))
        tmp.replace(p)  # 파일을 닫은 뒤 교체(Windows 는 열린 파일을 교체하지 못함)
    # 확정판 먼저, 후보판 나중 (같은 id 는 후보판 값 사용)
    events = pd.concat([_read_events(p) for p in paths], ignore_index=True)
    out = aggregate(events)
    atomic_write.write_csv(out, MONTHLY_FILE, index=False, encoding="utf-8")
    atomic_write.write_csv(opponents(events), OPPONENT_FILE, index=False, encoding="utf-8")
    atomic_write.write_text(Path(str(MONTHLY_FILE) + ".asof"), out.attrs["as_of"], encoding="utf-8")
    unmapped = sorted(set(events["country"]) - {n for n in events["country"].unique() if to_iso3(n)})
    print(f"UCDP 갱신: {', '.join(p.name for p in paths)} · 기준일 {out.attrs['as_of']} · 매핑 실패 {unmapped}")
    return True


def load() -> tuple[pd.DataFrame, str | None]:
    """(월별 집계, 기준일). 파일이 없으면 빈 표."""
    if not MONTHLY_FILE.exists():
        return pd.DataFrame(columns=["iso3", "month", "type", "deaths", "events"]), None
    asof = Path(str(MONTHLY_FILE) + ".asof")
    return pd.read_csv(MONTHLY_FILE), asof.read_text(encoding="utf-8") if asof.exists() else None


def self_check() -> None:
    assert to_iso3("Russia (Soviet Union)") == "RUS" and to_iso3("DR Congo (Zaire)") == "COD"
    assert to_iso3("Ukraine") == "UKR" and to_iso3("Kingdom of eSwatini (Swaziland)") == "SWZ"
    ev = pd.DataFrame({"id": [1, 2, 2, 3], "type_of_violence": [1, 1, 1, 3],
                       "country": ["Ukraine", "Ukraine", "Ukraine", "Sudan"],
                       "date_start": ["2026-01-05", "2026-01-09", "2026-01-09", "2026-02-01"],
                       "date_end": ["2026-01-05", "2026-01-09", "2026-01-09", "2026-02-03"],
                       "best": [10, 5, 7, 3]})
    ev["side_a"] = ["Government of Russia (Soviet Union)", "Government of Ukraine", "Government of Ukraine",
                    "Government of Sudan"]
    ev["side_b"] = ["Government of Ukraine", "XXX1, Government of Russia (Soviet Union)",
                    "XXX1, Government of Russia (Soviet Union)", "RSF"]
    o = opponents(ev)
    assert set(o.loc[o["iso3"] == "UKR", "opponent_iso3"]) == {"RUS"}
    assert o.loc[o["iso3"] == "UKR", "deaths"].sum() == 17  # 미상(XXX) 제외, 중복 id 는 마지막 값
    assert "SDN" not in set(o["iso3"])  # type 3(민간인 대상)은 제외
    lb = opponents(pd.DataFrame({"id": [9], "type_of_violence": [1], "country": ["Lebanon"],
                                 "date_start": ["2026-03-01"], "best": [50],
                                 "side_a": ["Government of Israel"], "side_b": ["Hezbollah"]}))
    assert lb.loc[lb["iso3"] == "LBN", "opponent_iso3"].tolist() == ["ISR"]  # 자국 영토 외국 교전
    a = aggregate(ev)
    assert a.loc[a["iso3"] == "UKR", "deaths"].item() == 17  # 중복 id 는 마지막 값
    assert a.attrs["as_of"] == "2026-02-03"


if __name__ == "__main__":
    self_check()
    update(force=True)
