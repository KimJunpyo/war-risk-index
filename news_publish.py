"""배치 뉴스 단계(#54): 국가 쌍·나라별 국방 뉴스(Google News RSS)를 미리 받아 out/api/news/ 아래 JSON 으로 쓴다.

Cloudflare 엣지에서는 Google News 가 503 을 줘서 Worker 가 직접 받지 못한다(#54 실측. Actions 러너에서는 받아진다).
그래서 15분 배치(batch.py)가 publish 다음에 이 단계를 돌려 R2 api/news/… 에 올리고, Worker 는 그 파일을 그대로 내준다.
받기는 지금 API(main.pair_news·country_news)와 같은 fetch_news 를 그대로 부르고, 돌려받은 목록을 그대로 쓴다.

- 대상: 국가 쌍 전부(PAIRS 의 news_query) → news/pairs/{id}/{range}.json,
  나라 전부(main.list_countries) → news/countries/{code}/{range}.json. 범위(range)는 news.RANGES(24h·7d).
  나라 검색어는 main.COUNTRY_NEWS_QUERY 에 화면(countryName)과 같은 이름을 넣는다. 이름은 COUNTRY_NAMES_FILE 에서 읽는다
  (frontend/scripts/country-names.mjs 가 만든다. 화면의 이름 규칙을 바꾸면 다시 만들어 커밋한다).
- 주기: 범위마다 그 범위 파일 중 가장 최근 mtime 이 REFRESH_SECONDS − SLACK_SECONDS 이상 지났거나 파일이 하나도 없으면
  그 범위의 대상을 모두 다시 받는다. mtime 은 batch 가 R2 manifest 값으로 되돌린 값이다.
- 실패: 한 대상이 실패하면 그 파일은 건드리지 않고(지난 값 유지) 센다. 받으려던 대상이 모두 실패하면 RuntimeError(차단 신호).
  처음 ABORT_AFTER 건이 모두 실패하면 막힌 것으로 보고 나머지는 부르지 않는다. 로그에는 대상과 예외 종류만 남긴다(응답 본문 없음).
- 한 실행이 BUDGET_SECONDS 를 넘기면 남은 대상은 건너뛴다(지난 값 유지). 느린 응답 때문에 배치 전체가 워크플로 제한 시간에
  끊기면 그 실행은 실시간 갱신까지 하나도 올리지 못한다.

프로젝트 루트에서 실행: python news_publish.py (Google News 에 실제로 접속한다)
"""

import json
import time
from pathlib import Path

import atomic_write
import publish
from backend.app import main
from backend.app.news import RANGES, fetch_news
from backend.app.pairs import PAIRS

COUNTRY_NAMES_FILE = main.ROOT / "backend" / "app" / "country_names.json"  # ISO alpha-2 → 화면의 한국어 이름
HOUR_SECONDS = 3600
REFRESH_SECONDS = {"24h": HOUR_SECONDS, "7d": 6 * HOUR_SECONDS}  # 범위별로 다시 받는 주기
SLACK_SECONDS = 5 * 60  # 15분 예약 실행이 몇 분 일찍 돌아도 그 주기를 건너뛰지 않게
REQUEST_GAP_SECONDS = 0.3  # 요청 사이에 쉬는 시간
ABORT_AFTER = 5  # 처음 이 건수가 모두 실패하면 막힌 것으로 보고 나머지를 부르지 않는다(막힌 동안 요청을 쏟지 않게)
# 한 실행에서 뉴스 단계가 쓸 수 있는 시간. 두 범위를 다 받으면 약 2분(2026-11 기준 대상 99개 × 2, 요청·쉬는 시간 약 0.6초)이고,
# 워크플로 timeout-minutes(14분, refresh.yml 에 최악 계산) 안에 일별 재계산·대피시설·올리기까지 끝나야 한다
BUDGET_SECONDS = 180
log = main.log
assert set(REFRESH_SECONDS) == set(RANGES)  # fetch_news 의 범위와 동기화


def _due(paths: list[Path], refresh_seconds: int, now: float) -> bool:
    """범위 파일 중 가장 최근 mtime 이 주기 − 여유 이상 지났거나 파일이 하나도 없으면 True.

    가장 오래된 파일로 보면 계속 실패하는 대상 하나 때문에 범위 전체를 15분마다 다시 받게 된다.
    """
    mtimes = [p.stat().st_mtime for p in paths if p.is_file()]
    return not mtimes or now - max(mtimes) >= refresh_seconds - SLACK_SECONDS


def run(out_dir: Path = publish.OUT_DIR) -> None:
    """다시 받을 때가 된 범위의 대상을 모두 받아 쓴다. 받으려던 대상이 모두 실패하면 RuntimeError."""
    started = time.time()
    names = json.loads(COUNTRY_NAMES_FILE.read_text(encoding="utf-8"))
    queries = {f"pairs/{pid}": p["news_query"] for pid, p in PAIRS.items()}
    # 이름이 없으면(iso2 가 비었을 때 등) 화면 countryName(iso2, code) 처럼 code 를 쓴다
    queries |= {f"countries/{c['code']}": main.COUNTRY_NEWS_QUERY.format(name=names.get(c["iso2"], c["code"]))
                for c in main.list_countries()}
    jobs: list[tuple[Path, str, str]] = []  # (파일, 검색어, 범위). 24h(기본 범위)가 먼저
    for range_key, refresh_seconds in REFRESH_SECONDS.items():
        paths = {rel: out_dir / publish.NEWS_DIR / rel / f"{range_key}.json" for rel in queries}
        due = _due(list(paths.values()), refresh_seconds, started)
        # 파일이 아직 없는 대상(예산에 끊긴 첫 실행·새 대상)은 주기와 상관없이 받는다(다음 주기까지 502 로 남지 않게)
        jobs += [(path, queries[rel], range_key) for rel, path in paths.items() if due or not path.is_file()]
    done = failed = 0
    for path, query, range_key in jobs:
        if done:
            time.sleep(REQUEST_GAP_SECONDS)
        if time.time() - started > BUDGET_SECONDS:
            log.warning("뉴스 단계가 %d초를 넘어 남은 %d건은 건너뜀(지난 값 유지)", BUDGET_SECONDS, len(jobs) - done)
            break
        done += 1
        try:
            items = fetch_news(query, range_key)
        except Exception as e:  # 예외 문구에 응답 본문이 섞일 수 있어 대상과 예외 종류만 남긴다
            failed += 1
            log.warning("뉴스 받기 실패: %s (%s)", path.relative_to(out_dir).as_posix(), type(e).__name__)
            if failed == done == ABORT_AFTER:
                break
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic_write.write_text(path, json.dumps(items, ensure_ascii=False, separators=(",", ":")))
    if done and failed == done:
        raise RuntimeError(f"뉴스 {done}건이 모두 실패함(Google News 차단 의심). 지난 파일은 그대로 둠")
    if failed:  # 중간부터 막혀도 종료 코드는 0 이라, 로그에서라도 보이게 한다
        log.warning("뉴스 받기 실패 %d/%d건: 그 대상은 지난 값을 그대로 둠", failed, done)
    print(f"뉴스: {len(jobs)}건 중 {done}건 요청, 실패 {failed}건, {time.time() - started:.1f}초")


if __name__ == "__main__":
    run()
