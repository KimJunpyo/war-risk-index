"""M12 이슈 #54 배치 뉴스 단계(news_publish.py)와 나라 이름 목록(backend/app/country_names.json) 테스트.

네트워크는 쓰지 않는다. news_publish.fetch_news 를 가짜로 바꾸고, news_publish.time 도 가짜 시계로 바꾼다
(news_publish 는 time.time·time.sleep 을 모듈 속성으로 부른다. sleep 하면 가짜 시계가 간다).
나라 목록(main.list_countries)은 두 나라로 바꾼다. 파일은 tmp 폴더에만 쓴다.

계약 (구현은 이 계약을 따른다)
- 대상: 국가 쌍 전부(PAIRS 의 news_query) → news/pairs/{id}/{range}.json,
  나라 전부(main.list_countries) → news/countries/{code}/{range}.json.
  나라 검색어는 main.COUNTRY_NEWS_QUERY 에 country_names.json[iso2](화면 countryName 과 같은 이름)를 넣은 것이다.
  이름이 없으면(iso2 가 빔) 화면 countryName(iso2, code) 처럼 code 를 넣는다.
  fetch_news(검색어, 범위)를 그대로 부르고 돌려받은 목록을 그대로 JSON 으로 쓴다. 순서는 24h(기본 범위) 먼저, 쌍 → 나라.
- 주기: 24h 는 1시간, 7d 는 6시간(REFRESH_SECONDS). 범위 파일 중 가장 최근 mtime 이 주기 − SLACK_SECONDS 이상 지났거나
  파일이 하나도 없으면 그 범위의 대상을 모두 받는다. 여유는 15분 실행 간격보다 짧다.
- 요청 사이마다 REQUEST_GAP_SECONDS 쉰다(첫 요청 전에는 쉬지 않는다).
- 실패한 대상의 파일은 내용·mtime 을 그대로 둔다(지난 값 유지). 받으려던 대상이 모두 실패하면 RuntimeError(차단 신호).
  처음 ABORT_AFTER 건이 모두 실패하면 나머지는 부르지 않는다. 로그에는 대상 경로를 남기고 응답 본문(예외 문구)은 남기지 않는다.
- 한 실행이 BUDGET_SECONDS 를 넘기면 남은 대상은 부르지 않는다(지난 값 유지, 경고만).
- country_names.json: 키는 pycountry 의 ISO alpha-2 전부(build_country_index.iso_info 가 낼 수 있는 iso2. 나라 목록은 날마다
  바뀔 수 있다), 값은 빈 문자열이 아니고 화면의 NAME_OVERRIDE(CD·CG)가 들어 있다.

인수 조건 → 테스트
- 요청 수·쉬는 시간·쓰는 내용: test_fetches_every_target_with_gap / 이름이 없을 때: test_name_falls_back_to_code
- 실행 주기 판단: test_refresh_by_newest_mtime
- 실패 대상의 파일 유지·로그: test_failed_target_keeps_last_file
- 전부 실패 시 예외: test_all_failed_raises_and_stops_early, test_all_failed_raises_with_few_targets
- 시간 예산: test_budget_skips_rest
- 나라 이름 목록과 키: test_country_names_cover_all_iso_codes
(publish.write 가 news/ 를 지우지 않는지는 test_m12_publish.py, 배치가 news/* 를 받는지는 test_m12_batch.py)
"""

import json
import os
from pathlib import Path
from types import SimpleNamespace

import pycountry
import pytest

import news_publish
from backend.app import main
from backend.app.pairs import PAIRS

NOW = 1_800_000_000  # 가짜 현재 시각(초). 지난 파일의 mtime 은 이 값을 기준으로 맞춘다
HOUR = 3600
COUNTRIES = [{"code": "KOR", "iso2": "KR"}, {"code": "COD", "iso2": "CD"}]  # main.list_countries 대신
NAMES = {"KOR": "대한민국", "COD": "콩고민주공화국"}  # 화면 countryName 값(CD 는 NAME_OVERRIDE)
TARGETS = [*(f"pairs/{pid}" for pid in PAIRS), *(f"countries/{c['code']}" for c in COUNTRIES)]
QUERIES = [*(p["news_query"] for p in PAIRS.values()),
           *(main.COUNTRY_NEWS_QUERY.format(name=NAMES[c["code"]]) for c in COUNTRIES)]
RANGES = ["24h", "7d"]
BODY = "응답 본문 비밀"  # 가짜 실패의 예외 문구에 넣는다. 로그에 나오면 안 된다


def _items(query: str, range_key: str) -> list[dict]:
    """가짜 fetch_news 의 응답(검색어·범위마다 다르다)."""
    return [{"title": f"{query} {range_key}", "url": "https://news.example/1", "source": "연합뉴스",
             "published_at": "2026-11-16T00:00:00+00:00"}]


