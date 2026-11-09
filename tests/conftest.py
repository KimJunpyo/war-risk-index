"""공통 설정. 저장소 루트에서 실행: .venv\\Scripts\\python.exe -m pytest tests"""

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
# main.py 가 루트의 수집 모듈(ai_threat, live 등)을 최상위 이름으로 import 함
sys.path.insert(0, str(ROOT))
# main.py import 전에 꺼야 lifespan 이 GDELT·뉴스룸 수집 스레드를 띄우지 않음
os.environ["LIVE_UPDATES"] = "0"


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from backend.app.main import app

    # with 없이 쓰면 lifespan 자체를 타지 않음 (LIVE_UPDATES=0 과 이중 안전장치)
    return TestClient(app)
