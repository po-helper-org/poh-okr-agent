#!/usr/bin/env python3
"""Roadmap: md-файлы → проверка и граф зависимостей → html.

  roadmap.py lint  <папка>          проверить md, записать <папка>/roadmap.json
  roadmap.py tree  <папка>          дерево с номерами, файлами и зависимостями
  roadmap.py build <папка> [-o файл] проверить и собрать <папка>/roadmap.html

Источник истины — <папка>/roadmap.md (паспорт: роли, выходные, треки, этапы,
целевые состояния) и <папка>/backlog/*.md (задачи своего трека, по файлу на
задачу). Формат — resources/format.md. Только стандартная библиотека Python 3.
Одинаковые md — байт в байт одинаковые roadmap.json и roadmap.html.
"""
import base64
import datetime as dt
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, 'assets')

STATUSES = ['Открыт', 'В работе', 'Заблокировано', 'Выполнено']
STATUS_ALIAS = {
    'открыт': 'Открыт', 'открыто': 'Открыт', 'to do': 'Открыт', 'todo': 'Открыт', 'новая': 'Открыт',
    'в работе': 'В работе', 'in progress': 'В работе',
    'заблокировано': 'Заблокировано', 'заблокирован': 'Заблокировано', 'blocked': 'Заблокировано',
    'выполнено': 'Выполнено', 'готово': 'Выполнено', 'done': 'Выполнено',
}
TYPE_ALIAS = {
    '': '', 'task': '', 'задача': '', 't': '',
    'milestone': 'ms', 'веха': 'ms', 'ms': 'ms',
    'blocker': 'bl', 'блокер': 'bl', 'блокатор': 'bl', 'bl': 'bl',
}
DEFAULT_ROLES = [
    ('PO', 'Product Owner', '#c98a00'), ('SA', 'Системный аналитик', '#3b6fd4'),
    ('BE', 'Backend', '#8a4fd1'), ('FE', 'Frontend', '#17a2b8'),
    ('DEVOPS', 'DevOps', '#d9622b'), ('DELIVERY', 'Delivery', '#c0407a'),
]
UNNUMBERED = re.compile(r'^[\s!\-]*(БЛОКАТОР|ВОПРОС|ЖДЕМ|ВЛИЯЕТ|РИСК)', re.I)
REF = re.compile(r'\{#([^}]+)\}')
ID_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.\-]*$')
RESERVED_ID = re.compile(r'^(m\d+_-?\d+|mg-?\d+)$')
FEAT_RE = re.compile(r'^\d+(\.\d+)*$')
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TASK_KEYS = {'id', 'title', 'status', 'role', 'type', 'stage', 'parent', 'parent_task_id', 'ordinal',
             'start', 'start_date', 'end', 'end_date', 'due_date', 'date', 'progress', 'dependencies',
             'customer', 'assignee', 'approver', 'short', 'labels', 'created_date', 'updated_date',
             'milestone', 'priority', 'reporter', 'feature'}


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, where, msg):
        self.errors.append(f'{where}: {msg}' if where else msg)

    def warn(self, where, msg):
        self.warnings.append(f'{where}: {msg}' if where else msg)


# ---------------------------------------------------------------- parsing

def read(path):
    with open(path, encoding='utf-8') as f:
        return f.read().replace('\r\n', '\n').replace('\r', '\n')


def unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
        q, v = v[0], v[1:-1]
        v = v.replace("''", "'") if q == "'" else v.replace('\\"', '"')
    return v


def split_list(v):
    v = v.strip()
    if v.startswith('[') and v.endswith(']'):
        v = v[1:-1]
    return [unquote(x) for x in v.split(',') if unquote(x)]


def front_matter(text):
    """YAML-подмножество: `ключ: значение`, списки `[a, b]` и блоком `- a`."""
    m = re.match(r'^---\n(.*?)\n---[ \t]*(?:\n|$)', text, re.S)
    if not m:
        return None, text
    fields, key = {}, None
    for line in m.group(1).split('\n'):
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        item = re.match(r'^\s+-\s*(.*)$', line)
        if item and key is not None:
            if not isinstance(fields[key], list):
                fields[key] = []
            fields[key].append(unquote(item.group(1)))
            continue
        kv = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$', line)
        if not kv:
            key = None
            continue
        key, val = kv.group(1), kv.group(2).strip()
        val = re.sub(r'\s+#.*$', '', val) if not val.startswith(('"', "'")) else val
        fields[key] = split_list(val) if val.startswith('[') else unquote(val)
    return fields, text[m.end():]


def sections(text, level):
    """[(заголовок, тело)] по заголовкам заданного уровня; первым — текст до них."""
    mark = '#' * level + ' '
    out, head, buf = [], None, []
    for line in text.split('\n'):
        if line.startswith(mark):
            out.append((head, '\n'.join(buf)))
            head, buf = line[len(mark):].strip(), []
        else:
            buf.append(line)
    out.append((head, '\n'.join(buf)))
    return out


