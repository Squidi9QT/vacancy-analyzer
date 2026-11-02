"""Источник-симулятор: отвечает как API hh.ru, но данные берёт из tests/fixtures/hh_world.json."""

from __future__ import annotations

import json
import math
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from src.config import SEARCH_QUERIES
from src.dates import parse_hh_datetime
from src.extract.base import BaseClient


@lru_cache(maxsize=4)
def _load_world(path: str) -> dict:
    """Прочитать и подготовить мир один раз на процесс (backfill создаёт сотни клиентов)."""
    world = json.loads(Path(path).read_text(encoding="utf-8"))
    for vac in world["vacancies"]:
        vac["_closed"] = parse_hh_datetime(vac["closed_at"])
        for ver in vac["versions"]:
            ver["_from"] = parse_hh_datetime(ver["valid_from"])
    return world


class FixtureClient(BaseClient):
    """Клиент «как API», показывающий мир на момент as_of."""

    def __init__(self, world_path: Path, as_of: datetime) -> None:
        self.world = _load_world(str(world_path))
        self.as_of = as_of
        self.requests_made = 0
        self._query_role = {text: role for role, text in SEARCH_QUERIES.items()}
        self._by_id = {v["id"]: v for v in self.world["vacancies"]}

    def _current(self, vac: dict) -> dict | None:
        """Версия вакансии, актуальная на as_of; None — ещё не создана или уже закрыта."""
        if vac["_closed"] <= self.as_of:
            return None
        current = None
        for ver in vac["versions"]:
            if ver["_from"] <= self.as_of:
                current = ver["detail"]
        return current

    def search(self, text, date_from, date_to, page, per_page=100):
        self.requests_made += 1
        role = self._query_role.get(text)
        found = []
        for vac in self.world["vacancies"]:
            if role not in vac["queries"]:
                continue
            detail = self._current(vac)
            if detail is None:
                continue
            published = parse_hh_datetime(detail["published_at"])
            if date_from <= published < date_to:
                found.append(detail)
        found.sort(key=lambda d: d["published_at"], reverse=True)
        chunk = found[page * per_page:(page + 1) * per_page]
        items = [{k: d[k] for k in ("id", "name", "area", "salary", "salary_range", "employer",
                                     "created_at", "published_at", "alternate_url")}
                 | {"snippet": {"requirement": None, "responsibility": None}} for d in chunk]
        return {"items": items, "found": len(found), "pages": math.ceil(len(found) / per_page),
                "page": page, "per_page": per_page}

    def get_vacancy(self, hh_id):
        self.requests_made += 1
        vac = self._by_id.get(hh_id)
        return self._current(vac) if vac else None

    def get_dictionaries(self):
        self.requests_made += 1
        return self.world["dictionaries"]
