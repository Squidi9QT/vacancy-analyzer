"""Преобразование детальной карточки вакансии hh.ru в VacancyRecord."""

from __future__ import annotations

import hashlib
import json
import logging

from src.dates import parse_hh_datetime
from src.transform.records import AreaRecord, EmployerRecord, SkillRecord, VacancyRecord
from src.transform.roles import classify_role
from src.transform.skills import clean_skill_name, normalize_skill

log = logging.getLogger(__name__)


class TransformError(ValueError):
    """Карточку нельзя превратить в запись: нет обязательного поля или оно битое."""


def _salary(detail: dict) -> tuple[int | None, int | None, str | None, bool | None]:
    """Достать зарплату. Новое поле salary_range приоритетнее устаревшего salary."""
    sal = detail.get("salary_range") or detail.get("salary")
    if not sal:
        return None, None, None, None
    s_from = sal.get("from") if (sal.get("from") or 0) > 0 else None
    s_to = sal.get("to") if (sal.get("to") or 0) > 0 else None
    if s_from is None and s_to is None:
        return None, None, None, None
    if s_from is not None and s_to is not None and s_from > s_to:
        log.warning("Вакансия %s: зарплата от %s больше до %s, меняем местами", detail.get("id"), s_from, s_to)
        s_from, s_to = s_to, s_from
    currency = sal.get("currency")
    if not currency:
        raise TransformError(f"Вакансия {detail.get('id')}: зарплата без валюты")
    return (int(s_from) if s_from is not None else None,
            int(s_to) if s_to is not None else None,
            currency, sal.get("gross"))


def _skills(detail: dict) -> tuple[SkillRecord, ...]:
    """Навыки без дублей после нормализации, в стабильном порядке (для хэша)."""
    result: dict[str, SkillRecord] = {}
    for item in detail.get("key_skills") or []:
        raw = (item or {}).get("name") or ""
        if not raw.strip():
            continue
        key = normalize_skill(raw)
        result.setdefault(key, SkillRecord(name=clean_skill_name(raw), name_normalized=key))
    return tuple(sorted(result.values(), key=lambda s: s.name_normalized))


def content_hash(rec: VacancyRecord) -> str:
    """SHA-256 от значимых полей вакансии."""
    payload = {
        "name": rec.name,
        "area": rec.area.hh_id,
        "employer": rec.employer.hh_id if rec.employer else None,
        "salary": [rec.salary_from, rec.salary_to, rec.currency_code, rec.salary_gross],
        "experience": rec.experience,
        "schedule": rec.schedule,
        "published_at": rec.published_at.isoformat(),
        "skills": [s.name_normalized for s in rec.skills],
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def transform_vacancy(detail: dict, search_role: str) -> VacancyRecord:
    """Детальная карточка из API → VacancyRecord."""
    try:
        hh_id = str(detail["id"])
        name = detail["name"].strip()
        area = AreaRecord(hh_id=str(detail["area"]["id"]), name=detail["area"]["name"])
        created_at = parse_hh_datetime(detail["created_at"])
        published_at = parse_hh_datetime(detail["published_at"])
    except (KeyError, TypeError, AttributeError, ValueError) as exc:
        raise TransformError(f"Вакансия {detail.get('id')!r}: нет или битое обязательное поле ({exc!r})") from exc
    if not name:
        raise TransformError(f"Вакансия {hh_id}: пустое название")

    emp = detail.get("employer") or {}
    employer = (EmployerRecord(hh_id=str(emp["id"]), name=emp.get("name") or "?",
                               is_trusted=bool(emp.get("trusted")))
                if emp.get("id") else None)

    s_from, s_to, currency, gross = _salary(detail)
    rec = VacancyRecord(
        hh_id=hh_id,
        name=name,
        role=classify_role(name, search_role),
        area=area,
        employer=employer,
        salary_from=s_from,
        salary_to=s_to,
        currency_code=currency,
        salary_gross=gross,
        experience=(detail.get("experience") or {}).get("id"),
        schedule=(detail.get("schedule") or {}).get("id"),
        created_at=min(created_at, published_at),
        published_at=published_at,
        skills=_skills(detail),
    )
    return VacancyRecord(**{**rec.__dict__, "content_hash": content_hash(rec)})


def transform_currencies(dictionaries: dict) -> list[tuple[str, str, float]]:
    """Справочник /dictionaries → [(code, name, rate)]. Пропускает валюты без курса."""
    result = []
    for cur in dictionaries.get("currency", []):
        if cur.get("code") and cur.get("rate"):
            result.append((cur["code"], cur.get("name") or cur["code"], float(cur["rate"])))
    return result
