"""M9 최종 리뷰(medium, PR #45): 일별 재계산이 UCDP 갱신 실패에 막히지 않게 하기 인수 테스트.

실제 data/·out/ 와 네트워크는 쓰지 않는다. _daily_refresh 가 부르는 갱신·수집 함수는 모두 가짜로 바꾸고,
읽는 파일 두 개(2.0 일별 집계, country_meta)는 tmp_path 아래로 옮긴다.

배경: UCDP 실패 격리 전에는 재계산 블록이 ucdp.update() 를 감싸지 않고 맨 앞에서 불러, ucdp.uu.se 가 막히면 뒤의
수집·지수 재계산이 모두 건너뛰어졌다. 15분마다 같은 실패가 반복되고, 며칠 뒤 /api/health 가 지수 날짜(INDEX_STALE_DAYS)로
503 이 됐다. UCDP 는 월 1회만 바뀌므로 실패해도 기존 집계로 계속 돌아야 한다.

계약 (구현은 이 계약을 따른다)

[backend/app/main.py] _daily_refresh 의 새 일별 파일 재계산 블록
- 다섯 단계와 순서는 격리 전과 같다: ucdp.update() → gdelt_collect.main() → country_collect.main()
  → build_index.main() → build_country_index.main(). 격리 전처럼 모듈 속성으로 부른다(테스트가 모듈 속성을 바꿔 끼운다).
  ucdp.update() 도 격리 전처럼 이 블록 안에서만 부른다. 여행경보 옆 등 블록 밖으로 옮기면 15분마다 ucdp.uu.se 에 접속한다.
- ucdp.update() 만 try/except Exception 으로 감싼다. 실패하면 로거 war-risk(main.log)에 log.exception("UCDP 갱신 실패")
  를 남기고, 다시 시도하지 않고 gdelt_collect.main() 부터 build_country_index.main() 까지 원래 순서대로 한 번씩 계속한다.
    메시지는 이 글자 그대로다(여행경보 등의 "… 갱신 실패" 와 같은 모양). 예외 문구는 메시지에 붙이지 않고 exc_info 로 남는다.
    사이트 막힘·시간 초과(OSError 계열)만이 아니라 모든 Exception 을 받는다. 파일 형식이 바뀌어 읽기에 실패해도 같다.
- 그래서 UCDP 실패는 _daily_refresh 밖으로 나오지 않는다.
- 나머지 네 단계의 실패 처리는 격리 전과 같다: 감싸지 않고 그 예외 객체를 그대로 올리며, 실패한 단계 뒤는 부르지 않는다.
  _daily_refresh 는 그 실패를 기록하지 않는다(_updater 가 받아 "갱신 실패: _daily_refresh" 로 기록한다).
- UCDP 가 정상이면 격리 전과 같다: 다섯 단계가 순서대로 한 번씩 불리고 오류 기록이 없다.

테스트 방식
- steps 픽스처가 재계산 블록까지 가게 조건을 맞춘다.
    여행경보·대피시설·재외공관 update 와 live.backfill: 아무것도 하지 않는다. _recently_written: False(수동 수집 중 아님).
    live.V2_DAILY_COUNTRY: 없는 tmp 경로(2.0 백필 대상이 되지만 백필은 가짜). _url_exists: True(어제 1.0 일별 파일 있음).
    main.COUNTRY_META_FILE: 최신 날짜가 어제보다 이전(STALE_META_DATE)인 tmp 파일.
- 다섯 단계는 부를 때 이름을 calls 에 적는 가짜다. failures[단계 이름] 에 예외를 넣으면 이름을 적은 뒤 그 예외를 낸다.
- 예외는 두 종류로 돌린다: 사이트 막힘(urllib.error.URLError, OSError 계열)과 그 밖의 실패(ValueError).
  UCDP 를 except OSError 처럼 좁게 받거나, 다른 단계를 좁게라도 감싸면 걸린다.
- 기록: caplog 로 war-risk 의 ERROR 이상만 본다. exc_info 에 가짜가 낸 그 예외 객체가 있어야 한다(log.exception).
- 격리 전 코드에서는 test_ucdp_failure_logged_and_rest_continue 가 가짜 UCDP 예외가 _daily_refresh 밖으로 나와
  실패했다(테스트 자체 오류 아님). 나머지는 격리 전 코드도 통과했다(회귀 방지). 조건 맞추기가 틀려 재계산 블록에
  못 가면 test_all_steps_in_order_when_ucdp_ok 가 calls == [] 로 실패하므로 픽스처 오류와 구분된다.

인수 조건 → 테스트
- UCDP 실패에도 예외 없음, 나머지 네 단계가 순서대로 한 번씩, UCDP 실패 기록 한 건: test_ucdp_failure_logged_and_rest_continue
- UCDP 정상이면 다섯 단계가 순서대로: test_all_steps_in_order_when_ucdp_ok
- 새 일별 파일이 없으면 UCDP 를 포함해 하나도 부르지 않음: test_no_step_without_new_daily_file
- 다른 네 단계의 실패는 격리 전처럼 밖으로 나오고 뒤 단계는 불리지 않음: test_other_step_failure_propagates
"""

