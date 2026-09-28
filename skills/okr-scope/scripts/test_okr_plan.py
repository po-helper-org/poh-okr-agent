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
    def test_valid(self):
        self.assertEqual(self.lint().errors, [])

    def test_carry_forward_needs_note(self):
        self.retro["objectives"][0]["krs"][1]["carry_note"] = ""
        self.assertError(self.lint(), "carry_note")

    def test_unknown_result(self):
        self.retro["objectives"][0]["krs"][0]["result"] = "Почти"
        self.assertError(self.lint(), "result")

    def test_unsure_fact_blocks_acceptance_only(self):
        self.retro["status"] = "черновик"
        self.retro["objectives"][0]["krs"][0]["fact"] = "[УТОЧНИТЬ у PO]"
        self.assertEqual(self.lint().errors, [])
        self.assertError(self.lint(final=True), "[УТОЧНИТЬ]")

    def test_accepted_status_applies_final_rules(self):
        self.retro["objectives"][0]["krs"][0]["source"] = ""
        self.assertError(self.lint(), "источника")

    def test_kr_id_must_follow_objective(self):
        self.retro["objectives"][1]["krs"][0]["id"] = "1.9"
        self.assertError(self.lint(), "id должен иметь вид 2.N")


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
    def test_retro_and_scope_render(self):
        for doc, name in ((self.retro, "retro-2026Q3"), (self.scope, "scope-2026Q4")):
            path = self.write(doc, f"{name}.json")
            out = os.path.join(self.tmp.name, f"{name}.html")
            okr_plan.render(path, out)
            with open(out, encoding="utf-8") as f:
                page = f.read()
            self.assertTrue(page.startswith("<!doctype html>"))
            self.assertIn("2026", page)

    def test_escapes_and_marks_unsure(self):
        self.scope["objectives"][0]["initiatives"][0]["title"] = "<script>alert(1)</script>"
        self.scope["objectives"][0]["initiatives"][1]["result"] = "Срок [УТОЧНИТЬ у маркетинга]"
        path = self.write(self.scope, "scope-2026Q4.json")
        out = os.path.join(self.tmp.name, "scope.html")
        okr_plan.render(path, out)
        with open(out, encoding="utf-8") as f:
            page = f.read()
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
