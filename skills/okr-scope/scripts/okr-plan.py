#!/usr/bin/env python3
"""Данные планирования квартала: проверка, HTML-экраны Retro/Scope, выгрузка TeamPlanner.

  okr-plan.py lint <file.json> [--final] [--retro <retro.json>]
  okr-plan.py render <file.json> <out.html>
  okr-plan.py teamplanner <scope.json> <out.csv>

Источник истины — JSON. HTML и CSV всегда пересобираются из него, руками не правятся.
Только стандартная библиотека Python.
"""
import csv
import html
import json
import os
import re
import sys

RESULTS = ["Выполнено", "Частично", "Не выполнено", "Отменено"]
CARRY = ["Продолжение", "Доделка", "Не переносим"]
CARRY_FORWARD = {"Продолжение", "Доделка"}
TAGS = ["", "RESEARCH", "POC", "BUG", "ACTIVITY"]
STATUSES = ["черновик", "принято"]
PHASES = ["scope", "stages"]
DEFAULT_ROLES = ["PO", "SA", "BE", "FE", "ADR"]
QUARTER_RE = re.compile(r"^\d{4}Q[1-4]$")
KR_ID_RE = re.compile(r"^\d+(\.\d+)+$")
UNSURE_RE = re.compile(r"\[УТОЧНИТЬ[^\]\n]*\]")

TEAMPLANNER_COLUMNS = [
    "№", "Программа (OBJ)", "KR", "Инициатива", "PBV", "Тег", "Команды",
    "Этап №", "Роль", "Внешняя команда", "Этап", "Условия", "Риски",
    "Зависимости", "Неопределённости",
    "Ресурс (заполняет техлид)", "Сроки (заполняет техлид)", "Комментарий техлида",
]


def text(value):
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join(text(v) for v in value)
    return str(value).strip()


def unsure(value):
    return bool(UNSURE_RE.search(text(value)))


def pbv_of(item):
    pbv = item.get("pbv")
    return pbv if isinstance(pbv, int) and not isinstance(pbv, bool) else 0


class Report:
    def __init__(self, final):
        self.final = final
        self.errors = []
        self.warnings = []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def gate(self, msg):
        """Не блокирует черновик, но не даёт принять документ."""
        (self.errors if self.final else self.warnings).append(msg)


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def lint_retro(doc, rep):
    for key in ("quarter", "next_quarter"):
        if not QUARTER_RE.match(text(doc.get(key))):
            rep.error(f"{key}: ожидается формат ГГГГQn, получено {doc.get(key)!r}")
    if not text(doc.get("team")):
        rep.gate("team: не указана команда")
    summary = text(doc.get("summary"))
    if not summary:
        rep.gate("summary: нет итога квартала")
    elif unsure(summary):
        rep.gate("summary: остался [УТОЧНИТЬ]")
    objectives = doc.get("objectives") or []
    if not objectives:
        rep.error("objectives: нет ни одной цели прошлого квартала")
    seen = set()
    for obj in objectives:
        oid = text(obj.get("id"))
        if not oid or not text(obj.get("title")):
            rep.error(f"OBJ {oid or '?'}: нужны id и title")
        krs = obj.get("krs") or []
        if not krs:
            rep.error(f"OBJ {oid}: нет KR")
        for kr in krs:
            kid = text(kr.get("id"))
            where = f"KR {kid or '?'}"
            if not KR_ID_RE.match(kid) or not kid.startswith(oid + "."):
                rep.error(f"{where}: id должен иметь вид {oid}.N")
            if kid in seen:
                rep.error(f"{where}: id повторяется")
            seen.add(kid)
            if not text(kr.get("title")):
                rep.error(f"{where}: нет названия")
            check_pbv(kr, where, rep, required=False)
            if kr.get("result") not in RESULTS:
                rep.error(f"{where}: result должен быть одним из {RESULTS}")
            if not text(kr.get("fact")):
                rep.gate(f"{where}: нет фактического результата (fact)")
            elif unsure(kr.get("fact")):
                rep.gate(f"{where}: в fact остался [УТОЧНИТЬ]")
            if not text(kr.get("source")):
                rep.gate(f"{where}: у факта нет источника (source)")
            progress = kr.get("progress")
            if progress is not None and (not isinstance(progress, int) or not 0 <= progress <= 100):
                rep.error(f"{where}: progress — целое 0..100")
            carry = kr.get("carry")
            if carry not in CARRY:
                rep.error(f"{where}: carry должен быть одним из {CARRY}")
            elif carry in CARRY_FORWARD and not text(kr.get("carry_note")):
                rep.error(f"{where}: для «{carry}» опиши, что переходит (carry_note)")
            if kr.get("result") == "Выполнено" and carry == "Доделка":
                rep.warn(f"{where}: выполненный KR помечен как «Доделка»")


