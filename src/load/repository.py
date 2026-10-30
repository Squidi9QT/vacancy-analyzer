"""SQL-операции загрузки. Все запросы параметризованы (%s) — защита от SQL-инъекций.

Почему нельзя f-строкой: f"... WHERE name = '{name}'" с названием вакансии
"Аналитик'); DROP TABLE vacancy; --" выполнит чужую команду. С %s драйвер
передаёт значение отдельно от текста запроса, и оно никогда не станет кодом.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime

import psycopg

from src.transform.records import AreaRecord, EmployerRecord, VacancyRecord


@dataclass
class UpsertResult:
    vacancy_id: int
    is_new: bool       # вакансии не было в базе
    is_changed: bool   # вакансия была, но изменилась (новая версия в истории)


# ---------- журнал запусков ----------

def start_run(conn: psycopg.Connection, as_of: datetime, source: str, params: dict) -> int:
    """Создать запись load_run со статусом running и СРАЗУ закоммитить.

    Почему сразу: если загрузка упадёт, запись о запуске должна остаться.
    Если бы она была в общей транзакции, откат стёр бы и её.
    """
    with conn.transaction():
        row = conn.execute(
            "INSERT INTO load_run (as_of, source, params) VALUES (%s, %s, %s) RETURNING id",
            (as_of, source, json.dumps(params, ensure_ascii=False)),
        ).fetchone()
    return row[0]


def finish_run(conn: psycopg.Connection, run_id: int, status: str, stats: dict,
               error_text: str | None = None) -> None:
    """Закрыть запуск: статус, время конца, счётчики, текст ошибки."""
    with conn.transaction():
        conn.execute(
            """UPDATE load_run
                  SET finished_at = now(), status = %s, error_text = %s,
                      vacancies_processed = %s, vacancies_new = %s,
                      vacancies_changed = %s, vacancies_skipped = %s
                WHERE id = %s""",
            (status, error_text, stats.get("processed", 0), stats.get("new", 0),
             stats.get("changed", 0), stats.get("skipped", 0), run_id),
        )


# ---------- справочники ----------

def upsert_currencies(conn: psycopg.Connection, rows: list[tuple[str, str, float]]) -> None:
    """Курсы валют: вставить или обновить курс."""
    with conn.transaction():
        with conn.cursor() as cur:
            cur.executemany(
                """INSERT INTO currency (code, name, rate) VALUES (%s, %s, %s)
                   ON CONFLICT (code) DO UPDATE
                      SET name = EXCLUDED.name, rate = EXCLUDED.rate, updated_at = now()""",
                rows,
            )


def upsert_area(conn: psycopg.Connection, area: AreaRecord) -> int:
    """Город → id. DO UPDATE (а не DO NOTHING), потому что DO NOTHING при конфликте
    не возвращает строку в RETURNING, и пришлось бы делать второй SELECT."""
    return conn.execute(
        """INSERT INTO area (hh_id, name) VALUES (%s, %s)
           ON CONFLICT (hh_id) DO UPDATE SET name = EXCLUDED.name
           RETURNING id""",
        (area.hh_id, area.name),
    ).fetchone()[0]


def upsert_employer(conn: psycopg.Connection, emp: EmployerRecord | None) -> int | None:
    """Работодатель → id; None для анонимного."""
    if emp is None:
        return None
    return conn.execute(
        """INSERT INTO employer (hh_id, name, is_trusted) VALUES (%s, %s, %s)
           ON CONFLICT (hh_id) DO UPDATE SET name = EXCLUDED.name, is_trusted = EXCLUDED.is_trusted
           RETURNING id""",
        (emp.hh_id, emp.name, emp.is_trusted),
    ).fetchone()[0]


def upsert_skills(conn: psycopg.Connection, rec: VacancyRecord) -> list[int]:
    """Навыки вакансии → список id навыков (новые навыки добавляются в справочник)."""
    ids = []
    for skill in rec.skills:
        ids.append(conn.execute(
            # name не обновляем: в справочнике остаётся написание первой встречи
            """INSERT INTO skill (name, name_normalized) VALUES (%s, %s)
               ON CONFLICT (name_normalized) DO UPDATE SET name = skill.name
               RETURNING id""",
            (skill.name, skill.name_normalized),
        ).fetchone()[0])
    return ids


# ---------- вакансия ----------

def known_vacancies(conn: psycopg.Connection, hh_ids: list[str]) -> dict[str, datetime]:
    """{hh_id: published_at} для уже загруженных вакансий из списка.

    Нужен, чтобы не запрашивать детальную карточку, если вакансия не поднималась
    (published_at тот же) — экономим запросы к API.
    """
    if not hh_ids:
        return {}
    rows = conn.execute(
        "SELECT hh_id, published_at FROM vacancy WHERE hh_id = ANY(%s)", (hh_ids,)
    ).fetchall()
    return dict(rows)


def touch_vacancies(conn: psycopg.Connection, hh_ids: list[str], seen_at: datetime, run_id: int) -> None:
    """Вакансии видели в выдаче, но они не изменились — обновить только last_seen_at.

    GREATEST: если перезапустить загрузку за старую дату, last_seen_at не «откатится» назад.
    """
    if not hh_ids:
        return
    with conn.transaction():
        conn.execute(
            """UPDATE vacancy
                  SET last_seen_at = GREATEST(last_seen_at, %s), last_load_run_id = %s
                WHERE hh_id = ANY(%s)""",
            (seen_at, run_id, hh_ids),
        )


def upsert_vacancy(conn: psycopg.Connection, rec: VacancyRecord, seen_at: datetime,
                   run_id: int) -> UpsertResult:
    """Записать вакансию целиком: справочники, саму вакансию, навыки, историю.

    Всё в ОДНОЙ транзакции: либо вакансия записана полностью (строка + навыки + версия),
    либо не записана вообще. Ошибка: исключение psycopg, транзакция откатывается.

    Как отличить вставку от обновления в одном запросе: системная колонка xmax.
    У только что вставленной строки xmax = 0, у обновлённой — номер транзакции.
    Это особенность PostgreSQL; в других СУБД понадобился бы отдельный SELECT.
    """
    with conn.transaction():
        area_id = upsert_area(conn, rec.area)
        employer_id = upsert_employer(conn, rec.employer)
        row = conn.execute(
            """INSERT INTO vacancy (hh_id, name, role, employer_id, area_id,
                                    salary_from, salary_to, currency_code, salary_gross,
                                    experience, schedule, created_at, published_at, content_hash,
                                    first_seen_at, last_seen_at, first_load_run_id, last_load_run_id)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (hh_id) DO UPDATE SET
                   name = EXCLUDED.name, role = EXCLUDED.role,
                   employer_id = EXCLUDED.employer_id, area_id = EXCLUDED.area_id,
                   salary_from = EXCLUDED.salary_from, salary_to = EXCLUDED.salary_to,
                   currency_code = EXCLUDED.currency_code, salary_gross = EXCLUDED.salary_gross,
                   experience = EXCLUDED.experience, schedule = EXCLUDED.schedule,
                   published_at = EXCLUDED.published_at, content_hash = EXCLUDED.content_hash,
                   -- first_seen_at и first_load_run_id НАМЕРЕННО не обновляем:
                   -- «когда впервые увидели» не должно меняться при перезапусках.
                   last_seen_at = GREATEST(vacancy.last_seen_at, EXCLUDED.last_seen_at),
                   last_load_run_id = EXCLUDED.last_load_run_id
               -- Защита от «отката»: данные старше уже сохранённых не перезаписывают текущее состояние
               WHERE vacancy.published_at <= EXCLUDED.published_at
               RETURNING id, (xmax = 0) AS inserted""",
            (rec.hh_id, rec.name, rec.role, employer_id, area_id,
             rec.salary_from, rec.salary_to, rec.currency_code, rec.salary_gross,
             rec.experience, rec.schedule, rec.created_at, rec.published_at, rec.content_hash,
             seen_at, seen_at, run_id, run_id),
        ).fetchone()
        if row is None:
            # Сработал WHERE: в базе версия новее. Ничего не меняем (история тоже не трогается).
            vacancy_id = conn.execute("SELECT id FROM vacancy WHERE hh_id = %s", (rec.hh_id,)).fetchone()[0]
            return UpsertResult(vacancy_id=vacancy_id, is_new=False, is_changed=False)
        vacancy_id, inserted = row

        # Навыки: добавить недостающие связи и убрать те, которых больше нет
        skill_ids = upsert_skills(conn, rec)
        conn.execute(
            "DELETE FROM vacancy_skill WHERE vacancy_id = %s AND NOT (skill_id = ANY(%s))",
            (vacancy_id, skill_ids),
        )
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO vacancy_skill (vacancy_id, skill_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                [(vacancy_id, sid) for sid in skill_ids],
            )

        changed = write_snapshot(conn, vacancy_id, rec, area_id, run_id)
        return UpsertResult(vacancy_id=vacancy_id, is_new=inserted, is_changed=(not inserted) and changed)


def write_snapshot(conn: psycopg.Connection, vacancy_id: int, rec: VacancyRecord,
                   area_id: int, run_id: int) -> bool:
    """SCD тип 2: если содержимое изменилось — закрыть текущую версию и открыть новую.

    Начало версии (valid_from) = published_at: на hh.ru любое изменение вакансии,
    которое мы можем увидеть, сопровождается переопубликацией. Так история не зависит
    от того, КОГДА мы запустили загрузку, — и повторный запуск ничего не меняет.
    Выход: True, если записана новая версия.
    """
    current = conn.execute(
        "SELECT content_hash, valid_from FROM vacancy_snapshot WHERE vacancy_id = %s AND valid_to IS NULL",
        (vacancy_id,),
    ).fetchone()
    if current and current[0] == rec.content_hash:
        return False  # ничего не изменилось — идемпотентность
    valid_from = rec.published_at
    if current and valid_from <= current[1]:
        # Пришли данные старше актуальной версии (перезапуск за прошлую дату) — историю не трогаем
        return False
    if current:
        conn.execute(
            "UPDATE vacancy_snapshot SET valid_to = %s WHERE vacancy_id = %s AND valid_to IS NULL",
            (valid_from, vacancy_id),
        )
    conn.execute(
        """INSERT INTO vacancy_snapshot (vacancy_id, valid_from, name, area_id, salary_from, salary_to,
                                         currency_code, salary_gross, published_at, content_hash, load_run_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (vacancy_id, valid_from, rec.name, area_id, rec.salary_from, rec.salary_to,
         rec.currency_code, rec.salary_gross, rec.published_at, rec.content_hash, run_id),
    )
    return True
