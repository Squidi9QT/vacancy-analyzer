"""Тесты HTTP-клиента без сети: подменяем requests.Session на «фальшивую»."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import requests

from src.extract import HHApiError, HHClient
from src.extract.base import BaseClient

T0 = datetime(2026, 10, 1, tzinfo=timezone(timedelta(hours=3)))


class FakeResponse:
    def __init__(self, status: int, payload: dict | None = None, headers: dict | None = None):
        self.status_code, self._payload, self.headers = status, payload or {}, headers or {}
        self.text = str(self._payload)

    def json(self):
        return self._payload


class FakeSession:
    """Отдаёт заранее заданные ответы по очереди и запоминает запросы."""

    def __init__(self, responses):
        self.responses, self.calls, self.headers = list(responses), [], {}

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params, timeout))
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def make_client(responses, **kw):
    sleeps: list[float] = []
    session = FakeSession(responses)
    client = HHClient("Test/1.0 (test@example.com)", delay=0, session=session, sleep=sleeps.append, **kw)
    return client, session, sleeps


def test_user_agent_and_timeout_are_set():
    client, session, _ = make_client([FakeResponse(200, {"id": "1"})])
    client.get_vacancy("1")
    assert session.headers["User-Agent"] == "Test/1.0 (test@example.com)"
    assert session.calls[0][2] == (5.0, 30.0)  # таймаут передаётся в каждый запрос


def test_retries_on_429_and_5xx_with_exponential_backoff():
    client, session, sleeps = make_client(
        [FakeResponse(429), FakeResponse(503), FakeResponse(500), FakeResponse(200, {"id": "1"})])
    assert client.get_vacancy("1") == {"id": "1"}
    assert len(session.calls) == 4
    # 1, 2, 4 секунды + jitter до 10 %
    assert [int(s) for s in sleeps] == [1, 2, 4]
    assert all(s <= b * 1.1 for s, b in zip(sleeps, [1, 2, 4]))


def test_retry_after_header_is_respected():
    client, _, sleeps = make_client([FakeResponse(429, headers={"Retry-After": "7"}), FakeResponse(200, {})])
    client.get_dictionaries()
    assert sleeps == [7.0]


def test_network_errors_are_retried():
    client, _, _ = make_client([requests.ConnectionError("нет сети"), requests.Timeout("долго"),
                                FakeResponse(200, {"id": "1"})])
    assert client.get_vacancy("1") == {"id": "1"}


def test_gives_up_after_max_attempts():
    client, session, _ = make_client([FakeResponse(503)] * 3, max_attempts=3)
    with pytest.raises(HHApiError, match="3 попыток"):
        client.get_vacancy("1")
    assert len(session.calls) == 3


def test_403_is_not_retried():
    client, session, _ = make_client([FakeResponse(403, {"errors": [{"type": "forbidden"}]})])
    with pytest.raises(HHApiError, match="403"):
        client.get_vacancy("1")
    assert len(session.calls) == 1  # повторять бессмысленно: без токена ответ не изменится


def test_404_returns_none():
    client, _, _ = make_client([FakeResponse(404)])
    assert client.get_vacancy("1") is None


class PagedClient(BaseClient):
    """Источник с заданным числом результатов — проверяем пагинацию базового класса."""

    def __init__(self, total):
        self.total, self.pages_requested = total, []

    def search(self, text, date_from, date_to, page, per_page):
        self.pages_requested.append(page)
        start = page * per_page
        items = [{"id": str(i)} for i in range(start, min(start + per_page, self.total))]
        return {"items": items, "found": self.total, "pages": -(-self.total // per_page), "page": page}

    def get_vacancy(self, hh_id):
        return None

    def get_dictionaries(self):
        return {}


def test_pagination_reads_all_pages():
    client = PagedClient(total=250)
    ids = [it["id"] for it in client.iter_search("x", T0, T0, per_page=100)]
    assert len(ids) == 250 and len(set(ids)) == 250
    assert client.pages_requested == [0, 1, 2]


def test_pagination_stops_at_api_limit_of_2000(caplog):
    client = PagedClient(total=2600)
    ids = list(client.iter_search("x", T0, T0, per_page=100))
    assert len(ids) == 2000
    assert "API отдаст не всё" in caplog.text
