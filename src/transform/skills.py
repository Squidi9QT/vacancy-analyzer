"""Нормализация названий навыков (ADR-004).

Вопрос, который я бы задал: «"Postgres" и "PostgreSQL" — один навык?»
Решение: да. Правила по шагам:
  1. обрезать пробелы по краям и схлопнуть повторные пробелы: 'MS  Excel ' → 'MS Excel';
  2. нижний регистр: 'SQL' → 'sql';
  3. словарь синонимов: 'postgres' → 'postgresql'.
Цена: словарь пополняется вручную. Неизвестный синоним станет отдельным навыком.
"""

from __future__ import annotations

import re

_SPACES = re.compile(r"\s+")

# Ключ — нормализованный вариант, значение — каноническое имя (тоже нормализованное)
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
    """Ключ дедупликации навыка.

    Вход: строка как в API. Выход: нормализованная строка в нижнем регистре.
    Ошибка: ValueError для пустой строки — пустой навык бессмыслен.
    """
    key = clean_skill_name(raw).lower()
    if not key:
        raise ValueError("Пустое название навыка")
    return SYNONYMS.get(key, key)
