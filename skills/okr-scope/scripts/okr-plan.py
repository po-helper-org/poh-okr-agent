#!/usr/bin/env python3
"""Данные планирования квартала: проверка, HTML-экраны Retro/Scope/TeamPlanner, выгрузка CSV.

  okr-plan.py lint <file.json> [--final] [--retro <retro.json>]
  okr-plan.py render <file.json> <out.html>
  okr-plan.py seed <scope.json> <teamplanner.json>    заготовка TeamPlanner из принятого Scope
  okr-plan.py csv <teamplanner.json> <out.csv>        таблица для Google Sheets / Excel

Источник истины — JSON. HTML и CSV всегда пересобираются из него, руками не правятся.
Только стандартная библиотека Python.
"""
import csv
import html
import json
import os
import re
import sys

OUTCOMES = {
    "done": ("✔", "закрыт"),
    "partial": ("◐", "частично"),
    "failed": ("✖", "не сделано"),
    "dropped": ("⊘", "отменено"),
    "unknown": ("?", "не оценён"),
}
ITEM_STATUSES = ["Активна", "Отменено"]
STEP_STATUSES = ["TODO", "IN PROGRESS", "BLOCKED", "DONE"]
NEXT_ACTIONS = ["continue", "close", "drop", "decide", "other"]
ROLE_RE = re.compile(r"^[A-Z]{2,10}$")
FACT_KR_ID_RE = re.compile(r"^\d+(\.[0-9A-Za-z]+)+$")
ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
TAGS = ["", "RESEARCH", "POC", "BUG", "ACTIVITY"]
STATUSES = ["черновик", "принято"]
PHASES = ["scope", "stages"]
DEFAULT_ROLES = ["PO", "SA", "BE", "FE", "ADR"]
# TeamPlanner — полный операционный цикл: подготовка и согласования → архитектура →
# аналитика → разработка → тестирование → инфраструктура → выкатка.
# Внешний ресурс — не роль, а ext у этапа: EXT[BE] = BE-работа смежной команды.
TP_ROLES = ["PO", "ADR", "SA", "BA", "BE", "FE", "QA", "DOPS", "RM"]
STATUS_RU = {"TODO": "Не начата", "IN PROGRESS": "В процессе", "BLOCKED": "Заблокирована", "DONE": "Готово"}
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
QUARTER_RE = re.compile(r"^\d{4}Q[1-4]$")
KR_ID_RE = re.compile(r"^\d+(\.\d+)+$")
UNSURE_RE = re.compile(r"\[УТОЧНИТЬ[^\]\n]*\]")

TEAMPLANNER_COLUMNS = ["Название", "Комментарий", "Роль", "Исполнитель", "Начало", "Конец",
                       "Статус", "Прогресс, %", "Образ результата", "Образ действия"]


def text(value):
    if value is None:
        return ""
    if isinstance(value, list):
        return "\n".join(text(v) for v in value)
    return str(value).strip()


def unsure(value):
    return bool(UNSURE_RE.search(text(value)))


def is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def cancelled(item):
    return text(item.get("status")) == "Отменено"


def taken(item):
    """Инициатива претендует на квартал: не отменена и не отмечена «не берём».
    Нерешённая (in_quarter нет) считается кандидатом — так фокус не завышается."""
    return not cancelled(item) and item.get("in_quarter") is not False


def pbv_of(item):
    pbv = item.get("pbv")
    return pbv if is_int(pbv) else 0


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


# ---------------------------------------------------------------- Retro: правила вывода

def outcome(kr):
    """Исход KR выводится из данных, LLM его не пишет."""
    if cancelled(kr):
        return "dropped"
    pct = kr.get("pct")
    if not is_int(pct):
        return "unknown"
    if pct >= 100:
        return "done"
    return "failed" if pct <= 0 else "partial"


def pbv_tier(pbv):
    if not is_int(pbv):
        return "none"
    if pbv <= 0:
        return "zero"
    return "high" if pbv >= 8 else "mid" if pbv >= 4 else "low"


def next_action(kr):
    if cancelled(kr):
        return "drop"
    action = text((kr.get("next") or {}).get("action"))
    if action:
        return action
    return "close" if outcome(kr) == "done" else ""


def next_text(kr, quarter):
    nxt = kr.get("next") or {}
    action = next_action(kr)
    target = text(nxt.get("kr"))
    if action == "continue":
        return f"Продолжается в {quarter} — KR {target}" if target else f"Продолжается в {quarter} — [УТОЧНИТЬ: KR {quarter}]"
    if action == "close":
        return "Закрыт — снять с контроля"
    if action == "drop":
        reason = text(kr.get("cancel_reason"))
        return f"Отменён — {reason}" if reason else "Отменён — записать причину и дату решения [УТОЧНИТЬ]"
    if action == "decide":
        return "Решить: продолжаем, переносим или закрываем"
    if action == "other" and text(nxt.get("note")):
        return text(nxt.get("note"))
    return "[УТОЧНИТЬ: что дальше]"


def link_text(kr, quarter):
    target = text((kr.get("next") or {}).get("kr"))
    if not target or next_action(kr) == "continue":
        return ""
    return f"{quarter} — KR {target}"


def fact_text(kr):
    state = outcome(kr)
    head = "отменено" if state == "dropped" else "нет оценки" if state == "unknown" else f"{kr['pct']} %"
    parts = (["внеплановый"] if kr.get("unplanned") else []) + ([text(kr.get("comment"))] if text(kr.get("comment")) else [])
    return head + (" — " + "; ".join(parts) if parts else "")


def plan_count(plan):
    return f"{sum(1 for s in plan if s.get('status') == 'DONE')} / {len(plan)}"


def status_slug(status):
    return text(status).lower().replace(" ", "-")


def half_up(value):
    return int(value + 0.5)


def retro_krs(doc):
    return [(obj, kr) for obj in doc.get("objectives") or [] for kr in obj.get("krs") or []]


def retro_stats(doc):
    krs = [kr for _, kr in retro_krs(doc)]
    counts = {state: sum(1 for kr in krs if outcome(kr) == state) for state in OUTCOMES}
    rated = [kr for kr in krs if outcome(kr) in ("done", "partial", "failed") and pbv_of(kr) >= 1]
    weight = sum(pbv_of(kr) for kr in rated)
    return {
        "total": len(krs),
        "counts": counts,
        "rated": len(rated),
        "weighted": half_up(sum(kr["pct"] * pbv_of(kr) for kr in rated) / weight) if weight else None,
        "simple": half_up(sum(kr["pct"] for kr in rated) / len(rated)) if rated else None,
    }