def bullets(body):
    return [m.group(1).strip() for m in re.finditer(r'^\s*[-*]\s+(.+)$', body, re.M)]


def parse_date(v):
    v = (v or '').strip()
    if not v:
        return None
    if not DATE_RE.match(v):
        raise ValueError(v)
    return dt.date.fromisoformat(v)


def monday(d):
    return d - dt.timedelta(days=d.weekday())


def yes(v):
    return (v or '').strip().lower() in ('да', 'yes', 'true', '1', 'свой')


def parse_passport(path, rep):
    """roadmap.md → паспорт."""
    where = os.path.basename(path)
    text = read(path)
    fm, body = front_matter(text)
    fm = fm or {}
    rm = {'title': fm.get('title') or 'Roadmap', 'start': None, 'roles': [], 'holidays': [],
          'global': [], 'tracks': []}
    if fm.get('start'):
        try:
            rm['start'] = parse_date(fm['start'])
        except ValueError:
            rep.err(where, f'start: дата не в формате ГГГГ-ММ-ДД — «{fm["start"]}»')
    for head, sec in sections(body, 2)[1:]:
        h = head.lower()
        if h.startswith('роли'):
            for b in bullets(sec):
                parts = [p.strip() for p in b.split('|')]
                if not re.match(r'^[A-Z][A-Z0-9_]*$', parts[0]):
                    rep.err(where, f'Роли: ключ роли — латиница в верхнем регистре, «{parts[0]}»')
                    continue
                color = parts[2] if len(parts) > 2 else ''
                if color and not re.match(r'^#[0-9a-fA-F]{6}$', color):
                    rep.err(where, f'Роли: цвет {parts[0]} — #rrggbb, «{color}»')
                    color = ''
                rm['roles'].append({'key': parts[0], 'sub': parts[1] if len(parts) > 1 else parts[0],
                                    'color': color})
        elif h.startswith('выходн'):
            for b in bullets(sec):
                a, _, z = b.partition('..')
                try:
                    d1 = parse_date(a)
                    d2 = parse_date(z) if z else d1
                except ValueError as e:
                    rep.err(where, f'Выходные: дата не в формате ГГГГ-ММ-ДД — «{e}»')
                    continue
                rm['holidays'].append((d1, d2))
        elif h.startswith('целевые состояния'):
            rm['global'] += parse_states(sec, where + ': Целевые состояния цели', rep, ranged=True)
        elif re.match(r'^трек\s+\d+', h):
            tr = parse_track(head, sec, where, rep)
            if tr:
                rm['tracks'].append(tr)
        else:
            rep.warn(where, f'раздел «{head}» сборкой не используется')
    return rm


def parse_states(sec, where, rep, ranged=False):
    out = []
    for b in bullets(sec):
        parts = [p.strip() for p in b.split('|')]
        a, _, z = parts[0].partition('..')
        try:
            d1 = parse_date(a)
            d2 = parse_date(z) if z else d1
        except ValueError as e:
            rep.err(where, f'дата не в формате ГГГГ-ММ-ДД — «{e}»')
            continue
        if d1 is None:
            rep.err(where, f'нет даты — «{b}»')
            continue
        if z and not ranged:
            rep.err(where, f'у целевого состояния трека одна дата, без диапазона — «{b}»')
        short = parts[1] if len(parts) > 1 else ''
        full = parts[2] if len(parts) > 2 and parts[2] else short
        if not short:
            rep.err(where, f'нет текста — «{b}»')
            continue
        out.append({'from': d1, 'to': d2, 'short': short, 'text': full})
    return out


