-- =====================================================================
-- 001_schema.sql — схема базы «Анализатора вакансий» (PostgreSQL 16)
--
-- Скрипт можно запускать повторно: везде IF NOT EXISTS.
-- Порядок таблиц важен: сначала те, на которые ссылаются (справочники,
-- журнал запусков), потом те, кто ссылается (vacancy, связи, история).
-- Почему так устроены ключи и история — см. docs/decisions/ (ADR-001…006).
-- =====================================================================

-- ---------------------------------------------------------------------
-- load_run — журнал запусков загрузки.
-- Одна строка = один запуск `python -m src.main load`.
-- Пишется ДО начала загрузки (status = 'running') и закрывается в конце.
-- Если процесс упал и не успел закрыть запись, она так и останется
-- 'running' — это тоже сигнал для аналитика.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS load_run (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at          TIMESTAMPTZ,
    -- «Момент наблюдения»: на какую дату мы смотрим на рынок.
    -- Для API это now(), для фикстур — дата из FIXTURE_NOW или backfill.
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
    -- Упавший запуск обязан объяснить, почему упал.
    CONSTRAINT chk_load_run_error   CHECK (status <> 'failed' OR error_text IS NOT NULL)
);

-- ---------------------------------------------------------------------
-- area — город или регион из справочника hh.ru.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS area (
    id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- суррогатный ключ, ADR-001
    hh_id   TEXT NOT NULL UNIQUE,                              -- внешний id: '90' = Томск
    name    TEXT NOT NULL CHECK (name <> '')
);

-- ---------------------------------------------------------------------
-- employer — работодатель.
-- Анонимные работодатели (кадровые агентства «скрыли» клиента) приходят
-- без id. Их в эту таблицу не пишем: у vacancy.employer_id будет NULL.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employer (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hh_id       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL CHECK (name <> ''),
    is_trusted  BOOLEAN NOT NULL DEFAULT false               -- «проверенный» работодатель на hh.ru
);

