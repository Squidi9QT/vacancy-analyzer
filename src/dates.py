"""Работа с датами в формате hh.ru."""

from __future__ import annotations

from datetime import datetime

HH_DATE_FORMAT = "%Y-%m-%dT%H:%M:%S%z"


def parse_hh_datetime(value: str) -> datetime:
    """'2026-03-04T11:22:33+0300' → datetime с часовым поясом."""
    return datetime.strptime(value, HH_DATE_FORMAT)
