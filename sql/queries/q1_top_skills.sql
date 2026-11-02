-- Вопрос 1. Какие навыки чаще всего упоминаются в вакансиях аналитиков?
-- Доля считается от всех вакансий аналитиков, включая вакансии без навыков.
WITH analyst AS (
    SELECT id, role
    FROM vacancy
    WHERE role IN ('system_analyst', 'data_analyst')
)
SELECT
    s.name                                                    AS skill,
    count(*)                                                  AS vacancies,
    count(*) FILTER (WHERE a.role = 'system_analyst')         AS system_analyst,
    count(*) FILTER (WHERE a.role = 'data_analyst')           AS data_analyst,
    round(100.0 * count(*) / (SELECT count(*) FROM analyst), 1) AS share_pct,
    RANK() OVER (ORDER BY count(*) DESC)                      AS place
FROM analyst a
JOIN vacancy_skill vs ON vs.vacancy_id = a.id
JOIN skill s          ON s.id = vs.skill_id
GROUP BY s.id, s.name
HAVING count(*) >= 5
ORDER BY vacancies DESC, skill
LIMIT 20;
