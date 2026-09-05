import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BacklogSchemaError, parseTaskList, parseTaskView, toSummary } from '../src/backlog-json.js'

const LIST = JSON.stringify({
  schemaVersion: 1,
  kind: 'task-list',
  tasks: [
    {
      id: 'PO-30',
      title: 'Доля отказов ниже 2% (ac: 1/3)',
      status: 'In Progress',
      type: 'okr',
      priority: 'high',
      labels: ['okr-phase:s2:dev'],
      milestone: 'm-1',
      dueDate: '2026-09-19',
      assignees: ['@ivanov'],
      references: ['https://tracker.example/EPIC-1'],
      parentTaskId: null,
      acceptanceCriteriaCompleted: 1,
      acceptanceCriteriaCount: 3,
    },
  ],
})

test('список задач разбирается из машинного вывода', () => {
  const [task] = parseTaskList(LIST)
  assert.equal(task.id, 'PO-30')
  assert.equal(task.milestone, 'm-1')
  assert.equal(task.dueDate, '2026-09-19')
  assert.deepEqual(task.labels, ['okr-phase:s2:dev'])
})

test('счётчик критериев не попадает в заголовок', () => {
  // В `--plain` он приезжает хвостом строки ` (ac: 1/3)` и позиционным разбором забирается
  // в название. В JSON это отдельные поля — здесь заголовок остаётся ровно тем, что задал PO.
  const [task] = parseTaskList(LIST)
  assert.equal(task.title, 'Доля отказов ниже 2% (ac: 1/3)')
  assert.equal(task.acceptanceCriteriaCount, 3)
})

test('незнакомая версия схемы — ошибка, а не разбор наугад', () => {
  const payload = JSON.stringify({ schemaVersion: 2, kind: 'task-list', tasks: [] })
  assert.throws(() => parseTaskList(payload), BacklogSchemaError)
})

test('чужой вид ответа не разбирается как список', () => {
  const payload = JSON.stringify({ schemaVersion: 1, kind: 'task', task: {} })
  assert.throws(() => parseTaskList(payload), BacklogSchemaError)
})

test('задача без идентификатора — ошибка', () => {
  const payload = JSON.stringify({ schemaVersion: 1, kind: 'task-list', tasks: [{ title: 'без id' }] })
  assert.throws(() => parseTaskList(payload), BacklogSchemaError)
})

test('пустой заголовок допустим — задачу заводят кнопкой и называют потом', () => {
  const payload = JSON.stringify({ schemaVersion: 1, kind: 'task-list', tasks: [{ id: 'PO-31' }] })
  const [task] = parseTaskList(payload)
  assert.equal(task.title, '')
  assert.deepEqual(task.labels, [])
})

test('карточка задачи отдаёт комментарии как события ленты', () => {
  const payload = JSON.stringify({
    schemaVersion: 1,
    kind: 'task',
    task: {
      id: 'PO-30',
      title: 'KR',
      comments: [{ author: '@ivanov', date: '2026-09-01', text: 'Согласовали объём' }],
      documentation: ['https://confluence.example/BFT'],
      dependencies: ['PO-12'],
    },
  })
  const task = parseTaskView(payload)
  assert.equal(task.comments.length, 1)
  assert.equal(task.comments[0].text, 'Согласовали объём')
  assert.deepEqual(task.dependencies, ['PO-12'])
})

test('незнакомый приоритет считается средним, а не роняет разбор', () => {
  const summary = toSummary({
    id: 'PO-30', title: 'KR', status: 'To Do', type: 'okr', priority: 'critical',
    labels: [], milestone: null, dueDate: null, assignees: [], references: [],
    parentTaskId: null, acceptanceCriteriaCompleted: 0, acceptanceCriteriaCount: 0,
  })
  assert.equal(summary.priority, 'medium')
})

test('пустые milestone и dueDate не превращаются в поля', () => {
  const summary = toSummary({
    id: 'PO-30', title: 'KR', status: 'To Do', type: 'okr', priority: 'low',
    labels: [], milestone: null, dueDate: null, assignees: [], references: [],
    parentTaskId: null, acceptanceCriteriaCompleted: 0, acceptanceCriteriaCount: 0,
  })
  assert.equal('milestone' in summary, false)
  assert.equal('dueDate' in summary, false)
})
