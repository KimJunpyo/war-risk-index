"""이슈 #36(1-3 데이터 신선도 헬스 체크 /api/health) 인수 테스트.

실제 data/·out/ 는 읽지도 쓰지도 않는다. 슬롯·지수 파일은 테스트마다 tmp_path 에 만들고, 현재 시각은 main._utcnow 하나만 바꿔 끼운다.
고정 시각이 지난 날짜(2024-03-01)라 실행 날짜와 상관없이 결과가 같고, 실제 시각을 쓰는 구현은 어느 날 돌려도 틀린다.

계약 (구현은 이 계약을 따른다)

[backend/app/main.py]
- 상수 LIVE_STALE_MINUTES = 60, INDEX_STALE_DAYS = 3. 판정할 때 모듈 전역에서 읽는다(비교식에 숫자를 박지 않음).
- _utcnow() -> datetime: datetime.now(timezone.utc)(시간대 있는 UTC)를 돌려준다.
    현재 시각을 바꿔 끼우는 유일한 지점이다. 엔드포인트는 요청마다 모듈 전역 _utcnow() 를 부른다.
    datetime.now·pd.Timestamp.now 를 따로 부르거나 import 시점 값을 쓰지 않는다.
- GET·HEAD /api/health 를 같은 함수가 받는다. 예: @app.api_route("/api/health", methods=["GET", "HEAD"])
    @app.get 만 쓰면 HEAD 는 405 다(FastAPI 0.162·Starlette 1.10 에서 확인).
- 읽기: 요청할 때 경로를 만들고 기존 _csv 캐시로 읽는다. mtime 이 그대로면 다시 읽지 않는다.
    슬롯: _csv(ROOT / live.COUNTRY_LIVE, dtype={"key": str}). /api/live 와 같다.
    지수: 모듈 전역 COUNTRY_META_FILE(예: _meta()).
    다른 파일은 읽지 않는다. _live() 는 2.0 일별 파일까지 읽고 그 파일이 없으면 as_of 를 주지 않으므로 쓰지 않는다.
- 본문: 아래 5개 키만 있는 JSON 객체. 200·503 이 같은 모양이고 감싸지 않는다(HTTPException 의 detail 아님). 경로·오류 메시지 없음.
    live_as_of: 슬롯 파일 key 최댓값 그대로 = /api/live 의 as_of. live.KEY_FORMAT 14자리 문자열(예: "20240229234500").
    live_age_minutes: _utcnow() − (live_as_of 를 live.KEY_FORMAT 으로 읽은 UTC 시각) 을 분으로 내림한 정수. 59분 30초 → 59.
    index_date: country_meta.csv 의 date 최댓값 그대로("YYYY-MM-DD").
    index_age_days: _utcnow() 의 UTC 날짜 − index_date 의 일수(달력 날짜 차). 하루 중 시각과 상관없다(23:59:59 에도 3일 전은 3).
    파일이 없거나 행이 없으면(머리줄만) 그 파일의 두 필드가 null 이다.
    ok: live_age_minutes ≤ LIVE_STALE_MINUTES 이고 index_age_days ≤ INDEX_STALE_DAYS. 하나라도 null 이면 false.
    나이는 JSON 정수(61.0 아님), ok 는 true/false 다.
- 상태 코드: ok 면 200, 아니면 503. 파일·값이 없어도 예외(500) 없이 503.
- 경계: "이내"는 포함한다. 판정은 본문에 내보내는 내림한 정수로 한다.
    그래서 60분 00초·60분 59초는 200(60), 61분 00초부터 503. 3일은 200, 4일부터 503.
- LIVE_UPDATES=0 이어도 같은 기준이다. conftest 가 LIVE_UPDATES=0 으로 띄우므로 이 파일의 모든 기대값이 그 확인을 겸한다.
- 미래 key: GDELT 2.0 key 는 파일 발행 시각보다 약 10~11분 늦어(실측 599~694초) 갱신 직후에는 지금보다 미래다.
    이때 나이는 음수(내림: −11분 15초 → −12)이고 200(정상)이다. 하한 검사(0 ≤ 나이, abs, ±60분 창)를 두지 않는다.
- 정하지 않음: 날짜로 읽을 수 없는 key·date 값.

테스트 방식
- 경로 교체: data_files 픽스처가 live.COUNTRY_LIVE·main.COUNTRY_META_FILE 을 tmp_path 아래 절대 경로로 바꾼다(끝나면 되돌림).
    ROOT / 절대 경로 = 그 절대 경로라, 요청 때 ROOT / live.COUNTRY_LIVE 로 만드는 구현은 그대로 tmp 파일을 읽는다.
- _csv 캐시: 키가 (경로, 읽기 옵션)이고 tmp_path 가 테스트마다 달라 테스트끼리 섞이지 않는다.
    한 테스트 안에서는 파일을 다시 쓰지 않는다(mtime 해상도 안에서 다시 쓰면 캐시가 옛 내용을 줄 수 있음).
- 최댓값: 파일마다 최신 값을 오래된 값 두 행 사이에 둔다. 첫 행·마지막 행을 쓰는 구현은 틀린다.
- 실제 data/·out/ 를 pd.read_csv 로 읽으면 그 자리에서 실패시킨다(csv_reads 픽스처).
- 갱신 스레드: conftest 의 client 는 with 없이 만든 TestClient 라 lifespan 을 타지 않고, LIVE_UPDATES=0 이다.
- 구현 전에는 /api/health 가 404 라 상태 코드 확인에서, 상수·_utcnow 테스트는 이름이 없어 실패한다(테스트 자체 오류 아님).

인수 조건 → 테스트
- 59분·3일 → 200, ok true: test_status_and_body[fresh_59m_3d]
- 61분 → 503, ok false, live_age_minutes 61: [live_61m_stale]
- 4일 → 503, index_age_days 4: [index_4d_stale]
- 파일 없음 → 503, 해당 필드 null(500 아님): [live_absent]·[index_absent]·[both_absent], 머리줄만: [*_header_only]
- 키 정확히 5개: 모든 GET 에서 _get_health 가 키·타입을 확인
- HEAD: test_head_same_status_as_get
- 실행 날짜 무관: 고정 시각·tmp 파일. 바꿔 끼우지 않은 _utcnow 는 test_utcnow_is_aware_utc_now 로 확인

수동(이 파일 밖): 갱신 스레드를 켜고 백엔드 기동, 5분 뒤 curl.exe -s -i http://localhost:8000/api/health → 200.
"""

