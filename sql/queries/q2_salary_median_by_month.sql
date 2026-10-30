-- =====================================================================
-- Вопрос 2. Как менялась медианная зарплата по месяцам (по ролям и городам)?
--
-- Простыми словами: для каждой вакансии берём зарплату, которую предлагали
-- при ПЕРВОЙ публикации, переводим в рубли «на руки» и считаем медиану
-- по месяцу создания вакансии — отдельно по роли и по паре роль × город.
--
-- Приёмы: CTE, оконная функция ROW_NUMBER() для выбора первой версии,
--         percentile_cont (медиана), GROUPING SETS (два уровня итогов за один проход).
-- Почему так:
--   * Медиана, а не среднее: одна вакансия «Ведущий аналитик, 600 000» сдвигает
--     среднее, но почти не двигает медиану.
--   * Первая версия, а не текущая: если в октябре работодатель поднял зарплату
--     мартовской вакансии, мартовская точка не должна «переехать». Нам важно,
--     что предлагали в момент публикации.
--   * Месяц считаем по московскому времени (AT TIME ZONE): иначе результат
--     зависит от часового пояса сервера (см. «Подводные камни»).
--   * Если в ячейке меньше 5 вакансий с зарплатой, медиану не показываем (NULL):
--     медиана из двух чисел — это не тренд.
--   * JOIN currency отсекает версии без зарплаты: у них currency_code IS NULL.
-- =====================================================================
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