def carried_forward(retro):
    return {text(kr.get("id")): kr for _, kr in retro_krs(retro) if next_action(kr) == "continue"}


# ---------------------------------------------------------------- Retro: проверка

def lint_retro(doc, rep):
    for key in ("quarter", "next_quarter"):
        if not QUARTER_RE.match(text(doc.get(key))):
            rep.error(f"{key}: ожидается формат ГГГГQn, получено {doc.get(key)!r}")
    if not text(doc.get("team")):
        rep.gate("team: не указана команда")
    if not [b for b in doc.get("basis") or [] if text(b)]:
        rep.gate("basis: не указано, откуда факт (трекер, выгрузка, слова PO с датой)")
    objectives = doc.get("objectives") or []
    if not objectives:
        rep.error("objectives: нет ни одной цели квартала")
    seen = set()
    for obj in objectives:
        oid = text(obj.get("id"))
        if not oid or not text(obj.get("title")):
            rep.error(f"OBJ {oid or '?'}: нужны id и title")
        if not obj.get("krs"):
            rep.error(f"OBJ {oid}: нет KR")
        for kr in obj.get("krs") or []:
            lint_fact_kr(kr, oid, seen, rep)


def lint_fact_kr(kr, oid, seen, rep):
    kid = text(kr.get("id"))
    where = f"KR {kid or '?'}"
    if not FACT_KR_ID_RE.match(kid) or not kid.startswith(oid + "."):
        rep.error(f"{where}: id должен начинаться с {oid}.")
    if kid in seen:
        rep.error(f"{where}: id повторяется")
    seen.add(kid)
    if not text(kr.get("title")):
        rep.error(f"{where}: нет названия")
    pbv = kr.get("pbv")
    if pbv is not None and (not is_int(pbv) or not 0 <= pbv <= 9):
        rep.error(f"{where}: PBV — целое 0..9 или null, получено {pbv!r}")
    pct = kr.get("pct")
    if pct is not None and (not is_int(pct) or not 0 <= pct <= 100):
        rep.error(f"{where}: pct — целое 0..100 или null, получено {pct!r}")
    if "unplanned" in kr and not isinstance(kr["unplanned"], bool):
        rep.error(f"{where}: unplanned — true или false")
    check_item_status(kr, where, rep)
    state = outcome(kr)
    if cancelled(kr) and pct is not None:
        rep.warn(f"{where}: KR отменён, процент {pct} не показывается")
    if state == "unknown":
        rep.gate(f"{where}: нет процента готовности — укажи pct или \"status\": \"Отменено\"")
    if unsure(kr.get("comment")):
        rep.gate(f"{where}: в комментарии к факту остался [УТОЧНИТЬ]")
    for key in ("plan", "deps"):
        for n, step in enumerate(kr.get(key) or [], 1):
            if not ROLE_RE.match(text(step.get("role"))):
                rep.error(f"{where}, {key} {n}: роль — латиница заглавными (BE, SA, RELEASE), получено {step.get('role')!r}")
            if not text(step.get("step")):
                rep.error(f"{where}, {key} {n}: нет текста шага")
            if step.get("status") not in STEP_STATUSES:
                rep.error(f"{where}, {key} {n}: status — одно из {STEP_STATUSES}")
    statuses = {s.get("status") for s in kr.get("plan") or []}
    if state == "done" and statuses & {"TODO", "IN PROGRESS", "BLOCKED"}:
        rep.warn(f"{where}: закрыт на 100 %, но в плане есть незакрытые шаги")
    if state == "failed" and "DONE" in statuses:
        rep.warn(f"{where}: 0 %, но в плане есть сделанные шаги")
    nxt = kr.get("next") or {}
    action = text(nxt.get("action"))
    if action and action not in NEXT_ACTIONS:
        rep.error(f"{where}: next.action — одно из {NEXT_ACTIONS}")
    if cancelled(kr) and action not in ("", "drop"):
        rep.error(f"{where}: KR отменён, next.action может быть только drop")
    if not next_action(kr):
        rep.gate(f"{where}: не указано, что дальше (next.action)")
    if next_action(kr) == "continue" and not text(nxt.get("kr")):
        rep.gate(f"{where}: продолжение без номера KR следующего квартала (next.kr)")
    if next_action(kr) == "other" and not text(nxt.get("note")):
        rep.error(f"{where}: для next.action=other нужен next.note")


def check_item_status(item, where, rep):
    if "dropped" in item:
        rep.error(f'{where}: поле dropped больше не используется — пиши "status": "Отменено"')
    if "status" in item and item.get("status") not in ITEM_STATUSES:
        rep.error(f"{where}: status — одно из {ITEM_STATUSES}")
    if cancelled(item) and not text(item.get("cancel_reason")):
        rep.gate(f"{where}: отменено без причины и даты решения (cancel_reason)")


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
        elif len([i for i in initiatives if taken(i)]) > 6:
            rep.warn(f"{where_obj}: больше 6 инициатив в квартал")
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
            check_item_status(ini, where, rep)
            in_quarter = ini.get("in_quarter")
            if in_quarter is not None and not isinstance(in_quarter, bool):
                rep.error(f"{where}: in_quarter — true или false, получено {in_quarter!r}")
            if cancelled(ini):
                if in_quarter is True:
                    rep.error(f"{where}: отменённая инициатива не может идти в квартал (in_quarter: true)")
                continue
            if in_quarter is None:
                rep.gate(f"{where}: не решено, берём ли в квартал (in_quarter)")
            result = text(ini.get("result"))
            if not result:
                rep.gate(f"{where}: нет образа результата")
            elif unsure(result) and pbv_of(ini) >= 7:
                rep.gate(f"{where}: у инициативы с PBV ≥ 7 в образе результата [УТОЧНИТЬ]")
            if bool(text(ini.get("before"))) != bool(text(ini.get("after"))):
                rep.error(f"{where}: БЫЛО и СТАЛО заполняются парой")
            if phase == "stages" and in_quarter is not False:
                lint_notes(ini, where, roles, rep)

    active = [i for i in all_initiatives if taken(i)]
    if len([i for i in active if i.get("tag") != "ACTIVITY"]) > 20:
        rep.warn("Всего больше 20 инициатив — у квартала нет фокуса")
    critical = [text(i.get("id")) for i in active if i.get("pbv") == 9]
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
        if "status" in stage and stage.get("status") not in STEP_STATUSES:
            rep.error(f"{where}, этап {n}: status — одно из {STEP_STATUSES}")
    for key in ("conditions", "risks", "dependencies", "uncertainties"):
        if key in notes and not isinstance(notes[key], list):
            rep.error(f"{where}: notes.{key} — список")
    if tag in ("RESEARCH", "POC") and not notes.get("uncertainties"):
        rep.gate(f"{where}: у [{tag}] должны быть перечислены неопределённости")