def parse_track(head, sec, where, rep):
    m = re.match(r'^[Тт]рек\s+(\d+)\s*[.:]?\s*(.*)$', head)
    n, name = int(m.group(1)), m.group(2).strip()
    w = f'{where}: Трек {n}'
    if not name:
        rep.err(w, 'нет названия')
    tr = {'n': n, 'name': name, 'own': False, 'num': '', 'result': '', 'plan': {}, 'states': [], 'stages': [], 'features': []}
    parts = sections(sec, 3)
    for b in bullets(parts[0][1]):
        k, _, v = b.partition(':')
        k = k.strip().lower()
        if k == 'свой':
            tr['own'] = yes(v)
        elif k == 'нумерация':
            tr['num'] = v.strip()
            if tr['num'] and not re.match(r'^\d+(\.\d+)*$', tr['num']):
                rep.err(w, f'нумерация — число или 3.1, «{tr["num"]}»')
        else:
            rep.warn(w, f'параметр «{k}» не используется')
    for h3, body in parts[1:]:
        hl = h3.lower()
        if hl.startswith('результат'):
            tr['result'] = body.strip()
        elif hl.startswith('план'):
            for b in bullets(body):
                role, _, spans = b.partition(':')
                role = role.strip()
                for sp in [s.strip() for s in spans.split(',') if s.strip()]:
                    a, _, z = sp.partition('..')
                    try:
                        d1, d2 = parse_date(a), parse_date(z or a)
                    except ValueError as e:
                        rep.err(w, f'План по ролям: дата не в формате ГГГГ-ММ-ДД — «{e}»')
                        continue
                    if d1 is None or d2 is None:
                        rep.err(w, f'План по ролям: пустой интервал у {role}')
                        continue
                    if d2 < d1:
                        rep.err(w, f'План по ролям: {role} {sp} — конец раньше начала')
                        continue
                    tr['plan'].setdefault(role, []).append((d1, d2))
        elif hl.startswith('целевые состояния'):
            tr['states'] = parse_states(body, w + ': Целевые состояния', rep)
        elif hl.startswith('этапы'):
            for b in bullets(body):
                sid, _, title = b.partition(':')
                sid, title = sid.strip().strip('`'), title.strip()
                if not ID_RE.match(sid) or not title:
                    rep.err(w, f'Этапы: строка «- <id>: <название>», «{b}»')
                    continue
                tr['stages'].append({'id': sid, 'title': title})
        elif hl.startswith('фичи'):
            for b in bullets(body):
                code, _, title = b.partition(':')
                code, title = code.strip().strip('`'), title.strip()
                if not FEAT_RE.match(code) or not title:
                    rep.err(w, f'Фичи: строка «- <код>: <название>», код — 1.2.3, «{b}»')
                    continue
                tr['features'].append({'code': code, 'title': title})
        else:
            rep.warn(w, f'подраздел «{h3}» сборкой не используется')
    return tr


def parse_task(path, rel, rep):
    text = read(path)
    fm, body = front_matter(text)
    if fm is None:
        rep.err(rel, 'нет frontmatter (--- … ---) в начале файла')
        return None
    for k in fm:
        if k not in TASK_KEYS:
            rep.warn(rel, f'поле «{k}» не используется')
    t = {'file': rel, 'raw': fm}
    t['id'] = (fm.get('id') or '').strip()
    t['title'] = (fm.get('title') or '').strip()
    if not t['id']:
        rep.err(rel, 'нет id')
        return None
    if not ID_RE.match(t['id']) or RESERVED_ID.match(t['id']):
        rep.err(rel, f'id «{t["id"]}» — латиница, цифры, «-», «_», «.»; не m<N>_<N> и не mg<N>')
        return None
    if not t['title']:
        rep.err(rel, 'нет title')
    st = (fm.get('status') or 'Открыт').strip()
    t['status'] = STATUS_ALIAS.get(st.lower(), st if st in STATUSES else None)
    if t['status'] is None:
        rep.err(rel, f'status «{st}» — одно из: {", ".join(STATUSES)}')
        t['status'] = 'Открыт'
    ty = (fm.get('type') or '').strip().lower()
    if ty not in TYPE_ALIAS:
        rep.err(rel, f'type «{ty}» — task, milestone или blocker')
        ty = ''
    t['type'] = TYPE_ALIAS[ty]
    t['role'] = (fm.get('role') or '').strip()
    t['stage'] = (fm.get('stage') or '').strip()
    t['parent'] = (fm.get('parent') or fm.get('parent_task_id') or '').strip()
    t['feature'] = str(fm.get('feature') or '').strip()
    o = str(fm.get('ordinal') or '').strip()
    t['ordinal'] = None
    if o:
        try:
            t['ordinal'] = float(o)
        except ValueError:
            rep.err(rel, f'ordinal «{o}» — число')
    dates = {}
    for key, names in (('start', ('start', 'start_date')), ('end', ('end', 'end_date', 'due_date', 'date'))):
        val = next((fm[n] for n in names if fm.get(n)), '')
        try:
            dates[key] = parse_date(val if isinstance(val, str) else '')
        except ValueError:
            rep.err(rel, f'{key}: дата не в формате ГГГГ-ММ-ДД — «{val}»')
            dates[key] = None
    t['start'], t['end'] = dates['start'], dates['end']
    if t['type'] in ('ms', 'bl'):
        if t['start'] and t['end'] and t['start'] != t['end']:
            rep.warn(rel, 'у вехи и блокера одна дата — берётся end')
        t['start'], t['end'] = t['end'] or t['start'], None
    elif t['start'] and t['end'] and t['end'] < t['start']:
        rep.err(rel, f'end {t["end"]} раньше start {t["start"]}')
    elif t['end'] and not t['start']:
        t['start'] = t['end']
    p = str(fm.get('progress') or '').strip().rstrip('%')
    t['progress'] = None
    if p:
        if re.match(r'^\d{1,3}$', p) and int(p) <= 100:
            t['progress'] = int(p)
        else:
            rep.err(rel, f'progress «{p}» — целое 0…100')
    deps = fm.get('dependencies') or []
    t['deps'] = deps if isinstance(deps, list) else split_list(deps)
    for k in ('customer', 'assignee', 'approver', 'short'):
        v = fm.get(k) or ''
        t[k] = ', '.join(v) if isinstance(v, list) else v.strip()
    t['desc'], t['comments'] = task_body(body, rel, rep)
    return t


