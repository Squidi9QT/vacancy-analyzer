// Раздел 6: SQL-уроки. Каждый урок — набор шагов; шаг = пояснение + фрагмент SQL + таблицы.
// rows — строки таблицы; cls — класс подсветки строки (hl-a…hl-d — группы/окна, dim — отброшена,
// new — появилась); cells — [строка, колонка] ячейки, на которые надо смотреть.
window.CONTENT = window.CONTENT || {};

const V = [["id", "name", "role"], [[1, "Системный аналитик", "system_analyst"], [2, "Аналитик данных", "data_analyst"], [3, "Junior Python", "backend_junior"], [4, "System Analyst", "system_analyst"]]];

CONTENT.sqlLessons = [
  {
    id: "join", tab: "JOIN + GROUP BY (q1)", title: "Топ навыков: как JOIN размножает строки, а GROUP BY схлопывает",
    question: "Какие навыки чаще всего упоминаются в вакансиях аналитиков?",
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
      { title: "Исходные данные", mark: "", text: "Три таблицы. Навыки вакансии хранятся не в vacancy, а в таблице связи vacancy_skill: одна строка = «у вакансии X есть навык Y». (В настоящем запросе HAVING ≥ 5, здесь ≥ 2 — данных мало.)",
        tables: [{ caption: "vacancy", cols: V[0], rows: V[1] },
                 { caption: "vacancy_skill", cols: ["vacancy_id", "skill_id"], rows: [[1, 10], [1, 11], [2, 10], [2, 12], [3, 12], [4, 10]] },
                 { caption: "skill", cols: ["id", "name"], rows: [[10, "SQL"], [11, "BPMN"], [12, "Python"]] }] },
      { title: "CTE analyst: только аналитики", mark: "WHERE role IN ('system_analyst', 'data_analyst')", text: "WITH analyst AS (…) — именованный подзапрос (CTE). Вакансия 3 (backend) отброшена. Аналитиков осталось 3 — это будущий знаменатель доли.",
        tables: [{ caption: "analyst", cols: ["id", "role"], rows: [[1, "system_analyst"], [2, "data_analyst"], [3, "backend_junior"], [4, "system_analyst"]], cls: ["", "", "dim", ""] }] },
      { title: "JOIN vacancy_skill: строки размножаются", mark: "JOIN vacancy_skill vs ON vs.vacancy_id = a.id", text: "Каждая вакансия соединяется со всеми своими навыками. У вакансии 1 два навыка — она превращается в две строки. Это нормально: дальше мы считаем строки-связи, а не вакансии. Важно: одна связь = одна вакансия, потому что PK (vacancy_id, skill_id) запрещает дубль.",
        tables: [{ caption: "analyst ⋈ vacancy_skill", cols: ["a.id", "role", "skill_id"], rows: [[1, "system_analyst", 10], [1, "system_analyst", 11], [2, "data_analyst", 10], [2, "data_analyst", 12], [4, "system_analyst", 10]], cls: ["hl-a", "hl-a", "hl-b", "hl-b", "hl-c"] }] },
      { title: "JOIN skill: подставляем названия", mark: "JOIN skill s          ON s.id = vs.skill_id", text: "Второй JOIN не меняет число строк: у каждой связи ровно один навык (внешний ключ).",
        tables: [{ caption: "+ skill", cols: ["a.id", "skill_id", "s.name"], rows: [[1, 10, "SQL"], [1, 11, "BPMN"], [2, 10, "SQL"], [2, 12, "Python"], [4, 10, "SQL"]] }] },
      { title: "GROUP BY: строки схлопываются в группы", mark: "GROUP BY s.id, s.name", text: "Строки с одинаковым навыком собираются в одну группу (одинаковый цвет). count(*) считает строки в группе: SQL — 3.",
        tables: [{ caption: "группы", cols: ["s.name", "a.id"], rows: [["SQL", 1], ["SQL", 2], ["SQL", 4], ["BPMN", 1], ["Python", 2]], cls: ["hl-a", "hl-a", "hl-a", "hl-b", "hl-c"] },
                 { caption: "после GROUP BY", cols: ["skill", "vacancies"], rows: [["SQL", 3], ["BPMN", 1], ["Python", 1]], cls: ["hl-a", "hl-b", "hl-c"] }] },
      { title: "Доля, HAVING и RANK", mark: "HAVING count(*) >= 2", text: "share_pct = count / 3 аналитиков. HAVING фильтрует ГРУППЫ после агрегации (WHERE так не умеет — он работает до группировки). BPMN и Python отброшены: 1 упоминание — шум. RANK даёт место; при равенстве счёта места одинаковые.",
        tables: [{ caption: "результат", cols: ["skill", "vacancies", "share_pct", "place"], rows: [["SQL", 3, "100.0", 1], ["BPMN", 1, "33.3", 2], ["Python", 1, "33.3", 2]], cls: ["new", "dim", "dim"], cells: [[0, 2]] }] },
    ],
    why: "<b>Почему знаменатель — все аналитики, а не «аналитики с навыками»:</b> иначе доля отвечала бы на вопрос «среди тех, где навыки указаны», и была бы завышена. <b>Почему count(*), а не count(DISTINCT vacancy_id):</b> PK связи гарантирует, что дублей нет, DISTINCT лишь замедлил бы запрос. <b>Почему HAVING, а не WHERE:</b> условие на результат агрегата count(*) можно проверить только после группировки.",
    mistakes: ["LEFT JOIN вместо JOIN: вакансии без навыков дали бы строку с навыком NULL, и в топе появилась бы строка «NULL».", "Знаменатель через count(*) того же запроса: это число связей, а не вакансий — доли получатся не те.", "GROUP BY s.name без s.id: если у двух навыков одинаковое отображаемое имя, они склеятся. Группируем по ключу."],
  },
  {
    id: "rownum", tab: "ROW_NUMBER (q2)", title: "Медиана зарплаты: ROW_NUMBER выбирает первую версию вакансии",
    question: "Какую зарплату предлагали при первой публикации, и какова медиана по месяцу?",
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
      { title: "История версий", mark: "", text: "У вакансии 1 две версии (зарплату подняли), у вакансии 2 — две (зарплату добавили позже), у вакансии 3 — одна. Нужна зарплата ПЕРВОЙ версии каждой вакансии.",
        tables: [{ caption: "vacancy_snapshot", cols: ["vacancy_id", "valid_from", "salary", "currency"], rows: [[1, "03-02", 150000, "RUR"], [1, "03-20", 160000, "RUR"], [2, "03-05", null, null], [2, "04-01", 120000, "RUR"], [3, "03-10", 200000, "RUR"]] }] },
      { title: "PARTITION BY: окна", mark: "PARTITION BY s.vacancy_id", text: "Оконная функция делит строки на окна (partition) — здесь по vacancy_id. Каждое окно подсвечено своим цветом. В отличие от GROUP BY, строки НЕ схлопываются: функция дописывает значение к каждой строке.",
        tables: [{ caption: "окна по vacancy_id", cols: ["vacancy_id", "valid_from", "salary"], rows: [[1, "03-02", 150000], [1, "03-20", 160000], [2, "03-05", null], [2, "04-01", 120000], [3, "03-10", 200000]], cls: ["hl-a", "hl-a", "hl-b", "hl-b", "hl-c"] }] },
      { title: "ORDER BY + ROW_NUMBER: номер внутри окна", mark: "ROW_NUMBER() OVER (PARTITION BY s.vacancy_id ORDER BY s.valid_from) AS version_no", text: "Внутри каждого окна строки упорядочены по valid_from и пронумерованы с 1. Номер начинается заново в каждом окне. Без ORDER BY номер был бы случайным — «первая» версия могла бы оказаться любой.",
        tables: [{ caption: "+ version_no", cols: ["vacancy_id", "valid_from", "salary", "version_no"], rows: [[1, "03-02", 150000, 1], [1, "03-20", 160000, 2], [2, "03-05", null, 1], [2, "04-01", 120000, 2], [3, "03-10", 200000, 1]], cls: ["hl-a", "hl-a", "hl-b", "hl-b", "hl-c"], cells: [[0, 3], [2, 3], [4, 3]] }] },
      { title: "WHERE version_no = 1", mark: "WHERE f.version_no = 1", text: "Оставляем только первые версии. Фильтровать по оконной функции можно только во внешнем запросе: WHERE выполняется раньше, чем оконные функции, поэтому нужен CTE.",
        tables: [{ caption: "первые версии", cols: ["vacancy_id", "salary", "version_no"], rows: [[1, 150000, 1], [1, 160000, 2], [2, null, 1], [2, 120000, 2], [3, 200000, 1]], cls: ["", "dim", "", "dim", ""] }] },
      { title: "JOIN currency отсекает NULL", mark: "JOIN currency c ON c.code = f.currency_code", text: "У первой версии вакансии 2 зарплаты не было (currency = NULL). JOIN не находит пару для NULL, и строка выпадает. Это намеренно: медиана считается по вакансиям с зарплатой. Но запомните: зарплату, добавленную позже (120 000), мы не учитываем — это цена выбора «первой версии».",
        tables: [{ caption: "после JOIN currency", cols: ["vacancy_id", "salary"], rows: [[1, 150000], [2, null], [3, 200000]], cls: ["", "dim", ""] }] },
      { title: "Медиана", mark: "percentile_cont(0.5) WITHIN GROUP (ORDER BY salary)", text: "Осталось два числа: 150 000 и 200 000. Медиана — значение посередине упорядоченного ряда. Если чисел чётное количество, percentile_cont берёт среднее двух средних: (150 000 + 200 000) / 2 = 175 000. Существует percentile_disc — он вернул бы одно из реальных значений (150 000).",
        tables: [{ caption: "результат", cols: ["median_salary", "avg_salary"], rows: [[175000, 175000]], cls: ["new"] },
                 { caption: "а если добавить «директора»", cols: ["salaries", "median", "avg"], rows: [["150 000, 200 000, 900 000", "200 000", "416 667"]], cells: [[0, 1], [0, 2]] }] },
    ],
    why: "<b>Почему первая, а не текущая версия:</b> если в октябре подняли зарплату мартовской вакансии, мартовская точка не должна «переехать». <b>Почему медиана:</b> одна высокая зарплата сдвигает среднее, медиана устойчива (вторая таблица на последнем шаге). <b>Почему ROW_NUMBER, а не min(valid_from) + JOIN:</b> ROW_NUMBER за один проход берёт целую строку; через min пришлось бы второй раз соединять таблицу с собой.",
    mistakes: ["ORDER BY в окне забыли → «первая» версия случайная, результат меняется от запуска к запуску.", "WHERE ROW_NUMBER() … = 1 в том же SELECT → ошибка: оконные функции считаются после WHERE.", "RANK вместо ROW_NUMBER: две версии с одинаковым valid_from получат обе номер 1 — вакансия посчитается дважды (у нас это запрещает UNIQUE(vacancy_id, valid_from))."],
  },
  {
    id: "lag", tab: "LAG (q3)", title: "Как часто обновляют вакансию: LAG смотрит на предыдущую строку",
    question: "Сколько раз меняли вакансии работодателя и что именно меняли?",
    file: "sql/queries/q3_employers_activity.sql",
    sql: `SELECT vacancy_id, valid_from, salary_to,
       LAG(valid_from) OVER w AS prev_valid_from,
       LAG(salary_to)  OVER w AS prev_salary_to
FROM vacancy_snapshot
WINDOW w AS (PARTITION BY vacancy_id ORDER BY valid_from);
-- затем: count(*) FILTER (WHERE prev_valid_from IS NOT NULL) AS updates
--        count(*) FILTER (WHERE salary_to IS DISTINCT FROM prev_salary_to) AS salary_changes`,
    steps: [
      { title: "Версии двух вакансий", mark: "", text: "Вакансия 7: три версии. Вакансия 8: одна версия (ни разу не менялась).",
        tables: [{ caption: "vacancy_snapshot", cols: ["vacancy_id", "valid_from", "salary_to"], rows: [[7, "05-01", null], [7, "05-15", 150000], [7, "06-01", 150000], [8, "05-03", 90000]] }] },
      { title: "Окно и LAG", mark: "LAG(valid_from) OVER w AS prev_valid_from", text: "LAG(x) — значение x из ПРЕДЫДУЩЕЙ строки того же окна. У первой строки окна предыдущей нет → NULL. WINDOW w AS (…) — имя для окна, чтобы не повторять его для каждого LAG.",
        tables: [{ caption: "+ prev_*", cols: ["vacancy_id", "valid_from", "salary_to", "prev_valid_from", "prev_salary_to"], rows: [[7, "05-01", null, null, null], [7, "05-15", 150000, "05-01", null], [7, "06-01", 150000, "05-15", 150000], [8, "05-03", 90000, null, null]], cls: ["hl-a", "hl-a", "hl-a", "hl-b"], cells: [[1, 3], [2, 3]] }] },
      { title: "Считаем обновления", mark: "", text: "Обновление = версия, у которой есть предыдущая (prev_valid_from IS NOT NULL). Первая версия — публикация, а не обновление. У вакансии 7 два обновления, у 8 — ноль. Дни между обновлениями: 14 и 17.",
        tables: [{ caption: "updates", cols: ["vacancy_id", "updates", "avg_days_between"], rows: [[7, 2, "15.5"], [8, 0, null]] }] },
      { title: "Ловушка: <> против IS DISTINCT FROM", mark: "", text: "Изменилась ли зарплата во второй версии (NULL → 150 000)? Выражение 150000 <> NULL даёт не TRUE, а NULL — и строка не попадёт в count(*) FILTER. IS DISTINCT FROM считает NULL обычным значением и отвечает TRUE.",
        tables: [{ caption: "сравнение", cols: ["salary_to", "prev", "x <> prev", "x IS DISTINCT FROM prev"], rows: [[150000, null, "NULL (!)", "TRUE"], [150000, 150000, "FALSE", "FALSE"], [null, null, "NULL", "FALSE"]], cells: [[0, 2], [0, 3]] }] },
    ],
    why: "<b>Почему LAG, а не self-join (s1 JOIN s2 ON s2.n = s1.n + 1):</b> для self-join нужен номер версии, а потом второй проход по таблице. LAG делает то же за один проход. <b>Почему IS DISTINCT FROM:</b> NULL в SQL означает «неизвестно», а «неизвестно ≠ 150 000» — тоже «неизвестно».",
    mistakes: ["Окно без PARTITION BY: LAG возьмёт предыдущую строку ДРУГОЙ вакансии, и «обновлений» станет больше.", "Считать первую версию обновлением: тогда у каждой вакансии минимум одно «обновление».", "Сравнение через <> — изменения «NULL → значение» потеряются."],
  },
  {
    id: "antijoin", tab: "LEFT JOIN … IS NULL (q5)", title: "Новые вакансии: LEFT JOIN и проверка на NULL",
    question: "Какие вакансии впервые появились за последние 7 дней?",
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
      { title: "Данные и «сегодня»", mark: "SELECT max(as_of) - INTERVAL '7 days' AS window_start", text: "«Сегодня» = момент последней успешной загрузки (10-30), начало окна — 10-23. Берём из load_run, а не now(): запрос воспроизводим на фикстурах.",
        tables: [{ caption: "vacancy", cols: ["id", "hh_id", "first_seen_at"], rows: [[1, "A", "10-25"], [2, "B", "10-28"], [3, "C", "09-15"], [4, "D", "10-29"]] },
                 { caption: "vacancy_snapshot", cols: ["id", "vacancy_id", "valid_from"], rows: [[11, 1, "10-25"], [12, 2, "08-01"], [13, 2, "10-28"], [14, 3, "09-15"], [15, 4, "10-29"]] }] },
      { title: "Фильтр по first_seen_at", mark: "WHERE v.first_seen_at >= p.window_start", text: "Вакансию C мы увидели в сентябре — она точно не новая.",
        tables: [{ caption: "vacancy", cols: ["id", "hh_id", "first_seen_at"], rows: [[1, "A", "10-25"], [2, "B", "10-28"], [3, "C", "09-15"], [4, "D", "10-29"]], cls: ["", "", "dim", ""] }] },
      { title: "LEFT JOIN с ранними версиями", mark: "LEFT JOIN vacancy_snapshot prior", text: "Ищем у каждой вакансии версии, начавшиеся ДО окна. LEFT JOIN сохраняет вакансию, даже если пары нет — тогда поля prior заполнены NULL. Вакансию B мы впервые увидели 10-28 (например, загрузку запустили впервые), но её версия от 08-01 показывает, что опубликована она давно.",
        tables: [{ caption: "v LEFT JOIN prior", cols: ["v.id", "hh_id", "prior.id", "prior.valid_from"], rows: [[1, "A", null, null], [2, "B", 12, "08-01"], [4, "D", null, null]], cls: ["hl-c", "hl-b", "hl-c"], cells: [[0, 2], [2, 2]] }] },
      { title: "WHERE prior.id IS NULL", mark: "AND prior.id IS NULL", text: "Оставляем строки, где пары НЕ нашлось. Это anti-join: «вакансии, для которых не существует ранней версии». Итог: A и D.",
        tables: [{ caption: "результат", cols: ["hh_id", "name"], rows: [["A", "…"], ["B", "…"], ["D", "…"]], cls: ["new", "dim", "new"] }] },
    ],
    why: "<b>Почему условие на valid_from в ON, а не в WHERE:</b> в WHERE оно отбросило бы строки с NULL — и LEFT JOIN превратился бы в обычный JOIN. Это самая частая ошибка с LEFT JOIN. <b>Альтернатива:</b> WHERE NOT EXISTS (SELECT 1 FROM vacancy_snapshot …) — тот же смысл; PostgreSQL строит для обоих одинаковый план (Anti Join). <b>Почему две проверки новизны:</b> first_seen_at говорит, когда увидели МЫ, а ранние версии — когда опубликовали.",
    mistakes: ["Условие prior.valid_from < window_start перенесли в WHERE → результат всегда пустой.", "NOT IN (SELECT vacancy_id …) вместо NOT EXISTS: если в подзапросе встретится NULL, NOT IN вернёт пустой результат.", "INNER JOIN с employer: вакансии анонимов (employer_id IS NULL) пропадут из списка новых."],
  },
  {
    id: "islands", tab: "Gaps and islands (q6)", title: "Нанимают 3+ месяца подряд: приём «пропуски и острова»",
    question: "Какие компании публикуют вакансии 3 и более месяцев подряд?",
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
      { title: "Активные месяцы", mark: "", text: "Компания А нанимала в марте, апреле, мае, июле, августе (июнь пропущен). Компания Б — май, июнь. Задача: найти непрерывные серии («острова») и их длину.",
        tables: [{ caption: "active_months", cols: ["employer", "month"], rows: [["А", "2026-03"], ["А", "2026-04"], ["А", "2026-05"], ["А", "2026-07"], ["А", "2026-08"], ["Б", "2026-05"], ["Б", "2026-06"]] }] },
      { title: "Номер месяца на ровной шкале", mark: "extract(year FROM month) * 12 + extract(month FROM month) AS month_no", text: "Год × 12 + месяц: соседние месяцы отличаются ровно на 1, даже на стыке декабря и января. Даты так не работают: в месяцах разное число дней.",
        tables: [{ caption: "+ month_no", cols: ["employer", "month", "month_no"], rows: [["А", "2026-03", 24315], ["А", "2026-04", 24316], ["А", "2026-05", 24317], ["А", "2026-07", 24319], ["А", "2026-08", 24320], ["Б", "2026-05", 24317], ["Б", "2026-06", 24318]] }] },
      { title: "ROW_NUMBER по порядку", mark: "ROW_NUMBER() OVER (PARTITION BY employer_id ORDER BY month) AS rn", text: "Нумеруем месяцы каждой компании подряд: 1, 2, 3… — без пропусков.",
        tables: [{ caption: "+ rn", cols: ["employer", "month", "month_no", "rn"], rows: [["А", "2026-03", 24315, 1], ["А", "2026-04", 24316, 2], ["А", "2026-05", 24317, 3], ["А", "2026-07", 24319, 4], ["А", "2026-08", 24320, 5], ["Б", "2026-05", 24317, 1], ["Б", "2026-06", 24318, 2]], cls: ["hl-a", "hl-a", "hl-a", "hl-a", "hl-a", "hl-d", "hl-d"] }] },
      { title: "Разность = номер острова", mark: "month_no - rn", text: "Внутри непрерывной серии month_no и rn растут на 1 одновременно — разность постоянна. Пропуск июня увеличил month_no на 2, а rn на 1 — разность сменилась, начался новый остров.",
        tables: [{ caption: "+ island_id", cols: ["employer", "month", "month_no", "rn", "month_no − rn"], rows: [["А", "2026-03", 24315, 1, 24314], ["А", "2026-04", 24316, 2, 24314], ["А", "2026-05", 24317, 3, 24314], ["А", "2026-07", 24319, 4, 24315], ["А", "2026-08", 24320, 5, 24315], ["Б", "2026-05", 24317, 1, 24316], ["Б", "2026-06", 24318, 2, 24316]], cls: ["hl-a", "hl-a", "hl-a", "hl-b", "hl-b", "hl-c", "hl-c"], cells: [[0, 4], [3, 4]] }] },
      { title: "GROUP BY по острову, HAVING ≥ 3", mark: "GROUP BY employer_id, month_no - rn", text: "Каждая группа — один остров. Его длина — count(*). HAVING оставляет острова от 3 месяцев: у А март–май.",
        tables: [{ caption: "острова", cols: ["employer", "start", "end", "streak_months"], rows: [["А", "2026-03", "2026-05", 3], ["А", "2026-07", "2026-08", 2], ["Б", "2026-05", "2026-06", 2]], cls: ["new", "dim", "dim"] }] },
    ],
    why: "<b>Почему этот приём, а не цикл в Python:</b> он решает задачу одним проходом сортировки в базе, без выгрузки данных. <b>Почему DISTINCT в active_months:</b> 5 вакансий в марте — это один активный месяц; без DISTINCT rn посчитал бы март пять раз и острова «порвались» бы. <b>Почему «месяц создания вакансии»:</b> это определение активности, которое легко посчитать и объяснить. Альтернатива — «в месяце была открыта хотя бы одна вакансия», тогда острова будут длиннее.",
    mistakes: ["Забыли DISTINCT по месяцам: три вакансии в марте дают три строки марта с одинаковым month_no, но rn = 1, 2, 3. Разности получаются разными, и серия «рвётся» там, где пропуска нет.", "Используют дату вместо номера месяца: date − rn дней даёт разные значения внутри серии.", "Коррелированный подзапрос для «всего активных месяцев»: на 300 тыс. вакансий запрос шёл 4 с (см. docs/query_plans). Оконный count(*) OVER — 0,14 с."],
  },
  {
    id: "nulls", tab: "NULL в агрегатах", title: "NULL в AVG и COUNT: почему ответы расходятся",
    question: "Какая средняя зарплата, если у половины вакансий она не указана?",
    file: "sql/queries/q4_no_salary_by_region.sql",
    sql: `SELECT count(*)                  AS all_rows,
       count(salary)             AS with_salary,
       avg(salary)               AS avg_known,
       avg(COALESCE(salary, 0))  AS avg_as_zero,
       sum(salary) / count(*)    AS sum_div_all,
       avg((salary IS NULL)::int) AS share_without
FROM t;`,
    steps: [
      { title: "Данные", mark: "", text: "Четыре вакансии, у двух зарплата не указана (NULL).",
        tables: [{ caption: "t", cols: ["id", "salary"], rows: [[1, 100000], [2, null], [3, 200000], [4, null]] }] },
      { title: "count(*) против count(salary)", mark: "count(salary)", text: "count(*) считает строки. count(колонка) — только строки, где колонка НЕ NULL.",
        tables: [{ caption: "", cols: ["all_rows", "with_salary"], rows: [[4, 2]], cells: [[0, 1]] }] },
      { title: "avg пропускает NULL", mark: "avg(salary)", text: "avg(salary) = (100 000 + 200 000) / 2 = 150 000. NULL не участвует ни в сумме, ни в количестве. Это «средняя зарплата среди вакансий, где она указана».",
        tables: [{ caption: "", cols: ["avg_known"], rows: [[150000]], cells: [[0, 0]] }] },
      { title: "COALESCE(salary, 0) — ошибка смысла", mark: "avg(COALESCE(salary, 0))", text: "«Не указано» превратилось в «0 рублей». Среднее упало вдвое: 75 000. sum/count(*) даёт то же самое. Запрос корректный синтаксически, но отвечает на бессмысленный вопрос.",
        tables: [{ caption: "", cols: ["avg_as_zero", "sum_div_all"], rows: [[75000, 75000]], cls: ["dim"] }] },
      { title: "Доля NULL через avg по условию", mark: "avg((salary IS NULL)::int)", text: "(salary IS NULL)::int — 1 для «нет зарплаты», 0 для «есть». Среднее от единиц и нулей = доля единиц: 0,5. Этот приём используется в q4.",
        tables: [{ caption: "", cols: ["share_without"], rows: [["0.50"]], cls: ["new"] }] },
    ],
    why: "<b>Правило:</b> перед любым агрегатом спросите себя, что значит NULL в этой колонке. Для зарплаты NULL = «не указано», а не «ноль». Поэтому в проекте медиана считается только по вакансиям с зарплатой, а рядом всегда показано, на скольких вакансиях она посчитана.",
    mistakes: ["COALESCE(salary, 0) «чтобы не было NULL» — занижает среднее.", "count(salary) вместо count(*) в знаменателе доли «без зарплаты» → деление «без зарплаты» на «с зарплатой».", "sum(a) + sum(b) vs sum(a + b): если в строке b = NULL, a + b = NULL, и строка выпадает из второй суммы целиком."],
  },
];