import os
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import NoneType

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import backend.app.main as main
import country_collect
import live

ROOT = Path(__file__).resolve().parents[1]
HEALTH = "/api/health"
LIVE_API = "/api/live"
REAL_DATA_DIRS = [ROOT / "data", ROOT / "out"]  # 테스트 중 읽으면 안 되는 실제 데이터 폴더
KEYS = {"ok", "live_as_of", "live_age_minutes", "index_date", "index_age_days"}
# 키별로 허용하는 정확한 타입. bool 은 int 의 하위 타입이라 isinstance 가 아니라 type 으로 비교한다
TYPES = {"ok": {bool}, "live_as_of": {str, NoneType}, "live_age_minutes": {int, NoneType},
         "index_date": {str, NoneType}, "index_age_days": {int, NoneType}}
LIVE_STALE_MINUTES, INDEX_STALE_DAYS = 60, 3  # main 에 둘 상수의 계약 값
CLOCK_TOLERANCE = timedelta(minutes=1)  # 바꿔 끼우지 않은 _utcnow() 와 실제 UTC 시각의 허용 차이
SLOT_KEY = "20240229234500"  # 최신 슬롯 2024-02-29 23:45:00 UTC. 윤일 자정 직전이라 나이 계산이 날짜·달을 넘는다
OLD_SLOT_KEY = "20240229220000"  # 표의 어떤 최신 슬롯보다도 오래된 슬롯
OLD_INDEX_DATE = "2024-02-20"  # 표의 어떤 지수 날짜보다도 오래된 날짜
META_COLUMNS = ["code", "date"]  # 판정에는 date 만 쓴다
ABSENT, HEADER_ONLY = "<파일 없음>", "<머리줄만>"  # CASES 파일 칸의 특수 값

