import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BacklogReader } from '../src/reader.js'
import { BacklogTooOldError, BacklogUnavailableError } from '../src/errors.js'
import type { CommandResult, RunCommand } from '../src/ports.js'
import type { OkrConfig } from '../src/config.js'

const CONFIG: OkrConfig = {
  workspaceRoot: '/tmp/workspace',
  backlogBin: 'backlog',
  krTaskType: 'okr',
  poTaskType: 'potask',
  boardDocTitle: 'okr-board',
  nexusOkrPath: 'GROUND/NEXUS/okr',
  sessionPath: '',
}

/** Файловые порты в этих сценариях не задействованы: читается только вывод CLI. */
const noFile = async (): Promise<string | null> => null
const noDir = async (): Promise<string[]> => []

function result(stdout: string, code = 0): CommandResult {
  return { stdout, stderr: '', code, timedOut: false, killedBySignal: null }
}

function taskList(tasks: object[]): string {
  return JSON.stringify({ schemaVersion: 1, kind: 'task-list', tasks })
}

/** Подделка CLI: отвечает по первому подходящему совпадению аргументов. */
function fakeRun(routes: Array<[RegExp, CommandResult]>, log?: string[][]): RunCommand {
  return async (_bin, args) => {
    log?.push(args)
    const joined = args.join(' ')
    for (const [pattern, response] of routes) {
      if (pattern.test(joined)) return response
    }
    return result('', 1)
  }
}

const VERSION_OK: [RegExp, CommandResult] = [/^--version$/, result('1.51.0\n')]

test('старый CLI отвергается с внятной ошибкой, а не работает наполовину', async () => {
  // На 1.50 нет `--due-date`, и панель работы потеряла бы группировку по срокам, выглядя
  // при этом исправной.
  const reader = new BacklogReader(CONFIG, { run: fakeRun([[/^--version$/, result('1.50.1\n')]]), readTextFile: noFile, listDirectory: noDir })
  await assert.rejects(() => reader.listKeyResults(), BacklogTooOldError)
})

test('отсутствие CLI отличается от ошибки команды', async () => {
  const reader = new BacklogReader(CONFIG, { run: async () => result('', -1), readTextFile: noFile, listDirectory: noDir })
  await assert.rejects(() => reader.listKeyResults(), BacklogUnavailableError)
})

test('версия проверяется один раз, а не на каждый вызов', async () => {
  const log: string[][] = []
  const reader = new BacklogReader(CONFIG, {
    readTextFile: noFile,
    listDirectory: noDir,
    run: fakeRun([VERSION_OK, [/task list/, result(taskList([]))]], log),
  })
  await reader.listKeyResults()
  await reader.listKeyResults()
  assert.equal(log.filter(args => args[0] === '--version').length, 1)
})

test('неудачная проверка версии не запоминается как выполненная', async () => {
  // Иначе временный сбой CLI выключил бы раздел до перезапуска харнесса.
  let failing = true
  const reader = new BacklogReader(CONFIG, {
    readTextFile: noFile,
    listDirectory: noDir,
    run: async (_bin, args) => {
      if (args[0] === '--version') return failing ? result('', -1) : result('1.51.0\n')
      return result(taskList([]))
    },
  })
  await assert.rejects(() => reader.listKeyResults())
  failing = false
  assert.deepEqual(await reader.listKeyResults(), [])
})

test('тип задач фильтруется на стороне CLI, а не после выгрузки всего бэклога', async () => {
  const log: string[][] = []
  const reader = new BacklogReader(CONFIG, {
    readTextFile: noFile,
    listDirectory: noDir,
    run: fakeRun([VERSION_OK, [/task list/, result(taskList([]))]], log),
  })
  await reader.listKeyResults()
  const listCall = log.find(args => args[0] === 'task')!
  assert.deepEqual(listCall, ['task', 'list', '--type', 'okr', '--json'])
})

test('доска раскладывает KR по объективам', async () => {
  const reader = new BacklogReader(CONFIG, {
    readTextFile: noFile,
    listDirectory: noDir,
    run: fakeRun([
      VERSION_OK,
      [/doc list/, result(' - \n')],
      [/milestone list/, result('Active milestones (1):\n  m-1: Удержание\n')],
      [/task list/, result(taskList([
        { id: 'PO-30', title: 'KR один', status: 'To Do', type: 'okr', labels: ['okr-phase:s1:dev'], milestone: 'm-1' },
      ]))],
    ]),
  })

  const board = await reader.readBoard()
  assert.equal(board.objectives.length, 1)
  assert.equal(board.objectives[0].title, 'Удержание')
  assert.deepEqual(board.objectives[0].krs[0].phases, [3, 0, 0, 0, 0, 0])
})

test('KR без объектива не теряется, а собирается в отдельную группу', async () => {
  // Задача, заведённая мимо плагина, должна быть видна — иначе она пропадёт молча.
  const reader = new BacklogReader(CONFIG, {
    readTextFile: noFile,
    listDirectory: noDir,
    run: fakeRun([
      VERSION_OK,
      [/doc list/, result(' - \n')],
      [/milestone list/, result('Active milestones (0):\n  (none)\n')],
      [/task list/, result(taskList([{ id: 'PO-31', title: 'Осиротевший KR', status: 'To Do', type: 'okr' }]))],
    ]),
  })

  const board = await reader.readBoard()
  assert.equal(board.objectives.length, 1)
  assert.equal(board.objectives[0].id, '')
  assert.equal(board.objectives[0].krs[0].id, 'PO-31')
})

test('доска отдаёт шесть подписей столбцов', async () => {
  const reader = new BacklogReader(CONFIG, {
    readTextFile: noFile,
    listDirectory: noDir,
    run: fakeRun([
      VERSION_OK,
      [/doc list/, result(' - \n')],
      [/milestone list/, result('Active milestones (0):\n  (none)\n')],
      [/task list/, result(taskList([]))],
    ]),
  })
  assert.equal((await reader.readBoard()).sprintLabels.length, 6)
})

test('подписи столбцов берутся из служебного документа', async () => {
  const reader = new BacklogReader(CONFIG, {
    readTextFile: noFile,
    listDirectory: noDir,
    run: fakeRun([
      VERSION_OK,
      [/doc list/, result(' - \ndoc-1 - okr-board\n')],
      [/doc view/, result('---\nid: doc-1\n---\n{"sprintLabels":["Q3-S1","B","C","D","E","F"]}\n')],
      [/milestone list/, result('Active milestones (0):\n  (none)\n')],
      [/task list/, result(taskList([]))],
    ]),
  })
  assert.equal((await reader.readBoard()).sprintLabels[0], 'Q3-S1')
})

test('без служебного документа доска открывается с умолчаниями', async () => {
  // Документ заводится лениво, при первой правке подписей: свежий воркспейс не должен
  // обрастать служебными файлами только оттого, что доску один раз открыли.
  const reader = new BacklogReader(CONFIG, {
    readTextFile: noFile,
    listDirectory: noDir,
    run: fakeRun([
      VERSION_OK,
      [/doc list/, result(' - \n')],
      [/milestone list/, result('Active milestones (0):\n  (none)\n')],
      [/task list/, result(taskList([]))],
    ]),
  })
  assert.deepEqual((await reader.readBoard()).sprintLabels, ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'])
})
