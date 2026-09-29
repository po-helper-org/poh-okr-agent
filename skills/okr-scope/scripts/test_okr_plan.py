"""Самотест okr-plan.py: python3 -m unittest discover -s <каталог scripts>"""
import copy
import csv
import importlib.util
import json
import os
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("okr_plan", os.path.join(HERE, "okr-plan.py"))
okr_plan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(okr_plan)


def fixture(name):
    with open(os.path.join(HERE, "fixtures", name), encoding="utf-8") as f:
        return json.load(f)


class Case(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.retro = fixture("retro-2026Q3.json")
        self.scope = fixture("scope-2026Q4.json")

    def write(self, doc, name):
        path = os.path.join(self.tmp.name, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False)
        return path

    def lint(self, retro=None, scope=None, final=False):
        self.write(retro or self.retro, "retro-2026Q3.json")
        if scope is None:
            return okr_plan.lint(os.path.join(self.tmp.name, "retro-2026Q3.json"), final=final)
        return okr_plan.lint(self.write(scope, "scope-2026Q4.json"), final=final)

    def assertError(self, rep, fragment):
        self.assertTrue(any(fragment in e for e in rep.errors), f"нет ошибки «{fragment}»: {rep.errors}")


class RetroLint(Case):
    def kr(self, kid):
        return next(kr for o in self.retro["objectives"] for kr in o["krs"] if kr["id"] == kid)

    def test_valid(self):
        self.assertEqual(self.lint().errors, [])

    def test_outcome_is_derived_from_pct(self):
        got = {kr["id"]: okr_plan.outcome(kr) for o in self.retro["objectives"] for kr in o["krs"]}
        self.assertEqual(got, {"1.1": "done", "1.2": "partial", "1.3": "done",
                               "2.1": "partial", "2.2": "failed", "2.3": "dropped"})
        self.assertEqual(okr_plan.outcome({"pct": None}), "unknown")

    def test_stats_weight_by_pbv_and_round_half_up(self):
        st = okr_plan.retro_stats(self.retro)
        self.assertEqual(st["counts"], {"done": 2, "partial": 2, "failed": 1, "dropped": 1, "unknown": 0})
        self.assertEqual((st["rated"], st["weighted"], st["simple"]), (4, 76, 63))

    def test_next_texts(self):
        q = "2026Q4"
        self.assertEqual(okr_plan.next_text(self.kr("1.2"), q), "Продолжается в 2026Q4 — KR 1.1")
        self.assertEqual(okr_plan.next_text(self.kr("1.1"), q), "Закрыт — снять с контроля")
        self.assertEqual(okr_plan.next_text(self.kr("2.3"), q), "Отменён — снят решением PO 12.08, приоритет ушёл на биллинг")
        self.assertEqual(okr_plan.next_text(self.kr("2.2"), q), "Решить: продолжаем, переносим или закрываем")
        self.assertEqual(okr_plan.fact_text(self.kr("1.3")), "100 % — внеплановый; запрос бухгалтерии в августе")
        self.assertEqual(okr_plan.fact_text(self.kr("2.3")), "отменено")

    def test_unknown_pct_blocks_acceptance(self):
        self.kr("1.1")["pct"] = None
        self.assertError(self.lint(), "нет процента")

    def test_continue_needs_next_quarter_kr(self):
        del self.kr("1.2")["next"]["kr"]
        self.assertError(self.lint(), "next.kr")

    def test_partial_needs_next(self):
        del self.kr("2.1")["next"]
        self.assertError(self.lint(), "что дальше")

    def test_dropped_allows_only_drop(self):
        self.kr("2.3")["next"] = {"action": "continue", "kr": "2.1"}
        self.assertError(self.lint(), "только drop")

    def test_cancel_needs_reason(self):
        self.kr("2.3")["cancel_reason"] = ""
        self.assertError(self.lint(), "cancel_reason")

    def test_status_is_explicit_word(self):
        self.kr("2.3")["status"] = "отменён"
        self.assertError(self.lint(), "status — одно из")
        self.kr("2.3")["status"] = "Отменено"
        self.kr("2.2")["dropped"] = True
        self.assertError(self.lint(), "dropped больше не используется")

    def test_step_role_and_status(self):
        self.kr("1.1")["plan"][0]["role"] = "аналитик"
        self.kr("1.1")["plan"][1]["status"] = "done"
        rep = self.lint()
        self.assertError(rep, "роль")
        self.assertError(rep, "status")

    def test_unsure_comment_blocks_acceptance_only(self):
        self.retro["status"] = "черновик"
        self.kr("1.1")["comment"] = "[УТОЧНИТЬ у PO]"
        self.assertEqual(self.lint().errors, [])
        self.assertError(self.lint(final=True), "[УТОЧНИТЬ]")

    def test_kr_id_must_follow_objective(self):
        self.kr("2.1")["id"] = "1.9"
        self.assertError(self.lint(), "id должен начинаться с 2.")

    def test_pbv_allows_zero_and_null_only_in_range(self):
        self.kr("1.1")["pbv"] = 10
        self.assertError(self.lint(), "PBV")


class ScopeLint(Case):
    def test_valid(self):
        self.assertEqual(self.lint(scope=self.scope).errors, [])

    def test_unknown_team(self):
        self.scope["objectives"][0]["initiatives"][0]["teams"] = ["mobile"]
        self.assertError(self.lint(scope=self.scope), "mobile")

    def test_carryover_must_be_planned_or_dropped(self):
        self.scope["objectives"][0]["initiatives"][0]["from_retro"] = ""
        self.assertError(self.lint(scope=self.scope), "Retro 1.2")
        self.scope["retro_dropped"] = [{"id": "1.2", "reason": "Партнёр закрывает интеграцию"}]
        self.assertEqual(self.lint(scope=self.scope).errors, [])

    def test_from_retro_must_exist(self):
        self.scope["objectives"][0]["initiatives"][1]["from_retro"] = "9.9"
        self.assertError(self.lint(scope=self.scope), "9.9")

    def test_high_pbv_result_cannot_stay_unsure_when_accepted(self):
        self.scope["objectives"][0]["initiatives"][1]["result"] = "[УТОЧНИТЬ у маркетинга]"
        self.assertError(self.lint(scope=self.scope), "PBV ≥ 7")

    def test_draft_tolerates_open_points(self):
        draft = copy.deepcopy(self.scope)
        draft["status"] = "черновик"
        draft["phase"] = "scope"
        draft["objectives"][0]["initiatives"][1]["result"] = "[УТОЧНИТЬ у маркетинга]"
        del draft["objectives"][0]["why"]
        rep = self.lint(scope=draft)
        self.assertEqual(rep.errors, [])
        self.assertTrue(rep.warnings)

    def test_plain_word_is_not_a_marker(self):
        self.scope["objectives"][0]["initiatives"][1]["result"] = "Семейная подписка в проде, тарифы уточнить не нужно"
        self.assertEqual(self.lint(scope=self.scope).errors, [])

    def test_string_pbv_is_reported_not_crashing(self):
        self.scope["objectives"][0]["initiatives"][1]["pbv"] = "9"
        self.assertError(self.lint(scope=self.scope), "PBV — целое 1..9")

    def test_before_after_pair(self):
        self.scope["objectives"][0]["initiatives"][0]["after"] = ""
        self.assertError(self.lint(scope=self.scope), "парой")

    def test_retro_or_skip_reason_required(self):
        del self.scope["retro"]
        self.assertError(self.lint(scope=self.scope), "retro_skipped")
        self.scope["retro_skipped"] = "Первый квартал команды"
        self.assertEqual(self.lint(scope=self.scope).errors, [])


class StagesLint(Case):
    def test_role_outside_list(self):
        self.scope["objectives"][0]["initiatives"][1]["notes"]["stages"][0]["role"] = "QA"
        self.assertError(self.lint(scope=self.scope), "'QA'")

    def test_high_pbv_needs_three_stages(self):
        self.scope["objectives"][0]["initiatives"][1]["notes"]["stages"] = [{"role": "PO", "title": "Требования"}]
        self.assertError(self.lint(scope=self.scope), "нужно не меньше 3")

    def test_research_needs_uncertainties(self):
        self.scope["objectives"][1]["initiatives"][0]["notes"]["uncertainties"] = []
        self.assertError(self.lint(scope=self.scope), "неопределённости")

    def test_stage_status_values(self):
        self.scope["objectives"][0]["initiatives"][1]["notes"]["stages"][0]["status"] = "готово"
        self.assertError(self.lint(scope=self.scope), "этап 1: status")

    def test_cancelled_initiative_needs_reason_only(self):
        ini = self.scope["objectives"][1]["initiatives"][1]
        ini["cancel_reason"] = ""
        ini["result"] = ""
        rep = self.lint(scope=self.scope)
        self.assertEqual([e for e in rep.errors if "2.2" in e], ["KR 2.2: отменено без причины и даты решения (cancel_reason)"])

    def ini(self, kid):
        return next(i for o in self.scope["objectives"] for i in o["initiatives"] if i["id"] == kid)

    def test_in_quarter_is_bool(self):
        self.ini("1.1")["in_quarter"] = "да"
        self.assertError(self.lint(scope=self.scope), "KR 1.1: in_quarter — true или false")

    def test_undecided_in_quarter_blocks_acceptance_only(self):
        del self.ini("1.1")["in_quarter"]
        self.assertError(self.lint(scope=self.scope), "KR 1.1: не решено, берём ли в квартал")
        self.scope["status"] = "черновик"
        rep = self.lint(scope=self.scope)
        self.assertEqual(rep.errors, [])
        self.assertTrue(any("не решено, берём ли в квартал" in w for w in rep.warnings))

    def test_cancelled_cannot_go_to_quarter(self):
        self.ini("2.2")["in_quarter"] = True
        self.assertError(self.lint(scope=self.scope), "KR 2.2: отменённая инициатива не может идти в квартал")

    def test_not_taken_skips_stage_checks(self):
        self.assertNotIn("notes", self.ini("1.3"))
        self.assertEqual([e for e in self.lint(scope=self.scope).errors if "1.3" in e], [])

    def test_not_taken_carryover_counts_as_decided(self):
        self.ini("2.1")["in_quarter"] = False
        self.assertEqual([e for e in self.lint(scope=self.scope).errors if "Retro" in e], [])

    def test_scope_phase_skips_stage_checks(self):
        self.scope["phase"] = "scope"
        self.scope["objectives"][0]["initiatives"][1]["notes"] = {}
        self.assertEqual(self.lint(scope=self.scope).errors, [])


class Render(Case):
    def render(self, doc, name):
        path = self.write(doc, f"{name}.json")
        out = os.path.join(self.tmp.name, f"{name}.html")
        okr_plan.render(path, out)
        with open(out, encoding="utf-8") as f:
            return f.read()

    def test_scope_render(self):
        page = self.render(self.scope, "scope-2026Q4")
        self.assertTrue(page.startswith("<!doctype html>"))
        self.assertIn("2026Q4", page)

    def test_fact_page_is_computed_from_data(self):
        page = self.render(self.retro, "retro-2026Q3")
        self.assertIn("<title>ФАКТ 2026Q3 — Витрина</title>", page)
        self.assertIn('data-value="done" data-name="закрыт"><span class="st st-done">✔</span> закрыт<span class="n">2</span>', page)
        self.assertIn('data-value="dropped" data-name="отменено">', page)
        self.assertIn('<td class="pct st-dropped">ОТМ</td>', page)
        self.assertIn('<td class="fly"><span>влёт</span></td>', page)
        self.assertIn('<span class="pbvtag" data-tier="none">—</span>', page)
        self.assertIn("Итог квартала: <strong>76 %</strong>", page)
        self.assertIn('<i class="seg s-blocked"', page)
        self.assertIn('<span class="segn">2&thinsp;/&thinsp;5</span>', page)

    def test_fact_page_has_no_bottom_analysis(self):
        page = self.render(self.retro, "retro-2026Q3")
        for gone in ("Сводка", "Что это говорит о правилах", "Расхождения", "Базовая линия"):
            self.assertNotIn(gone, page)

    def test_fact_card_keeps_sections_for_comments(self):
        page = self.render(self.retro, "retro-2026Q3")
        data = json.loads(page.split('<script type="application/json" id="page-data">')[1].split("</script>")[0])
        self.assertEqual(data["file"], "retro-2026Q3.json")
        heads = [b["v"] for b in data["cards"]["1.2"]["blocks"] if b["t"] == "h"]
        self.assertEqual(heads, ["Образ результата", "Процессный roadmap", "Зависимости", "Риски",
                                 "Фактическая готовность", "Следующие действия", "Исполнители"])
        self.assertIn('id="commentsBtn"', page)

    def test_render_is_deterministic(self):
        self.assertEqual(self.render(self.retro, "a"), self.render(self.retro, "a"))
        self.assertEqual(self.render(self.scope, "b"), self.render(self.scope, "b"))

    def test_fact_page_escapes_everything(self):
        evil = "</script><script>alert(1)</script>"
        self.retro["objectives"][0]["krs"][0]["title"] = evil
        self.retro["objectives"][0]["krs"][0]["goal"] = evil
        page = self.render(self.retro, "retro-2026Q3")
        self.assertNotIn("<script>alert", page)
        data = json.loads(page.split('<script type="application/json" id="page-data">')[1].split("</script>")[0])
        self.assertIn(evil, [b["v"] for b in data["cards"]["1.1"]["blocks"]])

    def test_scope_page(self):
        self.write(self.retro, "retro-2026Q3.json")
        page = self.render(self.scope, "scope-2026Q4")
        self.assertIn("<title>ПЛАН 2026Q4 — Витрина</title>", page)
        self.assertIn("продолжается 2 KR, в плане 2, не берём 0, не решено 0", page)
        self.assertIn('data-kr="2.2" data-tags="back" data-cancelled', page)
        self.assertIn("инициатив 5, в квартал 4 ·", page)
        self.assertIn('data-kr="1.3" data-tags="front back" data-out', page)
        self.assertIn('<span class="inq" data-v="yes">✓ да</span>', page)
        self.assertIn('data-value="partner" data-name="Биллинг партнёра">', page)
        self.assertIn('title="BE · [EXT] Стенд партнёра для тестов · TODO"', page)
        self.assertIn('<span class="segn">1&thinsp;/&thinsp;4</span>', page)

    def test_escapes_and_marks_unsure(self):
        self.scope["objectives"][0]["initiatives"][0]["title"] = "<script>alert(1)</script>"
        self.scope["objectives"][0]["initiatives"][1]["result"] = "Срок [УТОЧНИТЬ у маркетинга]"
        page = self.render(self.scope, "scope-2026Q4")
        self.assertNotIn("<script>alert", page)
        self.assertIn('<mark class="unc">[УТОЧНИТЬ у маркетинга]</mark>', page)
        self.assertIn("KR 1.2: <mark class=\"unc\">[УТОЧНИТЬ]</mark> — образ результата", page)


class TeamPlanner(Case):
    def setUp(self):
        super().setUp()
        self.tp = fixture("teamplanner-2026Q4.json")

    def lint_tp(self, tp=None, final=False, scope=True):
        if scope:
            self.write(self.retro, "retro-2026Q3.json")
            self.write(self.scope, "scope-2026Q4.json")
        return okr_plan.lint(self.write(tp or self.tp, "teamplanner-2026Q4.json"), final=final)

    def kr(self, kid):
        return next(k for o in self.tp["objectives"] for k in o["krs"] if k["id"] == kid)

    def test_valid(self):
        self.assertEqual(self.lint_tp().errors, [])

    def test_seed_takes_only_initiatives_in_quarter(self):
        out = os.path.join(self.tmp.name, "seed.json")
        okr_plan.seed(self.write(self.scope, "scope-2026Q4.json"), out)
        with open(out, encoding="utf-8") as f:
            doc = json.load(f)
        self.assertEqual([k["id"] for o in doc["objectives"] for k in o["krs"]], ["1.1", "1.2", "2.1", "3.1"])
        self.assertEqual(doc["roles"], okr_plan.TP_ROLES)
        ext = [s for s in doc["objectives"][0]["krs"][0]["steps"] if s["ext"]]
        self.assertEqual([(s["role"], s["ext"]) for s in ext], [("BE", "partner")])
        self.assertEqual(doc["status"], "черновик")

    def test_seed_requires_accepted_scope(self):
        self.scope["status"] = "черновик"
        with self.assertRaises(SystemExit):
            okr_plan.seed(self.write(self.scope, "s.json"), os.path.join(self.tmp.name, "x.json"))

    def test_derived_progress_status_dates(self):
        kr = self.kr("1.1")
        self.assertEqual(okr_plan.kr_pct(kr), 23)
        self.assertEqual(okr_plan.kr_status(kr), "BLOCKED")
        self.assertEqual(okr_plan.kr_dates(kr), ("2026-10-01", "2026-11-20"))
        self.assertEqual(okr_plan.kr_status({"steps": [{"status": "DONE"}, {"status": "TODO"}]}), "IN PROGRESS")
        self.assertIsNone(okr_plan.kr_pct({"steps": []}))

    def test_step_state(self):
        kr = self.kr("1.2")
        states = [okr_plan.step_state(self.tp, kr, s) for s in kr["steps"]]
        self.assertEqual([i + 1 for i, st in enumerate(states) if st["norole"]], [7])
        self.assertEqual([i + 1 for i, st in enumerate(states) if st["unassigned"]], [6])
        ext = okr_plan.step_state(self.tp, self.kr("1.1"), self.kr("1.1")["steps"][2])
        self.assertEqual(ext, {"ext": "partner", "unassigned": False, "norole": False})

    def test_missing_executors_block_acceptance_only(self):
        rep = self.lint_tp(final=True)
        self.assertIn("KR 1.2, этап 6: нет исполнителя", rep.errors)
        self.assertTrue(any("этап 7: нет исполнителя, и роли DOPS нет" in e for e in rep.errors))

    def test_step_values(self):
        step = self.kr("2.1")["steps"][0]
        step.update(role="DEV", who="Кто-то", ext="nobody", start="01.10.2026", progress=120)
        rep = self.lint_tp()
        for fragment in ("роль 'DEV'", "исполнитель 'Кто-то'", "внешняя команда 'nobody'",
                         "start — дата", "progress — целое"):
            self.assertError(rep, fragment)

    def test_dates_order_and_quarter(self):
        step = self.kr("2.1")["steps"][0]
        step.update(start="2026-10-20", end="2026-10-10")
        self.assertError(self.lint_tp(), "начало позже конца")
        step.update(start="2026-12-20", end="2027-01-15")
        rep = self.lint_tp()
        self.assertTrue(any("выходят за квартал 2026Q4" in w for w in rep.warnings))

    def test_every_initiative_in_quarter_is_planned(self):
        self.tp["objectives"][1]["krs"] = []
        rep = self.lint_tp(final=True)
        self.assertIn("KR 2.1 идёт в квартал по Scope, но его нет в TeamPlanner", rep.errors)

    def test_page(self):
        path = self.write(self.tp, "teamplanner-2026Q4.json")
        out = os.path.join(self.tmp.name, "tp.html")
        okr_plan.render(path, out)
        with open(out, encoding="utf-8") as f:
            page = f.read()
        self.assertIn("<title>TEAMPLANNER 2026Q4 — Витрина</title>", page)
        self.assertIn("без исполнителя 1 · нет роли в команде 2 · внешний ресурс 1", page)
        self.assertIn('<td class="role">EXT[BE]</td>', page)
        self.assertIn("<td>внешний ресурс: Биллинг партнёра</td>", page)
        self.assertEqual(page.count("<tr data-norole>"), 2)
        data = json.loads(page.split('<script type="application/json" id="page-data">')[1].split("</script>")[0])
        self.assertEqual(data["doc"], self.tp)
        self.assertIn('id="tpBar"', page)

    def test_page_escapes(self):
        self.kr("1.1")["steps"][0]["title"] = "</script><script>alert(1)</script>"
        path = self.write(self.tp, "teamplanner-2026Q4.json")
        out = os.path.join(self.tmp.name, "tp.html")
        okr_plan.render(path, out)
        with open(out, encoding="utf-8") as f:
            self.assertNotIn("<script>alert", f.read())

    def test_csv_rows(self):
        self.write(self.scope, "scope-2026Q4.json")
        out = os.path.join(self.tmp.name, "tp.csv")
        okr_plan.export_csv(self.write(self.tp, "teamplanner-2026Q4.json"), out)
        with open(out, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f, delimiter=";"))
        self.assertEqual(len(rows), 3 + 4 + 17)
        self.assertEqual(rows[0]["Название"], "OBJ 1 — Продавать подписку без ручных операций")
        kr = rows[1]
        self.assertEqual((kr["Название"], kr["Статус"], kr["Прогресс, %"], kr["Начало"], kr["Конец"]),
                         ("KR 1.1 Биллинг партнёра минуя ручную сверку (общий прогресс)", "Заблокирована", "23",
                          "2026-10-01", "2026-11-20"))
        ext = next(r for r in rows if r["Роль"] == "EXT[BE]")
        self.assertEqual((ext["Название"], ext["Исполнитель"]),
                         ("Стенд партнёра для тестов (EXT[BE])", "внешний ресурс: Биллинг партнёра"))
        self.assertEqual(sum(r["Исполнитель"] == "нет роли в команде" for r in rows), 2)



if __name__ == "__main__":
    unittest.main()
