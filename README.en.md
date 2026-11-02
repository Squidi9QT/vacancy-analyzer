# Vacancy Analyzer

[Русская версия](README.md)

A systems analyst portfolio project. The service collects job postings for systems analysts, data analysts and junior backend developers from the official hh.ru API, stores them in PostgreSQL with change history, and answers 6 business questions with SQL queries and charts.

**The main thing to explore** is the interactive walkthrough `explainer/index.html`: open the file in a browser, no server needed. (The walkthrough and the docs are in Russian.)

## Data: please read

An anonymous request to the hh.ru API returned `403 {"errors":[{"type":"forbidden"}]}` (checked 2026-10-31). So by default the project runs on **fixtures**: `tests/fixtures/hh_world.json` is a synthetic "world" of 1,163 vacancies from March to October 2026 in the hh.ru API response format, including change history. The generator `scripts/generate_fixtures.py` is deterministic (seed=42), so everyone gets the same numbers.

**All findings in the report describe synthetic data, not the real job market.** Employers are fictional.

The real API client (`src/extract/http_client.py`) is implemented and covered by tests with a fake HTTP session. To enable it, get an application token at dev.hh.ru and set in `.env`: `DATA_SOURCE=api`, `HH_ACCESS_TOKEN=…`, `HH_USER_AGENT=YourApp/1.0 (you@email)`.

## Run it in 5 minutes

Requires Python 3.12+ and PostgreSQL 16. Developed on Python 3.14 and PostgreSQL 16 (Homebrew).

```bash
# 1. Environment and dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

**2. Database.** Option A — Docker:

```bash
docker compose up -d
```

Option B — local PostgreSQL. Create two databases and set `DATABASE_URL` and `TEST_DATABASE_URL` in `.env` (e.g. `postgresql:///vacancies`):

```bash
createdb vacancies && createdb vacancies_test
```

```bash
# 3. Schema, 8 months of data (244 simulated daily runs, ~3 s), report
python -m src.main init-db
python -m src.main backfill --from 2026-03-01 --to 2026-10-30
python -m src.main report

# 4. Tests
pytest -q
```

Charts and CSV files end up in `reports/`, the walkthrough is `explainer/index.html`.

Other commands:

```bash
python -m src.main load --days 7      # load the last 7 days (with fixtures, "today" = FIXTURE_NOW)
python -m src.main init-db --reset    # drop ALL data and recreate the schema
psql -d vacancies -f sql/queries/q6_stable_employers.sql   # run any query directly in psql
```

## Project structure

| Path | Contents |
|------|----------|
| `docs/requirements/` | Goals and metrics, stakeholders, 8 user stories, 3 use cases, glossary, 10 open questions with decisions |
| `docs/data_model.md` | ER diagram (Mermaid), table purposes, constraints, why normalization |
| `docs/decisions/` | ADR-001…006: keys, currency, history (SCD2), skills, idempotent loading, no ORM |
| `docs/query_plans/` | EXPLAIN ANALYZE before and after optimization on a 300k-vacancy database |
| `docs/sqlite_vs_postgres.md` | What would be lost on SQLite |
| `docs/journal.md`, `docs/summary.md` | Work log by stage and final summary |
| `sql/001_schema.sql`, `sql/002_indexes.sql` | Schema and indexes added after measurements |
| `sql/queries/` | One file per business question (q1–q6, plus q1b for the heatmap) |
| `src/extract/` | API client: pagination, retries with exponential backoff, timeouts; fixture-based client |
| `src/transform/` | JSON → flat records: salary, skills, role, content hash |
| `src/load/`, `src/pipeline.py` | Upsert into PostgreSQL, version history, load run log |
| `src/report.py` | matplotlib charts, CSV, `explainer/data.js` |
| `src/api.py` | Optional: `GET /api/summary` (needs `pip install uvicorn`, run `python -m src.main serve`) |
| `tests/` | 50 tests: transform, extract without network, loading into a test DB, API |
| `explainer/` | Interactive project walkthrough |
| `scripts/` | Fixture generator, large benchmark DB, plan export, Playwright site check |

## Six business questions

| # | Question | Query | SQL technique |
|---|----------|-------|---------------|
| 1 | Which skills appear most often in analyst vacancies? | `q1_top_skills.sql` | CTE, join through a link table, FILTER, HAVING, RANK |
| 2 | How did the median salary change by month (role, city)? | `q2_salary_median_by_month.sql` | ROW_NUMBER (first version), percentile_cont, GROUPING SETS |
| 3 | Who posts the most, and how often do they update postings? | `q3_employers_activity.sql` | LAG with a named window, IS DISTINCT FROM |
| 4 | Share of vacancies without a salary, by region | `q4_no_salary_by_region.sql` | avg over a condition, ROLLUP, HAVING (+ Wilson intervals in the report) |
| 5 | New in the last 7 days, deduplicated by external id | `q5_new_last_7_days.sql` | LEFT JOIN … IS NULL (anti-join), correlated subquery |
| 6 | Who has been hiring 3+ months in a row | `q6_stable_employers.sql` | gaps and islands |

## Key engineering decisions

- **Idempotent load:** `INSERT … ON CONFLICT (hh_id) DO UPDATE`, one transaction per vacancy; rerunning a load creates no duplicates (covered by a test).
- **History:** current state in `vacancy` (SCD type 1) plus versions in `vacancy_snapshot` (SCD type 2); a partial unique index guarantees one current version per vacancy.
- **Salaries** are stored as received (currency, gross/net) and converted to net RUB by a single SQL function, `salary_rub_net()`.
- **Performance:** on a 300k-vacancy benchmark, q6 went from 4.0 s to 0.14 s (rewritten with a window function) and q5 from 1.3 s to 0.11 s (two indexes).
- **Raw SQL with psycopg 3**, no ORM; all queries are parameterized.

## Checking the walkthrough site

```bash
pip install playwright && python -m playwright install chromium
python scripts/check_explainer.py
```

The script opens the site as a local file, clicks every interactive element, and checks the console and the layout at 375 px width.
