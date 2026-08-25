#!/usr/bin/env python3
"""Структурный линтер артефактов пайплайна OKR.

Понимает два типа документов и сам определяет тип по обязательным маркерам:

* `экватор-<quarter>.md` - обязательные разделы, PBV в диапазоне 1-9,
  статус из допустимого enum (или маркер неопределённости).
* `OKR-<quarter>.md` - двухчастная структура: таблицы Части 1 (точка А,
  Objectives, KR с PBV и точками А/B, дельта), блок Части 2 на каждый KR
  (образ результата, «не входит», HowToDemo с непустой колонкой «Где
  проверяю»), навигация по слоям и история редакций.

Проверяется структура и мехнически решаемые правила формата (запрещённые
процессные формулировки KR, размытые шаги HowToDemo, длинные тире).
Осмысленность формулировок линтер не проверяет - это работа `/okr-debate`.
"""
import re
import sys

# --- экватор ---------------------------------------------------------------

REQUIRED_HEADERS = [
    r"^## Главное за 60 секунд",
    r"^# Часть 1\.",
    r"^# Часть 2\.",
    r"^## Системные риски квартала",
    r"^## Открытые вопросы",
]

ALLOWED_STATUSES = {"Выполнено", "В работе", "На паузе", "В ожидании", "Отменено"}
UNCERTAIN_MARKERS = {"уточнить у po", "[уточнить у po]", "уточнить", "—", "-", ""}

# --- OKR -------------------------------------------------------------------

OKR_REQUIRED_HEADERS = [
    r"^## Навигация по слоям",
    r"^# Часть 1\.",
    r"^## 1\. Точка А",
    r"^## 2\. Objectives",
    r"^## 3\. Key Results",
    r"^## 4\. Дельта и достижимость",
    r"^# Часть 2\.",
    r"^## История редакций",
]

OKR_LAYERS = ["Приёмка", "Порядок работ", "Границы объёма", "Задачи", "Вводные"]

NO_SOURCE_MARKERS = {"оценка", "по ощущениям", "со слов команды", "экспертно", "-", ""}

# Процесс вместо достигнутого состояния. Границы слов обязательны: «исследован»
# не должно ловить «отчёт об исследовании».
KR_PROCESS_BAN = [
    (r"\bзамерен[аоы]?\b", "замерена/замерено - процесс, не состояние"),
    (r"\bпровер(ена|ены|ено)\s+гипотез", "проверена гипотеза - процесс, не состояние"),
    (r"\bнайдена\s+ниша\b", "найдена ниша - процесс, не состояние"),
    (r"\bисследован[аоы]?\b", "исследован - процесс, не состояние"),
    (r"\bпроработан[аоы]?\b", "проработан - процесс, не состояние"),
    (r"\bначата\s+работа\b", "начата работа - процесс, не состояние"),
]

# Только вакуумные формулировки. Шаг «убеждаюсь, что запись легла в Waitlist»
# называет предмет проверки и запрещённым не считается.
DEMO_VAGUE_BAN = [
    r"провер(ить|яю),?\s+что\s+(всё\s+)?работает",
    r"убе(диться|ждаюсь),?\s+в\s+корректност",
    r"убе(диться|ждаюсь),?\s+что\s+(всё\s+)?(работает|ок|корректно|в\s+порядке)",
    r"провер(ить|яю)\s+работоспособност",
    r"\bсмотрю,?\s+что\s+всё\s+(ок|хорошо)\b",
]

LONG_DASHES = {"—": "длинное тире", "–": "среднее тире"}

FENCE_RE = re.compile(r"^\s*(```|~~~)")
UNESCAPED_PIPE = re.compile(r"(?<!\\)\|")


def strip_code_fences(text):
    """Вырезает содержимое ``` и ~~~ блоков, сохраняя нумерацию строк."""
    out = []
    fence = None
    for line in text.splitlines():
        m = FENCE_RE.match(line)
        if fence is None and m:
            fence = m.group(1)
            out.append("")
            continue
        if fence is not None:
            if m and m.group(1) == fence:
                fence = None
            out.append("")
            continue
        out.append(line)
    return "\n".join(out)


def split_row(line):
    """Ячейки строки таблицы. Экранированный \\| остаётся внутри ячейки."""
    cells = UNESCAPED_PIPE.split(line.strip())
    if cells and not cells[0].strip():
        cells = cells[1:]
    if cells and not cells[-1].strip():
        cells = cells[:-1]
    return [c.strip().replace("\\|", "|") for c in cells]


