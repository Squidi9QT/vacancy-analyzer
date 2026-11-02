-- Вопрос 4. Доля вакансий без зарплаты (нет ни from, ни to) по городам.
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
