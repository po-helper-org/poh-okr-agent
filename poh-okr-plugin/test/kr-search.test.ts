import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_RESULTS, normalize, searchKeyResults, swapLayout } from '../src/kr-search.js'

const KRS = [
  { id: 'PO-42', title: 'Дизайн дедубликации каталога web_db' },
  { id: 'PO-43', title: 'Продажа мероприятий ТС на витрине TL через UMC минуя БАЗИС (виджет ТС)' },
  { id: 'PO-44', title: 'Заказы и возвраты в ЛК TL от TicketsCloud' },
  { id: 'PO-51', title: 'Каталог кино на витрину через UMC минуя MRS.backend&uat_db' },
  { id: 'PO-53', title: '[FEAT] КИНО ранжирование в афише и поиске' },
  { id: 'PO-57', title: 'RELEASE КИНО: выкатить в Production фичу с поиском' },
  { id: 'PO-88', title: 'Новый ключевой результат' },
]

test('запрос короче трёх символов не ищет ничего', () => {
  assert.deepEqual(searchKeyResults(KRS, 'ки'), [])
  assert.deepEqual(searchKeyResults(KRS, ''), [])
})

test('поиск по части названия, регистр не важен', () => {
  const found = searchKeyResults(KRS, 'КАТАЛОГ').map(kr => kr.id)
  assert.deepEqual(found, ['PO-51', 'PO-42'])
})

test('совпадение в начале названия выше совпадения в середине', () => {
  const found = searchKeyResults(KRS, 'заказы').map(kr => kr.id)
  assert.equal(found[0], 'PO-44')
})

test('находит по идентификатору', () => {
  assert.deepEqual(searchKeyResults(KRS, 'PO-53').map(kr => kr.id), ['PO-53'])
})

test('не переключённая раскладка всё равно находит', () => {
  // «rbyj» — это «кино», набранное латиницей.
  const found = searchKeyResults(KRS, 'rbyj').map(kr => kr.id)
  assert.ok(found.includes('PO-53'), `ожидали PO-53, получили ${found.join(', ')}`)
})

test('«ё» и «е» считаются одной буквой', () => {
  assert.equal(normalize('Переезд'), 'переезд')
  assert.equal(normalize('ПерЕЁзд'), 'переезд')
})

test('раскладка переводится в обе стороны', () => {
  assert.equal(swapLayout('rbyj'), 'кино')
  assert.equal(swapLayout('кино'), 'rbyj')
})

test('слова запроса ищутся как начала слов названия', () => {
  const found = searchKeyResults(KRS, 'кино афише').map(kr => kr.id)
  assert.deepEqual(found, ['PO-53'])
})

test('больше пяти строк не отдаём', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `PO-${i}`, title: `Каталог номер ${i}` }))
  assert.equal(searchKeyResults(many, 'каталог').length, MAX_RESULTS)
})

test('несовпадающий запрос отдаёт пусто', () => {
  assert.deepEqual(searchKeyResults(KRS, 'жжжжж'), [])
})
