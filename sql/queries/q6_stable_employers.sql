-- Вопрос 6. Компании, публикующие вакансии 3 и более месяцев подряд (gaps and islands).
-- Внутри непрерывной серии месяцев (month_no - ROW_NUMBER) постоянна,
-- пропуск месяца меняет разность — так серии разделяются на «острова».
WITH active_months AS (
    SELECT DISTINCT
        v.employer_id,
        date_trunc('month', v.created_at AT TIME ZONE 'Europe/Moscow')::date AS month
    FROM vacancy v
    WHERE v.employer_id IS NOT NULL
),
numbered AS (
    SELECT
        employer_id,
        month,
        (extract(year FROM month) * 12 + extract(month FROM month))::INTEGER AS month_no,
        ROW_NUMBER() OVER (PARTITION BY employer_id ORDER BY month)          AS rn,
        count(*)     OVER (PARTITION BY employer_id)                         AS active_months_total
    FROM active_months
),
islands AS (
    SELECT
        employer_id,
        month_no - rn AS island_id,
        min(month)    AS streak_start,
        max(month)    AS streak_end,
        count(*)      AS streak_months,
        max(active_months_total) AS active_months_total
    FROM numbered
    GROUP BY employer_id, month_no - rn
)
SELECT
    e.name               AS employer,
    i.streak_start,
    i.streak_end,
    i.streak_months,
    i.active_months_total
FROM islands i
JOIN employer e ON e.id = i.employer_id
WHERE i.streak_months >= 3
ORDER BY i.streak_months DESC, e.name, i.streak_start;
