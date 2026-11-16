"""공통 설정. 저장소 루트에서 실행: .venv\\Scripts\\python.exe -m pytest tests"""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
# main.py 가 루트의 수집 모듈(ai_threat, live 등)을 최상위 이름으로 import 함
sys.path.insert(0, str(ROOT))


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from backend.app.main import app

    return TestClient(app)
