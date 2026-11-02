"""Нормализация названий навыков (ADR-004)."""

from __future__ import annotations

import re

_SPACES = re.compile(r"\s+")

SYNONYMS: dict[str, str] = {
    "postgres": "postgresql",
    "excel": "ms excel",
    "python 3": "python",
    "rest": "rest api",
    "restful api": "rest api",
    "a/b-тестирование": "a/b тесты",
    "ab тесты": "a/b тесты",
    "powerbi": "power bi",
}


def clean_skill_name(raw: str) -> str:
    """Убрать лишние пробелы, сохранив регистр. ' MS  Excel ' → 'MS Excel'."""
    return _SPACES.sub(" ", raw).strip()


def normalize_skill(raw: str) -> str:
    """Ключ дедупликации навыка."""
    key = clean_skill_name(raw).lower()
    if not key:
        raise ValueError("Пустое название навыка")
    return SYNONYMS.get(key, key)
