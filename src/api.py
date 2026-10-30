"""Опциональный HTTP-эндпоинт /api/summary на FastAPI.

Запуск: pip install uvicorn && python -m src.main serve → http://127.0.0.1:8000/api/summary
Отдаёт сводку для дашборда: объёмы, свежесть данных, топ-5 навыков.
Соединение открывается на каждый запрос: для учебного сервиса так проще, чем пул.
Цена: ~5 мс на подключение; для нагрузки нужен пул (psycopg_pool).
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException

from src.config import MSK, get_settings
from src.load.db import connect

app = FastAPI(title="Анализатор вакансий")


@app.get("/api/summary")
def summary() -> dict:
    """Сводка. Ошибка: 503, если база недоступна (а не 500 со стектрейсом)."""
    try:
        conn = connect(get_settings().database_url)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"База недоступна: {exc}") from exc
    with conn:
        counts = conn.execute(
            """SELECT (SELECT count(*) FROM vacancy), (SELECT count(*) FROM employer),
                      (SELECT max(as_of) FROM load_run WHERE status = 'success'),
                      (SELECT round(100.0 * avg((salary_from IS NULL AND salary_to IS NULL)::int), 1) FROM vacancy)"""
        ).fetchone()
        top = conn.execute(
            """SELECT s.name, count(*) FROM vacancy_skill vs JOIN skill s ON s.id = vs.skill_id
               JOIN vacancy v ON v.id = vs.vacancy_id
               WHERE v.role IN ('system_analyst', 'data_analyst')
               GROUP BY s.name ORDER BY count(*) DESC LIMIT 5"""
        ).fetchall()
    return {
        "vacancies": counts[0],
        "employers": counts[1],
        # psycopg возвращает время в поясе сессии (на машине разработки Asia/Tomsk, +07).
        # Приводим к Москве явно, иначе «30 октября 23:59» превратится в «31 октября 03:59».
        "data_as_of": counts[2].astimezone(MSK).isoformat() if counts[2] else None,
        "pct_without_salary": float(counts[3]) if counts[3] is not None else None,
        "top_skills": [{"skill": name, "vacancies": n} for name, n in top],
    }
