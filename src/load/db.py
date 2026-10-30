"""Подключение к PostgreSQL и применение миграций.

Миграция — SQL-файл, который меняет схему (sql/001_schema.sql, sql/002_indexes.sql).
Файлы применяются по порядку имени. Все они написаны с IF NOT EXISTS,
поэтому повторное применение безопасно — отдельная таблица версий не нужна.
Цена: так нельзя «откатить» миграцию; для учебного проекта это приемлемо.
"""

from __future__ import annotations

import logging
from pathlib import Path

import psycopg

from src.config import PROJECT_ROOT

log = logging.getLogger(__name__)
SQL_DIR = PROJECT_ROOT / "sql"


def connect(url: str) -> psycopg.Connection:
    """Открыть соединение в режиме autocommit, транзакции — явно через conn.transaction().

    Почему autocommit=True, хотя мы любим транзакции: в psycopg 3 при autocommit=False
    ЛЮБОЙ запрос (даже SELECT) неявно открывает транзакцию, и тогда вложенный
    `with conn.transaction()` становится лишь точкой сохранения (SAVEPOINT) — ничего
    не коммитится до conn.commit(). Легко забыть и потерять все данные при выходе.
    С autocommit=True блок `with conn.transaction()` — это настоящие BEGIN … COMMIT,
    а одиночные SELECT выполняются сразу. Границы транзакций видны в коде.

    Ошибка: psycopg.OperationalError, если база недоступна — с понятным текстом
    о том, что проверить.
    """
    try:
        return psycopg.connect(url, autocommit=True)
    except psycopg.OperationalError as exc:
        raise psycopg.OperationalError(
            f"Не удалось подключиться к {url!r}. Запущен ли PostgreSQL "
            f"(docker compose up -d) и верен ли DATABASE_URL в .env?\n{exc}") from exc


def migration_files() -> list[Path]:
    """Миграции по порядку: 001_..., 002_..."""
    return sorted(SQL_DIR.glob("[0-9][0-9][0-9]_*.sql"))


def apply_migrations(conn: psycopg.Connection, files: list[Path] | None = None) -> None:
    """Выполнить SQL-файлы миграций в одной транзакции.

    Вход: соединение; список файлов (по умолчанию все). Ошибка: исключение psycopg,
    транзакция откатывается целиком — схема не останется «наполовину» созданной.
    """
    with conn.transaction():
        for path in files or migration_files():
            log.info("Применяем миграцию %s", path.name)
            conn.execute(path.read_text(encoding="utf-8"))