# id → (현재 시각(UTC), 슬롯 파일의 최신 key, country_meta 의 최신 date, 상태 코드, live_age_minutes, index_age_days)
CASES: dict[str, tuple[str, str, str, int, int | None, int | None]] = {
    # 실시간 경계: SLOT_KEY 로부터 59분 ~ 61분 30초. 판정은 내림한 분으로 한다(반올림·올림이면 59분 30초가 60)
    "fresh_59m_3d": ("2024-03-01 00:44:00", SLOT_KEY, "2024-02-27", 200, 59, 3),
    "live_59m30s_floor": ("2024-03-01 00:44:30", SLOT_KEY, "2024-02-27", 200, 59, 3),
    "live_60m_inclusive": ("2024-03-01 00:45:00", SLOT_KEY, "2024-02-27", 200, 60, 3),
    "live_60m59s_floor": ("2024-03-01 00:45:59", SLOT_KEY, "2024-02-27", 200, 60, 3),
    "live_61m_stale": ("2024-03-01 00:46:00", SLOT_KEY, "2024-02-27", 503, 61, 3),
    "live_61m30s_floor": ("2024-03-01 00:46:30", SLOT_KEY, "2024-02-27", 503, 61, 3),
    # 미래 key(음수 나이)도 200. 11분 15초는 실측 간격(675초). 오늘(UTC)이 2024-02-29 라 02-27 은 2일 전
    "live_key_ahead_10m": ("2024-02-29 23:35:00", SLOT_KEY, "2024-02-27", 200, -10, 2),
    "live_key_ahead_11m15s_floor": ("2024-02-29 23:33:45", SLOT_KEY, "2024-02-27", 200, -12, 2),  # −11.25 → −12
    "live_key_ahead_61m": ("2024-02-29 22:44:00", SLOT_KEY, "2024-02-27", 200, -61, 2),  # abs·±60분 창이면 503
    # 지수 경계: 오늘(UTC)은 2024-03-01. 2024년은 윤년이라 02-27 이 3일 전
    "index_today": ("2024-03-01 00:44:00", SLOT_KEY, "2024-03-01", 200, 59, 0),
    "index_4d_stale": ("2024-03-01 00:44:00", SLOT_KEY, "2024-02-26", 503, 59, 4),
    # 하루 끝에도 3일 전은 3: 경과 시간을 반올림·올림하거나 지역 날짜(한국은 이미 03-02)를 쓰면 4
    "index_3d_end_of_utc_day": ("2024-03-01 23:59:59", "20240301231500", "2024-02-27", 200, 44, 3),
    "both_stale": ("2024-03-01 00:46:00", SLOT_KEY, "2024-02-26", 503, 61, 4),
    # 파일·값 없음: 그 파일의 두 필드가 null, 503(500 아님)
    "live_absent": ("2024-03-01 00:44:00", ABSENT, "2024-02-27", 503, None, 3),
    "live_header_only": ("2024-03-01 00:44:00", HEADER_ONLY, "2024-02-27", 503, None, 3),
    "index_absent": ("2024-03-01 00:44:00", SLOT_KEY, ABSENT, 503, 59, None),
    "index_header_only": ("2024-03-01 00:44:00", SLOT_KEY, HEADER_ONLY, 503, 59, None),
    "both_absent": ("2024-03-01 00:44:00", ABSENT, ABSENT, 503, None, None),
}

Scenario = Callable[[str], tuple[int, dict]]  # scenario(CASES id) → (기대 상태 코드, 기대 본문)


def _utc(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=timezone.utc)


def _latest(cell: str) -> str | None:
    """CASES 파일 칸 → 본문에 나와야 할 최신 값. 파일이 없거나 행이 없으면 None."""
    return None if cell in (ABSENT, HEADER_ONLY) else cell


def _write(path: Path, columns: list[str], column: str, cell: str, old: str) -> None:
    """ABSENT 면 만들지 않고, HEADER_ONLY 면 머리줄만, 아니면 column 이 old·cell·old 인 세 행(다른 열은 빈칸)."""
    if cell == ABSENT:
        return
    values = [] if cell == HEADER_ONLY else [old, cell, old]
    pd.DataFrame({column: values}, columns=columns).to_csv(path, index=False)


def _get_health(client: TestClient) -> tuple[int, dict]:
    """GET /api/health → (상태 코드, 본문). 200·503 모두 키가 정확히 5개이고 타입이 맞는지 확인한다."""
    res = client.get(HEALTH)
    assert res.status_code in (200, 503), f"{res.status_code} {res.text}"
    body = res.json()
    assert set(body) == KEYS, body
    wrong = {k: type(v).__name__ for k, v in body.items() if type(v) not in TYPES[k]}
    assert wrong == {}, body
    return res.status_code, body


@pytest.fixture(autouse=True)
def csv_reads(monkeypatch: pytest.MonkeyPatch) -> list[Path]:
    """pd.read_csv 로 읽은 파일 경로를 적는다. 실제 data/·out/ 를 읽으면 그 자리에서 실패시킨다."""
    reads: list[Path] = []
    real = pd.read_csv

    def spy(source: object, *args: object, **kwargs: object) -> pd.DataFrame:
        if isinstance(source, (str, os.PathLike)):
            path = Path(source).resolve()
            assert not any(path.is_relative_to(d) for d in REAL_DATA_DIRS), f"실제 데이터 파일을 읽음: {path}"
            reads.append(path)
        return real(source, *args, **kwargs)

    monkeypatch.setattr(pd, "read_csv", spy)
    return reads


