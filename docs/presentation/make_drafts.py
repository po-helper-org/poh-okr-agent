"""Первые итерации для слайдов: что агент собрал до правок PO."""
import copy, json

r = json.load(open("retro-2026Q3.json"))
r["status"] = "черновик"
r["updated"] = "2026-09-25"
r["basis"] = ["Источник: выгрузка JIRA 25.09.2026 — KR, PBV, подзадачи и их статусы.",
              "Готовность, причины и что дальше — [УТОЧНИТЬ у PO]."]
for o in r["objectives"]:
    for k in o["krs"]:
        for f in ("risks", "who", "deps", "status", "cancel_reason"):
            k.pop(f, None)
        plan = k.get("plan", [])
        done = sum(s["status"] == "DONE" for s in plan)
        if plan and done == len(plan):
            k["pct"] = 100
            k["comment"] = "все подзадачи в JIRA закрыты"
            k["next"] = {"action": "close"}
        elif plan:
            k.pop("pct", None)
            k["comment"] = f"[УТОЧНИТЬ у PO] готовность: в JIRA закрыто {done} из {len(plan)} подзадач"
            k["next"] = {"action": "decide"}
json.dump(r, open("retro-draft.json", "w"), ensure_ascii=False, indent=2)

s = json.load(open("scope-2026Q4.json"))
s["status"] = "черновик"
s["phase"] = "scope"
s["updated"] = "2026-09-30"
for o in s["objectives"]:
    for i in o["initiatives"]:
        i.pop("notes", None)
        i.pop("status", None)
        i.pop("cancel_reason", None)
        if i["id"] == "1.2":
            i["result"] = "Пользователь покупает семейную подписку и добавляет участников [УТОЧНИТЬ у маркетинга: 4 или 6]. Коммитмент на декабрь."
        if i["id"] == "2.1":
            i["pbv"] = None
        if i["id"] == "2.2":
            i["result"] = "PoC рекомендаций [УТОЧНИТЬ у PO: на какой доле трафика]"
s["open_questions"] = ["Берём ли рекомендации в квартал при ёмкости BE после биллинга? [УТОЧНИТЬ у PO]",
                       "Судьба KR 2.2 прошлого квартала: продолжаем или снимаем?"]
json.dump(s, open("scope-draft.json", "w"), ensure_ascii=False, indent=2)