-- ---------------------------------------------------------------------
-- currency — валюты и курсы из справочника hh.ru (/dictionaries).
-- Внимание: hh.ru называет рубль 'RUR' (старый код), а не ISO 'RUB'.
-- rate — сколько единиц валюты дают за 1 рубль (так отдаёт hh.ru):
-- для USD это ~0.0125, значит 1 USD = 1 / 0.0125 = 80 рублей. ADR-002.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS currency (
    code        TEXT PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
    name        TEXT NOT NULL,
    rate        NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- skill — справочник навыков. Одна строка = один навык.
-- name_normalized — ключ для дедупликации: 'SQL', 'sql ', 'Sql' → 'sql'.
-- name — как навык выглядел, когда встретился впервые (для отображения).
-- Почему навыки в отдельной таблице, а не строкой — ADR-004.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skill (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name             TEXT NOT NULL CHECK (name <> ''),
    name_normalized  TEXT NOT NULL UNIQUE CHECK (name_normalized = lower(name_normalized))
);

-- ---------------------------------------------------------------------
-- vacancy — ТЕКУЩЕЕ состояние вакансии (SCD тип 1: перезаписываем).
-- Одна строка на один hh_id, сколько бы раз мы ни загружали вакансию.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vacancy (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hh_id               TEXT NOT NULL UNIQUE,      -- ключ идемпотентности, ADR-005
    name                TEXT NOT NULL CHECK (name <> ''),
    role                TEXT NOT NULL
                        CHECK (role IN ('system_analyst', 'data_analyst', 'backend_junior', 'other')),
    employer_id         BIGINT REFERENCES employer (id),         -- NULL = анонимный работодатель
    area_id             BIGINT NOT NULL REFERENCES area (id),
    -- Зарплата хранится КАК ПРИШЛА: в исходной валюте, gross или net. ADR-002.
    salary_from         INTEGER CHECK (salary_from > 0),
    salary_to           INTEGER CHECK (salary_to > 0),
    currency_code       TEXT REFERENCES currency (code),
    salary_gross        BOOLEAN,
    experience          TEXT,                       -- id опыта из hh.ru: noExperience, between1And3, …
    schedule            TEXT,                       -- id графика: fullDay, remote, …
    created_at          TIMESTAMPTZ NOT NULL,       -- когда вакансию создали на hh.ru
    published_at        TIMESTAMPTZ NOT NULL,       -- когда последний раз (пере)опубликовали
    content_hash        TEXT NOT NULL,              -- отпечаток значимых полей, чтобы ловить изменения
    first_seen_at       TIMESTAMPTZ NOT NULL,       -- когда МЫ впервые увидели вакансию
    last_seen_at        TIMESTAMPTZ NOT NULL,       -- когда МЫ последний раз видели её в выдаче
    first_load_run_id   BIGINT REFERENCES load_run (id),
    last_load_run_id    BIGINT REFERENCES load_run (id),
    -- «От» не может быть больше «до». NULL с любой стороны — проверка пропускается.
    CONSTRAINT chk_vacancy_salary_range CHECK (salary_from IS NULL OR salary_to IS NULL OR salary_from <= salary_to),
    -- Валюта указана тогда и только тогда, когда указана хоть одна граница зарплаты.
    CONSTRAINT chk_vacancy_currency CHECK ((salary_from IS NULL AND salary_to IS NULL) = (currency_code IS NULL)),
    CONSTRAINT chk_vacancy_seen CHECK (first_seen_at <= last_seen_at),
    CONSTRAINT chk_vacancy_dates CHECK (created_at <= published_at)
);

-- Индексы по внешним ключам: PostgreSQL сам их НЕ создаёт (в отличие от PK/UNIQUE).
-- Без них JOIN и удаление родительской строки читают всю таблицу.
CREATE INDEX IF NOT EXISTS idx_vacancy_employer_id ON vacancy (employer_id);
CREATE INDEX IF NOT EXISTS idx_vacancy_area_id     ON vacancy (area_id);
-- Поля фильтрации в отчётах: роль и дата создания (динамика по месяцам).
CREATE INDEX IF NOT EXISTS idx_vacancy_role_created ON vacancy (role, created_at);

-- ---------------------------------------------------------------------
-- vacancy_skill — связь «многие-ко-многим»: у вакансии много навыков,
-- навык встречается во многих вакансиях. Составной первичный ключ
-- запрещает записать один навык одной вакансии дважды.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vacancy_skill (
    vacancy_id  BIGINT NOT NULL REFERENCES vacancy (id) ON DELETE CASCADE,
    skill_id    BIGINT NOT NULL REFERENCES skill (id),
    PRIMARY KEY (vacancy_id, skill_id)
);
-- PK начинается с vacancy_id, поэтому поиск «все вакансии с навыком X» по нему не ускорить.
CREATE INDEX IF NOT EXISTS idx_vacancy_skill_skill_id ON vacancy_skill (skill_id);

-- ---------------------------------------------------------------------
-- vacancy_snapshot — ИСТОРИЯ вакансии (SCD тип 2). ADR-003.
-- Новая строка появляется только когда изменились значимые поля.
-- [valid_from, valid_to) — период, когда версия была актуальной.
-- valid_to IS NULL — версия актуальна сейчас.
-- ---------------------------------------------------------------------
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
-- Частичный уникальный индекс: у вакансии может быть ровно ОДНА актуальная версия.
-- Обычный UNIQUE(vacancy_id) запретил бы историю; этот действует только на строки с valid_to IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_snapshot_current
    ON vacancy_snapshot (vacancy_id) WHERE valid_to IS NULL;

-- ---------------------------------------------------------------------
-- salary_rub_net() — одна точка правды для пересчёта зарплаты в рубли «на руки».
-- Правила (open_questions.md, вопросы 3–4):
--   * точка вилки: середина, либо единственная указанная граница;
--   * валюта: делим на rate (rate = единиц валюты за 1 рубль);
--   * gross → net: умножаем на 0.87 (упрощение, ставка НДФЛ 13 %).
-- IMMUTABLE: результат зависит только от аргументов, поэтому функцию можно
-- использовать в индексах и планировщик может её кешировать.
-- Если обе границы NULL — вернёт NULL (NULL / число = NULL).
-- ---------------------------------------------------------------------
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

-- v_vacancy_salary — текущая зарплата каждой вакансии в рублях на руки.
-- Только вакансии с зарплатой (JOIN с currency отсекает currency_code IS NULL).
CREATE OR REPLACE VIEW v_vacancy_salary AS
SELECT v.id AS vacancy_id,
       salary_rub_net(v.salary_from, v.salary_to, c.rate, v.salary_gross) AS salary_rub_net
FROM vacancy v
JOIN currency c ON c.code = v.currency_code;
