#!/usr/bin/env python3
"""Данные планирования квартала: проверка, HTML-экраны Retro/Scope/TeamPlanner, презентация команде, CSV.

  okr-plan.py lint <file.json> [--final] [--retro <retro.json>]
  okr-plan.py render <file.json> <out.html>            страница ФАКТ, ПЛАН, TEAMPLANNER или презентация
  okr-plan.py present <present.json> <data.json>       факты презентации для .pptx (build_present_pptx.js)
  okr-plan.py seed <scope.json> <teamplanner.json> [--force]   заготовка TeamPlanner из принятого Scope
  okr-plan.py csv <teamplanner.json> <out.csv>        таблица для Google Sheets / Excel
  okr-plan.py jira-ready <teamplanner.json>            можно ли переносить в JIRA: принят, lint --final, проект
  okr-plan.py jira-csv <teamplanner.json> <out.csv>    CSV для импорта JIRA из принятого TeamPlanner

Источник истины — JSON. HTML и CSV всегда пересобираются из него, руками не правятся.
Только стандартная библиотека Python.
"""
import csv
import html
import html.parser
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
# Тип инициативы: Run — поддержать работающее, Change — развить существующее,
# Disrupt — создать новое. Пусто — тип не задан (по умолчанию).
CATEGORIES = ["", "Change", "Run", "Disrupt"]
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
                       "Статус", "Прогресс, %", "Образ результата", "Образ действия", "Оценка, дн"]
# KR с малым PBV и исследования по умолчанию начинаются с одного шага — собрать БФТ.
BFT_STEP_TITLE = "Сбор БФТ-требований"


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


def is_days(value):
    """Оценка подзадачи в днях: обычное неотрицательное число (целое или дробное)."""
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0 and value == value


def num_text(value):
    """Число как в JS: 5.0 → «5», 2.5 → «2.5»; округление до сотых."""
    value = round(value, 2)
    return str(int(value)) if float(value).is_integer() else str(value)


def step_days(step):
    return step.get("days") if is_days(step.get("days")) else None


def kr_days(kr):
    days = [d for d in (step_days(st) for st in kr.get("steps") or []) if d is not None]
    return round(sum(days), 2) if days else None


def needs_bft_only(kr):
    """PBV < 5 или RESEARCH: по умолчанию одна подзадача — [PO] Сбор БФТ-требований."""
    return (is_int(kr.get("pbv")) and kr.get("pbv") < 5) or text(kr.get("tag")) == "RESEARCH"


def cancelled(item):
    return text(item.get("status")) == "Отменено"


def taken(item):
    """Инициатива претендует на квартал: не отменена и не отмечена «не берём».
    Нерешённая (in_quarter нет) считается кандидатом — так фокус не завышается."""
    return not cancelled(item) and item.get("in_quarter") is not False


def pbv_of(item):
    pbv = item.get("pbv")
    return pbv if is_int(pbv) else 0


# ---------------------------------------------------------------- структура документа

# Структура каждого вида документа: что — объект, что — список объектов, что —
# значение. Проверяется до всего остального: JSON пишет LLM, и строка на месте
# списка не должна ронять скрипт трейсбэком — только понятной ошибкой.
V = "значение"            # строка, число, true/false или null
T = "текст"               # значение или список значений
L = "список"              # список строк (null — пусто)
STEP = {"role": V, "step": V, "title": V, "status": V, "ext": V}
SHAPES = {
    "retro": {
        "kind": V, "quarter": V, "next_quarter": V, "team": V, "po": V, "status": V, "updated": V, "basis": L,
        "objectives": [{"id": V, "title": V, "outcome": T, "krs": [{
            "id": V, "title": V, "pbv": V, "pct": V, "status": V, "unplanned": V, "comment": T, "goal": T,
            "plan": [STEP], "deps": [STEP], "risks": L, "who": L, "cancel_reason": T,
            "next": {"action": V, "kr": V, "note": T}}]}],
    },
    "scope": {
        "kind": V, "quarter": V, "team": V, "po": V, "status": V, "phase": V, "updated": V, "summary": T,
        "retro": {"file": V}, "retro_skipped": T, "po_brief": T, "roles": L,
        "teams": [{"id": V, "name": V, "external": V}],
        "objectives": [{"id": V, "title": V, "why": T, "activity": V, "initiatives": [{
            "id": V, "title": V, "teams": L, "pbv": V, "in_quarter": V, "tag": V, "category": V, "status": V,
            "cancel_reason": T,
            "from_retro": V, "result": T, "before": T, "after": T, "open": L,
            "notes": {"description": T, "stages": [STEP], "conditions": L, "risks": L, "dependencies": L,
                      "uncertainties": L}}]}],
        "retro_dropped": [{"id": V, "reason": T}], "open_questions": L,
    },
    "teamplanner": {
        "kind": V, "quarter": V, "team": V, "po": V, "status": V, "updated": V, "scope": {"file": V}, "roles": L,
        "jira_project": V,
        "teams": [{"id": V, "name": V, "external": V, "people": [{"name": V, "role": V}]}],
        "objectives": [{"id": V, "title": V, "krs": [{
            "id": V, "title": V, "pbv": V, "tag": V, "category": V, "epic": V, "jira_key": V, "teams": L, "owner": V,
            "result": T, "comment": T, "details": V,
            "steps": [{"role": V, "title": V, "ext": V, "who": V, "start": V, "end": V, "status": V,
                       "progress": V, "days": V, "result": T, "action": T, "comment": T, "jira_key": V}]}]}],
    },
    "present": {
        "kind": V, "quarter": V, "team": V, "po": V, "status": V, "updated": V, "teamplanner": {"file": V},
        "message": T, "retro_note": T, "objectives": [{"id": V, "message": T}],
        "risks": [{"category": V, "title": T, "detail": T, "kr": V}],
        "sprints": [{"name": V, "start": V, "end": V}], "sprint_weeks": V,
        "how": L, "asks": L, "skip": L,
    },
}


def _scalar(value):
    return value is None or isinstance(value, (str, int, float, bool))


def shape_errors(doc, spec=None, where=""):
    """Несовпадения со структурой: [«objectives[0].krs: ожидается список, получено строка»]."""
    if spec is None:
        kind = doc.get("kind")
        spec = SHAPES.get(kind) if isinstance(kind, str) else None
        if spec is None:
            return ["kind: ожидается 'retro', 'scope' или 'teamplanner'"]
    names = {str: "строка", int: "число", float: "число", bool: "true/false", list: "список", dict: "объект"}
    got = lambda v: names.get(type(v), type(v).__name__)
    out = []
    for key, sub in spec.items():
        value = doc.get(key)
        at = f"{where}.{key}" if where else key
        if value is None:
            continue
        if sub is V and not _scalar(value):
            out.append(f"{at}: ожидается значение, получено {got(value)}")
        elif sub is T and not (_scalar(value) or (isinstance(value, list) and all(_scalar(v) for v in value))):
            out.append(f"{at}: ожидается текст или список строк, получено {got(value)}")
        elif sub is L and not (isinstance(value, list) and all(isinstance(v, str) for v in value)):
            out.append(f"{at}: ожидается список строк [\"…\"], получено {got(value)}")
        elif isinstance(sub, dict):
            if not isinstance(value, dict):
                out.append(f"{at}: ожидается объект {{...}}, получено {got(value)}")
            else:
                out += shape_errors(value, sub, at)
        elif isinstance(sub, list):
            if not isinstance(value, list):
                out.append(f"{at}: ожидается список [...], получено {got(value)}")
                continue
            for i, item in enumerate(value):
                if not isinstance(item, dict):
                    out.append(f"{at}[{i}]: ожидается объект {{...}}, получено {got(item)}")
                else:
                    out += shape_errors(item, sub[0], f"{at}[{i}]")
    return out


def load_checked(path, kind=None):
    """load + проверка структуры. Для render/seed/csv: сломанная структура — стоп с перечнем."""
    doc = load(path)
    if kind and doc.get("kind") != kind:
        raise SystemExit(f"{path}: ожидается kind={kind!r}, получено {doc.get('kind')!r}")
    errors = shape_errors(doc)
    if errors:
        raise SystemExit(f"{path}: структура не совпадает со схемой —\n  " + "\n  ".join(errors))
    return doc


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
    """JSON-документ. Нет файла, битый JSON, не объект — понятная ошибка вместо трейсбэка."""
    try:
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
    except FileNotFoundError:
        raise SystemExit(f"{path}: файл не найден")
    except json.JSONDecodeError as e:
        raise SystemExit(f"{path}: не JSON — строка {e.lineno}, позиция {e.colno}: {e.msg}")
    if not isinstance(doc, dict):
        raise SystemExit(f"{path}: ожидается JSON-объект {{...}}, получено {type(doc).__name__}")
    return doc


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


def category_of(item):
    return text(item.get("category"))


def check_category(item, where, rep):
    if category_of(item) not in CATEGORIES:
        rep.error(f"{where}: category — Change, Run, Disrupt или пусто, получено {item.get('category')!r}")


def epic_of(kr):
    """Эпик в JIRA для KR TeamPlanner: задан — он; иначе ACTIVITY — бессрочный, остальное — enabler."""
    value = text(kr.get("epic"))
    if value in ("enabler", "epic"):
        return value
    return "epic" if text(kr.get("tag")) == "ACTIVITY" else "enabler"


