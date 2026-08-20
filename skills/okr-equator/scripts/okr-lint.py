#!/usr/bin/env python3
"""Структурный линтер для экватор-<quarter>.md.

Проверяет: обязательные разделы присутствуют, PBV в диапазоне 1-9 (или
маркер неопределённости), статус — из допустимого enum (или маркер
неопределённости). Ничего не проверяет по содержанию — только структуру.
"""
import re
import sys

REQUIRED_HEADERS = [
    r"^## Главное за 60 секунд",
    r"^# Часть 1\.",
    r"^# Часть 2\.",
    r"^## Системные риски квартала",
    r"^## Открытые вопросы",
]

ALLOWED_STATUSES = {"Выполнено", "В работе", "На паузе", "В ожидании", "Отменено"}
UNCERTAIN_MARKERS = {"уточнить у po", "[уточнить у po]", "уточнить", "—", "-", ""}


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


def parse_tables(text):
    """Возвращает список (header_cells, [row_cells, ...]) для каждой markdown-таблицы."""
    tables = []
    lines = text.splitlines()
    i = 0
    sep_re = re.compile(r"^\s*\|?[\s:|-]+\|?\s*$")

    def is_row(candidate):
        return "|" in candidate and candidate.strip() != ""

    while i < len(lines):
        line = lines[i]
        if is_row(line) and i + 1 < len(lines) and lines[i + 1].strip() != "" and sep_re.match(lines[i + 1]):
            header = [c.strip() for c in line.strip().strip("|").split("|")]
            rows = []
            j = i + 2
            while j < len(lines) and is_row(lines[j]):
                rows.append([c.strip() for c in lines[j].strip().strip("|").split("|")])
                j += 1
            tables.append((header, rows))
            i = j
        else:
            i += 1
    return tables


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


def lint(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return check_headers(text) + check_pbv_and_status(text)


def main():
    if len(sys.argv) != 2:
        print("Usage: okr-lint.py <path-to-экватор.md>", file=sys.stderr)
        sys.exit(2)
    errors = lint(sys.argv[1])
    if errors:
        print(f"НЕ ПРОШЁЛ: {len(errors)} ошибок")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print("OK")
    sys.exit(0)


if __name__ == "__main__":
    main()