def lint_retro_link(doc, initiatives, retro, rep):
    if retro is None:
        return
    retro_ids = {text(kr.get("id")) for _, kr in retro_krs(retro)}
    linked = {text(i.get("from_retro")) for i in initiatives if text(i.get("from_retro"))}
    for rid in linked:
        if rid not in retro_ids:
            rep.error(f"from_retro {rid!r}: такого KR нет в Retro")
    dropped = {text(d.get("id")) for d in doc.get("retro_dropped") or []}
    for rid in carried_forward(retro):
        if rid not in linked and rid not in dropped:
            rep.gate(f"Retro {rid} продолжается в новом квартале, но не попал в Scope и не отмечен в retro_dropped")


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
    elif kind == "teamplanner":
        lint_teamplanner(doc, rep, path)
    else:
        rep.error("kind: ожидается 'retro', 'scope' или 'teamplanner'")
    return rep


# ---------------------------------------------------------------- HTML: общий каркас

def esc(value):
    return html.escape(text(value)).replace("\n", "<br>")


def esc_unc(value):
    return UNSURE_RE.sub(lambda m: f'<mark class="unc">{m.group(0)}</mark>', esc(value))


def asset(name):
    with open(os.path.join(ASSETS, name), encoding="utf-8") as f:
        return f.read()


def pbv_cell(pbv):
    return f'<span class="pbvtag" data-tier="{pbv_tier(pbv)}">{pbv if is_int(pbv) else "—"}</span>'


IN_QUARTER_TEXT = {True: "в квартал", False: "не в квартал", None: "в квартал: не решено"}


def in_quarter_cell(ini):
    if cancelled(ini):
        return "—"
    value = ini.get("in_quarter")
    mark, label = {True: ("yes", "✓ да"), False: ("no", "нет")}.get(value, ("undecided", "?"))
    return f'<span class="inq" data-v="{mark}">{label}</span>'


def card_steps(steps):
    return [{"t": "step", "role": text(s.get("role")),
             "v": ("[EXT] " if s.get("ext") else "") + text(s.get("step") or s.get("title")),
             "s": text(s.get("status")) or "TODO"}
            for s in steps or []]


def card_list(title, values):
    values = [text(v) for v in values or [] if text(v)]
    return [{"t": "h", "v": title}] + [{"t": "li", "v": v} for v in values] if values else []


def card_text(title, value):
    return [{"t": "h", "v": title}, {"t": "p", "v": text(value)}] if text(value) else []


def filter_drawer(label, title, items):
    """items: (value, html-подпись, имя для вкладки, число)."""
    buttons = "\n".join(
        f'<button class="st-item" type="button" data-value="{html.escape(v)}" data-name="{html.escape(n)}"'
        f'{" data-active" if not v else ""}>{caption}<span class="n">{count}</span></button>'
        for v, caption, n, count in items)
    return (f'<div class="rail"><button class="rail-tab" id="stTab" type="button">{label}: <span id="stNow">все</span></button></div>'
            f'<div class="drawer" id="stDrawer"><div class="drawer-head"><h4>{title}</h4>'
            f'<button class="drawer-close" type="button">×</button></div>{buttons}</div>')


def page(title, source, css, parts, cards):
    data = json.dumps({"file": os.path.basename(source), "cards": cards}, ensure_ascii=False).replace("<", "\\u003c")
    body = "\n".join(parts + [
        '<div class="promptbox"><button type="button" id="commentsBtn">Комментарии: 0</button>'
        '<div class="panel" id="commentsPanel"><h4>Комментарии для ИИ-агента</h4><div id="commentsList"></div>'
        '<textarea id="commentsPrompt" readonly></textarea><div class="row-btns">'
        '<button type="button" class="primary" id="commentsCopy">Скопировать для агента</button>'
        '<button type="button" id="commentsSave">Скачать файлом</button>'
        '<button type="button" id="commentsClear">Очистить</button></div></div></div>',
        '<div class="scrim" id="scrim"></div><div class="side" id="side"><div class="side-head">'
        '<span class="kr-id" id="sideKr"></span><button class="drawer-close" id="sideClose" type="button">×</button></div>'
        '<h3 class="side-title" id="sideTitle"></h3><p class="factline" id="sideState"></p>'
        '<div id="sideSegs"></div><div class="note" id="sideNote"></div>'
        '<p class="hintline">Правый клик по пункту или выделенной мышью зоне — комментарий для ИИ-агента: '
        'дописать риск, поправить готовность или следующие действия. Сама страница ничего не меняет.</p></div>',
        f'<script type="application/json" id="page-data">{data}</script>',
        f'<script>{asset("page.js")}</script>',
    ])
    return ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f'<title>{html.escape(title)}</title>\n'
            f'<!-- Собрано okr-plan.py из {html.escape(os.path.basename(source))}. Правки — в JSON, страница пересобирается. -->\n'
            f'<style>\n{asset("page.css")}{asset(css)}</style>\n</head>\n<body>\n{body}\n</body>\n</html>\n')


def meta_line(doc, *extra):
    parts = list(extra) + [
        f"PO: {esc(doc.get('po'))}" if text(doc.get("po")) else "",
        "принято" if doc.get("status") == "принято" else "черновик",
        f"обновлено {esc(doc.get('updated'))}" if text(doc.get("updated")) else "",
    ]
    return " · ".join(p for p in parts if p)


