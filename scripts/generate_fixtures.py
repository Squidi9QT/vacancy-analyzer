"""Генератор воспроизводимых фикстур в формате API hh.ru.

Зачем он нужен
--------------
API hh.ru на анонимные запросы отвечает 403, а без сети проект должен работать.
Поэтому мы генерируем «мир вакансий»: ~1500 вакансий за март–октябрь 2026,
у части вакансий несколько версий (подняли в поиске, изменили зарплату).

Генератор детерминирован: seed=42, поэтому у всех одинаковые данные
и одинаковые цифры в отчёте. Запускать его нужно только если хочется
поменять «мир»; готовый файл уже лежит в tests/fixtures/hh_world.json.

Что на выходе
-------------
tests/fixtures/hh_world.json:
    {"dictionaries": {"currency": [...]},          # как /dictionaries в API
     "vacancies": [{"id", "closed_at", "queries",   # служебные поля симулятора
                    "versions": [{"valid_from", "detail": {...}}]}]}
Поле detail — ровно та структура, которую отдаёт GET /vacancies/{id}.

Запуск: python scripts/generate_fixtures.py
"""

from __future__ import annotations

import json
import math
import random
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SEED = 42
START = date(2026, 3, 1)
END = date(2026, 10, 30)
MSK = timezone(timedelta(hours=3))
OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "hh_world.json"

# hh_id, название, вес (доля вакансий), множитель зарплаты, доля вакансий без зарплаты
AREAS = [
    ("1", "Москва", 0.30, 1.25, 0.28),
    ("2", "Санкт-Петербург", 0.18, 1.10, 0.34),
    ("4", "Новосибирск", 0.10, 0.90, 0.46),
    ("3", "Екатеринбург", 0.09, 0.92, 0.42),
    ("88", "Казань", 0.08, 0.85, 0.50),
    ("90", "Томск", 0.10, 0.82, 0.56),
    ("66", "Нижний Новгород", 0.07, 0.84, 0.48),
    ("160", "Алматы", 0.08, 0.95, 0.38),
]

# rate — сколько единиц валюты за 1 рубль (так отдаёт /dictionaries hh.ru)
CURRENCIES = [
    {"code": "RUR", "abbr": "₽", "name": "Рубли", "default": True, "rate": 1.0, "in_use": True},
    {"code": "USD", "abbr": "$", "name": "Доллары", "default": False, "rate": 0.0125, "in_use": True},
    {"code": "EUR", "abbr": "€", "name": "Евро", "default": False, "rate": 0.0108, "in_use": True},
    {"code": "KZT", "abbr": "₸", "name": "Тенге", "default": False, "rate": 6.2, "in_use": True},
]
RATE = {c["code"]: c["rate"] for c in CURRENCIES}

EXPERIENCE = {
    "noExperience": "Нет опыта",
    "between1And3": "От 1 года до 3 лет",
    "between3And6": "От 3 до 6 лет",
}
SCHEDULE = {"fullDay": "Полный день", "remote": "Удаленная работа", "flexible": "Гибкий график"}

