-- =====================================================================
-- Вопрос 4. Какой процент вакансий без указания зарплаты
--           и различается ли он по регионам?
--
-- Простыми словами: для каждого города считаем долю вакансий, где не указано
-- ни «от», ни «до». Отдельной строкой — итог по всем городам.
--
-- Приёмы: агрегат с FILTER, AVG по булеву выражению, HAVING, ROLLUP.
-- Почему так:
--   * «Без зарплаты» = обе границы NULL. Если указано хотя бы «от» — зарплата есть
--     (так решили в open_questions.md, вопрос 2).
--   * avg((условие)::int) — доля строк, где условие истинно: TRUE = 1, FALSE = 0.
--   * HAVING count(*) >= 30: при 10 вакансиях одна вакансия меняет долю на 10 п.п.
--     Различие по городам проверяем доверительным интервалом в отчёте (src/report.py).
--   * ROLLUP добавляет строку итога; GROUPING() отличает её от обычного города.
-- =====================================================================
SELECT
    CASE WHEN GROUPING(a.name) = 1 THEN 'Все города' ELSE a.name END AS city,
    count(*)                                                          AS vacancies,
    count(*) FILTER (WHERE v.salary_from IS NULL AND v.salary_to IS NULL) AS without_salary,
    round(100.0 * avg((v.salary_from IS NULL AND v.salary_to IS NULL)::int), 1) AS pct_without_salary
FROM vacancy v
JOIN area a ON a.id = v.area_id
GROUP BY ROLLUP (a.name)
HAVING count(*) >= 30
ORDER BY GROUPING(a.name), pct_without_salary DESC;
