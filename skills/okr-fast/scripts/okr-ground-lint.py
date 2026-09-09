#!/usr/bin/env python3
"""Гейт грундинга: в документе стадии fast нет слов, которых не было во входе.

    python3 okr-ground-lint.py .okr/2026Q4/OKR-2026Q4-fast.md --source planerka.md --strict

`/okr-fast` — стенографист: единственный его источник это присланный PO текст.
Проверять это самоотчётом бесполезно — у соседнего навыка живой прогон заявил
«ничего не выдумал», имея в документе сущности из чужого примера. Поэтому
проверка машинная: значимые слова документа сверяются со словами входа.

Гейт не про орфографию и не про стиль. Он ловит ровно одно: факт, взявшийся
ниоткуда, — название системы, имя, число, срок, которых PO не называл.
"""
import argparse
import pathlib
import re
import sys

# Слова шаблона: заголовки заготовки, служебные пометки, разметка. Они есть в
# каждом документе по построению и ни о чём не свидетельствуют.
TEMPLATE = {
    'okr', 'obj', 'quarter', 'stage', 'source', 'created', 'подход', 'оценке',
    'результата', 'результат', 'образ', 'план', 'вопросы', 'риски', 'исполнители',
    'уточнить', 'название', 'команда', 'цель', 'цели', 'ключевой', 'ключевые',
    'квартал', 'квартала', 'документ', 'pbv',
}

# Код квартала ставит сама команда (`/okr-fast 2026Q4`), в присланном тексте его
# может не быть вовсе.
QUARTER = re.compile(r'^\d{4}q\d$')

# Служебные части речи и общие слова: их совпадение ничего не доказывает, а
# несовпадение ни о чём не говорит.
STOP = {
    'который', 'которая', 'которые', 'этот', 'эта', 'это', 'эти', 'того', 'тому',
    'чтобы', 'потому', 'также', 'ещё', 'еще', 'если', 'когда', 'нужно', 'надо',
    'может', 'можно', 'будет', 'быть', 'есть', 'нет', 'все', 'всё', 'всех',
    'после', 'перед', 'через', 'между', 'из-за', 'про', 'для', 'над', 'под',
    'без', 'при', 'уже', 'ещё', 'только', 'самый', 'свой', 'своя', 'свои',
}

WORD = re.compile(r'[0-9a-zA-Zа-яёА-ЯЁ][0-9a-zA-Zа-яёА-ЯЁ_-]{2,}')


def tokens(text):
    """Значимые слова: длиннее двух знаков, не служебные, не из шаблона."""
    out = set()
    for match in WORD.finditer(text.lower().replace('ё', 'е')):
        word = match.group(0).strip('-_')
        if len(word) < 3 or word in STOP or word in TEMPLATE or QUARTER.match(word):
            continue
        out.add(word)
    return out


def strip_unclear(text):
    """`[УТОЧНИТЬ: …]` — честная дыра, а не выдумка: её содержимое не проверяем."""
    return re.sub(r'\[УТОЧНИТЬ[^\]]*\]', ' ', text)


def strip_frontmatter(text):
    """Frontmatter — служебная шапка: квартал, стадия, имя PO, дата. Сверять её
    со словами планёрки бессмысленно, эти значения ставит сам навык."""
    if not text.startswith('---'):
        return text
    end = text.find('\n---', 3)
    return text if end == -1 else text[end + 4:]


def stems(words):
    """Грубая нормализация вместо словаря: сравниваем по первым пяти буквам.

    «оформлять» и «оформляет» — одно слово, и ловить их как разные значило бы
    утопить настоящие находки в падежах. Пять букв выбраны как компромисс:
    короче — начинают слипаться разные корни, длиннее — расходятся формы.
    """
    return {word[:5] if len(word) >= 5 else word for word in words}


def main():
    parser = argparse.ArgumentParser(description='Сверка документа fast с присланным текстом')
    parser.add_argument('document')
    parser.add_argument('--source', action='append', default=[],
                        help='файл с присланным текстом; можно несколько раз')
    parser.add_argument('--strict', action='store_true',
                        help='ненулевой код выхода, если нашлось хоть одно слово')
    args = parser.parse_args()

    document = pathlib.Path(args.document)
    if not document.exists():
        print(f'нет файла: {document}', file=sys.stderr)
        return 2
    if not args.source:
        print('нечем сверять: укажите --source с текстом, который прислал PO', file=sys.stderr)
        return 2

    source_words = set()
    missing_sources = []
    for name in args.source:
        path = pathlib.Path(name)
        if not path.exists():
            missing_sources.append(name)
            continue
        source_words |= tokens(path.read_text())

    if missing_sources:
        print('источник не найден: ' + ', '.join(missing_sources), file=sys.stderr)
        return 2

    doc_words = tokens(strip_unclear(strip_frontmatter(document.read_text())))
    known = stems(source_words)
    unknown = sorted(word for word in doc_words
                     if (word[:5] if len(word) >= 5 else word) not in known)

    if not unknown:
        print(f'{document}: слов не из источника нет · сверено {len(doc_words)}')
        return 0

    print(f'{document}: слов не из источника — {len(unknown)}')
    for word in unknown:
        print('  ', word)
    print('\nКаждое — либо факт, которого PO не называл (убрать или заменить на '
          '[УТОЧНИТЬ]), либо синоним вместо его формулировки (вернуть цитату).')
    return 1 if args.strict else 0


if __name__ == '__main__':
    raise SystemExit(main())