def check_pbv(item, where, rep, required):
    pbv = item.get("pbv")
    if pbv is None:
        if required:
            rep.gate(f"{where}: нет PBV")
        return
    if not isinstance(pbv, int) or isinstance(pbv, bool) or not 1 <= pbv <= 9:
        rep.error(f"{where}: PBV — целое 1..9, получено {pbv!r}")


def resolve_retro(doc, doc_path, retro_path):
    if retro_path:
        return load(retro_path)
    ref = text((doc.get("retro") or {}).get("file"))
    if not ref:
        return None
    candidate = os.path.join(os.path.dirname(os.path.abspath(doc_path)), ref)
    return load(candidate) if os.path.exists(candidate) else None


def lint_scope(doc, rep, retro):
    if not QUARTER_RE.match(text(doc.get("quarter"))):
        rep.error(f"quarter: ожидается формат ГГГГQn, получено {doc.get('quarter')!r}")
    if not text(doc.get("team")):
        rep.gate("team: не указана команда")
    phase = doc.get("phase", "scope")
    if phase not in PHASES:
        rep.error(f"phase: одно из {PHASES}")
    teams = doc.get("teams") or []
    team_ids = [text(t.get("id")) for t in teams]
    if not teams:
        rep.error("teams: не перечислены команды")
    if len(set(team_ids)) != len(team_ids) or "" in team_ids:
        rep.error("teams: у каждой команды нужен уникальный id")
    roles = doc.get("roles") or DEFAULT_ROLES
    retro_ref = doc.get("retro") or {}
    if not text(retro_ref.get("file")) and not text(doc.get("retro_skipped")):
        rep.error("retro: укажи retro.file или причину в retro_skipped")
    if text(retro_ref.get("file")) and retro is None:
        rep.gate(f"retro: файл {retro_ref.get('file')} не найден рядом со scope")

    objectives = doc.get("objectives") or []
    if not objectives:
        rep.error("objectives: нет ни одной цели")
    strategic = [o for o in objectives if not o.get("activity")]
    if strategic and not 3 <= len(strategic) <= 5:
        rep.warn(f"OBJ: {len(strategic)} целей, рекомендуется 3–5")

    seen = set()
    all_initiatives = []
    for obj in objectives:
        oid = text(obj.get("id"))
        where_obj = f"OBJ {oid or '?'}"
        if not oid or not text(obj.get("title")):
            rep.error(f"{where_obj}: нужны id и title")
        if not obj.get("activity"):
            why = text(obj.get("why"))
            if not why:
                rep.gate(f"{where_obj}: нет «почему важно» (why)")
            elif unsure(why):
                rep.gate(f"{where_obj}: в why остался [УТОЧНИТЬ]")
        initiatives = obj.get("initiatives") or []
        if not initiatives:
            rep.error(f"{where_obj}: нет инициатив")
        elif len(initiatives) > 6:
            rep.warn(f"{where_obj}: {len(initiatives)} инициатив, рекомендуется не больше 6")
        for ini in initiatives:
            kid = text(ini.get("id"))
            where = f"KR {kid or '?'}"
            all_initiatives.append(ini)
            if not KR_ID_RE.match(kid) or not kid.startswith(oid + "."):
                rep.error(f"{where}: id должен иметь вид {oid}.N")
            if kid in seen:
                rep.error(f"{where}: id повторяется")
            seen.add(kid)
            if not text(ini.get("title")):
                rep.error(f"{where}: нет названия")
            ini_teams = ini.get("teams") or []
            if not ini_teams:
                rep.error(f"{where}: не указаны команды")
            for tid in ini_teams:
                if tid not in team_ids:
                    rep.error(f"{where}: команда {tid!r} не описана в teams")
            check_pbv(ini, where, rep, required=True)
            if ini.get("tag", "") not in TAGS:
                rep.error(f"{where}: tag — один из {TAGS}")
            result = text(ini.get("result"))
            if not result:
                rep.gate(f"{where}: нет образа результата")
            elif unsure(result) and pbv_of(ini) >= 7:
                rep.gate(f"{where}: у инициативы с PBV ≥ 7 в образе результата [УТОЧНИТЬ]")
            if bool(text(ini.get("before"))) != bool(text(ini.get("after"))):
                rep.error(f"{where}: БЫЛО и СТАЛО заполняются парой")
            if phase == "stages":
                lint_notes(ini, where, roles, rep)

    if len([i for i in all_initiatives if i.get("tag") != "ACTIVITY"]) > 20:
        rep.warn("Всего больше 20 инициатив — у квартала нет фокуса")
    critical = [text(i.get("id")) for i in all_initiatives if i.get("pbv") == 9]
    if len(critical) > 2:
        rep.warn(f"PBV 9 у {len(critical)} инициатив ({', '.join(critical)}), рекомендуется не больше 2")

    lint_retro_link(doc, all_initiatives, retro, rep)


