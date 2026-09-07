import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCreatedId } from '../src/parse-created.js'

test('идентификатор читается из обычного вывода', () => {
  assert.equal(parseCreatedId('Created task PO-27\nFile: /path/po-27 - Проба.md\n'), 'PO-27')
})

test('идентификатор читается из вывода с --plain', () => {
  // Форма зависит от флагов, и зависеть от них в вызывающем коде хрупко.
  const stdout = 'File: /path/po-26 - Проба.md\n\nTask PO-26 - Проба\n====\n'
  assert.equal(parseCreatedId(stdout), 'PO-26')
})

test('путь к файлу не принимается за идентификатор', () => {
  assert.equal(parseCreatedId('File: /path/po-27 - Проба.md'), null)
})

test('подзадача с составным номером разбирается', () => {
  assert.equal(parseCreatedId('Created task PO-27.1'), 'PO-27.1')
})

test('вывод без идентификатора не выдумывает его', () => {
  assert.equal(parseCreatedId('что-то пошло не так'), null)
})