def category_badge(item):
    cat = category_of(item)
    return f'<span class="crd" data-v="{cat.lower()}">{cat}</span> ' if cat in CATEGORIES[1:] else ""


def check_pbv(item, where, rep, required):
    pbv = item.get("pbv")
    if pbv is None:
        if required:
            rep.gate(f"{where}: нет PBV")
        return
    if not isinstance(pbv, int) or isinstance(pbv, bool) or not 1 <= pbv <= 9:
        rep.error(f"{where}: PBV — целое 1..9, получено {pbv!r}")


def load_linked(path, kind):
    """Связанный документ (Retro для Scope, Scope для TeamPlanner): (doc, None) или
    (None, почему не годится) — без трейсбэка и без остановки проверки."""
    if not os.path.exists(path):
        return None, "не найден"
    try:
        doc = load(path)
    except SystemExit as e:
        return None, f"не читается — {str(e).split(': ', 1)[-1]}"
    if doc.get("kind") != kind:
        return None, f"не {kind} (kind={doc.get('kind')!r})"
    if shape_errors(doc):
        return None, "не проходит проверку структуры — сначала lint этого файла"
    return doc, None


def resolve_retro(doc, doc_path, retro_path):
    """(retro, проблема). Явный --retro и retro.file рядом со Scope проверяются одинаково."""
    if retro_path:
        return load_linked(retro_path, "retro")
    ref = text((doc.get("retro") or {}).get("file"))
    if not ref:
        return None, None
    return load_linked(os.path.join(os.path.dirname(os.path.abspath(doc_path)), ref), "retro")


def lint_scope(doc, rep, retro, retro_problem=None):
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
    if retro_problem:
        rep.gate(f"retro: файл {text(retro_ref.get('file')) or 'из --retro'} {retro_problem}")

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
            check_category(ini, where, rep)
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
                lint_notes(ini, where, roles, rep, any(t.get("external") for t in teams))

    active = [i for i in all_initiatives if taken(i)]
    if len([i for i in active if i.get("tag") != "ACTIVITY"]) > 20:
        rep.warn("Всего больше 20 инициатив — у квартала нет фокуса")
    critical = [text(i.get("id")) for i in active if i.get("pbv") == 9]
    if len(critical) > 2:
        rep.warn(f"PBV 9 у {len(critical)} инициатив ({', '.join(critical)}), рекомендуется не больше 2")

    lint_retro_link(doc, all_initiatives, retro, rep)


def lint_notes(ini, where, roles, rep, has_external=True):
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
        if stage.get("ext") and not has_external:
            rep.error(f"{where}, этап {n}: ext — этап смежной команды, но в teams нет команды с external: true")
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
    kind = doc.get("kind")
    rep = Report(final or doc.get("status") == "принято")
    shape = shape_errors(doc)
    if shape:
        rep.errors += shape
        return rep
    if doc.get("status", "черновик") not in STATUSES:
        rep.error(f"status: одно из {STATUSES}")
    if kind == "retro":
        lint_retro(doc, rep)
    elif kind == "scope":
        lint_scope(doc, rep, *resolve_retro(doc, path, retro_path))
    elif kind == "teamplanner":
        lint_teamplanner(doc, rep, path)
    elif kind == "present":
        lint_present(doc, rep, path)
    else:
        rep.error("kind: ожидается 'retro', 'scope', 'teamplanner' или 'present'")
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
    line = [category_of(ini), f"PBV {ini.get('pbv') if is_int(ini.get('pbv')) else '—'}", names, origin]
    if cancelled(ini):
        line.insert(0, "отменено")
    else:
        line.insert(0, IN_QUARTER_TEXT.get(ini.get("in_quarter"), IN_QUARTER_TEXT[None]))
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
    by_cat = [sum(1 for i in chosen if category_of(i) == c) for c in CATEGORIES]
    quote.append("Тип: " + " · ".join(f"{c} {n}" for c, n in zip(CATEGORIES[1:], by_cat[1:]))
                 + (f" · без типа {by_cat[0]}" if by_cat[0] else "") + ".")
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
                   f'<td class="name">{category_badge(ini)}<span class="txt">{"[" + esc(tag) + "] " if tag else ""}{esc_unc(ini.get("title"))}</span>'
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
    doc = load_checked(path)
    if doc.get("kind") == "retro":
        page_html = render_retro(doc, path)
    elif doc.get("kind") == "scope":
        page_html = render_scope(doc, path, resolve_retro(doc, path, None)[0])
    elif doc.get("kind") == "teamplanner":
        page_html = render_teamplanner(doc, path)
    elif doc.get("kind") == "present":
        page_html = render_present(doc, path)
    else:
        raise SystemExit("kind: ожидается 'retro', 'scope', 'teamplanner' или 'present'")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page_html)


# ---------------------------------------------------------------- TeamPlanner: заметки KR (rich text)

# Заметки KR («Детальнее») — HTML из этих тегов, без атрибутов. Всё прочее
# редактор вычищает при сохранении, а скрипт — при сборке страницы.
RICH_TAGS = {"h3", "p", "b", "strong", "i", "em", "ul", "ol", "li", "br"}
RICH_BLOCKS = {"h3", "p", "ul", "ol", "li", "div"}
RICH_DROP = {"script", "style", "template", "iframe", "object"}


