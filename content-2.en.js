window.CONTENTS = window.CONTENTS || {};
(function (CONTENT) {
const V = [["id", "name", "role"], [[1, "Systems Analyst", "system_analyst"], [2, "Data Analyst", "data_analyst"], [3, "Junior Python", "backend_junior"], [4, "System Analyst", "system_analyst"]]];

CONTENT.sqlLessons = [
  {
    id: "join", tab: "JOIN + GROUP BY (q1)", title: "Top skills: how JOIN multiplies rows and GROUP BY collapses them",
    question: "Which skills appear most often in analyst vacancies?",
    file: "sql/queries/q1_top_skills.sql",
    sql: `WITH analyst AS (
    SELECT id, role FROM vacancy
    WHERE role IN ('system_analyst', 'data_analyst')
)
SELECT s.name AS skill,
       count(*) AS vacancies,
       round(100.0 * count(*) / (SELECT count(*) FROM analyst), 1) AS share_pct,
       RANK() OVER (ORDER BY count(*) DESC) AS place
FROM analyst a
JOIN vacancy_skill vs ON vs.vacancy_id = a.id
JOIN skill s          ON s.id = vs.skill_id
GROUP BY s.id, s.name
HAVING count(*) >= 2
ORDER BY vacancies DESC;`,
    steps: [
      { title: "Source data", mark: "", text: "Three tables. A vacancy's skills are not stored in vacancy but in the link table vacancy_skill: one row = \"vacancy X has skill Y\". (The real query uses HAVING ≥ 5; here it's ≥ 2 because the data is tiny.)",
        tables: [{ caption: "vacancy", cols: V[0], rows: V[1] },
                 { caption: "vacancy_skill", cols: ["vacancy_id", "skill_id"], rows: [[1, 10], [1, 11], [2, 10], [2, 12], [3, 12], [4, 10]] },
                 { caption: "skill", cols: ["id", "name"], rows: [[10, "SQL"], [11, "BPMN"], [12, "Python"]] }] },
      { title: "CTE analyst: analysts only", mark: "WHERE role IN ('system_analyst', 'data_analyst')", text: "WITH analyst AS (…) is a named subquery (CTE). Vacancy 3 (backend) is dropped. 3 analysts remain — that will be the denominator of the share.",
        tables: [{ caption: "analyst", cols: ["id", "role"], rows: [[1, "system_analyst"], [2, "data_analyst"], [3, "backend_junior"], [4, "system_analyst"]], cls: ["", "", "dim", ""] }] },
      { title: "JOIN vacancy_skill: rows multiply", mark: "JOIN vacancy_skill vs ON vs.vacancy_id = a.id", text: "Each vacancy is joined with all its skills. Vacancy 1 has two skills, so it becomes two rows. That's fine: next we count link rows, not vacancies. Key point: one link = one vacancy, because PK (vacancy_id, skill_id) forbids duplicates.",
        tables: [{ caption: "analyst ⋈ vacancy_skill", cols: ["a.id", "role", "skill_id"], rows: [[1, "system_analyst", 10], [1, "system_analyst", 11], [2, "data_analyst", 10], [2, "data_analyst", 12], [4, "system_analyst", 10]], cls: ["hl-a", "hl-a", "hl-b", "hl-b", "hl-c"] }] },
      { title: "JOIN skill: add the names", mark: "JOIN skill s          ON s.id = vs.skill_id", text: "The second JOIN doesn't change the row count: each link has exactly one skill (foreign key).",
        tables: [{ caption: "+ skill", cols: ["a.id", "skill_id", "s.name"], rows: [[1, 10, "SQL"], [1, 11, "BPMN"], [2, 10, "SQL"], [2, 12, "Python"], [4, 10, "SQL"]] }] },
      { title: "GROUP BY: rows collapse into groups", mark: "GROUP BY s.id, s.name", text: "Rows with the same skill are gathered into one group (same color). count(*) counts the rows in the group: SQL — 3.",
        tables: [{ caption: "groups", cols: ["s.name", "a.id"], rows: [["SQL", 1], ["SQL", 2], ["SQL", 4], ["BPMN", 1], ["Python", 2]], cls: ["hl-a", "hl-a", "hl-a", "hl-b", "hl-c"] },
                 { caption: "after GROUP BY", cols: ["skill", "vacancies"], rows: [["SQL", 3], ["BPMN", 1], ["Python", 1]], cls: ["hl-a", "hl-b", "hl-c"] }] },
      { title: "Share, HAVING and RANK", mark: "HAVING count(*) >= 2", text: "share_pct = count / 3 analysts. HAVING filters GROUPS after aggregation (WHERE can't — it runs before grouping). BPMN and Python are dropped: 1 mention is noise. RANK gives the place; equal counts get equal places.",
        tables: [{ caption: "result", cols: ["skill", "vacancies", "share_pct", "place"], rows: [["SQL", 3, "100.0", 1], ["BPMN", 1, "33.3", 2], ["Python", 1, "33.3", 2]], cls: ["new", "dim", "dim"], cells: [[0, 2]] }] },
    ],
    why: "<b>Why the denominator is all analysts, not \"analysts with skills\":</b> otherwise the share would answer \"among those that list skills\" and be inflated. <b>Why count(*) and not count(DISTINCT vacancy_id):</b> the link PK guarantees no duplicates; DISTINCT would only slow the query down. <b>Why HAVING, not WHERE:</b> a condition on the aggregate count(*) can only be checked after grouping.",
    mistakes: ["LEFT JOIN instead of JOIN: vacancies without skills would produce a row with a NULL skill, and the top would contain a \"NULL\" row.", "Using count(*) of the same query as the denominator: that's the number of links, not vacancies — the shares come out wrong.", "GROUP BY s.name without s.id: if two skills have the same display name, they merge. Group by the key."],
  },
  {
    id: "rownum", tab: "ROW_NUMBER (q2)", title: "Median salary: ROW_NUMBER picks the first version of a vacancy",
    question: "What salary was offered at first publication, and what's the median per month?",
    file: "sql/queries/q2_salary_median_by_month.sql",
    sql: `WITH first_version AS (
    SELECT s.*,
           ROW_NUMBER() OVER (PARTITION BY s.vacancy_id ORDER BY s.valid_from) AS version_no
    FROM vacancy_snapshot s
)
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY salary) AS median_salary
FROM first_version f
JOIN currency c ON c.code = f.currency_code
WHERE f.version_no = 1;`,
    steps: [
      { title: "Version history", mark: "", text: "Vacancy 1 has two versions (salary raised), vacancy 2 has two (salary added later), vacancy 3 has one. We need the salary of the FIRST version of each vacancy.",
        tables: [{ caption: "vacancy_snapshot", cols: ["vacancy_id", "valid_from", "salary", "currency"], rows: [[1, "03-02", 150000, "RUR"], [1, "03-20", 160000, "RUR"], [2, "03-05", null, null], [2, "04-01", 120000, "RUR"], [3, "03-10", 200000, "RUR"]] }] },
      { title: "PARTITION BY: windows", mark: "PARTITION BY s.vacancy_id", text: "A window function splits rows into windows (partitions) — here by vacancy_id. Each window has its own color. Unlike GROUP BY, rows are NOT collapsed: the function adds a value to every row.",
        tables: [{ caption: "windows by vacancy_id", cols: ["vacancy_id", "valid_from", "salary"], rows: [[1, "03-02", 150000], [1, "03-20", 160000], [2, "03-05", null], [2, "04-01", 120000], [3, "03-10", 200000]], cls: ["hl-a", "hl-a", "hl-b", "hl-b", "hl-c"] }] },
      { title: "ORDER BY + ROW_NUMBER: number within the window", mark: "ROW_NUMBER() OVER (PARTITION BY s.vacancy_id ORDER BY s.valid_from) AS version_no", text: "Within each window rows are ordered by valid_from and numbered from 1. Numbering restarts in every window. Without ORDER BY the number would be arbitrary — the \"first\" version could be any of them.",
        tables: [{ caption: "+ version_no", cols: ["vacancy_id", "valid_from", "salary", "version_no"], rows: [[1, "03-02", 150000, 1], [1, "03-20", 160000, 2], [2, "03-05", null, 1], [2, "04-01", 120000, 2], [3, "03-10", 200000, 1]], cls: ["hl-a", "hl-a", "hl-b", "hl-b", "hl-c"], cells: [[0, 3], [2, 3], [4, 3]] }] },
      { title: "WHERE version_no = 1", mark: "WHERE f.version_no = 1", text: "Only first versions remain. You can filter on a window function only in an outer query: WHERE runs before window functions, hence the CTE.",
        tables: [{ caption: "first versions", cols: ["vacancy_id", "salary", "version_no"], rows: [[1, 150000, 1], [1, 160000, 2], [2, null, 1], [2, 120000, 2], [3, 200000, 1]], cls: ["", "dim", "", "dim", ""] }] },
      { title: "JOIN currency drops NULL", mark: "JOIN currency c ON c.code = f.currency_code", text: "Vacancy 2's first version had no salary (currency = NULL). JOIN finds no match for NULL, so the row drops out. That's intended: the median is computed over vacancies with a salary. But note: the salary added later (120,000) is not counted — the price of choosing \"first version\".",
        tables: [{ caption: "after JOIN currency", cols: ["vacancy_id", "salary"], rows: [[1, 150000], [2, null], [3, 200000]], cls: ["", "dim", ""] }] },
      { title: "Median", mark: "percentile_cont(0.5) WITHIN GROUP (ORDER BY salary)", text: "Two numbers remain: 150,000 and 200,000. The median is the middle value of the sorted series. With an even count percentile_cont averages the two middle values: (150,000 + 200,000) / 2 = 175,000. percentile_disc would return one of the actual values (150,000).",
        tables: [{ caption: "result", cols: ["median_salary", "avg_salary"], rows: [[175000, 175000]], cls: ["new"] },
                 { caption: "and if we add a \"director\"", cols: ["salaries", "median", "avg"], rows: [["150,000, 200,000, 900,000", "200,000", "416,667"]], cells: [[0, 1], [0, 2]] }] },
    ],
    why: "<b>Why the first version, not the current one:</b> if a March vacancy's salary was raised in October, the March point shouldn't \"move\". <b>Why the median:</b> one high salary shifts the mean, the median is robust (second table on the last step). <b>Why ROW_NUMBER and not min(valid_from) + JOIN:</b> ROW_NUMBER picks the whole row in one pass; with min you'd have to join the table to itself again.",
    mistakes: ["Forgot ORDER BY in the window → the \"first\" version is arbitrary and the result changes between runs.", "WHERE ROW_NUMBER() … = 1 in the same SELECT → error: window functions are evaluated after WHERE.", "RANK instead of ROW_NUMBER: two versions with the same valid_from would both get 1 — the vacancy would be counted twice (we prevent this with UNIQUE(vacancy_id, valid_from))."],
  },
  {
    id: "lag", tab: "LAG (q3)", title: "How often a vacancy is updated: LAG looks at the previous row",
    question: "How many times did an employer change its vacancies, and what exactly changed?",
    file: "sql/queries/q3_employers_activity.sql",
    sql: `SELECT vacancy_id, valid_from, salary_to,
       LAG(valid_from) OVER w AS prev_valid_from,
       LAG(salary_to)  OVER w AS prev_salary_to
FROM vacancy_snapshot
WINDOW w AS (PARTITION BY vacancy_id ORDER BY valid_from);
-- then: count(*) FILTER (WHERE prev_valid_from IS NOT NULL) AS updates
--       count(*) FILTER (WHERE salary_to IS DISTINCT FROM prev_salary_to) AS salary_changes`,
    steps: [
      { title: "Versions of two vacancies", mark: "", text: "Vacancy 7: three versions. Vacancy 8: one version (never changed).",
        tables: [{ caption: "vacancy_snapshot", cols: ["vacancy_id", "valid_from", "salary_to"], rows: [[7, "05-01", null], [7, "05-15", 150000], [7, "06-01", 150000], [8, "05-03", 90000]] }] },
      { title: "Window and LAG", mark: "LAG(valid_from) OVER w AS prev_valid_from", text: "LAG(x) is the value of x from the PREVIOUS row of the same window. The first row of a window has no previous row → NULL. WINDOW w AS (…) names the window so it isn't repeated for every LAG.",
        tables: [{ caption: "+ prev_*", cols: ["vacancy_id", "valid_from", "salary_to", "prev_valid_from", "prev_salary_to"], rows: [[7, "05-01", null, null, null], [7, "05-15", 150000, "05-01", null], [7, "06-01", 150000, "05-15", 150000], [8, "05-03", 90000, null, null]], cls: ["hl-a", "hl-a", "hl-a", "hl-b"], cells: [[1, 3], [2, 3]] }] },
      { title: "Counting updates", mark: "", text: "An update = a version that has a previous one (prev_valid_from IS NOT NULL). The first version is the publication, not an update. Vacancy 7 has two updates, vacancy 8 has zero. Days between updates: 14 and 17.",
        tables: [{ caption: "updates", cols: ["vacancy_id", "updates", "avg_days_between"], rows: [[7, 2, "15.5"], [8, 0, null]] }] },
      { title: "Trap: <> vs IS DISTINCT FROM", mark: "", text: "Did the salary change in the second version (NULL → 150,000)? The expression 150000 <> NULL yields NULL, not TRUE — and the row won't be counted by count(*) FILTER. IS DISTINCT FROM treats NULL as a regular value and returns TRUE.",
        tables: [{ caption: "comparison", cols: ["salary_to", "prev", "x <> prev", "x IS DISTINCT FROM prev"], rows: [[150000, null, "NULL (!)", "TRUE"], [150000, 150000, "FALSE", "FALSE"], [null, null, "NULL", "FALSE"]], cells: [[0, 2], [0, 3]] }] },
    ],
    why: "<b>Why LAG and not a self-join (s1 JOIN s2 ON s2.n = s1.n + 1):</b> a self-join needs a version number and then a second pass over the table. LAG does the same in one pass. <b>Why IS DISTINCT FROM:</b> NULL in SQL means \"unknown\", and \"unknown ≠ 150,000\" is also \"unknown\".",
    mistakes: ["A window without PARTITION BY: LAG takes the previous row of ANOTHER vacancy, inflating \"updates\".", "Counting the first version as an update: every vacancy then has at least one \"update\".", "Comparing with <> — \"NULL → value\" changes get lost."],
  },
  {
    id: "antijoin", tab: "LEFT JOIN … IS NULL (q5)", title: "New vacancies: LEFT JOIN and a NULL check",
    question: "Which vacancies appeared for the first time in the last 7 days?",
    file: "sql/queries/q5_new_last_7_days.sql",
    sql: `WITH params AS (
    SELECT max(as_of) - INTERVAL '7 days' AS window_start
    FROM load_run WHERE status = 'success'
)
SELECT v.hh_id, v.name
FROM vacancy v
CROSS JOIN params p
LEFT JOIN vacancy_snapshot prior
       ON prior.vacancy_id = v.id
      AND prior.valid_from < p.window_start
WHERE v.first_seen_at >= p.window_start
  AND prior.id IS NULL;`,
    steps: [
      { title: "Data and \"today\"", mark: "SELECT max(as_of) - INTERVAL '7 days' AS window_start", text: "\"Today\" = the moment of the last successful load (10-30); the window starts at 10-23. Taken from load_run, not now(): the query is reproducible on fixtures.",
        tables: [{ caption: "vacancy", cols: ["id", "hh_id", "first_seen_at"], rows: [[1, "A", "10-25"], [2, "B", "10-28"], [3, "C", "09-15"], [4, "D", "10-29"]] },
                 { caption: "vacancy_snapshot", cols: ["id", "vacancy_id", "valid_from"], rows: [[11, 1, "10-25"], [12, 2, "08-01"], [13, 2, "10-28"], [14, 3, "09-15"], [15, 4, "10-29"]] }] },
      { title: "Filter by first_seen_at", mark: "WHERE v.first_seen_at >= p.window_start", text: "We saw vacancy C in September — it's definitely not new.",
        tables: [{ caption: "vacancy", cols: ["id", "hh_id", "first_seen_at"], rows: [[1, "A", "10-25"], [2, "B", "10-28"], [3, "C", "09-15"], [4, "D", "10-29"]], cls: ["", "", "dim", ""] }] },
      { title: "LEFT JOIN with earlier versions", mark: "LEFT JOIN vacancy_snapshot prior", text: "For each vacancy we look for versions that started BEFORE the window. LEFT JOIN keeps the vacancy even without a match — then the prior fields are NULL. We first saw vacancy B on 10-28 (e.g. the very first load ran then), but its version from 08-01 shows it was published long ago.",
        tables: [{ caption: "v LEFT JOIN prior", cols: ["v.id", "hh_id", "prior.id", "prior.valid_from"], rows: [[1, "A", null, null], [2, "B", 12, "08-01"], [4, "D", null, null]], cls: ["hl-c", "hl-b", "hl-c"], cells: [[0, 2], [2, 2]] }] },
      { title: "WHERE prior.id IS NULL", mark: "AND prior.id IS NULL", text: "Keep rows where NO match was found. This is an anti-join: \"vacancies for which no earlier version exists\". Result: A and D.",
        tables: [{ caption: "result", cols: ["hh_id", "name"], rows: [["A", "…"], ["B", "…"], ["D", "…"]], cls: ["new", "dim", "new"] }] },
    ],
    why: "<b>Why the valid_from condition is in ON, not WHERE:</b> in WHERE it would drop rows with NULL — and the LEFT JOIN would become a plain JOIN. That's the most common LEFT JOIN mistake. <b>Alternative:</b> WHERE NOT EXISTS (SELECT 1 FROM vacancy_snapshot …) — same meaning; PostgreSQL builds the same plan (Anti Join) for both. <b>Why two novelty checks:</b> first_seen_at says when WE saw it, earlier versions say when it was PUBLISHED.",
    mistakes: ["Moving prior.valid_from < window_start into WHERE → the result is always empty.", "NOT IN (SELECT vacancy_id …) instead of NOT EXISTS: if the subquery contains a NULL, NOT IN returns nothing.", "INNER JOIN with employer: anonymous vacancies (employer_id IS NULL) disappear from the new list."],
  },
  {
    id: "islands", tab: "Gaps and islands (q6)", title: "Hiring 3+ months in a row: the gaps-and-islands technique",
    question: "Which companies post vacancies 3 or more months in a row?",
    file: "sql/queries/q6_stable_employers.sql",
    sql: `WITH numbered AS (
    SELECT employer_id, month,
           extract(year FROM month) * 12 + extract(month FROM month) AS month_no,
           ROW_NUMBER() OVER (PARTITION BY employer_id ORDER BY month) AS rn
    FROM active_months
)
SELECT employer_id, min(month), max(month), count(*) AS streak_months
FROM numbered
GROUP BY employer_id, month_no - rn
HAVING count(*) >= 3;`,
    steps: [
      { title: "Active months", mark: "", text: "Company A hired in March, April, May, July, August (June skipped). Company B — May, June. Task: find continuous streaks (\"islands\") and their length.",
        tables: [{ caption: "active_months", cols: ["employer", "month"], rows: [["A", "2026-03"], ["A", "2026-04"], ["A", "2026-05"], ["A", "2026-07"], ["A", "2026-08"], ["B", "2026-05"], ["B", "2026-06"]] }] },
      { title: "Month number on an even scale", mark: "extract(year FROM month) * 12 + extract(month FROM month) AS month_no", text: "Year × 12 + month: neighboring months differ by exactly 1, even across December/January. Dates don't work this way: months have different lengths.",
        tables: [{ caption: "+ month_no", cols: ["employer", "month", "month_no"], rows: [["A", "2026-03", 24315], ["A", "2026-04", 24316], ["A", "2026-05", 24317], ["A", "2026-07", 24319], ["A", "2026-08", 24320], ["B", "2026-05", 24317], ["B", "2026-06", 24318]] }] },
      { title: "ROW_NUMBER in order", mark: "ROW_NUMBER() OVER (PARTITION BY employer_id ORDER BY month) AS rn", text: "Number each company's months consecutively: 1, 2, 3… — with no gaps.",
        tables: [{ caption: "+ rn", cols: ["employer", "month", "month_no", "rn"], rows: [["A", "2026-03", 24315, 1], ["A", "2026-04", 24316, 2], ["A", "2026-05", 24317, 3], ["A", "2026-07", 24319, 4], ["A", "2026-08", 24320, 5], ["B", "2026-05", 24317, 1], ["B", "2026-06", 24318, 2]], cls: ["hl-a", "hl-a", "hl-a", "hl-a", "hl-a", "hl-d", "hl-d"] }] },
      { title: "The difference = island id", mark: "month_no - rn", text: "Within a continuous streak month_no and rn both grow by 1 — their difference is constant. Skipping June increased month_no by 2 but rn by 1 — the difference changed and a new island began.",
        tables: [{ caption: "+ island_id", cols: ["employer", "month", "month_no", "rn", "month_no − rn"], rows: [["A", "2026-03", 24315, 1, 24314], ["A", "2026-04", 24316, 2, 24314], ["A", "2026-05", 24317, 3, 24314], ["A", "2026-07", 24319, 4, 24315], ["A", "2026-08", 24320, 5, 24315], ["B", "2026-05", 24317, 1, 24316], ["B", "2026-06", 24318, 2, 24316]], cls: ["hl-a", "hl-a", "hl-a", "hl-b", "hl-b", "hl-c", "hl-c"], cells: [[0, 4], [3, 4]] }] },
      { title: "GROUP BY island, HAVING ≥ 3", mark: "GROUP BY employer_id, month_no - rn", text: "Each group is one island. Its length is count(*). HAVING keeps islands of 3+ months: for A, March–May.",
        tables: [{ caption: "islands", cols: ["employer", "start", "end", "streak_months"], rows: [["A", "2026-03", "2026-05", 3], ["A", "2026-07", "2026-08", 2], ["B", "2026-05", "2026-06", 2]], cls: ["new", "dim", "dim"] }] },
    ],
    why: "<b>Why this technique and not a loop in Python:</b> it solves the task in one sort pass inside the database, without exporting data. <b>Why DISTINCT in active_months:</b> 5 vacancies in March are one active month; without DISTINCT rn would count March five times and the islands would \"break\". <b>Why \"month the vacancy was created\":</b> it's a definition of activity that's easy to compute and explain. The alternative — \"at least one vacancy was open that month\" — gives longer islands.",
    mistakes: ["Forgetting DISTINCT on months: three vacancies in March give three March rows with the same month_no but rn = 1, 2, 3. The differences diverge and a streak \"breaks\" where there's no gap.", "Using a date instead of a month number: date − rn days gives different values within a streak.", "A correlated subquery for \"total active months\": on 300k vacancies the query took 4 s (see docs/query_plans). A windowed count(*) OVER — 0.14 s."],
  },
  {
    id: "nulls", tab: "NULL in aggregates", title: "NULL in AVG and COUNT: why the answers differ",
    question: "What's the average salary if half the vacancies don't state one?",
    file: "sql/queries/q4_no_salary_by_region.sql",
    sql: `SELECT count(*)                  AS all_rows,
       count(salary)             AS with_salary,
       avg(salary)               AS avg_known,
       avg(COALESCE(salary, 0))  AS avg_as_zero,
       sum(salary) / count(*)    AS sum_div_all,
       avg((salary IS NULL)::int) AS share_without
FROM t;`,
    steps: [
      { title: "Data", mark: "", text: "Four vacancies, two without a salary (NULL).",
        tables: [{ caption: "t", cols: ["id", "salary"], rows: [[1, 100000], [2, null], [3, 200000], [4, null]] }] },
      { title: "count(*) vs count(salary)", mark: "count(salary)", text: "count(*) counts rows. count(column) counts only rows where the column is NOT NULL.",
        tables: [{ caption: "", cols: ["all_rows", "with_salary"], rows: [[4, 2]], cells: [[0, 1]] }] },
      { title: "avg skips NULL", mark: "avg(salary)", text: "avg(salary) = (100,000 + 200,000) / 2 = 150,000. NULL takes part in neither the sum nor the count. It's \"the average salary among vacancies that state one\".",
        tables: [{ caption: "", cols: ["avg_known"], rows: [[150000]], cells: [[0, 0]] }] },
      { title: "COALESCE(salary, 0) is a logic error", mark: "avg(COALESCE(salary, 0))", text: "\"Not specified\" became \"0 rubles\". The average halved: 75,000. sum/count(*) gives the same. Syntactically correct, but it answers a meaningless question.",
        tables: [{ caption: "", cols: ["avg_as_zero", "sum_div_all"], rows: [[75000, 75000]], cls: ["dim"] }] },
      { title: "Share of NULL via avg over a condition", mark: "avg((salary IS NULL)::int)", text: "(salary IS NULL)::int is 1 for \"no salary\" and 0 for \"has salary\". The mean of ones and zeros is the share of ones: 0.5. q4 uses this trick.",
        tables: [{ caption: "", cols: ["share_without"], rows: [["0.50"]], cls: ["new"] }] },
    ],
    why: "<b>Rule:</b> before any aggregate, ask what NULL means in that column. For salary, NULL = \"not specified\", not \"zero\". That's why the project computes the median over vacancies with a salary only and always shows how many vacancies it's based on.",
    mistakes: ["COALESCE(salary, 0) \"to avoid NULL\" — understates the average.", "count(salary) instead of count(*) as the denominator of \"no salary\" share → dividing \"without\" by \"with\".", "sum(a) + sum(b) vs sum(a + b): if b = NULL in a row, a + b = NULL and the whole row drops out of the second sum."],
  },
];
})(window.CONTENTS.en = window.CONTENTS.en || {});
