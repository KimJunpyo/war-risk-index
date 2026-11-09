"""정부 여행경보 → 국가(ISO alpha-3)별 단계·발표일·사유 요약.

키 없이 받을 수 있는 공식 출처만 쓴다.
- 미 국무부 Travel Advisories JSON (1~4단계, 공식 단계)
- 영국 FCDO 해외여행 안내 (GOV.UK Content API). 공식 숫자 단계가 없어 alert_status 를 1~4로 환산한다.
한국 외교부 여행경보(공공데이터포털)는 serviceKey 가 필요해 제외했다.
점수 공식에는 넣지 않는 별도 신호다(과거 이력이 없어 검증 불가).
"""

import html
import json
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import pycountry

import ucdp

ADVISORY_FILE = Path("data/travel_advisory.csv")
US_URL = "https://cadataapi.state.gov/api/TravelAdvisories"
UK_INDEX_URL = "https://www.gov.uk/api/content/foreign-travel-advice"
USER_AGENT = "war-risk-index/0.1"  # 기본 urllib UA 는 Cloudflare 에 막힐 수 있음
TIMEOUT_SECONDS = 60
REFRESH_SECONDS = 20 * 3600  # 파일이 이보다 새로우면 다시 받지 않음(하루 1회)
UK_WORKERS = 3  # GOV.UK Content API 한도 초당 10회 아래로
SUMMARY_MAX = 200
COLUMNS = ["iso3", "source", "level", "label", "date", "summary", "url"]
SOURCES = {"us_state": "미 국무부", "uk_fcdo": "영국 FCDO"}
MAX_LEVEL = 4

# 미 국무부 링크의 자체 코드(destination.xxx.html) 중 ISO 가 아닌 것
US_CODE_TO_ISO = {"XGZ": "PSE", "XWB": "PSE", "XKS": "XKX", "XQX": "BES"}
# 국가명 → ISO. pycountry·ucdp.to_iso3 로 못 찾는 이름만
NAME_TO_ISO = {
    "Kosovo": "XKX", "Tonga": "TON", "Saba and Sint Eustatius": "BES", "Bonaire": "BES",
    "The Gambia": "GMB", "Gambia": "GMB", "Cape Verde": "CPV", "Brunei": "BRN", "Micronesia": "FSM",
    "Democratic Republic of the Congo": "COD", "Republic of the Congo": "COG", "Congo": "COG",
    "Israel, the West Bank and Gaza": "ISR", "The Occupied Palestinian Territories": "PSE",
    "St Kitts and Nevis": "KNA", "St Lucia": "LCA", "St Vincent and the Grenadines": "VCT",
    "St Helena, Ascension and Tristan da Cunha": "SHN", "St Maarten": "SXM", "St Martin": "MAF",
    "St Pierre & Miquelon": "SPM", "St Barthélemy": "BLM", "Curaçao": "CUW", "Turkey": "TUR",
    "British Virgin Islands": "VGB", "Pitcairn Island": "PCN", "South Korea": "KOR", "North Korea": "PRK",
    "Burma": "MMR", "Macau": "MAC", "Macao": "MAC", "Mainland China": "CHN",
    "Palestine": "PSE", "São Tomé and Principe": "STP", "Falkland Islands": "FLK",
    "Bonaire/St Eustatius/Saba": "BES", "St Martin and St Barthélemy": "MAF",
    "Cook Islands, Tokelau and Niue": "COK", "Antarctica/British Antarctic Territory": "ATA",
}
# FCDO alert_status → 1~4 (자체 환산: 전역 전면 금지 4, 전역 필수 외 금지 3, 일부 지역 금지 2, 없음 1)
UK_STATUS_LEVEL = {
    "avoid_all_travel_to_whole_country": 4, "avoid_all_but_essential_travel_to_whole_country": 3,
    "avoid_all_travel_to_parts": 2, "avoid_all_but_essential_travel_to_parts": 2,
}
UK_STATUS_KO = {
    "avoid_all_travel_to_whole_country": "전역 모든 여행 자제 권고",
    "avoid_all_but_essential_travel_to_whole_country": "전역 필수 외 여행 자제 권고",
    "avoid_all_travel_to_parts": "일부 지역 모든 여행 자제 권고",
    "avoid_all_but_essential_travel_to_parts": "일부 지역 필수 외 여행 자제 권고",
}


