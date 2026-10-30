"""Тест эндпоинта /api/summary на тестовой базе с данными фикстур."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from src.config import FIXTURE_WORLD, get_settings
from src.extract import FixtureClient
from src.pipeline import end_of_day, run_load


def test_summary(db, monkeypatch):
    as_of = end_of_day(date(2026, 10, 30))
    run_load(db, FixtureClient(FIXTURE_WORLD, as_of), as_of, 7, "fixtures")
    # API читает DATABASE_URL при каждом запросе — направляем его в тестовую базу
    monkeypatch.setenv("DATABASE_URL", get_settings().test_database_url)
    from src.api import app
    data = TestClient(app).get("/api/summary").json()
    assert data["vacancies"] > 0
    assert len(data["top_skills"]) == 5
    assert data["data_as_of"].startswith("2026-10-30")