def task_body(body, rel, rep):
    """Описание — текст до разделов (или раздел Description); раздел «Комментарии» — заметки."""
    body = re.sub(r'<!--\s*SECTION:[^>]*-->', '', body)
    parts = sections(body, 2)
    desc, comments = [parts[0][1].strip()], []
    for head, sec in parts[1:]:
        h = head.lower()
        if h in ('description', 'описание'):
            desc.append(sec.strip())
        elif h.startswith('комментари'):
            for b in bullets(sec):
                m = re.match(r'^(\d{4}-\d{2}-\d{2})\s*[:·—-]\s*(.+)$', b)
                if not m:
                    rep.err(rel, f'Комментарии: строка «- ГГГГ-ММ-ДД: текст», «{b}»')
                    continue
                try:
                    d = parse_date(m.group(1))
                except ValueError:
                    rep.err(rel, f'Комментарии: дата «{m.group(1)}»')
                    continue
                comments.append((d, m.group(2).strip()))
        else:
            desc.append(f'{head}\n{sec.strip()}')
    return '\n\n'.join(x for x in desc if x).strip(), comments


def natural(s):
    return [int(x) if x.isdigit() else x for x in re.split(r'(\d+)', s)]


# ---------------------------------------------------------------- model

def load(folder):
    rep = Report()
    folder = os.path.normpath(folder)
    pp = os.path.join(folder, 'roadmap.md')
    if not os.path.isfile(pp):
        rep.err('', f'нет файла {pp}')
        return None, rep
    rm = parse_passport(pp, rep)
    tasks, bdir = [], os.path.join(folder, 'backlog')
    if os.path.isdir(bdir):
        for name in sorted(os.listdir(bdir)):
            if name.endswith('.md') and not name.startswith('.'):
                t = parse_task(os.path.join(bdir, name), 'backlog/' + name, rep)
                if t:
                    tasks.append(t)
    rm['tasks'] = tasks
    check(rm, rep)
    return rm, rep


