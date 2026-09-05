import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BacklogReader } from '../src/reader.js'
import { loadConfig } from '../src/config.js'
import { runCommandWithNode } from '../src/ports.js'

/**
 * Живой прогон против настоящего Backlog.md.
 *
 * Пропуск здесь шумный намеренно. В соседнем плагине такие же тесты молча пропускались без
 * переменной окружения, а итог выглядел зелёным — то есть разбор реального вывода CLI не
 * проверял никто, и об этом нельзя было догадаться по отчёту.
 */
async function ready(): Promise<boolean> {
  if (!process.env.OKR_WORKSPACE_ROOT) return false
  const probe = await runCommandWithNode(process.env.OKR_BACKLOG_BIN ?? 'backlog', ['--version'], process.cwd())
  return probe.code === 0
}

function announceSkip(): void {
  process.stderr.write(
    '\n' +
      '┌─ ЖИВОЙ ПРОГОН НЕ ВЫПОЛНЕН ─────────────────────────────────────────┐\n' +
      '│ Разбор реального вывода Backlog.md не проверялся.                  │\n' +
      '│ Запустите: OKR_WORKSPACE_ROOT=<корень воркспейса> pnpm test        │\n' +
      '└────────────────────────────────────────────────────────────────────┘\n\n',
  )
}

test('живой воркспейс: доска собирается из настоящего CLI', async t => {
  if (!await ready()) {
    announceSkip()
    t.skip('нет OKR_WORKSPACE_ROOT или backlog не установлен — разбор живого вывода не проверен')
    return
  }

  const reader = new BacklogReader(loadConfig(process.env))
  const board = await reader.readBoard()

  assert.equal(board.sprintLabels.length, 6)
  for (const objective of board.objectives) {
    for (const kr of objective.krs) {
      assert.match(kr.id, /^[A-Za-z]+-[\d.]+$/)
      assert.equal(kr.phases.length, 6)
    }
  }
})

test('живой воркспейс: версия CLI годится для дедлайнов', async t => {
  if (!await ready()) {
    t.skip('нет OKR_WORKSPACE_ROOT или backlog не установлен')
    return
  }
  const reader = new BacklogReader(loadConfig(process.env))
  await reader.ensureVersion()
})

test('живой воркспейс: карточка задачи разбирается', async t => {
  if (!await ready()) {
    t.skip('нет OKR_WORKSPACE_ROOT или backlog не установлен')
    return
  }
  const reader = new BacklogReader(loadConfig(process.env))
  const board = await reader.readBoard()
  const [kr] = board.objectives.flatMap(objective => objective.krs)
  if (kr === undefined) {
    // Пустой воркспейс — не ошибка, но и не проверка: говорим об этом вслух.
    announceSkip()
    t.skip('в воркспейсе нет ни одного ключевого результата — разбор карточки не проверен')
    return
  }

  // Конверт `task view --json` отличается от списка не только именем поля: `kind` равен
  // «task-view». Разбор списка этого не покрывает, и без отдельной проверки ошибка вылезает
  // только в интерфейсе.
  const detail = await reader.getTask(kr.id)
  assert.equal(detail.id, kr.id)
  assert.ok(Array.isArray(detail.comments))
  assert.ok(Array.isArray(detail.documentation))
})
