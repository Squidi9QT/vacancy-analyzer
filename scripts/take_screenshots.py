"""Скриншоты сайта-объяснения для README: python scripts/take_screenshots.py"""

from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "explainer" / "index.html").as_uri()
OUT = ROOT / "docs" / "screenshots"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 860}, device_scale_factor=1.5,
                                color_scheme="light")
        page.goto(URL)
        page.add_style_tag(content="html { scroll-behavior: auto !important; }")

        page.click("#mapSvg .node[data-id='load']")
        page.locator("#map").screenshot(path=str(OUT / "01_map.png"))

        page.click("#erSvg .er-table[data-id='vacancy_snapshot']")
        page.locator(".er-wrap").screenshot(path=str(OUT / "02_er.png"))

        page.click("#upSeg button[data-m='change']")
        page.locator("#upView").screenshot(path=str(OUT / "03_upsert.png"))

        page.click("#sqlTabs button >> nth=4")
        for _ in range(3):
            page.click("#sqlLesson [data-a='next']")
        page.locator("#sqlLesson .lesson-grid").screenshot(path=str(OUT / "04_sql_lesson.png"))

        page.locator("#card-salary").screenshot(path=str(OUT / "05_salary_chart.png"))
        page.locator("#card-heatmap").screenshot(path=str(OUT / "06_heatmap.png"))

        page.click("#quizList .quiz >> nth=6 >> .opt >> nth=0")
        page.locator("#quizList .quiz >> nth=6").screenshot(path=str(OUT / "07_quiz.png"))

        mobile = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                                  color_scheme="dark")
        mobile.goto(URL)
        mobile.add_style_tag(content="html { scroll-behavior: auto !important; }")
        mobile.evaluate("window.scrollTo(0, document.getElementById('sql').offsetTop - 60)")
        mobile.wait_for_timeout(300)
        mobile.screenshot(path=str(OUT / "08_mobile_dark.png"))
        browser.close()
    print("Скриншоты:", OUT)


if __name__ == "__main__":
    main()