def lint_notes(ini, where, roles, rep):
    notes = ini.get("notes") or {}
    tag = ini.get("tag", "")
    if tag == "ACTIVITY":
        return
    if not text(notes.get("description")):
        rep.gate(f"{where}: в заметках нет описания инициативы")
    stages = notes.get("stages") or []
    need = 3 if pbv_of(ini) >= 7 else 1
    if len(stages) < need:
        rep.gate(f"{where}: этапов {len(stages)}, нужно не меньше {need}")
    for n, stage in enumerate(stages, 1):
        role = text(stage.get("role"))
        if role not in roles:
            rep.error(f"{where}, этап {n}: роль {role!r} не из {roles}")
        if not text(stage.get("title")):
            rep.error(f"{where}, этап {n}: нет названия")
    for key in ("conditions", "risks", "dependencies", "uncertainties"):
        if key in notes and not isinstance(notes[key], list):
            rep.error(f"{where}: notes.{key} — список")
    if tag in ("RESEARCH", "POC") and not notes.get("uncertainties"):
        rep.gate(f"{where}: у [{tag}] должны быть перечислены неопределённости")


def lint_retro_link(doc, initiatives, retro, rep):
    if retro is None:
        return
    retro_ids = {text(kr.get("id")): kr for o in retro.get("objectives") or [] for kr in o.get("krs") or []}
    linked = {text(i.get("from_retro")) for i in initiatives if text(i.get("from_retro"))}
    for rid in linked:
        if rid not in retro_ids:
            rep.error(f"from_retro {rid!r}: такого KR нет в Retro")
    dropped = {text(d.get("id")) for d in doc.get("retro_dropped") or []}
    for rid, kr in retro_ids.items():
        if kr.get("carry") in CARRY_FORWARD and rid not in linked and rid not in dropped:
            rep.gate(f"Retro {rid} ({kr.get('carry')}) не попал в Scope и не отмечен в retro_dropped")


def lint(path, final=False, retro_path=None):
    doc = load(path)
    rep = Report(final or doc.get("status") == "принято")
    if doc.get("status", "черновик") not in STATUSES:
        rep.error(f"status: одно из {STATUSES}")
    kind = doc.get("kind")
    if kind == "retro":
        lint_retro(doc, rep)
    elif kind == "scope":
        lint_scope(doc, rep, resolve_retro(doc, path, retro_path))
    else:
        rep.error("kind: ожидается 'retro' или 'scope'")
    return rep


# ---------------------------------------------------------------- HTML

