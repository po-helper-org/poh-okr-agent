import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatBlocks, parseBlocks, parseLine, shortcutFor } from '../src/markdown-blocks.js'

test('заголовки трёх уровней разбираются', () => {
  assert.deepEqual(parseLine('# Раз'), { type: 'h1', text: 'Раз', done: false })
  assert.deepEqual(parseLine('## Два'), { type: 'h2', text: 'Два', done: false })
  assert.deepEqual(parseLine('### Три'), { type: 'h3', text: 'Три', done: false })
})

test('пункт списка дел разбирается раньше маркированного', () => {
  // Оба начинаются с дефиса; общее правило списка съело бы квадратные скобки.
  assert.deepEqual(parseLine('- [x] сделано'), { type: 'todo', text: 'сделано', done: true })
  assert.deepEqual(parseLine('- [ ] ещё нет'), { type: 'todo', text: 'ещё нет', done: false })
  assert.deepEqual(parseLine('- обычный пункт'), { type: 'bullet', text: 'обычный пункт', done: false })
})

test('нумерованный список принимает и точку, и скобку', () => {
  assert.equal(parseLine('1. раз').type, 'number')
  assert.equal(parseLine('2) два').type, 'number')
})

test('линия распознаётся в трёх написаниях', () => {
  for (const line of ['---', '***', '___', '-----']) {
    assert.equal(parseLine(line).type, 'divider', line)
  }
})

test('цитата разбирается с пробелом и без', () => {
  assert.equal(parseLine('> текст').text, 'текст')
  assert.equal(parseLine('>текст').text, 'текст')
})

test('нераспознанная строка остаётся текстом, а не теряется', () => {
  assert.deepEqual(parseLine('просто строка'), { type: 'text', text: 'просто строка', done: false })
  assert.deepEqual(parseLine('#безпробела'), { type: 'text', text: '#безпробела', done: false })
})

test('пустое описание даёт один пустой блок — курсору нужно куда встать', () => {
  assert.deepEqual(parseBlocks(''), [{ type: 'text', text: '', done: false }])
  assert.deepEqual(parseBlocks(null), [{ type: 'text', text: '', done: false }])
})

test('описание переживает круг разбора и сборки', () => {
  const markdown = [
    '## Что решаем',
    'Исключить тех, кто уже купил.',
    '',
    '- [x] согласовать',
    '- [ ] собрать список',
    '',
    '---',
    '',
    '> Решение зафиксировано.',
  ].join('\n')
  assert.equal(formatBlocks(parseBlocks(markdown)), markdown)
})

test('пункты нумерованного списка пишутся единицей', () => {
  // Markdown нумерует сам; хранить фактические номера значило бы переписывать весь
  // список при вставке в середину.
  assert.equal(formatBlocks(parseBlocks('1. раз\n2. два')), '1. раз\n1. два')
})

test('хвостовые пустые строки не копятся при сохранении', () => {
  assert.equal(formatBlocks(parseBlocks('текст\n\n\n')), 'текст')
})

test('перевод строки Windows не ломает разбор', () => {
  assert.deepEqual(parseBlocks('раз\r\nдва').map(b => b.text), ['раз', 'два'])
})

test('набранная разметка превращается в блок', () => {
  // Иначе чеклист можно получить только через меню, а человек набирает его привычно.
  assert.deepEqual(shortcutFor('- '), { type: 'bullet', rest: '' })
  assert.deepEqual(shortcutFor('1. '), { type: 'number', rest: '' })
  assert.deepEqual(shortcutFor('## Раздел'), { type: 'h2', rest: 'Раздел' })
  assert.deepEqual(shortcutFor('> цитата'), { type: 'quote', rest: 'цитата' })
})

test('пункт списка дел набирается тремя способами', () => {
  for (const typed of ['- [] ', '- [ ] ', '[] ']) {
    assert.equal(shortcutFor(typed)?.type, 'todo', typed)
  }
})

test('обычный текст не превращается в блок', () => {
  assert.equal(shortcutFor('просто текст'), null)
  assert.equal(shortcutFor('-'), null)
  assert.equal(shortcutFor('1.'), null)
})

test('«[]» без пробела уже даёт пункт списка дел', () => {
  // Человек набирает скобки и ждёт чекбокс сразу, а не после пробела.
  assert.equal(shortcutFor('[]')?.type, 'todo')
  assert.equal(shortcutFor('[x]')?.type, 'todo')
  assert.equal(shortcutFor('[] текст')?.rest, 'текст')
})
