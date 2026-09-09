#!/usr/bin/env python3
"""Собирает страницу отбора квартала из OKR-<quarter>.md.

    python3 okr-html-export.py .okr/2026Q4/OKR-2026Q4-fast.md [--stage deep] [-o page.html]

Страница — рабочий стол PO: строки KR с PBV и галочкой «в квартал», карточка KR
заметкой по клику, замечание правой кнопкой, промт агенту в правом верхнем углу.
Ничего никуда не отправляет: правда живёт в .md, страница собирает решения PO в
один текст, который он отдаёт агенту.

Вёрстка — та же, что у страницы ревью БФТ: PO ходит по обеим в один день, и
разный визуальный язык для одного действия заставлял бы переучиваться.
"""
import argparse
import html
import json
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
ASSETS = HERE / 'assets'

PBV_OPTIONS = ['—'] + [str(n) for n in range(0, 11)]
NOTE_SECTIONS = ['Подход к оценке результата', 'План', 'Вопросы', 'Риски', 'Исполнители']


def parse_frontmatter(text):
    if not text.startswith('---'):
        return {}, text
    end = text.find('\n---', 3)
    if end == -1:
        return {}, text
    meta = {}
    for line in text[3:end].strip('\n').splitlines():
        if ':' in line:
            key, value = line.split(':', 1)
            meta[key.strip()] = value.strip()
    return meta, text[end + 4:].lstrip('\n')


def parse_document(text):
    """Документ по уровням заголовков: команда → цель → KR → разделы заметки.

    Разбор позиционный, потому что уровни в формате зафиксированы жёстко
    (resources/fast_document.md). Сбитый уровень означает потерянный KR, поэтому
    он попадает в отчёт скрипта, а не молча пропадает.
    """
    meta, body = parse_frontmatter(text)
    doc = {'title': '', 'teams': [], 'notes': {}, 'verdict': {}, 'warnings': []}
    team = None
    obj = None
    kr_id = None
    note_lines = []
    in_verdict = False

    def flush_note():
        nonlocal kr_id, note_lines
        if kr_id is not None:
            doc['notes'][kr_id] = '\n'.join(note_lines).strip()
        kr_id, note_lines = None, []

    def ensure_team():
        nonlocal team
        if team is None:
            team = {'name': '', 'objectives': []}
            doc['teams'].append(team)
        return team

    for line in body.splitlines():
        head = re.match(r'^(#{1,5})\s+(.*)$', line)
        if head:
            level, title = len(head.group(1)), head.group(2).strip()
            if level == 1:
                flush_note()
                doc['title'] = title
                in_verdict = False
                continue
            if level == 2:
                flush_note()
                in_verdict = title.lower().startswith('вердикт')
                if in_verdict:
                    continue
                team = {'name': title, 'objectives': []}
                doc['teams'].append(team)
                continue
            if level == 3:
                flush_note()
                obj = {'title': title, 'krs': []}
                ensure_team()['objectives'].append(obj)
                continue
            if level == 4:
                flush_note()
                match = re.match(r'^KR\s+([\d.]+)\s*[—-]\s*(.*)$', title)
                kr_id = match.group(1) if match else title.split()[0]
                note_lines = []
                continue
            if level == 5:
                note_lines.append('## ' + title)
                continue

        if kr_id is not None:
            note_lines.append(line)
            continue

        if in_verdict:
            row = [cell.strip() for cell in line.strip().strip('|').split('|')] if line.strip().startswith('|') else []
            if len(row) >= 2 and not set(row[0]) <= set('-: '):
                if row[0].upper() != 'KR':
                    doc['verdict'][row[0]] = ' · '.join(cell for cell in row[1:] if cell)
            continue

        row = [cell.strip() for cell in line.strip().strip('|').split('|')] if line.strip().startswith('|') else []
        if len(row) >= 4 and not set(row[0]) <= set('-: '):
            if row[0].upper() == 'KR':
                continue
            if obj is None:
                doc['warnings'].append(f'строка KR «{row[0]}» вне цели — потеряна')
                continue
            obj['krs'].append({'id': row[0], 'title': row[1], 'goal': row[2], 'pbv': row[3]})

    flush_note()
    doc['meta'] = meta
    return doc


