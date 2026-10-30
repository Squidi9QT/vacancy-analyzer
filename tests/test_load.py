"""Тесты загрузки на настоящем PostgreSQL (база TEST_DATABASE_URL)."""

from __future__ import annotations

import copy
from datetime import date

import pytest

from src.config import FIXTURE_WORLD, SEARCH_QUERIES
from src.dates import parse_hh_datetime
from src.extract import FixtureClient
from src.extract.base import BaseClient
from src.load import repository as repo
from src.pipeline import day_slices, end_of_day, run_load
from src.transform import transform_vacancy

AS_OF = end_of_day(date(2026, 10, 30))
TABLES = ["vacancy", "vacancy_snapshot", "vacancy_skill", "skill", "employer", "area", "currency"]


def counts(conn) -> dict[str, int]:
    return {t: conn.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in TABLES}  # noqa: S608 — имена из константы


def test_load_is_idempotent(db):
    """Главный тест ADR-005: два запуска подряд → одинаковое число строк."""
    run_load(db, FixtureClient(FIXTURE_WORLD, AS_OF), AS_OF, 7, "fixtures")
    first = counts(db)
    assert first["vacancy"] > 0
    stats = run_load(db, FixtureClient(FIXTURE_WORLD, AS_OF), AS_OF, 7, "fixtures")
    assert counts(db) == first
    assert stats.get("new", 0) == 0 and stats.get("changed", 0) == 0


def test_second_run_does_not_download_details_again(db):
    """«Не качаем лишнее»: при повторе — только страницы поиска, без карточек."""
    first = FixtureClient(FIXTURE_WORLD, AS_OF)
    run_load(db, first, AS_OF, 7, "fixtures")
    second = FixtureClient(FIXTURE_WORLD, AS_OF)
    run_load(db, second, AS_OF, 7, "fixtures")
    n_vacancies = counts(db)["vacancy"]
    assert first.requests_made - second.requests_made == n_vacancies


def test_load_run_journal(db):
    run_load(db, FixtureClient(FIXTURE_WORLD, AS_OF), AS_OF, 3, "fixtures")
    status, processed, finished = db.execute(
        "SELECT status, vacancies_processed, finished_at IS NOT NULL FROM load_run").fetchone()
    assert status == "success" and processed > 0 and finished


class ExplodingClient(FixtureClient):
    """Падает на N-й детальной карточке — имитация сбоя посреди загрузки."""

    def __init__(self, *args, fail_on: int):
        super().__init__(*args)
        self.fail_on, self.details = fail_on, 0

    def get_vacancy(self, hh_id):
        self.details += 1
        if self.details == self.fail_on:
            raise ConnectionError("сеть пропала")
        return super().get_vacancy(hh_id)


def test_failed_run_is_logged_and_rerun_completes(db):
    """Что будет при падении на середине: записанное остаётся, запуск помечен failed,
    перезапуск догружает остальное без дублей."""
    with pytest.raises(ConnectionError):
        run_load(db, ExplodingClient(FIXTURE_WORLD, AS_OF, fail_on=10), AS_OF, 7, "fixtures")
    status, error = db.execute("SELECT status, error_text FROM load_run").fetchone()
    assert status == "failed" and "сеть пропала" in error
    assert counts(db)["vacancy"] == 9  # 9 вакансий успели записаться, 10-я откатилась целиком

    run_load(db, FixtureClient(FIXTURE_WORLD, AS_OF), AS_OF, 7, "fixtures")
    after_rerun = counts(db)
    run_load(db, FixtureClient(FIXTURE_WORLD, AS_OF), AS_OF, 7, "fixtures")
    assert counts(db) == after_rerun


class OneVacancyClient(BaseClient):
    """Источник с одной вакансией, которую можно менять между запусками."""

    def __init__(self, detail):
        self.detail = detail

    def search(self, text, date_from, date_to, page, per_page):
        published = parse_hh_datetime(self.detail["published_at"])
        hit = text == SEARCH_QUERIES["system_analyst"] and date_from <= published < date_to
        items = [self.detail] if hit else []
        return {"items": items, "found": len(items), "pages": 1 if items else 0, "page": page}

    def get_vacancy(self, hh_id):
        return self.detail

    def get_dictionaries(self):
        return {"currency": [{"code": "RUR", "name": "Рубли", "rate": 1}]}


