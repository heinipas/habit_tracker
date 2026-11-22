import os
import sys
from pathlib import Path

# Make `app` importable and satisfy module-level Settings.from_env() at import time.
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("API_KEY", "test-secret")
os.environ.setdefault("CORS_ORIGINS", "")
os.environ.setdefault("DB_PATH", ":memory:")

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

API_KEY = "test-secret"


@pytest.fixture
def client(tmp_path: Path):
    settings = Settings(
        api_key=API_KEY,
        cors_origins=[],
        db_path=str(tmp_path / "test.sqlite"),
        version="0.0.0-test",
    )
    app = create_app(settings)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {API_KEY}"}
