"""Настройки проекта: читаются из переменных окружения и файла .env."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

MSK = timezone(timedelta(hours=3))

SEARCH_QUERIES: dict[str, str] = {
    "system_analyst": "системный аналитик OR system analyst",
    "data_analyst": "аналитик данных OR data analyst OR BI-аналитик",
    "backend_junior": "junior python OR junior backend OR младший разработчик OR стажёр python",
}

FIXTURE_WORLD = PROJECT_ROOT / "tests" / "fixtures" / "hh_world.json"


@dataclass(frozen=True)
class Settings:
    """Все настройки в одном неизменяемом объекте (frozen: случайно не перезапишешь)."""

    database_url: str
    test_database_url: str
    data_source: str
    fixture_now: datetime
    hh_user_agent: str
    hh_access_token: str | None
    hh_request_delay: float
    log_level: str


def get_settings() -> Settings:
    """Собрать настройки из окружения."""
    source = os.getenv("DATA_SOURCE", "fixtures")
    if source not in ("fixtures", "api"):
        raise ValueError(f"DATA_SOURCE должен быть 'fixtures' или 'api', получено: {source!r}")
    now_str = os.getenv("FIXTURE_NOW", "2026-10-30")
    fixture_now = datetime.strptime(now_str, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=MSK)
    return Settings(
        database_url=os.getenv("DATABASE_URL", "postgresql:///vacancies"),
        test_database_url=os.getenv("TEST_DATABASE_URL", "postgresql:///vacancies_test"),
        data_source=source,
        fixture_now=fixture_now,
        hh_user_agent=os.getenv("HH_USER_AGENT", "VacancyAnalyzer/0.1 (student@example.com)"),
        hh_access_token=os.getenv("HH_ACCESS_TOKEN") or None,
        hh_request_delay=float(os.getenv("HH_REQUEST_DELAY", "0.5")),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
    )
