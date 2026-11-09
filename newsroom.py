"""국가별 뉴스룸(국방·안보 매체, 정부 발표) RSS 목록 관리와 수집.

python newsroom.py probe   → 후보 피드를 실제로 열어 보고 성공한 것만 newsroom.json 에 기록
python newsroom.py fetch   → newsroom.json 의 피드에서 오늘 기사를 data/newsroom/YYYY-MM-DD.jsonl 에 누적
"""

import html
import json
import re
import sys
import urllib.request
# 표준 ElementTree: 외부 엔티티를 해석하지 않음 (backend/app/news.py 와 같은 이유)
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

CONFIG_FILE = Path("newsroom.json")
STORE_DIR = Path("data/newsroom")
TIMEOUT_SECONDS = 15
WORKERS = 8
STALE_DAYS = 14  # 최신 기사가 이보다 오래되면 죽은 피드로 본다
SUMMARY_CHARS = 400  # 요약은 앞부분만 (토큰 절감)
USER_AGENT = "Mozilla/5.0 (war-risk-index research)"
ATOM = "{http://www.w3.org/2005/Atom}"
TAG_RE = re.compile(r"<[^>]+>")  # 요약 속 HTML 태그 제거용

# (국가 ISO3, 매체 이름, 언어, 종류, URL). 종류: media=전문·주요 매체, gov=정부·군 발표
CANDIDATES = [
    # 한국·북한
    ("KOR", "연합뉴스 북한", "ko", "media", "https://www.yna.co.kr/rss/northkorea.xml"),
    ("KOR", "연합뉴스 정치", "ko", "media", "https://www.yna.co.kr/rss/politics.xml"),
    ("KOR", "정책브리핑 국방부", "ko", "gov", "https://www.korea.kr/rss/dept_mnd.xml"),
    ("KOR", "정책브리핑 통일부", "ko", "gov", "https://www.korea.kr/rss/dept_unikorea.xml"),
    ("KOR", "동아일보 정치", "ko", "media", "https://rss.donga.com/politics.xml"),
    ("KOR", "한겨레 정치", "ko", "media", "https://www.hani.co.kr/rss/politics/"),
    ("KOR", "BBC 코리아", "ko", "media", "https://feeds.bbci.co.uk/korean/rss.xml"),
    ("PRK", "Daily NK (한국어)", "ko", "media", "https://www.dailynk.com/feed/"),
    ("PRK", "NK News", "en", "media", "https://www.nknews.org/feed/"),
    ("PRK", "38 North", "en", "media", "https://www.38north.org/feed/"),
    ("PRK", "KCNA Watch", "en", "media", "https://kcnawatch.org/feed/"),
    # 러시아·우크라이나
    ("RUS", "TASS (러시아어)", "ru", "media", "https://tass.ru/rss/v2.xml"),
    ("RUS", "RIA Novosti", "ru", "media", "https://ria.ru/export/rss2/archive/index.xml"),
    ("RUS", "Topwar (군사)", "ru", "media", "https://topwar.ru/rss.xml"),
    ("RUS", "Kommersant", "ru", "media", "https://www.kommersant.ru/RSS/news.xml"),
    ("RUS", "Interfax", "ru", "media", "https://www.interfax.ru/rss.asp"),
    ("RUS", "BBC 러시아어", "ru", "media", "https://feeds.bbci.co.uk/russian/rss.xml"),
    ("RUS", "Meduza", "ru", "media", "https://meduza.io/rss/all"),
    ("RUS", "러시아 국방부", "ru", "gov", "https://function.mil.ru/rss_feeds/reference_to_general.htm?contenttype=xml"),
    ("UKR", "Ukrainska Pravda", "uk", "media", "https://www.pravda.com.ua/rss/"),
    ("UKR", "Ukrinform 전쟁", "uk", "media", "https://www.ukrinform.ua/rss/rubric-ato"),
    ("UKR", "Militarnyi", "uk", "media", "https://mil.in.ua/uk/news/feed/"),
    ("UKR", "BBC 우크라이나어", "uk", "media", "https://feeds.bbci.co.uk/ukrainian/rss.xml"),
    ("UKR", "Kyiv Independent", "en", "media", "https://kyivindependent.com/rss/"),
    # 이스라엘·이란·팔레스타인
    ("ISR", "Ynet (히브리어)", "he", "media", "https://www.ynet.co.il/Integration/StoryRss2.xml"),
    ("ISR", "Maariv (히브리어)", "he", "media", "https://www.maariv.co.il/Rss/RssChadashot"),
    ("ISR", "Times of Israel", "en", "media", "https://www.timesofisrael.com/feed/"),
    ("ISR", "Jerusalem Post", "en", "media", "https://www.jpost.com/rss/rssfeedsfrontpage.aspx"),
    ("ISR", "Haaretz (히브리어)", "he", "media", "https://www.haaretz.co.il/srv/htz---all-articles"),
    ("IRN", "Tasnim (페르시아어)", "fa", "media", "https://www.tasnimnews.com/fa/rss/feed/0/7/0/"),
    ("IRN", "Mehr (페르시아어)", "fa", "media", "https://www.mehrnews.com/rss"),
    ("IRN", "IRNA (페르시아어)", "fa", "gov", "https://www.irna.ir/rss"),
    ("IRN", "ISNA (페르시아어)", "fa", "media", "https://www.isna.ir/rss"),
    ("IRN", "Iran International", "en", "media", "https://www.iranintl.com/en/feed"),
    ("IRN", "BBC 페르시아어", "fa", "media", "https://feeds.bbci.co.uk/persian/rss.xml"),
    ("IRN", "Tasnim (영어)", "en", "media", "https://www.tasnimnews.com/en/rss/feed/0/7/0/all-stories"),
    ("PSE", "Al Jazeera (아랍어)", "ar", "media", "https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9"),
    ("PSE", "BBC 아랍어", "ar", "media", "https://feeds.bbci.co.uk/arabic/rss.xml"),
    ("PSE", "Al Jazeera (영어)", "en", "media", "https://www.aljazeera.com/xml/rss/all.xml"),
    ("PSE", "Middle East Eye", "en", "media", "https://www.middleeasteye.net/rss"),
    ("PSE", "WAFA (아랍어)", "ar", "gov", "https://www.wafa.ps/rss.aspx"),
    # 중국·대만
    ("CHN", "신화사 군사 (중국어)", "zh", "media", "http://www.xinhuanet.com/mil/news_mil.xml"),
    ("CHN", "CGTN 중국", "en", "media", "https://www.cgtn.com/subscribe/rss/section/china.xml"),
    ("CHN", "Global Times", "en", "media", "https://www.globaltimes.cn/rss/outbrain.xml"),
    ("CHN", "China Daily", "en", "media", "http://www.chinadaily.com.cn/rss/china_rss.xml"),
    ("CHN", "BBC 중국어", "zh", "media", "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml"),
    ("CHN", "SCMP 중국", "en", "media", "https://www.scmp.com/rss/4/feed"),
    ("CHN", "인민망 군사 (중국어)", "zh", "media", "http://www.people.com.cn/rss/military.xml"),
    ("TWN", "중앙사 정치 (중국어)", "zh", "media", "https://feeds.feedburner.com/rsscna/politics"),
    ("TWN", "자유시보 정치 (중국어)", "zh", "media", "https://news.ltn.com.tw/rss/politics.xml"),
    ("TWN", "RTI 대만국제방송 (중국어)", "zh", "media", "https://www.rti.org.tw/rss"),
    ("TWN", "Taipei Times", "en", "media", "https://www.taipeitimes.com/xml/index.rss"),
    ("TWN", "연합보 양안 (중국어)", "zh", "media", "https://udn.com/rssfeed/news/2/6640?ch=news"),
    # 인도·파키스탄
    ("IND", "The Hindu", "en", "media", "https://www.thehindu.com/news/national/feeder/default.rss"),
    ("IND", "Indian Express", "en", "media", "https://indianexpress.com/section/india/feed/"),
    ("IND", "BBC 힌디어", "hi", "media", "https://feeds.bbci.co.uk/hindi/rss.xml"),
    ("IND", "Amar Ujala (힌디어)", "hi", "media", "https://www.amarujala.com/rss/breaking-news.xml"),
    ("IND", "NDTV Khabar (힌디어)", "hi", "media", "https://feeds.feedburner.com/ndtvkhabar-latest"),
    ("IND", "PIB 국방부", "en", "gov", "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3"),
    ("PAK", "Dawn", "en", "media", "https://www.dawn.com/feeds/pakistan"),
    ("PAK", "Express Tribune", "en", "media", "https://tribune.com.pk/feed/home"),
    ("PAK", "Geo News", "en", "media", "https://www.geo.tv/rss/1/1"),
    ("PAK", "Express (우르두어)", "ur", "media", "https://www.express.pk/feed/"),
    ("PAK", "BBC 우르두어", "ur", "media", "https://feeds.bbci.co.uk/urdu/rss.xml"),
    # 미국
    ("USA", "국방부 보도자료", "en", "gov", "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=9&Site=945&max=20"),
    ("USA", "국방부 뉴스", "en", "gov", "https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945&max=20"),
    ("USA", "Military Times", "en", "media", "https://www.militarytimes.com/arc/outboundfeeds/rss/"),
    ("USA", "국무부 보도자료", "en", "gov", "https://www.state.gov/rss-feed/press-releases/feed/"),
    ("USA", "Defense News", "en", "media", "https://www.defensenews.com/arc/outboundfeeds/rss/"),
    ("USA", "Breaking Defense", "en", "media", "https://breakingdefense.com/feed/"),
    ("USA", "Defense One", "en", "media", "https://www.defenseone.com/rss/all/"),
    ("USA", "War on the Rocks", "en", "media", "https://warontherocks.com/feed/"),
]