def check(rm, rep):
    W = 'roadmap.md'
    if not rm['roles']:
        rm['roles'] = [{'key': k, 'sub': s, 'color': c} for k, s, c in DEFAULT_ROLES]
    palette = [c for _, _, c in DEFAULT_ROLES]
    keys = set()
    for i, r in enumerate(rm['roles']):
        if r['key'] in keys:
            rep.err(W, f'Роли: роль {r["key"]} дважды')
        keys.add(r['key'])
        r['color'] = r['color'] or palette[i % len(palette)]
    if not rm['tracks']:
        rep.err(W, 'нет ни одного раздела «## Трек N. Название»')
    seen = set()
    for tr in rm['tracks']:
        if tr['n'] in seen:
            rep.err(W, f'Трек {tr["n"]} дважды')
        seen.add(tr['n'])
        for role in tr['plan']:
            if role not in keys:
                rep.err(W, f'Трек {tr["n"]}: План по ролям — нет роли {role} в «## Роли»')
        if tr['stages'] and not tr['own']:
            rep.err(W, f'Трек {tr["n"]}: этапы бывают только у своего трека (- свой: да)')
        if tr['features'] and not tr['own']:
            rep.err(W, f'Трек {tr["n"]}: фичи бывают только у своего трека (- свой: да)')
    own = [t for t in rm['tracks'] if t['own']]
    if len(own) > 1:
        rep.err(W, 'свой трек — один: треки ' + ', '.join(str(t['n']) for t in own))
    rm['own'] = own[0] if own else None
    if rm['tasks'] and not own:
        rep.err(W, 'есть задачи в backlog/, но нет своего трека (- свой: да)')
    stages = {}
    titles = set()
    for s in (rm['own'] or {}).get('stages', []):
        if s['id'] in stages:
            rep.err(W, f'Этапы: id {s["id"]} дважды')
        if s['title'] in titles:
            rep.err(W, f'Этапы: название «{s["title"]}» дважды')
        stages[s['id']] = s
        titles.add(s['title'])
    rm['stage_by'] = stages
    feats = {}
    for f in (rm['own'] or {}).get('features', []):
        if f['code'] in feats:
            rep.err(W, f'Фичи: код {f["code"]} дважды')
        feats[f['code']] = f
    for f in feats.values():
        parts = f['code'].split('.')
        f['parent'] = next(('.'.join(parts[:k]) for k in range(len(parts) - 1, 0, -1) if '.'.join(parts[:k]) in feats), '')
        f['depth'] = 0
    for f in feats.values():
        p = f['parent']
        while p:
            f['depth'] += 1
            p = feats[p]['parent']
    rm['feat_by'] = feats

    by = {}
    for t in rm['tasks']:
        if t['id'] in by:
            rep.err(t['file'], f'id {t["id"]} уже есть в {by[t["id"]]["file"]}')
            continue
        by[t['id']] = t
    rm['tasks'] = list(by.values())
    rm['by'] = by
    for t in rm['tasks']:
        w = t['file']
        if not t['role']:
            rep.err(w, 'нет role')
        elif t['role'] not in keys:
            rep.err(w, f'role {t["role"]} нет в «## Роли» ({", ".join(sorted(keys))})')
        if t['stage'] and t['stage'] not in stages:
            rep.err(w, f'stage «{t["stage"]}» нет в «### Этапы» своего трека')
            t['stage'] = ''
        if t['feature'] and t['feature'] not in feats:
            rep.err(w, f'feature «{t["feature"]}» нет в «### Фичи» своего трека')
            t['feature'] = ''
        if t['parent'] and t['parent'] not in by:
            rep.err(w, f'parent «{t["parent"]}» — нет такой задачи')
            t['parent'] = ''
        if t['parent'] == t['id']:
            rep.err(w, 'parent — сама задача')
            t['parent'] = ''
        for ref in REF.findall(t['title']):
            if ref not in by:
                rep.err(w, f'title: ссылка {{#{ref}}} — нет такой задачи')
        if t['progress'] == 100 and t['status'] != 'Выполнено':
            rep.warn(w, 'progress 100, а status не «Выполнено»')
        if t['type'] == 'ms' and not t['start']:
            rep.warn(w, 'веха без даты — на шкале её не будет')
    # parent cycles
    for t in rm['tasks']:
        p, seen_p = t['parent'], {t['id']}
        while p:
            if p in seen_p:
                rep.err(t['file'], 'parent образует цикл: ' + ' → '.join(sorted(seen_p)))
                t['parent'] = ''
                break
            seen_p.add(p)
            p = by[p]['parent']
    # stage inherited from the parent
    def root_stage(t, d=0):
        return root_stage(by[t['parent']], d + 1) if t['parent'] and d < 50 else t['stage']
    for t in rm['tasks']:
        s = root_stage(t)
        if t['parent'] and t['stage'] and t['stage'] != s:
            rep.warn(t['file'], f'stage «{t["stage"]}» не совпадает с этапом родителя «{s}» — берётся этап родителя')
        t['eff_stage'] = s
    def root_feat(t, d=0):
        return t['feature'] or (root_feat(by[t['parent']], d + 1) if t['parent'] and d < 50 else '')
    for t in rm['tasks']:
        t['eff_feature'] = root_feat(t)
    order_and_number(rm, rep)
    check_deps(rm, rep)
    check_dates(rm, rep)


def kids_sorted(lst):
    return sorted(lst, key=lambda t: (t['ordinal'] is None, t['ordinal'] or 0, natural(t['id'])))


def order_and_number(rm, rep):
    by, own = rm['by'], rm['own'] or {}
    nb = own.get('num', '')
    children = {}
    for t in rm['tasks']:
        children.setdefault(t['parent'] or ('S:' + t['eff_stage'] if t['eff_stage'] else 'R'), []).append(t)
    for k, lst in children.items():
        seen = {}
        for t in lst:
            if t['ordinal'] is not None:
                if t['ordinal'] in seen:
                    rep.warn(t['file'], f'ordinal {t["ordinal"]:g} совпадает с {seen[t["ordinal"]]} — порядок по id')
                seen[t['ordinal']] = t['id']
    order, num = [], {}

    def numbered(t):
        return t['type'] != 'bl' and not UNNUMBERED.match(t['title'])

    def walk(lst, base):
        k = 0
        for t in kids_sorted(lst):
            n = ''
            if base and numbered(t):
                k += 1
                n = num[t['id']] = f'{base}.{k}'
            order.append(t['id'])
            walk(children.get(t['id'], []), n)

    k, root_order, snum = 0, [], {}
    for t in kids_sorted(children.get('R', [])):
        n = ''
        if nb and numbered(t):
            k += 1
            n = num[t['id']] = f'{nb}.{k}'
        order.append(t['id'])
        root_order.append(t['id'])
        walk(children.get(t['id'], []), n)
    for s in own.get('stages', []):
        lst = children.get('S:' + s['id'], [])
        if not lst:
            rep.warn('roadmap.md', f'Этап «{s["title"]}» без задач — на странице его не будет')
            continue
        k += 1
        snum[s['id']] = f'{nb}.{k}' if nb else ''
        root_order.append('S:' + s['id'])
        walk(lst, snum[s['id']])
    rm['order'], rm['num'], rm['snum'], rm['root_order'] = order, num, snum, root_order