def test_history_scd2(db, load_json):
    """Изменение зарплаты → вторая версия; первая закрыта; first_seen_at не меняется."""
    detail = load_json("vacancy_detail.json")
    run_load(db, OneVacancyClient(detail), end_of_day(date(2026, 10, 25)), 1, "fixtures")

    changed = copy.deepcopy(detail)
    changed["salary_range"]["to"] = 180000
    changed["published_at"] = "2026-10-27T10:00:00+0300"
    run_load(db, OneVacancyClient(changed), end_of_day(date(2026, 10, 27)), 1, "fixtures")
    run_load(db, OneVacancyClient(changed), end_of_day(date(2026, 10, 27)), 1, "fixtures")  # повтор

    rows = db.execute(
        "SELECT salary_to, valid_to IS NULL FROM vacancy_snapshot ORDER BY valid_from").fetchall()
    assert rows == [(160000, False), (180000, True)]
    # AT TIME ZONE обязателен: ::date берёт пояс СЕССИИ. На машине разработки это Asia/Tomsk (+7),
    # и 23:59 по Москве превращалось в следующий день — тест падал. Реальная ловушка, см. «Подводные камни».
    first_seen, last_seen, salary_to = db.execute(
        "SELECT (first_seen_at AT TIME ZONE 'Europe/Moscow')::date, "
        "(last_seen_at AT TIME ZONE 'Europe/Moscow')::date, salary_to FROM vacancy").fetchone()
    assert (first_seen, last_seen, salary_to) == (date(2026, 10, 25), date(2026, 10, 27), 180000)


def test_older_data_does_not_overwrite_newer(db, load_json):
    """Перезапуск за прошлую дату не «откатывает» текущее состояние."""
    detail = load_json("vacancy_detail.json")
    newer = copy.deepcopy(detail)
    newer["salary_range"]["to"] = 180000
    newer["published_at"] = "2026-10-27T10:00:00+0300"
    db.execute("INSERT INTO currency VALUES ('RUR', 'Рубли', 1)")
    run_id = repo.start_run(db, end_of_day(date(2026, 10, 27)), "fixtures", {})
    repo.upsert_vacancy(db, transform_vacancy(newer, "system_analyst"), end_of_day(date(2026, 10, 27)), run_id)
    result = repo.upsert_vacancy(db, transform_vacancy(detail, "system_analyst"), end_of_day(date(2026, 10, 25)), run_id)
    assert not result.is_new and not result.is_changed
    assert db.execute("SELECT salary_to FROM vacancy").fetchone()[0] == 180000
    assert db.execute("SELECT count(*) FROM vacancy_snapshot").fetchone()[0] == 1


def test_sql_injection_in_name_is_stored_as_text(db, load_json):
    """Параметризованный запрос: «вредное» название сохраняется как обычный текст."""
    detail = load_json("vacancy_detail.json") | {"name": "Аналитик'); DROP TABLE vacancy; --"}
    db.execute("INSERT INTO currency VALUES ('RUR', 'Рубли', 1)")
    run_id = repo.start_run(db, AS_OF, "fixtures", {})
    repo.upsert_vacancy(db, transform_vacancy(detail, "system_analyst"), AS_OF, run_id)
    assert db.execute("SELECT name FROM vacancy").fetchone()[0] == "Аналитик'); DROP TABLE vacancy; --"


def test_check_constraint_rejects_bad_salary(db):
    """Последняя линия защиты: даже если transform пропустил ошибку, база не примет from > to."""
    import psycopg
    db.execute("INSERT INTO area (hh_id, name) VALUES ('1', 'Москва')")
    db.execute("INSERT INTO currency VALUES ('RUR', 'Рубли', 1)")
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("""INSERT INTO vacancy (hh_id, name, role, area_id, salary_from, salary_to, currency_code,
                      created_at, published_at, content_hash, first_seen_at, last_seen_at)
                      VALUES ('x', 'x', 'other', 1, 200, 100, 'RUR', now(), now(), 'h', now(), now())""")


def test_day_slices_cover_window_without_gaps():
    slices = day_slices(AS_OF, 3)
    assert len(slices) == 3
    assert slices[0][0] == AS_OF.replace(day=27) and slices[-1][1] == AS_OF
    assert all(a[1] == b[0] for a, b in zip(slices, slices[1:]))