# Названия вакансий: (название, уровень, какими поисковыми запросами находится)
ROLES = {
    "system_analyst": {
        "weight": 0.40,
        "base": 165_000,
        "names": [
            ("Системный аналитик", "middle", ["system_analyst"]),
            ("Системный аналитик (Middle)", "middle", ["system_analyst"]),
            ("Junior системный аналитик", "junior", ["system_analyst"]),
            ("Ведущий системный аналитик", "senior", ["system_analyst"]),
            ("System Analyst", "middle", ["system_analyst"]),
            ("Системный аналитик / аналитик данных", "middle", ["system_analyst", "data_analyst"]),
        ],
        "skills": {
            "SQL": 70, "UML": 45, "BPMN": 50, "REST API": 55, "Confluence": 35, "Jira": 40,
            "Postman": 25, "Kafka": 20, "JSON": 30, "XML": 22, "Swagger": 25, "PostgreSQL": 25,
            "Use Case": 20, "Agile": 18, "SOAP": 15, "Git": 10, "Python": 8, "ER-моделирование": 15,
        },
    },
    "data_analyst": {
        "weight": 0.34,
        "base": 150_000,
        "names": [
            ("Аналитик данных", "middle", ["data_analyst"]),
            ("Data Analyst", "middle", ["data_analyst"]),
            ("Junior аналитик данных", "junior", ["data_analyst"]),
            ("Аналитик данных (SQL, Python)", "middle", ["data_analyst"]),
            ("BI-аналитик", "middle", ["data_analyst"]),
            ("Продуктовый аналитик (Data Analyst)", "senior", ["data_analyst"]),
        ],
        "skills": {
            "SQL": 85, "Python": 65, "Pandas": 40, "MS Excel": 35, "Power BI": 30, "Tableau": 18,
            "A/B тесты": 30, "Математическая статистика": 28, "ClickHouse": 22, "Apache Superset": 12,
            "PostgreSQL": 20, "Apache Airflow": 10, "Git": 12, "DataLens": 14,
        },
    },
    "backend_junior": {
        "weight": 0.20,
        "base": 105_000,
        "names": [
            ("Junior Python-разработчик", "junior", ["backend_junior"]),
            ("Junior Backend Developer (Python)", "junior", ["backend_junior"]),
            ("Младший backend-разработчик", "junior", ["backend_junior"]),
            ("Стажёр-разработчик Python", "junior", ["backend_junior"]),
        ],
        "skills": {
            "Python": 90, "Django": 40, "FastAPI": 35, "PostgreSQL": 45, "Docker": 40, "Git": 55,
            "REST API": 35, "Linux": 30, "SQL": 40, "Redis": 15, "Kafka": 8, "Pytest": 15,
        },
    },
    # Шум: вакансии, которые находит поиск, но это не наши роли.
    "other": {
        "weight": 0.06,
        "base": 120_000,
        "names": [
            ("Тестировщик / системный аналитик (стажёр)", "junior", ["system_analyst"]),
            ("Руководитель группы системных аналитиков", "senior", ["system_analyst"]),
            ("Аналитик данных 1С", "middle", ["data_analyst"]),
        ],
        "skills": {"SQL": 40, "Jira": 30, "1С": 30, "Тестирование": 30, "Управление командой": 20},
    },
}
LEVEL_MULT = {"junior": 0.62, "middle": 1.0, "senior": 1.45}
LEVEL_EXP = {"junior": "noExperience", "middle": "between1And3", "senior": "between3And6"}

# Как работодатели пишут навыки «вкривь и вкось» — проверка нормализации (ADR-004)
SKILL_VARIANTS = {
    "SQL": ["sql", "SQL ", "Sql"],
    "PostgreSQL": ["Postgres", "postgresql", "PostgreSQL "],
    "MS Excel": ["Excel", "MS  Excel"],
    "Python": ["python", "Python 3"],
    "REST API": ["REST", "RESTful API"],
    "A/B тесты": ["A/B-тестирование", "AB тесты"],
    "Power BI": ["PowerBI", "Power  BI"],
}

# Вымышленные работодатели: (название, базовый город, размер найма, профиль активности)
# профиль: stable — нанимает почти каждый месяц, seasonal — волнами, rare — изредка
EMPLOYER_NAMES = [
    ("СибирьСофт", "90", 3.0, "stable"), ("ТомДата", "90", 2.0, "seasonal"),
    ("Северный Банк", "1", 4.0, "stable"), ("Ритейл Плюс", "1", 3.0, "stable"),
    ("ОблакоТех", "2", 3.0, "stable"), ("Логистика 24", "3", 2.0, "seasonal"),
    ("ГосИнформ", "1", 3.0, "seasonal"), ("Медсистемы", "4", 2.0, "stable"),
    ("ФинТехЛаб", "1", 2.5, "seasonal"), ("Кама Девелопмент", "88", 1.5, "seasonal"),
    ("Волга ИТ", "66", 1.5, "stable"), ("Степь Диджитал", "160", 2.0, "stable"),
    ("АлмаФинанс", "160", 1.5, "seasonal"), ("Неон Маркетплейс", "1", 3.5, "stable"),
    ("Цифровой Регион", "4", 1.5, "seasonal"), ("Байкал Телеком", "4", 1.0, "rare"),
    ("ЭнергоСбыт Онлайн", "3", 1.5, "seasonal"), ("Пиксель Геймс", "2", 1.0, "rare"),
    ("Агро Аналитика", "88", 1.0, "rare"), ("СтройКонтроль", "66", 1.0, "rare"),
    ("ТГУ Технопарк", "90", 1.0, "seasonal"), ("Умный Город", "2", 1.5, "seasonal"),
    ("Страхование Онлайн", "1", 2.0, "seasonal"), ("Транспортные Системы", "2", 1.5, "rare"),
    ("ДатаФабрика", "1", 2.0, "stable"), ("Код Сибири", "4", 1.0, "seasonal"),
    ("Урал Софт", "3", 1.0, "rare"), ("ЕдаДоставка", "2", 2.0, "seasonal"),
    ("Образование 2.0", "88", 1.0, "rare"), ("НефтеГаз Цифра", "1", 1.5, "rare"),
    ("КиберЗащита", "1", 1.0, "seasonal"), ("Томская Логистика", "90", 0.8, "rare"),
    ("ПромАвтоматика", "66", 0.8, "rare"), ("Мобильные Решения", "2", 1.2, "seasonal"),
    ("ИнфоСервис", "3", 0.8, "rare"), ("АйТи Аутсорс", "1", 2.5, "stable"),
]
ACTIVE_PROB = {"stable": 0.92, "seasonal": 0.5, "rare": 0.22}
# Во сколько раз умножить «размер найма»: подбирали так, чтобы было ~180 вакансий в месяц
SIZE_SCALE = 3.5


