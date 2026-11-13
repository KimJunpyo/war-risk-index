"""#47 UCDP 재집계 최대 메모리 줄이기: GED zip 읽기와 opponents 집계.

계약
- GED 확정판 zip 은 zipfile 로 연 핸들을 pd.read_csv 에 넘긴다. zip 경로를 넘기면 pandas 가 압축을 통째로 풀어
  최대 메모리가 크게 는다(확정판은 풀면 261MB). low_memory=False 도 49열을 한 번에 토큰화해서 쓰지 않는다.
- zip 으로 받은 확정판은 같은 내용의 CSV 와 같은 집계(월별·상대·기준일)를 만든다. 후보판은 지금처럼 CSV 경로로 읽는다.
- opponents 는 루프 전에 (side_a, side_b, 월, 나라)로 사망자를 먼저 합친다. 사망자는 더하기만 하므로 사건마다
  펼친 결과와 같고, 당사자 분해(_parties)는 합친 행마다 한 번씩만 돈다.

ucdp 의 상대 경로(data/...)는 tmp_path 아래로 chdir 해서 격리하고, latest_urls 를 바꿔 끼워 ucdp.uu.se 에 접속하지 않는다.
"""

import io
import zipfile
from pathlib import Path

import pandas as pd
import pytest

import ucdp

BASE_URL = "https://ucdp.invalid/downloads"  # latest_urls 가 돌려줄 가짜 주소. 파일이 이미 있어 받지 않는다
GED_ZIP = "ged991-csv.zip"  # 확정판 zip(실제: ged261-csv.zip)
GED_MEMBER = "GEDEvent_v99_1.csv"  # zip 안 CSV(실제: GEDEvent_v26_1.csv)
GED_CSV = "ged991.csv"  # 같은 내용을 압축하지 않은 비교용 파일
CANDIDATE = "GEDEvent_v99_01_99_09.csv"  # 후보판(실제처럼 CSV)
RUS, UKR = "Government of Russia (Soviet Union)", "Government of Ukraine"


def _events(rows: list[tuple]) -> pd.DataFrame:
    """(id, 유형, 나라, 시작, 끝, 사망자, side_a, side_b) → GED 모양 표. 실제처럼 읽지 않는 열(region)도 섞는다."""
    cols = ["id", "type_of_violence", "country", "date_start", "date_end", "best", "side_a", "side_b"]
    df = pd.DataFrame(rows, columns=cols)
    df.insert(1, "region", "x")
    return df


GED = _events([
    (1, 1, "Ukraine", "2025-12-05 00:00:00.000", "2025-12-05 00:00:00.000", 10, RUS, UKR),
    (2, 1, "Ukraine", "2025-12-20 00:00:00.000", "2025-12-20 00:00:00.000", 5, RUS, f"XXX1, {UKR}"),
    (3, 2, "Sudan", "2025-11-02 00:00:00.000", "2025-11-02 00:00:00.000", 4, "RSF", "SAF"),
    (4, 3, "Myanmar (Burma)", "2025-10-01 00:00:00.000", "2025-10-01 00:00:00.000", 2, "Government of Myanmar (Burma)",
     "Civilians"),
])
CANDIDATE_EVENTS = _events([
    (2, 1, "Ukraine", "2025-12-20 00:00:00.000", "2025-12-20 00:00:00.000", 6, RUS, f"XXX1, {UKR}"),  # 같은 id 는 후보판 값
    (5, 1, "Lebanon", "2026-01-03 00:00:00.000", "2026-01-04 00:00:00.000", 50, "Government of Israel", "Hezbollah"),
])


