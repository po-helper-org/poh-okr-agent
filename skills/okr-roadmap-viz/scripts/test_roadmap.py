"""Самотест roadmap.py: python3 -m unittest discover -s skills/okr-roadmap-viz/scripts"""
import contextlib
import io
import json
import os
import re
import shutil
import tempfile
import unittest

import roadmap

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLE = os.path.join(HERE, 'fixtures', 'sample')


def quiet(fn, *a):
    with contextlib.redirect_stdout(io.StringIO()) as out:
        res = fn(*a)
    return res, out.getvalue()


class Case(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.dir = os.path.join(self.tmp, 'goal')
        shutil.copytree(SAMPLE, self.dir, ignore=shutil.ignore_patterns('roadmap.json', 'roadmap.html'))

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def task(self, tid):
        for name in os.listdir(os.path.join(self.dir, 'backlog')):
            if name.startswith(tid + ' - '):
                return os.path.join(self.dir, 'backlog', name)
        raise KeyError(tid)

    def edit(self, path, old, new):
        with open(path, encoding='utf-8') as f:
            text = f.read()
        self.assertIn(old, text)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text.replace(old, new, 1))

    def errors(self):
        rm, rep = roadmap.load(self.dir)
        return '\n'.join(rep.errors)


class LintOk(Case):
    def test_sample_is_clean(self):
        rm, rep = roadmap.load(self.dir)
        self.assertEqual(rep.errors, [])
        self.assertEqual(rep.warnings, [])
        self.assertEqual(len(rm['tasks']), 13)

    def test_numbering_follows_tree(self):
        rm, _ = roadmap.load(self.dir)
        num = rm['num']
        self.assertEqual(num['task-1'], '2.1')      # без этапа — до этапов
        self.assertEqual(num['task-2'], '2.2.1')    # первый в этапе analytics
        self.assertNotIn('task-3', num)             # ВОПРОС не нумеруется
        self.assertNotIn('task-10', num)            # блокер не нумеруется
        self.assertEqual(num['task-6'], '2.3.1')
        self.assertEqual(num['task-8'], '2.3.1.2')  # подзадача
        self.assertEqual(rm['snum'], {'analytics': '2.2', 'dev': '2.3', 'pilot': '2.4'})

    def test_lint_writes_graph(self):
        rm, out = quiet(roadmap.cmd_lint, self.dir)
        self.assertIsNotNone(rm)
        with open(os.path.join(self.dir, 'roadmap.json'), encoding='utf-8') as f:
            doc = json.load(f)
        by = {t['id']: t for t in doc['tasks']}
        self.assertEqual(by['task-6']['after'], ['stage:analytics'])
        self.assertEqual(by['task-4']['before'], ['task-5', 'task-6'])  # task-6 — через этап
        self.assertIn('Принято', out)

    def test_ordinal_controls_order(self):
        self.edit(self.task('task-9'), 'ordinal: 20', 'ordinal: 1')
        rm, rep = roadmap.load(self.dir)
        self.assertEqual(rm['num']['task-9'], '2.3.1')
        self.assertEqual(rm['num']['task-6'], '2.3.2')


class LintErrors(Case):
    def test_unknown_dependency(self):
        self.edit(self.task('task-9'), 'dependencies: [task-6]', 'dependencies: [task-6, task-99]')
        self.assertIn('нет задачи «task-99»', self.errors())

    def test_cycle(self):
        self.edit(self.task('task-1'), 'customer:', 'dependencies: [task-4]\ncustomer:')
        self.assertIn('цикл зависимостей', self.errors())

    def test_cycle_through_stage(self):
        self.edit(self.task('task-2'), 'dependencies: [task-1]', 'dependencies: [task-1, stage:pilot]')
        self.assertIn('цикл зависимостей', self.errors())

    def test_dependency_inside_branch(self):
        self.edit(self.task('task-7'), 'start:', 'dependencies: [task-6]\nstart:')
        self.assertIn('предок или потомок', self.errors())

    def test_unknown_stage_role_parent(self):
        self.edit(self.task('task-4'), 'stage: analytics', 'stage: nope')
        self.edit(self.task('task-4'), 'role: SA', 'role: QA')
        self.edit(self.task('task-9'), 'stage: dev', 'parent: task-77')
        err = self.errors()
        self.assertIn('stage «nope»', err)
        self.assertIn('role QA', err)
        self.assertIn('parent «task-77»', err)

    def test_dates(self):
        self.edit(self.task('task-6'), 'end: 2027-01-22', 'end: 2026-12-01')
        self.edit(self.task('task-7'), 'start: 2026-12-14', 'start: 14.12.2026')
        err = self.errors()
        self.assertIn('раньше start', err)
        self.assertIn('ГГГГ-ММ-ДД', err)

    def test_duplicate_id(self):
        shutil.copy(self.task('task-1'), os.path.join(self.dir, 'backlog', 'copy.md'))
        self.assertIn('id task-1 уже есть', self.errors())

    def test_title_reference(self):
        self.edit(self.task('task-13'), '{#task-12}', '{#task-404}')
        self.assertIn('{#task-404}', self.errors())

    def test_two_own_tracks(self):
        self.edit(os.path.join(self.dir, 'roadmap.md'), '## Трек 3. Отчётность\n', '## Трек 3. Отчётность\n\n- свой: да\n')
        self.assertIn('свой трек — один', self.errors())

    def test_parent_cycle(self):
        self.edit(self.task('task-6'), 'stage: dev', 'parent: task-7')
        self.assertIn('parent образует цикл', self.errors())

    def test_lint_exit_code(self):
        self.edit(self.task('task-9'), 'role: FE', 'role: XX')
        self.assertEqual(quiet(roadmap.main, ['roadmap.py', 'lint', self.dir])[0], 1)

    def test_date_order_warning(self):
        self.edit(self.task('task-9'), 'start: 2027-01-25', 'start: 2027-01-11')
        rm, rep = roadmap.load(self.dir)
        self.assertEqual(rep.errors, [])
        self.assertTrue(any('не позже, чем закончится' in w for w in rep.warnings))


    def test_milestone_same_day_is_ok(self):
        # веха task-5 стоит в день окончания task-4 — это не нарушение
        self.edit(self.task('task-4'), 'end: 2026-12-03', 'end: 2026-12-04')
        rm, rep = roadmap.load(self.dir)
        self.assertEqual(rep.warnings, [])

    def test_risk_not_numbered(self):
        self.edit(self.task('task-9'), 'title: Витрина абонементов на сайте', 'title: РИСК: витрина не успеет')
        rm, _ = roadmap.load(self.dir)
        self.assertNotIn('task-9', rm['num'])


