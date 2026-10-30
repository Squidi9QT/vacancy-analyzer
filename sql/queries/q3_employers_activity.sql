-- =====================================================================
-- Вопрос 3. Какие работодатели публикуют больше всего вакансий
--           и как часто обновляют одну и ту же вакансию?
--
-- Простыми словами: для каждой версии вакансии смотрим на предыдущую версию
-- (LAG): сколько дней прошло и что поменялось. Потом сводим по работодателю.
--
-- Приёмы: оконная функция LAG с именованным окном (WINDOW), IS DISTINCT FROM,
--         агрегаты с FILTER, CTE.
-- Почему так:
--   * «Обновление» = новая версия в vacancy_snapshot (SCD2). Первая версия —
--     это публикация, а не обновление, поэтому её не считаем (prev IS NULL).
--   * IS DISTINCT FROM, а не <>: если зарплата была NULL и стала 100 000,
--     то NULL <> 100000 даёт NULL (не TRUE), и изменение потерялось бы.
--   * Анонимные работодатели исключены (INNER JOIN employer): все «Компания скрыта»
--     — разные компании, складывать их в одну строку бессмысленно.
--   * ORDER BY в окне обязателен: без него «предыдущая» версия — случайная строка.
-- =====================================================================
WITH versions AS (
    SELECT
        s.vacancy_id,
        s.valid_from,
        s.salary_from,
        s.salary_to,
        s.name,
        LAG(s.valid_from)  OVER w AS prev_valid_from,
        LAG(s.salary_from) OVER w AS prev_salary_from,
        LAG(s.salary_to)   OVER w AS prev_salary_to,
        LAG(s.name)        OVER w AS prev_name
    FROM vacancy_snapshot s
    WINDOW w AS (PARTITION BY s.vacancy_id ORDER BY s.valid_from)
),
per_vacancy AS (
    SELECT
        vacancy_id,
        count(*) FILTER (WHERE prev_valid_from IS NOT NULL) AS updates,
        count(*) FILTER (WHERE prev_valid_from IS NOT NULL
                           AND (salary_from, salary_to) IS DISTINCT FROM (prev_salary_from, prev_salary_to))
                                                            AS salary_changes,
        count(*) FILTER (WHERE prev_valid_from IS NOT NULL AND name IS DISTINCT FROM prev_name)
                                                            AS name_changes,
        avg(extract(epoch FROM valid_from - prev_valid_from) / 86400.0) AS avg_days_between
    FROM versions
    GROUP BY vacancy_id
)
SELECT
    e.name                                                         AS employer,
    count(*)                                                       AS vacancies,
    sum(p.updates)                                                 AS updates,
    round(avg(p.updates), 2)                                       AS updates_per_vacancy,
    round(100.0 * count(*) FILTER (WHERE p.updates > 0) / count(*), 1) AS pct_updated,
    sum(p.salary_changes)                                          AS salary_changes,
    sum(p.name_changes)                                            AS name_changes,
    round(avg(p.avg_days_between)::numeric, 1)                     AS avg_days_between_updates
FROM vacancy v
JOIN employer e    ON e.id = v.employer_id
JOIN per_vacancy p ON p.vacancy_id = v.id
GROUP BY e.id, e.name
ORDER BY vacancies DESC, employer
LIMIT 15;
