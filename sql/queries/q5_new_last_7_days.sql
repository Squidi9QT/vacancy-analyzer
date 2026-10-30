-- =====================================================================
-- Вопрос 5. Какие вакансии появились за последние 7 дней
--           и не встречались раньше (дедупликация по внешнему id)?
--
-- Простыми словами: «сегодня» — момент последней успешной загрузки.
-- Новая вакансия — та, которую мы впервые увидели в последние 7 дней
-- И у которой нет ни одной версии, начавшейся раньше окна.
-- Дополнительно помечаем возможные дубли: тот же работодатель, название и город,
-- другой id, и созданы с разницей не больше 14 дней (вакансию закрыли и выложили
-- заново или открыли две одинаковые). Без ограничения по времени «дублем» стала бы
-- любая вакансия «Системный аналитик» компании, которая нанимает каждый месяц.
--
-- Приёмы: CTE с параметрами, LEFT JOIN + проверка на NULL (anti-join),
--         коррелированный подзапрос, LEFT JOIN для необязательной связи.
-- Почему так:
--   * «Сегодня» берём из load_run, а не now(): на фикстурах now() — это 2026-10-31
--     реального времени, а данные — на 2026-10-30. Запрос воспроизводим.
--   * Две проверки «новизны»: first_seen_at (когда МЫ увидели) и отсутствие ранних
--     версий (когда вакансию ОПУБЛИКОВАЛИ). Если загрузку запустили впервые сегодня,
--     first_seen_at у всех — сегодня, и первая проверка сочла бы новыми все вакансии.
--   * LEFT JOIN ... WHERE prior.id IS NULL — «оставь вакансии, для которых НЕ нашлось
--     ранней версии». Аналог NOT EXISTS; планировщик превращает оба в Anti Join.
--   * employer — через LEFT JOIN: у анонимных вакансий employer_id IS NULL,
--     INNER JOIN молча выкинул бы их из списка новых.
--   * Сравнение employer_id = employer_id для анонимов даёт NULL (не TRUE), поэтому
--     анонимные вакансии никогда не помечаются дублями — это корректно: мы не знаем,
--     одна ли это компания.
--   * Дубли не удаляем, а помечаем: решение «это одна вакансия» — за человеком
--     (open_questions.md, вопрос 1).
-- =====================================================================
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
