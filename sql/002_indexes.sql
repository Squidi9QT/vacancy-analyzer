-- Индексы, добавленные по результатам EXPLAIN ANALYZE (docs/query_plans/).

CREATE INDEX IF NOT EXISTS idx_vacancy_first_seen_at ON vacancy (first_seen_at);

CREATE INDEX IF NOT EXISTS idx_vacancy_duplicate_lookup
    ON vacancy (employer_id, area_id, lower(name), created_at);
