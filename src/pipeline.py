"""Оркестрация ETL: связывает extract → transform → load для одного запуска.

Порядок одного запуска:
  1. load_run ← 'running' (сразу коммит, чтобы запись пережила падение);
  2. курсы валют из /dictionaries;
  3. для каждой роли и каждого дня окна: страницы поиска;
  4. вакансия уже есть и не поднималась → только last_seen_at (детальную карточку не качаем);
     новая или поднятая → детальная карточка → transform → upsert (одна транзакция на вакансию);
  5. load_run ← 'success' со счётчиками, или 'failed' с текстом ошибки.
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import date, datetime, timedelta

import psycopg

from src.config import MSK, SEARCH_QUERIES
from src.dates import parse_hh_datetime
from src.extract.base import BaseClient
from src.load import repository as repo
from src.transform import TransformError, transform_currencies, transform_vacancy

log = logging.getLogger(__name__)


def day_slices(as_of: datetime, days: int) -> list[tuple[datetime, datetime]]:
    """Окно [as_of - days, as_of) нарезанное на сутки.

    Почему по суткам: API отдаёт максимум 2000 результатов на запрос. За сутки
    вакансий одной роли намного меньше, поэтому так мы не упираемся в лимит.
    """
    if days < 1:
        raise ValueError("days должно быть >= 1")
    start = as_of - timedelta(days=days)
    slices, t = [], start
    while t < as_of:
        nxt = min(t + timedelta(days=1), as_of)
        slices.append((t, nxt))
        t = nxt
    return slices


def run_load(conn: psycopg.Connection, client: BaseClient, as_of: datetime, days: int,
             source: str) -> dict:
    """Один запуск загрузки за `days` дней до `as_of`.

    Вход: соединение (autocommit), клиент источника, момент наблюдения, окно в днях,
    имя источника для журнала. Выход: словарь счётчиков {processed, new, changed, skipped}.
    Ошибка: любое исключение → load_run.status = 'failed' с текстом ошибки, исключение
    пробрасывается дальше (CLI вернёт код 1). Уже записанные вакансии остаются: каждая
    в своей транзакции, перезапуск их не задублирует (ADR-005).
    """
    run_id = repo.start_run(conn, as_of, source, {"days": days, "roles": list(SEARCH_QUERIES)})
    stats: Counter = Counter()
    log.info("Запуск #%s: источник=%s, as_of=%s, окно=%s дн.", run_id, source, as_of.isoformat(), days)
    try:
        repo.upsert_currencies(conn, transform_currencies(client.get_dictionaries()))
        seen: set[str] = set()  # одна вакансия может найтись двумя запросами — обрабатываем один раз
        for role, text in SEARCH_QUERIES.items():
            for date_from, date_to in day_slices(as_of, days):
                items = [it for it in client.iter_search(text, date_from, date_to) if it["id"] not in seen]
                seen.update(it["id"] for it in items)
                stats["processed"] += len(items)
                known = repo.known_vacancies(conn, [it["id"] for it in items])
                unchanged = [it["id"] for it in items
                             if it["id"] in known and known[it["id"]] == parse_hh_datetime(it["published_at"])]
                repo.touch_vacancies(conn, unchanged, as_of, run_id)
                for it in items:
                    if it["id"] in unchanged:
                        continue
                    _process_one(conn, client, it["id"], role, as_of, run_id, stats)
        repo.finish_run(conn, run_id, "success", stats)
        log.info("Запуск #%s завершён: %s", run_id, dict(stats))
        return dict(stats)
    except Exception as exc:
        log.exception("Запуск #%s упал", run_id)
        repo.finish_run(conn, run_id, "failed", stats, error_text=f"{type(exc).__name__}: {exc}")
        raise


def _process_one(conn, client, hh_id, role, as_of, run_id, stats) -> None:
    """Скачать карточку, преобразовать, записать. Битая карточка пропускается с WARNING."""
    detail = client.get_vacancy(hh_id)
    if detail is None:
        log.warning("Вакансия %s пропала между поиском и запросом карточки (404)", hh_id)
        stats["skipped"] += 1
        return
    try:
        rec = transform_vacancy(detail, role)
    except TransformError as exc:
        log.warning("Пропускаем вакансию: %s", exc)
        stats["skipped"] += 1
        return
    result = repo.upsert_vacancy(conn, rec, as_of, run_id)
    stats["new"] += result.is_new
    stats["changed"] += result.is_changed


def end_of_day(d: date) -> datetime:
    """Конец суток по Москве: момент наблюдения для запуска «за этот день»."""
    return datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=MSK)