def _run_update(folder: Path, as_zip: bool, monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    """folder 에 확정판(zip 또는 CSV)과 후보판을 두고 update() 를 돌려, 결과 파일 3개의 내용을 돌려준다."""
    data = folder / ucdp.UCDP_DIR
    data.mkdir(parents=True)
    if as_zip:
        with zipfile.ZipFile(data / GED_ZIP, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(GED_MEMBER, GED.to_csv(index=False))
    else:
        GED.to_csv(data / GED_CSV, index=False)
    CANDIDATE_EVENTS.to_csv(data / CANDIDATE, index=False)
    ged_name = GED_ZIP if as_zip else GED_CSV
    monkeypatch.chdir(folder)
    monkeypatch.setattr(ucdp, "latest_urls", lambda: [f"{BASE_URL}/ged/{ged_name}", f"{BASE_URL}/candidateged/{CANDIDATE}"])
    assert ucdp.update() is True
    outputs = [ucdp.MONTHLY_FILE, ucdp.OPPONENT_FILE, Path(str(ucdp.MONTHLY_FILE) + ".asof")]
    return {str(p): p.read_text(encoding="utf-8") for p in outputs}


def test_zip_read_through_handle_and_same_result_as_csv(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """zip 은 핸들로 읽고(low_memory=False 없음), 결과 세 파일이 같은 내용의 CSV 로 읽은 것과 같다."""
    calls: list[tuple[object, dict]] = []
    real_read_csv = pd.read_csv

    def spy(src: object, *args: object, **kwargs: object) -> pd.DataFrame:
        calls.append((src, kwargs))
        return real_read_csv(src, *args, **kwargs)

    monkeypatch.setattr(pd, "read_csv", spy)
    from_zip = _run_update(tmp_path / "zip", True, monkeypatch)
    assert len(calls) == 2  # 확정판·후보판
    assert not [src for src, _ in calls if str(src).endswith(".zip")]  # zip 경로를 pandas 에 넘기지 않는다
    assert all(kwargs.get("low_memory", True) is not False for _, kwargs in calls)

    from_csv = _run_update(tmp_path / "csv", False, monkeypatch)
    assert from_zip == from_csv

    monthly = real_read_csv(io.StringIO(from_zip[str(ucdp.MONTHLY_FILE)]))
    ukr = monthly[(monthly["iso3"] == "UKR") & (monthly["month"] == "2025-12")]
    assert ukr[["type", "deaths", "events"]].values.tolist() == [["state", 16, 2]]  # id 2 는 후보판 값 6
    assert from_zip[str(ucdp.MONTHLY_FILE) + ".asof"] == "2026-01-04"


def test_opponents_sums_before_splitting_parties(monkeypatch: pytest.MonkeyPatch) -> None:
    """같은 (양측, 월, 나라) 사건은 먼저 합쳐 당사자 분해를 한 번만 하고, 결과는 사건마다 펼친 것과 같다."""
    events = _events([
        (1, 1, "Ukraine", "2026-01-05", "2026-01-05", 10, RUS, UKR),
        (2, 1, "Ukraine", "2026-01-20", "2026-01-20", 5, RUS, UKR),
        (3, 1, "Ukraine", "2026-01-28", "2026-01-28", 7, RUS, UKR),
        (4, 1, "Lebanon", "2026-03-01", "2026-03-01", 50, "Government of Israel", "Hezbollah"),
        (5, 1, "Lebanon", "2026-03-15", "2026-03-15", 30, "Government of Israel", "Hezbollah"),
        (6, 3, "Sudan", "2026-02-01", "2026-02-01", 3, "Government of Sudan", "Civilians"),  # type 3 은 제외
    ])
    calls: list[str] = []
    real_parties = ucdp._parties

    def counting(side: str) -> list[str]:
        calls.append(side)
        return real_parties(side)

    monkeypatch.setattr(ucdp, "_parties", counting)
    got = {(r.iso3, r.opponent): r.deaths for r in ucdp.opponents(events).itertuples()}
    assert got == {("RUS", UKR): 22, ("UKR", RUS): 22,
                   ("ISR", "Hezbollah"): 80, ("LBN", "Government of ISR"): 80}  # 자국 영토 외국 교전
    assert len(calls) == 4  # 합친 행 2개 × 양측. 사건마다 돌면 10번


def test_self_check() -> None:
    """중복 id·미상 행위자·자국 영토 외국 교전 사례가 그대로 맞다."""
    ucdp.self_check()