def months(start: date, end: date) -> list[date]:
    """Первые числа месяцев в диапазоне [start, end]."""
    result, d = [], date(start.year, start.month, 1)
    while d <= end:
        result.append(d)
        d = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
    return result


def fmt(dt: datetime) -> str:
    """Дата в формате hh.ru: 2026-03-04T11:22:33+0300."""
    return dt.astimezone(MSK).strftime("%Y-%m-%dT%H:%M:%S%z")


def random_moment(rng: random.Random, day: date) -> datetime:
    """Случайный момент рабочего дня (9:00–19:59 МСК)."""
    return datetime(day.year, day.month, day.day, rng.randint(9, 19), rng.randint(0, 59),
                     rng.randint(0, 59), tzinfo=MSK)


def poisson(rng: random.Random, lam: float) -> int:
    """Число событий по распределению Пуассона (алгоритм Кнута)."""
    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= limit:
            return k
        k += 1


def make_salary(rng, role, level, area, month_idx):
    """Зарплата в формате API (поле salary_range) или None."""
    hh_area, _, _, mult, no_salary_share = area
    if rng.random() < no_salary_share:
        return None
    trend = 1 + 0.012 * month_idx  # рынок растёт ~1,2 % в месяц
    rub = ROLES[role]["base"] * LEVEL_MULT[level] * mult * trend * rng.lognormvariate(0, 0.16)
    currency = "RUR"
    if hh_area == "160":
        currency = "KZT"
    elif hh_area in ("1", "2") and rng.random() < 0.05:
        currency = rng.choice(["USD", "USD", "EUR"])
    gross = rng.random() < 0.45
    if gross:
        rub /= 0.87
    amount = rub * RATE[currency]
    step = 5000 * RATE[currency] if currency != "RUR" else 5000
    step = max(100, round(step, -2))
    shape = rng.random()
    low = max(step, round(amount * 0.9 / step) * step)
    high = round(amount * rng.uniform(1.15, 1.45) / step) * step
    sal_from, sal_to = (low, high) if shape < 0.5 else ((low, None) if shape < 0.8 else (None, high))
    return {"from": int(sal_from) if sal_from else None, "to": int(sal_to) if sal_to else None,
            "currency": currency, "gross": gross,
            "mode": {"id": "MONTH", "name": "За месяц"}}


def pick_skills(rng, role):
    """3–9 навыков роли с учётом весов, иногда в «кривом» написании."""
    weights = dict(ROLES[role]["skills"])
    chosen = []
    for _ in range(min(len(weights), rng.randint(3, 9))):
        total = sum(weights.values())
        x, acc = rng.uniform(0, total), 0.0
        for name, w in weights.items():
            acc += w
            if x <= acc:
                chosen.append(name)
                del weights[name]
                break
    spelled = []
    for name in chosen:
        if name in SKILL_VARIANTS and rng.random() < 0.2:
            spelled.append(rng.choice(SKILL_VARIANTS[name]))
        else:
            spelled.append(name)
    return [{"name": s} for s in spelled]


def build_detail(vid, name, area, employer, salary, skills, level, schedule, created, published):
    """Детальная карточка вакансии — как ответ GET /vacancies/{id}."""
    hh_area, area_name = area[0], area[1]
    detail = {
        "id": vid,
        "name": name,
        "area": {"id": hh_area, "name": area_name, "url": f"https://api.hh.ru/areas/{hh_area}"},
        # Старое поле salary hh.ru помечает устаревшим, новое — salary_range. Отдаём оба, как API.
        "salary": None if salary is None else {k: salary[k] for k in ("from", "to", "currency", "gross")},
        "salary_range": salary,
        "experience": {"id": LEVEL_EXP[level], "name": EXPERIENCE[LEVEL_EXP[level]]},
        "schedule": {"id": schedule, "name": SCHEDULE[schedule]},
        "employer": employer,
        "key_skills": skills,
        "created_at": fmt(created),
        "published_at": fmt(published),
        "archived": False,
        "alternate_url": f"https://hh.ru/vacancy/{vid}",
        "description": f"<p>Ищем: {name}. Навыки: {', '.join(s['name'] for s in skills)}.</p>",
    }
    return detail


