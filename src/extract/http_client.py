"""HTTP-клиент официального API hh.ru с повторами, паузами и таймаутами.

Правила hh.ru, которые мы соблюдаем:
* User-Agent с названием приложения и контактом — иначе 400/403;
* пауза между запросами (HH_REQUEST_DELAY), чтобы не получить 429;
* качаем только нужное: детальную карточку — только для новых или изменённых вакансий.
"""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Callable
from datetime import datetime

import requests

from src.extract.base import BaseClient, HHApiError

log = logging.getLogger(__name__)

# Статусы, после которых имеет смысл подождать и повторить:
# 429 — слишком много запросов; 5xx — временная проблема на стороне сервера.
RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})


class HHClient(BaseClient):
    """Клиент https://api.hh.ru.

    Вход конструктора: user_agent (обязателен по правилам hh.ru), токен (опционально),
    delay — минимальная пауза между запросами, max_attempts — сколько раз пробовать.
    session и sleep можно подменить в тестах, чтобы не ходить в сеть и не ждать.
    """

    BASE_URL = "https://api.hh.ru"

    def __init__(self, user_agent: str, token: str | None = None, delay: float = 0.5,
                 max_attempts: int = 5, backoff_base: float = 1.0,
                 timeout: tuple[float, float] = (5.0, 30.0),
                 session: requests.Session | None = None,
                 sleep: Callable[[float], None] = time.sleep) -> None:
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = user_agent
        self.session.headers["HH-User-Agent"] = user_agent  # hh.ru просит дублировать
        if token:
            self.session.headers["Authorization"] = f"Bearer {token}"
        self.delay = delay
        self.max_attempts = max_attempts
        self.backoff_base = backoff_base
        # (подключение, чтение): без таймаута зависший сервер «повесит» загрузку навсегда
        self.timeout = timeout
        self._sleep = sleep
        self._last_request_at = 0.0

    def _throttle(self) -> None:
        """Выдержать паузу delay с момента прошлого запроса."""
        wait = self.delay - (time.monotonic() - self._last_request_at)
        if wait > 0:
            self._sleep(wait)
        self._last_request_at = time.monotonic()

    def backoff_seconds(self, attempt: int, retry_after: str | None = None) -> float:
        """Сколько ждать перед попыткой attempt+1.

        Экспоненциальная задержка: 1, 2, 4, 8 … секунд плюс случайная добавка (jitter)
        до 10 %. Jitter нужен, чтобы много клиентов, получивших 429 одновременно,
        не вернулись тоже одновременно. Если сервер прислал Retry-After — слушаемся его.
        """
        if retry_after and retry_after.isdigit():
            return float(retry_after)
        base = self.backoff_base * (2 ** (attempt - 1))
        return base + random.uniform(0, base * 0.1)

    def _get(self, path: str, params: dict | None = None) -> dict | None:
        """GET-запрос с повторами.

        Выход: разобранный JSON; None для 404.
        Ошибка: HHApiError, если статус не повторяемый (400, 403…) или попытки кончились.
        """
        url = f"{self.BASE_URL}{path}"
        for attempt in range(1, self.max_attempts + 1):
            self._throttle()
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout)
            except (requests.ConnectionError, requests.Timeout) as exc:
                reason, retry_after = f"{type(exc).__name__}: {exc}", None
            else:
                if resp.status_code == 200:
                    return resp.json()
                if resp.status_code == 404:
                    return None
                if resp.status_code not in RETRY_STATUSES:
                    raise HHApiError(f"{resp.status_code} на {url}: {resp.text[:300]}")
                reason, retry_after = f"HTTP {resp.status_code}", resp.headers.get("Retry-After")
            if attempt == self.max_attempts:
                break
            wait = self.backoff_seconds(attempt, retry_after)
            log.warning("%s на %s, попытка %d/%d, ждём %.1f с", reason, path, attempt, self.max_attempts, wait)
            self._sleep(wait)
        log.error("Сдаёмся после %d попыток: %s (%s)", self.max_attempts, path, reason)
        raise HHApiError(f"Не удалось получить {url} за {self.max_attempts} попыток: {reason}")

    def search(self, text: str, date_from: datetime, date_to: datetime,
               page: int, per_page: int = 100) -> dict:
        params = {
            "text": text,
            "search_field": "name",
            "date_from": date_from.isoformat(timespec="seconds"),
            "date_to": date_to.isoformat(timespec="seconds"),
            "page": page,
            "per_page": per_page,
            "order_by": "publication_time",
        }
        return self._get("/vacancies", params) or {"items": [], "found": 0, "pages": 0, "page": page}

    def get_vacancy(self, hh_id: str) -> dict | None:
        return self._get(f"/vacancies/{hh_id}")

    def get_dictionaries(self) -> dict:
        return self._get("/dictionaries") or {}