class FakeNews:
    """가짜 fetch_news 와 시계. fail 에 든 검색어(None 이면 전부)는 본문이 든 예외를 낸다."""

    def __init__(self) -> None:
        self.now: float = NOW
        self.calls: list[tuple[str, str]] = []
        self.started: list[float] = []  # 요청마다 시작한 시각
        self.sleeps: list[float] = []
        self.fail: set[str] | None = set()
        self.seconds = 0.0  # 요청 하나에 걸리는 시간

    def fetch(self, query: str, range_key: str) -> list[dict]:
        self.calls.append((query, range_key))
        self.started.append(self.now)
        self.now += self.seconds
        if self.fail is None or query in self.fail:
            raise RuntimeError(f"<html>{BODY}</html>")
        return _items(query, range_key)

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeNews:
    f = FakeNews()
    monkeypatch.setattr(news_publish, "fetch_news", f.fetch)
    monkeypatch.setattr(news_publish, "time", SimpleNamespace(time=lambda: f.now, sleep=f.sleep))
    monkeypatch.setattr(main, "list_countries", lambda: COUNTRIES)
    return f


def _path(out_dir: Path, target: str, range_key: str) -> Path:
    return out_dir / "news" / target / f"{range_key}.json"


def _put(out_dir: Path, target: str, range_key: str, text: str, age_seconds: int) -> Path:
    """지난 실행이 남긴 파일. mtime = NOW − age_seconds."""
    path = _path(out_dir, target, range_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    ns = (NOW - age_seconds) * 10**9
    os.utime(path, ns=(ns, ns))
    return path


def _files(out_dir: Path) -> list[str]:
    return sorted(p.relative_to(out_dir).as_posix() for p in out_dir.rglob("*") if p.is_file())


def test_fetches_every_target_with_gap(fake: FakeNews, tmp_path: Path) -> None:
    """파일이 없으면 두 범위 모두 받는다: (쌍 전부 + 나라 전부) × (24h, 7d) 번 부르고, 요청 사이마다 쉬고,
    응답 목록을 그대로 쓴다. 임시 파일(.part)은 남지 않는다."""
    news_publish.run(tmp_path)
    assert fake.calls == [(q, r) for r in RANGES for q in QUERIES]
    assert 0 < news_publish.REQUEST_GAP_SECONDS <= 1
    assert fake.sleeps == [news_publish.REQUEST_GAP_SECONDS] * (len(fake.calls) - 1)
    assert _files(tmp_path) == sorted(f"news/{t}/{r}.json" for t in TARGETS for r in RANGES)
    for r in RANGES:
        for target, query in zip(TARGETS, QUERIES):
            assert json.loads(_path(tmp_path, target, r).read_text(encoding="utf-8")) == _items(query, r)


@pytest.mark.parametrize("range_key", RANGES)
@pytest.mark.parametrize("due", [True, False])
def test_refresh_by_newest_mtime(fake: FakeNews, tmp_path: Path, range_key: str, due: bool) -> None:
    """범위 파일 중 가장 최근 mtime 이 주기 − 여유만큼 지났으면 그 범위의 대상을 모두 다시 받고, 1초라도 덜 지났으면 받지 않는다.
    가장 오래된 파일은 보지 않는다(계속 실패하는 대상 하나 때문에 범위 전체를 15분마다 다시 받지 않도록)."""
    assert news_publish.REFRESH_SECONDS == {"24h": HOUR, "7d": 6 * HOUR}
    assert 0 < news_publish.SLACK_SECONDS < 15 * 60  # 15분 실행 간격보다 짧은 여유
    newest = news_publish.REFRESH_SECONDS[range_key] - news_publish.SLACK_SECONDS - (0 if due else 1)
    other = RANGES[1 - RANGES.index(range_key)]
    for target in TARGETS:
        _put(tmp_path, target, other, "[]", 0)  # 다른 범위는 방금 받았다
        _put(tmp_path, target, range_key, "[]", 30 * 24 * HOUR)  # 한 달 동안 실패한 대상 흉내
    _put(tmp_path, TARGETS[0], range_key, "[]", newest)
    news_publish.run(tmp_path)
    assert fake.calls == ([(q, range_key) for q in QUERIES] if due else [])


def test_missing_files_fetched_even_if_not_due(fake: FakeNews, tmp_path: Path) -> None:
    """범위가 아직 다시 받을 때가 아니어도, 파일이 없는 대상(예산에 끊긴 첫 실행·새 대상)은 받는다."""
    for r in RANGES:
        _put(tmp_path, TARGETS[0], r, "[]", 0)  # 첫 대상만 방금 받았다
    news_publish.run(tmp_path)
    assert fake.calls == [(q, r) for r in RANGES for q in QUERIES[1:]]


def test_failed_target_keeps_last_file(fake: FakeNews, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    """한 대상이 실패해도 예외 없이 나머지를 쓰고, 실패한 대상의 파일은 내용·mtime 을 그대로 둔다(지난 값 유지).
    로그에는 실패한 대상 경로만 남고 응답 본문(예외 문구)은 없다."""
    fake.fail = {QUERIES[TARGETS.index("countries/KOR")]}
    old = _put(tmp_path, "countries/KOR", "24h", '[{"title":"지난 기사"}]', 2 * HOUR)
    news_publish.run(tmp_path)
    assert old.read_text(encoding="utf-8") == '[{"title":"지난 기사"}]'
    assert old.stat().st_mtime_ns == (NOW - 2 * HOUR) * 10**9
    assert not _path(tmp_path, "countries/KOR", "7d").exists()
    assert len(fake.calls) == len(TARGETS) * len(RANGES)
    cod = QUERIES[TARGETS.index("countries/COD")]
    assert json.loads(_path(tmp_path, "countries/COD", "24h").read_text(encoding="utf-8")) == _items(cod, "24h")
    assert "news/countries/KOR/24h.json" in caplog.text and "news/countries/KOR/7d.json" in caplog.text
    assert BODY not in caplog.text


def test_name_falls_back_to_code(fake: FakeNews, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """iso2 가 비면(country_meta.csv 의 나미비아 NA 는 pandas 가 빈 값으로 읽는다) 화면 countryName(iso2, code) 처럼 code 로 찾는다."""
    monkeypatch.setattr(news_publish, "PAIRS", {})
    monkeypatch.setattr(main, "list_countries", lambda: [{"code": "NAM", "iso2": None}])
    news_publish.run(tmp_path)
    assert fake.calls == [(main.COUNTRY_NEWS_QUERY.format(name="NAM"), r) for r in RANGES]


def test_all_failed_raises_and_stops_early(fake: FakeNews, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    """처음 ABORT_AFTER 건이 모두 실패하면 막힌 것으로 보고 나머지는 부르지 않고 RuntimeError(차단 신호).
    지난 파일은 그대로 두고, 예외 문구·로그에 응답 본문이 없다."""
    fake.fail = None
    old = _put(tmp_path, "pairs/KOR-PRK", "24h", "[]", 2 * HOUR)
    with pytest.raises(RuntimeError) as exc:
        news_publish.run(tmp_path)
    assert 0 < len(fake.calls) == news_publish.ABORT_AFTER < len(TARGETS) * len(RANGES)
    assert _files(tmp_path) == ["news/pairs/KOR-PRK/24h.json"]
    assert old.stat().st_mtime_ns == (NOW - 2 * HOUR) * 10**9
    assert BODY not in caplog.text + str(exc.value)


def test_all_failed_raises_with_few_targets(fake: FakeNews, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """대상이 ABORT_AFTER 건보다 적어도 받으려던 대상이 모두 실패하면 RuntimeError."""
    monkeypatch.setattr(news_publish, "PAIRS", {"KOR-PRK": PAIRS["KOR-PRK"]})
    monkeypatch.setattr(main, "list_countries", lambda: [])
    fake.fail = None
    with pytest.raises(RuntimeError):
        news_publish.run(tmp_path)
    assert fake.calls == [(PAIRS["KOR-PRK"]["news_query"], r) for r in RANGES]


def test_budget_skips_rest(fake: FakeNews, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    """한 실행이 BUDGET_SECONDS 를 넘기면 남은 대상은 부르지 않고 경고만 남긴다(받은 것은 쓰고 예외 없음).
    느린 응답 때문에 배치 전체가 워크플로 제한 시간에 끊겨 올리기를 못 하는 일이 없도록."""
    fake.seconds = 20  # 요청마다 20초(fetch_news 제한 시간 10초를 넘는 느린 응답 흉내)
    news_publish.run(tmp_path)
    assert 0 < len(fake.calls) < len(TARGETS) * len(RANGES)
    assert max(fake.started) - NOW <= news_publish.BUDGET_SECONDS
    assert fake.now - NOW > news_publish.BUDGET_SECONDS
    assert len(_files(tmp_path)) == len(fake.calls)
    assert any(r.levelname == "WARNING" for r in caplog.records)


def test_country_names_cover_all_iso_codes() -> None:
    """나라 목록(country_meta.csv)은 날마다 바뀔 수 있어, 이름은 pycountry 의 ISO alpha-2 전부에 있어야 한다
    (build_country_index.iso_info 가 낼 수 있는 iso2). 값은 화면 countryName 결과다(CD·CG 는 NAME_OVERRIDE)."""
    names = json.loads(news_publish.COUNTRY_NAMES_FILE.read_text(encoding="utf-8"))
    assert set(names) == {c.alpha_2 for c in pycountry.countries}
    assert all(isinstance(name, str) and name for name in names.values())
    assert (names["KR"], names["KP"], names["CD"], names["CG"]) == ("대한민국", "북한", "콩고민주공화국", "콩고공화국")