def table(cols, head, band, rows):
    colgroup = "".join(f'<col class="c-{c}">' for c in cols)
    ths = "".join(f"<th>{h}</th>" for h in head)
    return (f'<div class="table-wrap"><table class="pick"><colgroup>{colgroup}</colgroup>'
            f'<thead><tr>{ths}</tr></thead><tbody><tr class="objrow"><td colspan="{len(cols)}">{band}</td></tr>'
            f'{"".join(rows)}</tbody></table></div>')


# ---------------------------------------------------------------- HTML: ФАКТ

def fact_segs(plan):
    if not plan:
        return '<span class="segn">—</span>'
    segs = "".join(
        f'<i class="seg s-{html.escape(status_slug(s.get("status")))}" title="'
        f'{html.escape(text(s.get("role")) + " · " + text(s.get("step")) + " · " + text(s.get("status")))}"></i>'
        for s in plan)
    return f'<span class="segs">{segs}</span><span class="segn">{plan_count(plan).replace(" / ", "&thinsp;/&thinsp;")}</span>'


def fact_pct(kr):
    state = outcome(kr)
    if state == "dropped":
        return "ОТМ"
    if state == "unknown":
        return "—"
    return f"{kr['pct']}&nbsp;%"


def fact_card(obj, kr, quarter):
    state = outcome(kr)
    mark, name = OUTCOMES[state]
    pbv = kr.get("pbv")
    pct = f" · {kr['pct']} %" if state in ("done", "partial", "failed") else ""
    plan = [{"role": text(s.get("role")), "step": text(s.get("step")), "status": text(s.get("status"))}
            for s in kr.get("plan") or []]
    link = link_text(kr, quarter)
    blocks = (card_text("Образ результата", kr.get("goal"))
              + ([{"t": "h", "v": "Процессный roadmap"}] + card_steps(kr.get("plan")) if plan else [])
              + ([{"t": "h", "v": "Зависимости"}] + card_steps(kr.get("deps")) if kr.get("deps") else [])
              + card_list("Риски", kr.get("risks"))
              + card_text("Фактическая готовность", fact_text(kr))
              + card_text("Следующие действия", next_text(kr, quarter))
              + ([{"t": "p", "v": link}] if link else [])
              + card_list("Исполнители", kr.get("who")))
    return {
        "head": f"{text(kr.get('id'))} · OBJ {text(obj.get('id'))} — {text(obj.get('title'))}",
        "title": text(kr.get("title")),
        "line": f"{mark} {name}{pct} · PBV {pbv if is_int(pbv) else '—'}",
        "segs": plan,
        "segsCount": f"{plan_count(plan)} этапов" if plan else "",
        "blocks": blocks,
    }


def render_retro(doc, source):
    quarter, next_q = text(doc.get("quarter")), text(doc.get("next_quarter"))
    team = text(doc.get("team"))
    stats = retro_stats(doc)
    counts = stats["counts"]
    title = f"ФАКТ {quarter}" + (f" — {team}" if team else "")

    items = [("", "Все исходы", "все", stats["total"])]
    items += [(state, f'<span class="st st-{state}">{mark}</span> {name}', name, counts[state])
              for state, (mark, name) in OUTCOMES.items() if counts[state]]

    basis = [esc_unc(b) for b in doc.get("basis") or [] if text(b)]
    if stats["weighted"] is not None:
        basis.append(f'Итог квартала: <strong>{stats["weighted"]} %</strong> — взвешенное по PBV среднее по '
                     f'{stats["rated"]} оценённым KR (простое среднее {stats["simple"]} %).')
    basis.append('Шкала подзадач: зелёный — DONE · жёлтый — IN PROGRESS · красный — BLOCKED · белый — TODO.')

    parts = [
        filter_drawer("Исход", "Исход квартала", items),
        '<div class="layout wide"><main>',
        f'<div class="head"><h1>{html.escape(title)}</h1><p class="meta">{meta_line(doc)}</p></div>',
        f'<blockquote class="quote">{"<br>".join(basis)}</blockquote>',
    ]
    cards = {}
    for obj in doc.get("objectives") or []:
        band = f'<b>OBJ {esc(obj.get("id"))} — {esc(obj.get("title"))}</b>'
        if text(obj.get("outcome")):
            band += f' · {esc_unc(obj.get("outcome"))}'
        rows = []
        for kr in obj.get("krs") or []:
            kid = text(kr.get("id"))
            state = outcome(kr)
            cards[kid] = fact_card(obj, kr, next_q)
            rows.append(
                f'<tr class="row" data-kr="{html.escape(kid)}" data-tags="{state}">'
                f'<td class="kr">{html.escape(kid)}</td>'
                f'<td class="fly">{"<span>влёт</span>" if kr.get("unplanned") else ""}</td>'
                f'<td class="pbv">{pbv_cell(kr.get("pbv"))}</td>'
                f'<td class="name">{esc_unc(kr.get("title"))}</td>'
                f'<td class="prog">{fact_segs(kr.get("plan") or [])}</td>'
                f'<td class="pct st-{state}">{fact_pct(kr)}</td></tr>')
        parts.append(f'<a id="obj-{html.escape(text(obj.get("id")))}"></a>' + table(
            ["kr", "fly", "pbv", "name", "prog", "pct"], ["KR", "", "PBV", "Название", "Прогресс", "%"], band, rows))
    parts.append('</main></div>')
    return page(title, source, "fact.css", parts, cards)


# ---------------------------------------------------------------- HTML: Scope