CSS = """
:root{--bg:#fbfaf8;--card:#fff;--ink:#1d1d1f;--muted:#6b6b70;--line:#e4e2dd;--accent:#e30611;
--good:#1f8a4c;--part:#b7791f;--bad:#c53030;--off:#8a8a8f;--warn-bg:#fff4d6;--warn-ink:#8a5a00;--chip:#f1efea}
@media (prefers-color-scheme:dark){:root{--bg:#161618;--card:#1f1f22;--ink:#ececef;--muted:#a1a1a8;
--line:#333338;--chip:#2a2a2e;--warn-bg:#3a2f12;--warn-ink:#f3c969}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);
font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:1080px;margin:0 auto;padding:32px 16px 64px}
header{border-bottom:2px solid var(--ink);padding-bottom:16px;margin-bottom:24px}
.kicker{color:var(--accent);font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:12px}
h1{margin:4px 0 8px;font-size:28px;line-height:1.2}h2{font-size:20px;margin:32px 0 8px}
h3{font-size:16px;margin:0}.meta{color:var(--muted);font-size:13px}
.badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;font-weight:600;
border:1px solid currentColor;white-space:nowrap}
.s-draft{color:var(--part)}.s-ok{color:var(--good)}
.r-Выполнено{color:var(--good)}.r-Частично{color:var(--part)}.r-Не{color:var(--bad)}.r-Отменено{color:var(--off)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.tile b{display:block;font-size:26px;line-height:1.1}.tile span{color:var(--muted);font-size:13px}
.lead{font-size:17px;max-width:760px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line);font-size:14px}
th{font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
tr:last-child td{border-bottom:0}.scroll{overflow-x:auto;border-radius:10px}
.scroll table{min-width:640px}.num{white-space:nowrap;font-weight:600}
.bar{height:6px;background:var(--chip);border-radius:3px;min-width:80px;margin-top:6px}
.bar i{display:block;height:100%;background:var(--ink);border-radius:3px}
.src{color:var(--muted);font-size:12px;margin-top:4px}
.warn{background:var(--warn-bg);color:var(--warn-ink);border-radius:4px;padding:0 4px}
.chip{display:inline-block;background:var(--chip);border-radius:6px;padding:1px 8px;font-size:12px;margin:0 4px 4px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:12px 0}
.card-head{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.card-head .id{font-weight:700;color:var(--accent)}
.label{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:12px 0 2px}
.flow{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;background:var(--chip);
border-radius:6px;padding:8px 10px;white-space:pre-wrap}
details{margin-top:12px;border-top:1px dashed var(--line);padding-top:10px}
summary{cursor:pointer;font-weight:600}
ol.stages{padding-left:22px;margin:8px 0}ol.stages li{margin:4px 0}
.role{display:inline-block;min-width:38px;text-align:center;font-weight:700;font-size:12px;
border:1px solid var(--ink);border-radius:4px;padding:0 4px;margin-right:6px}
.ext{color:var(--accent);font-weight:700;font-size:12px}
.grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:4px 16px}
ul{margin:4px 0;padding-left:20px}.why{color:var(--muted);max-width:760px}
footer{margin-top:40px;color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:12px}
@media print{body{background:#fff}details{display:block}.card,table{break-inside:avoid}}
"""


def esc(value):
    safe = html.escape(text(value)).replace("\n", "<br>")
    return UNSURE_RE.sub(lambda m: f'<span class="warn">{m.group(0)}</span>', safe)


def items(values):
    values = [v for v in (values or []) if text(v)]
    if not values:
        return '<span class="meta">—</span>'
    return "<ul>" + "".join(f"<li>{esc(v)}</li>" for v in values) + "</ul>"


def status_badge(doc):
    ok = doc.get("status") == "принято"
    return f'<span class="badge {"s-ok" if ok else "s-draft"}">{"принято" if ok else "черновик"}</span>'


def page(title, body):
    body = body.replace("<table>", '<div class="scroll"><table>').replace("</table>", "</table></div>")
    return (f'<!doctype html><html lang="ru"><head><meta charset="utf-8">'
            f'<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{html.escape(title)}</title><style>{CSS}</style></head>'
            f'<body><main>{body}</main></body></html>\n')


def footer(doc, source):
    return (f'<footer>Собрано из {html.escape(os.path.basename(source))}'
            f'{" · обновлено " + esc(doc.get("updated")) if text(doc.get("updated")) else ""}. '
            f'Правки вносятся в JSON, HTML пересобирается.</footer>')