class _Rich(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.text, self.bad, self.skip = [], [], [], 0

    def handle_starttag(self, tag, attrs):
        if tag in RICH_DROP:
            self.skip += 1
        if self.skip:
            return
        if tag not in RICH_TAGS or attrs:
            self.bad.append(tag)
        clean = "p" if tag == "div" else tag
        if clean in RICH_TAGS:
            self.out.append(f"<{clean}>")
        if tag == "br":
            self.text.append("\n")
        elif tag == "li":
            self.text.append("\n- ")
        elif tag in RICH_BLOCKS:
            self.text.append("\n")

    def handle_endtag(self, tag):
        if tag in RICH_DROP:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        clean = "p" if tag == "div" else tag
        if clean in RICH_TAGS and clean != "br":
            self.out.append(f"</{clean}>")
        if tag in RICH_BLOCKS:
            self.text.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(html.escape(data, quote=False))
            self.text.append(data)


def rich(value):
    parser = _Rich()
    parser.feed(text(value))
    parser.close()
    return parser


def rich_html(value):
    """Безопасный HTML заметки: только теги из RICH_TAGS, без атрибутов."""
    return "".join(rich(value).out)


def rich_text(value):
    """Заметка простым текстом для CSV: блоки — строками, пункты списка — «- ».
    То же правило — в teamplanner.js (richText)."""
    lines = (line.strip() for line in "".join(rich(value).text).split("\n"))
    return "\n".join(line for line in lines if line)


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


def role_text(step):
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

def seed(scope_path, out, force=False):
    if os.path.exists(out) and not force:
        raise SystemExit(f"{out} уже есть — заготовка перезаписала бы правки техлидов. "
                         "Продолжай с ним; начать заново — --force")
    scope = load_checked(scope_path, "scope")
    if scope.get("status") != "принято":
        raise SystemExit("Заготовка TeamPlanner собирается только из принятого Scope (kind=scope, status=принято)")
    # Связь с Retro заготовке не нужна; всё остальное из lint --final — нужно.
    errors = [e for e in lint(scope_path, final=True).errors if not e.startswith("retro: файл")]
    if errors:
        raise SystemExit("Scope не проходит lint --final — заготовка по нему потеряла бы KR или этапы:\n  "
                         + "\n  ".join(errors))
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
            # Этап смежной команды (ext: true) — на её команду из инициативы, иначе на первую внешнюю.
            ext_team = next((t for t in ini.get("teams") or [] if t in external), external[0] if external else "")
            steps = [{"role": text(st.get("role")), "title": text(st.get("title")) or text(ini.get("title")),
                      "ext": ext_team if st.get("ext") else "", "who": "", "start": "", "end": "",
                      "status": text(st.get("status")) or "TODO", "result": "", "action": "", "comment": ""}
                     for st in notes.get("stages") or []]
            if not steps and needs_bft_only(ini):
                steps = [{"role": "PO", "title": BFT_STEP_TITLE, "ext": "", "who": "", "start": "", "end": "",
                          "status": "TODO", "result": "", "action": "", "comment": ""}]
            context = [f"Риск: {text(r)}" for r in notes.get("risks") or []]
            context += [f"Зависимость: {text(d)}" for d in notes.get("dependencies") or []]
            krs.append({"id": text(ini.get("id")), "title": text(ini.get("title")), "pbv": ini.get("pbv"),
                        "tag": text(ini.get("tag")), "category": category_of(ini),
                        "epic": "epic" if text(ini.get("tag")) == "ACTIVITY" or obj.get("activity") else "enabler", "teams": ini.get("teams") or [], "owner": text(scope.get("po")),
                        "result": text(ini.get("result")), "comment": "; ".join(context), "steps": steps})
        if krs:
            objectives.append({"id": text(obj.get("id")), "title": text(obj.get("title")), "krs": krs})
    doc = {"kind": "teamplanner", "quarter": scope.get("quarter"), "team": scope.get("team"),
           "po": scope.get("po"), "status": "черновик", "updated": scope.get("updated"),
           "scope": {"file": os.path.basename(scope_path)},
           # Роли Scope, которых нет в полном цикле, сохраняются: этапы из /okr-stages с ними валидны.
           "roles": TP_ROLES + [r for r in scope.get("roles") or [] if r not in TP_ROLES],
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
    project = text(doc.get("jira_project"))
    if project and not re.match(r"^[A-Z][A-Z0-9_]+$", project):
        rep.error(f"jira_project: ключ проекта JIRA заглавными латинскими, получено {project!r}")
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
        if not text(kr.get("title")):
            rep.error(f"{where}: нет названия")
        check_category(kr, where, rep)
        if text(kr.get("epic")) not in ("", "enabler", "epic"):
            rep.error(f"{where}: epic — enabler, epic или пусто")
        for item, at in [(kr, where)] + [(st, f"{where}, этап {m}") for m, st in enumerate(kr.get("steps") or [], 1)]:
            if text(item.get("jira_key")) and not JIRA_KEY_RE.match(text(item.get("jira_key"))):
                rep.error(f"{at}: jira_key — ключ JIRA вида ABC-123, получено {item.get('jira_key')!r}")
        if kr.get("details") is not None:
            if not isinstance(kr.get("details"), str):
                rep.error(f"{where}: details — строка с HTML заметки")
            elif rich(kr["details"]).bad:
                rep.error(f"{where}: в details недопустимая разметка — только {sorted(RICH_TAGS)} без атрибутов")
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
            if step.get("days") is not None and not is_days(step.get("days")):
                rep.error(f"{at}: days — оценка в днях, число от 0")
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
        scope, problem = load_linked(os.path.join(os.path.dirname(os.path.abspath(path)), scope_file), "scope")
        if problem:
            rep.gate(f"scope: файл {scope_file} {problem}")
        else:
            planned = {text(i.get("id")) for o in scope.get("objectives") or []
                       for i in o.get("initiatives") or [] if not cancelled(i) and i.get("in_quarter") is True}
            for kid in sorted(planned - seen):
                rep.gate(f"KR {kid} идёт в квартал по Scope, но его нет в TeamPlanner")
            for kid in sorted(seen - planned):
                rep.warn(f"KR {kid} нет среди взятых в квартал инициатив Scope")


# ---------------------------------------------------------------- TeamPlanner: HTML

def tp_static(doc):
    """То же без JS: цели, KR и подзадачи списком — читается и печатается."""
    parts = []
    for obj in doc.get("objectives") or []:
        parts.append(f'<h2 class="obj">OBJ {esc(obj.get("id"))} — {esc(obj.get("title"))}</h2>')
        for kr in obj.get("krs") or []:
            items = "".join(
                f'<li><span class="t">{esc(role_text(step))}</span> {esc_unc(step.get("title"))}'
                f' — {esc(who_text(doc, kr, step)) or "исполнитель не выбран"}'
                + (f' · {num_text(step_days(step))} дн' if step_days(step) is not None else "") + '</li>'
                for step in kr.get("steps") or [])
            note = f'<div class="kr-details">{rich_html(kr.get("details"))}</div>' if rich_text(kr.get("details")) else ""
            parts.append(f'<details class="kr" open><summary><span class="kr-id">{esc(kr.get("id"))}</span>'
                         f'<span class="et" data-v="{epic_of(kr)}">{"ЭПИК" if epic_of(kr) == "epic" else "ENABLER"}</span>'
                         f'<span class="kr-title">{category_badge(kr)}{esc(jira_summary(kr))}</span>'
                         + (f' <span class="jk">{esc(kr.get("jira_key"))}</span>' if text(kr.get("jira_key")) else "")
                         + f'</summary>'
                         f'{note}<ul class="tp-static">{items}</ul></details>')
    return "\n".join(parts)


def render_teamplanner(doc, source):
    quarter, team = text(doc.get("quarter")), text(doc.get("team"))
    title = f"TEAMPLANNER {quarter}" + (f" — {team}" if team else "")
    data = json.dumps({"file": os.path.basename(source), "doc": doc, "roles": doc.get("roles") or TP_ROLES,
                       "statuses": STATUS_RU}, ensure_ascii=False).replace("<", "\\u003c")
    body = "\n".join([
        '<div class="rail"><button class="rail-tab" id="tpTab" type="button" data-drawer="tpDrawer">Цели</button>'
        '<button class="rail-tab" id="tpTeamTab" type="button" data-drawer="tpTeamDrawer">Команда</button></div>'
        '<div class="drawer" id="tpDrawer"><div class="drawer-head"><h4>Цели</h4>'
        '<button class="drawer-close" type="button">×</button></div><div id="tpObjs"></div></div>'
        '<div class="drawer" id="tpTeamDrawer"><div class="drawer-head"><h4>Команда</h4>'
        '<button class="drawer-close" type="button">×</button></div>'
        '<p class="drawer-hint">Команда · тип · ФИО. Из этого состава выбирают исполнителей подзадач.</p>'
        '<div id="tpPeople"></div><datalist id="tpTeamNames"></datalist></div>',
        '<div class="layout wide"><main>',
        '<div class="tp-top"><h2 class="obj" id="tpObj"></h2><div class="tp-act">'
        '<button type="button" id="bTsv">Копировать в Sheets</button>'
        '<button type="button" class="primary" id="bJson">Скачать JSON</button></div></div>',
        '<p class="tp-sum" id="tpSum"></p>',
        '<p class="tp-dirty" id="tpDirty" hidden>Есть правки в этом браузере — «Скачать JSON» и отдайте файл агенту. '
        '<button type="button" id="bReset">Сбросить</button></p>',
        '<p class="tp-dirty" id="tpStale" hidden>В этом браузере есть правки к прошлой версии файла — к этой они не '
        'применены. <button type="button" id="bStaleGet">Скачать их</button> · '
        '<button type="button" id="bStaleDrop">Отбросить</button></p>',
        f'<div id="tp">{tp_static(doc)}</div>',
        '</main></div>',
        '<div class="basket" id="tpNotes" hidden><button type="button" class="basket-btn" id="tpNotesBtn" '
        'title="Комментарии для ИИ-агента: правый клик по цели, KR или подзадаче">Заметки <span id="tpNotesN">0</span></button>'
        '<div class="basket-box" id="tpNotesBox" hidden><div id="tpNotesList"></div><div class="basket-act">'
        '<button type="button" class="primary" id="tpNotesCopy">Скопировать для агента</button>'
        '<button type="button" id="tpNotesSave">Файлом</button>'
        '<button type="button" id="tpNotesClear">Очистить</button></div></div></div>',
        '<div class="scrim" id="scrim"></div><div class="side" id="side"><div class="side-head">'
        '<span class="kr-id" id="sideKr"></span><button class="drawer-close" id="sideClose" type="button">×</button></div>'
        '<h3 class="side-title" id="sideTitle"></h3>'
        '<div class="rt-bar" id="rtBar">'
        '<button type="button" data-cmd="formatBlock" data-arg="h3">Заголовок</button>'
        '<button type="button" data-cmd="formatBlock" data-arg="p">Текст</button>'
        '<button type="button" data-cmd="bold"><b>Ж</b></button>'
        '<button type="button" data-cmd="italic"><i>К</i></button>'
        '<button type="button" data-cmd="insertUnorderedList">• список</button>'
        '<button type="button" data-cmd="insertOrderedList">1. список</button></div>'
        '<div class="rt" id="rt" contenteditable="true" role="textbox" aria-multiline="true"></div>'
        '<p class="hintline">Мнения, ожидания, границы и всё, что поможет спланировать. Сохраняется в этом '
        'браузере; в документ — через «Скачать JSON».</p></div>',
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
                         "Комментарий": "\n".join(x for x in (text(kr.get("result")), text(kr.get("comment")),
                                                             rich_text(kr.get("details"))) if x),
                         "Исполнитель": text(kr.get("owner")), "Начало": start, "Конец": end,
                         "Статус": STATUS_RU[kr_status(kr)], "Прогресс, %": "" if pct is None else pct,
                         "Оценка, дн": "" if kr_days(kr) is None else num_text(kr_days(kr))})
            for step in kr.get("steps") or []:
                rows.append({"Название": f"{text(step.get('title'))} ({role_text(step)})",
                             "Комментарий": text(step.get("comment")), "Роль": role_text(step),
                             "Исполнитель": who_text(doc, kr, step),
                             "Начало": text(step.get("start")), "Конец": text(step.get("end")),
                             "Статус": STATUS_RU.get(text(step.get("status")) or "TODO", ""),
                             "Прогресс, %": step_pct(step),
                             "Образ результата": text(step.get("result")), "Образ действия": text(step.get("action")),
                             "Оценка, дн": "" if step_days(step) is None else num_text(step_days(step))})
    return rows


def export_csv(path, out):
    rep = lint(path)
    if rep.errors:
        raise SystemExit("TeamPlanner не проходит проверку: " + "; ".join(rep.errors))
    doc = load(path)
    if doc.get("kind") != "teamplanner":
        raise SystemExit(f"{path}: csv собирается из TeamPlanner (kind=teamplanner)")
    rows = tp_rows(doc)
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=TEAMPLANNER_COLUMNS, delimiter=";", restval="")
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


# ---------------------------------------------------------------- JIRA: перенос из TeamPlanner

# В JIRA уходит принятый TeamPlanner: KR — эпик (enabler — инициатива, закрывается
# БФТ; epic — бессрочный), этап — история. Ключи созданных задач пишутся в
# TeamPlanner (jira_key) — повторный перенос их пропускает.
JIRA_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]+-\d+$")
JIRA_CSV_COLUMNS = ["Issue Id", "Parent Id", "Issue Type", "Summary", "Epic Name", "Labels", "Description"]


