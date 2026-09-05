import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeBoardSettings, docBody, encodeBoardSettings, parseDocList } from '../src/board-doc.js'
import { defaultSprintLabels } from '../src/model.js'

test('список документов разбирается', () => {
  assert.deepEqual(parseDocList(' - \ndoc-1 - okr-board\n'), [{ id: 'doc-1', title: 'okr-board' }])
})

test('frontmatter отрезается от тела документа', () => {
  const view = ['---', 'id: doc-1', 'title: okr-board', '---', '{"sprintLabels":[]}', ''].join('\n')
  assert.equal(docBody(view), '{"sprintLabels":[]}')
})

test('документ без frontmatter читается целиком', () => {
  assert.equal(docBody('просто текст'), 'просто текст')
})

test('подписи столбцов читаются из тела', () => {
  const settings = decodeBoardSettings('{"sprintLabels":["Q3-S1","Q3-S2","a","b","c","d"]}')
  assert.equal(settings.sprintLabels[0], 'Q3-S1')
  assert.equal(settings.sprintLabels.length, 6)
})

test('битый JSON даёт умолчания, а не пустой экран вместо доски', () => {
  // Служебный документ мог отредактировать человек. Одна кривая строка не стоит квартала работы.
  assert.deepEqual(decodeBoardSettings('{ это не json').sprintLabels, defaultSprintLabels())
})

test('пустое тело даёт умолчания', () => {
  assert.deepEqual(decodeBoardSettings('').sprintLabels, defaultSprintLabels())
})

test('короткий список подписей дополняется, длинный обрезается', () => {
  // Доска рисует фиксированное число столбцов: рассинхрон длины сдвинул бы все ячейки.
  assert.deepEqual(decodeBoardSettings('{"sprintLabels":["A"]}').sprintLabels[1], 'S2')
  assert.equal(decodeBoardSettings('{"sprintLabels":["A","B","C","D","E","F","G"]}').sprintLabels.length, 6)
})

test('пустая подпись заменяется умолчанием, а не оставляет столбец безымянным', () => {
  assert.equal(decodeBoardSettings('{"sprintLabels":["","B","C","D","E","F"]}').sprintLabels[0], 'S1')
})

test('настройки переживают круг записи и чтения', () => {
  const settings = { sprintLabels: ['1', '2', '3', '4', '5', '6'] }
  assert.deepEqual(decodeBoardSettings(encodeBoardSettings(settings)), settings)
})
