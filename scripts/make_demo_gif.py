"""Анимированное превью сайта для README: python scripts/make_demo_gif.py"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "explainer" / "index.html").as_uri()
OUT = ROOT / "docs" / "screenshots" / "demo.gif"
W, H = 1100, 700


def main() -> None:
    frames: list[tuple[Image.Image, int]] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": W, "height": H}, color_scheme="light")
        page.goto(URL)
        page.add_style_tag(content="html { scroll-behavior: auto !important; } .sidebar { display: none; } main { margin-left: 0 !important; }")

        def show(selector: str, offset: int = 70) -> None:
            page.evaluate(f"window.scrollTo(0, document.querySelector('{selector}').getBoundingClientRect().top + window.scrollY - {offset})")

        def grab(ms: int) -> None:
            img = Image.open(io.BytesIO(page.screenshot())).convert("RGB")
            frames.append((img, ms))

        show("#mapSvg", 150)
        grab(1200)
        page.click("#animBtn")
        for _ in range(26):
            page.wait_for_timeout(700)
            grab(700)

        show("#sqlLesson", 10)
        page.click("#sqlTabs button >> nth=4")
        show("#sqlLesson", 10)
        grab(1500)
        for _ in range(4):
            page.click("#sqlLesson [data-a='next']")
            grab(1800)

        show("#upSeg", 120)
        for mode in ("first", "repeat", "change"):
            page.click(f"#upSeg button[data-m='{mode}']")
            grab(2000)

        show("#card-salary", 10)
        box = page.locator("#chSalary svg .hit").bounding_box()
        for fx in (0.15, 0.45, 0.7, 0.95):
            page.mouse.move(box["x"] + box["width"] * fx, box["y"] + box["height"] * 0.5)
            grab(1100)

        page.mouse.move(0, 0)
        show("#card-heatmap", 10)
        grab(2200)
        browser.close()

    small = [img.resize((W * 3 // 4, H * 3 // 4), Image.LANCZOS)
             .quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for img, _ in frames]
    small[0].save(OUT, save_all=True, append_images=small[1:], duration=[ms for _, ms in frames],
                  loop=0, optimize=True, disposal=1)
    print(f"{OUT}: {len(frames)} кадров, {OUT.stat().st_size // 1024} КБ")


if __name__ == "__main__":
    main()
