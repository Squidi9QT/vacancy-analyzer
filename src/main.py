"""Точка входа: python -m src.main <команда>.

Команды:
  init-db [--reset]                       создать схему (sql/001, 002)
  load --days 7 [--as-of 2026-10-30]      загрузка за N дней
  backfill --from 2026-03-01 --to 2026-10-30 [--window-days 2]
                                          «прокрутить» ежедневные загрузки по фикстурам
  report                                  SQL-отчёты → reports/*.png, *.csv и explainer/data.js
  serve                                   (опционально) API /api/summary на FastAPI

Код возврата: 0 — успех, 1 — ошибка. Планировщик (cron) понимает именно его.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date, datetime, timedelta

from src.config import FIXTURE_WORLD, PROJECT_ROOT, get_settings
from src.extract import FixtureClient, HHClient
from src.load.db import apply_migrations, connect
from src.pipeline import end_of_day, run_load

log = logging.getLogger("src.main")


def setup_logging(level: str) -> None:
    """Логи в консоль и в logs/etl.log.

    Уровни: DEBUG — подробности (каждый запрос), INFO — ход работы, WARNING — что-то
    странное, но работаем дальше (битая карточка, повтор запроса), ERROR — не получилось.
    """
    (PROJECT_ROOT / "logs").mkdir(exist_ok=True)
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        handlers=[logging.StreamHandler(), logging.FileHandler(PROJECT_ROOT / "logs" / "etl.log", encoding="utf-8")],
    )


def _parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def cmd_init_db(args, settings) -> None:
    with connect(settings.database_url) as conn:
        if args.reset:
            # Удаляет ВСЕ данные. Нужен, чтобы начать «с чистого листа» в учебных целях.
            log.warning("Удаляем схему public со всеми данными")
            conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        apply_migrations(conn)
    log.info("Схема готова")


def make_client(settings, as_of: datetime):
    """Клиент по настройке DATA_SOURCE."""
    if settings.data_source == "api":
        return HHClient(settings.hh_user_agent, settings.hh_access_token, settings.hh_request_delay)
    return FixtureClient(FIXTURE_WORLD, as_of)


def cmd_load(args, settings) -> None:
    if args.as_of:
        as_of = end_of_day(args.as_of)
    elif settings.data_source == "api":
        as_of = datetime.now().astimezone()
    else:
        as_of = settings.fixture_now
    with connect(settings.database_url) as conn:
        run_load(conn, make_client(settings, as_of), as_of, args.days, settings.data_source)


def cmd_backfill(args, settings) -> None:
    if settings.data_source != "fixtures":
        raise SystemExit("backfill работает только на фикстурах: API не умеет показывать прошлое")
    d = args.date_from
    with connect(settings.database_url) as conn:
        while d <= args.date_to:
            as_of = end_of_day(d)
            run_load(conn, FixtureClient(FIXTURE_WORLD, as_of), as_of, args.window_days, "fixtures")
            d += timedelta(days=1)


def cmd_report(args, settings) -> None:
    from src.report import build_report  # pandas/matplotlib грузим только когда нужны
    build_report(settings.database_url)


def cmd_serve(args, settings) -> None:
    import uvicorn  # noqa: F401  — опционально, ставится отдельно: pip install uvicorn
    uvicorn.run("src.api:app", host="127.0.0.1", port=args.port)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m src.main", description="Анализатор вакансий hh.ru")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("init-db", help="создать схему БД")
    p.add_argument("--reset", action="store_true", help="удалить ВСЕ данные и создать схему заново")
    p = sub.add_parser("load", help="загрузить вакансии за N дней")
    p.add_argument("--days", type=int, default=7)
    p.add_argument("--as-of", type=_parse_date, help="дата наблюдения (только для фикстур), ГГГГ-ММ-ДД")
    p = sub.add_parser("backfill", help="ежедневные загрузки за период (фикстуры)")
    p.add_argument("--from", dest="date_from", type=_parse_date, required=True)
    p.add_argument("--to", dest="date_to", type=_parse_date, required=True)
    p.add_argument("--window-days", type=int, default=2, help="окно каждого запуска; >1 — окна пересекаются")
    sub.add_parser("report", help="построить отчёты и графики")
    p = sub.add_parser("serve", help="API /api/summary (нужен uvicorn)")
    p.add_argument("--port", type=int, default=8000)
    args = parser.parse_args(argv)

    settings = get_settings()
    setup_logging(settings.log_level)
    handlers = {"init-db": cmd_init_db, "load": cmd_load, "backfill": cmd_backfill,
                "report": cmd_report, "serve": cmd_serve}
    try:
        handlers[args.command](args, settings)
    except Exception as exc:  # noqa: BLE001 — верхний уровень: превращаем любую ошибку в код возврата
        log.error("Команда %s завершилась ошибкой: %s", args.command, exc)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
