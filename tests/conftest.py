"""Общие фикстуры pytest."""

from __future__ import annotations

import json
from pathlib import Path

import psycopg
import pytest

from src.config import get_settings
from src.load.db import apply_migrations, connect

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def load_json():
    """Прочитать JSON из tests/fixtures/api/."""
    def _load(name: str) -> dict:
        return json.loads((FIXTURES / "api" / name).read_text(encoding="utf-8"))
    return _load


@pytest.fixture
def db():
    """Чистая тестовая база на каждый тест."""
    url = get_settings().test_database_url
    try:
        conn = connect(url)
    except psycopg.OperationalError as exc:
        pytest.skip(f"PostgreSQL недоступен: {exc}")
    conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    apply_migrations(conn)
    yield conn
    conn.close()