def scope_card(obj, ini, teams, retro_quarter):
    tag = text(ini.get("tag"))
    notes = ini.get("notes") or {}
    names = ", ".join(text(teams.get(t, {}).get("name") or t) for t in ini.get("teams") or [])
    origin = (f"продолжение KR {text(ini.get('from_retro'))} из {retro_quarter or 'прошлого квартала'}"
              if text(ini.get("from_retro")) else "новая")
    line = [f"PBV {ini.get('pbv') if is_int(ini.get('pbv')) else '—'}", names, origin]
    if cancelled(ini):
        line.insert(0, "отменено")
    else:
        line.insert(0, IN_QUARTER_TEXT[ini.get("in_quarter")])
    flow = ([{"t": "h", "v": "Было → стало"}, {"t": "p", "v": "БЫЛО: " + text(ini.get("before"))},
             {"t": "p", "v": "СТАЛО: " + text(ini.get("after"))}] if text(ini.get("before")) else [])
    stages = notes.get("stages") or []
    return {
        "head": f"{text(ini.get('id'))} · OBJ {text(obj.get('id'))} — {text(obj.get('title'))}",
        "title": (f"[{tag}] " if tag else "") + text(ini.get("title")),
        "line": " · ".join(x for x in line if x),
        "segs": [],
        "segsCount": "",
        "blocks": (card_text("Отменено", ini.get("cancel_reason") or "[УТОЧНИТЬ: причина и дата решения]") if cancelled(ini) else [])
                  + card_text("Образ результата", ini.get("result")) + flow
                  + card_text("Описание", notes.get("description"))
                  + ([{"t": "h", "v": "Этапы"}] + card_steps(stages) if stages else [])
                  + card_list("Условия", notes.get("conditions"))
                  + card_list("Риски", notes.get("risks"))
                  + card_list("Зависимости", notes.get("dependencies"))
                  + card_list("Неопределённости", notes.get("uncertainties"))
                  + card_list("Открыто", ini.get("open")),
    }


def unsure_places(ini):
    fields = [("образ результата", ini.get("result")), ("было/стало", [ini.get("before"), ini.get("after")])]
    notes = ini.get("notes") or {}
    fields += [("описание", notes.get("description")),
               ("этапы", [s.get("title") for s in notes.get("stages") or []])]
    return [name for name, value in fields if unsure(value)]


def render_scope(doc, source, retro=None):
    quarter, team = text(doc.get("quarter")), text(doc.get("team"))
    teams = {text(t.get("id")): t for t in doc.get("teams") or []}
    stages_phase = doc.get("phase") == "stages"
    all_inis = [i for o in doc.get("objectives") or [] for i in o.get("initiatives") or []]
    active = [i for i in all_inis if not cancelled(i)]
    chosen = [i for i in active if taken(i)]
    yes = sum(1 for i in active if i.get("in_quarter") is True)
    undecided = sum(1 for i in active if i.get("in_quarter") is None)
    title = f"ПЛАН {quarter}" + (f" — {team}" if team else "")
    retro_quarter = text((retro or {}).get("quarter"))

    items = [("", "Все команды", "все", len(active))]
    items += [(tid, esc(t.get("name")) + (' <span class="ext">внешняя</span>' if t.get("external") else ""),
               text(t.get("name")), sum(1 for i in active if tid in (i.get("teams") or [])))
              for tid, t in teams.items()]

    quote = [esc_unc(doc.get("summary"))] if text(doc.get("summary")) else []
    strategic = [o for o in doc.get("objectives") or [] if not o.get("activity")]
    quote.append(f"Целей {len(strategic)}"
                 + (f" + {len(doc['objectives']) - len(strategic)} поддержка" if len(doc.get("objectives") or []) > len(strategic) else "")
                 + f" · инициатив {len(active)}, в квартал {yes}"
                 + (f", не решено {undecided}" if undecided else "")
                 + f" · с PBV ≥ 7: {sum(1 for i in chosen if pbv_of(i) >= 7)}"
                 + f" · с PBV 9: {sum(1 for i in chosen if pbv_of(i) == 9)}"
                 + f" · из прошлого квартала {sum(1 for i in chosen if text(i.get('from_retro')))}"
                 + (f" · отменено {len(all_inis) - len(active)}" if len(all_inis) > len(active) else "") + ".")
    if text((doc.get("retro") or {}).get("file")):
        line = f"Retro: {esc((doc.get('retro') or {}).get('file'))}"
        if retro is not None:
            carried = carried_forward(retro)
            linked = {text(i.get("from_retro")) for i in all_inis if taken(i)}
            dropped = {text(d.get("id")) for d in doc.get("retro_dropped") or []}
            dropped |= {text(i.get("from_retro")) for i in all_inis if not taken(i) and text(i.get("from_retro"))}
            line += (f" — продолжается {len(carried)} KR, в плане {len(set(carried) & linked)}, "
                     f"не берём {len(set(carried) & dropped)}, не решено {len(set(carried) - linked - dropped)}")
        quote.append(line + ".")
    else:
        quote.append(f"Retro пропущен: {esc_unc(doc.get('retro_skipped'))}.")
    quote.append('PBV: <span class="pbvtag" data-tier="high">8–9</span> высокий · '
                 '<span class="pbvtag" data-tier="mid">4–7</span> средний · '
                 '<span class="pbvtag" data-tier="low">1–3</span> низкий. '
                 '<b class="new">+</b> — новая инициатива, без продолжения из прошлого квартала.')

    parts = [
        filter_drawer("Команда", "Команды", items),
        '<div class="layout wide"><main>',
        f'<div class="head"><h1>{html.escape(title)}</h1><p class="meta">'
        f'{meta_line(doc, "декомпозиция по этапам" if stages_phase else "скоуп")}</p></div>',
        f'<blockquote class="quote">{"<br>".join(quote)}</blockquote>',
    ]
    if text(doc.get("po_brief")):
        parts.append(f'<details class="brief"><summary>Исходный рассказ PO</summary><p>{esc(doc.get("po_brief"))}</p></details>')

    cols = ["kr", "team", "name", "asis", "tobe", "pbv", "inq"] + (["prog"] if stages_phase else [])
    head = ["KR", "Команды", "Название", "ASIS", "TOBE", "PBV", "В квартал"] + (["Подзадачи"] if stages_phase else [])
    cards, asks = {}, []
    for obj in doc.get("objectives") or []:
        band = f'<b>OBJ {esc(obj.get("id"))} — {esc(obj.get("title"))}</b>'
        if text(obj.get("why")):
            band += f' · {esc_unc(obj.get("why"))}'
        rows = []
        for ini in obj.get("initiatives") or []:
            kid = text(ini.get("id"))
            cards[kid] = scope_card(obj, ini, teams, retro_quarter)
            tag = text(ini.get("tag"))
            new = "" if text(ini.get("from_retro")) or obj.get("activity") else ' <b class="new">+</b>'
            team_names = "<br>".join(esc(teams.get(t, {}).get("name") or t) for t in ini.get("teams") or [])
            row = (f'<tr class="row" data-kr="{html.escape(kid)}" data-tags="{html.escape(" ".join(ini.get("teams") or []))}"'
                   f'{" data-cancelled" if cancelled(ini) else ""}'
                   f'{" data-out" if not cancelled(ini) and not taken(ini) else ""}>'
                   f'<td class="kr">{html.escape(kid)}{new}</td>'
                   f'<td class="team">{team_names}</td>'
                   f'<td class="name"><span class="txt">{"[" + esc(tag) + "] " if tag else ""}{esc_unc(ini.get("title"))}</span>'
                   f'{"<span class=cancel>отменено</span>" if cancelled(ini) else ""}</td>'
                   f'<td class="asis">{esc_unc(ini.get("before")) or "—"}</td>'
                   f'<td class="tobe">{esc_unc(ini.get("result")) or "—"}</td>'
                   f'<td class="pbv">{pbv_cell(ini.get("pbv"))}</td>'
                   f'<td class="inq">{in_quarter_cell(ini)}</td>')
            if stages_phase:
                subtasks = [{"role": s.get("role"), "step": ("[EXT] " if s.get("ext") else "") + text(s.get("title")),
                             "status": text(s.get("status")) or "TODO"}
                            for s in (ini.get("notes") or {}).get("stages") or []]
                row += f'<td class="prog">{fact_segs(subtasks)}</td>'
            rows.append(row + "</tr>")
            if not cancelled(ini) and ini.get("in_quarter") is None:
                asks.append(f"KR {esc(kid)}: берём в квартал? <mark class=\"unc\">[УТОЧНИТЬ у PO]</mark>")
            if taken(ini):
                asks += [f"KR {esc(kid)}: {esc_unc(q)}" for q in ini.get("open") or [] if text(q)]
                places = unsure_places(ini)
                if places:
                    asks.append(f"KR {esc(kid)}: <mark class=\"unc\">[УТОЧНИТЬ]</mark> — {', '.join(places)}")
        parts.append(f'<a id="obj-{html.escape(text(obj.get("id")))}"></a>' + table(cols, head, band, rows))

    dropped = doc.get("retro_dropped") or []
    if dropped:
        body = "".join(f'<tr><td>{esc(d.get("id"))}</td><td>{esc_unc(d.get("reason"))}</td></tr>' for d in dropped)
        parts.append('<h3>Не берём из прошлого квартала</h3><div class="table-wrap"><table class="mini head">'
                     f'<tr><td>KR</td><td>Почему</td></tr>{body}</table></div>')
    asks = [esc_unc(q) for q in doc.get("open_questions") or [] if text(q)] + asks
    if asks:
        parts.append('<div class="ask-block"><h4>Открытые вопросы</h4><ol>'
                     + "".join(f"<li>{q}</li>" for q in asks) + "</ol></div>")
    parts.append('</main></div>')
    return page(title, source, "scope.css", parts, cards)