# Only recognizes fully-braced "| cell | cell |" tables (the only style this repo's
# template and fixtures produce) - deliberately not full-GFM-generic, see task-10 review history.
def parse_tables(text):
    """Возвращает список (header_cells, [row_cells, ...]) для каждой markdown-таблицы."""
    tables = []
    lines = text.splitlines()
    i = 0
    sep_re = re.compile(r"^\s*\|[\s:|-]+\|\s*$")

    def is_row(candidate):
        return candidate.strip().startswith("|")

    while i < len(lines):
        line = lines[i]
        if is_row(line) and i + 1 < len(lines) and sep_re.match(lines[i + 1]):
            header = split_row(line)
            rows = []
            j = i + 2
            while j < len(lines) and is_row(lines[j]):
                rows.append(split_row(lines[j]))
                j += 1
            tables.append((header, rows))
            i = j
        else:
            i += 1
    return tables


def find_table(tables, *required_columns):
    """Первая таблица, шапка которой содержит все указанные колонки."""
    want = [c.lower() for c in required_columns]
    for header, rows in tables:
        low = [h.lower() for h in header]
        if all(w in low for w in want):
            return header, rows
    return None


def find_tables(tables, *required_columns):
    want = [c.lower() for c in required_columns]
    return [
        (h, r) for h, r in tables if all(w in [x.lower() for x in h] for w in want)
    ]


def col(header, name):
    low = [h.lower() for h in header]
    return low.index(name.lower()) if name.lower() in low else None


def cell(row, idx):
    return row[idx].strip() if idx is not None and idx < len(row) else ""


def check_headers(text):
    errors = []
    for pattern in REQUIRED_HEADERS:
        if not re.search(pattern, text, re.MULTILINE):
            errors.append(f"Отсутствует обязательный раздел: {pattern}")
    if len(re.findall(r"^## Сводка по цифрам", text, re.MULTILINE)) < 2:
        errors.append(
            "«Сводка по цифрам» должна быть в Части 1 и в Части 2 (найдено < 2 раз)"
        )
    return errors


def check_pbv_and_status(text):
    errors = []
    for header, rows in parse_tables(text):
        pbv_idx = next((k for k, h in enumerate(header) if h.upper() == "PBV"), None)
        status_idx = next((k for k, h in enumerate(header) if h.lower() == "статус"), None)
        for row in rows:
            if pbv_idx is not None and pbv_idx < len(row):
                val = row[pbv_idx].strip()
                if val.lower() not in UNCERTAIN_MARKERS and not re.fullmatch(r"[1-9]", val):
                    errors.append(f"PBV вне диапазона 1-9: {val!r} в строке {row}")
            if status_idx is not None and status_idx < len(row):
                val = row[status_idx].strip()
                if val.lower() not in UNCERTAIN_MARKERS and val not in ALLOWED_STATUSES:
                    errors.append(f"Недопустимый статус: {val!r} в строке {row}")
    return errors


# --- проверки OKR-документа ------------------------------------------------


def check_okr_headers(text):
    return [
        f"Отсутствует обязательный раздел: {p}"
        for p in OKR_REQUIRED_HEADERS
        if not re.search(p, text, re.MULTILINE)
    ]


def check_okr_navigation(tables):
    found = find_table(tables, "слой", "где живёт")
    if not found:
        return ["Нет таблицы навигации по слоям «Слой | Где живёт | Что там»"]
    header, rows = found
    idx = col(header, "слой")
    present = {cell(r, idx).lower() for r in rows}
    return [
        f"В навигации по слоям нет слоя «{layer}»"
        for layer in OKR_LAYERS
        if layer.lower() not in present
    ]


def check_okr_point_a(tables):
    found = find_table(tables, "показатель", "значение", "источник")
    if not found:
        return ["Нет таблицы точки А «Показатель | Значение | Источник»"]
    header, rows = found
    errors = []
    if not rows:
        errors.append("Таблица точки А пуста")
    src = col(header, "источник")
    for row in rows:
        value = cell(row, col(header, "показатель"))
        source = cell(row, src)
        if source.lower() in NO_SOURCE_MARKERS:
            errors.append(
                f"Точка А, «{value}»: источник {source!r} не проверяем - "
                "нужен путь к файлу или команда"
            )
    return errors