def esc(text):
    return html.escape(text or '')


def unclear(text):
    """`[УТОЧНИТЬ: …]` — пробел, ждущий ответа; на странице это красная точка."""
    return bool(re.search(r'\[УТОЧНИТЬ', text or ''))


def render_rows(objective, verdict):
    rows = []
    for kr in objective['krs']:
        pbv = '' if unclear(kr['pbv']) else kr['pbv'].strip()
        options = ''.join(
            f'<option{" selected" if value == (pbv or "—") else ""}>{value}</option>'
            for value in PBV_OPTIONS
        )
        goal = kr['goal'] if not unclear(kr['goal']) else '[УТОЧНИТЬ]'
        note = verdict.get(kr['id'])
        mark = f' title="{esc(note)}"' if note else ''
        rows.append(
            f'<tr class="row" data-kr="{esc(kr["id"])}" data-take="no"'
            + (f' data-verdict="{esc(note)}"' if note else '')
            + '>'
            f'<td class="kr"{mark}>{esc(kr["id"])}</td>'
            f'<td>{esc(kr["title"])}</td>'
            f'<td class="goal">{esc(goal)}</td>'
            f'<td class="pbv"><select data-field="pbv">{options}</select></td>'
            '<td class="take"><input type="checkbox"></td>'
            '</tr>'
        )
    return ''.join(rows)


def build(doc, stage, quarter):
    body, team_items, obj_options = [], [], []
    multi_team = len([t for t in doc['teams'] if t['name']]) > 1
    obj_index = 0

    for team in doc['teams']:
        if multi_team:
            body.append(f'<section class="team" data-team="{esc(team["name"])}">')
            body.append(f'<h2>{esc(team["name"])}</h2>')
            team_items.append((team['name'], sum(len(o['krs']) for o in team['objectives'])))
        for objective in team['objectives']:
            obj_index += 1
            anchor = f'obj-{obj_index}'
            body.append(f'<h3 id="{anchor}">{esc(objective["title"])}</h3>')
            obj_options.append(f'<option value="{anchor}">{esc(objective["title"][:60])}</option>')
            body.append(
                '<div class="table-wrap"><table class="pick">'
                '<colgroup><col class="c-kr"><col><col><col class="c-pbv"><col class="c-take"></colgroup>'
                '<thead><tr><th>KR</th><th>Название</th><th>Образ результата</th>'
                '<th>PBV</th><th>В квартал</th></tr></thead>'
                f'<tbody>{render_rows(objective, doc["verdict"])}</tbody></table></div>'
            )
        if multi_team:
            body.append('</section>')

    rail = ''
    drawer = ''
    if multi_team:
        total = sum(count for _, count in team_items)
        items = [f'<button class="team-item" type="button" data-team="" data-active>Все команды<span class="n">{total}</span></button>']
        items += [
            f'<button class="team-item" type="button" data-team="{esc(name)}">{esc(name)}<span class="n">{count}</span></button>'
            for name, count in team_items
        ]
        rail = ('<div class="rail"><button class="rail-tab team-tab" id="teamTab" type="button">'
                'Команда: <span id="teamNow">все</span></button></div>')
        drawer = ('<div class="drawer" id="teamDrawer">'
                  '<div class="drawer-head"><h4>Команда</h4>'
                  '<button class="drawer-close" data-close="teamDrawer" type="button">×</button></div>'
                  + '\n'.join(items) + '</div>')

    script = (ASSETS / 'page.js').read_text()
    script = re.sub(r'var NOTES = \{.*?\n  \};',
                    lambda m: 'var NOTES = ' + json.dumps(doc['notes'], ensure_ascii=False) + ';',
                    script, flags=re.S)
    script = script.replace('var STORE = "okr-pick-proto:2026Q4";', f'var STORE = "okr-pick:{quarter}";')
    script = script.replace('var QUARTER = "2026Q4";', f'var QUARTER = "{quarter}";')
    script = script.replace('var DOC = ".okr/2026Q4/OKR-2026Q4.md";',
                            f'var DOC = "{doc["meta"].get("source_path", f".okr/{quarter}/OKR-{quarter}.md")}";')
    script = script.replace('var PBV_OPTIONS = ["—","0","1","2","3","4","5","6","7","8","9"];',
                            'var PBV_OPTIONS = ' + json.dumps(PBV_OPTIONS, ensure_ascii=False) + ';')

    teams_script = (ASSETS / 'teams.js').read_text().replace('{{QUARTER}}', quarter) if multi_team else ''

    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(doc["title"] or "OKR " + quarter)}</title>
