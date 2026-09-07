import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildOkrTree, parseNexus } from '../src/nexus-okr.js'

const KR = [
  '---',
  'nexus: okr',
  'node_id: kr-2-1',
  'node_type: key-result',
  'paf_step: null',
  "owner: Ишманов Алексей Юрьевич",
  'title: РЕСТОРАНЫ в полнотекстовый поиск',
  'serves: obj-2026q3-2',
  '---',
  '',
  'Тело нексуса.',
].join('\n')

const OBJ = ['---', 'node_id: obj-2026q3-2', 'node_type: objective', 'title: Рост выручки', '---'].join('\n')

test('ключевой результат разбирается', () => {
  assert.deepEqual(parseNexus(KR), {
    nodeId: 'kr-2-1',
    nodeType: 'key-result',
    title: 'РЕСТОРАНЫ в полнотекстовый поиск',
    serves: 'obj-2026q3-2',
  })
})

test('поле null не превращается в строку «null»', () => {
  assert.equal(parseNexus(KR)!.nodeId, 'kr-2-1')
  const withoutServes = parseNexus(['---', 'node_id: kr-9', 'node_type: key-result', 'title: Раз', 'serves: null', '---'].join('\n'))
  assert.equal(withoutServes!.serves, null)
})

test('кавычки вокруг значения снимаются', () => {
  const node = parseNexus(['---', "node_id: 'kr-1'", 'node_type: key-result', 'title: "Раз"', '---'].join('\n'))
  assert.equal(node!.nodeId, 'kr-1')
  assert.equal(node!.title, 'Раз')
})

test('файл без frontmatter не разбирается', () => {
  assert.equal(parseNexus('просто текст'), null)
  assert.equal(parseNexus('---\nбез закрытия'), null)
})

test('узел без идентификатора или типа отбрасывается', () => {
  assert.equal(parseNexus(['---', 'title: Раз', '---'].join('\n')), null)
})

test('дерево делит узлы на объективы и ключевые результаты', () => {
  const tree = buildOkrTree([parseNexus(OBJ)!, parseNexus(KR)!])
  assert.deepEqual(tree.objectives, [{ nodeId: 'obj-2026q3-2', title: 'Рост выручки' }])
  assert.equal(tree.keyResults[0].serves, 'obj-2026q3-2')
})

test('ключевой результат с неизвестным объективом не теряется', () => {
  // Он попадёт в импорт без привязки — это лучше, чем молча его выбросить.
  const tree = buildOkrTree([parseNexus(KR)!])
  assert.equal(tree.keyResults.length, 1)
  assert.equal(tree.keyResults[0].serves, null)
})

test('узлы без названия отбрасываются', () => {
  const nameless = parseNexus(['---', 'node_id: kr-0', 'node_type: key-result', '---'].join('\n'))!
  assert.deepEqual(buildOkrTree([nameless]).keyResults, [])
})
