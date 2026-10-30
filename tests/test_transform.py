"""Тесты transform: чистые функции, без базы и сети."""

from __future__ import annotations

import pytest

from src.transform import TransformError, classify_role, normalize_skill, transform_currencies, transform_vacancy


def test_basic_fields(load_json):
    rec = transform_vacancy(load_json("vacancy_detail.json"), "system_analyst")
    assert rec.hh_id == "104857600"
    assert rec.name == "Системный аналитик (Middle)"  # пробелы по краям обрезаны
    assert rec.role == "system_analyst"
    assert rec.area.hh_id == "90" and rec.area.name == "Томск"
    assert rec.employer.hh_id == "10000" and rec.employer.is_trusted
    assert rec.experience == "between1And3" and rec.schedule == "remote"
    assert rec.published_at.utcoffset().total_seconds() == 3 * 3600


def test_salary_range_has_priority_over_deprecated_salary(load_json):
    rec = transform_vacancy(load_json("vacancy_detail.json"), "system_analyst")
    # salary (устаревшее) = 100–140 gross, salary_range (новое) = 120–160 net
    assert (rec.salary_from, rec.salary_to, rec.currency_code, rec.salary_gross) == (120000, 160000, "RUR", False)


def test_skills_are_normalized_and_deduplicated(load_json):
    rec = transform_vacancy(load_json("vacancy_detail.json"), "system_analyst")
    # 'SQL' и 'sql ' → один навык; 'Postgres' → 'postgresql'; пустой навык выброшен
    assert [s.name_normalized for s in rec.skills] == ["bpmn", "postgresql", "sql"]
    assert {s.name for s in rec.skills} == {"BPMN", "Postgres", "SQL"}


def test_anonymous_employer_and_no_salary(load_json):
    rec = transform_vacancy(load_json("vacancy_anonymous_no_salary.json"), "backend_junior")
    assert rec.employer is None
    assert rec.salary_from is None and rec.salary_to is None and rec.currency_code is None
    assert rec.schedule is None
    assert rec.skills == ()


def test_broken_vacancy_raises(load_json):
    with pytest.raises(TransformError):
        transform_vacancy(load_json("vacancy_broken.json"), "data_analyst")


@pytest.mark.parametrize("salary, expected", [
    ({"from": 200000, "to": 150000, "currency": "RUR", "gross": False}, (150000, 200000)),  # перепутаны
    ({"from": 0, "to": 90000, "currency": "RUR", "gross": False}, (None, 90000)),          # 0 = не указано
    ({"from": None, "to": None, "currency": "RUR", "gross": False}, (None, None)),         # только валюта
])
def test_salary_edge_cases(load_json, salary, expected):
    detail = load_json("vacancy_detail.json") | {"salary_range": salary, "salary": None}
    rec = transform_vacancy(detail, "system_analyst")
    assert (rec.salary_from, rec.salary_to) == expected
    if expected == (None, None):
        assert rec.currency_code is None  # иначе нарушим CHECK chk_vacancy_currency


def test_salary_without_currency_is_error(load_json):
    detail = load_json("vacancy_detail.json") | {"salary_range": {"from": 1000, "to": None, "currency": None}}
    with pytest.raises(TransformError):
        transform_vacancy(detail, "system_analyst")


def test_content_hash_is_stable_and_sensitive(load_json):
    d = load_json("vacancy_detail.json")
    h1 = transform_vacancy(d, "system_analyst").content_hash
    h2 = transform_vacancy(load_json("vacancy_detail.json"), "system_analyst").content_hash
    assert h1 == h2 and len(h1) == 64
    # порядок навыков не влияет на хэш
    d_reordered = d | {"key_skills": list(reversed(d["key_skills"]))}
    assert transform_vacancy(d_reordered, "system_analyst").content_hash == h1
    # изменение зарплаты меняет хэш
    d_salary = d | {"salary_range": d["salary_range"] | {"to": 170000}}
    assert transform_vacancy(d_salary, "system_analyst").content_hash != h1


@pytest.mark.parametrize("name, search_role, expected", [
    ("Системный аналитик", "system_analyst", "system_analyst"),
    ("Ведущий системный аналитик", "system_analyst", "system_analyst"),
    ("System Analyst", "system_analyst", "system_analyst"),
    ("Тестировщик / системный аналитик (стажёр)", "system_analyst", "other"),
    ("Руководитель группы системных аналитиков", "system_analyst", "other"),
    ("Аналитик данных 1С", "data_analyst", "other"),
    ("Системный аналитик / аналитик данных", "data_analyst", "system_analyst"),
    ("BI-аналитик", "data_analyst", "data_analyst"),
    ("Junior Python-разработчик", "backend_junior", "backend_junior"),
    ("Стажёр-разработчик Python", "backend_junior", "backend_junior"),
    ("Python Developer", "backend_junior", "backend_junior"),  # правило не сработало → роль запроса
])
def test_classify_role(name, search_role, expected):
    assert classify_role(name, search_role) == expected


def test_classify_role_rejects_unknown_search_role():
    with pytest.raises(ValueError):
        classify_role("Аналитик", "analyst")


@pytest.mark.parametrize("raw, expected", [
    ("SQL", "sql"), (" sql ", "sql"), ("MS  Excel", "ms excel"), ("Excel", "ms excel"),
    ("Postgres", "postgresql"), ("RESTful API", "rest api"), ("Power  BI", "power bi"),
])
def test_normalize_skill(raw, expected):
    assert normalize_skill(raw) == expected


def test_normalize_skill_rejects_empty():
    with pytest.raises(ValueError):
        normalize_skill("   ")


def test_transform_currencies_skips_rows_without_rate():
    rows = transform_currencies({"currency": [{"code": "RUR", "name": "Рубли", "rate": 1},
                                              {"code": "XXX", "name": "Без курса", "rate": None}]})
    assert rows == [("RUR", "Рубли", 1.0)]