import logging
import urllib.error
from collections.abc import Callable
from pathlib import Path

import pandas as pd
import pytest

import backend.app.main as main
import live

LOGGER_NAME = "war-risk"  # main.log 의 로거 이름
UCDP_FAILURE_MESSAGE = "UCDP 갱신 실패"  # 계약: log.exception 메시지 그대로
# 새 일별 파일 재계산 블록의 다섯 단계("모듈.속성"). 이 순서로 한 번씩 부른다
STEPS = ["ucdp.update", "gdelt_collect.main", "country_collect.main", "build_index.main", "build_country_index.main"]
UCDP_STEP, LATER_STEPS = STEPS[0], STEPS[1:]
# 재계산 블록보다 먼저 부르는 공공데이터 갱신(여행경보·대피시설·재외공관)
PUBLIC_DATA_UPDATES = ["travel_advisory.update", "shelters.update", "embassies.update"]
STALE_META_DATE = "2024-02-20"  # country_meta 의 최신 날짜. 어제보다 이전이라 새 일별 파일을 받을 차례다
# 단계가 낼 예외: 사이트 막힘·시간 초과(OSError 계열)와 그 밖의 실패(파일 형식이 바뀌어 read_csv 실패 등)
ERROR_TYPES = [urllib.error.URLError, ValueError]
ERROR_IDS = ["site_blocked", "format_changed"]

Steps = tuple[list[str], dict[str, Exception]]  # (부른 단계 이름 순서, 단계 이름 → 낼 예외)


def _noop(*args: object, **kwargs: object) -> None:
    """아무것도 하지 않는 가짜 갱신."""


def _fake_step(name: str, calls: list[str], failures: dict[str, Exception]) -> Callable[..., None]:
    """부르면 name 을 calls 에 적고, failures 에 name 이 있으면 그 예외를 낸다."""

    def step(*args: object, **kwargs: object) -> None:
        calls.append(name)
        if name in failures:
            raise failures[name]

    return step


def _errors(caplog: pytest.LogCaptureFixture) -> list[tuple[str, str, BaseException | None]]:
    """war-risk 의 ERROR 이상 기록 → (수준 이름, 메시지, exc_info 의 예외 객체)."""
    return [(r.levelname, r.getMessage(), r.exc_info[1] if r.exc_info else None)
            for r in caplog.records if r.name == LOGGER_NAME and r.levelno >= logging.ERROR]


