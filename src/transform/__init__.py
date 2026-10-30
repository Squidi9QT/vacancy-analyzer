"""Transform — превращение вложенного JSON hh.ru в плоские записи для таблиц."""

from src.transform.records import AreaRecord, EmployerRecord, VacancyRecord
from src.transform.roles import classify_role
from src.transform.skills import normalize_skill
from src.transform.vacancy import TransformError, transform_currencies, transform_vacancy

__all__ = ["AreaRecord", "EmployerRecord", "TransformError", "VacancyRecord",
           "classify_role", "normalize_skill", "transform_currencies", "transform_vacancy"]