def _text(el: ET.Element | None) -> str:
    return "".join(el.itertext()).strip() if el is not None else ""


def _date(s: str) -> str | None:
    if not s:
        return None
    try:
        return parsedate_to_datetime(s).astimezone(timezone.utc).isoformat()  # RSS
    except (TypeError, ValueError):
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()  # Atom
        except ValueError:
            return None


def parse_feed(xml_bytes: bytes) -> list[dict]:
    """RSS 2.0 / Atom 공용 파서. 요약의 HTML 태그는 단순 제거."""
    root = ET.fromstring(xml_bytes)
    items = []
    for it in list(root.iter("item")) + list(root.iter(f"{ATOM}entry")):
        link = it.find(f"{ATOM}link")
        summary = it.findtext("description") or _text(it.find(f"{ATOM}summary"))
        summary = html.unescape(TAG_RE.sub(" ", summary))
        items.append({
            "title": (it.findtext("title") or _text(it.find(f"{ATOM}title"))).strip(),
            "url": (it.findtext("link") or (link.get("href") if link is not None else "")).strip(),
            "summary": " ".join(summary.split())[:SUMMARY_CHARS],
            "published_at": _date(it.findtext("pubDate") or it.findtext(f"{ATOM}updated") or it.findtext(f"{ATOM}published") or ""),
        })
    return items


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        return resp.read()


