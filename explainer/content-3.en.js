window.CONTENTS = window.CONTENTS || {};
(function (CONTENT) {
CONTENT.glossary = [
  ["Vacancy", "An employer's job posting. For us — a record with a unique id on hh.ru.", "hh_id = 104857600, \"Systems Analyst\", Tomsk.", "model"],
  ["External id (hh_id)", "An identifier assigned by the source, not by our database.", "vacancy.hh_id — ON CONFLICT works on it.", "model"],
  ["Surrogate key", "An artificial row number created by our database. Means nothing in the real world.", "vacancy.id BIGINT GENERATED ALWAYS AS IDENTITY (ADR-001).", "decisions"],
  ["Natural key", "A key taken from the data itself that means something: a currency code, a passport number.", "currency.code = 'USD' — a natural key fits here.", "model"],
  ["Primary key (PK)", "A column (or set of columns) that uniquely identifies a row. Can't be NULL or repeat.", "PRIMARY KEY (vacancy_id, skill_id) in vacancy_skill.", "model"],
  ["Foreign key (FK)", "A column referencing the PK of another table. The database won't let you reference a non-existent row.", "vacancy.area_id REFERENCES area(id).", "model"],
  ["UNIQUE", "A constraint: a value can't repeat in the table. Unlike PK, it allows NULL.", "vacancy.hh_id UNIQUE.", "model"],
  ["CHECK", "A condition constraint: the database rejects a row where the condition is false.", "salary_from ≤ salary_to.", "model"],
  ["Partial index", "An index only over rows matching a WHERE condition.", "UNIQUE (vacancy_id) WHERE valid_to IS NULL — one current version.", "model"],
  ["Index", "A separate ordered structure (usually a B-tree) the database uses to find rows fast — like the index at the back of a book.", "idx_vacancy_first_seen_at made q5 12× faster.", "pitfalls"],
  ["Composite index", "An index over several columns. Works left to right: by the first column, then by the second within it.", "(employer_id, area_id, lower(name), created_at).", "sql"],
  ["Expression index", "An index on the result of a function rather than a column. Used only if the query contains the same expression.", "lower(name) in idx_vacancy_duplicate_lookup.", "sql"],
  ["Normalization", "Laying data out across tables so that each fact is stored in one place.", "Skills in skill + vacancy_skill, not as a string.", "model"],
  ["Many-to-many", "A relationship where A has many B and B has many A. Stored in a separate link table.", "vacancy ↔ skill via vacancy_skill.", "model"],
  ["Deduplication", "Removing or flagging repeats: one entity should be stored once.", "UNIQUE(hh_id); possible_duplicate_of flag in q5.", "sql"],
  ["ETL", "Extract — Transform — Load: get the data, shape it, load it.", "src/extract → src/transform → src/load.", "etl"],
  ["Idempotency", "A property of an operation: running it again gives the same result as the first time.", "load --days 7 twice → same row counts (test).", "etl"],
  ["Upsert", "\"Insert, and if the record already exists — update it\". In PostgreSQL — INSERT … ON CONFLICT … DO UPDATE.", "upsert_vacancy() in src/load/repository.py.", "etl"],
  ["EXCLUDED", "In ON CONFLICT DO UPDATE — the row you tried to insert (the new values).", "SET name = EXCLUDED.name.", "etl"],
  ["xmax", "A PostgreSQL system column. A freshly inserted row has xmax = 0 — that's how one query tells an insert from an update.", "RETURNING id, (xmax = 0) AS inserted.", "etl"],
  ["Transaction", "A group of operations executed entirely or not at all.", "One vacancy = one transaction: row + skills + version.", "etl"],
  ["Autocommit", "A mode where each statement is committed immediately. In psycopg 3 with it, a conn.transaction() block is a real BEGIN…COMMIT.", "connect() in src/load/db.py.", "pitfalls"],
  ["SAVEPOINT", "A save point inside a transaction: you can roll back to it without cancelling the whole transaction.", "Without autocommit a nested conn.transaction() would become a SAVEPOINT.", "pitfalls"],
  ["SCD (Slowly Changing Dimension)", "A way to keep history of slowly changing data. Type 1 — overwrite, type 2 — keep versions with a validity period.", "vacancy is type 1, vacancy_snapshot is type 2.", "decisions"],
  ["Hash (content_hash)", "A short \"fingerprint\" of data: same data → same hash, any change → a different one.", "SHA-256 of the vacancy's significant fields.", "etl"],
  ["Retry", "Repeating a request after a temporary error.", "Up to 5 attempts in HHClient._get().", "etl"],
  ["Backoff (exponential)", "The pause between retries doubles: 1, 2, 4, 8 s.", "HHClient.backoff_seconds().", "etl"],
  ["Jitter", "A random extra added to the pause so clients don't retry in sync.", "+0…10% to the pause.", "etl"],
  ["Rate limit", "An API limit on requests per unit of time. Exceeding it returns 429.", "HH_REQUEST_DELAY = 0.5 s between requests.", "pitfalls"],
  ["HTTP 429", "\"Too Many Requests\". Wait and retry.", "Part of RETRY_STATUSES.", "etl"],
  ["Retry-After", "A response header: how many seconds the server asks you to wait.", "If present, we wait exactly that long.", "etl"],
  ["Timeout", "The maximum time to wait for a response. Without it a hung server freezes the load forever.", "timeout=(5, 30): connect and read.", "etl"],
  ["Pagination", "Returning results page by page.", "page, per_page, pages in hh.ru search; 2000-result limit.", "etl"],
  ["User-Agent", "A request header naming the client. hh.ru requires a contact in it.", "VacancyAnalyzer/0.1 (email).", "etl"],
  ["Fixture", "Pre-prepared test data.", "tests/fixtures/hh_world.json and tests/fixtures/api/*.json.", "map"],
  ["Backfill", "Loading historical data for a past period.", "backfill replays 244 daily runs over the fixtures.", "etl"],
  ["Migration", "A SQL file that changes the database schema. Applied in order.", "sql/001_schema.sql, sql/002_indexes.sql.", "model"],
  ["View", "A saved query that can be used like a table.", "v_vacancy_salary — salary in net ₽.", "model"],
  ["Materialized view", "A view whose result is stored on disk and refreshed with REFRESH.", "A way to speed up q2 (not implemented).", "pitfalls"],
  ["CTE (WITH)", "A named subquery at the top of a query. Makes SQL readable step by step.", "WITH analyst AS (…) in q1.", "sql"],
  ["Subquery", "A query inside another query.", "(SELECT count(*) FROM analyst) in q1.", "sql"],
  ["Correlated subquery", "A subquery that references the outer row and runs once per row.", "Duplicate lookup in q5; the first (slow) version of q6.", "sql"],
  ["JOIN", "Combining rows of two tables by a condition. INNER — matches only; LEFT — all rows on the left, NULL on the right if no match.", "LEFT JOIN employer in q5 keeps anonymous vacancies.", "sql"],
  ["Anti-join", "\"Rows that have NO match\": LEFT JOIN … WHERE right.id IS NULL, or NOT EXISTS.", "q5: vacancies without earlier versions.", "sql"],
  ["GROUP BY", "Collapses rows with equal values into one group for aggregates (count, sum, avg).", "GROUP BY s.id, s.name in q1.", "sql"],
  ["HAVING", "A filter on groups after aggregation. WHERE filters rows before it.", "HAVING count(*) >= 5 in q1.", "sql"],
  ["FILTER", "A condition for a single aggregate: count(*) FILTER (WHERE …).", "count(*) FILTER (WHERE a.role = 'system_analyst').", "sql"],
  ["GROUPING SETS / ROLLUP", "Several grouping levels in one pass. ROLLUP adds a total row.", "\"All cities\" in q2 and q4.", "sql"],
  ["Window function", "Computes a value over a group of rows (a \"window\") without collapsing them — the value is added to each row.", "ROW_NUMBER, RANK, LAG, count(*) OVER.", "sql"],
  ["PARTITION BY", "Splits rows into windows for a window function.", "PARTITION BY vacancy_id.", "sql"],
  ["ROW_NUMBER", "The row's number within the window: 1, 2, 3… with no repeats.", "First version of a vacancy in q2.", "sql"],
  ["RANK", "The row's place; equal values share a place, the next place is skipped (1, 2, 2, 4).", "place in q1.", "sql"],
  ["LAG", "The value from the previous row of the window.", "Previous version of a vacancy in q3.", "sql"],
  ["Gaps and islands", "A technique for finding continuous runs (\"islands\") in a sequence with gaps: \"number − ROW_NUMBER\" is constant within a run.", "Companies hiring 3+ months in a row (q6).", "sql"],
  ["NULL", "\"Unknown value\". Any comparison with NULL via =, <> yields NULL, not TRUE/FALSE.", "Salary not specified → NULL.", "sql"],
  ["IS DISTINCT FROM", "A comparison where NULL is a regular value: NULL IS DISTINCT FROM 5 → TRUE.", "Salary change in q3.", "sql"],
  ["COALESCE", "Returns the first non-NULL argument.", "COALESCE(e.name, 'Аноним') in q5.", "sql"],
  ["Median", "The middle value of a sorted series: half below, half above. Robust to outliers.", "percentile_cont(0.5) in q2.", "sql"],
  ["percentile_cont", "A percentile function; with an even count it interpolates between the two middle values.", "Median of 150,000 and 200,000 = 175,000.", "sql"],
  ["EXPLAIN ANALYZE", "Runs the query and shows the plan: steps, row counts and time per step.", "docs/query_plans/*.txt.", "pitfalls"],
  ["Seq Scan / Index Scan", "Full table read / lookup via an index. On small tables a Seq Scan is cheaper.", "q5 before and after the index.", "pitfalls"],
  ["Parameterized query", "A query whose values are passed separately from the SQL text (%s). Protects against SQL injection.", "All queries in repository.py.", "pitfalls"],
  ["SQL injection", "An attack: data is pasted into SQL text and becomes code.", "Test test_sql_injection_in_name_is_stored_as_text.", "pitfalls"],
  ["ORM", "A library that turns tables into classes and writes SQL for you.", "Not used in this project (ADR-006).", "model"],
  ["TIMESTAMPTZ", "A \"point in time\" type that accounts for time zones. Stored in UTC, displayed in the session's zone.", "first_seen_at, published_at.", "pitfalls"],
  ["Gross / net", "Salary before tax (gross) and take-home (net).", "salary_gross; gross × 0.87 in salary_rub_net().", "decisions"],
  ["Confidence interval", "A range that contains the true value with a given confidence (95%). The smaller the sample, the wider it is.", "Wilson intervals on the no-salary chart.", "charts"],
  ["Simpson's paradox", "A difference between groups can vanish or reverse once a third factor is accounted for.", "The no-salary share by city mixes the effect of the city and of the employer mix.", "charts"],
  ["User story", "A requirement in the form \"As a <role>, I want <action>, so that <value>\".", "docs/requirements/user_stories.md.", "requirements"],
  ["Acceptance criteria", "Verifiable conditions that decide whether a story is done. Often in Given/When/Then form.", "Given \"SQL\" and \"sql\", Then one skill.", "requirements"],
  ["Use case", "A scenario for reaching a goal: the main flow and alternative ones (what if).", "UC-1 initial load.", "requirements"],
  ["Stakeholder / actor", "A stakeholder is affected by the system. An actor interacts with it directly.", "Student, cron, hh.ru API.", "requirements"],
  ["ADR", "Architecture Decision Record — a short record of a decision: context, options, choice, consequences.", "docs/decisions/ADR-001…006.", "decisions"],
  ["Logging", "Recording program events with levels DEBUG, INFO, WARNING, ERROR.", "logs/etl.log.", "etl"],
  ["dataclass", "A Python class for holding data with named fields. frozen=True — immutable.", "VacancyRecord in src/transform/records.py.", "etl"],
  ["GREATEST", "Returns the largest of its arguments.", "last_seen_at = GREATEST(old, new): rerunning for a past date won't \"age\" a vacancy.", "etl"],
  ["= ANY(array)", "\"Value is in the array\". In psycopg a Python list is passed as one parameter.", "WHERE hh_id = ANY(%s) in known_vacancies().", "etl"],
  ["ON DELETE CASCADE", "Deleting a parent row deletes dependent rows too.", "Deleting a vacancy deletes its skills and versions.", "model"],
  ["IMMUTABLE", "A SQL function marker: the result depends only on the arguments. Such a function can be used in indexes.", "salary_rub_net() in sql/001_schema.sql.", "model"],
  ["AT TIME ZONE", "Converts a point in time to local time in the given zone.", "date_trunc('month', created_at AT TIME ZONE 'Europe/Moscow').", "pitfalls"],
  ["WINDOW (named window)", "A name for a window definition so PARTITION BY … ORDER BY isn't repeated in every function.", "WINDOW w AS (PARTITION BY vacancy_id ORDER BY valid_from) in q3.", "sql"],
  ["Window frame (ROWS BETWEEN)", "Which rows of the window take part in the calculation for the current row.", "SUM(…) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) — task 3.", "selfcheck"],
  ["JSONB", "A PostgreSQL type for binary JSON, with indexes and operators.", "load_run.params.", "model"],
  ["HTTP 403 / 404", "403 — forbidden (retrying is pointless), 404 — not found.", "403 from the API without a token; 404 — the vacancy was deleted between search and card.", "etl"],
  ["Exit code", "A number a program reports to the system on exit: 0 — success, otherwise — failure.", "python -m src.main load returns 1 on failure — cron sees it.", "etl"],
  ["Query planner", "The part of PostgreSQL that picks an execution plan from table statistics. Can misestimate row counts.", "q5: estimated 100,000 rows instead of 8,739 because of the params CTE.", "pitfalls"],
  ["first_seen_at / last_seen_at", "When WE first and last saw the vacancy. first_seen_at is never overwritten.", "Question 5; a sign that a vacancy closed.", "model"],
];

CONTENT.adrs = [
  { id: "ADR-001", title: "Primary key type", question: "Can we guarantee the source id never changes and is always present?",
    options: "Natural (hh_id as PK); surrogate BIGINT + UNIQUE hh_id; UUID.",
    decision: "Surrogate BIGINT IDENTITY + UNIQUE hh_id TEXT.",
    why: "Anonymous employers have no hh_id. A second source (SuperJob) may produce the same id. BIGINT is more compact than text in FKs. UUID is for ids generated by independent systems — we have one database.",
    cost: "An extra unique index on hh_id; the load needs RETURNING id.",
    alt: "<b>If hh_id were the primary key:</b> there'd be nowhere to store an anonymous employer (a PK can't be NULL) — we'd have to invent ids like 'anon-123'. With SuperJob added, vacancy '104857600' from two sources would become one row. <b>If UUID:</b> it would work, but ids would be unreadable ('3f2a…'), indexes twice as large, and random UUID order slows B-tree inserts." },
  { id: "ADR-002", title: "Storing salary and currency", question: "If the exchange rate changes in a year, which rate applies to old vacancies?",
    options: "Convert to rubles on load; store as received and convert during analysis; store both.",
    decision: "Store as received; the conversion rule lives in one function, salary_rub_net().",
    why: "Converting on load loses source data. A rule in one place is easy to change. Two sources of truth eventually diverge.",
    cost: "The current rate for all periods distorts dynamics on currency jumps (affects ~10% of vacancies with a salary: KZT, USD, EUR). 13% income tax is a simplification.",
    alt: "<b>If converted on load:</b> from \"160,000 ₽\" you can't tell it was 2,000 USD. If we decide gross → net works differently, old data can't be fixed — only reloaded from the API, which no longer has old vacancies. <b>If both stored:</b> after a rate change half the rows are recalculated and half aren't — and nobody knows which." },
  { id: "ADR-003", title: "Storing history", question: "Do we need history of every field? Do we need \"as of date X\"?",
    options: "SCD1 (overwrite); snapshot on every run; SCD2 (versions with a period); event log.",
    decision: "vacancy (SCD1, current) + vacancy_snapshot (SCD2, history). Changes are detected by content_hash.",
    why: "SCD2 stores exactly as many versions as there were changes. \"As of date X\" is one WHERE. The current-state table spares 4 of 6 reports from searching for the latest version.",
    cost: "Data duplicated between vacancy and the current version; skills are not in history; two changes between runs look like one.",
    alt: "<b>If SCD1 only:</b> question 3 (\"how often are they updated\") can't be answered, and the monthly median \"moves\" when a salary changes. <b>If a snapshot on every run:</b> 244 runs × ~180 open vacancies ≈ 44k rows instead of 1,895, almost all repeating the previous snapshot. To find changes you'd still have to compare neighboring snapshots." },
  { id: "ADR-004", title: "Skill normalization", question: "Are \"Postgres\" and \"PostgreSQL\" one skill for the report?",
    options: "Comma-separated string; TEXT[] / JSONB array; skill dictionary + vacancy_skill link.",
    decision: "Dictionary + link; normalization: whitespace, case, synonym dictionary.",
    why: "Top skills is JOIN + GROUP BY, duplicates are forbidden by the PK. Spelling changes happen in one place.",
    cost: "The synonym dictionary is maintained by hand; writing a vacancy takes several queries.",
    alt: "<b>If a string:</b> top skills requires parsing in every query, \"SQL\" and \"sql\" count twice, searching \"%SQL%\" finds PostgreSQL. <b>If TEXT[]:</b> workable in PostgreSQL (unnest, GIN index), but not portable to other DBMSs, and a skill can't have properties (category)." },
  { id: "ADR-005", title: "Idempotent load", question: "What should happen on a double run? And on a crash at vacancy 500 of 1000?",
    options: "TRUNCATE + reload; SELECT then INSERT/UPDATE in Python; INSERT … ON CONFLICT; MERGE.",
    decision: "ON CONFLICT DO UPDATE by hh_id; one vacancy = one transaction; first_seen_at is never overwritten; last_seen_at = GREATEST(old, new).",
    why: "Check and write are atomic. Rerunning after a failure is safe.",
    cost: "A transaction per vacancy is slower than one big one (seconds for thousands of vacancies); vacancies deleted at the source are not deleted.",
    alt: "<b>If TRUNCATE + reload:</b> first_seen_at = today for everything, question 5 breaks; history (question 3) is wiped. <b>If SELECT → INSERT:</b> a parallel run can insert the same vacancy in between — the second INSERT fails on UNIQUE. <b>If one transaction per run:</b> a crash at vacancy 999 rolls back all 998." },
  { id: "ADR-006", title: "Raw SQL instead of an ORM", question: "What matters more: development speed or the ability to write SQL?",
    options: "ORM (SQLAlchemy ORM); query builder (Core); raw SQL via psycopg.",
    decision: "Raw SQL with %s parameters.",
    why: "The goal is to learn SQL. Analytical queries read worse through an ORM. .sql files run without Python.",
    cost: "No automatic migrations; injection protection is on us.",
    alt: "<b>If an ORM:</b> Vacancy and Skill models in an hour, migrations via Alembic. But q6 (gaps-and-islands) would become a chain of func.row_number().over(…) — harder than the SQL itself, and you'd never see the SQL being run. ORMs are great for CRUD apps; this is analytics." },
];

CONTENT.chartTexts = {
  skills: { q: "Which skills to learn first? (question 1)", type: "Horizontal bars: comparing lengths across 15 categories; long names read without tilting your head.", see: "SQL is required in 70% of analyst vacancies — 1.7× more often than Python.", cant: "The difference between systems analysts and data analysts: REST API and BPMN are needed only by the former, Pandas only by the latter. Switch the role below." },
  salary: { q: "How much do they pay, and is it growing? (question 2)", type: "Lines: time on the X axis, three roles in one unit (₽) on one axis. Y axis starts at zero.", see: "Systems analysts and data analysts ≈ 160–250k, junior backend ≈ 75–90k.", cant: "A trend. The generator builds in +1.2%/month growth, but the noise of samples of 9–46 vacancies is larger. Nor the spread within a month." },
  nosalary: { q: "Where is salary hidden more often? (question 4)", type: "Bars with 95% intervals instead of a pie chart: we compare 8 separate shares, not parts of one whole.", see: "Moscow (24%) and Tomsk (49%) differ robustly — the intervals don't overlap.", cant: "The cause: the city itself or the employer mix (Simpson's paradox)." },
  heatmap: { q: "Does demand for skills differ by city?", type: "Heatmap: two categories × one value. A single blue scale: darker = more.", see: "SQL is the most common skill in every city (58–76%).", cant: "Whether 5–8 pp differences are real: in small cities one vacancy = 2–3 pp." },
  islands: { q: "Who hires steadily? (question 6)", type: "Timeline (Gantt): each bar is a continuous streak of months for a company.", see: "4 companies hired in all 8 months in a row.", cant: "Hiring volume: a bar looks the same with 1 or 20 vacancies a month." },
};

CONTENT.pitfalls = [
  { title: "Server time zone", met: true, problem: "On the dev machine the PostgreSQL server runs in Asia/Tomsk (+7). first_seen_at::date for Oct 30 23:59 Moscow time returned Oct 31. A test failed and the API returned \"tomorrow's\" date.", detect: "A test on a specific date failed on one machine and would pass on another. Command SHOW timezone.", check: "Compare ::date and (… AT TIME ZONE 'Europe/Moscow')::date on the boundary time 23:59.", fix: "AT TIME ZONE 'Europe/Moscow' in every date query; astimezone(MSK) in Python." },
  { title: "Rate limit (429)", met: false, problem: "Frequent requests → the API answers 429, and blocks on abuse.", detect: "WARNING in logs \"HTTP 429, attempt 2/5\".", check: "Test test_retries_on_429_and_5xx_with_exponential_backoff with a fake session.", fix: "0.5 s pause between requests, exponential backoff, Retry-After; the detailed card is downloaded only for new or bumped vacancies." },
  { title: "Anonymous request → 403", met: true, problem: "The hh.ru API answered 403 forbidden to a request without a token.", detect: "The very first request while checking the environment.", check: "curl with a User-Agent → 403.", fix: "403 is not retried (pointless); we work on fixtures of the same format; the token goes in HH_ACCESS_TOKEN in .env." },
  { title: "Vacancies change after publication", met: false, problem: "They get bumped in search and salaries get edited. The current state \"forgets\" the past.", detect: "The same hh_id has a different published_at on different days.", check: "Test test_history_scd2: a change → 2 versions, the old one closed.", fix: "SCD2 in vacancy_snapshot by content_hash." },
  { title: "Edits without republishing are invisible", met: false, problem: "We search by publication date (date_from). If the salary is changed without a \"bump\", the vacancy won't appear in that day's results.", detect: "Spot check: request detailed cards of old vacancies and compare hashes.", check: "A weekly load --days 30 run and counting vacancies_changed.", fix: "An accepted (documented) assumption. Compromise: a wide scan once a week." },
  { title: "Duplicates within one run", met: false, problem: "\"Systems Analyst / Data Analyst\" is found by two search queries.", detect: "processed in load_run is larger than the number of unique hh_id.", check: "The seen set in pipeline.run_load.", fix: "Each hh_id is processed once per run; UNIQUE(hh_id) is the second line of defense." },
  { title: "Duplicates \"by meaning\"", met: true, problem: "An employer closed a vacancy and reposted it with a new id.", detect: "Same employer + city + lower(name) a few days apart.", check: "The possible_duplicate_of column in q5. Without the 14-day limit it flagged almost everything.", fix: "Flag, don't delete: the decision is up to a human." },
  { title: "Salaries in different currencies and gross/net", met: false, problem: "100,000 KZT ≠ 100,000 ₽; 200,000 gross ≈ 174,000 net.", detect: "GROUP BY currency_code, salary_gross on a sample.", check: "salary_rub_net(100000, 150000, 1, true) = 108,750.", fix: "Store the source values, convert in one function (ADR-002)." },
  { title: "RUR instead of RUB", met: false, problem: "hh.ru calls the ruble RUR (old code), ISO 4217 says RUB. A filter WHERE currency = 'RUB' silently returns 0 rows.", detect: "SELECT DISTINCT currency_code.", check: "The currency dictionary is loaded from the API, not typed by hand.", fix: "No hard-coded currency codes; JOIN with currency." },
  { title: "salary vs salary_range", met: false, problem: "hh.ru marked the salary field deprecated; the new one is salary_range. Values may differ.", detect: "Reading API docs and comparing the fields on a sample.", check: "test_salary_range_has_priority_over_deprecated_salary.", fix: "Use salary_range, fall back to salary." },
  { title: "NULL in aggregates", met: false, problem: "AVG skips NULL, COALESCE(x, 0) understates the mean, x <> NULL yields NULL.", detect: "Compare count(*) and count(x); compute avg two ways.", check: "The \"NULL in aggregates\" lesson in section 6.", fix: "An explicit rule: salary NULL = \"not specified\"; IS DISTINCT FROM for comparing versions." },
  { title: "SQL injection", met: false, problem: "A vacancy name \"Analyst'); DROP TABLE vacancy; --\" in an f-string would run as code.", detect: "Search the code for f-strings and .format() near execute.", check: "test_sql_injection_in_name_is_stored_as_text.", fix: "Parameters %s only: the driver passes the value separately from the query text." },
  { title: "psycopg 3 transaction trap", met: true, problem: "With autocommit=False any SELECT opens a transaction, and a nested conn.transaction() becomes a SAVEPOINT — nothing is committed until conn.commit().", detect: "Data \"disappears\" after the script ends; pg_stat_activity shows idle in transaction.", check: "The load test sees the data from a separate connection.", fix: "autocommit=True + explicit conn.transaction() blocks." },
  { title: "2000-result search limit", met: false, problem: "The API returns nothing past result #2000. A wide one-month search is silently truncated.", detect: "found > 2000 on the first page.", check: "test_pagination_stops_at_api_limit_of_2000 (+ a WARNING in the log).", fix: "Search one day at a time; warn if even that isn't enough." },
  { title: "Slow query", met: true, problem: "On 300k vacancies q6 took 4 s, q5 — 1.3 s.", detect: "EXPLAIN ANALYZE: a node with large loops × time per pass.", check: "Before/after plans in docs/query_plans/.", fix: "q6 rewritten (window function instead of a subquery), q5 — two indexes (sql/002_indexes.sql)." },
  { title: "Conclusions from small samples", met: true, problem: "The +1.2%/month salary growth built into the data isn't visible on the chart: noise exceeds the signal.", detect: "Show n next to the median.", check: "Confidence intervals; the \"median only when n ≥ 5\" rule.", fix: "n and intervals on charts; \"the difference is robust\" only when intervals don't overlap." },
];

CONTENT.interview = [
  ["Project", "Tell us about the project in 2 minutes.", "The service collects vacancies for analysts and junior backend developers from the hh.ru API, stores them in PostgreSQL with change history and answers 6 business questions with SQL: skills, median salary by month, active employers, share without salary, new vacancies, steady employers. I started with requirements (user stories, use cases, open questions), designed the schema (8 tables, SCD2), wrote an idempotent ETL with retries and a run log, and optimized two slow queries using EXPLAIN ANALYZE. Without a token the API returned 403, so it runs on reproducible fixtures in the same format.", false],
  ["Project", "What role does a systems analyst play in this project?", "Turning \"I want to understand the market\" into verifiable requirements: 6 questions with an answer format, Given/When/Then acceptance criteria, use cases with alternative flows, a list of open questions with decisions. Then the data model and the contract with the source (which fields, what NULL means, which time zone).", false],
  ["Requirements", "How is a user story different from a use case?", "A user story is a short \"who, what, why\" + acceptance criteria; a unit of planning. A use case is a detailed scenario: actors, preconditions, main flow, alternative flows (what if). The story says \"what is needed\", the use case says \"how it happens, including failures\".", false],
  ["Requirements", "How do you check that a requirement is good?", "It's verifiable (you can write a test or a Given/When/Then criterion), unambiguous (no \"fast\", \"convenient\"), describes behavior rather than implementation, and has a value (\"so that…\").", false],
  ["Requirements", "What would you ask the client first?", "What counts as one vacancy; what to do with vacancies without a salary; how to compare currencies and gross/net; whether change history is needed; what to do with closed vacancies; which time zone reports use; how fresh the data must be. All of them are in open_questions.md with decisions.", false],
  ["Data", "How do you decide that a vacancy is the same one?", "The main key is the hh.ru external id (hh_id), with UNIQUE and ON CONFLICT on it. I don't automatically merge matches by title + employer + city: a company may genuinely open two identical vacancies. Such cases are flagged as possible duplicates (q5, 14-day window); a human decides. Cost: a reposted vacancy with a new id counts as new.", true],
  ["Data", "Why not NoSQL? The API returns JSON after all.", "The questions are analytical: joining skills with vacancies, grouping, window functions, medians. That's where a relational database shines. We need integrity constraints (from ≤ to, foreign keys) — in a document store they'd have to be checked in code. Raw JSON could live in a PostgreSQL JSONB column, but analysis is still easier on normalized columns. NoSQL would fit a huge stream of heterogeneous documents without relations.", true],
  ["Data", "Why are skills in a separate table?", "Normalization: a skill is stored once, links live in vacancy_skill with a composite PK. Top skills is JOIN + GROUP BY, a \"SQL, sql\" duplicate is impossible, lookup by skill uses an index. As a comma-separated string you'd parse it in every query, and \"%SQL%\" would match PostgreSQL too.", false],
  ["Data", "What is SCD and which type did you choose?", "Slowly Changing Dimension — a way to keep history of slowly changing data. Type 1 overwrites, type 2 keeps versions with a validity period. I use both: vacancy is type 1 (current), vacancy_snapshot is type 2 (valid_from, valid_to, one current version guaranteed by a partial unique index).", false],
  ["Data", "Why a surrogate key and not hh_id?", "Anonymous employers have no id; with a second source ids may collide; BIGINT is more compact in FKs. hh_id stays UNIQUE — the upsert works on it. ADR-001.", false],
  ["Data", "How do you store salaries in different currencies?", "As received: from, to, currency, gross. Conversion is one function salary_rub_net(): middle of the range, divide by the rate, ×0.87 for gross. Source data isn't lost, and the rule changes in one place. Cost: the current rate for all periods.", false],
  ["Data", "What do you do with vacancies without a salary?", "Store NULL. They don't take part in the median but do take part in skills and in the \"share without salary\" question. Substituting the mean or zero would distort the median.", false],
  ["ETL", "What is idempotency and why does ETL need it?", "Running again gives the same result. Loads are rerun after failures, run windows overlap. Without idempotency every rerun would create duplicates. Here it's INSERT … ON CONFLICT by hh_id + a new history version only when content_hash changes. Verified by a test: two runs — same row counts.", false],
  ["ETL", "What happens if the load crashes halfway?", "Each vacancy is written in its own transaction: finished ones are saved entirely, the current one is rolled back entirely (no \"half a vacancy\": a row without skills). The load_run row gets status failed and the error text, the process exits with code 1. A rerun loads the rest without duplicates. Covered by test_failed_run_is_logged_and_rerun_completes.", true],
  ["ETL", "How do you handle API errors?", "429 and 5xx, connection drops, timeouts — up to 5 retries with 1, 2, 4, 8 s pauses + jitter, honoring Retry-After. 400, 403 are not retried: the answer won't change. A 404 on a card means the vacancy was deleted between search and request — skipped with a WARNING.", false],
  ["ETL", "Why jitter?", "If a thousand clients get 429 at once and all wait exactly 1 s, they come back at once and get 429 again. A random extra spreads the retries over time.", false],
  ["ETL", "How do you avoid downloading too much?", "Search one day at a time, only the needed roles, titles only. The detailed card is requested only if the vacancy is new or its published_at changed. Otherwise only last_seen_at is updated. A test checks that a second run requests no cards at all.", false],
  ["ETL", "How do you test ETL?", "Layer by layer. Transform — pure functions, tests on JSON fixtures: salary, skills, roles, hash, broken data. Extract — a fake HTTP session: retries, Retry-After, 403 without retry, pagination, the 2000 limit. Load — on a separate test database: idempotency, a crash halfway, SCD2, protection from rollback, SQL injection, CHECK. Plus an end-to-end backfill over fixtures.", true],
  ["ETL", "Why one transaction per vacancy rather than one per run?", "With one transaction a crash at vacancy 999 of 1000 would roll back everything. The cost of separate transactions is ~1–2 ms overhead per vacancy — seconds for thousands per day.", false],
  ["ETL", "How do you tell an insert from an update in an upsert?", "RETURNING (xmax = 0) AS inserted: a freshly inserted row has the system column xmax equal to 0. A PostgreSQL feature; other DBMSs need a separate SELECT.", false],
  ["ETL", "What if you rerun the load for a past date?", "The current state won't \"roll back\": DO UPDATE has WHERE vacancy.published_at <= EXCLUDED.published_at, and last_seen_at = GREATEST(old, new). History isn't touched either: a version older than the current one isn't written. There's a test.", true],
  ["SQL", "What is a window function and how is it different from GROUP BY?", "It computes a value over a group of rows without collapsing them: the result is added to every row. GROUP BY turns a group into one row. ROW_NUMBER, LAG, RANK, count(*) OVER are window functions.", false],
  ["SQL", "How do you find companies hiring 3 months in a row?", "Gaps and islands: DISTINCT months per company → month number (year × 12 + month) → ROW_NUMBER in order → the difference is constant within a continuous streak → GROUP BY the difference → HAVING count ≥ 3.", false],
  ["SQL", "Why the median and not the mean?", "One 900,000 salary shifts the mean but barely moves the median. Salary distributions are right-skewed, so the median describes a \"typical\" vacancy more honestly.", false],
  ["SQL", "How is WHERE different from HAVING?", "WHERE filters rows before grouping, HAVING filters groups after it, so only HAVING can have conditions on aggregates (count(*) ≥ 5).", false],
  ["SQL", "Why does a LEFT JOIN condition on the right table go into ON?", "In WHERE, a condition on the right table drops rows where the right side is NULL (no match), turning the LEFT JOIN into an INNER JOIN. In q5 the valid_from < window_start condition is in ON, and WHERE prior.id IS NULL keeps vacancies without earlier versions.", true],
  ["SQL", "What is a slow query and how did you find one?", "Slow is whatever doesn't meet expectations for its task. On the working DB everything is fast, so I built a 300k-vacancy database and measured every query with EXPLAIN ANALYZE. q6 took 4 s: the plan had a SubPlan with loops=5009, each pass reading a 40k-row CTE. An index wouldn't help (CTEs have no indexes) — I rewrote it with a window function: 0.14 s. q5 took 1.3 s because of a full read of vacancy and the duplicate lookup; two indexes brought it to 0.11 s.", true],
  ["SQL", "Does an index always help?", "No. On small tables a full scan is cheaper. An index slows inserts and updates. An index on name doesn't work for lower(name) = … — you need an expression index. Column order in a composite index matters. And not every problem is solved by an index: q6 needed a rewrite.", true],
  ["SQL", "How do you protect against SQL injection?", "Parameterized queries: values are passed to the driver separately (%s), not pasted into the SQL text. All my queries are like that; a test stores the name \"'); DROP TABLE vacancy; --\" as plain text.", false],
  ["SQL", "What does NULL <> 5 return?", "NULL, not TRUE. That's why I compare versions with IS DISTINCT FROM: NULL IS DISTINCT FROM 5 → TRUE.", true],
  ["Analytics", "Does the share of vacancies without a salary differ by city?", "Moscow 24% (interval 20–28%) and Tomsk 49% (41–57%) — the difference is robust, the intervals don't overlap. Kazan and Nizhny Novgorod with 41–51 vacancies are indistinguishable from the average. But this doesn't explain the cause: it may be the employer mix rather than the city.", false],
  ["Analytics", "Are analyst salaries growing?", "You can't tell from this data. The generator builds in +1.2%/month growth, but a month has 9–46 vacancies with a salary, and ±10% noise hides the trend. You'd need more data or a regression controlling for city and seniority.", true],
  ["Analytics", "How would you check that the report computes correctly?", "Check on a small example with a known answer (section 6). Check totals: sum across cities = \"All cities\". Compare with an independent calculation in pandas. Test edge cases: NULL, a \"from only\" range, currencies.", false],
  ["Project", "What would you do next?", "Connect the real API with a token and compare distributions with the fixtures; dated exchange rates; a materialized view for q2; a cron schedule; an alert if load_run.status = failed or there was no run for more than a day; role classification via the API's professional_roles instead of rules.", false],
  ["Project", "Why fixtures and not real data? Isn't that cheating?", "No, as long as it's stated openly. Without a token the API answers 403. The fixtures have the same format, the generator is deterministic (seed=42), so results are reproducible and tests don't depend on the network. The real client is written and tested on a fake session; switching is DATA_SOURCE=api. I phrase all market findings as findings about synthetic data.", true],
];

CONTENT.quiz = [
  ["Terms", "What is load idempotency?", ["The load runs fast", "Running again gives the same result as the first time", "The load runs in one transaction", "The load doesn't use the network"], 1,
    ["Speed has nothing to do with idempotency.", "Correct: two runs in a row — same row counts.", "One transaction doesn't prevent duplicates on a repeated run.", "That's about the source, not repeatability."]],
  ["Terms", "How is LEFT JOIN different from INNER JOIN?", ["LEFT JOIN is faster", "LEFT JOIN keeps all rows of the left table, even without a match", "LEFT JOIN sorts the result", "No difference"], 1,
    ["Speed depends on the plan, not the JOIN type.", "Correct: with no match the right table's fields are NULL.", "Sorting is ORDER BY.", "There is one — anonymous vacancies in q5 would vanish with INNER JOIN."]],
  ["Terms", "SCD type 2 is…", ["Overwriting a row with new values", "Keeping versions with a validity period", "Deleting old records", "A table backup"], 1,
    ["That's type 1.", "Correct: valid_from, valid_to, one current version.", "History would be lost.", "That's not a data model."]],
  ["Terms", "Why jitter in retries?", ["So clients' retries don't coincide in time", "To encrypt the request", "To shrink the response", "To bypass the API limit"], 0,
    ["Correct: a random extra spreads the retries.", "Unrelated to encryption.", "The response size doesn't change.", "We don't bypass the limit — we respect it."]],
  ["Terms", "What does NULL = NULL return in SQL?", ["TRUE", "FALSE", "NULL", "An error"], 2,
    ["NULL means \"unknown\"; two unknowns aren't necessarily equal.", "No: the result is unknown.", "Correct. That's why NULL is compared with IS NULL / IS DISTINCT FROM.", "No error, the expression is valid."]],
  ["Terms", "How is RANK different from ROW_NUMBER?", ["No difference", "RANK gives equal places for equal values", "RANK works without ORDER BY", "ROW_NUMBER counts from zero"], 1,
    ["They differ on ties.", "Correct: 1, 2, 2, 4 for RANK vs 1, 2, 3, 4 for ROW_NUMBER.", "Without ORDER BY RANK is meaningless.", "Both start at 1."]],
  ["Reasoning", "A vacancy was loaded a month ago and bumped in search today. Should it be in \"new in 7 days\"?", ["Yes, published_at is fresh", "No: its hh_id has been seen before", "Yes, if the salary changed", "Depends on the city"], 1,
    ["published_at changes on every bump — a poor sign of novelty.", "Correct: deduplication by external id, first_seen_at is a month old.", "A change is a new version, not a new vacancy.", "The city has nothing to do with novelty."]],
  ["Reasoning", "Why isn't first_seen_at updated in ON CONFLICT DO UPDATE?", ["Forgotten", "Otherwise every vacancy would become \"new\" after each run", "PostgreSQL forbids updating dates", "For speed"], 1,
    ["It's a deliberate decision (ADR-005).", "Correct: question 5 depends on first_seen_at never changing.", "There's no such restriction.", "Doesn't affect speed."]],
  ["Reasoning", "The median salary for a month is computed from 3 vacancies. What do you do?", ["Show it as is", "Don't show the median, but show n", "Replace it with the mean", "Add vacancies from the next month"], 1,
    ["A median of 3 numbers doesn't describe the market.", "Correct: the n ≥ 5 rule in q2, with n visible.", "A mean of 3 values is even less stable.", "That mixes periods and distorts the dynamics."]],
  ["Reasoning", "The load crashed at vacancy 500 of 1000. What's in the database?", ["Nothing: everything rolled back", "499 complete vacancies, the 500th rolled back, load_run = failed", "500 vacancies, the last without skills", "1000 vacancies"], 1,
    ["That would happen with one transaction per run.", "Correct: one vacancy = one transaction.", "That's exactly what a per-vacancy transaction prevents.", "The rest haven't been loaded yet."]],
  ["Reasoning", "39% of Kazan vacancies have no salary (n=41), the all-city average is 33%. Conclusion?", ["Kazan hides salaries more often", "No proven difference: the 26–54% interval includes 33%", "Kazan hides salaries less often", "Drop Kazan from the report"], 1,
    ["With n=41 one vacancy = 2.4 pp — the difference is within noise.", "Correct: the Wilson interval covers the average.", "The data doesn't show that.", "No need to drop it — just show the uncertainty honestly."]],
  ["Reasoning", "Why does q2 use the salary of the first version of a vacancy?", ["It's faster", "So a month's point doesn't \"move\" with later changes", "The first version always has a salary", "There's no current version"], 1,
    ["Speed isn't the reason.", "Correct: what matters is what was offered at publication.", "Wrong: the first version may lack a salary (added later).", "A current version always exists."]],
  ["Reasoning", "A query is slow. First step?", ["Add indexes on every column", "Look at EXPLAIN ANALYZE and find the node where time went", "Increase work_mem", "Rewrite it in Python"], 1,
    ["Extra indexes slow writes and may not help (q6).", "Correct: diagnosis first, then treatment.", "We checked: it didn't help q2.", "Python is usually slower than the database for this."]],
  ["Reasoning", "Why does the hh.ru search run one day at a time?", ["The ToS requires it", "The API returns at most 2000 results per query", "To get fewer 429s", "To make date math easier"], 1,
    ["The ToS requires a User-Agent and pauses, not daily windows.", "Correct: one role has far fewer than 2000 vacancies per day.", "The number of requests grows, not shrinks.", "Convenience isn't the reason."]],
  ["Task", "Which query returns the share of vacancies without a salary?", ["SELECT avg(salary_from IS NULL) FROM vacancy", "SELECT avg((salary_from IS NULL AND salary_to IS NULL)::int) FROM vacancy", "SELECT count(salary_from) / count(*) FROM vacancy", "SELECT sum(salary_from IS NULL) FROM vacancy"], 1,
    ["A \"up to 100,000\" vacancy (from = NULL) would count as no salary; also avg of boolean doesn't exist in PostgreSQL.", "Correct: both bounds NULL, boolean → int, the mean is the share.", "That's the share WITH a \"from\" salary, and integer division yields 0.", "sum of boolean doesn't exist, and it's a count, not a share."]],
  ["Task", "You need a vacancy's version number over time. What do you write?", ["ROW_NUMBER() OVER (ORDER BY valid_from)", "ROW_NUMBER() OVER (PARTITION BY vacancy_id ORDER BY valid_from)", "count(*) GROUP BY vacancy_id", "RANK() OVER (PARTITION BY valid_from)"], 1,
    ["Without PARTITION BY numbering runs across all vacancies.", "Correct: numbering restarts for each vacancy.", "GROUP BY collapses versions into one row.", "A window by date is the wrong split."]],
  ["Task", "Find vacancies without a single skill. Which option is right?", ["SELECT v.* FROM vacancy v JOIN vacancy_skill vs ON vs.vacancy_id = v.id WHERE vs.skill_id IS NULL", "SELECT v.* FROM vacancy v LEFT JOIN vacancy_skill vs ON vs.vacancy_id = v.id WHERE vs.vacancy_id IS NULL", "SELECT * FROM vacancy WHERE id NOT IN (SELECT skill_id FROM vacancy_skill)", "SELECT * FROM vacancy_skill WHERE skill_id = 0"], 1,
    ["INNER JOIN already dropped vacancies without a match — the result is empty.", "Correct: an anti-join via LEFT JOIN.", "Compares a vacancy id with a skill id — different entities.", "There's no skill with id 0; vacancies without skills have no rows in vacancy_skill at all."]],
  ["Task", "How do you count systems analyst and data analyst vacancies in one query as two columns?", ["Two queries and UNION", "count(*) FILTER (WHERE role = 'system_analyst'), count(*) FILTER (WHERE role = 'data_analyst')", "GROUP BY role", "count(role = 'system_analyst')"], 1,
    ["You get rows, not columns, and two passes.", "Correct: FILTER is a condition for a specific aggregate.", "Gives rows per role, not columns.", "count counts non-NULL values — FALSE counts too."]],
];

CONTENT.tasks = [
  { level: "Intermediate", task: "For each city, output the number of systems analyst vacancies and the median of their current net salary in ₽. Hide cities with fewer than 10 vacancies with a salary.",
    hint: "v_vacancy_salary already holds the net salary in ₽. JOIN with area, filter by role, GROUP BY, HAVING.",
    solution: `SELECT a.name AS city,
       count(*) AS vacancies_with_salary,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY s.salary_rub_net)::int AS median
FROM vacancy v
JOIN v_vacancy_salary s ON s.vacancy_id = v.id
JOIN area a ON a.id = v.area_id
WHERE v.role = 'system_analyst'
GROUP BY a.id, a.name
HAVING count(*) >= 10
ORDER BY median DESC;`,
    check: ["The JOIN with v_vacancy_salary is inner: vacancies without a salary don't enter the median", "HAVING, not WHERE, for a condition on count", "GROUP BY the city id, not just the name"] },
  { level: "Intermediate", task: "For each vacancy, output by how many percent the upper salary bound changed between the first and the last version. Only vacancies where it changed.",
    hint: "Two window functions: FIRST_VALUE and LAST_VALUE (careful with the frame!) or ROW_NUMBER ascending and descending.",
    solution: `WITH ranked AS (
    SELECT vacancy_id, salary_to,
           ROW_NUMBER() OVER (PARTITION BY vacancy_id ORDER BY valid_from)      AS rn_first,
           ROW_NUMBER() OVER (PARTITION BY vacancy_id ORDER BY valid_from DESC) AS rn_last
    FROM vacancy_snapshot
)
SELECT f.vacancy_id, f.salary_to AS first_to, l.salary_to AS last_to,
       round(100.0 * (l.salary_to - f.salary_to) / f.salary_to, 1) AS change_pct
FROM ranked f
JOIN ranked l ON l.vacancy_id = f.vacancy_id AND l.rn_last = 1
WHERE f.rn_first = 1
  AND f.salary_to IS NOT NULL AND l.salary_to IS NOT NULL
  AND f.salary_to <> l.salary_to
ORDER BY change_pct DESC;`,
    check: ["LAST_VALUE without ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING returns the current row — a common frame mistake", "NULL check before dividing", "100.0, not 100 — otherwise integer division"] },
  { level: "Advanced", task: "Rolling sum: for each month output the number of new vacancies and the total over the last 3 months including the current one.",
    hint: "First aggregate by month, then SUM(…) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW).",
    solution: `WITH monthly AS (
    SELECT date_trunc('month', created_at AT TIME ZONE 'Europe/Moscow')::date AS month,
           count(*) AS new_vacancies
    FROM vacancy
    GROUP BY 1
)
SELECT month, new_vacancies,
       sum(new_vacancies) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) AS last_3_months
FROM monthly
ORDER BY month;`,
    check: ["The frame ROWS BETWEEN 2 PRECEDING AND CURRENT ROW is exactly 3 rows", "If a month has no vacancies there's no row, and \"3 rows\" ≠ \"3 months\" — for accuracy use generate_series over months + LEFT JOIN", "AT TIME ZONE — months in Moscow time"] },
  { level: "Advanced", task: "Find employers whose share of vacancies without a salary is higher than their city's average.",
    hint: "First the share per employer × city pair, then per city; compare. Or a window avg(…) OVER (PARTITION BY area_id).",
    solution: `WITH flags AS (
    SELECT v.employer_id, v.area_id,
           (v.salary_from IS NULL AND v.salary_to IS NULL)::int AS no_salary
    FROM vacancy v
    WHERE v.employer_id IS NOT NULL
),
per_employer AS (
    SELECT employer_id, area_id, count(*) AS n, avg(no_salary) AS share
    FROM flags GROUP BY employer_id, area_id
    HAVING count(*) >= 10
),
per_city AS (
    SELECT area_id, avg(no_salary) AS city_share FROM flags GROUP BY area_id
)
SELECT e.name, a.name AS city, pe.n,
       round(100 * pe.share, 1) AS employer_pct, round(100 * pc.city_share, 1) AS city_pct
FROM per_employer pe
JOIN per_city pc USING (area_id)
JOIN employer e ON e.id = pe.employer_id
JOIN area a ON a.id = pe.area_id
WHERE pe.share > pc.city_share
ORDER BY pe.share - pc.city_share DESC;`,
    check: ["Anonymous employers are excluded — they can't be treated as one company", "HAVING n ≥ 10 — otherwise an employer with one vacancy shows \"100% without salary\"", "This is a step towards checking the Simpson's paradox from section 9"] },
];
})(window.CONTENTS.en = window.CONTENTS.en || {});