def jira_summary(item):
    tag = text(item.get("tag"))
    return (f"[{tag}] " if tag else "") + text(item.get("title"))


def story_summary(step):
    return f"[{role_text(step)}] {text(step.get('title'))}"


def days_note(step):
    return f"Оценка: {num_text(step_days(step))} дн." if step_days(step) is not None else ""


def jira_ready(path):
    """Пускает к переносу: TeamPlanner принят, проходит lint --final, указан проект JIRA."""
    doc = load_checked(path, "teamplanner")
    problems = []
    if doc.get("status") != "принято":
        problems.append("TeamPlanner не принят — покажи страницу PO и дождись явного «да» "
                        "(после него status: \"принято\")")
    if not text(doc.get("jira_project")):
        problems.append("jira_project: не указан проект JIRA (ключ, например VIT)")
    problems += lint(path, final=True).errors
    return problems


def jira_csv(path, out):
    """CSV для импорта JIRA: KR — Epic, этап — Story (Parent Id), только из принятого TeamPlanner."""
    problems = jira_ready(path)
    if problems:
        raise SystemExit("Не готово к переносу:\n  " + "\n  ".join(problems))
    doc = load(path)
    quarter = text(doc.get("quarter"))
    rows, n = [], 0
    for _, kr in tp_krs(doc):
        n += 1
        eid = n
        labels = [f"OKR-{quarter}", f"KR-{text(kr.get('id'))}", "epic-" + epic_of(kr)]
        labels += [category_of(kr)] if category_of(kr) else []
        labels += [f"PBV-{kr.get('pbv')}"] if is_int(kr.get("pbv")) else []
        desc = "\n".join(x for x in (text(kr.get("result")), text(kr.get("comment")), rich_text(kr.get("details"))) if x)
        rows.append({"Issue Id": eid, "Issue Type": "Epic", "Summary": jira_summary(kr), "Epic Name": jira_summary(kr),
                     "Labels": " ".join(labels), "Description": desc})
        for step in kr.get("steps") or []:
            n += 1
            rows.append({"Issue Id": n, "Parent Id": eid, "Issue Type": "Story", "Summary": story_summary(step),
                         "Labels": f"OKR-{quarter} KR-{text(kr.get('id'))}",
                         "Description": "\n".join(x for x in (text(step.get("result")), text(step.get("action")),
                                                              text(step.get("comment")), days_note(step)) if x)})
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=JIRA_CSV_COLUMNS, restval="")
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


# ---------------------------------------------------------------- Презентация квартала команде

# Презентация — .pptx в формате отчёта-экватора (/okr-equator): от общего к частному.
# Вводная → Ретро по каждой цели → Планы по каждой цели. Здесь считаются все факты
# (payload), рисует слайды skills/okr-present/scripts/build_present_pptx.js.
PRESENT_SLIDES = {"retro": "часть «Ретро» и «Результаты прошлого»", "risks": "актуальные риски",
                  "sprints": "инициативы по спринтам", "gantt": "GANTT по сотрудникам", "asks": "что нужно от команды"}
RISK_CATEGORIES = ["Внешнее", "Ресурс", "Срок", "Зависимость", "Организация", "Техническое", "Общее"]
MONTHS_RU = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь",
             "октябрь", "ноябрь", "декабрь"]
OUTCOME_RU = {"done": "закрыт", "partial": "частично", "failed": "не сделан", "dropped": "отменён",
              "unknown": "нет оценки"}


def present_sources(doc, path):
    """(teamplanner, scope, retro, проблемы). Цепочка ссылок: презентация → TeamPlanner →
    Scope → Retro; каждый файл ищется рядом с тем, кто на него ссылается."""
    problems = {}
    tp = scope = retro = None
    tp_file = text((doc.get("teamplanner") or {}).get("file"))
    if not tp_file:
        problems["teamplanner"] = "teamplanner.file: не указан файл TeamPlanner"
        return tp, scope, retro, problems
    tp_path = os.path.join(os.path.dirname(os.path.abspath(path)), tp_file)
    tp, problem = load_linked(tp_path, "teamplanner")
    if problem:
        problems["teamplanner"] = f"teamplanner: файл {tp_file} {problem}"
        return tp, scope, retro, problems
    scope_file = text((tp.get("scope") or {}).get("file"))
    if scope_file:
        scope_path = os.path.join(os.path.dirname(tp_path), scope_file)
        scope, problem = load_linked(scope_path, "scope")
        if problem:
            problems["scope"] = f"scope: файл {scope_file} {problem}"
        else:
            retro_file = text((scope.get("retro") or {}).get("file"))
            if retro_file:
                retro, problem = load_linked(os.path.join(os.path.dirname(scope_path), retro_file), "retro")
                if problem:
                    problems["retro"] = f"retro: файл {retro_file} {problem}"
    return tp, scope, retro, problems


def present_sprints(doc, quarter):
    """Спринты квартала: из sprints документа или по sprint_weeks (по умолчанию 2 недели)
    от начала квартала; короткий хвост присоединяется к последнему спринту."""
    import datetime
    given = [s for s in doc.get("sprints") or [] if isinstance(s, dict)]
    if given:
        return [{"name": text(s.get("name")) or f"Спринт {n}", "start": text(s.get("start")), "end": text(s.get("end"))}
                for n, s in enumerate(given, 1)]
    bounds = quarter_bounds(quarter)
    if not bounds:
        return []
    weeks = doc.get("sprint_weeks") if is_int(doc.get("sprint_weeks")) and 1 <= doc.get("sprint_weeks") <= 6 else 2
    day = datetime.date.fromisoformat(bounds[0])
    last = datetime.date.fromisoformat(bounds[1])
    out = []
    while day <= last:
        end = min(day + datetime.timedelta(days=7 * weeks - 1), last)
        # Хвост короче полуспринта — не отдельный спринт, а продолжение последнего.
        if (last - end).days < max(7, 7 * weeks * 0.6):
            end = last
        out.append({"name": f"Спринт {len(out) + 1}", "start": day.isoformat(), "end": end.isoformat()})
        day = end + datetime.timedelta(days=1)
    return out


def lint_present(doc, rep, path):
    quarter = text(doc.get("quarter"))
    if not QUARTER_RE.match(quarter):
        rep.error(f"quarter: ожидается формат ГГГГQn, получено {doc.get('quarter')!r}")
    tp, scope, retro, problems = present_sources(doc, path)
    if "teamplanner" in problems:
        rep.error(problems["teamplanner"])
    for key in ("scope", "retro"):
        if key in problems:
            rep.warn(problems[key] + " — слайды из него не попадут в презентацию")
    if tp:
        if text(tp.get("quarter")) != quarter:
            rep.error(f"quarter: {quarter!r}, а TeamPlanner — за {text(tp.get('quarter'))!r}")
        if tp.get("status") != "принято":
            rep.gate("TeamPlanner не принят — команде показывают принятый план")
        if lint(os.path.join(os.path.dirname(os.path.abspath(path)),
                             text((doc.get("teamplanner") or {}).get("file")))).errors:
            rep.error("TeamPlanner не проходит lint — сначала почини его")
        ids = {text(o.get("id")) for o in tp.get("objectives") or []}
        for n, obj in enumerate(doc.get("objectives") or [], 1):
            if text(obj.get("id")) not in ids:
                rep.error(f"objectives[{n}]: цели {obj.get('id')!r} нет в TeamPlanner")
        kr_ids = {text(kr.get("id")) for _, kr in tp_krs(tp)}
        for n, risk in enumerate(doc.get("risks") or [], 1):
            where = f"risks[{n}]"
            if not text(risk.get("title")):
                rep.error(f"{where}: нет title — в чём риск")
            if text(risk.get("category")) and text(risk.get("category")) not in RISK_CATEGORIES:
                rep.error(f"{where}: category — одно из {RISK_CATEGORIES}")
            if text(risk.get("kr")) and text(risk.get("kr")) not in kr_ids:
                rep.error(f"{where}: KR {risk.get('kr')!r} нет в TeamPlanner")
    if scope and scope.get("status") != "принято":
        rep.gate("Scope не принят — команде показывают принятый план")
    for value in doc.get("skip") or []:
        if text(value) not in PRESENT_SLIDES:
            rep.error(f"skip: {value!r} — одно из {sorted(PRESENT_SLIDES)}")
    sprints = present_sprints(doc, quarter)
    for n, sp in enumerate(doc.get("sprints") or [], 1):
        if not isinstance(sp, dict) or not DATE_RE.match(text(sp.get("start"))) or not DATE_RE.match(text(sp.get("end"))):
            rep.error(f"sprints[{n}]: нужны start и end — даты ГГГГ-ММ-ДД")
        elif text(sp.get("start")) > text(sp.get("end")):
            rep.error(f"sprints[{n}]: начало позже конца")
    if doc.get("sprint_weeks") is not None and not (is_int(doc.get("sprint_weeks")) and 1 <= doc.get("sprint_weeks") <= 6):
        rep.error("sprint_weeks: целое 1..6 — длина спринта в неделях")
    if len(sprints) > 8:
        rep.warn(f"спринтов {len(sprints)} — таблица по спринтам будет тесной, укрупни sprint_weeks")
    if not text(doc.get("message")):
        rep.gate("message: нет главной мысли квартала — одно предложение для титула")


