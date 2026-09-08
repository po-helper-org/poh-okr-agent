import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BacklogReader } from '../src/reader.js'
import { dispatch } from '../src/channel.js'
import { loadConfig } from '../src/config.js'
import { runCommandWithNode } from '../src/ports.js'
import type { PoTask } from '../src/model.js'
import type { RawTaskDetail } from '../src/backlog-json.js'

/**
 * Живая проверка заведения задач во всех сочетаниях полей.
 *
 * Проверять только «название + всё сразу» недостаточно: команда `backlog task create`
 * собирается из необязательных флагов, и сломаться может ровно одно сочетание — например,
 * срок без приоритета или описание вместе с привязкой. Каждая комбинация заводится и
 * перечитывается из Backlog.md; в конце всё созданное архивируется, чтобы прогон не оставлял
 * следов в воркспейсе.
 */

const WORKSPACE = process.env['OKR_WORKSPACE_ROOT']
/** Метка прогона: по ней уборка находит своё и не трогает чужие задачи. */
const TAG = 'проверка-комбинаций'

async function ready(): Promise<boolean> {
  if (WORKSPACE === undefined) return false
  const probe = await runCommandWithNode(process.env['OKR_BACKLOG_BIN'] ?? 'backlog', ['--version'], process.cwd())
  return probe.code === 0
}

function announceSkip(): void {
  process.stderr.write(
    '\n┌─ ЖИВОЙ ПРОГОН КОМБИНАЦИЙ НЕ ВЫПОЛНЕН ──────────────────────────────┐\n' +
    '│ Заведение задач против настоящего Backlog.md не проверялось.        │\n' +
    '│ Запустите: OKR_WORKSPACE_ROOT=<корень воркспейса> pnpm test         │\n' +
    '└─────────────────────────────────────────────────────────────────────┘\n\n',
  )
}

interface Combination {
  name: string
  payload: Record<string, unknown>
  /** Что должно оказаться в Backlog.md после заведения. */
  expect: (task: PoTask, detail: RawTaskDetail) => void
}

const DUE = '2026-12-15'

