import { test } from 'node:test'
import assert from 'node:assert/strict'
import { currentQuarter, milestoneIdFromFile, parseMilestoneFile } from '../src/milestone-file.js'

const FILE = [
  '---',
  'id: m-1',
  'title: "Objective 1"',
  'due_date: 2026-12-31',
  '---',
  '',
  '## Description',
  '',
  'Узел хребта OKR.',
  '',
  '## Tasks',
  '',
  'не должно попасть в описание',
].join('\n')

test('карточка объектива разбирается', () => {
  const card = parseMilestoneFile(FILE)
  assert.equal(card?.id, 'm-1')
  assert.equal(card?.title, 'Objective 1')
  assert.equal(card?.dueDate, '2026-12-31')
})

test('описание обрывается следующим разделом', () => {
  assert.equal(parseMilestoneFile(FILE)?.description, 'Узел хребта OKR.')
})

test('объектив без описания даёт пустую строку, а не null', () => {
  // Карточке всё равно, а вызывающему не приходится различать «нет раздела» и «пусто».
  const card = parseMilestoneFile('---\nid: m-2\ntitle: Раз\n---\n')
  assert.equal(card?.description, '')
  assert.equal(card?.dueDate, null)
})

test('файл без frontmatter не разбирается', () => {
  assert.equal(parseMilestoneFile('просто текст'), null)
  assert.equal(parseMilestoneFile('---\nid: m-1\n'), null)
})

test('идентификатор берётся из имени файла', () => {
  assert.equal(milestoneIdFromFile('m-1 - objective-1.md'), 'm-1')
  assert.equal(milestoneIdFromFile('task-5 - что-то.md'), null)
})

test('квартал считается по месяцу', () => {
  assert.equal(currentQuarter(new Date(2026, 0, 15)), '2026Q1')
  assert.equal(currentQuarter(new Date(2026, 8, 7)), '2026Q3')
  assert.equal(currentQuarter(new Date(2026, 11, 31)), '2026Q4')
})