def check_okr_objectives(tables):
    found = find_table(tables, "objective", "образ результата")
    if not found:
        return ["Нет таблицы Objectives «# | Objective | Образ результата»"]
    header, rows = found
    errors = [] if rows else ["Таблица Objectives пуста"]
    img = col(header, "образ результата")
    num = col(header, "#")
    for row in rows:
        if not cell(row, img):
            errors.append(f"Objective {cell(row, num)!r}: пустой образ результата")
    return errors


def check_okr_key_results(tables):
    kr_tables = find_tables(tables, "kr", "формулировка", "pbv", "точка а", "точка b")
    if not kr_tables:
        return [], [
            "Нет ни одной таблицы Key Results "
            "«KR | Формулировка | PBV | Точка А | Точка B»"
        ]
    errors = []
    codes = []
    for header, rows in kr_tables:
        c_kr = col(header, "kr")
        c_text = col(header, "формулировка")
        c_a = col(header, "точка а")
        c_b = col(header, "точка b")
        for row in rows:
            code = cell(row, c_kr)
            text = cell(row, c_text)
            if not re.fullmatch(r"\d+\.\d+", code):
                errors.append(f"Код KR не в формате <objective>.<kr>: {code!r}")
            elif code in codes:
                errors.append(f"Код KR встречается дважды: {code}")
            else:
                codes.append(code)
            if not cell(row, c_a):
                errors.append(f"KR {code}: пустая точка А")
            if not cell(row, c_b):
                errors.append(f"KR {code}: пустая точка B")
            for pattern, why in KR_PROCESS_BAN:
                if re.search(pattern, text, re.IGNORECASE):
                    errors.append(f"KR {code}: запрещённая формулировка ({why}): {text!r}")
    return codes, errors


def check_okr_delta(tables, kr_codes):
    found = find_table(tables, "kr", "дельта", "требуемый темп", "наблюдаемый темп")
    if not found:
        return [
            "Нет таблицы «KR | Дельта | Требуемый темп | Наблюдаемый темп | Оценка»"
        ]
    header, rows = found
    errors = []
    c_kr = col(header, "kr")
    c_obs = col(header, "наблюдаемый темп")
    seen = [cell(r, c_kr) for r in rows]
    for code in kr_codes:
        if code not in seen:
            errors.append(f"KR {code} есть в Части 1, но не в таблице дельты")
    for code in seen:
        if code not in kr_codes:
            errors.append(f"KR {code} есть в таблице дельты, но не в таблицах Key Results")
    for row in rows:
        if not cell(row, c_obs):
            errors.append(
                f"KR {cell(row, c_kr)}: пустой наблюдаемый темп - "
                "если наблюдения нет, пиши «нет наблюдения»"
            )
    return errors


def check_okr_part1_tables_only(text):
    part1 = re.search(r"^# Часть 1\.", text, re.MULTILINE)
    part2 = re.search(r"^# Часть 2\.", text, re.MULTILINE)
    if not part1 or not part2:
        return []
    body = text[part1.end() : part2.start()]
    bad = [
        h.strip()
        for h in re.findall(r"^#{2,}.*$", body, re.MULTILINE)
        if re.search(r"\bKR\b\s*\d", h)
    ]
    return [
        f"Часть 1 должна быть в таблицах, найден заголовок на отдельный KR: {h!r}"
        for h in bad
    ]


def check_okr_part2(text, kr_codes):
    part2 = re.search(r"^# Часть 2\.", text, re.MULTILINE)
    if not part2:
        return []
    tail = text[part2.end() :]
    hist = re.search(r"^## История редакций", tail, re.MULTILINE)
    if hist:
        tail = tail[: hist.start()]
    blocks = re.split(r"^## KR\s+", tail, flags=re.MULTILINE)[1:]
    errors = []
    seen = []
    for block in blocks:
        code = block.split(None, 1)[0].strip() if block.split() else "?"
        seen.append(code)
        if "**Образ результата.**" not in block:
            errors.append(f"KR {code}: в Части 2 нет блока «**Образ результата.**»")
        if not re.search(r"не\s+вход(ит|ят)", block, re.IGNORECASE):
            errors.append(f"KR {code}: в образе результата не сказано, что НЕ входит")
        if "**HowToDemo**" not in block:
            errors.append(f"KR {code}: в Части 2 нет блока «**HowToDemo**»")
            continue
        demo = find_table(parse_tables(block), "шаг", "что делаю", "где проверяю")
        if not demo:
            errors.append(
                f"KR {code}: HowToDemo не таблица «Шаг | Что делаю | Где проверяю»"
            )
            continue
        header, rows = demo
        if not rows:
            errors.append(f"KR {code}: таблица HowToDemo пуста")
        c_step = col(header, "шаг")
        c_what = col(header, "что делаю")
        c_where = col(header, "где проверяю")
        for row in rows:
            step = cell(row, c_step)
            if not cell(row, c_where):
                errors.append(
                    f"KR {code}, шаг {step}: пустая колонка «Где проверяю» - "
                    "нужен путь, команда или экран"
                )
            what = cell(row, c_what)
            for pattern in DEMO_VAGUE_BAN:
                if re.search(pattern, what, re.IGNORECASE):
                    errors.append(
                        f"KR {code}, шаг {step}: размытый шаг, не называет место: {what!r}"
                    )
    for code in kr_codes:
        if code not in seen:
            errors.append(f"KR {code} есть в Части 1, но блока в Части 2 нет")
    for code in seen:
        if code not in kr_codes:
            errors.append(f"KR {code}: блок в Части 2 есть, а в таблицах Части 1 нет")
    return errors


