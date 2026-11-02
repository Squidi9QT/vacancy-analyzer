"""Определение роли вакансии по названию (open_questions.md, вопрос 7)."""

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
    """Роль по названию вакансии."""
    if search_role not in VALID_ROLES:
        raise ValueError(f"Неизвестная роль поиска: {search_role!r}")
    for role, pattern in ROLE_RULES:
        if pattern.search(name):
            return role
    return search_role
