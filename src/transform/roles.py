"""Определение роли вакансии по названию (open_questions.md, вопрос 7).

Вопрос, который я бы задал: «Вакансию нашли запросом "системный аналитик".
Значит ли это, что она про системного аналитика?»
Нет: поиск возвращает и «Тестировщик / системный аналитик», и «Руководитель группы аналитиков».
Поэтому роль определяем правилами по названию. Правила проверяются ПО ПОРЯДКУ,
первое совпавшее побеждает. Исключения («other») стоят первыми — иначе
«Тестировщик / системный аналитик» попал бы в системные аналитики.
Если ни одно правило не сработало — берём роль поискового запроса (fallback).
"""

from __future__ import annotations

import re

ROLE_RULES: list[tuple[str, re.Pattern[str]]] = [
    ("other", re.compile(r"тестировщик|\bqa\b|1с|1c|руководител|head of", re.I)),
    ("system_analyst", re.compile(r"системн\w*\s+аналитик|system\s+analyst", re.I)),
    ("data_analyst", re.compile(r"аналитик\w*\s+данных|data\s+analyst|bi-аналитик", re.I)),
    ("backend_junior", re.compile(
        r"(junior|младш\w*|стаж[её]р\w*|intern).*(python|backend|бэкенд|разработчик|developer)"
        r"|(python|backend|бэкенд).*(junior|младш\w*|стаж[её]р\w*)", re.I)),
]

VALID_ROLES = frozenset({"system_analyst", "data_analyst", "backend_junior", "other"})


def classify_role(name: str, search_role: str) -> str:
    """Роль по названию вакансии.

    Вход: название и роль поискового запроса. Выход: одна из VALID_ROLES.
    Ошибка: ValueError, если search_role не из списка — значит, опечатка в конфиге.
    """
    if search_role not in VALID_ROLES:
        raise ValueError(f"Неизвестная роль поиска: {search_role!r}")
    for role, pattern in ROLE_RULES:
        if pattern.search(name):
            return role
    return search_role