def render(path, out):
    doc = load(path)
    if doc.get("kind") == "retro":
        page_html = render_retro(doc, path)
    elif doc.get("kind") == "scope":
        page_html = render_scope(doc, path, resolve_retro(doc, path, None))
    elif doc.get("kind") == "teamplanner":
        page_html = render_teamplanner(doc, path)
    else:
        raise SystemExit("kind: ожидается 'retro', 'scope' или 'teamplanner'")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page_html)


# ---------------------------------------------------------------- TeamPlanner: данные

def tp_krs(doc):
    for obj in doc.get("objectives") or []:
        for kr in obj.get("krs") or []:
            yield obj, kr


def tp_teams(doc):
    return {text(t.get("id")): t for t in doc.get("teams") or []}


def tp_people(doc, team_ids=None):
    """Люди своих (не внешних) команд; team_ids — только эти команды."""
    out = []
    for tid, team in tp_teams(doc).items():
        if team.get("external") or (team_ids is not None and tid not in team_ids):
            continue
        out += [dict(p, team=tid) for p in team.get("people") or []]
    return out


def step_state(doc, kr, step):
    """Производные признаки этапа. Внешний ресурс — делает смежная команда. Без
    исполнителя: norole — такой роли в командах KR нет вовсе (ресурс искать извне),
    unassigned — роль есть, человека ещё не выбрали."""
    ext = text(step.get("ext"))
    if ext or text(step.get("who")):
        return {"ext": ext, "unassigned": False, "norole": False}
    roles_here = {text(p.get("role")) for p in tp_people(doc, kr.get("teams") or [])}
    norole = text(step.get("role")) not in roles_here
    return {"ext": "", "unassigned": not norole, "norole": norole}


def step_pct(step):
    if is_int(step.get("progress")):
        return step["progress"]
    return 100 if text(step.get("status")) == "DONE" else 0


def kr_pct(kr):
    steps = kr.get("steps") or []
    return half_up(sum(step_pct(s) for s in steps) / len(steps)) if steps else None


def kr_status(kr):
    statuses = [text(s.get("status")) or "TODO" for s in kr.get("steps") or []]
    if statuses and all(st == "DONE" for st in statuses):
        return "DONE"
    if "BLOCKED" in statuses:
        return "BLOCKED"
    if any(st in ("IN PROGRESS", "DONE") for st in statuses):
        return "IN PROGRESS"
    return "TODO"


def kr_dates(kr):
    starts = [text(s.get("start")) for s in kr.get("steps") or [] if text(s.get("start"))]
    ends = [text(s.get("end")) for s in kr.get("steps") or [] if text(s.get("end"))]
    return (min(starts) if starts else "", max(ends) if ends else "")


def who_text(doc, kr, step):
    st = step_state(doc, kr, step)
    if st["ext"]:
        team = tp_teams(doc).get(st["ext"], {})
        return f"внешний ресурс: {text(team.get('name') or st['ext'])}"
    if text(step.get("who")):
        return text(step.get("who"))
    return "нет роли в команде" if st["norole"] else ""


def role_text(doc, step):
    ext = text(step.get("ext"))
    if not ext:
        return text(step.get("role"))
    return f"EXT[{text(step.get('role'))}]"


