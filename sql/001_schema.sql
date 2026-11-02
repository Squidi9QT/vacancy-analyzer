-- Схема базы «Анализатора вакансий» (PostgreSQL 16).

CREATE TABLE IF NOT EXISTS load_run (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at          TIMESTAMPTZ,
    as_of                TIMESTAMPTZ NOT NULL,
    source               TEXT        NOT NULL CHECK (source IN ('api', 'fixtures')),
    params               JSONB       NOT NULL DEFAULT '{}'::jsonb,
    status               TEXT        NOT NULL DEFAULT 'running'
                         CHECK (status IN ('running', 'success', 'failed')),
    vacancies_processed  INTEGER     NOT NULL DEFAULT 0 CHECK (vacancies_processed >= 0),
    vacancies_new        INTEGER     NOT NULL DEFAULT 0 CHECK (vacancies_new >= 0),
    vacancies_changed    INTEGER     NOT NULL DEFAULT 0 CHECK (vacancies_changed >= 0),
    vacancies_skipped    INTEGER     NOT NULL DEFAULT 0 CHECK (vacancies_skipped >= 0),
    error_text           TEXT,
    CONSTRAINT chk_load_run_finished CHECK (finished_at IS NULL OR finished_at >= started_at),
    CONSTRAINT chk_load_run_error   CHECK (status <> 'failed' OR error_text IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS area (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hh_id   TEXT NOT NULL UNIQUE,
    name    TEXT NOT NULL CHECK (name <> '')
);

CREATE TABLE IF NOT EXISTS employer (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hh_id       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL CHECK (name <> ''),
    is_trusted  BOOLEAN NOT NULL DEFAULT false
);

-- rate: единиц валюты за 1 рубль, как в /dictionaries hh.ru (рубль там 'RUR')
CREATE TABLE IF NOT EXISTS currency (
    code        TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
    name        TEXT NOT NULL,
    rate        NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skill (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name             TEXT NOT NULL CHECK (name <> ''),
    name_normalized  TEXT NOT NULL UNIQUE CHECK (name_normalized = lower(name_normalized))
);

CREATE TABLE IF NOT EXISTS vacancy (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hh_id               TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL CHECK (name <> ''),
    role                TEXT NOT NULL
                        CHECK (role IN ('system_analyst', 'data_analyst', 'backend_junior', 'other')),
    employer_id         BIGINT REFERENCES employer (id),
    area_id             BIGINT NOT NULL REFERENCES area (id),
    salary_from         INTEGER CHECK (salary_from > 0),
    salary_to           INTEGER CHECK (salary_to > 0),
    currency_code       TEXT REFERENCES currency (code),
    salary_gross        BOOLEAN,
    experience          TEXT,
    schedule            TEXT,
    created_at          TIMESTAMPTZ NOT NULL,
    published_at        TIMESTAMPTZ NOT NULL,
    content_hash        TEXT NOT NULL,
    first_seen_at       TIMESTAMPTZ NOT NULL,
    last_seen_at        TIMESTAMPTZ NOT NULL,
    first_load_run_id   BIGINT REFERENCES load_run (id),
    last_load_run_id    BIGINT REFERENCES load_run (id),
    CONSTRAINT chk_vacancy_salary_range CHECK (salary_from IS NULL OR salary_to IS NULL OR salary_from <= salary_to),
    CONSTRAINT chk_vacancy_currency CHECK ((salary_from IS NULL AND salary_to IS NULL) = (currency_code IS NULL)),
    CONSTRAINT chk_vacancy_seen CHECK (first_seen_at <= last_seen_at),
    CONSTRAINT chk_vacancy_dates CHECK (created_at <= published_at)
);

CREATE INDEX IF NOT EXISTS idx_vacancy_employer_id ON vacancy (employer_id);
CREATE INDEX IF NOT EXISTS idx_vacancy_area_id     ON vacancy (area_id);
CREATE INDEX IF NOT EXISTS idx_vacancy_role_created ON vacancy (role, created_at);

CREATE TABLE IF NOT EXISTS vacancy_skill (
    vacancy_id  BIGINT NOT NULL REFERENCES vacancy (id) ON DELETE CASCADE,
    skill_id    BIGINT NOT NULL REFERENCES skill (id),
    PRIMARY KEY (vacancy_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_vacancy_skill_skill_id ON vacancy_skill (skill_id);

CREATE TABLE IF NOT EXISTS vacancy_snapshot (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vacancy_id     BIGINT NOT NULL REFERENCES vacancy (id) ON DELETE CASCADE,
    valid_from     TIMESTAMPTZ NOT NULL,
    valid_to       TIMESTAMPTZ,
    name           TEXT NOT NULL,
    area_id        BIGINT NOT NULL REFERENCES area (id),
    salary_from    INTEGER CHECK (salary_from > 0),
    salary_to      INTEGER CHECK (salary_to > 0),
    currency_code  TEXT REFERENCES currency (code),
    salary_gross   BOOLEAN,
    published_at   TIMESTAMPTZ NOT NULL,
    content_hash   TEXT NOT NULL,
    load_run_id    BIGINT REFERENCES load_run (id),
    CONSTRAINT chk_snapshot_period CHECK (valid_to IS NULL OR valid_to > valid_from),
    CONSTRAINT chk_snapshot_salary_range CHECK (salary_from IS NULL OR salary_to IS NULL OR salary_from <= salary_to),
    CONSTRAINT uq_snapshot_vacancy_valid_from UNIQUE (vacancy_id, valid_from)
);
-- одна актуальная версия на вакансию
CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshot_current
    ON vacancy_snapshot (vacancy_id) WHERE valid_to IS NULL;

CREATE OR REPLACE FUNCTION salary_rub_net(
    p_from INTEGER, p_to INTEGER, p_rate NUMERIC, p_gross BOOLEAN
) RETURNS INTEGER
LANGUAGE sql IMMUTABLE AS $$
    SELECT round(
        (CASE
             WHEN p_from IS NOT NULL AND p_to IS NOT NULL THEN (p_from + p_to) / 2.0
             ELSE COALESCE(p_from, p_to)
         END)
        / p_rate
        * (CASE WHEN p_gross THEN 0.87 ELSE 1 END)
    )::INTEGER
$$;

CREATE OR REPLACE VIEW v_vacancy_salary AS
SELECT v.id AS vacancy_id,
       salary_rub_net(v.salary_from, v.salary_to, c.rate, v.salary_gross) AS salary_rub_net
FROM vacancy v
JOIN currency c ON c.code = v.currency_code;