def label(rm, ref):
    if ref.startswith('stage:'):
        sid = ref[6:]
        s = rm['stage_by'].get(sid)
        return f'этап {rm["snum"].get(sid) or sid}' + (f' «{s["title"]}»' if s else '')
    t = rm['by'].get(ref)
    if not t:
        return ref
    n = rm['num'].get(ref)
    return (n + ' ' if n else '') + '«' + clip(REF.sub(lambda m: rm['num'].get(m.group(1), m.group(1)), t['title']), 60) + '»'


def clip(s, n):
    return s if len(s) <= n else s[:n - 1] + '…'


def stage_members(rm, sid):
    return [t['id'] for t in rm['tasks'] if t['eff_stage'] == sid]


def check_deps(rm, rep):
    by = rm['by']
    for t in rm['tasks']:
        good = []
        for d in t['deps']:
            d = d.strip()
            if d.lower().startswith('stage:'):
                sid = d[6:].strip()
                if sid not in rm['stage_by']:
                    rep.err(t['file'], f'dependencies: нет этапа «{sid}»')
                    continue
                if sid == t['eff_stage']:
                    rep.err(t['file'], f'dependencies: этап «{sid}» — свой этап задачи')
                    continue
                good.append('stage:' + sid)
                continue
            if d not in by:
                rep.err(t['file'], f'dependencies: нет задачи «{d}»')
                continue
            if d == t['id']:
                rep.err(t['file'], 'dependencies: сама задача')
                continue
            if is_desc(by, d, t['id']) or is_desc(by, t['id'], d):
                rep.err(t['file'], f'dependencies: {d} — предок или потомок задачи; зависимость внутри ветки не нужна')
                continue
            good.append(d)
        t['deps'] = list(dict.fromkeys(good))
    # cycles on the expanded graph
    succ = {t['id']: [] for t in rm['tasks']}
    for t in rm['tasks']:
        for d in t['deps']:
            for p in (stage_members(rm, d[6:]) if d.startswith('stage:') else [d]):
                succ[p].append(t['id'])
    color, stack, cycles = {}, [], []

    def dfs(u):
        color[u] = 1
        stack.append(u)
        for v in succ[u]:
            if color.get(v) == 1:
                cycles.append(stack[stack.index(v):] + [v])
            elif not color.get(v):
                dfs(v)
        stack.pop()
        color[u] = 2
    sys.setrecursionlimit(10000)
    for t in sorted(rm['tasks'], key=lambda x: natural(x['id'])):
        if not color.get(t['id']):
            dfs(t['id'])
    for c in cycles:
        rep.err(by[c[0]]['file'], 'цикл зависимостей: ' + ' → '.join(label(rm, x) for x in c))
    rm['succ'] = succ


def is_desc(by, a, root):
    p, n = by[a]['parent'], 0
    while p and n < 60:
        if p == root:
            return True
        p, n = by[p]['parent'], n + 1
    return False


def pred_end(rm, ref):
    ids = stage_members(rm, ref[6:]) if ref.startswith('stage:') else [ref]
    ends = [rm['by'][i]['end'] or rm['by'][i]['start'] for i in ids]
    ends = [e for e in ends if e]
    return max(ends) if ends else None


def check_dates(rm, rep):
    for t in rm['tasks']:
        if not t['start']:
            continue
        for d in t['deps']:
            pe = pred_end(rm, d)
            # веха может стоять в день окончания предшественника; задача — только после
            same_day = t['type'] == 'ms' or (not d.startswith('stage:') and rm['by'][d]['type'] == 'ms')
            if pe and (t['start'] < pe if same_day else t['start'] <= pe):
                rep.warn(t['file'], f'start {t["start"]} не позже, чем закончится {label(rm, d)} ({pe}) — на странице подсветится нарушение')


# ---------------------------------------------------------------- payload

def all_dates(rm):
    out = [d for a, b in rm['holidays'] for d in (a, b)]
    for g in rm['global']:
        out += [g['from'], g['to']]
    for tr in rm['tracks']:
        out += [d for sp in tr['plan'].values() for ab in sp for d in ab]
        out += [s['from'] for s in tr['states']]
    out += [d for t in rm['tasks'] for d in (t['start'], t['end']) if d]
    return out


