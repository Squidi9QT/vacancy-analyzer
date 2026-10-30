"""Плоские записи — то, что пойдёт в таблицы.

Почему dataclass, а не dict: опечатка в имени поля (rec.salary_frmo) упадёт сразу,
а не превратится в тихий None. frozen=True — запись нельзя случайно изменить
после того, как посчитали content_hash.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass(frozen=True)
class AreaRecord:
    hh_id: str
    name: str


@dataclass(frozen=True)
class EmployerRecord:
    hh_id: str
    name: str
    is_trusted: bool


@dataclass(frozen=True)
class SkillRecord:
    name: str             # как написал работодатель (после обрезки пробелов)
    name_normalized: str  # ключ дедупликации


@dataclass(frozen=True)
class VacancyRecord:
    hh_id: str
    name: str
    role: str
    area: AreaRecord
    employer: EmployerRecord | None   # None — анонимный работодатель
    salary_from: int | None
    salary_to: int | None
    currency_code: str | None
    salary_gross: bool | None
    experience: str | None
    schedule: str | None
    created_at: datetime
    published_at: datetime
    skills: tuple[SkillRecord, ...] = field(default_factory=tuple)
    content_hash: str = ""
