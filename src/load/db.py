"""Подключение к PostgreSQL и применение миграций."""

from __future__ import annotations

import logging
from pathlib import Path

import psycopg

from src.config import PROJECT_ROOT

log = logging.getLogger(__name__)
SQL_DIR = PROJECT_ROOT / "sql"


def connect(url: str) -> psycopg.Connection:
    """Открыть соединение в режиме autocommit, транзакции — явно через conn.transaction()."""
    try:
        # autocommit: иначе вложенный conn.transaction() в psycopg 3 становится SAVEPOINT без COMMIT
        return psycopg.connect(url, autocommit=True)
    except psycopg.OperationalError as exc:
        raise psycopg.OperationalError(
            f"Не удалось подключиться к {url!r}. Запущен ли PostgreSQL "
            f"(docker compose up -d) и верен ли DATABASE_URL в .env?\n{exc}") from exc


def migration_files() -> list[Path]:
    """Миграции по порядку: 001_..., 002_..."""
    return sorted(SQL_DIR.glob("[0-9][0-9][0-9]_*.sql"))


def apply_migrations(conn: psycopg.Connection, files: list[Path] | None = None) -> None:
    """Выполнить SQL-файлы миграций в одной транзакции."""
    with conn.transaction():
        for path in files or migration_files():
            log.info("Применяем миграцию %s", path.name)
            conn.execute(path.read_text(encoding="utf-8"))
