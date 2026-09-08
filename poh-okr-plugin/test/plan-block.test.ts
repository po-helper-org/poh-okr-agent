import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyPlan, formatPlan, parsePlan } from '../src/plan-block.js'

test('стадия со спринтом и ресурсами разбирается', () => {
  const plan = parsePlan('dev: спринт 3 / 2 разработчика')
  assert.deepEqual(plan.stages.dev, { sprint: 2, resources: '2 разработчика' })
})

test('стадия без ресурсов разбирается', () => {
  assert.deepEqual(parsePlan('qa: спринт 5').stages.qa, { sprint: 4, resources: '' })
})

test('незапланированная стадия остаётся пустой', () => {
  assert.equal(parsePlan('release: —').stages.release.sprint, null)
})

test('спринт за пределами доски не принимается', () => {
  assert.equal(parsePlan('dev: спринт 9').stages.dev.sprint, null)
})

test('ресурсы с косой чертой не режутся по второму разделителю', () => {
  assert.equal(parsePlan('dev: спринт 1 / 2 FE / 1 BE').stages.dev.resources, '2 FE / 1 BE')
})

test('ответственные разбираются', () => {
  const plan = parsePlan('teams: GDS\ntechLeads: Иванов\nexecutors: Петров, Сидоров')
  assert.equal(plan.teams, 'GDS')
  assert.equal(plan.techLeads, 'Иванов')
  assert.equal(plan.executors, 'Петров, Сидоров')
})

test('посторонний текст в поле плана не ломает разбор', () => {
  // Поле плана может содержать и обычный текст, написанный человеком.
  const plan = parsePlan('Сначала уточняем объём у заказчика.\n\ndev: спринт 2')
  assert.equal(plan.stages.dev.sprint, 1)
})

test('пустой план разбирается в пустой блок', () => {
  assert.deepEqual(parsePlan(''), emptyPlan())
  assert.deepEqual(parsePlan(null), emptyPlan())
})

test('план переживает круг записи и чтения', () => {
  const plan = emptyPlan()
  plan.stages.research = { sprint: 0, resources: '1 аналитик' }
  plan.stages.dev = { sprint: 2, resources: '' }
  plan.teams = 'GDS'
  assert.deepEqual(parsePlan(formatPlan(plan)), plan)
})

test('пустые стадии не попадают в текст', () => {
  const plan = emptyPlan()
  plan.stages.dev = { sprint: 1, resources: '' }
  assert.equal(formatPlan(plan), 'dev: спринт 2')
})
