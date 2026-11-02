-- Вопрос 5. Вакансии, впервые появившиеся за 7 дней до последней успешной загрузки.
-- possible_duplicate_of: тот же работодатель, город и название, создана не раньше чем за 14 дней.
WITH params AS (
    SELECT max(as_of)                      AS as_of,
           max(as_of) - INTERVAL '7 days'  AS window_start
    FROM load_run
    WHERE status = 'success'
)
SELECT
    v.hh_id,
    v.name,
    COALESCE(e.name, 'Аноним')                     AS employer,
    a.name                                         AS city,
    v.role,
    (v.first_seen_at AT TIME ZONE 'Europe/Moscow')::date AS first_seen,
    vs.salary_rub_net,
    (SELECT min(d.hh_id)
       FROM vacancy d
      WHERE d.employer_id = v.employer_id
        AND d.area_id     = v.area_id
        AND lower(d.name) = lower(v.name)
        AND d.id <> v.id
        AND d.created_at <  v.created_at
        AND d.created_at >= v.created_at - INTERVAL '14 days') AS possible_duplicate_of
FROM vacancy v
CROSS JOIN params p
LEFT JOIN vacancy_snapshot prior
       ON prior.vacancy_id = v.id
      AND prior.valid_from < p.window_start
LEFT JOIN employer e          ON e.id = v.employer_id
LEFT JOIN v_vacancy_salary vs ON vs.vacancy_id = v.id
JOIN area a                   ON a.id = v.area_id
WHERE v.first_seen_at >= p.window_start
  AND prior.id IS NULL
ORDER BY v.first_seen_at DESC, v.hh_id;
