-- Вопрос 1б. Доля вакансий аналитиков с навыком: топ-10 навыков × города с 30+ вакансиями.
WITH analyst AS (
    SELECT v.id, a.name AS city
    FROM vacancy v
    JOIN area a ON a.id = v.area_id
    WHERE v.role IN ('system_analyst', 'data_analyst')
),
cities AS (
    SELECT city, count(*) AS n_vacancies
    FROM analyst
    GROUP BY city
    HAVING count(*) >= 30
),
top_skills AS (
    SELECT vs.skill_id
    FROM analyst an
    JOIN vacancy_skill vs ON vs.vacancy_id = an.id
    GROUP BY vs.skill_id
    ORDER BY count(*) DESC
    LIMIT 10
),
mentions AS (
    SELECT an.city, vs.skill_id, count(*) AS n
    FROM analyst an
    JOIN vacancy_skill vs ON vs.vacancy_id = an.id
    WHERE vs.skill_id IN (SELECT skill_id FROM top_skills)
    GROUP BY an.city, vs.skill_id
)
SELECT
    s.name                                              AS skill,
    c.city,
    c.n_vacancies,
    COALESCE(m.n, 0)                                    AS mentions,
    round(100.0 * COALESCE(m.n, 0) / c.n_vacancies, 1)  AS share_pct
FROM top_skills t
JOIN skill s ON s.id = t.skill_id
CROSS JOIN cities c
LEFT JOIN mentions m ON m.skill_id = t.skill_id AND m.city = c.city
ORDER BY s.name, c.city;
