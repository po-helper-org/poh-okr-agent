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

    def test_category_values(self):
        self.ini("1.1")["category"] = "Grow"
        self.assertError(self.lint(scope=self.scope), "KR 1.1: category — Change, Run, Disrupt или пусто")

    def test_category_is_empty_by_default_even_when_accepted(self):
        self.assertNotIn("category", self.ini("1.3"))
        self.ini("1.1")["category"] = None
        self.ini("1.2")["category"] = ""
        self.assertEqual(self.lint(scope=self.scope, final=True).errors, [])

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
        self.assertIn("Тип: Change 1 · Run 2 · Disrupt 1.", page)
        self.assertIn('<td class="name"><span class="crd" data-v="disrupt">Disrupt</span> <span class="txt">Семейная', page)
        self.assertIn('<td class="name"><span class="txt">Промокоды на подписку</span>', page)
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
        self.assertEqual([k["epic"] for o in doc["objectives"] for k in o["krs"]], ["enabler", "enabler", "enabler", "epic"])
        ext = [s for s in doc["objectives"][0]["krs"][0]["steps"] if s["ext"]]
        self.assertEqual([(s["role"], s["ext"]) for s in ext], [("BE", "partner")])
        self.assertEqual(doc["status"], "черновик")
        self.assertEqual([k["category"] for o in doc["objectives"] for k in o["krs"]], ["Change", "Disrupt", "Run", "Run"])

    def test_seed_small_and_research_krs_start_with_bft(self):
        inis = {i["id"]: i for o in self.scope["objectives"] for i in o["initiatives"]}
        inis["2.1"]["notes"].pop("stages")  # Scope без /okr-stages у этой инициативы
        self.scope["phase"] = "scope"
        inis["3.1"]["pbv"] = 4
        inis["1.1"]["pbv"] = 3
        out = os.path.join(self.tmp.name, "seed.json")
        okr_plan.seed(self.write(self.scope, "scope-2026Q4.json"), out)
        with open(out, encoding="utf-8") as f:
            krs = {k["id"]: k for o in json.load(f)["objectives"] for k in o["krs"]}
        bft = [("PO", "Сбор БФТ-требований")]
        self.assertEqual([(s["role"], s["title"]) for s in krs["2.1"]["steps"]], bft)
        self.assertEqual([(s["role"], s["title"]) for s in krs["3.1"]["steps"]], bft)
        self.assertEqual(len(krs["1.1"]["steps"]), 4)  # этапы /okr-stages важнее заготовки
        self.assertEqual(krs["1.2"]["steps"][0]["role"], "PO")
        self.assertTrue(okr_plan.needs_bft_only({"pbv": 0}))
        self.assertFalse(okr_plan.needs_bft_only({"pbv": 5, "tag": "BUG"}))
        self.assertFalse(okr_plan.needs_bft_only({}))

    def test_days_estimate(self):
        steps = self.kr("1.1")["steps"]
        steps[0]["days"], steps[1]["days"] = 3, 2.5
        self.assertEqual(self.lint_tp().errors, [])
        self.assertEqual(okr_plan.kr_days(self.kr("1.1")), 5.5)
        self.assertIsNone(okr_plan.kr_days(self.kr("1.2")))
        self.assertEqual((okr_plan.num_text(5.0), okr_plan.num_text(0.1 + 0.2)), ("5", "0.3"))
        rows = okr_plan.tp_rows(self.tp)
        self.assertEqual(rows[1]["Оценка, дн"], "5.5")
        self.assertEqual((rows[2]["Оценка, дн"], rows[3]["Оценка, дн"], rows[4]["Оценка, дн"]), ("3", "2.5", ""))
        for bad in (-1, "3", True):
            steps[0]["days"] = bad
            self.assertError(self.lint_tp(), "KR 1.1, этап 1: days — оценка в днях")

    def test_kr_needs_title(self):
        self.kr("1.1")["title"] = ""
        self.assertError(self.lint_tp(), "KR 1.1: нет названия")

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

    def test_category_checked_and_shown(self):
        self.kr("1.1")["category"] = "run"
        self.assertError(self.lint_tp(), "KR 1.1: category — Change, Run, Disrupt или пусто")
        self.kr("1.1")["category"] = "Run"
        path = self.write(self.tp, "teamplanner-2026Q4.json")
        out = os.path.join(self.tmp.name, "tp.html")
        okr_plan.render(path, out)
        with open(out, encoding="utf-8") as f:
            self.assertIn('<span class="kr-title"><span class="crd" data-v="run">Run</span> Биллинг', f.read())

    def test_epic_type(self):
        self.assertEqual([okr_plan.epic_of(k) for _, k in okr_plan.tp_krs(self.tp)], ["enabler", "enabler", "enabler", "epic"])
        self.assertEqual(okr_plan.epic_of({"tag": "ACTIVITY"}), "epic")
        self.kr("1.1")["epic"] = "story"
        self.assertError(self.lint_tp(), "KR 1.1: epic — enabler, epic или пусто")
        self.kr("1.1")["epic"] = "epic"
        path = self.write(self.tp, "teamplanner-2026Q4.json")
        out = os.path.join(self.tmp.name, "tp.html")
        okr_plan.render(path, out)
        with open(out, encoding="utf-8") as f:
            page = f.read()
        self.assertIn('<span class="et" data-v="epic">ЭПИК</span><span class="kr-title"><span class="crd" data-v="change">'
                      'Change</span> Биллинг', page)
        self.assertIn('[RESEARCH] Поиск на новой платформе', page)
        self.assertIn('id="tpSum"', page)
        self.assertNotIn('id="tpOpenAll"', page)
        for marker in ('class="basket" id="tpNotes" hidden', 'id="tpNotesBtn"', 'id="tpNotesCopy"', 'id="tpNotesSave"'):
            self.assertIn(marker, page)

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
        self.assertIn('<li><span class="t">EXT[BE]</span> Стенд партнёра для тестов — внешний ресурс: Биллинг партнёра</li>', page)
        self.assertEqual(page.count("— нет роли в команде</li>"), 2)
        data = json.loads(page.split('<script type="application/json" id="page-data">')[1].split("</script>")[0])
        self.assertEqual(data["doc"], self.tp)
        self.assertIn('id="tpDrawer"', page)
        self.assertIn('id="tpPeople"', page)

    def test_details_rich_text(self):
        note = ('<h3>Образ действия</h3><p onclick="x()">Две <b>встречи</b><script>alert(1)</script></p>'
                '<ul><li>раз</li><li>два</li></ul><div>ещё<br>строка</div><img src=x onerror=alert(2)>')
        self.assertEqual(okr_plan.rich_html(note),
                         "<h3>Образ действия</h3><p>Две <b>встречи</b></p><ul><li>раз</li><li>два</li></ul>"
                         "<p>ещё<br>строка</p>")
        self.assertEqual(okr_plan.rich_text(note), "Образ действия\nДве встречи\n- раз\n- два\nещё\nстрока")

    def test_details_markup_is_checked_and_exported(self):
        self.kr("1.1")["details"] = '<p style="color:red">x</p>'
        self.assertError(self.lint_tp(), "KR 1.1: в details недопустимая разметка")
        self.kr("1.1")["details"] = "<h3>Дополнительно</h3><p>Граница: без скидок</p>"
        self.assertEqual(self.lint_tp().errors, [])
        rows = okr_plan.tp_rows(self.tp)
        self.assertTrue(rows[1]["Комментарий"].endswith("Дополнительно\nГраница: без скидок"))

    def test_page_escapes(self):
        self.kr("1.1")["steps"][0]["title"] = "</script><script>alert(1)</script>"
        self.kr("1.1")["details"] = "<p>ok</p><script>alert(1)</script>"
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



