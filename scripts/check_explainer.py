"""Проверка сайта-объяснения в headless-браузере (Playwright).

Что проверяет:
  * сайт открывается как файл (file://) — без сервера;
  * в консоли нет ошибок, на странице нет необработанных исключений;
  * все интерактивные элементы срабатывают: анимация, клики по схемам, ETL-демо,
    шаги всех SQL-уроков, поиск в глоссарии, альтернативы ADR, графики, тесты;
  * на ширине телефона (375 px) нет горизонтальной прокрутки страницы.

Запуск: python scripts/check_explainer.py [папка_для_скриншотов]
Код возврата: 0 — всё хорошо, 1 — найдены проблемы.
Нужен Playwright: pip install playwright && python -m playwright install chromium
"""

from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "explainer" / "index.html").as_uri()


def main() -> int:
    shots = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    problems: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda m: problems.append(f"console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.goto(URL)
        page.wait_for_load_state("load")

        counts = page.evaluate("""() => ({
            nav: document.querySelectorAll('#navList a').length,
            mapNodes: document.querySelectorAll('#mapSvg .node').length,
            erTables: document.querySelectorAll('#erSvg .er-table').length,
            sqlTabs: document.querySelectorAll('#sqlTabs button').length,
            glossary: window.CONTENT.glossary.length,
            adr: document.querySelectorAll('#adrList .panel').length,
            charts: document.querySelectorAll('#chartList svg').length,
            pitfalls: document.querySelectorAll('#pitfallList .card').length,
            interview: document.querySelectorAll('#interviewList details').length,
            quiz: document.querySelectorAll('#quizList .quiz').length,
            tasks: document.querySelectorAll('#taskList .panel').length,
        })""")
        print("Элементы:", counts)
        expect = {"nav": 12, "mapNodes": 8, "erTables": 8, "sqlTabs": 6, "adr": 6, "charts": 5}
        for key, val in expect.items():
            if counts[key] != val:
                problems.append(f"{key}: ожидалось {val}, есть {counts[key]}")
        if counts["interview"] < 30:
            problems.append(f"вопросов на собеседовании {counts['interview']} < 30")

        # Карта: клик по блоку и анимация
        page.click("#mapSvg .node[data-id='transform']")
        assert "Transform" in page.inner_text("#mapDetails")
        page.click("#animBtn")
        page.wait_for_function("document.querySelector('#animCaption').textContent.includes('Шаг 2')", timeout=10000)
        # ER: клик по таблице
        page.click("#erSvg .er-table[data-id='vacancy_snapshot']")
        if "SCD тип 2" not in page.inner_text("#erDetails"):
            problems.append("ER: детали vacancy_snapshot не показались")
        # Требования: тренажёр
        page.click("#reqQuiz .opt >> nth=1")
        # ETL
        page.click("#pagSeg button[data-found='2600']")
        page.click("#pagRun")
        page.wait_for_function("document.querySelector('#pagLog').textContent.includes('потеряны')", timeout=15000)
        page.click("#retRun")
        page.wait_for_function("document.querySelector('#retLog').textContent.includes('Успех')", timeout=15000)
        for mode in ("repeat", "change", "plain"):
            page.click(f"#upSeg button[data-m='{mode}']")
        # SQL: все шаги всех уроков
        for i in range(counts["sqlTabs"]):
            page.click(f"#sqlTabs button >> nth={i}")
            while page.is_enabled("#sqlLesson [data-a='next']"):
                page.click("#sqlLesson [data-a='next']")
            title = page.inner_text("#sqlLesson .step-title")
            if "Шаг" not in title:
                problems.append(f"SQL-урок {i}: нет заголовка шага")
            # Если у шага задан фрагмент SQL (mark), он должен быть подсвечен
            has_mark = page.evaluate(f"window.CONTENT.sqlLessons[{i}].steps.at(-1).mark !== ''")
            if has_mark and not page.query_selector("#sqlLesson .sql-code .mark"):
                problems.append(f"SQL-урок {i}: фрагмент SQL последнего шага не найден в тексте запроса")
        # Глоссарий
        page.fill("#glossarySearch", "индекс")
        n = page.evaluate("document.querySelectorAll('#glossaryList .card').length")
        if n < 3:
            problems.append(f"поиск «индекс» нашёл {n} терминов")
        # ADR, графики, собеседование, тест
        page.click("#adrList [data-alt='ADR-003']")
        if page.is_hidden("#alt-ADR-003"):
            problems.append("ADR: альтернатива не раскрылась")
        page.click("#skillSeg button[data-r='data_analyst']")
        page.select_option("#citySel", "Томск")
        page.hover("#chSalary svg .hit")
        if page.is_hidden("#tooltip"):
            problems.append("график зарплат: подсказка при наведении не появилась")
        page.click("#chartList [data-table='heatmap']")
        page.click("#interviewFilters button >> text=Ловушки")
        page.click("#quizList .quiz >> nth=0 >> .opt >> nth=1")
        if "1 из" not in page.inner_text("#quizScore"):
            problems.append("тест: счёт не обновился")
        page.click("#themeToggle")
        if shots:
            shots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(shots / "desktop_dark.png"), full_page=False)
            page.click("#themeToggle")
            page.goto(URL + "#charts")
            page.screenshot(path=str(shots / "desktop_charts.png"), full_page=False)

        # Телефон: нет горизонтальной прокрутки страницы
        mobile = browser.new_page(viewport={"width": 375, "height": 800})
        mobile.on("pageerror", lambda e: problems.append(f"mobile pageerror: {e}"))
        mobile.goto(URL)
        overflow = mobile.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        if overflow > 0:
            wide = mobile.evaluate("""() => [...document.querySelectorAll('main *')]
                .filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1
                             && !e.closest('.tbl-wrap, .map-wrap, .er-wrap, pre, .timeline'))
                .slice(0, 5).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right))""")
            problems.append(f"телефон: горизонтальная прокрутка {overflow}px, виновники: {wide}")
        if shots:
            mobile.screenshot(path=str(shots / "mobile.png"))
        browser.close()

    if problems:
        print("ПРОБЛЕМЫ:")
        for pr in problems:
            print(" -", pr)
        return 1
    print("OK: ошибок в консоли нет, интерактив работает, мобильная вёрстка без горизонтальной прокрутки")
    return 0


if __name__ == "__main__":
    sys.exit(main())