def quarter_bounds(quarter):
    m = QUARTER_RE.match(quarter or "")
    if not m:
        return None
    year, q = int(quarter[:4]), int(quarter[-1])
    start = f"{year}-{3 * q - 2:02d}-01"
    end = f"{year}-{3 * q:02d}-{[31, 30, 30, 31][q - 1]}"
    return start, end


# ---------------------------------------------------------------- TeamPlanner: заготовка из Scope

def seed(scope_path, out):
    scope = load(scope_path)
    if scope.get("kind") != "scope" or scope.get("status") != "принято":
        raise SystemExit("Заготовка TeamPlanner собирается только из принятого Scope (kind=scope, status=принято)")
    teams = [dict({k: v for k, v in t.items() if k in ("id", "name", "external")}, people=[])
             for t in scope.get("teams") or []]
    external = [text(t.get("id")) for t in scope.get("teams") or [] if t.get("external")]
    objectives = []
    for obj in scope.get("objectives") or []:
        krs = []
        for ini in obj.get("initiatives") or []:
            if cancelled(ini) or ini.get("in_quarter") is not True:
                continue
            notes = ini.get("notes") or {}
            ext_team = next((t for t in ini.get("teams") or [] if t in external), "")
            steps = [{"role": text(st.get("role")), "title": text(st.get("title")) or text(ini.get("title")),
                      "ext": ext_team if st.get("ext") else "", "who": "", "start": "", "end": "",
                      "status": text(st.get("status")) or "TODO", "result": "", "action": "", "comment": ""}
                     for st in notes.get("stages") or []]
            context = [f"Риск: {text(r)}" for r in notes.get("risks") or []]
            context += [f"Зависимость: {text(d)}" for d in notes.get("dependencies") or []]
            krs.append({"id": text(ini.get("id")), "title": text(ini.get("title")), "pbv": ini.get("pbv"),
                        "tag": text(ini.get("tag")), "teams": ini.get("teams") or [], "owner": text(scope.get("po")),
                        "result": text(ini.get("result")), "comment": "; ".join(context), "steps": steps})
        if krs:
            objectives.append({"id": text(obj.get("id")), "title": text(obj.get("title")), "krs": krs})
    doc = {"kind": "teamplanner", "quarter": scope.get("quarter"), "team": scope.get("team"),
           "po": scope.get("po"), "status": "черновик", "updated": scope.get("updated"),
           "scope": {"file": os.path.basename(scope_path)}, "roles": TP_ROLES,
           "teams": teams, "objectives": objectives}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return sum(len(o["krs"]) for o in objectives)


# ---------------------------------------------------------------- TeamPlanner: проверка

def lint_teamplanner(doc, rep, path):
    quarter = text(doc.get("quarter"))
    if not QUARTER_RE.match(quarter):
        rep.error(f"quarter: ожидается формат ГГГГQn, получено {doc.get('quarter')!r}")
    if not text(doc.get("team")):
        rep.gate("team: не указана команда")
    roles = doc.get("roles") or TP_ROLES
    teams = tp_teams(doc)
    if not teams or "" in teams or len(teams) != len(doc.get("teams") or []):
        rep.error("teams: у каждой команды нужен уникальный id")
    names = set()
    for tid, team in teams.items():
        for n, person in enumerate(team.get("people") or [], 1):
            if not text(person.get("name")) or not text(person.get("role")):
                rep.error(f"команда {tid}, человек {n}: нужны name и role")
            names.add(text(person.get("name")))
    bounds = quarter_bounds(quarter)

    seen = set()
    for obj, kr in tp_krs(doc):
        kid = text(kr.get("id"))
        where = f"KR {kid or '?'}"
        if not KR_ID_RE.match(kid) or not kid.startswith(text(obj.get("id")) + "."):
            rep.error(f"{where}: id должен иметь вид {text(obj.get('id'))}.N")
        if kid in seen:
            rep.error(f"{where}: id повторяется")
        seen.add(kid)
        for tid in kr.get("teams") or []:
            if tid not in teams:
                rep.error(f"{where}: команда {tid!r} не описана в teams")
        steps = kr.get("steps") or []
        if not steps and kr.get("tag") != "ACTIVITY":
            rep.gate(f"{where}: нет ни одного этапа")
        for n, step in enumerate(steps, 1):
            at = f"{where}, этап {n}"
            if text(step.get("role")) not in roles:
                rep.error(f"{at}: роль {step.get('role')!r} не из {roles}")
            if not text(step.get("title")):
                rep.error(f"{at}: нет названия")
            if (text(step.get("status")) or "TODO") not in STEP_STATUSES:
                rep.error(f"{at}: status — одно из {STEP_STATUSES}")
            ext = text(step.get("ext"))
            if ext and ext not in teams:
                rep.error(f"{at}: внешняя команда {ext!r} не описана в teams")
            elif ext and not teams[ext].get("external"):
                rep.warn(f"{at}: команда {ext!r} указана как внешний ресурс, но не помечена external")
            who = text(step.get("who"))
            if who and who not in names:
                rep.error(f"{at}: исполнитель {who!r} не найден в составе команд")
            progress = step.get("progress")
            if progress is not None and (not is_int(progress) or not 0 <= progress <= 100):
                rep.error(f"{at}: progress — целое 0..100")
            for key in ("start", "end"):
                if text(step.get(key)) and not DATE_RE.match(text(step.get(key))):
                    rep.error(f"{at}: {key} — дата ГГГГ-ММ-ДД")
            start, end = text(step.get("start")), text(step.get("end"))
            if start and end and DATE_RE.match(start) and DATE_RE.match(end):
                if start > end:
                    rep.error(f"{at}: начало позже конца")
                if bounds and (start < bounds[0] or end > bounds[1]):
                    rep.warn(f"{at}: сроки выходят за квартал {quarter}")
            state = step_state(doc, kr, step)
            if state["norole"]:
                rep.gate(f"{at}: нет исполнителя, и роли {text(step.get('role'))} нет в командах KR — нужен ресурс извне")
            elif state["unassigned"]:
                rep.gate(f"{at}: нет исполнителя")

    scope_file = text((doc.get("scope") or {}).get("file"))
    if scope_file:
        candidate = os.path.join(os.path.dirname(os.path.abspath(path)), scope_file)
        if not os.path.exists(candidate):
            rep.gate(f"scope: файл {scope_file} не найден рядом с TeamPlanner")
        else:
            scope = load(candidate)
            planned = {text(i.get("id")) for o in scope.get("objectives") or []
                       for i in o.get("initiatives") or [] if taken(i) and i.get("in_quarter") is True}
            for kid in sorted(planned - seen):
                rep.gate(f"KR {kid} идёт в квартал по Scope, но его нет в TeamPlanner")
            for kid in sorted(seen - planned):
                rep.warn(f"KR {kid} нет среди взятых в квартал инициатив Scope")