def _probe_one(c: tuple) -> dict:
    iso, name, lang, kind, url = c
    row = {"iso3": iso, "name": name, "lang": lang, "kind": kind, "url": url}
    try:
        items = parse_feed(get(url))
        dates = sorted(d for d in (i["published_at"] for i in items) if d)
        stale = bool(dates) and datetime.fromisoformat(dates[-1]) < datetime.now(timezone.utc) - timedelta(days=STALE_DAYS)
        row.update(ok=bool(items) and not stale, items=len(items), latest=dates[-1] if dates else None,
                   has_summary=sum(bool(i["summary"]) for i in items),
                   **({"error": f"stale: 최신 {dates[-1][:10]}"} if stale else {}))
    except Exception as e:  # 네트워크·파싱 오류 모두 '실패'로 기록
        row.update(ok=False, error=f"{type(e).__name__}: {e}"[:120])
    return row


def probe() -> list[dict]:
    with ThreadPoolExecutor(WORKERS) as ex:
        rows = list(ex.map(_probe_one, CANDIDATES))
    checked = datetime.now(timezone.utc).isoformat(timespec="seconds")
    CONFIG_FILE.write_text(json.dumps({
        "checked_at": checked,
        "feeds": [r for r in rows if r["ok"]],
        "failed": [{k: r.get(k) for k in ("iso3", "name", "url", "error")} for r in rows if not r["ok"]],
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    return rows


def fetch() -> Path:
    """newsroom.json 의 피드를 모두 읽어 오늘 파일에 URL 기준 중복 없이 추가."""
    feeds = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))["feeds"]
    STORE_DIR.mkdir(parents=True, exist_ok=True)
    path = STORE_DIR / f"{datetime.now(timezone.utc):%Y-%m-%d}.jsonl"
    seen = {json.loads(l)["url"] for l in path.open(encoding="utf-8")} if path.exists() else set()

    def one(f: dict) -> list[dict]:
        try:
            return [{**i, "feed": f["name"], "iso3": f["iso3"], "lang": f["lang"]} for i in parse_feed(get(f["url"]))]
        except Exception:
            return []  # 피드 하나 실패는 건너뜀 (다음 probe 에서 걸러짐)

    with ThreadPoolExecutor(WORKERS) as ex:
        new = [i for items in ex.map(one, feeds) for i in items if i["url"] and i["url"] not in seen]
    with path.open("a", encoding="utf-8") as fp:
        for i in {i["url"]: i for i in new}.values():
            fp.write(json.dumps(i, ensure_ascii=False) + "\n")
    return path


def self_check() -> None:
    rss = b"""<rss><channel><item><title>T1</title><link>http://a</link>
      <description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description>
      <pubDate>Thu, 05 Nov 2026 07:00:00 GMT</pubDate></item></channel></rss>"""
    atom = b"""<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T2</title>
      <link href="http://b"/><summary>S</summary><updated>2026-11-05T09:00:00Z</updated></entry></feed>"""
    a, b = parse_feed(rss)[0], parse_feed(atom)[0]
    assert (a["title"], a["url"], a["summary"]) == ("T1", "http://a", "Hello world")
    assert a["published_at"].startswith("2026-11-05T07:00")
    assert (b["title"], b["url"], b["summary"]) == ("T2", "http://b", "S")
    assert b["published_at"].startswith("2026-11-05T09:00")


if __name__ == "__main__":
    self_check()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "probe"
    if cmd == "probe":
        for r in probe():
            print(("OK  " if r["ok"] else "FAIL"), r["iso3"], r["name"], r.get("items", ""), r.get("latest") or r.get("error", ""))
    elif cmd == "fetch":
        print(fetch())
