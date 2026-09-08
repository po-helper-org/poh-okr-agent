import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutAround, minimumDistance } from '../src/client/graph.js'

const PANE = { width: 900, height: 700 }

test('узлы не накладываются при полном наборе данных', () => {
  // Требование D-05: объектив, пять стадий, Confluence, эпик, команды, техлиды, исполнители,
  // риск — двенадцать узлов вокруг центра.
  const points = layoutAround(12, PANE)
  assert.equal(points.length, 12)
  assert.ok(minimumDistance(points) >= 100, `узлы сошлись на ${minimumDistance(points)}`)
})

test('раскладка не выходит за пределы области', () => {
  for (const point of layoutAround(12, PANE)) {
    assert.ok(point.x >= 0 && point.x <= PANE.width, `x вне области: ${point.x}`)
    assert.ok(point.y >= 0 && point.y <= PANE.height, `y вне области: ${point.y}`)
  }
})

test('первый узел стоит сверху по центру', () => {
  // Порядок узлов на экране совпадает с порядком в данных: одна и та же сущность у одного
  // и того же KR не должна прыгать при перерисовке.
  const [first] = layoutAround(6, PANE)
  assert.equal(Math.round(first.x), PANE.width / 2)
  assert.ok(first.y < PANE.height / 2)
})

test('узлов больше, чем помещается в кольцо, — заводится второе', () => {
  const points = layoutAround(24, PANE)
  assert.equal(points.length, 24)
  assert.ok(minimumDistance(points) > 0)
})

test('крошечная область не роняет раскладку в бесконечный цикл', () => {
  const points = layoutAround(12, { width: 120, height: 90 })
  assert.equal(points.length, 12)
})

test('пустой граф — пустая раскладка', () => {
  assert.deepEqual(layoutAround(0, PANE), [])
})

test('единственный узел ставится на кольцо, а не в центр', () => {
  const [only] = layoutAround(1, PANE)
  assert.notEqual(Math.round(only.y), PANE.height / 2)
})
