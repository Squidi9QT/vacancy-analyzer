-- =====================================================================
-- Вопрос 6. Какие компании стабильно публикуют вакансии 3 и более месяцев подряд?
--
-- Простыми словами: для каждой компании берём месяцы, когда она создала хотя бы
-- одну вакансию, и ищем непрерывные серии месяцев («острова»). Нужны серии от 3.
--
-- Приём: gaps-and-islands («пропуски и острова») через ROW_NUMBER.
-- Идея на маленьком примере (компания А):
--
--   месяц      номер месяца (год*12+мес)   ROW_NUMBER   разность = id острова
--   2026-03            24315                    1            24314
--   2026-04            24316                    2            24314   ← тот же остров
--   2026-05            24317                    3            24314   ←
--   2026-07            24319                    4            24315   ← пропуск июня: новый остров
--   2026-08            24320                    5            24315
--
-- Внутри непрерывной серии номер месяца и ROW_NUMBER растут на 1 одновременно,
-- поэтому их разность постоянна. Пропуск месяца увеличивает номер на 2, а ROW_NUMBER
-- на 1 — разность меняется, начинается новый остров. GROUP BY по разности = острова.
-- Итог для А: остров март–май (3 месяца) — попадает в ответ; июль–август (2) — нет.
--
-- Почему номер месяца, а не дата: разность дат «дата − ROW_NUMBER дней» не работает,
-- в месяцах разное число дней. Номер месяца год*12+месяц — ровная шкала.
-- Почему DISTINCT в первом CTE: 5 вакансий в марте — это один активный месяц,
-- иначе ROW_NUMBER посчитал бы март пять раз и острова «порвались» бы.
--
-- История оптимизации (docs/query_plans/README.md): первая версия считала
-- active_months_total коррелированным подзапросом
--     (SELECT count(*) FROM active_months am WHERE am.employer_id = i.employer_id).
-- На 300 тыс. вакансий это 4 секунды: подзапрос 5 тыс. раз читал CTE из 40 тыс. строк,
-- а у CTE нет индексов. Теперь то же число считает оконная функция
-- count(*) OVER (PARTITION BY employer_id) за один проход — 0,14 секунды.
-- =====================================================================
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
        max(active_months_total) AS active_months_total  -- одинаков у всех строк компании
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
