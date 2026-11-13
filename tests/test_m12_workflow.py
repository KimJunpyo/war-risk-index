"""M12 이슈 #52 15분 갱신 워크플로(.github/workflows/refresh.yml) 정적 검사.

계약
- 예약: 정각을 피한 15분 간격 cron(Actions 예약은 정각에 붐벼 늦거나 빠진다)과 수동 실행(workflow_dispatch)
- concurrency 그룹 하나, cancel-in-progress false: 실행이 겹치면 두 실행이 R2 manifest 를 서로 덮어쓴다
- Python 3.12(batch.py 의 hashlib.file_digest 는 3.11 이상), TZ Asia/Seoul(서버와 같은 로컬 날짜. RUNBOOK 1.3)
- batch.py 가 읽는 R2 환경변수 4개와 공공데이터 키를 시크릿에서 받고, 시크릿은 batch 단계에만 준다
- timeout-minutes 가 있다
"""

from pathlib import Path
from typing import Any

import yaml

import batch
import data_go_kr

WORKFLOW = Path(__file__).resolve().parents[1] / ".github" / "workflows" / "refresh.yml"
CRON = "7,22,37,52 * * * *"
BATCH_RUN = "python batch.py"


def _workflow() -> tuple[dict[str, Any], dict[str, Any]]:
    """(워크플로 전체, on 블록). PyYAML(YAML 1.1)은 키 on 을 True 로 읽는다."""
    wf = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    return wf, wf.get("on", wf.get(True))


def _job() -> dict[str, Any]:
    (job,) = _workflow()[0]["jobs"].values()
    return job


def test_schedule_every_15_minutes_off_the_hour() -> None:
    _, on = _workflow()
    assert [s["cron"] for s in on["schedule"]] == [CRON]
    assert "workflow_dispatch" in on


def test_runs_wait_instead_of_overlapping() -> None:
    wf, _ = _workflow()
    assert wf["concurrency"]["group"]
    assert wf["concurrency"]["cancel-in-progress"] is False


def test_runtime_settings() -> None:
    job = _job()
    assert job["timeout-minutes"] > 0
    assert job["env"]["TZ"] == "Asia/Seoul"
    setup = next(s for s in job["steps"] if str(s.get("uses", "")).startswith("actions/setup-python"))
    assert str(setup["with"]["python-version"]) == "3.12"
    assert any(s.get("run", "").strip() == "pip install -r backend/requirements.txt" for s in job["steps"])


def test_secrets_only_on_batch_step() -> None:
    job = _job()
    (step,) = [s for s in job["steps"] if s.get("run", "").strip() == BATCH_RUN]
    names = {*batch.R2_ENV, data_go_kr.KEY_ENV}
    assert step["env"] == {name: f"${{{{ secrets.{name} }}}}" for name in names}
    others = [s for s in job["steps"] if s is not step]
    assert "secrets." not in str(others) + str(job.get("env", {}))
