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
        self.assertEqual((st["rated"], st["weighted"], st["simple"], st["unplanned"]), (4, 76, 63, 1))

    def test_next_texts(self):
        q = "2026Q4"
        self.assertEqual(okr_plan.next_text(self.kr("1.2"), q), "Продолжается в 2026Q4 — KR 1.1")
        self.assertEqual(okr_plan.next_text(self.kr("1.1"), q), "Закрыт — снять с контроля")
        self.assertEqual(okr_plan.next_text(self.kr("2.3"), q), "Отменён — снят решением PO 12.08, приоритет ушёл на биллинг")
        self.assertEqual(okr_plan.next_text(self.kr("2.2"), q), "Решить: продолжаем, переносим или закрываем")
        self.assertEqual(okr_plan.fact_text(self.kr("1.3")), "100 % — внеплановый; запрос бухгалтерии в августе")
        self.assertEqual(okr_plan.fact_text(self.kr("2.3")), "отменён")

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

    def test_drop_needs_reason(self):
        self.kr("2.3")["drop_reason"] = ""
        self.assertError(self.lint(), "drop_reason")

    def test_step_role_and_status(self):
        self.kr("1.1")["plan"][0]["role"] = "аналитик"
        self.kr("1.1")["plan"][1]["status"] = "готово"
        rep = self.lint()
        self.assertError(rep, "роль")
        self.assertError(rep, "status")

    def test_unsure_comment_blocks_acceptance_only(self):
        self.retro["status"] = "черновик"
        self.kr("1.1")["comment"] = "[УТОЧНИТЬ у PO]"
        self.assertEqual(self.lint().errors, [])
        self.assertError(self.lint(final=True), "[УТОЧНИТЬ]")

    def test_unresolved_discrepancy_blocks_acceptance(self):
        self.retro["discrepancies"][0]["resolved"] = False
        self.assertError(self.lint(), "Расхождение")

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
        self.assertIn('data-state="done" data-name="закрыт"><span class="st st-done">✔</span> закрыт<span class="n">2</span>', page)
        self.assertIn('<td class="pct st-dropped">ОТМ</td>', page)
        self.assertIn('<td class="fly"><span>влёт</span></td>', page)
        self.assertIn('<span class="pbvtag" data-tier="none">—</span>', page)
        self.assertIn("Итог квартала: <strong>76 %</strong>", page)
        self.assertIn('<span class="segn">2&thinsp;/&thinsp;5</span>', page)

    def test_render_is_deterministic(self):
        self.assertEqual(self.render(self.retro, "a"), self.render(self.retro, "a"))

    def test_fact_page_escapes_everything(self):
        evil = "</script><script>alert(1)</script>"
        self.retro["objectives"][0]["krs"][0]["title"] = evil
        self.retro["objectives"][0]["krs"][0]["goal"] = evil
        page = self.render(self.retro, "retro-2026Q3")
        self.assertNotIn("<script>alert", page)
        data = page.split('<script type="application/json" id="fact-data">')[1].split("</script>")[0]
        self.assertEqual(json.loads(data)["1.1"]["goal"], evil)

    def test_escapes_and_marks_unsure(self):
        self.scope["objectives"][0]["initiatives"][0]["title"] = "<script>alert(1)</script>"
        self.scope["objectives"][0]["initiatives"][1]["result"] = "Срок [УТОЧНИТЬ у маркетинга]"
        page = self.render(self.scope, "scope-2026Q4")
        self.assertNotIn("<script>", page)
        self.assertIn('<span class="warn">[УТОЧНИТЬ у маркетинга]</span>', page)


class TeamPlanner(Case):
    def export(self, scope):
        self.write(self.retro, "retro-2026Q3.json")
        path = self.write(scope, "scope-2026Q4.json")
        out = os.path.join(self.tmp.name, "teamplanner.csv")
        okr_plan.teamplanner(path, out)
        with open(out, encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f, delimiter=";"))

    def test_one_row_per_stage_with_continuous_numbering(self):
        rows = self.export(self.scope)
        self.assertEqual(len(rows), 4 + 5 + 2 + 1)
        self.assertEqual([r["№"] for r in rows], [str(n) for n in range(1, len(rows) + 1)])
        self.assertEqual(rows[2]["Внешняя команда"], "да")
        self.assertTrue(rows[0]["Риски"].startswith("[RISK] "))
        self.assertEqual(rows[1]["Риски"], "")
        self.assertEqual(rows[-1]["Этап"], "")
        self.assertEqual(rows[0]["Программа (OBJ)"], "OBJ 1. Продавать подписку без ручных операций")

    def test_requires_accepted_stages(self):
        self.scope["status"] = "черновик"
        with self.assertRaises(SystemExit):
            self.export(self.scope)


if __name__ == "__main__":
    unittest.main()
