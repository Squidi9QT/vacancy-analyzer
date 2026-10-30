-- =====================================================================
-- Вопрос 1. Какие навыки чаще всего упоминаются в вакансиях аналитиков?
--
-- Простыми словами: берём вакансии системных аналитиков и аналитиков данных,
-- для каждого навыка считаем, в скольких вакансиях он встречается,
-- и какой это процент от всех вакансий аналитиков.
--
-- Приёмы: CTE (WITH), JOIN через таблицу связи, агрегат с FILTER,
--         HAVING, оконная функция RANK().
-- Почему так:
--   * count(*) после JOIN с vacancy_skill = число вакансий с навыком. Дублей нет:
--     первичный ключ (vacancy_id, skill_id) не даёт записать навык дважды.
--   * Знаменатель — ВСЕ вакансии аналитиков, включая вакансии без навыков.
--     Иначе доля была бы завышена: «из тех, где навыки указаны».
--   * HAVING отсекает редкие навыки: 2 упоминания — это шум, а не тренд.
--   * RANK (а не ROW_NUMBER): у навыков с одинаковым счётом одинаковое место.
-- =====================================================================
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
