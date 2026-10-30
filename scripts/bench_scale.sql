-- =====================================================================
-- bench_scale.sql — синтетическая «большая» база для замеров EXPLAIN ANALYZE.
--
-- Зачем: на 1 тыс. вакансий любой запрос выполняется за миллисекунды,
-- и PostgreSQL почти всегда выбирает полное чтение таблицы (Seq Scan) — оно
-- дешевле индекса на маленьких таблицах. Чтобы увидеть, где нужны индексы,
-- нужен объём, похожий на реальный: ~300 тыс. вакансий (порядок объёма IT-вакансий
-- на hh.ru за год).
--
-- Запуск (база vacancies_bench, схема уже создана sql/001_schema.sql):
--   psql -d vacancies_bench -f scripts/bench_scale.sql
-- Данные случайные (setseed для воспроизводимости), бизнес-смысла в них нет.
-- =====================================================================
SELECT setseed(0.42);

INSERT INTO load_run (started_at, finished_at, as_of, source, status)
VALUES (now(), now(), '2026-10-30 23:59:59+03', 'fixtures', 'success');

INSERT INTO currency (code, name, rate) VALUES
    ('RUR', 'Рубли', 1), ('USD', 'Доллары', 0.0125), ('EUR', 'Евро', 0.0108), ('KZT', 'Тенге', 6.2);

INSERT INTO area (hh_id, name)
SELECT g::text, 'Город ' || g FROM generate_series(1, 60) g;

INSERT INTO employer (hh_id, name, is_trusted)
SELECT g::text, 'Компания ' || g, random() < 0.8 FROM generate_series(1, 5000) g;

INSERT INTO skill (name, name_normalized)
SELECT 'Навык ' || g, 'навык ' || g FROM generate_series(1, 300) g;

-- 300 000 вакансий, равномерно по 2026-03-01 … 2026-10-30
INSERT INTO vacancy (hh_id, name, role, employer_id, area_id, salary_from, salary_to, currency_code,
                     salary_gross, created_at, published_at, content_hash, first_seen_at, last_seen_at)
SELECT
    (100000000 + g)::text,
    (ARRAY['Системный аналитик', 'Аналитик данных', 'Junior Python-разработчик', 'BI-аналитик',
           'Ведущий системный аналитик', 'Data Analyst'])[1 + (g % 6)] || ' ' || (g % 40),
    (ARRAY['system_analyst', 'data_analyst', 'backend_junior', 'other'])[1 + (g % 4)],
    CASE WHEN random() < 0.05 THEN NULL ELSE 1 + floor(random() * 5000)::int END,
    1 + floor(random() * 60)::int,
    s.f, s.t, CASE WHEN s.f IS NULL AND s.t IS NULL THEN NULL ELSE 'RUR' END,
    random() < 0.45,
    c.created, c.created, md5(g::text), c.created + interval '3 hours', c.created + interval '20 days'
FROM generate_series(1, 300000) g
CROSS JOIN LATERAL (SELECT timestamptz '2026-03-01 00:00+03'
                           + random() * (timestamptz '2026-10-30 23:00+03' - timestamptz '2026-03-01 00:00+03')
                           AS created, g AS dummy) c
CROSS JOIN LATERAL (SELECT CASE WHEN random() < 0.65 THEN 50000 + floor(random() * 200000)::int END AS f,
                           NULL::int AS t, g AS dummy) s;

-- 1–3 версии на вакансию
INSERT INTO vacancy_snapshot (vacancy_id, valid_from, valid_to, name, area_id, salary_from, salary_to,
                              currency_code, salary_gross, published_at, content_hash)
SELECT v.id, v.created_at + (k - 1) * interval '7 days',
       CASE WHEN k < n THEN v.created_at + k * interval '7 days' END,
       v.name, v.area_id, v.salary_from, v.salary_to, v.currency_code, v.salary_gross,
       v.created_at + (k - 1) * interval '7 days', md5(v.id::text || k)
FROM vacancy v
CROSS JOIN LATERAL (SELECT 1 + floor(random() * 3)::int AS n, v.id AS dummy) cnt
CROSS JOIN LATERAL generate_series(1, cnt.n) k;

-- 5 навыков на вакансию
INSERT INTO vacancy_skill (vacancy_id, skill_id)
SELECT DISTINCT v.id, 1 + floor(random() * 300)::int
FROM vacancy v CROSS JOIN generate_series(1, 5)
ON CONFLICT DO NOTHING;

ANALYZE;
