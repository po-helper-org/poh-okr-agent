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

OUTCOMES = {
    "done": ("✔", "закрыт"),
    "partial": ("◐", "частично"),
    "failed": ("✖", "не сделано"),
    "dropped": ("⊘", "отменён"),
    "unknown": ("?", "не оценён"),
}
STEP_NAMES = {"done": "DONE", "progress": "IN PROGRESS", "todo": "TODO", "none": "нет статуса", "dropped": "снято"}
NEXT_ACTIONS = ["continue", "close", "drop", "decide", "other"]
ROLE_RE = re.compile(r"^[A-Z]{2,10}$")
FACT_KR_ID_RE = re.compile(r"^\d+(\.[0-9A-Za-z]+)+$")
ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
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


def is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


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
    if kr.get("dropped"):
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
    if kr.get("dropped"):
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
        reason = text(kr.get("drop_reason"))
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
    head = "отменён" if state == "dropped" else "нет оценки" if state == "unknown" else f"{kr['pct']} %"
    parts = (["внеплановый"] if kr.get("unplanned") else []) + ([text(kr.get("comment"))] if text(kr.get("comment")) else [])
    return head + (" — " + "; ".join(parts) if parts else "")


def plan_count(plan):
    live = [s for s in plan if s.get("status") != "dropped"]
    return f"{sum(1 for s in live if s.get('status') == 'done')} / {len(live)}"


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
        "unplanned": sum(1 for kr in krs if kr.get("unplanned")),
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
    for row in doc.get("discrepancies") or []:
        if not row.get("resolved"):
            rep.gate(f"Расхождение не сверено: {text(row.get('what'))}")


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
    for key in ("unplanned", "dropped"):
        if key in kr and not isinstance(kr[key], bool):
            rep.error(f"{where}: {key} — true или false")
    state = outcome(kr)
    if kr.get("dropped") and pct is not None:
        rep.warn(f"{where}: KR отменён, процент {pct} не показывается")
    if state == "unknown":
        rep.gate(f"{where}: нет процента готовности — укажи pct или dropped")
    if unsure(kr.get("comment")):
        rep.gate(f"{where}: в комментарии к факту остался [УТОЧНИТЬ]")
    for key in ("plan", "deps"):
        for n, step in enumerate(kr.get(key) or [], 1):
            if not ROLE_RE.match(text(step.get("role"))):
                rep.error(f"{where}, {key} {n}: роль — латиница заглавными (BE, SA, RELEASE), получено {step.get('role')!r}")
            if not text(step.get("step")):
                rep.error(f"{where}, {key} {n}: нет текста шага")
            if step.get("status") not in STEP_NAMES:
                rep.error(f"{where}, {key} {n}: status — одно из {list(STEP_NAMES)}")
    statuses = {s.get("status") for s in kr.get("plan") or []}
    if state == "done" and statuses & {"todo", "progress"}:
        rep.warn(f"{where}: закрыт на 100 %, но в плане есть незакрытые шаги")
    if state == "failed" and "done" in statuses:
        rep.warn(f"{where}: 0 %, но в плане есть сделанные шаги")
    nxt = kr.get("next") or {}
    action = text(nxt.get("action"))
    if action and action not in NEXT_ACTIONS:
        rep.error(f"{where}: next.action — одно из {NEXT_ACTIONS}")
    if kr.get("dropped") and action not in ("", "drop"):
        rep.error(f"{where}: KR отменён, next.action может быть только drop")
    if not next_action(kr):
        rep.gate(f"{where}: не указано, что дальше (next.action)")
    if next_action(kr) == "continue" and not text(nxt.get("kr")):
        rep.gate(f"{where}: продолжение без номера KR следующего квартала (next.kr)")
    if next_action(kr) == "other" and not text(nxt.get("note")):
        rep.error(f"{where}: для next.action=other нужен next.note")
    if next_action(kr) == "drop" and not text(kr.get("drop_reason")):
        rep.gate(f"{where}: отменён без причины и даты решения (drop_reason)")


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
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.tile b{display:block;font-size:26px;line-height:1.1}.tile span{color:var(--muted);font-size:13px}
.lead{font-size:17px;max-width:760px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--line);font-size:14px}
th{font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
tr:last-child td{border-bottom:0}.scroll{overflow-x:auto;border-radius:10px}
.scroll table{min-width:640px}.num{white-space:nowrap;font-weight:600}
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


def esc(value, marker='<span class="warn">{}</span>'):
    safe = html.escape(text(value)).replace("\n", "<br>")
    return UNSURE_RE.sub(lambda m: marker.format(m.group(0)), safe)


def esc_unc(value):
    return esc(value, '<mark class="unc">{}</mark>')


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


def asset(name):
    with open(os.path.join(ASSETS, name), encoding="utf-8") as f:
        return f.read()


def fact_segs(plan):
    if not plan:
        return '<span class="segn">—</span>'
    segs = "".join(
        f'<i class="seg s-{html.escape(text(s.get("status")))}" title="'
        f'{html.escape(text(s.get("role")) + " · " + text(s.get("step")) + " · " + STEP_NAMES.get(s.get("status"), ""))}"></i>'
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
    steps = lambda key: [{"role": text(s.get("role")), "step": text(s.get("step")), "status": text(s.get("status"))}
                         for s in kr.get(key) or []]
    plan = steps("plan")
    return {
        "title": text(kr.get("title")),
        "obj": f"OBJ {text(obj.get('id'))} — {text(obj.get('title'))}",
        "stateLine": f"{mark} {name}{pct} · PBV {pbv if is_int(pbv) else '—'}",
        "goal": text(kr.get("goal")),
        "plan": plan,
        "planCount": f"{plan_count(plan)} этапов" if plan else "",
        "deps": steps("deps"),
        "risks": [text(r) for r in kr.get("risks") or [] if text(r)],
        "fact": fact_text(kr),
        "next": next_text(kr, quarter),
        "link": link_text(kr, quarter),
        "who": [text(w) for w in kr.get("who") or [] if text(w)],
    }


def render_retro(doc, source):
    quarter, next_q = text(doc.get("quarter")), text(doc.get("next_quarter"))
    team = text(doc.get("team"))
    stats = retro_stats(doc)
    counts = stats["counts"]
    title = f"ФАКТ {quarter}" + (f" — {team}" if team else "")

    drawer = [f'<button class="st-item" type="button" data-state="" data-active>Все исходы<span class="n">{stats["total"]}</span></button>']
    for state, (mark, name) in OUTCOMES.items():
        if counts[state]:
            drawer.append(f'<button class="st-item" type="button" data-state="{state}" data-name="{name}">'
                          f'<span class="st st-{state}">{mark}</span> {name}<span class="n">{counts[state]}</span></button>')

    basis = [esc_unc(b) for b in doc.get("basis") or [] if text(b)]
    if stats["weighted"] is not None:
        basis.append(f'Итог квартала: <strong>{stats["weighted"]} %</strong> — взвешенное по PBV среднее по '
                     f'{stats["rated"]} оценённым KR (простое среднее {stats["simple"]} %).')
    basis.append('Шкала этапов плана: зелёный — сделано · жёлтый — в работе · белый — не начато · '
                 'штриховка — статус не задан · пунктир — снято.')

    meta = [f"PO: {esc(doc.get('po'))}" if text(doc.get("po")) else "",
            "принято" if doc.get("status") == "принято" else "черновик",
            f"обновлено {esc(doc.get('updated'))}" if text(doc.get("updated")) else ""]
    out = [
        '<div class="rail"><button class="rail-tab" id="stTab" type="button">Исход: <span id="stNow">все</span></button></div>',
        '<div class="drawer" id="stDrawer"><div class="drawer-head"><h4>Исход квартала</h4>'
        '<button class="drawer-close" type="button">×</button></div>' + "\n".join(drawer) + '</div>',
        '<div class="layout wide"><main>',
        f'<div class="head"><h1>{html.escape(title)}</h1><p class="meta">{" · ".join(m for m in meta if m)}</p></div>',
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
            pbv = kr.get("pbv")
            cards[kid] = fact_card(obj, kr, next_q)
            rows.append(
                f'<tr class="row" data-kr="{html.escape(kid)}" data-state="{state}">'
                f'<td class="kr">{html.escape(kid)}</td>'
                f'<td class="fly">{"<span>влёт</span>" if kr.get("unplanned") else ""}</td>'
                f'<td class="pbv"><span class="pbvtag" data-tier="{pbv_tier(pbv)}">{pbv if is_int(pbv) else "—"}</span></td>'
                f'<td class="name">{esc_unc(kr.get("title"))}</td>'
                f'<td class="prog">{fact_segs(kr.get("plan") or [])}</td>'
                f'<td class="pct st-{state}">{fact_pct(kr)}</td></tr>')
        out.append(
            f'<a id="obj-{html.escape(text(obj.get("id")))}"></a>'
            '<div class="table-wrap"><table class="pick fact"><colgroup><col class="c-kr"><col class="c-fly">'
            '<col class="c-pbv"><col class="c-name"><col class="c-prog"><col class="c-pct"></colgroup>'
            '<thead><tr><th>KR</th><th></th><th>PBV</th><th>Название</th><th>Прогресс</th><th>%</th></tr></thead>'
            f'<tbody><tr class="objrow"><td colspan="6">{band}</td></tr>{"".join(rows)}</tbody></table></div>')

    total = stats["total"] or 1
    summary = ['<tr><td>Исход</td><td>KR</td><td>Доля</td></tr>']
    for state, (mark, name) in OUTCOMES.items():
        if counts[state] or state != "unknown":
            summary.append(f'<tr><td>{mark} {name}</td><td>{counts[state]}</td><td>{half_up(counts[state] * 100 / total)} %</td></tr>')
    summary.append(f'<tr><td>внеплановых</td><td>{stats["unplanned"]}</td><td>—</td></tr>')
    out.append(f'<h3>Сводка</h3><div class="table-wrap"><table class="mini head">{"".join(summary)}</table></div>')
    if text(doc.get("summary_note")):
        out.append(f'<p>{esc_unc(doc.get("summary_note"))}</p>')

    lessons = [l for l in doc.get("lessons") or [] if text(l.get("title")) or text(l.get("text"))]
    if lessons:
        out.append('<h3>Что это говорит о правилах</h3>')
        out.extend(f'<p>{n}. <strong>{esc_unc(l.get("title"))}</strong> {esc_unc(l.get("text"))}</p>'
                   for n, l in enumerate(lessons, 1))

    rows = doc.get("discrepancies") or []
    if rows:
        body = "".join(
            f'<tr><td>{esc_unc(r.get("what"))}</td><td>{esc_unc(r.get("po"))}</td><td>{esc_unc(r.get("tracker"))}</td>'
            f'<td>{"сверено" if r.get("resolved") else "<mark class=unc>[УТОЧНИТЬ]</mark>"}</td></tr>' for r in rows)
        out.append('<h3>Расхождения — проверить</h3><div class="table-wrap"><table class="mini head">'
                   f'<tr><td>Что</td><td>Со слов PO</td><td>В трекере</td><td>Статус</td></tr>{body}</table></div>')

    rows = doc.get("baseline") or []
    if rows:
        body = "".join(f'<tr><td>{esc_unc(r.get("metric"))}</td><td>{esc_unc(r.get("value"))}</td></tr>' for r in rows)
        out.append(f'<h3>Базовая линия</h3><div class="table-wrap"><table class="mini head"><tr><td>Метрика</td><td>{html.escape(quarter)}</td></tr>{body}</table></div>')

    out.append('</main></div>')
    out.append('<div class="scrim" id="scrim"></div><div class="side" id="side"><div class="side-head">'
               '<span class="kr-id" id="sideKr"></span><button class="drawer-close" id="sideClose" type="button">×</button></div>'
               '<h3 class="side-title" id="sideTitle"></h3><p class="factline" id="sideState"></p>'
               '<div class="note" id="sideNote"></div></div>')
    data = json.dumps(cards, ensure_ascii=False).replace("<", "\\u003c")
    out.append(f'<script type="application/json" id="fact-data">{data}</script>')
    out.append(f'<script>{asset("fact.js")}</script>')
    return ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f'<title>{html.escape(title)}</title>\n'
            f'<!-- Собрано okr-plan.py из {html.escape(os.path.basename(source))}. Правки — в JSON, страница пересобирается. -->\n'
            f'<style>\n{asset("fact.css")}</style>\n</head>\n<body>\n' + "\n".join(out) + '\n</body>\n</html>\n')


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
