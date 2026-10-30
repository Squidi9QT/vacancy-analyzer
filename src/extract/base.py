"""Общий интерфейс клиентов источника данных и пагинация.

Вопрос, который я бы задал: «Как тестировать загрузку без сети и не дёргать API в тестах?»
Варианты: (1) мокать requests в каждом тесте; (2) записать ответы и проигрывать их;
(3) сделать общий интерфейс и две реализации — настоящую (HHClient) и на фикстурах (FixtureClient).
Выбор: (3). Почему: остальной код (pipeline) не знает, откуда данные, и одинаково
работает в тестах, в демо и в продакшене. Цена: две реализации нужно держать
совместимыми — их связывает этот базовый класс.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import Iterator
from datetime import datetime

log = logging.getLogger(__name__)

# API hh.ru отдаёт не больше 2000 результатов на один поиск (page * per_page < 2000)
HH_MAX_RESULTS = 2000


class HHApiError(Exception):
    """Ошибка источника, после которой продолжать бессмысленно (403, исчерпаны повторы)."""


class BaseClient(ABC):
    """Интерфейс источника вакансий.

    Наследник реализует три метода: search, get_vacancy, get_dictionaries.
    Пагинацию реализует базовый класс — один раз для обоих источников.
    """

    @abstractmethod
    def search(self, text: str, date_from: datetime, date_to: datetime,
               page: int, per_page: int) -> dict:
        """Одна страница поиска. Вход: текст, период публикации, номер страницы.
        Выход: dict как в API: {"items": [...], "found": N, "pages": P, "page": i}."""

    @abstractmethod
    def get_vacancy(self, hh_id: str) -> dict | None:
        """Детальная карточка. None — вакансию удалили между поиском и запросом (404)."""

    @abstractmethod
    def get_dictionaries(self) -> dict:
        """Справочники hh.ru, нам нужен раздел currency (курсы валют)."""

    def iter_search(self, text: str, date_from: datetime, date_to: datetime,
                    per_page: int = 100) -> Iterator[dict]:
        """Пройти все страницы поиска и отдать элементы по одному.

        Вход: текст и период. Выход: генератор элементов поиска (краткие карточки).
        Ошибка: пробрасывает HHApiError из search().
        Если found > 2000, API не отдаст хвост — пишем WARNING, данные будут неполными.
        """
        page = 0
        while True:
            data = self.search(text, date_from, date_to, page, per_page)
            if page == 0:
                log.debug("Поиск %r %s..%s: найдено %s", text, date_from, date_to, data.get("found"))
                if data.get("found", 0) > HH_MAX_RESULTS:
                    log.warning("Найдено %s > %s: API отдаст не всё, сузьте период", data["found"], HH_MAX_RESULTS)
            yield from data.get("items", [])
            page += 1
            # Останавливаемся по числу страниц, а не по пустому ответу: так на один запрос меньше
            if page >= data.get("pages", 0) or (page * per_page) >= HH_MAX_RESULTS:
                break
