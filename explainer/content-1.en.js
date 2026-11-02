window.CONTENTS = window.CONTENTS || {};
(function (CONTENT) {
// ---------- 1. Project map ----------
CONTENT.mapNodes = [
  { id: "hh", x: 20, y: 40, title: "hh.ru API", sub: "source",
    file: "tests/fixtures/hh_world.json (fixture mode)",
    does: "Returns vacancies as JSON: search pages (short cards) and a detailed card for each vacancy (with skills).",
    question: "Where to get data legally and reliably? The official API, not HTML scraping: the structure is stable and the rules (ToS) are known. Without a token the API returned 403, so the project runs on fixtures in the same format." },
  { id: "extract", x: 270, y: 40, title: "Extract", sub: "src/extract/",
    file: "src/extract/http_client.py, base.py, fixture_client.py",
    does: "Walks search pages, retries on 429 and 5xx with a growing pause, keeps a pause between requests, sends a User-Agent with contact info.",
    question: "How not to lose data on network failures and not get banned? Retries with exponential backoff, timeouts, a pause between requests." },
  { id: "transform", x: 520, y: 40, title: "Transform", sub: "src/transform/",
    file: "src/transform/vacancy.py, skills.py, roles.py",
    does: "Turns nested JSON into a flat record: city, employer, salary, skills (normalized), role from the title, content_hash.",
    question: "How to make data comparable? \"SQL\" and \"sql\" → one skill; salary from > to → swap; anonymous employer → NULL." },
  { id: "load", x: 770, y: 40, title: "Load", sub: "src/load/",
    file: "src/load/repository.py, src/pipeline.py",
    does: "Writes the record to PostgreSQL via INSERT … ON CONFLICT. One vacancy = one transaction. On change — a new version in history.",
    question: "How to rerun the load without duplicates? Upsert by hh_id + content_hash comparison (ADR-005)." },
  { id: "pg", x: 770, y: 220, title: "PostgreSQL", sub: "sql/001, 002",
    file: "sql/001_schema.sql, sql/002_indexes.sql",
    does: "Stores 8 tables: current state, history (SCD2), reference tables, load run log. CHECK constraints keep garbage out.",
    question: "How to store data to answer 6 business questions? A normalized schema + version history." },
  { id: "sqlq", x: 520, y: 220, title: "SQL queries", sub: "sql/queries/",
    file: "sql/queries/q1…q6.sql",
    does: "Answer 6 business questions: CTEs, window functions, GROUPING SETS, gaps-and-islands.",
    question: "How to get an answer that can be verified? A query in a .sql file runs both in psql and from Python." },
  { id: "pandas", x: 270, y: 220, title: "pandas", sub: "src/report.py",
    file: "src/report.py",
    does: "Turns query results into a table, computes confidence intervals, saves CSV and data.js for this site.",
    question: "Where to compute: SQL or Python? Everything possible in SQL (single source of truth). Python for statistics and charts." },
  { id: "charts", x: 20, y: 220, title: "Charts", sub: "reports/*.png",
    file: "reports/01…04.png, section 9 of this site",
    does: "Show the answers: top skills, median salary, share without salary, skills × cities.",
    question: "Which chart type answers the question? Comparison — bars, dynamics — lines, two categories × a value — heatmap." },
];

CONTENT.mapAnimation = [
  { node: "hh", text: "The API returns a card: {\"id\": \"104857600\", \"name\": \"  Системный аналитик \", \"salary_range\": {\"from\": 120000, \"to\": 160000, \"currency\": \"RUR\"}, \"key_skills\": [{\"name\": \"SQL\"}, {\"name\": \"sql \"}]}" },
  { node: "extract", text: "Extract: search page 0 of 1, then GET /vacancies/104857600. First response is 429, wait 1 s, second is 200." },
  { node: "transform", text: "Transform: name trimmed, role → system_analyst, skills \"SQL\" and \"sql \" → one skill \"sql\", content_hash = 3f9a…" },
  { node: "load", text: "Load: INSERT … ON CONFLICT (hh_id). The vacancy didn't exist → insert; vacancy_snapshot gets the first version (valid_to = NULL)." },
  { node: "pg", text: "PostgreSQL: a row in vacancy, 1 row in vacancy_snapshot, 1 row in vacancy_skill. CHECK verified: from ≤ to, currency present." },
  { node: "sqlq", text: "SQL: q1 counted the vacancy under SQL; q2 took its first salary 140,000 (middle of the range) into October's median." },
  { node: "pandas", text: "pandas: result row → DataFrame → CSV and data.js." },
  { node: "charts", text: "Chart: the vacancy is one of 609 in the \"SQL\" bar and one of the points behind October's median." },
];

// ---------- 2. How to think ----------
CONTENT.thinking = [
  { q: "What question would the client ask?",
    reason: "The client says: \"I want to understand the analyst job market\". That's a wish, not a task. A task appears when the wish turns into questions with measurable answers.",
    decision: "Six questions: skills, median salary by month, active employers, share without salary, new vacancies, steady employers. Each has an answer in the form of a table.",
    check: "For each question you can write down what the answer looks like (table columns) before any data exists." },
  { q: "What data is needed?",
    reason: "Work backwards from the answer. Median by month → salary, currency, date. \"How often are they updated\" → history, not just the current state. Skills → detailed cards: search results contain no skills.",
    decision: "Search (list) + detailed card (skills) + currency dictionary. History is our own SCD2; the API doesn't provide it.",
    check: "Every field of the answer maps to an API field or a rule for computing it." },
  { q: "What data is missing?",
    reason: "The API has no change history: it only shows the current version. There's no exact net salary: there's gross/net and a range. Search has no \"vacancy closed\" flag: the vacancy just stops appearing in results.",
    decision: "We accumulate history ourselves on every run. We detect closure through last_seen_at. For salary we agree on a rule (middle of range, ×0.87 for gross).",
    check: "Every \"missing\" item is recorded in open_questions.md together with the decision made." },
  { q: "What assumptions were made?",
    reason: "An assumption is something we treat as true without checking. It must be written down, otherwise it gets forgotten and treated as a fact.",
    decision: "1) A vacancy = hh_id. 2) The current exchange rate is used for all periods. 3) Income tax 13%. 4) An edit without republishing is not visible to a 1-day load. 5) The data is synthetic.",
    check: "Each assumption has a stated cost: e.g. the current rate distorts dynamics when currencies jump (~10% of vacancies with a salary are not in rubles)." },
  { q: "Why this schema?",
    reason: "The schema follows from the questions. Question 3 needs history → a versions table. Question 1 needs skill counts → skills in a separate table. Question 5 needs \"when first seen\" → first_seen_at, which is never overwritten.",
    decision: "8 tables: vacancy (now), vacancy_snapshot (history), reference tables, skill links, load run log.",
    check: "Each of the 6 questions is answered by one SQL query without string processing in Python." },
  { q: "How to make sure the answer is right?",
    reason: "A query can run without errors and return a wrong answer. For example, INNER JOIN with employer silently drops anonymous vacancies.",
    decision: "Check on a small example (section 6), load tests, totals check: sum across cities = the \"All cities\" row.",
    check: "In q4 the sum of vacancies across cities (without the HAVING filter) equals the \"All cities\" row." },
];

CONTENT.mistakes = [
  { title: "Using the mean instead of the median", text: "One vacancy \"Head of Data, 900,000\" pushes the mean salary up by tens of thousands. The median barely moves. Check: compare avg_salary and median_salary in q2." },
  { title: "Forgetting about NULL", text: "AVG(salary) skips NULL — it's the mean over vacancies with a salary only. AVG(COALESCE(salary, 0)) turns \"not specified\" into \"zero rubles\" and understates the result." },
  { title: "Merging duplicates \"by similarity\"", text: "Two \"Systems Analyst\" vacancies at one company may be for two people. Deleting \"similar\" ones without the client's agreement is wrong. We flag, not delete (q5)." },
  { title: "Reloading everything from scratch", text: "TRUNCATE + load looks safe, but it wipes history and first_seen_at. After that, questions 3 and 5 can't be answered." },
  { title: "Storing skills as a string", text: "\"SQL, sql, BPMN\" in one column can't be counted without parsing and can't be protected from duplicates. See \"Data model\"." },
  { title: "Ignoring time zones", text: "On the dev machine the PostgreSQL server runs in Asia/Tomsk. A vacancy at 23:59 Moscow time on Oct 30 turned into Oct 31. This actually broke a test." },
  { title: "Drawing conclusions from small samples", text: "\"BPMN is required 6 pp less often in Kazan than in Tomsk\" with 33 vacancies is noise: one vacancy = 3 pp. You need intervals, or at least n next to the share." },
  { title: "Putting data into SQL with an f-string", text: "f\"... WHERE name = '{name}'\" is an open door for SQL injection. Parameters %s only." },
];

// ---------- 3. Requirements ----------
CONTENT.stories = [
  { id: "US-1", role: "a student analyst", want: "to see the most common skills in analyst vacancies", why: "I know what to learn first",
    ac: ["Given vacancies with skills, When I run q1, Then I see skills in descending order with a share in %", "Given \"SQL\" and \"sql\", When the ranking is built, Then it's one skill"] },
  { id: "US-2", role: "a student analyst", want: "to see the median salary by month per role and city", why: "I know how much to ask for",
    ac: ["Given salaries in USD and gross, When the median is computed, Then all are converted to net ₽ per ADR-002", "Given < 5 vacancies in a cell, Then the median is not shown"] },
  { id: "US-3", role: "a student analyst", want: "to know the most active employers and how often they update postings", why: "I can choose where to apply",
    ac: ["Given a vacancy changed 3 times, Then the employer has 3 changes and the vacancy is counted once"] },
  { id: "US-4", role: "a student analyst", want: "to know the share of vacancies without a salary by region", why: "I know where I'll have to ask about money myself",
    ac: ["Given neither from nor to, Then the vacancy is \"without salary\"; at least one present — \"with salary\""] },
  { id: "US-5", role: "a student analyst", want: "to see vacancies that appeared in the last 7 days", why: "I can apply before others",
    ac: ["Given a vacancy loaded a month ago and updated today, Then it's not in the new list"] },
  { id: "US-6", role: "a student analyst", want: "to see companies hiring 3+ months in a row", why: "I can tell steady hiring from one-off hiring",
    ac: ["Given months 03, 04, 06, 07, Then the longest streak is 2 and the company is not listed"] },
  { id: "US-7", role: "the system (cron)", want: "to rerun the load without side effects", why: "after a failure it can simply run again",
    ac: ["Given a 7-day load is done, When it runs again, Then row counts don't change", "Given a 429 response, Then the client waits longer each time and retries up to 5 times"] },
  { id: "US-8", role: "a student analyst", want: "to see the history of load runs", why: "I know how fresh the data is and what failed",
    ac: ["Given a load failed, Then load_run has status failed, timing, record count and the error text"] },
];

CONTENT.usecases = [
  { id: "UC-1", title: "Initial load", actor: "Student", main: ["init-db creates the schema", "load_run ← running", "search pages for each role and day", "detailed card for each vacancy", "transform → upsert, new version in history", "load_run ← success"],
    alt: ["429/5xx → retry after 1, 2, 4, 8 s; after 5 failures — error", "broken card → WARNING, skip, the load continues", "unhandled error → load_run.failed + text, exit code 1"] },
  { id: "UC-2", title: "Daily update", actor: "Cron", main: ["load --days 1", "steps 2–6 of UC-1", "vacancy not bumped → update last_seen_at only, don't download the card"],
    alt: ["previous run failed → run as usual, no duplicates", "vacancy disappeared from results → don't delete, last_seen_at stops growing"] },
  { id: "UC-3", title: "Building the report", actor: "Student", main: ["report", "run sql/queries/*", "pandas → CSV, PNG, data.js"],
    alt: ["empty database → a clear \"run load\" message, no stack trace"] },
];

CONTENT.reqQuiz = [
  { situation: "Client: \"I want to know how much analysts are paid\".",
    options: [
      { t: "The system must show analyst salaries.", ok: false, why: "Not verifiable: which salaries, in what form, for what period? Unclear when the requirement is met." },
      { t: "The system shows the median net salary in ₽ by publication month for each role; cells with < 5 vacancies are hidden.", ok: true, why: "It has a metric (median), a unit (net ₽), a breakdown (month, role) and a rule for small samples. A test can be written." },
      { t: "The system must show salaries quickly and conveniently.", ok: false, why: "\"Quickly\" and \"conveniently\" are subjective. Everyone has their own \"quick\". A requirement must be measurable: \"within 2 seconds\"." },
    ] },
  { situation: "Rerunning the load created duplicates. Which requirement would have prevented it?",
    options: [
      { t: "The load must work correctly.", ok: false, why: "\"Correctly\" is not defined. A developer won't know what to check." },
      { t: "The table is cleared before loading.", ok: false, why: "That's a solution, not a requirement, and a bad one: it wipes history and first_seen_at (questions 3 and 5)." },
      { t: "Given a load for a period is done, When it is rerun with the same parameters, Then the row counts in vacancy, vacancy_snapshot, vacancy_skill don't change.", ok: true, why: "It describes behavior (idempotency), not implementation. Verified by test_load_is_idempotent." },
    ] },
  { situation: "What counts as a new vacancy for the \"new in 7 days\" report?",
    options: [
      { t: "A vacancy with published_at within the last 7 days.", ok: false, why: "published_at changes on every bump. A month-old vacancy bumped yesterday would count as \"new\"." },
      { t: "A vacancy whose hh_id we first saw in the last 7 days and which has no versions starting before the window.", ok: true, why: "Deduplication by external id + protection from \"the load ran for the first time today\". That's what q5 does." },
      { t: "A vacancy that isn't in the database.", ok: false, why: "If it's not in the database, we know nothing about it. And the period is undefined." },
    ] },
  { situation: "Use case \"daily update\". What must the alternative flows describe?",
    options: [
      { t: "The color of buttons in the report.", ok: false, why: "Unrelated to the load scenario." },
      { t: "What to do if the API returns 429, if the previous run failed, if a vacancy disappeared from results.", ok: true, why: "An alternative flow is a \"what if\". Without them the developer decides alone, maybe differently from what the client expects." },
      { t: "Nothing, the main flow is enough.", ok: false, why: "Most production bugs live in \"non-standard\" scenarios. Those are exactly what to describe." },
    ] },
  { situation: "How to phrase an acceptance criterion for the top skills?",
    options: [
      { t: "Given skills \"SQL\" and \"sql \" in different vacancies, When the ranking is built, Then there's one \"SQL\" row with the combined count.", ok: true, why: "A concrete data example and an expected result. Easily becomes a test (test_normalize_skill)." },
      { t: "Skills must be normalized.", ok: false, why: "Doesn't say what \"normalized\" means or how to check it." },
      { t: "A synonym dictionary with 8 entries is used.", ok: false, why: "That's an implementation detail. A requirement describes the result, not the method." },
    ] },
];

// ---------- 4. Data model ----------
CONTENT.erTables = [
  { id: "load_run", x: 20, y: 20, cols: [["id", "bigint", "PK"], ["started_at", "timestamptz", ""], ["finished_at", "timestamptz", ""], ["as_of", "timestamptz", ""], ["source", "text", ""], ["status", "text", ""], ["vacancies_*", "int", ""], ["error_text", "text", ""]],
    purpose: "Load run log: one row = one run.",
    keys: "PK id (surrogate).",
    constraints: ["status IN ('running','success','failed')", "finished_at ≥ started_at", "status = 'failed' → error_text NOT NULL", "counters ≥ 0"],
    why: "Without a log you can't answer \"how fresh is the data?\" or \"why did nothing load yesterday?\". The row is created and committed BEFORE loading: if the process crashes, the row stays (status running or failed)." },
  { id: "employer", x: 20, y: 250, cols: [["id", "bigint", "PK"], ["hh_id", "text", "UK"], ["name", "text", ""], ["is_trusted", "bool", ""]],
    purpose: "Employers.",
    keys: "PK id; UNIQUE hh_id — the upsert key.",
    constraints: ["name ≠ ''"],
    why: "Anonymous employers (\"company hidden\") come without an id and are not stored here: the vacancy gets employer_id = NULL. Otherwise all anonymous postings would merge into one \"huge company\" in the top employers." },
  { id: "area", x: 20, y: 400, cols: [["id", "bigint", "PK"], ["hh_id", "text", "UK"], ["name", "text", ""]],
    purpose: "Cities from the hh.ru dictionary.",
    keys: "PK id; UNIQUE hh_id ('90' = Tomsk).",
    constraints: ["name ≠ ''"],
    why: "A separate table: a city name is stored once. Renaming a city is one row, not thousands of vacancies." },
  { id: "currency", x: 20, y: 520, cols: [["code", "text", "PK"], ["name", "text", ""], ["rate", "numeric", ""]],
    purpose: "Exchange rates (units of currency per 1 ruble, as in hh.ru /dictionaries).",
    keys: "PK code — a natural key: a currency code is stable and always present.",
    constraints: ["code ~ '^[A-Z]{3}$'", "rate > 0"],
    why: "A natural key fits here: currency codes don't change and are unique. Trap: hh.ru calls the ruble 'RUR', not ISO 'RUB'. rate > 0 prevents division by zero in salary_rub_net()." },
  { id: "vacancy", x: 330, y: 120, cols: [["id", "bigint", "PK"], ["hh_id", "text", "UK"], ["name", "text", ""], ["role", "text", ""], ["employer_id", "bigint", "FK"], ["area_id", "bigint", "FK"], ["salary_from", "int", ""], ["salary_to", "int", ""], ["currency_code", "text", "FK"], ["salary_gross", "bool", ""], ["created_at", "timestamptz", ""], ["published_at", "timestamptz", ""], ["content_hash", "text", ""], ["first_seen_at", "timestamptz", ""], ["last_seen_at", "timestamptz", ""], ["first_load_run_id", "bigint", "FK"]],
    purpose: "Current state of a vacancy (SCD type 1): one row per hh_id.",
    keys: "PK id (surrogate, ADR-001); UNIQUE hh_id (idempotency key, ADR-005); FK to employer (NULL = anonymous), area, currency.",
    constraints: ["salary_from ≤ salary_to (if both present)", "currency present ⇔ at least one bound present", "salary_from > 0, salary_to > 0", "role IN (4 values)", "first_seen_at ≤ last_seen_at", "created_at ≤ published_at"],
    why: "Salary is stored as received (ADR-002). first_seen_at is never overwritten on upsert — question 5 depends on it. FK indexes are created manually: PostgreSQL doesn't create them automatically." },
  { id: "vacancy_snapshot", x: 680, y: 20, cols: [["id", "bigint", "PK"], ["vacancy_id", "bigint", "FK"], ["valid_from", "timestamptz", ""], ["valid_to", "timestamptz", ""], ["name", "text", ""], ["salary_from", "int", ""], ["salary_to", "int", ""], ["published_at", "timestamptz", ""], ["content_hash", "text", ""]],
    purpose: "Version history (SCD type 2): a new row only when something changes.",
    keys: "PK id; FK vacancy_id; UNIQUE (vacancy_id, valid_from); partial UNIQUE (vacancy_id) WHERE valid_to IS NULL.",
    constraints: ["valid_to > valid_from", "salary_from ≤ salary_to", "exactly one current version per vacancy"],
    why: "The partial unique index is the highlight of the schema: a plain UNIQUE(vacancy_id) would forbid history, while this one only forbids two \"current\" versions at once. Vacancy fields are intentionally duplicated: history keeps the values as they were at that time." },
  { id: "vacancy_skill", x: 680, y: 330, cols: [["vacancy_id", "bigint", "PK,FK"], ["skill_id", "bigint", "PK,FK"]],
    purpose: "Many-to-many link: which skills belong to which vacancy.",
    keys: "Composite PK (vacancy_id, skill_id); separate index on skill_id.",
    constraints: ["a skill can't be linked to a vacancy twice", "ON DELETE CASCADE from vacancy"],
    why: "The composite PK forbids duplicate links — otherwise a skill would be counted twice in the top. Separate index on skill_id: the PK starts with vacancy_id, so it can't quickly find \"all vacancies with Kafka\"." },
  { id: "skill", x: 680, y: 470, cols: [["id", "bigint", "PK"], ["name", "text", ""], ["name_normalized", "text", "UK"]],
    purpose: "Skill dictionary.",
    keys: "PK id; UNIQUE name_normalized — the deduplication key.",
    constraints: ["name_normalized = lower(name_normalized)"],
    why: "\"SQL\", \"sql \", \"Sql\" → one row with name_normalized = 'sql'. The lowercase CHECK guards against a Python bug: without it \"SQL\" and \"sql\" could become two \"unique\" skills." },
];
CONTENT.erLinks = [
  ["employer", "vacancy", "employer_id"], ["area", "vacancy", "area_id"], ["currency", "vacancy", "currency_code"],
  ["load_run", "vacancy", "first_load_run_id"], ["vacancy", "vacancy_snapshot", "vacancy_id"],
  ["vacancy", "vacancy_skill", "vacancy_id"], ["skill", "vacancy_skill", "skill_id"],
];

CONTENT.modelExtra = `
<h2>Why normalization</h2>
<p><b>Normalization</b> means laying data out across tables so that each fact is stored in exactly one place. Compare two ways to store skills:</p>
<div class="tables-row">
  <div class="tbl-wrap"><table class="data"><caption>As a string in vacancy (bad)</caption>
    <tr><th>id</th><th>skills</th></tr>
    <tr><td>1</td><td>SQL, BPMN</td></tr><tr><td>2</td><td>sql , Python</td></tr><tr><td>3</td><td>Postgres, SQL, sql</td></tr></table></div>
  <div class="tbl-wrap"><table class="data"><caption>skill + vacancy_skill (good)</caption>
    <tr><th>skill.id</th><th>name_normalized</th></tr><tr><td>10</td><td>sql</td></tr><tr><td>11</td><td>bpmn</td></tr><tr><td>12</td><td>python</td></tr><tr><td>13</td><td>postgresql</td></tr></table></div>
  <div class="tbl-wrap"><table class="data"><caption>vacancy_skill</caption>
    <tr><th>vacancy_id</th><th>skill_id</th></tr><tr><td>1</td><td>10</td></tr><tr><td>1</td><td>11</td></tr><tr><td>2</td><td>10</td></tr><tr><td>2</td><td>12</td></tr><tr><td>3</td><td>13</td></tr><tr><td>3</td><td>10</td></tr></table></div>
</div>
<dl class="qvcw">
  <dt>Question</dt><dd>"How many vacancies require SQL?"</dd>
  <dt>As a string</dt><dd><code>WHERE skills ILIKE '%sql%'</code> also matches "PostgreSQL" and "MySQL", and in vacancy 3 are "SQL" and "sql" one skill or two? An index won't help: <code>%…%</code> scans the whole table.</dd>
  <dt>Normalized</dt><dd><code>SELECT count(*) FROM vacancy_skill WHERE skill_id = 10</code> → 3. A "SQL, sql" duplicate is impossible: PK (vacancy_id, skill_id).</dd>
  <dt>Cost</dt><dd>More tables and JOINs; writing a vacancy takes several queries. At thousands of rows this is negligible.</dd>
</dl>
<h2>Why not an ORM</h2>
<p>An <b>ORM</b> (Object-Relational Mapping) is a library that represents tables as classes and writes SQL for you. For example, <code>session.query(Vacancy).filter(Vacancy.role == 'data_analyst')</code>.</p>
<dl class="qvcw">
  <dt>Question</dt><dd>What matters more in this project: development speed or the ability to write SQL?</dd>
  <dt>Options</dt><dd>ORM (SQLAlchemy ORM); query builder (SQLAlchemy Core); raw SQL via psycopg with parameters.</dd>
  <dt>Choice</dt><dd>Raw SQL (ADR-006).</dd>
  <dt>Why</dt><dd>The goal is to learn SQL: an analyst writes it by hand in DBeaver and Metabase. Window functions and gaps-and-islands read worse through an ORM. Queries in .sql files run without Python.</dd>
  <dt>Cost</dt><dd>No automatic migrations; SQL-injection protection is on us — parameters <code>%s</code> only.</dd>
</dl>`;

// ---------- 5. ETL ----------
CONTENT.etlIntro = {
  pagination: "The API returns results in pages of 100. found is the total number of results, pages is the number of pages. There's a hard limit: the API won't return anything past result #2000. That's why we search one day at a time: one role has far fewer than 2000 vacancies per day.",
  retry: "On a 429 (too many requests) or 5xx (server error) the client doesn't give up: it waits and retries. The pause doubles: 1, 2, 4, 8 s. This is <b>exponential backoff</b>. A random extra of up to 10% (<b>jitter</b>) is added so that a thousand clients who got 429 at the same moment don't all come back at the same moment. 400/403 responses are not retried: without a token the answer won't change.",
  upsert: "The same two records arrive on the first and on a repeated run. INSERT … ON CONFLICT (hh_id) DO UPDATE: a new hh_id is inserted, an existing one updates the same row. content_hash decides whether history needs a new version.",
};
})(window.CONTENTS.en = window.CONTENTS.en || {});