def payload(rm, folder):
    start = rm['start'] or (min(all_dates(rm)) if all_dates(rm) else None)
    if start is None:
        raise SystemExit('Нет ни одной даты: укажи start: в frontmatter roadmap.md')
    w0 = monday(start)

    def wk(d):
        return (d - w0).days // 7

    by, own = rm['by'], rm['own']
    stitle = {s['id']: s['title'] for s in (own or {}).get('stages', [])}
    items, state, cmts = [], {}, {}
    for tid in rm['order']:
        t = by[tid]
        title = t['title']
        items.append({
            'id': t['id'], 'gid': None, 'file': t['file'], 'name': title, 'title': title, 'short': title,
            'status': t['status'], 'pct': f'{t["progress"]}%' if t['progress'] is not None else '',
            'role': t['role'], 'stage': stitle.get(t['eff_stage']),
            'parent': None, 'pref': t['parent'], 'ty': t['type'], 'num0': rm['num'].get(tid, ''),
            'ft': t['feature'],
        })
        state[tid] = {
            's': t['start'].isoformat() if t['start'] else '', 'e': t['end'].isoformat() if t['end'] else '',
            'r': t['role'], 'st': t['status'], 'p': t['progress'], 'd': t['desc'],
            'cu': t['customer'], 'as': t['assignee'], 'ap': t['approver'],
            'ty': t['type'] or 't', 'sn': t['short'],
            'dep': ['S:' + stitle[d[6:]] if d.startswith('stage:') else d for d in t['deps']],
        }
        for i, (d, text) in enumerate(t['comments']):
            cid = f'md-{tid}-{i + 1}'
            ts = int(dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc).timestamp() * 1000) + i
            cmts[cid] = {'id': cid, 'item': tid, 'text': text, 'ts': ts}
    tracks = []
    for tr in sorted(rm['tracks'], key=lambda x: x['n']):
        tracks.append({
            'n': tr['n'], 'name': tr['name'], 'result': tr['result'],
            'plan': {r: [[wk(a), wk(b)] for a, b in sorted(sp)] for r, sp in tr['plan'].items()},
            'own': tr['own'], 'nb': tr['num'] if tr['own'] else '',
            'ms': [{'w': wk(s['from']), 't': s['text'], 'sn': s['short']} for s in tr['states']],
        })
    hol = sorted({w for a, b in rm['holidays'] for w in range(wk(a), wk(b) + 1)})
    data = {
        'title': rm['title'], 'w0': w0.isoformat(), 'dir': folder.replace(os.sep, '/'),
        'tracks': tracks,
        'roles': [{'key': r['key'], 'name': r['key'], 'sub': r['sub'], 'color': r['color']} for r in rm['roles']],
        'items': items, 'orphans': [],
        'global': [{'w': wk(g['from']), 't': g['text'], 'len': wk(g['to']) - wk(g['from']) + 1, 'sn': g['short']}
                   for g in rm['global']],
        'holiday': hol,
        'stageIds': {v: k for k, v in stitle.items()},
        'features': [{'code': f['code'], 'title': f['title'], 'parent': f['parent'], 'depth': f['depth']}
                     for f in (own or {}).get('features', [])],
    }
    roots = ['S:' + stitle[x[2:]] if x.startswith('S:') else x for x in rm['root_order']]
    seed = {'state': state, 'customs': {}, 'moves': {}, 'orders': {'R': roots} if roots else {}, 'cmts': cmts}
    blob = json.dumps([data, seed], ensure_ascii=False, sort_keys=True)
    stamp = hashlib.sha256(blob.encode('utf-8')).hexdigest()[:12]
    data['stamp'] = seed['stamp'] = stamp
    data['slug'] = re.sub(r'[^A-Za-z0-9_-]+', '-', os.path.basename(os.path.abspath(folder))).strip('-') or 'roadmap'
    return data, seed


def graph(rm):
    out = []
    for tid in rm['order']:
        t = rm['by'][tid]
        out.append({'id': tid, 'num': rm['num'].get(tid, ''), 'file': t['file'], 'title': t['title'],
                    'parent': t['parent'], 'stage': t['eff_stage'], 'feature': t['eff_feature'], 'type': t['type'] or 'task',
                    'status': t['status'], 'role': t['role'],
                    'start': t['start'].isoformat() if t['start'] else '',
                    'end': t['end'].isoformat() if t['end'] else '',
                    'after': t['deps'], 'before': sorted(set(rm['succ'][tid]), key=natural)})
    return out


# ---------------------------------------------------------------- commands

def json_text(o):
    return json.dumps(o, ensure_ascii=False, indent=1) + '\n'


def write(path, text):
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def print_report(rep):
    for e in rep.errors:
        print('ОШИБКА  ' + e)
    for w in rep.warnings:
        print('внимание ' + w)