def day_index(date, bounds):
    """Доля квартала (0..1) для даты ГГГГ-ММ-ДД; за границами — к краю; не дата — None."""
    import datetime
    try:
        day = datetime.date.fromisoformat(text(date))
        start = datetime.date.fromisoformat(bounds[0])
        end = datetime.date.fromisoformat(bounds[1])
    except ValueError:
        return None
    span = (end - start).days + 1
    return round(min(max((day - start).days / span, 0.0), 1.0), 4)


def short_date(date):
    """2026-10-05 → 05.10; не дата — как есть."""
    date = text(date)
    return f"{date[8:10]}.{date[5:7]}" if DATE_RE.match(date) else date


def months_of(quarter):
    bounds = quarter_bounds(quarter)
    if not bounds:
        return []
    first = int(bounds[0][5:7])
    return [MONTHS_RU[first - 1 + k] for k in range(3)]


def retro_part(retro):
    """Ретро прошлого квартала: по каждой цели — исходы KR, что сделали, что осталось, что дальше."""
    quarter = text(retro.get("next_quarter"))

    def counts(krs):
        c = {k: sum(1 for kr in krs if outcome(kr) == k) for k in OUTCOME_RU}
        c["total"] = len(krs)
        return c

    objectives, all_krs = [], []
    for obj in retro.get("objectives") or []:
        krs = obj.get("krs") or []
        all_krs += krs
        rows = []
        for kr in krs:
            plan = kr.get("plan") or []
            step = lambda s: text(s.get("step") or s.get("title"))
            done = [step(s) for s in plan if text(s.get("status")) == "DONE" and step(s)]
            left = [step(s) for s in plan if text(s.get("status")) != "DONE" and step(s)]
            rows.append({"kr": text(kr.get("id")), "title": text(kr.get("title")),
                         "pbv": kr.get("pbv") if is_int(kr.get("pbv")) else None,
                         "outcome": outcome(kr), "result": fact_text(kr),
                         "done": done, "left": left, "next": next_text(kr, quarter)})
        st = retro_stats({"objectives": [obj]})
        objectives.append({"code": f"OBJ {text(obj.get('id'))}", "name": text(obj.get("title")),
                           "goal": text(obj.get("outcome")), "weighted": st["weighted"],
                           "counts": counts(krs), "rows": rows})
    total = retro_stats(retro)
    return {"quarter": text(retro.get("quarter")), "weighted": total["weighted"],
            "counts": counts(all_krs), "objectives": objectives}