def main() -> None:
    rng = random.Random(SEED)
    area_by_id = {a[0]: a for a in AREAS}
    employers = []
    for i, (ename, home, size, profile) in enumerate(EMPLOYER_NAMES):
        employers.append({
            "json": {"id": str(10_000 + i * 17), "name": ename, "trusted": rng.random() < 0.8,
                     "url": f"https://api.hh.ru/employers/{10_000 + i * 17}"},
            "home": home, "size": size, "profile": profile,
        })
    anonymous = {"name": "Компания скрыта кадровым агентством", "trusted": False}

    role_names = list(ROLES)
    role_weights = [ROLES[r]["weight"] for r in role_names]
    month_list = months(START, END)
    vacancies = []
    next_id = 100_000_000

    for m_idx, month_start in enumerate(month_list):
        month_end = min(END, (month_list[m_idx + 1] - timedelta(days=1)) if m_idx + 1 < len(month_list) else END)
        days_in = (month_end - month_start).days + 1
        postings = []
        for emp in employers:
            if rng.random() < ACTIVE_PROB[emp["profile"]]:
                postings += [emp] * max(1, poisson(rng, emp["size"] * SIZE_SCALE))
        postings += [None] * poisson(rng, 6)  # анонимные работодатели
        for emp in postings:
            role = rng.choices(role_names, role_weights)[0]
            name, level, queries = rng.choice(ROLES[role]["names"])
            home = emp["home"] if emp else rng.choice(AREAS)[0]
            area = area_by_id[home] if rng.random() < 0.8 else rng.choices(AREAS, [a[2] for a in AREAS])[0]
            created = random_moment(rng, month_start + timedelta(days=rng.randrange(days_in)))
            closed = created + timedelta(days=rng.randint(14, 60))
            schedule = rng.choices(list(SCHEDULE), [50, 30, 20])[0]
            salary = make_salary(rng, role, level, area, m_idx)
            skills = pick_skills(rng, role)
            emp_json = emp["json"] if emp else anonymous

            next_id += rng.randint(1, 4000)
            vid = str(next_id)
            versions = [{"valid_from": fmt(created),
                         "detail": build_detail(vid, name, area, emp_json, salary, skills, level,
                                                schedule, created, created)}]
            # Изменения после публикации: 0–3 раза
            n_updates = rng.choices([0, 1, 2, 3], [55, 25, 12, 8])[0]
            life = (closed - created).total_seconds()
            moments = sorted(created + timedelta(seconds=rng.uniform(0.15, 0.95) * life) for _ in range(n_updates))
            cur_name, cur_salary = name, salary
            for moment in moments:
                kind = rng.choices(["republish", "salary", "name"], [60, 25, 15])[0]
                if kind == "salary":
                    if cur_salary is None:
                        cur_salary = make_salary(random.Random(rng.random()), role, level,
                                                 (area[0], area[1], 0, area[3], 0.0), m_idx)
                    else:
                        k = rng.uniform(1.05, 1.15)
                        cur_salary = dict(cur_salary)
                        for key in ("from", "to"):
                            if cur_salary[key]:
                                cur_salary[key] = int(round(cur_salary[key] * k, -3)) or cur_salary[key]
                elif kind == "name":
                    cur_name = cur_name + " (удалённо)" if "удалённо" not in cur_name else cur_name.replace(" (удалённо)", "")
                versions.append({"valid_from": fmt(moment),
                                 "detail": build_detail(vid, cur_name, area, emp_json, cur_salary, skills,
                                                        level, schedule, created, moment)})
            vacancies.append({"id": vid, "closed_at": fmt(closed), "queries": queries, "versions": versions})

            # Дубль «по смыслу»: тот же работодатель, название и город, но новый id.
            if emp and rng.random() < 0.03:
                next_id += rng.randint(1, 4000)
                twin_id = str(next_id)
                twin_created = created + timedelta(days=rng.randint(1, 5))
                twin = build_detail(twin_id, name, area, emp_json, salary, skills, level, schedule,
                                    twin_created, twin_created)
                vacancies.append({"id": twin_id, "closed_at": fmt(twin_created + timedelta(days=30)),
                                  "queries": queries,
                                  "versions": [{"valid_from": fmt(twin_created), "detail": twin}]})

    world = {
        "_comment": "Синтетические данные в формате API hh.ru. Генератор: scripts/generate_fixtures.py, seed=42.",
        "dictionaries": {"currency": CURRENCIES},
        "vacancies": vacancies,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n_versions = sum(len(v["versions"]) for v in vacancies)
    print(f"Вакансий: {len(vacancies)}, версий: {n_versions}, файл: {OUT} ({OUT.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    main()