def cmd_lint(folder, quiet=False):
    rm, rep = load(folder)
    if not quiet:
        print_report(rep)
    if rep.errors or rm is None:
        if not quiet:
            print(f'\nНе принято: ошибок {len(rep.errors)}, предупреждений {len(rep.warnings)}.')
        return None, rep
    stages = {s['id']: {'num': rm['snum'].get(s['id'], ''), 'title': s['title'], 'tasks': stage_members(rm, s['id'])}
              for s in (rm['own'] or {}).get('stages', [])}
    doc = {'about': 'Собрано roadmap.py lint из roadmap.md и backlog/. Не править руками.',
           'title': rm['title'], 'stages': stages, 'tasks': graph(rm), 'warnings': rep.warnings}
    write(os.path.join(folder, 'roadmap.json'), json_text(doc))
    if not quiet:
        dated = sum(1 for t in rm['tasks'] if t['start'])
        edges = sum(len(t['deps']) for t in rm['tasks'])
        print(f'Принято: треков {len(rm["tracks"])}, этапов {len(stages)}, задач {len(rm["tasks"])} '
              f'(со сроками {dated}), зависимостей {edges}, предупреждений {len(rep.warnings)}.')
        feats = rm.get('feat_by') or {}
        if feats:
            used = {t['eff_feature'] for t in rm['tasks'] if t['eff_feature']}
            covered = {c for c in feats if any(u == c or u.startswith(c + '.') for u in used)}
            print(f'Фичи: {len(feats)}, без задач {len(feats) - len(covered)}'
                  + (' — ' + ', '.join(sorted(set(feats) - covered, key=natural)) if len(feats) > len(covered) else '')
                  + f'; задач вне фич {sum(1 for t in rm["tasks"] if not t["eff_feature"])}.')
        print(f'Граф: {os.path.join(folder, "roadmap.json")}')
    return rm, rep


def cmd_tree(folder):
    rm, rep = load(folder)
    print_report(rep)
    if rm is None:
        return 1
    by = rm['by']
    depth = {}
    for tid in rm['order']:
        p = by[tid]['parent']
        depth[tid] = depth[p] + 1 if p else 0
    sid_of = {}
    for s in (rm['own'] or {}).get('stages', []):
        for m in stage_members(rm, s['id']):
            sid_of[m] = s
    cur = None
    for tid in rm['order']:
        t = by[tid]
        s = sid_of.get(tid)
        if s is not cur and s is not None and not t['parent']:
            cur = s
            print(f'\n{rm["snum"].get(s["id"], "")} {s["title"]}  [stage: {s["id"]}]')
        mark = {'ms': '◆ ', 'bl': '⛔ '}.get(t['type'], '')
        ind = '  ' * (depth[tid] + (1 if s else 0))
        dates = f' {t["start"] or ""}..{t["end"] or ""}' if t['start'] else ''
        title = REF.sub(lambda m: rm['num'].get(m.group(1), m.group(1)), t['title'])
        print(f'{ind}{rm["num"].get(tid, "·")} {mark}{clip(title, 70)}  [{t["role"]} · {t["status"]}{dates}]  {t["file"]}')
        if t['deps']:
            print(f'{ind}    после: ' + '; '.join(label(rm, d) for d in t['deps']))
    return 1 if rep.errors else 0


def font_css():
    out = []
    ranges = {'cyrillic': 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
              'latin': 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,'
                       'U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'}
    for fam, pkg in (('IBM Plex Sans', 'ibm-plex-sans'), ('IBM Plex Mono', 'ibm-plex-mono')):
        for w in (400, 500):
            for sub in ('cyrillic', 'latin'):
                p = os.path.join(ASSETS, 'fonts', f'{pkg}-{sub}-{w}-normal.woff2')
                if not os.path.isfile(p):
                    continue
                with open(p, 'rb') as f:
                    b = base64.b64encode(f.read()).decode()
                out.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:swap;"
                           f"src:url(data:font/woff2;base64,{b}) format('woff2');unicode-range:{ranges[sub]}}}")
    return '\n'.join(out)


def script_json(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/').replace('<!--', '<\\!--')


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def render(rm, folder):
    data, seed = payload(rm, folder)
    tpl = read(os.path.join(ASSETS, 'template.html'))
    js = read(os.path.join(ASSETS, 'roadmap.js'))
    html = (tpl.replace('/*__FONTS__*/', font_css())
               .replace('__TITLE__', esc(rm['title']))
               .replace('__DATA__', script_json(data))
               .replace('__SEED__', script_json(seed))
               .replace('/*__SCRIPT__*/', js))
    return html, data


def cmd_build(folder, out=None):
    rm, rep = cmd_lint(folder)
    if rm is None:
        return 1
    html, data = render(rm, folder)
    out = out or os.path.join(folder, 'roadmap.html')
    write(out, html)
    print(f'Собрано: {out} (сборка {data["stamp"]})')
    return 0


def main(argv):
    if len(argv) < 3 or argv[1] not in ('lint', 'tree', 'build'):
        print(__doc__.strip())
        return 2
    folder = argv[2]
    if argv[1] == 'lint':
        rm, _ = cmd_lint(folder)
        return 0 if rm else 1
    if argv[1] == 'tree':
        return cmd_tree(folder)
    out = argv[argv.index('-o') + 1] if '-o' in argv else None
    return cmd_build(folder, out)


if __name__ == '__main__':
    sys.exit(main(sys.argv))