def quarter_weeks(quarter):
    """Недели квартала: по 7 дней от первого дня; хвост короче недели — в последнюю."""
    import datetime
    bounds = quarter_bounds(quarter)
    if not bounds:
        return []
    start = datetime.date.fromisoformat(bounds[0])
    days = (datetime.date.fromisoformat(bounds[1]) - start).days + 1
    count = max(days // 7, 1)
    return [(start + datetime.timedelta(days=7 * k)).isoformat() for k in range(count)]


def week_of(date, weeks):
    """Номер недели квартала для даты; за границами — крайняя неделя; не дата — None."""
    import datetime
    if not weeks or not DATE_RE.match(text(date)):
        return None
    try:
        day = datetime.date.fromisoformat(text(date))
    except ValueError:
        return None
    k = (day - datetime.date.fromisoformat(weeks[0])).days // 7
    return min(max(k, 0), len(weeks) - 1)


def step_weeks(step, weeks):
    """(первая, последняя) неделя подзадачи; одна из дат — точкой; нет дат — (None, None)."""
    a, b = week_of(step.get("start"), weeks), week_of(step.get("end"), weeks)
    if a is None and b is None:
        return None, None
    a = a if a is not None else b
    b = b if b is not None else a
    return min(a, b), max(a, b)


def gantt_people(gantt, n_weeks, tp):
    """GANTT по сотрудникам: строка — человек (или «внешняя команда», «исполнитель не выбран»),
    по неделям — KR, над которыми он работает, и общий статус его подзадач в эту неделю."""
    order = {r: i for i, r in enumerate(tp.get("roles") or TP_ROLES)}
    people = {}
    for st in gantt:
        who = st["who"]
        kind = "ext" if who.startswith("внешний ресурс") else "none" if who in ("нет роли в команде", "исполнитель не выбран") else "person"
        key = who if kind != "none" else f"{who} · {st['role']}"
        p = people.setdefault(key, {"who": who, "kind": kind, "roles": [], "steps": 0, "days": 0, "undated": 0,
                                    "weeks": [{"krs": [], "status": []} for _ in range(n_weeks)]})
        if st["role"] not in p["roles"]:
            p["roles"].append(st["role"])
        p["steps"] += 1
        p["days"] = round(p["days"] + (st["days"] or 0), 2)
        if st["w0"] is None:
            p["undated"] += 1
            continue
        for k in range(st["w0"], st["w1"] + 1):
            cell = p["weeks"][k]
            if st["kr"] not in cell["krs"]:
                cell["krs"].append(st["kr"])
            cell["status"].append(st["status"])
    out = []
    for p in people.values():
        for cell in p["weeks"]:
            sts = cell.pop("status")
            cell["status"] = ("BLOCKED" if "BLOCKED" in sts else "IN PROGRESS" if "IN PROGRESS" in sts
                              else "DONE" if sts and all(x == "DONE" for x in sts) else "TODO" if sts else "")
        out.append(p)
    rank = {"person": 0, "ext": 1, "none": 2}
    out.sort(key=lambda p: (rank[p["kind"]], min(order.get(r.split("[")[-1].rstrip("]"), 99) for r in p["roles"]), p["who"]))
    return out


def present_payload(doc, path):
    """Все факты презентации одним JSON — рисует build_present_pptx.js. Агент его не пишет."""
    tp, scope, retro, problems = present_sources(doc, path)
    if not tp:
        raise SystemExit(problems.get("teamplanner", "TeamPlanner не найден"))
    quarter = text(doc.get("quarter")) or text(tp.get("quarter"))
    bounds = quarter_bounds(quarter)
    skip = {text(x) for x in doc.get("skip") or []}
    inis = {text(i.get("id")): i for o in (scope or {}).get("objectives") or [] for i in o.get("initiatives") or []}
    scope_objs = {text(o.get("id")): o for o in (scope or {}).get("objectives") or []}
    messages = {text(o.get("id")): text(o.get("message")) for o in doc.get("objectives") or []}
    teams = tp_teams(tp)
    sprints = present_sprints(doc, quarter)
    weeks = quarter_weeks(quarter)
    goal_of = lambda oid: messages.get(oid) or text((scope_objs.get(oid) or {}).get("why"))

    # Риски: курированные PO (risks) — главные; к ним — заметки Scope и внешние команды.
    curated = [{"category": text(r.get("category")) or "Общее", "title": text(r.get("title")),
                "detail": text(r.get("detail")), "kr": text(r.get("kr"))} for r in doc.get("risks") or []]
    derived = []
    for _, kr in tp_krs(tp):
        kid = text(kr.get("id"))
        notes = (inis.get(kid) or {}).get("notes") or {}
        derived += [{"category": "Срок", "title": text(r), "detail": "", "kr": kid} for r in notes.get("risks") or [] if text(r)]
        derived += [{"category": "Зависимость", "title": text(d), "detail": "", "kr": kid}
                    for d in notes.get("dependencies") or [] if text(d)]
        for step in kr.get("steps") or []:
            if text(step.get("ext")):
                team = text(teams.get(text(step.get("ext")), {}).get("name") or step.get("ext"))
                derived.append({"category": "Внешнее", "title": f"{team}: {text(step.get('title'))}",
                                "detail": "", "kr": kid})
    risks = curated + [r for r in derived if r["title"] not in {c["title"] for c in curated}]

    objectives = []
    for obj in tp.get("objectives") or []:
        oid = text(obj.get("id"))
        krs = []
        for kr in sorted(obj.get("krs") or [], key=lambda k: -pbv_of(k)):
            ini = inis.get(text(kr.get("id"))) or {}
            start, end = kr_dates(kr)
            krs.append({"id": text(kr.get("id")), "title": text(kr.get("title")), "tag": text(kr.get("tag")),
                        "category": category_of(kr), "epic": epic_of(kr),
                        "pbv": kr.get("pbv") if is_int(kr.get("pbv")) else None,
                        "result": text(kr.get("result")) or text(ini.get("result")),
                        "owner": text(kr.get("owner")), "start": short_date(start), "end": short_date(end),
                        "a": day_index(start, bounds) if start and bounds else None,
                        "b": day_index(end, bounds) if end and bounds else None,
                        "days": kr_days(kr), "status": kr_status(kr), "steps": len(kr.get("steps") or []),
                        "from_retro": bool(ini.get("from_retro"))})
        gantt = []
        for kr in obj.get("krs") or []:
            for step in kr.get("steps") or []:
                start, end = text(step.get("start")), text(step.get("end"))
                w0, w1 = step_weeks(step, weeks)
                gantt.append({"kr": text(kr.get("id")), "role": role_text(step), "title": text(step.get("title")),
                              "who": who_text(tp, kr, step) or "исполнитель не выбран", "w0": w0, "w1": w1,
                              "dates": " — ".join(short_date(x) for x in (start, end) if x),
                              "days": step_days(step), "status": text(step.get("status")) or "TODO"})
        kr_ids = {k["id"] for k in krs}
        objectives.append({"code": f"OBJ {oid}", "name": text(obj.get("title")), "goal": goal_of(oid),
                           "krs": krs, "gantt": gantt, "people": gantt_people(gantt, len(weeks), tp),
                           "risks": [r for r in risks if r["kr"] in kr_ids]})

    # Спринты: какие роли работают над KR в каждую неделю квартала (подзадачи с датами).
    sprint_rows, undated = [], []
    for obj in tp.get("objectives") or []:
        for kr in sorted(obj.get("krs") or [], key=lambda k: -pbv_of(k)):
            cells = [[] for _ in weeks]
            dated = False
            for step in kr.get("steps") or []:
                w0, w1 = step_weeks(step, weeks)
                if w0 is None:
                    continue
                dated = True
                for k in range(w0, w1 + 1):
                    if role_text(step) not in cells[k]:
                        cells[k].append(role_text(step))
            if dated:
                sprint_rows.append({"obj": text(obj.get("id")), "kr": text(kr.get("id")), "title": text(kr.get("title")),
                                    "weeks": cells})
            else:
                undated.append(f"{text(kr.get('id'))} {text(kr.get('title'))}")

    retro_data = retro_part(retro) if retro and "retro" not in skip else None
    team = text(doc.get("team") or tp.get("team"))
    asks = [{"num": n, "title": text(a)} for n, a in enumerate(doc.get("asks") or [], 1) if text(a)]
    return {
        "meta": {"quarter": quarter, "team": team, "po": text(doc.get("po") or tp.get("po")),
                 "message": text(doc.get("message")), "updated": text(doc.get("updated")),
                 "period": " — ".join(short_date(x) for x in bounds) if bounds else "",
                 "prev_quarter": retro_data["quarter"] if retro_data else "",
                 "retro_note": text(doc.get("retro_note"))},
        "months": months_of(quarter),
        "weeks": [short_date(w) for w in weeks],
        "retro": retro_data,
        "risks": risks if "risks" not in skip else [],
        "roadmap": [{"code": o["code"], "name": o["name"], "items": [
            (f"[{k['tag']}] " if k["tag"] else "") + k["title"] for k in o["krs"]]} for o in objectives],
        "sprints": None if not sprints else {
            "labels": [{"name": sp["name"], "dates": f"{short_date(sp['start'])} — {short_date(sp['end'])}",
                        "w0": week_of(sp["start"], weeks), "w1": week_of(sp["end"], weeks)} for sp in sprints],
            "rows": [] if "sprints" in skip else sprint_rows, "undated": undated},
        "objectives": objectives,
        "gantt": "gantt" not in skip,
        "how": [text(x) for x in doc.get("how") or [] if text(x)],
        "asks": asks if "asks" not in skip else [],
    }


def present_json(path, out):
    """okr-plan.py present: факты презентации в JSON для build_present_pptx.js."""
    doc = load_checked(path, "present")
    rep = lint(path)
    if rep.errors:
        raise SystemExit("Презентация не проходит проверку:\n  " + "\n  ".join(rep.errors))
    payload = present_payload(doc, path)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return payload


# ---------------------------------------------------------------- Презентация: HTML

WORK_TYPES = [("analysis", "аналитика", "аналит.", ("PO", "ADR", "SA", "BA")),
              ("dev", "разработка", "разраб.", ("BE", "FE", "DOPS")),
              ("qa", "тесты", "тесты", ("QA",)),
              ("release", "выкатка", "выкатка", ("RM",)),
              ("ext", "внешние", "внешн.", ())]
P_OUTCOME = [("done", "закрыт", "var(--done)"), ("partial", "частично", "var(--progress)"),
             ("failed", "не сделан", "var(--idle)"), ("dropped", "отменён", "var(--cancel)"),
             ("unknown", "нет оценки", "#fff")]
P_STATUS = {"TODO": ("не начато", "var(--idle)"), "IN PROGRESS": ("в работе", "var(--progress)"),
            "BLOCKED": ("заблокировано", "var(--cancel)"), "DONE": ("готово", "var(--done)")}


def work_of(role):
    role = text(role)
    if role.startswith("EXT["):
        return WORK_TYPES[4]
    return next((w for w in WORK_TYPES if role in w[3]), WORK_TYPES[1])


def qlabel(quarter):
    m = re.match(r"^(\d{4})Q([1-4])$", text(quarter))
    return f"Q{m.group(2)} {m.group(1)}" if m else text(quarter)


def present_html_slides(d):
    """Слайды презентации: (вид для оглавления, название, класс фона, HTML)."""
    m, q = d["meta"], qlabel(d["meta"]["quarter"])
    prev = qlabel(d["retro"]["quarter"]) if d["retro"] else ""
    plan_part = "Часть 2" if d["retro"] else "Часть 1"
    out = []

    def add(kind, title, cls, body):
        out.append((kind, title, cls, body))

    def heading(title, eyebrow=""):
        size = " longer" if len(title) > 60 else " long" if len(title) > 46 else ""
        return (f'<div class="eyebrow">{esc(eyebrow)}</div>' if eyebrow else "") + f'<h2 class="{size.strip()}">{esc(title)}</h2>'

    def hero(kind, eyebrow, title, lead, nxt, cls="dark", stats=""):
        items = "".join(f"<li>{esc(x)}</li>" for x in nxt)
        add(kind, title, f"{cls} hero", f'<div class="hero-in"><div class="eyebrow">{esc(eyebrow)}</div><h1{" class=long" if len(title) > 40 else ""}>{esc(title)}</h1>'
            + (f'<p class="lead">{esc(lead)}</p>' if lead else "")
            + (f'<div class="next"><span>Дальше</span><ol>{items}</ol></div>' if nxt else "") + f"</div>{stats}")

    def legend(items):
        return '<div class="legend">' + "".join(f'<span><i style="background:{c}"></i>{esc(l)}</span>' for l, c in items) + "</div>"

    def stack(parts):
        total = sum(v for v, _ in parts) or 1
        return '<div class="stack">' + "".join(
            f'<span style="width:{v / total * 100:.2f}%;background:{c}">{v if v / total > 0.06 else ""}</span>'
            for v, c in parts if v) + "</div>"

    def stats(items):
        return '<div class="stats">' + "".join(
            f'<div style="border-color:{c}"><b>{esc(v)}</b><span>{esc(l)}</span></div>' for l, v, c in items) + "</div>"

    def chip(textv, color):
        return f'<span class="chip" style="background:{color}">{esc(textv)}</span>'

    def week_grid(label_w, rows_html):
        sprints = (d["sprints"] or {}).get("labels") or []
        head = '<div></div>' + "".join(
            f'<div class="sp" style="grid-column:{sp["w0"] + 2} / {sp["w1"] + 3}">{esc(sp["name"])}<i>{esc(sp["dates"])}</i></div>'
            for sp in sprints if sp["w0"] is not None and sp["w1"] is not None)
        return (f'<div class="scroll-x"><div class="weeks" style="--label:{label_w}px;--n:{len(d["weeks"])}">'
                + head + rows_html + "</div></div>")

    # ---- титул
    add("титул", f"Квартал {q} · {m['team']}", "blue cover",
        f'<h1>Квартал {esc(q)} · {esc(m["team"])}</h1>'
        f'<p class="message">{esc(m["message"] or "Чем занимаемся в квартале, кто за что отвечает и как двигаемся.")}</p>'
        f'<div class="meta">{esc(m["period"])}  ·  PO — {esc(m["po"])}' + (f"  ·  обновлено {esc(m['updated'])}" if m["updated"] else "") + "</div>")

    # ---- вводная
    intro = (["Результаты " + prev] if d["retro"] else []) + (["Актуальные риски и проблемы"] if d["risks"] else []) \
        + ["Верхнеуровневый roadmap"] + (["Инициативы по спринтам"] if d["sprints"] and d["sprints"]["rows"] else [])
    hero("вводная", "Вводная", "Картина квартала", "Откуда идём, что мешает и как раскладываем работу по времени.", intro)
    if d["retro"]:
        r = d["retro"]
        rows = ""
        for o in r["objectives"] + [{"code": "ИТОГО", "name": "", "counts": r["counts"], "total": True}]:
            tr = " total-row" if o.get("total") else ""
            name = o["code"] if o.get("total") else f'{o["code"]} — {o["name"]}'
            parts = [(o["counts"].get(k, 0), c) for k, _, c in P_OUTCOME]
            rows += f'<div class="name{tr}">{esc(name)}</div><div class="{tr.strip()}">{stack(parts)}</div><div class="sum{tr}">{o["counts"]["total"]}</div>'
        note = f'<div class="callout"><b>ВЫВОД</b>{esc(m["retro_note"])}</div>' if m["retro_note"] else ""
        add("вводная", f"Результаты {prev}", "", heading(f"Результаты {prev}", "Вводная · откуда мы идём")
            + '<div class="res-top">' + legend([(l, c) for _, l, c in P_OUTCOME[:4]])
            + f'<div class="big-stat">{esc(str(r["weighted"]) + "%" if r["weighted"] is not None else "—")}<small>ИТОГ ПО PBV</small></div></div>'
            + f'<div class="bars">{rows}</div><div class="foot">{note}</div>')
    if d["risks"]:
        shown = d["risks"][:7]
        rows = "".join(f'<div class="r"><div class="cat">{esc(x["category"])}' + (f' · KR {esc(x["kr"])}' if x["kr"] else "")
                       + f'</div><div class="t">{esc(x["title"])}</div><div class="d">{esc(x["detail"])}</div></div>' for x in shown)
        more = f'<div class="foot"><span class="note">+ ещё {len(d["risks"]) - len(shown)} — в разборе по целям</span></div>' \
            if len(d["risks"]) > len(shown) else ""
        add("вводная", "Актуальные риски и проблемы", "dark",
            heading("Актуальные риски и проблемы", "Вводная") + f'<div class="risk-rows">{rows}</div>{more}')
    cols = "".join(f'<div class="colcard"><div class="head">{esc(c["code"])} · {esc(c["name"])}</div><ul>'
                   + "".join(f"<li>{esc(i)}</li>" for i in c["items"] or ["нет KR в квартале"]) + "</ul></div>" for c in d["roadmap"])
    add("вводная", f"Roadmap {q}", "light", heading(f"Roadmap {q}", "Вводная · верхнеуровнево") + f'<div class="cols">{cols}</div>')
    if d["sprints"] and d["sprints"]["rows"]:
        for n, part in enumerate(chunks(d["sprints"]["rows"], 11)):
            body = ""
            for row in part:
                body += (f'<div class="lbl"><span class="o">{esc(row["obj"]).zfill(2)}</span>'
                         f'<span class="tx">{esc(row["kr"])} {esc(row["title"])}</span></div>')
                for sp in d["sprints"]["labels"]:
                    roles = [x for k in range(sp["w0"], sp["w1"] + 1) for x in row["weeks"][k]]
                    if not roles:
                        continue
                    groups = [w for w in WORK_TYPES if any(work_of(x) is w for x in roles)]
                    label = groups[0][1] if len(groups) == 1 else " + ".join(g[2] for g in groups[:2]) + (" …" if len(groups) > 2 else "")
                    color = {"analysis": "var(--w-analysis)", "dev": "var(--w-dev)", "qa": "var(--w-qa)",
                             "release": "var(--w-release)", "ext": "var(--w-ext)"}[groups[0][0]]
                    body += (f'<div class="cell" style="grid-column:{sp["w0"] + 2} / {sp["w1"] + 3};background:{color}">'
                             f"{esc(label)}</div>")
                body += '<div style="grid-column:1 / -1;height:0"></div>'
            undated = d["sprints"]["undated"] if n == 0 else []
            title = "Инициативы по спринтам" + (" (продолжение)" if n else "")
            add("вводная", title, "", heading(title, "Вводная") + week_grid(470, body)
                + '<div class="foot">' + legend([(w[1], f"var(--w-{w[0]})") for w in WORK_TYPES])
                + (f'<span class="note">сроки не заданы: {esc("; ".join(undated))}</span>' if undated else "") + "</div>")

    # ---- часть 1: ретро
    if d["retro"]:
        r = d["retro"]
        hero("ретро", "Часть 1", f"Ретро {prev}", "Что обещали в прошлом квартале и что из этого вышло.",
             ["Статус по целям"] + [f'{o["code"]} — {o["name"]}' for o in r["objectives"]])
        rows = "".join(
            f'<tr><td class="k">{esc(o["code"])} — {esc(o["name"])}</td>' + "".join(f'<td class="c">{o["counts"][k]}</td>' for k in
                                                                                  ("total", "done", "partial", "failed", "dropped"))
            + f'<td class="c">{esc(str(o["weighted"]) + "%" if o["weighted"] is not None else "—")}</td></tr>' for o in r["objectives"])
        c = r["counts"]
        rows += ('<tr><td class="mono">Итого</td>' + f'<td class="c">{c["total"]}</td>'
                 + "".join(f'<td class="c">{chip(c[k], col)}</td>' for k, _, col in P_OUTCOME[:4])
                 + f'<td class="c">{esc(str(r["weighted"]) + "%" if r["weighted"] is not None else "—")}</td></tr>')
        add("ретро", f"Статус по целям {prev}", "light", heading(f"Статус по целям {prev}", f"Часть 1 · ретро {prev}")
            + '<div class="card-table"><table class="t"><tr><th>Цель</th><th>Всего KR</th><th>Закрыто</th><th>Частично</th>'
              '<th>Не сделано</th><th>Отменено</th><th>Итог по PBV</th></tr>' + rows + "</table></div>")
        for o in r["objectives"]:
            oc = o["counts"]
            hero("ретро", f"Часть 1 · ретро {prev}", f'{o["code"]} — {o["name"]}', f'Цель: {o["goal"]}' if o["goal"] else "",
                 ["Что сделали", "Что осталось", "Что переносим"], cls="light",
                 stats=stats([("всего KR", oc["total"], "var(--dark)"), ("закрыто", oc["done"], "var(--done)"),
                              ("частично", oc["partial"], "var(--progress)"), ("не сделано", oc["failed"], "var(--idle)"),
                              ("отменено", oc["dropped"], "var(--cancel)"),
                              ("итог по PBV", f'{o["weighted"]}%' if o["weighted"] is not None else "—", "var(--accent)")]))
            outc = {k: (l, col) for k, l, col in P_OUTCOME}
            for n, part in enumerate(chunks(o["rows"], 5)):
                rows = "".join(
                    f'<tr><td class="k">{esc(x["kr"])}</td><td>{esc(x["title"])}</td><td class="c">{esc(dash_text(x["pbv"]))}</td>'
                    f'<td>{chip(*outc.get(x["outcome"], outc["unknown"]))}<span class="sub">{esc(x["result"].split(" — ", 1)[-1] if " — " in x["result"] else "")}</span></td>'
                    f'<td class="s">{esc("; ".join(x["done"]) or "—")}</td><td class="s">{esc("; ".join(x["left"]) or "—")}</td>'
                    f'<td class="s">{esc(x["next"])}</td></tr>' for x in part)
                title = f'{o["code"]} — что сделали, что осталось' + (" (продолжение)" if n else "")
                add("ретро", title, "", heading(title, f"Часть 1 · ретро {prev}")
                    + '<table class="t"><tr><th>KR</th><th>Задача</th><th>PBV</th><th>Итог</th><th>Что сделали</th>'
                      '<th>Что осталось</th><th>Переносим</th></tr>' + rows + "</table>")

    # ---- часть 2: планы
    hero("планы", plan_part, f"Планы {q}", m["message"],
         ["Обзор предстоящих работ"] + [f'{o["code"]} — {o["name"]}' for o in d["objectives"]])
    rows = ""
    every = {"krs": [], "gantt": []}
    for o in d["objectives"] + [None]:
        oo = o or every
        if o:
            every["krs"] += o["krs"]
            every["gantt"] += o["gantt"]
        counts = {}
        for st in oo["gantt"]:
            counts[work_of(st["role"])[0]] = counts.get(work_of(st["role"])[0], 0) + 1
        days = round(sum(k["days"] or 0 for k in oo["krs"]), 2)
        open_ = sum(1 for g in oo["gantt"] if g["who"] in ("исполнитель не выбран", "нет роли в команде"))
        info = f'KR {len(oo["krs"])} · {len(oo["gantt"])} подз.' + (f" · {num_text(days)} дн" if days else "") + (f" · без исп. {open_}" if open_ else "")
        tr = "" if o else " total-row"
        rows += (f'<div class="name{tr}">{esc(o["code"] + " — " + o["name"] if o else "ИТОГО")}</div>'
                 f'<div class="{tr.strip()}">{stack([(counts.get(w[0], 0), f"var(--w-{w[0]})") for w in WORK_TYPES])}</div>'
                 f'<div class="sum{tr}" style="white-space:nowrap">{esc(info)}</div>')
    add("планы", f"Предстоящие работы {q}", "", heading(f"Предстоящие работы {q}", f"{plan_part} · планы · обзор")
        + legend([(w[1], f"var(--w-{w[0]})") for w in WORK_TYPES])
        + f'<div class="bars plan" style="margin-top:26px">{rows}</div>'
        + '<div class="foot"><span class="note">Число подзадач по типам работ. Сроки и исполнители — в GANTT по каждой цели.</span></div>')
    for o in d["objectives"]:
        days = round(sum(k["days"] or 0 for k in o["krs"]), 2)
        open_ = sum(1 for g in o["gantt"] if g["who"] in ("исполнитель не выбран", "нет роли в команде"))
        nxt = ["Инициативы"] + (["Известные риски"] if o["risks"] else []) + (["GANTT по сотрудникам"] if d["gantt"] and o["people"] else [])
        hero("планы", f"{plan_part} · планы {q}", f'{o["code"]} — {o["name"]}', f'Цель: {o["goal"]}' if o["goal"] else "", nxt,
             cls="light", stats=stats([("KR", len(o["krs"]), "var(--dark)"), ("подзадач", len(o["gantt"]), "var(--w-dev)"),
                                       ("оценка, дн", num_text(days) if days else "—", "var(--w-analysis)"),
                                       ("людей", sum(1 for p in o["people"] if p["kind"] == "person"), "var(--done)"),
                                       ("без исполнителя", open_, "var(--cancel)"), ("рисков", len(o["risks"]), "var(--hold)")]))
        for n, part in enumerate(chunks(o["krs"], 6)):
            rows = "".join(
                f'<tr><td class="k">{esc(k["id"])}</td><td><b>{esc(("[" + k["tag"] + "] " if k["tag"] else "") + k["title"])}</b>'
                + (f'<span class="sub">{chip("из " + prev, "var(--hold)")}</span>' if k["from_retro"] and prev else "")
                + f'</td><td class="c">{esc(dash_text(k["pbv"]))}</td>'
                f'<td class="s mono">{esc(" · ".join(x for x in (k["category"], "эпик" if k["epic"] == "epic" else "enabler") if x))}</td>'
                f'<td class="s">{esc(k["result"] or "—")}</td><td class="s">{esc(k["owner"] or "—")}</td>'
                f'<td class="s mono">{esc(" — ".join(x for x in (k["start"], k["end"]) if x) or "уточняется")}'
                + (f'<span class="sub">{num_text(k["days"])} дн</span>' if k["days"] is not None else "") + "</td></tr>" for k in part)
            title = f'{o["code"]} · инициативы' + (" (продолжение)" if n else "")
            add("планы", title, "", heading(title, f"{plan_part} · планы {q}")
                + '<table class="t"><tr><th>KR</th><th>Инициатива</th><th>PBV</th><th>Тип</th><th>Образ результата</th>'
                  '<th>Отвечает</th><th>Сроки</th></tr>' + rows + "</table>")
        if o["risks"]:
            rows = "".join(f'<tr><td class="k">{esc(x["category"])}</td><td class="mono">{esc(x["kr"])}</td><td>{esc(x["title"])}</td>'
                           f'<td>{esc(x["detail"]) if x["detail"] else "<span class=muted><i>обсудить на встрече</i></span>"}</td></tr>'
                           for x in o["risks"][:8])
            add("планы", f'{o["code"]} · известные риски', "", heading(f'{o["code"]} · известные риски', f"{plan_part} · планы {q}")
                + '<table class="t"><tr><th>Тип</th><th>KR</th><th>Риск</th><th>Что делаем</th></tr>' + rows + "</table>")
        if d["gantt"] and o["people"]:
            pages = -(-len(o["people"]) // 12)
            for n, part in enumerate(chunks(o["people"], -(-len(o["people"]) // pages))):
                body = ""
                for pr in part:
                    warn = " warn" if pr["kind"] == "none" else ""
                    who = pr["who"].replace("внешний ресурс: ", "внешн. ")
                    body += (f'<div class="lbl"><span class="role">{esc(", ".join(pr["roles"]))}</span><span class="who{warn} tx">{esc(who)}</span>'
                             f'<span class="cnt">{pr["steps"]} подз.' + (f' · {num_text(pr["days"])} дн' if pr["days"] else "")
                             + (f' · без сроков {pr["undated"]}' if pr["undated"] else "") + "</span></div>")
                    k = 0
                    while k < len(pr["weeks"]):
                        c = pr["weeks"][k]
                        if not c["krs"]:
                            k += 1
                            continue
                        e = k
                        while e + 1 < len(pr["weeks"]) and pr["weeks"][e + 1]["krs"] == c["krs"] and pr["weeks"][e + 1]["status"] == c["status"]:
                            e += 1
                        body += (f'<div class="cell m" style="grid-column:{k + 2} / {e + 3};background:{P_STATUS.get(c["status"], P_STATUS["TODO"])[1]}">'
                                 f'{esc(" · ".join(c["krs"]))}</div>')
                        k = e + 1
                    body += '<div style="grid-column:1 / -1;height:0"></div>'
                title = f'{o["code"]} · GANTT по сотрудникам' + (" (продолжение)" if n else "")
                add("планы", title, "", heading(title, f"{plan_part} · планы {q}") + week_grid(520, body)
                    + '<div class="foot">' + legend([(l, col) for l, col in P_STATUS.values()])
                    + '<span class="note">в полосе — номера KR цели</span></div>')

    # ---- финал
    if d["how"] or d["asks"]:
        hero("финал", "Финал", "Как работаем дальше", "", (["Как работаем в квартале"] if d["how"] else [])
             + (["Что нужно от команды"] if d["asks"] else []))
    if d["how"]:
        add("финал", "Как работаем в квартале", "light", heading("Как работаем в квартале", "Процесс")
            + '<div class="numbered">' + "".join(f'<div class="r"><span class="n">{i:02d}</span><span>{esc(t)}</span></div>'
                                                  for i, t in enumerate(d["how"], 1)) + "</div>")
    if d["asks"]:
        add("финал", "Что нужно от команды", "dark", heading("Что нужно от команды", "После встречи")
            + '<div class="numbered">' + "".join(f'<div class="r"><span class="n">{a["num"]}</span><span>{esc(a["title"])}</span></div>'
                                                  for a in d["asks"]) + "</div>")
    return out


def chunks(items, size):
    size = max(1, size)
    return [items[i:i + size] for i in range(0, len(items), size)] or [[]]


def dash_text(value):
    return "—" if value is None or value == "" else str(value)


def render_present(doc, source):
    """Презентация квартала — HTML: слайды из present_payload, навигация как у бизнес-отчёта."""
    d = present_payload(doc, source)
    slides = present_html_slides(d)
    m = d["meta"]
    title = f"Квартал {qlabel(m['quarter'])} · {m['team']}"
    body = "\n".join(
        f'<section class="slide {cls}" data-kind="{esc(kind)}" data-title="{esc(t)}">{inner}'
        f'<span class="pageno">{n}</span></section>' for n, (kind, t, cls, inner) in enumerate(slides, 1))
    return ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f'<title>{html.escape(title)}</title>\n'
            f'<!-- Собрано okr-plan.py из {html.escape(os.path.basename(source))}. Правки — в JSON, страница пересобирается. -->\n'
            f'<style>\n{asset("present.css")}</style>\n</head>\n<body>\n'
            '<div class="deck" id="deck">\n<header class="bar"><button id="tocBtn" class="feed-only" type="button">Слайды</button>'
            f'<span class="title">{esc(title)}</span><span class="grow"></span>'
            '<button id="fullBtn" class="stage-only" type="button" title="Во весь экран (F)">На весь экран</button>'
            '<button id="printBtn" class="dark" type="button" title="Печать или «Сохранить как PDF»: по слайду на страницу">PDF</button></header>\n'
            '<div class="body"><button class="side-tab" id="sideTab" type="button" title="Список слайдов">Слайды</button>'
            '<nav class="toc" id="toc"><h4>Слайды</h4><div id="tocList"></div></nav>\n'
            f'<div class="feed" id="feed"><div class="slides" id="slides">\n{body}\n</div>'
            '<div class="nav" id="nav"><button id="prev" type="button" aria-label="Предыдущий слайд" title="Предыдущий (←)">‹</button>'
            '<span class="count" id="count"></span>'
            '<button id="next" type="button" aria-label="Следующий слайд" title="Следующий (→)">›</button></div></div></div>\n</div>\n'
            f'<script>{asset("present.js")}</script>\n</body>\n</html>\n')


# ---------------------------------------------------------------- CLI

def main(argv):
    if len(argv) < 2 or argv[0] not in ("lint", "render", "seed", "csv", "jira-ready", "jira-csv", "present"):
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
    if cmd == "jira-ready":
        problems = jira_ready(path)
        if problems:
            print("НЕ ГОТОВО К ПЕРЕНОСУ:")
            for p in problems:
                print(f"  - {p}")
            return 1
        print("ГОТОВО К ПЕРЕНОСУ")
        return 0
    if len(argv) < 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    if cmd == "jira-csv":
        count = jira_csv(path, argv[2])
        print(f"Written {argv[2]} ({count} строк)")
        return 0
    if cmd == "present":
        data = present_json(path, argv[2])
        print(f"Written {argv[2]} (целей {len(data['objectives'])}, рисков {len(data['risks'])}"
              + (f", ретро {data['retro']['quarter']}" if data["retro"] else "") + ")")
        return 0
    if cmd == "render":
        render(path, argv[2])
        print(f"Written {argv[2]}")
        return 0
    if cmd == "seed":
        count = seed(path, argv[2], force="--force" in argv)
        print(f"Written {argv[2]} ({count} KR)")
        return 0
    count = export_csv(path, argv[2])
    print(f"Written {argv[2]} ({count} строк)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