def render_retro(doc, source):
    krs = [kr for o in doc.get("objectives") or [] for kr in o.get("krs") or []]
    counts = {r: sum(1 for kr in krs if kr.get("result") == r) for r in RESULTS}
    carried = [kr for kr in krs if kr.get("carry") in CARRY_FORWARD]
    out = [
        f'<header><div class="kicker">OKR Retro · {esc(doc.get("quarter"))}</div>'
        f'<h1>Итоги {esc(doc.get("quarter"))}{" — " + esc(doc.get("team")) if text(doc.get("team")) else ""}</h1>'
        f'<div class="meta">PO: {esc(doc.get("po")) or "—"} · {status_badge(doc)} · '
        f'планирование {esc(doc.get("next_quarter"))}</div></header>',
        f'<p class="lead">{esc(doc.get("summary"))}</p>',
        '<div class="tiles">',
    ]
    for r in RESULTS:
        out.append(f'<div class="tile"><b class="r-{r.split()[0]}">{counts[r]}</b><span>{r}</span></div>')
    out.append(f'<div class="tile"><b>{len(carried)}</b><span>переходит в {esc(doc.get("next_quarter"))}</span></div></div>')
    for obj in doc.get("objectives") or []:
        out.append(f'<h2>OBJ {esc(obj.get("id"))}. {esc(obj.get("title"))}</h2>')
        out.append('<table><thead><tr><th>KR</th><th>План</th><th>Факт</th><th>Итог</th><th>Дальше</th></tr></thead><tbody>')
        for kr in obj.get("krs") or []:
            progress = kr.get("progress")
            bar = (f'<div class="bar"><i style="width:{int(progress)}%"></i></div><div class="src">{int(progress)}%</div>'
                   if isinstance(progress, int) and 0 <= progress <= 100 else "")
            pbv = f' · PBV {esc(kr.get("pbv"))}' if kr.get("pbv") is not None else ""
            result = text(kr.get("result"))
            carry_note = f'<div class="src">{esc(kr.get("carry_note"))}</div>' if text(kr.get("carry_note")) else ""
            out.append(
                f'<tr><td><span class="num">{esc(kr.get("id"))}</span> {esc(kr.get("title"))}'
                f'<div class="src">{pbv.lstrip(" ·")}</div></td>'
                f'<td>{esc(kr.get("plan")) or "—"}</td>'
                f'<td>{esc(kr.get("fact")) or "—"}<div class="src">{esc(kr.get("source"))}</div></td>'
                f'<td><span class="badge r-{result.split()[0] if result else "Отменено"}">{esc(result) or "—"}</span>{bar}</td>'
                f'<td>{esc(kr.get("carry")) or "—"}{carry_note}</td></tr>')
        out.append('</tbody></table>')
    out.append(f'<h2>Переходит в {esc(doc.get("next_quarter"))}</h2>')
    if carried:
        out.append('<table><thead><tr><th>KR</th><th>Тип</th><th>Что переходит</th></tr></thead><tbody>')
        for kr in carried:
            out.append(f'<tr><td><span class="num">{esc(kr.get("id"))}</span> {esc(kr.get("title"))}</td>'
                       f'<td>{esc(kr.get("carry"))}</td><td>{esc(kr.get("carry_note"))}</td></tr>')
        out.append('</tbody></table>')
    else:
        out.append('<p class="meta">Ничего не переходит.</p>')
    out.append(f'<h2>Выводы</h2>{items(doc.get("lessons"))}')
    out.append(f'<h2>Открытые вопросы</h2>{items(doc.get("open_questions"))}')
    out.append(footer(doc, source))
    return page(f'OKR Retro {text(doc.get("quarter"))}', "".join(out))


