"""Проверка сайта-объяснения в headless-браузере (Playwright)."""

from __future__ import annotations

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "explainer" / "index.html").as_uri()


TEXT = {
    "ru": {"scd": "SCD тип 2", "lost": "потеряны", "ok": "Успех", "step": "Шаг"},
    "en": {"scd": "SCD type 2", "lost": "lost", "ok": "Success", "step": "Step"},
}


def main() -> int:
    shots = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    problems: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for lang in ("ru", "en"):
            check_lang(browser, lang, problems, shots)
        browser.close()
    if problems:
        print("ПРОБЛЕМЫ:")
        for pr in problems:
            print(" -", pr)
        return 1
    print("OK: оба языка, ошибок в консоли нет, интерактив работает, мобильная вёрстка без горизонтальной прокрутки")
    return 0


def check_lang(browser, lang: str, problems: list[str], shots: Path | None) -> None:
    t = TEXT[lang]
    url = f"{URL}?lang={lang}"
    if True:
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.on("console", lambda m: problems.append(f"[{lang}] console.{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: problems.append(f"[{lang}] pageerror: {e}"))
        page.goto(url)
        page.wait_for_load_state("load")

        counts = page.evaluate("""() => ({
            nav: document.querySelectorAll('#navList a').length,
            mapNodes: document.querySelectorAll('#mapSvg .node').length,
            erTables: document.querySelectorAll('#erSvg .er-table').length,
            sqlTabs: document.querySelectorAll('#sqlTabs button').length,
            adr: document.querySelectorAll('#adrList .panel').length,
            charts: document.querySelectorAll('#chartList svg').length,
            pitfalls: document.querySelectorAll('#pitfallList .card').length,
            stories: document.querySelectorAll('#stories .card').length,
        })""")
        print("Элементы:", counts)
        expect = {"nav": 8, "stories": 8, "mapNodes": 8, "erTables": 8, "sqlTabs": 6, "adr": 6, "charts": 5}
        for key, val in expect.items():
            if counts[key] != val:
                problems.append(f"{key}: ожидалось {val}, есть {counts[key]}")

        page.click("#mapSvg .node[data-id='transform']")
        assert "Transform" in page.inner_text("#mapDetails")
        page.click("#animBtn")
        page.wait_for_function("document.querySelector('#animCaption').textContent.includes('" + t["step"] + " 2')", timeout=10000)
        page.click("#erSvg .er-table[data-id='vacancy_snapshot']")
        if t["scd"] not in page.inner_text("#erDetails"):
            problems.append("ER: детали vacancy_snapshot не показались")
        page.click("#pagSeg button[data-found='2600']")
        page.click("#pagRun")
        page.wait_for_function("document.querySelector('#pagLog').textContent.includes('" + t["lost"] + "')", timeout=15000)
        page.click("#retRun")
        page.wait_for_function("document.querySelector('#retLog').textContent.includes('" + t["ok"] + "')", timeout=15000)
        for mode in ("repeat", "change", "plain"):
            page.click(f"#upSeg button[data-m='{mode}']")
        for i in range(counts["sqlTabs"]):
            page.click(f"#sqlTabs button >> nth={i}")
            while page.is_enabled("#sqlLesson [data-a='next']"):
                page.click("#sqlLesson [data-a='next']")
            title = page.inner_text("#sqlLesson .step-title")
            if t["step"] not in title:
                problems.append(f"SQL-урок {i}: нет заголовка шага")
            has_mark = page.evaluate(f"window.CONTENT.sqlLessons[{i}].steps.at(-1).mark !== ''")
            if has_mark and not page.query_selector("#sqlLesson .sql-code .mark"):
                problems.append(f"SQL-урок {i}: фрагмент SQL последнего шага не найден в тексте запроса")
        page.click("#adrList [data-alt='ADR-003']")
        if page.is_hidden("#alt-ADR-003"):
            problems.append("ADR: альтернатива не раскрылась")
        page.click("#skillSeg button[data-r='data_analyst']")
        page.select_option("#citySel", "Томск")
        page.hover("#chSalary svg .hit")
        if page.is_hidden("#tooltip"):
            problems.append("график зарплат: подсказка при наведении не появилась")
        page.click("#chartList [data-table='heatmap']")
        if lang == "en":
            import re
            body = page.inner_text("main")
            cyr = [w for w in re.findall(r"[А-Яа-яЁё][А-Яа-яЁё ]{2,}", body)]
            allowed = {"Системный аналитик", "Аноним"}
            leftovers = sorted(set(w.strip() for w in cyr) - allowed)
            if leftovers:
                problems.append(f"[en] русский текст на странице: {leftovers[:15]}")
        if shots:
            shots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(shots / f"desktop_{lang}.png"))

        mobile = browser.new_page(viewport={"width": 375, "height": 800})
        mobile.on("pageerror", lambda e: problems.append(f"[{lang}] mobile pageerror: {e}"))
        mobile.goto(url)
        overflow = mobile.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        if overflow > 0:
            problems.append(f"[{lang}] телефон: горизонтальная прокрутка {overflow}px")
        page.close()
        mobile.close()


if __name__ == "__main__":
    sys.exit(main())