def _get_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as r:
        return json.loads(r.read().decode("utf-8"))


def name_to_iso3(name: str) -> str | None:
    name = name.strip()
    if name in NAME_TO_ISO:
        return NAME_TO_ISO[name]
    if c := pycountry.countries.get(name=name):
        return c.alpha_3
    return ucdp.to_iso3(name)


def _plain(text: str) -> str:
    """HTML → 첫 문장 요약."""
    t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text or ""))).strip()
    t = re.sub(r"\s+([.,])", r"\1", t)
    first = re.split(r"(?<=\.)\s", t, maxsplit=1)[0]
    return first[:SUMMARY_MAX]


def parse_us(items: list[dict]) -> tuple[list[dict], list[str]]:
    rows, failed = [], []
    for x in items:
        title = x.get("Title", "")
        lv = re.search(r"Level (\d)", title)
        m = re.search(r"destination\.([a-z]{3})\.html", x.get("Link", ""))
        code = m.group(1).upper() if m else None
        iso3 = US_CODE_TO_ISO.get(code) if code in US_CODE_TO_ISO else (
            code if code and pycountry.countries.get(alpha_3=code) else name_to_iso3(title.split(" - ")[0]))
        if not (iso3 and lv):
            failed.append(title)
            continue
        rows.append({"iso3": iso3, "source": "us_state", "level": int(lv.group(1)),
                     "label": title.split(": ", 1)[-1], "date": (x.get("Updated") or x.get("Published", ""))[:10],
                     "summary": _plain(x.get("Summary", "")), "url": x.get("Link")})
    return rows, failed


def parse_uk(doc: dict) -> dict | None:
    """국가별 FCDO 문서 1건 → 행. 매핑 실패면 iso3=None."""
    d = doc.get("details", {})
    statuses = d.get("alert_status") or []
    level = max([UK_STATUS_LEVEL.get(s, 1) for s in statuses], default=1)
    name = d.get("country", {}).get("name") or doc.get("title", "")
    return {"iso3": name_to_iso3(name), "source": "uk_fcdo", "level": level,
            "label": " · ".join(UK_STATUS_KO.get(s, s) for s in statuses) or "경보 없음",
            "date": (doc.get("public_updated_at") or "")[:10],
            "summary": (d.get("change_description") or "").strip()[:SUMMARY_MAX],
            "url": "https://www.gov.uk" + doc.get("base_path", ""), "name": name}


def fetch_us() -> tuple[list[dict], list[str]]:
    return parse_us(_get_json(US_URL))


def fetch_uk() -> tuple[list[dict], list[str]]:
    children = _get_json(UK_INDEX_URL)["links"]["children"]

    def one(ch: dict) -> dict | None:
        try:
            return parse_uk(_get_json(ch["api_url"]))
        except Exception:
            return None  # 한 나라 실패는 건너뜀
    with ThreadPoolExecutor(UK_WORKERS) as ex:
        docs = list(ex.map(one, children))
    if sum(d is None for d in docs) > len(children) / 2:
        raise RuntimeError("FCDO 문서 절반 이상 수신 실패")
    rows = [d for d in docs if d and d["iso3"]]
    failed = [d["name"] for d in docs if d and not d["iso3"]]
    return [{k: r[k] for k in COLUMNS} for r in rows], failed


def dedupe(df: pd.DataFrame) -> pd.DataFrame:
    """같은 출처·국가에 여러 지역(예: 가자·서안)이 있으면 가장 높은 단계 하나만."""
    return (df.sort_values(["level", "date"], ascending=False)
            .drop_duplicates(["iso3", "source"])
            .sort_values(["iso3", "source"], ascending=[True, False]).reset_index(drop=True))  # 미 국무부 먼저


def load() -> pd.DataFrame:
    return pd.read_csv(ADVISORY_FILE, keep_default_na=False, na_values=[""]) if ADVISORY_FILE.exists() \
        else pd.DataFrame(columns=COLUMNS)