def render_scope(doc, source):
    teams = {text(t.get("id")): t for t in doc.get("teams") or []}
    inits = [i for o in doc.get("objectives") or [] for i in o.get("initiatives") or []]
    phase_label = "Scope + декомпозиция по этапам" if doc.get("phase") == "stages" else "Scope"
    retro = doc.get("retro") or {}
    retro_line = (f'Retro: {esc(retro.get("file"))}' if text(retro.get("file"))
                  else f'Retro пропущен: {esc(doc.get("retro_skipped"))}')
    out = [
        f'<header><div class="kicker">OKR {phase_label} · {esc(doc.get("quarter"))}</div>'
        f'<h1>План {esc(doc.get("quarter"))}{" — " + esc(doc.get("team")) if text(doc.get("team")) else ""}</h1>'
        f'<div class="meta">PO: {esc(doc.get("po")) or "—"} · {status_badge(doc)} · {retro_line}</div></header>',
    ]
    if text(doc.get("summary")):
        out.append(f'<p class="lead">{esc(doc.get("summary"))}</p>')
    by_team = {tid: sum(1 for i in inits if tid in (i.get("teams") or [])) for tid in teams}
    out.append('<div class="tiles">'
               f'<div class="tile"><b>{len(doc.get("objectives") or [])}</b><span>целей</span></div>'
               f'<div class="tile"><b>{len(inits)}</b><span>инициатив</span></div>'
               f'<div class="tile"><b>{sum(1 for i in inits if pbv_of(i) >= 7)}</b><span>с PBV ≥ 7</span></div>'
               f'<div class="tile"><b>{sum(1 for i in inits if text(i.get("from_retro")))}</b><span>из прошлого квартала</span></div>'
               '</div>')
    out.append('<div>' + "".join(
        f'<span class="chip"><b>{esc(t.get("name"))}</b> · {by_team.get(tid, 0)}'
        f'{" · внешняя" if t.get("external") else ""}</span>' for tid, t in teams.items()) + '</div>')
    if text(doc.get("po_brief")):
        out.append(f'<details><summary>Исходный рассказ PO</summary><p>{esc(doc.get("po_brief"))}</p></details>')
    for obj in doc.get("objectives") or []:
        out.append(f'<h2>OBJ {esc(obj.get("id"))}. {esc(obj.get("title"))}</h2>')
        if text(obj.get("why")):
            out.append(f'<p class="why">{esc(obj.get("why"))}</p>')
        for ini in obj.get("initiatives") or []:
            out.append(render_initiative(ini, teams, doc.get("quarter")))
    dropped = doc.get("retro_dropped") or []
    if dropped:
        out.append('<h2>Не берём из прошлого квартала</h2><table><thead><tr><th>KR</th><th>Почему</th></tr></thead><tbody>')
        out.extend(f'<tr><td class="num">{esc(d.get("id"))}</td><td>{esc(d.get("reason"))}</td></tr>' for d in dropped)
        out.append('</tbody></table>')
    out.append(f'<h2>Открытые вопросы</h2>{items(doc.get("open_questions"))}')
    out.append(footer(doc, source))
    return page(f'OKR Scope {text(doc.get("quarter"))}', "".join(out))


def render_initiative(ini, teams, quarter):
    tag = text(ini.get("tag"))
    chips = "".join(f'<span class="chip">{esc(teams.get(t, {}).get("name") or t)}</span>' for t in ini.get("teams") or [])
    parts = [
        f'<section class="card"><div class="card-head"><span class="id">{esc(ini.get("id"))}</span>'
        f'<h3>{"[" + esc(tag) + "] " if tag else ""}{esc(ini.get("title"))}</h3>'
        f'<span class="badge">PBV {esc(ini.get("pbv")) or "?"}</span></div>'
        f'<div style="margin-top:6px">{chips}'
        f'{"<span class=meta>продолжение " + esc(ini.get("from_retro")) + " прошлого квартала</span>" if text(ini.get("from_retro")) else ""}</div>',
        f'<div class="label">Образ результата</div><div>{esc(ini.get("result")) or "—"}</div>',
    ]
    if text(ini.get("before")):
        parts.append(f'<div class="label">Было → стало</div>'
                     f'<div class="flow">БЫЛО:  {esc(ini.get("before"))}<br>СТАЛО: {esc(ini.get("after"))}</div>')
    if ini.get("open"):
        parts.append(f'<div class="label">Открыто</div>{items(ini.get("open"))}')
    notes = ini.get("notes") or {}
    if notes:
        stages = "".join(
            f'<li><span class="role">{esc(s.get("role"))}</span>{esc(s.get("title"))}'
            f'{" <span class=ext>[EXT]</span>" if s.get("ext") else ""}'
            f'{"<div class=src>" + esc(s.get("note")) + "</div>" if text(s.get("note")) else ""}</li>'
            for s in notes.get("stages") or [])
        parts.append(
            f'<details open><summary>Заметки: декомпозиция по этапам</summary>'
            f'<p>{esc(notes.get("description"))}</p>'
            f'{"<ol class=stages>" + stages + "</ol>" if stages else ""}'
            f'<div class="grid4"><div><div class="label">Условия</div>{items(notes.get("conditions"))}</div>'
            f'<div><div class="label">Риски</div>{items(notes.get("risks"))}</div>'
            f'<div><div class="label">Зависимости</div>{items(notes.get("dependencies"))}</div>'
            f'<div><div class="label">Неопределённости</div>{items(notes.get("uncertainties"))}</div></div>'
            f'</details>')
    parts.append('</section>')
    return "".join(parts)


