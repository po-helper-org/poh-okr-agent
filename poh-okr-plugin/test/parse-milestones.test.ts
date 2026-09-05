import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMilestoneList } from '../src/parse-milestones.js'

const OUTPUT = [
  'Active milestones (2):',
  '  m-0: Sprint 2026-09-03 – 2026-09-16 (3/8 done)',
  '  m-1: Удержание пользователей',
  '',
  'Completed milestones (1):',
  '  m-2: Запуск кино (5/5 done)',
  '',
].join('\n')

test('объективы разбираются с прогрессом', () => {
  const rows = parseMilestoneList(OUTPUT)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[0], {
    id: 'm-0',
    title: 'Sprint 2026-09-03 – 2026-09-16',
    done: 3,
    total: 8,
    completed: false,
  })
})

test('объектив без счётчика разбирается, счётчик пустой', () => {
  const rows = parseMilestoneList(OUTPUT)
  assert.equal(rows[1].title, 'Удержание пользователей')
  assert.equal(rows[1].done, null)
})

test('завершённые объективы помечаются', () => {
  const rows = parseMilestoneList(OUTPUT)
  assert.equal(rows[2].completed, true)
})

test('заглушка пустого раздела не считается объективом', () => {
  const rows = parseMilestoneList('Active milestones (0):\n  (none)\n')
  assert.deepEqual(rows, [])
})

test('перевод строки Windows не мешает разбору', () => {
  const rows = parseMilestoneList('Active milestones (1):\r\n  m-0: Цель\r\n')
  assert.equal(rows[0].id, 'm-0')
})