@pytest.fixture
def data_files(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    """(슬롯 파일, country_meta 파일) 자리를 tmp_path 아래로 바꾼다. 파일은 scenario 가 만든다."""
    slots, meta = tmp_path / live.COUNTRY_LIVE.name, tmp_path / main.COUNTRY_META_FILE.name
    monkeypatch.setattr(live, "COUNTRY_LIVE", slots)
    monkeypatch.setattr(main, "COUNTRY_META_FILE", meta)
    return slots, meta


@pytest.fixture
def scenario(data_files: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch) -> Scenario:
    """scenario(id): CASES[id] 의 현재 시각을 고정하고 두 파일을 만든 뒤 (기대 상태 코드, 기대 본문)을 돌려준다.

    한 테스트에서 한 번만 부른다(파일을 다시 쓰지 않음).
    """
    slots, meta = data_files

    def setup(case: str) -> tuple[int, dict]:
        now, slot, index_date, status, live_age, index_age = CASES[case]
        # raising=False: 구현 전(_utcnow 없음)에도 요청까지 가서 404 로 실패하게 한다
        monkeypatch.setattr(main, "_utcnow", lambda: _utc(now), raising=False)
        _write(slots, country_collect.COUNTRY_FIELDS, "key", slot, OLD_SLOT_KEY)
        _write(meta, META_COLUMNS, "date", index_date, OLD_INDEX_DATE)
        return status, {"ok": status == 200, "live_as_of": _latest(slot), "live_age_minutes": live_age,
                        "index_date": _latest(index_date), "index_age_days": index_age}

    return setup


# ---------- 상태 코드와 본문 ----------

@pytest.mark.parametrize("case", list(CASES))
def test_status_and_body(client: TestClient, scenario: Scenario, case: str) -> None:
    """경우마다 상태 코드와 본문 5개 값이 계약과 같다(경계 포함·내림, 최댓값, 없으면 null, 500 아님)."""
    expected_status, expected_body = scenario(case)
    assert _get_health(client) == (expected_status, expected_body)


@pytest.mark.parametrize("case", ["fresh_59m_3d", "live_61m_stale", "both_absent"])
def test_head_same_status_as_get(client: TestClient, scenario: Scenario, case: str) -> None:
    """HEAD 도 같은 데이터에서 GET 과 같은 상태 코드다(GET 만 등록하면 405)."""
    expected_status, _ = scenario(case)
    assert _get_health(client)[0] == expected_status
    assert client.head(HEALTH).status_code == expected_status


@pytest.mark.parametrize("case", ["fresh_59m_3d", "live_header_only"])
def test_live_as_of_same_as_api_live(client: TestClient, scenario: Scenario, case: str) -> None:
    """live_as_of 는 같은 슬롯 파일에서 /api/live 가 주는 as_of 와 같은 값이다(행이 없으면 둘 다 null)."""
    scenario(case)
    _, body = _get_health(client)
    res = client.get(LIVE_API)
    assert res.status_code == 200, res.text
    assert body["live_as_of"] == res.json()["as_of"]


def test_unchanged_files_not_reread(client: TestClient, scenario: Scenario, data_files: tuple[Path, Path],
                                    csv_reads: list[Path]) -> None:
    """_csv 캐시로 읽는다: 첫 요청은 두 파일을 읽고, 파일이 그대로면(mtime 같음) 다음 요청은 다시 읽지 않는다."""
    scenario("fresh_59m_3d")
    assert _get_health(client)[0] == 200
    assert {p.resolve() for p in data_files} <= set(csv_reads)
    csv_reads.clear()
    assert _get_health(client)[0] == 200
    assert csv_reads == []


# ---------- 상수와 현재 시각 ----------

def test_stale_constants() -> None:
    """기준 상수가 main 에 계약 값으로 있다."""
    got = (getattr(main, "LIVE_STALE_MINUTES", None), getattr(main, "INDEX_STALE_DAYS", None))
    assert got == (LIVE_STALE_MINUTES, INDEX_STALE_DAYS)


# fresh_59m_3d 의 59분·3일보다 1 작은 기준
@pytest.mark.parametrize(("name", "lowered"), [("LIVE_STALE_MINUTES", 58), ("INDEX_STALE_DAYS", 2)])
def test_thresholds_read_from_constants(client: TestClient, scenario: Scenario, monkeypatch: pytest.MonkeyPatch,
                                        name: str, lowered: int) -> None:
    """판정은 요청할 때 모듈 상수를 읽는다: 상수를 낮추면 같은 데이터(59분·3일)가 503 이다."""
    scenario("fresh_59m_3d")
    monkeypatch.setattr(main, name, lowered, raising=False)
    status, body = _get_health(client)
    assert (status, body["ok"]) == (503, False)


def test_utcnow_is_aware_utc_now() -> None:
    """바꿔 끼우지 않은 main._utcnow() 는 시간대 있는 UTC 현재 시각이다(지역 시각이면 한국에서 9시간 어긋난다)."""
    got = main._utcnow()
    assert got.utcoffset() == timedelta(0), got
    assert abs(got - datetime.now(timezone.utc)) < CLOCK_TOLERANCE
