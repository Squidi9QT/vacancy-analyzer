"""Отчёт: выполняет SQL из sql/queries/, сохраняет CSV и PNG в reports/,
а результаты — в explainer/data.js для сайта-объяснения.

Почему SQL в файлах, а pandas только «на выходе»: вся логика расчёта — в SQL,
который можно проверить в psql. pandas здесь только превращает строки в таблицу
для графика. Так у каждой цифры одна точка правды.

Палитра — эталонная проверенная палитра (первые три категориальных цвета
различимы при всех видах дальтонизма), последовательная шкала — один оттенок синего.
"""

from __future__ import annotations

import json
import logging
import math
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import matplotlib

matplotlib.use("Agg")  # рисуем в файл, окно не нужно (работает и на сервере без экрана)
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402

from src.config import PROJECT_ROOT  # noqa: E402
from src.load.db import connect  # noqa: E402

log = logging.getLogger(__name__)

QUERIES = PROJECT_ROOT / "sql" / "queries"
REPORTS = PROJECT_ROOT / "reports"
EXPLAINER_DATA = PROJECT_ROOT / "explainer" / "data.js"

# Роли → цвет, порядок фиксирован (цвет следует за сущностью, а не за местом в рейтинге)
ROLE_LABELS = {"system_analyst": "Системный аналитик", "data_analyst": "Аналитик данных",
               "backend_junior": "Junior backend"}
ROLE_COLORS = {"system_analyst": "#2a78d6", "data_analyst": "#eb6834", "backend_junior": "#1baf7a"}
SURFACE, INK, INK_2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
BLUE_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"]


def run_sql(conn, name: str) -> pd.DataFrame:
    """Выполнить sql/queries/<name>.sql и вернуть DataFrame.

    Ошибка: исключение psycopg с текстом ошибки SQL (например, если схема не создана).
    Почему не pd.read_sql: он официально поддерживает только SQLAlchemy и пишет
    предупреждение для «голого» соединения psycopg. Собрать DataFrame самим — 2 строки.
    """
    with conn.cursor() as cur:
        cur.execute((QUERIES / f"{name}.sql").read_text(encoding="utf-8"))
        cols = [d.name for d in cur.description]
        rows = cur.fetchall()
    df = pd.DataFrame(rows, columns=cols)
    # Decimal (тип NUMERIC из PostgreSQL) → float, иначе matplotlib и JSON спотыкаются
    for col in df.columns:
        if df[col].map(lambda x: isinstance(x, Decimal)).any():
            df[col] = df[col].astype(float)
    return df


