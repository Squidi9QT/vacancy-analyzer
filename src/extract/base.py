"""Общий интерфейс клиентов источника данных и пагинация."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import Iterator
from datetime import datetime

log = logging.getLogger(__name__)

HH_MAX_RESULTS = 2000


class HHApiError(Exception):
    """Ошибка источника, после которой продолжать бессмысленно (403, исчерпаны повторы)."""


class BaseClient(ABC):
    """Интерфейс источника вакансий."""

    @abstractmethod
    def search(self, text: str, date_from: datetime, date_to: datetime,
               page: int, per_page: int) -> dict:
        """Одна страница поиска. Вход: текст, период публикации, номер страницы."""

    @abstractmethod
    def get_vacancy(self, hh_id: str) -> dict | None:
        """Детальная карточка. None — вакансию удалили между поиском и запросом (404)."""

    @abstractmethod
    def get_dictionaries(self) -> dict:
        """Справочники hh.ru, нам нужен раздел currency (курсы валют)."""

    def iter_search(self, text: str, date_from: datetime, date_to: datetime,
                    per_page: int = 100) -> Iterator[dict]:
        """Пройти все страницы поиска и отдать элементы по одному."""
        page = 0
        while True:
            data = self.search(text, date_from, date_to, page, per_page)
            if page == 0:
                log.debug("Поиск %r %s..%s: найдено %s", text, date_from, date_to, data.get("found"))
                if data.get("found", 0) > HH_MAX_RESULTS:
                    log.warning("Найдено %s > %s: API отдаст не всё, сузьте период", data["found"], HH_MAX_RESULTS)
            yield from data.get("items", [])
            page += 1
            if page >= data.get("pages", 0) or (page * per_page) >= HH_MAX_RESULTS:
                break