def render(path, out):
    doc = load(path)
    renderer = {"retro": render_retro, "scope": render_scope}.get(doc.get("kind"))
    if renderer is None:
        raise SystemExit("kind: ожидается 'retro' или 'scope'")
    with open(out, "w", encoding="utf-8") as f:
        f.write(renderer(doc, path))


# ---------------------------------------------------------------- TeamPlanner

def teamplanner(path, out):
    doc = load(path)
    if doc.get("kind") != "scope" or doc.get("phase") != "stages" or doc.get("status") != "принято":
        raise SystemExit("TeamPlanner собирается только из принятого Scope с декомпозицией "
                         "(kind=scope, phase=stages, status=принято)")
    rep = lint(path)
    if rep.errors:
        raise SystemExit("Scope не проходит проверку: " + "; ".join(rep.errors))
    teams = {text(t.get("id")): t for t in doc.get("teams") or []}
    rows = []
    for obj in doc.get("objectives") or []:
        program = f'OBJ {text(obj.get("id"))}. {text(obj.get("title"))}'
        for ini in obj.get("initiatives") or []:
            notes = ini.get("notes") or {}
            head = {
                "Программа (OBJ)": program,
                "KR": text(ini.get("id")),
                "Инициатива": text(ini.get("title")),
                "PBV": text(ini.get("pbv")),
                "Тег": text(ini.get("tag")),
                "Команды": ", ".join(text(teams.get(t, {}).get("name") or t) for t in ini.get("teams") or []),
            }
            extra = {
                "Условия": "; ".join(text(c) for c in notes.get("conditions") or []),
                "Риски": "; ".join(f"[RISK] {text(r)}" for r in notes.get("risks") or []),
                "Зависимости": "; ".join(text(d) for d in notes.get("dependencies") or []),
                "Неопределённости": "; ".join(text(u) for u in notes.get("uncertainties") or []),
            }
            stages = notes.get("stages") or [{}]
            for n, stage in enumerate(stages, 1):
                row = dict(head)
                if stage:
                    row.update({"Этап №": f"{text(ini.get('id'))}.{n}", "Роль": text(stage.get("role")),
                                "Внешняя команда": "да" if stage.get("ext") else "",
                                "Этап": text(stage.get("title"))})
                if n == 1:
                    row.update(extra)
                rows.append(row)
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=TEAMPLANNER_COLUMNS, delimiter=";", restval="")
        writer.writeheader()
        for n, row in enumerate(rows, 1):
            row["№"] = n
            writer.writerow(row)
    return len(rows)


# ---------------------------------------------------------------- CLI

def main(argv):
    if len(argv) < 2 or argv[0] not in ("lint", "render", "teamplanner"):
        print(__doc__.strip(), file=sys.stderr)
        return 2
    cmd, path = argv[0], argv[1]
    if cmd == "lint":
        retro = argv[argv.index("--retro") + 1] if "--retro" in argv else None
        rep = lint(path, final="--final" in argv, retro_path=retro)
        for w in rep.warnings:
            print(f"  ! {w}")
        if rep.errors:
            print(f"НЕ ПРОШЁЛ: {len(rep.errors)} ошибок")
            for e in rep.errors:
                print(f"  - {e}")
            return 1
        print(f"OK{' (предупреждений: ' + str(len(rep.warnings)) + ')' if rep.warnings else ''}")
        return 0
    if len(argv) < 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    if cmd == "render":
        render(path, argv[2])
        print(f"Written {argv[2]}")
        return 0
    count = teamplanner(path, argv[2])
    print(f"Written {argv[2]} ({count} строк)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