function combinations(krId: string | null): Combination[] {
  const base: Combination[] = [
    {
      name: 'только название',
      payload: {},
      expect: (task) => {
        assert.equal(task.dueDate, undefined)
        assert.equal(task.priority, null)
      },
    },
    {
      name: 'название и описание',
      payload: { description: 'Контекст задачи.' },
      expect: (_task, detail) => { assert.equal(detail.description, 'Контекст задачи.') },
    },
    {
      name: 'название и срок',
      payload: { dueDate: DUE },
      expect: (task) => { assert.equal(task.dueDate, DUE) },
    },
    {
      name: 'название и приоритет',
      payload: { priority: 'high' },
      expect: (task) => { assert.equal(task.priority, 'high') },
    },
    {
      name: 'название, приоритет и срок',
      payload: { priority: 'low', dueDate: DUE },
      expect: (task) => {
        assert.equal(task.priority, 'low')
        assert.equal(task.dueDate, DUE)
      },
    },
    {
      name: 'название, описание и срок',
      payload: { description: 'Со сроком.', dueDate: DUE },
      expect: (task, detail) => {
        assert.equal(task.dueDate, DUE)
        assert.equal(detail.description, 'Со сроком.')
      },
    },
    {
      name: 'название, описание и приоритет',
      payload: { description: 'С приоритетом.', priority: 'medium' },
      expect: (task, detail) => {
        assert.equal(task.priority, 'medium')
        assert.equal(detail.description, 'С приоритетом.')
      },
    },
    {
      name: 'договорённость со сроком',
      payload: { kind: 'control', dueDate: DUE },
      expect: (task) => {
        assert.equal(task.kind, 'control')
        assert.equal(task.dueDate, DUE)
      },
    },
    {
      name: 'риск с высоким приоритетом',
      payload: { kind: 'risk', priority: 'high' },
      expect: (task) => {
        assert.equal(task.kind, 'risk')
        assert.equal(task.priority, 'high')
      },
    },
    {
      name: 'многострочное описание',
      payload: { description: '## Раздел\n- [ ] пункт\n\n---\n\n> цитата' },
      expect: (_task, detail) => {
        // Разметка должна дойти до файла как есть: описание читают и человек, и CLI.
        assert.match(detail.description ?? '', /## Раздел/)
        assert.match(detail.description ?? '', /- \[ \] пункт/)
      },
    },
  ]

  if (krId === null) return base

  return [
    ...base,
    {
      name: 'название и привязка к KR',
      payload: { relatedKrId: krId },
      expect: (task, detail) => {
        assert.deepEqual(task.relatedKrIds, [krId])
        assert.deepEqual(detail.dependencies, [krId])
      },
    },
    {
      name: 'всё сразу: описание, срок, приоритет, тип и KR',
      payload: {
        description: 'Полный набор.', dueDate: DUE, priority: 'high',
        kind: 'risk', relatedKrId: krId,
      },
      expect: (task, detail) => {
        assert.equal(task.kind, 'risk')
        assert.equal(task.priority, 'high')
        assert.equal(task.dueDate, DUE)
        assert.deepEqual(task.relatedKrIds, [krId])
        assert.equal(detail.description, 'Полный набор.')
      },
    },
  ]
}

test('живой воркспейс: задача заводится во всех сочетаниях полей', async t => {
  if (!await ready()) {
    announceSkip()
    t.skip('нет OKR_WORKSPACE_ROOT или backlog не установлен')
    return
  }

  const reader = new BacklogReader(loadConfig(process.env))
  const signal = new AbortController().signal
  const created: string[] = []

  try {
    // Привязку проверяем настоящим ключевым результатом: Backlog.md отвергает зависимость
    // на несуществующую задачу, и выдуманный идентификатор дал бы ложное падение.
    const board = await reader.readBoard(signal)
    const krId = board.objectives.flatMap(objective => objective.krs)[0]?.id ?? null

    for (const combination of combinations(krId)) {
      const title = `${TAG}: ${combination.name}`
      const result = await dispatch(
        reader, 'createPoTask', { title, ...combination.payload }, signal,
      ) as { ok: boolean; value?: { id: string | null }; error?: { message: string } }

      assert.ok(result.ok, `${combination.name}: ${result.error?.message ?? 'не создалась'}`)
      const id = result.value?.id ?? null
      assert.ok(id !== null, `${combination.name}: CLI не вернул идентификатор`)
      created.push(id)

      const tasks = await reader.listPoTasks(signal)
      const task = tasks.find(item => item.id === id)
      assert.ok(task !== undefined, `${combination.name}: задача не читается из списка`)
      assert.equal(task.title, title, `${combination.name}: заголовок не совпал`)

      const detail = await reader.getTask(id, signal)
      combination.expect(task, detail)
    }
  } finally {
    // Уборка идёт в любом случае: упавший прогон не должен оставлять мусор в воркспейсе.
    // Причина неудачи не глотается, а копится: молчаливый `catch` уже один раз спрятал
    // разовый сбой CLI, и вместо диагноза остался только список выживших задач.
    const failures: string[] = []
    for (const id of created) {
      // Одна повторная попытка: запись в Backlog.md срывается разово, когда несколько
      // процессов подряд правят одни и те же файлы.
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await reader.write(['task', 'archive', id], signal)
          break
        } catch (cause: unknown) {
          if (attempt === 2) failures.push(`${id}: ${cause instanceof Error ? cause.message : String(cause)}`)
        }
      }
    }

    const left = (await reader.listPoTasks(signal)).filter(task => task.title.startsWith(TAG))
    assert.deepEqual(
      left.map(task => task.id),
      [],
      `после уборки остались тестовые задачи${failures.length > 0 ? `; причины: ${failures.join(' | ')}` : ''}`,
    )
  }
})