# ---------------------------------------------------------------- TeamPlanner: HTML

def tp_summary(doc):
    steps = [(kr, s) for _, kr in tp_krs(doc) for s in kr.get("steps") or []]
    states = [step_state(doc, kr, s) for kr, s in steps]
    return {"krs": sum(1 for _ in tp_krs(doc)), "steps": len(steps),
            "unassigned": sum(1 for st in states if st["unassigned"]),
            "norole": sum(1 for st in states if st["norole"]),
            "ext": sum(1 for st in states if st["ext"])}


def tp_static(doc):
    """То же без JS: цели, KR и подзадачи списком — читается и печатается."""
    parts = []
    for obj in doc.get("objectives") or []:
        parts.append(f'<h2 class="obj">OBJ {esc(obj.get("id"))} — {esc(obj.get("title"))}</h2>')
        for kr in obj.get("krs") or []:
            items = "".join(
                f'<li><span class="t">{esc(role_text(doc, step))}</span> {esc_unc(step.get("title"))}'
                f' — {esc(who_text(doc, kr, step)) or "исполнитель не выбран"}</li>'
                for step in kr.get("steps") or [])
            parts.append(f'<details class="kr" open><summary><span class="kr-id">{esc(kr.get("id"))}</span>'
                         f'<span class="kr-title">{esc(kr.get("title"))}</span></summary>'
                         f'<ul class="tp-static">{items}</ul></details>')
    return "\n".join(parts)


def render_teamplanner(doc, source):
    quarter, team = text(doc.get("quarter")), text(doc.get("team"))
    title = f"TEAMPLANNER {quarter}" + (f" — {team}" if team else "")
    sm = tp_summary(doc)
    counts = f"подзадач {sm['steps']} · без исполнителя {sm['unassigned'] + sm['norole']}"
    data = json.dumps({"file": os.path.basename(source), "doc": doc, "roles": doc.get("roles") or TP_ROLES,
                       "statuses": STATUS_RU}, ensure_ascii=False).replace("<", "\\u003c")
    body = "\n".join([
        '<div class="layout"><main>',
        f'<div class="head"><h1>{html.escape(title)}</h1><p class="meta">{meta_line(doc, counts)}</p></div>',
        '<div class="tp-top"><div class="tp-nav" id="tpNav"></div><div class="tp-act">'
        '<button type="button" id="bTsv">Копировать в Sheets</button>'
        '<button type="button" class="primary" id="bJson">Скачать JSON</button></div></div>',
        '<p class="tp-dirty" id="tpDirty" hidden>Есть правки в этом браузере — «Скачать JSON» и отдайте файл агенту. '
        '<button type="button" id="bReset">Сбросить</button></p>',
        f'<div id="tp">{tp_static(doc)}</div>',
        '</main></div>',
        f'<script type="application/json" id="page-data">{data}</script>',
        f'<script>{asset("teamplanner.js")}</script>',
    ])
    return ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f'<title>{html.escape(title)}</title>\n'
            f'<!-- Собрано okr-plan.py из {html.escape(os.path.basename(source))}. Правки — в JSON, страница пересобирается. -->\n'
            f'<style>\n{asset("page.css")}{asset("teamplanner.css")}</style>\n</head>\n<body>\n{body}\n</body>\n</html>\n')


# ---------------------------------------------------------------- TeamPlanner: CSV

def tp_rows(doc):
    """Строки таблицы в порядке листа TeamPlanner: цель, KR (общий прогресс), этапы.
    Та же логика — в teamplanner.js (кнопка «Скопировать для Google Sheets»)."""
    rows = []
    for obj in doc.get("objectives") or []:
        rows.append({"Название": f"OBJ {text(obj.get('id'))} — {text(obj.get('title'))}"})
        for kr in obj.get("krs") or []:
            start, end = kr_dates(kr)
            pct = kr_pct(kr)
            tag = text(kr.get("tag"))
            rows.append({"Название": f"KR {text(kr.get('id'))} " + (f"[{tag}] " if tag else "")
                                     + f"{text(kr.get('title'))} (общий прогресс)",
                         "Комментарий": "\n".join(x for x in (text(kr.get("result")), text(kr.get("comment"))) if x),
                         "Исполнитель": text(kr.get("owner")), "Начало": start, "Конец": end,
                         "Статус": STATUS_RU[kr_status(kr)], "Прогресс, %": "" if pct is None else pct})
            for step in kr.get("steps") or []:
                rows.append({"Название": f"{text(step.get('title'))} ({role_text(doc, step)})",
                             "Комментарий": text(step.get("comment")), "Роль": role_text(doc, step),
                             "Исполнитель": who_text(doc, kr, step),
                             "Начало": text(step.get("start")), "Конец": text(step.get("end")),
                             "Статус": STATUS_RU.get(text(step.get("status")) or "TODO", ""),
                             "Прогресс, %": step_pct(step),
                             "Образ результата": text(step.get("result")), "Образ действия": text(step.get("action"))})
    return rows


def export_csv(path, out):
    doc = load(path)
    if doc.get("kind") != "teamplanner":
        raise SystemExit("csv собирается из TeamPlanner (kind=teamplanner)")
    rep = lint(path)
    if rep.errors:
        raise SystemExit("TeamPlanner не проходит проверку: " + "; ".join(rep.errors))
    rows = tp_rows(doc)
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=TEAMPLANNER_COLUMNS, delimiter=";", restval="")
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


# ---------------------------------------------------------------- CLI

def main(argv):
    if len(argv) < 2 or argv[0] not in ("lint", "render", "seed", "csv"):
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
    if cmd == "seed":
        count = seed(path, argv[2])
        print(f"Written {argv[2]} ({count} KR)")
        return 0
    count = export_csv(path, argv[2])
    print(f"Written {argv[2]} ({count} строк)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