def check_okr_history(tables):
    found = find_table(tables, "редакция", "дата", "что заменено", "причина замены")
    if not found:
        return [
            "Нет таблицы истории редакций "
            "«Редакция | Дата | Что заменено | Причина замены»"
        ]
    header, rows = found
    if not rows:
        return ["Таблица истории редакций пуста - у первой версии тоже есть строка"]
    errors = []
    c_num = col(header, "редакция")
    c_why = col(header, "причина замены")
    for row in rows:
        if not cell(row, c_why):
            errors.append(f"Редакция {cell(row, c_num)}: не указана причина замены")
    return errors


def check_okr_dashes(text):
    errors = []
    for line_no, line in enumerate(text.splitlines(), 1):
        for char, name in LONG_DASHES.items():
            if char in line:
                errors.append(f"Строка {line_no}: {name} - в OKR только короткий дефис")
                break
    return errors


def check_okr_row_widths(text):
    errors = []
    for header, rows in parse_tables(text):
        for row in rows:
            if len(row) != len(header):
                errors.append(
                    f"Строка таблицы не совпадает по числу колонок "
                    f"({len(row)} вместо {len(header)}) - вероятно, "
                    f"неэкранированный «|» в ячейке: {row}"
                )
    return errors


def check_okr(text):
    tables = parse_tables(text)
    kr_codes, kr_errors = check_okr_key_results(tables)
    return (
        check_okr_headers(text)
        + check_okr_navigation(tables)
        + check_okr_point_a(tables)
        + check_okr_objectives(tables)
        + kr_errors
        + check_okr_delta(tables, kr_codes)
        + check_okr_part1_tables_only(text)
        + check_okr_part2(text, kr_codes)
        + check_okr_history(tables)
        + check_okr_row_widths(text)
        + check_okr_dashes(text)
    )


def check_equator(text):
    return check_headers(text) + check_pbv_and_status(text)


# --- диспетчер -------------------------------------------------------------


def detect_type(text):
    if re.search(r"^## Навигация по слоям", text, re.MULTILINE) or re.search(
        r"^## История редакций", text, re.MULTILINE
    ):
        return "okr"
    if re.search(r"^## Главное за 60 секунд", text, re.MULTILINE):
        return "equator"
    return None


def lint(path, doc_type=None):
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    text = strip_code_fences(raw)
    kind = doc_type or detect_type(text)
    if kind is None:
        return "?", [
            "Не удалось определить тип документа: нет ни «## Главное за 60 секунд» "
            "(экватор), ни «## Навигация по слоям» (OKR). Укажи тип явно: "
            "--type okr|equator"
        ]
    if kind == "okr":
        return kind, check_okr(text)
    return kind, check_equator(text)


def main():
    argv = sys.argv[1:]
    doc_type = None
    if len(argv) >= 2 and argv[0] == "--type":
        doc_type = argv[1]
        argv = argv[2:]
        if doc_type not in ("okr", "equator"):
            print(f"Неизвестный тип документа: {doc_type}", file=sys.stderr)
            sys.exit(2)
    if len(argv) != 1:
        print(
            "Usage: okr-lint.py [--type okr|equator] <path-to-OKR-или-экватор.md>",
            file=sys.stderr,
        )
        sys.exit(2)
    kind, errors = lint(argv[0], doc_type)
    label = {"okr": "OKR-документ", "equator": "экватор", "?": "тип не определён"}[kind]
    if errors:
        print(f"НЕ ПРОШЁЛ ({label}): {len(errors)} ошибок")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print(f"OK ({label})")
    sys.exit(0)


if __name__ == "__main__":
    main()