class Build(Case):
    def build(self, out):
        code, _ = quiet(roadmap.main, ['roadmap.py', 'build', self.dir, '-o', out])
        self.assertEqual(code, 0)
        with open(out, encoding='utf-8') as f:
            return f.read()

    def test_byte_identical(self):
        a = self.build(os.path.join(self.tmp, 'a.html'))
        b = self.build(os.path.join(self.tmp, 'b.html'))
        self.assertEqual(a, b)

    def test_payload(self):
        html = self.build(os.path.join(self.tmp, 'a.html'))
        data = json.loads(re.search(r'<script type="application/json" id="data">(.*?)</script>', html, re.S).group(1))
        seed = json.loads(re.search(r'<script type="application/json" id="seed">(.*?)</script>', html, re.S).group(1))
        self.assertEqual(data['w0'], '2026-09-28')
        self.assertEqual([t['n'] for t in data['tracks']], [1, 2, 3])
        self.assertTrue(data['tracks'][1]['own'])
        self.assertEqual(seed['state']['task-6']['dep'], ['S:Аналитика и требования'])
        self.assertEqual(seed['state']['task-5']['ty'], 'ms')
        self.assertEqual(seed['orders']['R'][0], 'task-1')
        self.assertEqual(len(seed['cmts']), 2)
        self.assertEqual(data['stamp'], seed['stamp'])
        self.assertIn('id="cbar"', html)          # панель комментариев
        self.assertNotIn('fonts.googleapis', html)  # без внешних запросов

    def test_stamp_changes_with_md(self):
        a = self.build(os.path.join(self.tmp, 'a.html'))
        self.edit(self.task('task-9'), 'status: Открыт', 'status: В работе')
        b = self.build(os.path.join(self.tmp, 'b.html'))
        stamp = lambda h: re.search(r'"stamp":"([0-9a-f]+)"', h).group(1)
        self.assertNotEqual(stamp(a), stamp(b))

    def test_script_breakout_escaped(self):
        self.edit(self.task('task-9'), 'title: Витрина абонементов на сайте', 'title: Витрина </script><b>x</b>')
        html = self.build(os.path.join(self.tmp, 'a.html'))
        self.assertNotIn('</script><b>', html)

    def test_build_refuses_on_errors(self):
        self.edit(self.task('task-9'), 'role: FE', 'role: XX')
        code, out = quiet(roadmap.main, ['roadmap.py', 'build', self.dir])
        self.assertEqual(code, 1)
        self.assertFalse(os.path.exists(os.path.join(self.dir, 'roadmap.html')))


class Parsing(unittest.TestCase):
    def test_front_matter_lists(self):
        fm, body = roadmap.front_matter('---\nid: a\ndependencies:\n  - b\n  - "c"\nshort: \'it\'\'s\'\n---\ntext\n')
        self.assertEqual(fm['dependencies'], ['b', 'c'])
        self.assertEqual(fm['short'], "it's")
        self.assertEqual(body, 'text\n')

    def test_backlog_md_status_alias(self):
        self.assertEqual(roadmap.STATUS_ALIAS['in progress'], 'В работе')
        self.assertEqual(roadmap.STATUS_ALIAS['done'], 'Выполнено')


if __name__ == '__main__':
    unittest.main()