<!-- Собрано okr-html-export.py из {esc(doc["meta"].get("source_path", "OKR-" + quarter + ".md"))}, стадия {esc(stage)}.
     Страница ничего не пишет: решения PO уезжают промтом агенту. -->
<style>
{(ASSETS / 'page.css').read_text()}
</style>
</head>
<body>

{rail}
{drawer}

<div class="promptbox">
  <button id="panelToggle" type="button">Правки (<span id="cCount">0</span>)</button>
  <div class="panel" id="panel">
    <h4>Что уедет агенту</h4>
    <div id="changeList"><p class="empty">Правок нет.</p></div>
    <textarea id="promptOut" readonly></textarea>
    <button class="copybtn" id="copyBtn" type="button">Скопировать промт</button>
  </div>
</div>

<div class="layout">
<main>
<div class="head"><h1>{esc(doc["title"] or "OKR " + quarter)}</h1></div>
{chr(10).join(body)}
</main>
</div>

<div class="side" id="side">
  <div class="side-head">
    <span class="kr-id" id="sideKr"></span>
    <button class="drawer-close" id="sideClose" type="button">×</button>
  </div>
  <h3 class="side-title" id="sideTitle" contenteditable spellcheck="false"></h3>
  <p class="takeline" id="sideTake"></p>
  <div class="note" id="sideNote" contenteditable spellcheck="false"></div>
  <p class="hintline">Разметка на ходу: <code>#</code> заголовок, <code>-</code> список,
    <code>[]</code> пункт дела, <code>&gt;</code> цитата, <code>---</code> линия. Правки уедут агенту.</p>
</div>

<div class="bar">
  <input type="text" id="addText" placeholder="Новый KR текстом: что должно измениться к концу квартала">
  <select id="addObj">
{chr(10).join(obj_options)}
  </select>
  <button id="addBtn" type="button">Добавить</button>
  <span class="barnote" id="hint"></span>
</div>

<script>
{script}
{teams_script}
</script>
</body>
</html>
'''


def main():
    parser = argparse.ArgumentParser(description='Страница отбора квартала из OKR-<quarter>.md')
    parser.add_argument('document', help='путь к OKR-<quarter>.md или OKR-<quarter>-fast.md')
    parser.add_argument('-o', '--output', help='куда писать (по умолчанию рядом с документом)')
    parser.add_argument('--stage', default='fast', choices=['fast', 'deep'])
    args = parser.parse_args()

    source = pathlib.Path(args.document)
    if not source.exists():
        print(f'нет файла: {source}', file=sys.stderr)
        return 2

    doc = parse_document(source.read_text())
    doc['meta']['source_path'] = str(source)
    quarter = doc['meta'].get('quarter') or (re.search(r'(\d{4}Q\d)', source.name) or [None, quarter_fallback(source)])[1]

    krs = sum(len(o['krs']) for t in doc['teams'] for o in t['objectives'])
    if krs == 0:
        print('в документе не найдено ни одного KR: проверьте уровни заголовков '
              '(# документ, ## команда, ### цель, #### KR)', file=sys.stderr)
        return 1

    target = pathlib.Path(args.output) if args.output else source.with_name(
        f'okr-{quarter}{"-fast" if args.stage == "fast" else ""}.html')
    target.write_text(build(doc, args.stage, quarter))

    for warning in doc['warnings']:
        print('внимание:', warning, file=sys.stderr)
    print(f'{target} · целей {sum(len(t["objectives"]) for t in doc["teams"])} · KR {krs}')
    return 0


def quarter_fallback(source):
    return source.parent.name or 'quarter'


if __name__ == '__main__':
    raise SystemExit(main())