class Jira(Case):
    """Перенос в JIRA идёт прямо из TeamPlanner: KR — эпик, этап — история."""

    def setUp(self):
        super().setUp()
        self.tp = fixture("teamplanner-2026Q4.json")

    def put(self, status=None, assign=False):
        self.write(self.scope, "scope-2026Q4.json")
        doc = copy.deepcopy(self.tp)
        if status:
            doc["status"] = status
        if assign:
            for o in doc["objectives"]:
                for k in o["krs"]:
                    for st in k["steps"]:
                        if not st["who"] and not st["ext"]:
                            st["ext"] = "partner"
        return self.write(doc, "teamplanner-2026Q4.json")

    def test_key_and_project_format(self):
        self.tp["jira_project"] = "vit"
        kr = self.tp["objectives"][0]["krs"][0]
        kr["jira_key"] = "VIT 1"
        kr["steps"][0]["jira_key"] = "vit-2"
        rep = okr_plan.lint(self.put())
        for fragment in ("jira_project: ключ проекта JIRA", "KR 1.1: jira_key — ключ JIRA",
                         "KR 1.1, этап 1: jira_key — ключ JIRA"):
            self.assertError(rep, fragment)
        kr["jira_key"], kr["steps"][0]["jira_key"], self.tp["jira_project"] = "VIT-1", "VIT-2", "VIT"
        self.assertEqual(okr_plan.lint(self.put()).errors, [])

    def test_ready_only_for_accepted_teamplanner(self):
        problems = okr_plan.jira_ready(self.put())
        self.assertIn("TeamPlanner не принят", problems[0])
        self.assertTrue(any("нет исполнителя" in p for p in problems))
        self.assertEqual(okr_plan.jira_ready(self.put(status="принято", assign=True)), [])
        self.tp["jira_project"] = ""
        self.assertTrue(any(p.startswith("jira_project") for p in okr_plan.jira_ready(self.put("принято", True))))

    def test_csv(self):
        out = os.path.join(self.tmp.name, "jira.csv")
        with self.assertRaises(SystemExit):
            okr_plan.jira_csv(self.put(), out)
        steps = sum(len(k["steps"]) for o in self.tp["objectives"] for k in o["krs"])
        self.assertEqual(okr_plan.jira_csv(self.put("принято", True), out), 4 + steps)
        with open(out, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
        epic = rows[0]
        self.assertEqual((epic["Issue Type"], epic["Issue Id"], epic["Parent Id"]), ("Epic", "1", ""))
        self.assertTrue(epic["Summary"].endswith("Биллинг партнёра минуя ручную сверку"))
        for label in ("OKR-2026Q4", "KR-1.1", "epic-enabler", "Change", "PBV-8"):
            self.assertIn(label, epic["Labels"].split())
        self.assertEqual((rows[1]["Issue Type"], rows[1]["Parent Id"]), ("Story", "1"))
        self.assertTrue(rows[1]["Summary"].startswith("[SA] "))
        self.assertIn("EXT[BE]", " ".join(r["Summary"] for r in rows))
        activity = next(r for r in rows if r["Issue Type"] == "Epic" and "KR-3.1" in r["Labels"].split())
        self.assertIn("epic-epic", activity["Labels"].split())
        self.assertTrue(activity["Summary"].startswith("[ACTIVITY] "))

class Robustness(Case):
    """JSON пишет LLM: любой неверный тип — понятная ошибка, а не трейсбэк."""

    def test_load_errors_are_readable(self):
        bad = os.path.join(self.tmp.name, "bad.json")
        for content, fragment in (("{bad", "не JSON — строка 1"), ("[]", "ожидается JSON-объект")):
            with open(bad, "w", encoding="utf-8") as f:
                f.write(content)
            with self.assertRaises(SystemExit) as cm:
                okr_plan.lint(bad)
            self.assertIn(fragment, str(cm.exception))
        with self.assertRaises(SystemExit) as cm:
            okr_plan.lint(os.path.join(self.tmp.name, "nope.json"))
        self.assertIn("файл не найден", str(cm.exception))

    def test_shape_errors_are_reported(self):
        tp = fixture("teamplanner-2026Q4.json")
        tp["teams"] = "Витрина"
        tp["objectives"][0]["krs"][0]["steps"][0] = "SA"
        tp["objectives"][0]["krs"][1]["teams"] = "front"
        rep = okr_plan.lint(self.write(tp, "tp.json"))
        self.assertIn("teams: ожидается список [...], получено строка", rep.errors)
        self.assertIn("objectives[0].krs[0].steps[0]: ожидается объект {...}, получено строка", rep.errors)
        self.assertIn('objectives[0].krs[1].teams: ожидается список строк ["…"], получено строка', rep.errors)
        with self.assertRaises(SystemExit) as cm:
            okr_plan.render(self.write(tp, "tp.json"), os.path.join(self.tmp.name, "tp.html"))
        self.assertIn("структура не совпадает со схемой", str(cm.exception))

    def test_seed_does_not_overwrite_edits(self):
        scope = self.write(self.scope, "scope-2026Q4.json")
        out = self.write({"kind": "teamplanner", "edited": True}, "teamplanner-2026Q4.json")
        with self.assertRaises(SystemExit):
            okr_plan.seed(scope, out)
        with open(out, encoding="utf-8") as f:
            self.assertTrue(json.load(f)["edited"])
        okr_plan.seed(scope, out, force=True)
        with open(out, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["kind"], "teamplanner")

    def test_seed_refuses_scope_that_fails_final_lint(self):
        del self.scope["objectives"][0]["initiatives"][0]["in_quarter"]
        with self.assertRaises(SystemExit) as cm:
            okr_plan.seed(self.write(self.scope, "scope-2026Q4.json"), os.path.join(self.tmp.name, "tp.json"))
        self.assertIn("не решено, берём ли в квартал", str(cm.exception))

    def test_seed_keeps_scope_roles(self):
        self.scope["roles"] = ["PO", "SA", "BE", "FE", "ADR", "DS"]
        self.scope["objectives"][0]["initiatives"][0]["notes"]["stages"][0]["role"] = "DS"
        out = os.path.join(self.tmp.name, "teamplanner-2026Q4.json")
        okr_plan.seed(self.write(self.scope, "scope-2026Q4.json"), out)
        with open(out, encoding="utf-8") as f:
            self.assertEqual(json.load(f)["roles"][-1], "DS")
        self.assertFalse([e for e in okr_plan.lint(out).errors if "роль" in e])

    def test_ext_stage_needs_external_team(self):
        self.scope["teams"] = [t for t in self.scope["teams"] if not t.get("external")]
        for o in self.scope["objectives"]:
            for i in o["initiatives"]:
                i["teams"] = [t for t in i["teams"] if t != "partner"]
        self.write(self.retro, "retro-2026Q3.json")
        rep = okr_plan.lint(self.write(self.scope, "scope-2026Q4.json"))
        self.assertTrue(any("ext — этап смежной команды, но в teams нет" in e for e in rep.errors))

    def test_linked_documents_never_crash_and_say_why(self):
        broken = copy.deepcopy(self.retro)
        broken["objectives"][0]["krs"] = "1.1"
        retro = self.write(broken, "retro-2026Q3.json")
        scope = self.write(self.scope, "scope-2026Q4.json")
        for rep in (okr_plan.lint(scope), okr_plan.lint(scope, retro_path=retro)):
            self.assertTrue(any("не проходит проверку структуры" in m for m in rep.errors + rep.warnings))
        with open(os.path.join(self.tmp.name, "scope-2026Q4.json"), "w", encoding="utf-8") as f:
            f.write('{"kind": "scope",}')
        tp = okr_plan.lint(self.write(fixture("teamplanner-2026Q4.json"), "teamplanner-2026Q4.json"))
        self.assertEqual(tp.errors, [])
        self.assertTrue(any(w.startswith("scope: файл scope-2026Q4.json не читается") for w in tp.warnings))
        self.write(self.retro, "scope-2026Q4.json")
        tp = okr_plan.lint(os.path.join(self.tmp.name, "teamplanner-2026Q4.json"))
        self.assertTrue(any("не scope (kind='retro')" in w for w in tp.warnings))

    def test_wrong_types_never_crash(self):
        docs = {n: fixture(n) for n in ("retro-2026Q3.json", "scope-2026Q4.json", "teamplanner-2026Q4.json")}

        def paths(node, pre=()):
            if pre:
                yield pre
            items = node.items() if isinstance(node, dict) else enumerate(node[:1]) if isinstance(node, list) else ()
            for k, v in items:
                yield from paths(v, pre + (k,))

        for name, doc in docs.items():
            for other, od in docs.items():
                self.write(od, other)
            for path in paths(doc):
                for bad in ("x", 5, [], {}):
                    d = copy.deepcopy(doc)
                    cur = d
                    for k in path[:-1]:
                        cur = cur[k]
                    cur[path[-1]] = bad
                    fp = self.write(d, name)
                    ops = [lambda: okr_plan.lint(fp, final=True),
                           lambda: okr_plan.render(fp, os.path.join(self.tmp.name, "o.html"))]
                    if name.startswith("teamplanner"):
                        ops.append(lambda: okr_plan.export_csv(fp, os.path.join(self.tmp.name, "o.csv")))
                        ops.append(lambda: okr_plan.jira_ready(fp))
                        ops.append(lambda: okr_plan.jira_csv(fp, os.path.join(self.tmp.name, "j.csv")))
                    if name.startswith("scope"):
                        ops.append(lambda: okr_plan.seed(fp, os.path.join(self.tmp.name, "s.json"), force=True))
                    for op in ops:
                        try:
                            op()
                        except SystemExit:
                            pass
                        except Exception as e:  # pragma: no cover — сообщение для разбора
                            self.fail(f"{name} {path} = {bad!r}: {type(e).__name__}: {e}")



if __name__ == "__main__":
    unittest.main()
