"""#52 live.update 가 슬롯 받기 실패를 로그에 남기는지 본다.

2026-11-16 06:37Z 부터 Actions 러너에서 새 GDELT 2.0 슬롯이 하나도 붙지 않아 실시간이 06:30Z 에 멈췄는데, 로그에 아무것도
남지 않았다. 404 가 아닌 HTTP 오류(403·429·503 등)를 기록 없이 건너뛰었기 때문이다. 네트워크는 쓰지 않는다.

계약
- 슬롯 받기가 HTTP 오류로 실패하면 코드와 함께 "[live 실패] <key>: HTTP <코드>" 를 남기고 그 슬롯은 건너뛴다.
- 404 는 GDELT 가 건너뛴 슬롯이라 이 프로세스에서는 다시 받지 않는다(_missing). 다른 코드는 다음 실행에 다시 받는다.
"""

import urllib.error
from pathlib import Path

import pandas as pd
import pytest

import live

LATEST = "20261116071500"


@pytest.fixture
def live_tmp(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """실시간 파일을 tmp 로 옮기고, 최신 슬롯을 고정해 1시간(슬롯 4개)만 받게 한다."""
    for name in ("COUNTRY_LIVE", "DYAD_LIVE", "CAT_LIVE"):
        monkeypatch.setattr(live, name, tmp_path / getattr(live, name).name)
    monkeypatch.setattr(live, "LIVE_DIR", tmp_path)
    monkeypatch.setattr(live, "TMP_DIR", tmp_path / "tmp")
    monkeypatch.setattr(live, "_missing", set())
    monkeypatch.setattr(live, "KEEP_HOURS", 1)
    monkeypatch.setattr(live, "latest_slot", lambda: pd.Timestamp(LATEST))
    return tmp_path


def test_fetch_errors_are_logged(live_tmp: Path, monkeypatch: pytest.MonkeyPatch,
                                 capsys: pytest.CaptureFixture[str]) -> None:
    codes = {"20261116064500": 403, "20261116070000": 404}

    def fake_fetch(key: str) -> tuple[list[dict], list[dict], list[dict]]:
        if key in codes:
            raise urllib.error.HTTPError(f"https://data.example/{key}", codes[key], "가짜 오류", {}, None)
        return [], [], []

    monkeypatch.setattr(live, "fetch_slot", fake_fetch)
    live.update()
    out = capsys.readouterr().out
    assert "[live 실패] 20261116064500: HTTP 403" in out  # 예전에는 404 가 아니면 아무것도 남기지 않았다
    assert "[live 실패] 20261116070000: HTTP 404" in out
    assert live._missing == {"20261116070000"}  # 404 만 이 프로세스에서 다시 받지 않는다