def wilson_interval(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95 % доверительный интервал для доли k/n (метод Уилсона).

    Зачем: «в Томске 49 % без зарплаты, в Казани 39 %» — различие или случайность?
    При 41 вакансии в Казани одна вакансия меняет долю на 2,4 п.п. Если интервалы
    двух городов сильно перекрываются, говорить о различии рано.
    Почему Уилсон, а не «p ± 1.96·√(p(1−p)/n)»: простая формула врёт на малых n
    и долях около 0 или 1 (может дать интервал меньше нуля).
    """
    if n == 0:
        return 0.0, 0.0
    p = k / n
    denom = 1 + z ** 2 / n
    center = (p + z ** 2 / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z ** 2 / (4 * n ** 2)) / denom
    return max(0.0, center - half), min(1.0, center + half)


def _style(ax, title: str, subtitle: str) -> None:
    """Общий вид: тихая сетка, без рамки сверху/справа, заголовок + подзаголовок."""
    ax.set_facecolor(SURFACE)
    ax.figure.set_facecolor(SURFACE)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.tick_params(colors=INK_2, labelsize=9)
    ax.figure.text(0.01, 0.97, title, fontsize=13, fontweight="bold", color=INK, va="top")
    ax.figure.text(0.01, 0.915, subtitle, fontsize=9, color=INK_2, va="top")


def chart_top_skills(df: pd.DataFrame, path: Path) -> None:
    """Горизонтальные столбцы: длинные названия навыков читаются без поворота."""
    top = df.head(15).iloc[::-1]
    fig, ax = plt.subplots(figsize=(8, 6))
    ax.barh(top["skill"], top["share_pct"], color="#2a78d6", height=0.65)
    for y, (pct, n) in enumerate(zip(top["share_pct"], top["vacancies"])):
        ax.text(pct + 0.8, y, f"{pct:.0f} % ({n})", va="center", fontsize=8, color=INK_2)
    ax.set_xlabel("Доля вакансий аналитиков, где упомянут навык, %", color=INK_2, fontsize=9)
    ax.xaxis.grid(True, color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    ax.set_xlim(0, top["share_pct"].max() * 1.18)
    _style(ax, "Топ-15 навыков в вакансиях аналитиков",
           "Системные аналитики + аналитики данных, март–октябрь 2026. В скобках — число вакансий")
    fig.subplots_adjust(top=0.86, left=0.3, right=0.97, bottom=0.09)
    fig.savefig(path, dpi=150)
    plt.close(fig)


def chart_salary_trend(df: pd.DataFrame, path: Path) -> None:
    """Линии: время по оси X, три роли — три линии на ОДНОЙ оси (рубли)."""
    data = df[df["city"] == "Все города"].copy()
    data["month"] = pd.to_datetime(data["month"])
    fig, ax = plt.subplots(figsize=(9, 5))
    for role, label in ROLE_LABELS.items():
        part = data[data["role"] == role].sort_values("month")
        if part.empty:
            continue
        ax.plot(part["month"], part["median_salary"] / 1000, color=ROLE_COLORS[role], linewidth=2,
                marker="o", markersize=5, label=label)
    ax.yaxis.grid(True, color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    ax.set_ylim(0, data["median_salary"].max() / 1000 * 1.15)
    ax.set_ylabel("Медиана, тыс. ₽ на руки", color=INK_2, fontsize=9)
    ax.xaxis.set_major_formatter(matplotlib.dates.DateFormatter("%m.%Y"))
    ax.legend(frameon=False, fontsize=8, loc="lower left", labelcolor=INK_2)
    _style(ax, "Медианная зарплата по месяцам публикации",
           "Зарплата первой версии вакансии в ₽ на руки, все города. Ось Y от нуля.\n"
           "Каждая точка — медиана 9–46 вакансий: колебания ±10 % между месяцами — шум, а не тренд")
    fig.subplots_adjust(top=0.82, left=0.08, right=0.97, bottom=0.1)
    fig.savefig(path, dpi=150)
    plt.close(fig)


def chart_no_salary(df: pd.DataFrame, path: Path) -> pd.DataFrame:
    """Столбцы с доверительными интервалами вместо круговой диаграммы.

    Круговая диаграмма отвечает на «из чего состоит целое», а у нас 8 отдельных
    долей, которые нужно СРАВНИТЬ между собой. Длины столбцов сравниваются точнее углов.
    """
    cities = df[df["city"] != "Все города"].sort_values("pct_without_salary").copy()
    total = df[df["city"] == "Все города"].iloc[0]
    ci = [wilson_interval(int(k), int(n)) for k, n in zip(cities["without_salary"], cities["vacancies"])]
    cities["ci_low"] = [100 * lo for lo, _ in ci]
    cities["ci_high"] = [100 * hi for _, hi in ci]
    fig, ax = plt.subplots(figsize=(8, 5))
    y = range(len(cities))
    ax.barh(list(y), cities["pct_without_salary"], color="#2a78d6", height=0.6)
    ax.errorbar(cities["pct_without_salary"], list(y),
                xerr=[cities["pct_without_salary"] - cities["ci_low"], cities["ci_high"] - cities["pct_without_salary"]],
                fmt="none", ecolor=INK, elinewidth=1, capsize=3)
    ax.set_yticks(list(y), [f"{c} (n={n})" for c, n in zip(cities["city"], cities["vacancies"])])
    ax.axvline(total["pct_without_salary"], color=INK_2, linestyle="--", linewidth=1)
    ax.text(total["pct_without_salary"] + 0.5, len(cities) - 0.4, f"все города: {total['pct_without_salary']:.0f} %",
            fontsize=8, color=INK_2)
    ax.set_xlim(0, 100)
    ax.set_xlabel("Вакансий без зарплаты, %  (черта — 95 % доверительный интервал)", color=INK_2, fontsize=9)
    ax.xaxis.grid(True, color=GRID, linewidth=0.6)
    ax.set_axisbelow(True)
    _style(ax, "Доля вакансий без зарплаты по городам",
           "Если интервалы двух городов перекрываются, разница может быть случайной")
    fig.subplots_adjust(top=0.85, left=0.27, right=0.97, bottom=0.11)
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return cities


def chart_heatmap(df: pd.DataFrame, path: Path) -> None:
    """Тепловая карта: два категориальных измерения × одна величина (доля)."""
    pivot = df.pivot(index="skill", columns="city", values="share_pct")
    pivot = pivot.loc[pivot.mean(axis=1).sort_values(ascending=False).index]
    pivot = pivot[pivot.mean(axis=0).sort_values(ascending=False).index]
    cmap = LinearSegmentedColormap.from_list("blue", BLUE_RAMP)
    fig, ax = plt.subplots(figsize=(10, 5.8))
    im = ax.imshow(pivot.values, cmap=cmap, vmin=0, vmax=max(80, pivot.values.max()), aspect="auto")
    ax.set_xticks(range(len(pivot.columns)), pivot.columns, rotation=30, ha="right")
    ax.set_yticks(range(len(pivot.index)), pivot.index)
    for i in range(pivot.shape[0]):
        for j in range(pivot.shape[1]):
            v = pivot.values[i, j]
            ax.text(j, i, f"{v:.0f}", ha="center", va="center", fontsize=8,
                    color="white" if v > 45 else INK)
    cbar = fig.colorbar(im, ax=ax, fraction=0.03)
    cbar.set_label("% вакансий аналитиков в городе", color=INK_2, fontsize=8)
    cbar.outline.set_visible(False)
    _style(ax, "Навыки × города: доля вакансий аналитиков с навыком",
           "Топ-10 навыков; города с 30+ вакансиями аналитиков. Доля, а не число: иначе Москва «победит» везде")
    for spine in ax.spines.values():
        spine.set_visible(False)
    fig.subplots_adjust(top=0.86, left=0.12, right=0.93, bottom=0.17)
    fig.savefig(path, dpi=150)
    plt.close(fig)


def _jsonable(df: pd.DataFrame) -> list[dict]:
    """DataFrame → список словарей для JSON (даты → строки, NaN → null)."""
    out = []
    for rec in df.to_dict(orient="records"):
        clean = {}
        for k, v in rec.items():
            if isinstance(v, (datetime, date, pd.Timestamp)):
                v = v.isoformat()[:10]
            elif isinstance(v, float) and math.isnan(v):
                v = None
            elif hasattr(v, "item"):  # numpy-числа
                v = v.item()
            clean[k] = v
        out.append(clean)
    return out


def build_report(database_url: str) -> None:
    """Построить все отчёты.

    Вход: строка подключения. Выход: файлы в reports/ и explainer/data.js.
    Пустая база — понятное сообщение и выход без графиков (а не стектрейс).
    """
    REPORTS.mkdir(exist_ok=True)
    with connect(database_url) as conn:
        n = conn.execute("SELECT count(*) FROM vacancy").fetchone()[0]
        if n == 0:
            log.warning("В базе нет вакансий — сначала запустите: python -m src.main load --days 7")
            return
        meta = conn.execute(
            # to_char в московском времени: ::text выдал бы время в поясе сессии (+07 на машине разработки)
            """SELECT to_char(max(as_of) AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD HH24:MI "МСК"'), count(*), (SELECT count(*) FROM vacancy_snapshot),
                      (SELECT count(*) FROM employer), (SELECT count(*) FROM skill)
               FROM load_run WHERE status = 'success'""").fetchone()
        names = ["q1_top_skills", "q1b_skills_by_city", "q2_salary_median_by_month", "q3_employers_activity",
                 "q4_no_salary_by_region", "q5_new_last_7_days", "q6_stable_employers"]
        results = {name: run_sql(conn, name) for name in names}

    for name, df in results.items():
        df.to_csv(REPORTS / f"{name}.csv", index=False)
    chart_top_skills(results["q1_top_skills"], REPORTS / "01_top_skills.png")
    chart_salary_trend(results["q2_salary_median_by_month"], REPORTS / "02_salary_trend.png")
    q4 = chart_no_salary(results["q4_no_salary_by_region"], REPORTS / "03_no_salary_by_city.png")
    chart_heatmap(results["q1b_skills_by_city"], REPORTS / "04_skills_city_heatmap.png")

    payload = {
        "meta": {"as_of": meta[0], "load_runs": meta[1], "vacancies": n, "snapshots": meta[2],
                 "employers": meta[3], "skills": meta[4]},
        **{name: _jsonable(df) for name, df in results.items()},
        "q4_ci": _jsonable(q4[["city", "ci_low", "ci_high"]].round(1)),
    }
    EXPLAINER_DATA.write_text(
        "// Сгенерировано командой `python -m src.main report`. Не редактировать вручную.\n"
        "// Обычный <script>, а не fetch('data.json'): так сайт работает при открытии файла без сервера.\n"
        f"window.REPORT_DATA = {json.dumps(payload, ensure_ascii=False)};\n",
        encoding="utf-8")
    log.info("Отчёт готов: %s (графики и CSV), %s", REPORTS, EXPLAINER_DATA)