@pytest.fixture
def steps(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Steps:
    """_daily_refresh 가 새 일별 파일 재계산 블록까지 가게 조건을 맞추고, 다섯 단계를 가짜로 바꾼다.

    (calls, failures) 를 돌려준다. 테스트가 failures[단계 이름] 에 예외를 넣으면 그 단계가 이름을 적은 뒤 그 예외를 낸다.
    """
    for name in PUBLIC_DATA_UPDATES:
        monkeypatch.setattr(name, _noop)
    monkeypatch.setattr(main, "_recently_written", lambda *paths: False)  # 수동 수집 중 아님
    # 2.0 일별 파일이 없어 백필 대상이 되지만 백필은 아무것도 하지 않는다
    monkeypatch.setattr(live, "V2_DAILY_COUNTRY", tmp_path / live.V2_DAILY_COUNTRY.name)
    monkeypatch.setattr(live, "backfill", _noop)
    meta = tmp_path / main.COUNTRY_META_FILE.name
    pd.DataFrame({"date": [STALE_META_DATE]}).to_csv(meta, index=False)
    monkeypatch.setattr(main, "COUNTRY_META_FILE", meta)
    monkeypatch.setattr(main, "_url_exists", lambda url: True)  # 어제 GDELT 1.0 일별 파일이 나왔음
    calls: list[str] = []
    failures: dict[str, Exception] = {}
    for name in STEPS:
        monkeypatch.setattr(name, _fake_step(name, calls, failures))
    return calls, failures


# ---------- UCDP 실패: 기록하고 계속 ----------

@pytest.mark.parametrize("error_type", ERROR_TYPES, ids=ERROR_IDS)
def test_ucdp_failure_logged_and_rest_continue(steps: Steps, caplog: pytest.LogCaptureFixture,
                                               error_type: type[Exception]) -> None:
    """ucdp.update 가 실패해도 _daily_refresh 는 예외 없이 끝나고, 나머지 네 단계가 원래 순서대로 한 번씩 불리며,
    war-risk 에 "UCDP 갱신 실패" ERROR 기록이 그 예외와 함께 한 건 남는다(log.exception)."""
    calls, failures = steps
    error = error_type("가짜 UCDP 갱신 실패")
    failures[UCDP_STEP] = error
    with caplog.at_level(logging.ERROR, logger=LOGGER_NAME):
        main._daily_refresh()  # 격리 전 코드에서는 가짜 UCDP 예외가 여기서 나왔다
    assert calls == STEPS  # UCDP 는 한 번(다시 시도 없음), 뒤 네 단계는 순서대로 한 번씩
    assert _errors(caplog) == [("ERROR", UCDP_FAILURE_MESSAGE, error)]


# ---------- 회귀 방지: 격리 전 코드도 통과했다 ----------

def test_all_steps_in_order_when_ucdp_ok(steps: Steps, caplog: pytest.LogCaptureFixture) -> None:
    """UCDP 갱신이 정상이면 격리 전처럼 다섯 단계가 순서대로 한 번씩 불리고 오류 기록이 없다."""
    calls, _ = steps
    with caplog.at_level(logging.ERROR, logger=LOGGER_NAME):
        main._daily_refresh()
    assert calls == STEPS
    assert _errors(caplog) == []


def test_no_step_without_new_daily_file(steps: Steps, monkeypatch: pytest.MonkeyPatch) -> None:
    """어제 1.0 일별 파일이 아직 없으면 격리 전처럼 다섯 단계를 하나도 부르지 않는다(UCDP 도 재계산 블록 안에서만)."""
    calls, _ = steps
    monkeypatch.setattr(main, "_url_exists", lambda url: False)
    main._daily_refresh()
    assert calls == []


@pytest.mark.parametrize("error_type", ERROR_TYPES, ids=ERROR_IDS)
@pytest.mark.parametrize("failing", LATER_STEPS)
def test_other_step_failure_propagates(steps: Steps, caplog: pytest.LogCaptureFixture, failing: str,
                                       error_type: type[Exception]) -> None:
    """UCDP 뒤 네 단계의 실패는 격리 전처럼 감싸지 않는다: 그 예외 객체가 _daily_refresh 밖으로 나오고(_updater 가 받음),
    실패한 단계 뒤는 불리지 않으며, _daily_refresh 는 오류 기록을 남기지 않는다."""
    calls, failures = steps
    error = error_type(f"가짜 {failing} 실패")
    failures[failing] = error
    with caplog.at_level(logging.ERROR, logger=LOGGER_NAME), pytest.raises(error_type) as excinfo:
        main._daily_refresh()
    assert excinfo.value is error
    assert calls == STEPS[: STEPS.index(failing) + 1]
    assert _errors(caplog) == []