def update(force: bool = False) -> bool:
    """하루 1회 받아 저장. 출처 하나가 실패하면 그 출처는 직전 값을 유지. 갱신했으면 True."""
    if not force and ADVISORY_FILE.exists() and time.time() - ADVISORY_FILE.stat().st_mtime < REFRESH_SECONDS:
        return False
    old = load()
    frames = []
    for source, fetch in (("us_state", fetch_us), ("uk_fcdo", fetch_uk)):
        try:
            rows, failed = fetch()
            frames.append(pd.DataFrame(rows, columns=COLUMNS))
            print(f"여행경보 {SOURCES[source]}: {len(rows)}건 · 매핑 실패 {failed}")
        except Exception as e:
            frames.append(old[old["source"] == source])
            print(f"여행경보 {SOURCES[source]} 수신 실패, 직전 값 유지: {e}")
    ADVISORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = ADVISORY_FILE.with_suffix(".csv.part")
    dedupe(pd.concat(frames, ignore_index=True)).to_csv(tmp, index=False, encoding="utf-8")
    tmp.replace(ADVISORY_FILE)  # 실패하면 mtime 이 안 바뀌어 다음 주기에 재시도
    return True


def by_iso3(df: pd.DataFrame) -> dict[str, list[dict]]:
    """API 용: 저장 표 → iso3 → [{source, name, level, max_level, label, date, summary, url}]."""
    out: dict[str, list[dict]] = {}
    for r in df.astype(object).where(df.notna(), None).to_dict("records"):
        out.setdefault(r["iso3"], []).append({
            "source": r["source"], "name": SOURCES.get(r["source"], r["source"]), "level": int(r["level"]),
            "max_level": MAX_LEVEL, "label": r["label"], "date": r["date"], "summary": r["summary"], "url": r["url"]})
    return out


def self_check() -> None:
    us = [{"Title": "Iran - Level 4: Do Not Travel", "Link": "https://x/destination.irn.html",
           "Summary": "Do not travel<p>to <b>Iran </b>due to <b>terrorism</b>. Read more.</p>",
           "Updated": "2026-10-22T20:00:00-04:00"},
          {"Title": "Gaza - Level 4: Do Not Travel", "Link": "https://x/destination.xgz.html", "Updated": "2026-01-01"},
          {"Title": "The West Bank - Level 3: Reconsider Travel", "Link": "https://x/destination.xwb.html",
           "Updated": "2026-02-01"},
          {"Title": "Tonga - Level 1: Exercise Normal Precautions", "Link": "https://x/tonga-travel-advisory.html"},
          {"Title": "Atlantis - Level 2: Exercise Increased Caution", "Link": "https://x/atlantis.html"}]
    rows, failed = parse_us(us)
    assert failed == ["Atlantis - Level 2: Exercise Increased Caution"]
    assert rows[0] == {**rows[0], "iso3": "IRN", "level": 4, "date": "2026-10-22", "label": "Do Not Travel"}
    assert rows[0]["summary"] == "Do not travel to Iran due to terrorism.", rows[0]["summary"]
    d = dedupe(pd.DataFrame(rows, columns=COLUMNS))
    assert d.loc[d["iso3"] == "PSE", "level"].tolist() == [4]  # 가자 4 > 서안 3
    assert "TON" in set(d["iso3"])
    uk = parse_uk({"title": "Ukraine travel advice", "base_path": "/foreign-travel-advice/ukraine",
                   "public_updated_at": "2026-10-02T09:30:25+01:00",
                   "details": {"alert_status": ["avoid_all_travel_to_parts"], "country": {"name": "Ukraine"}}})
    assert uk["iso3"] == "UKR" and uk["level"] == 2 and uk["date"] == "2026-10-02"
    assert parse_uk({"details": {"country": {"name": "Russia"},
                                 "alert_status": ["avoid_all_travel_to_whole_country"]}})["level"] == 4
    assert parse_uk({"details": {"country": {"name": "France"}}})["level"] == 1
    assert by_iso3(d)["IRN"][0]["name"] == "미 국무부"
    print("travel_advisory self_check OK")


if __name__ == "__main__":
    self_check()
    update(force=True)
