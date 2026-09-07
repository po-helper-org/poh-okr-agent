import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupOf, groupTasks, isoDay } from '../src/po-groups.js'
import type { PoTask } from '../src/model.js'

const TODAY = new Date(2026, 8, 5) // 5 сентября 2026

function task(over: Partial<PoTask>): PoTask {
  return {
    id: 'PO-1', title: 'задача', status: 'To Do', priority: 'medium',
    labels: [], kind: 'task', relatedKrIds: [], ...over,
  }
}

test('день считается календарно, без времени и пояса', () => {
  assert.equal(isoDay(new Date(2026, 0, 9)), '2026-01-09')
})

test('срок сегодня попадает в «Сегодня»', () => {
  assert.equal(groupOf(task({ dueDate: '2026-09-05' }), TODAY), 'today')
})

test('просроченное выносится в свою секцию', () => {
  // Прошедший срок — другой сигнал, чем «сделать сегодня»: в общем списке он теряется.
  assert.equal(groupOf(task({ dueDate: '2026-08-01' }), TODAY), 'overdue')
})

test('вчерашний срок уже просрочен, сегодняшний — ещё нет', () => {
  assert.equal(groupOf(task({ dueDate: '2026-09-04' }), TODAY), 'overdue')
  assert.equal(groupOf(task({ dueDate: '2026-09-05' }), TODAY), 'today')
})

test('срок внутри недели попадает в «На неделе»', () => {
  assert.equal(groupOf(task({ dueDate: '2026-09-12' }), TODAY), 'week')
})

test('граница недели включительно', () => {
  assert.equal(groupOf(task({ dueDate: '2026-09-12' }), TODAY), 'week')
  assert.equal(groupOf(task({ dueDate: '2026-09-13' }), TODAY), 'later')
})

test('задача без срока не теряется', () => {
  assert.equal(groupOf(task({}), TODAY), 'noDate')
})

test('выполненное уходит в свою секцию независимо от срока', () => {
  assert.equal(groupOf(task({ status: 'Done', dueDate: '2026-09-05' }), TODAY), 'done')
})

test('статус сравнивается без учёта регистра', () => {
  assert.equal(groupOf(task({ status: 'DONE' }), TODAY), 'done')
})

test('вкладки не смешиваются', () => {
  const groups = groupTasks(
    [task({ id: 'PO-1', kind: 'task' }), task({ id: 'PO-2', kind: 'risk' })],
    'risk',
    TODAY,
  )
  assert.equal(groups.length, 1)
  assert.equal(groups[0].tasks[0].id, 'PO-2')
})

test('пустые секции не возвращаются', () => {
  const groups = groupTasks([task({ dueDate: '2026-09-05' })], 'task', TODAY)
  assert.deepEqual(groups.map(g => g.key), ['today'])
})

test('секции идут от ближайшего к выполненному', () => {
  const groups = groupTasks([
    task({ id: 'PO-5', status: 'Done' }),
    task({ id: 'PO-4' }),
    task({ id: 'PO-3', dueDate: '2026-10-01' }),
    task({ id: 'PO-2', dueDate: '2026-09-05' }),
    task({ id: 'PO-1', dueDate: '2026-08-20' }),
  ], 'task', TODAY)
  assert.deepEqual(groups.map(g => g.key), ['overdue', 'today', 'later', 'noDate', 'done'])
})

test('внутри секции ближайший срок выше', () => {
  const groups = groupTasks([
    task({ id: 'PO-2', dueDate: '2026-09-12' }),
    task({ id: 'PO-1', dueDate: '2026-09-08' }),
  ], 'task', TODAY)
  assert.deepEqual(groups[0].tasks.map(t => t.id), ['PO-1', 'PO-2'])
})
