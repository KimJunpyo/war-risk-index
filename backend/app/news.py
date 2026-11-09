"""Google News RSS 로 국가 쌍별 국방 뉴스 조회."""

import time
import urllib.parse
import urllib.request
# 표준 ElementTree: 외부 엔티티를 해석하지 않고, Python 3.12 의 expat 은 엔티티 폭주(billion laughs) 방어 내장
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

RSS_URL = "https://news.google.com/rss/search?q={q}&hl=ko&gl=KR&ceid=KR:ko"
CACHE_SECONDS = 600
TIMEOUT_SECONDS = 10
MAX_ITEMS = 30
RANGES = {"24h": "1d", "7d": "7d"}  # API 범위 → Google News when: 연산자

_cache: dict[str, tuple[float, list[dict]]] = {}


def parse_rss(xml_text: str) -> list[dict]:
    items = []
    for it in ET.fromstring(xml_text).iter("item"):
        pub = it.findtext("pubDate")
        items.append({
            "title": it.findtext("title", ""),
            "url": it.findtext("link", ""),
            "source": it.findtext("source", ""),
            "published_at": parsedate_to_datetime(pub).isoformat() if pub else None,
        })
    items.sort(key=lambda x: x["published_at"] or "", reverse=True)
    return items[:MAX_ITEMS]


def fetch_news(query: str, range_key: str) -> list[dict]:
    full_query = f"{query} when:{RANGES[range_key]}"
    hit = _cache.get(full_query)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    req = urllib.request.Request(RSS_URL.format(q=urllib.parse.quote(full_query)),
                                 headers={"User-Agent": "war-risk-index/0.1"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        items = parse_rss(resp.read().decode("utf-8"))
    _cache[full_query] = (time.time(), items)
    return items


def self_check() -> None:
    sample = """<rss><channel>
      <item><title>A</title><link>http://a</link><source>S1</source><pubDate>Thu, 05 Nov 2026 07:00:00 GMT</pubDate></item>
      <item><title>B</title><link>http://b</link><source>S2</source><pubDate>Thu, 05 Nov 2026 09:00:00 GMT</pubDate></item>
    </channel></rss>"""
    items = parse_rss(sample)
    assert [i["title"] for i in items] == ["B", "A"]  # 최신순
    assert items[0]["source"] == "S2"


if __name__ == "__main__":
    self_check()
    print("self_check ok")
