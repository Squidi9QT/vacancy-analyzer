-- Вопрос 2. Медианная зарплата (₽ на руки) по месяцам публикации, по ролям и городам.
-- Берётся зарплата первой версии вакансии; медиана только при n >= 5.
WITH first_version AS (
    SELECT
        s.*,
        ROW_NUMBER() OVER (PARTITION BY s.vacancy_id ORDER BY s.valid_from) AS version_no
    FROM vacancy_snapshot s
),
salaries AS (
    SELECT
        v.role,
        a.name                                                         AS city,
        date_trunc('month', v.created_at AT TIME ZONE 'Europe/Moscow')::date AS month,
        salary_rub_net(f.salary_from, f.salary_to, c.rate, f.salary_gross) AS salary
    FROM first_version f
    JOIN vacancy  v ON v.id = f.vacancy_id
    JOIN area     a ON a.id = f.area_id
    JOIN currency c ON c.code = f.currency_code
    WHERE f.version_no = 1
      AND v.role <> 'other'
)
SELECT
    month,
    role,
    CASE WHEN GROUPING(city) = 1 THEN 'Все города' ELSE city END AS city,
    count(*)                                                     AS n_with_salary,
    CASE WHEN count(*) >= 5
         THEN percentile_cont(0.5) WITHIN GROUP (ORDER BY salary)::INTEGER
    END                                                          AS median_salary,
    round(avg(salary))::INTEGER                                  AS avg_salary
FROM salaries
GROUP BY GROUPING SETS ((month, role), (month, role, city))
ORDER BY role, GROUPING(city) DESC, city, month;
