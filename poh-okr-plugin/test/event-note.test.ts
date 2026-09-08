import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeEvent, encodeEvent, eventTypes, sortEvents } from '../src/event-note.js'

test('тип и заголовок читаются из первой строки', () => {
  const event = decodeEvent({ createdAt: '2026-09-01T10:00:00Z', author: '@po', body: '[Риск] Сроки поехали\nЖдём ответа.' }, 0)
  assert.equal(event.type, 'Риск')
  assert.equal(event.title, 'Сроки поехали')
  assert.equal(event.note, 'Ждём ответа.')
})

test('чужой комментарий без формата не исчезает из ленты', () => {
  // Комментарии оставляют люди и навыки, требовать от них формата нельзя.
  const event = decodeEvent({ createdAt: '2026-09-01T10:00:00Z', author: '@dev', body: 'просто заметка' }, 0)
  assert.equal(event.type, '')
  assert.equal(event.title, 'просто заметка')
})

test('пустой комментарий не роняет разбор', () => {
  assert.equal(decodeEvent({}, 3).index, 3)
})

test('событие переживает круг записи и чтения', () => {
  const body = encodeEvent('Статус', 'Готово к демо', 'Показываем в пятницу.')
  const event = decodeEvent({ body }, 0)
  assert.equal(event.type, 'Статус')
  assert.equal(event.title, 'Готово к демо')
  assert.equal(event.note, 'Показываем в пятницу.')
})

test('событие без типа пишется без скобок', () => {
  assert.equal(encodeEvent('', 'Просто запись', ''), 'Просто запись')
})

test('лента идёт от новых к старым', () => {
  const events = sortEvents([
    decodeEvent({ createdAt: '2026-08-01T10:00:00Z', body: 'старое' }, 0),
    decodeEvent({ createdAt: '2026-09-01T10:00:00Z', body: 'новое' }, 1),
  ])
  assert.equal(events[0].title, 'новое')
})

test('событие без даты уходит вниз, а не выбрасывается', () => {
  const events = sortEvents([
    decodeEvent({ body: 'без даты' }, 0),
    decodeEvent({ createdAt: '2026-08-01T10:00:00Z', body: 'с датой' }, 1),
  ])
  assert.equal(events.length, 2)
  assert.equal(events[1].title, 'без даты')
})

test('чипы-фильтры собираются из фактических типов', () => {
  const events = [
    decodeEvent({ body: '[JIRA] раз' }, 0),
    decodeEvent({ body: '[Риск] два' }, 1),
    decodeEvent({ body: '[JIRA] три' }, 2),
    decodeEvent({ body: 'без типа' }, 3),
  ]
  // Порядок задаёт локаль, поэтому проверяется состав и устойчивость, а не конкретная
  // раскладка кириллицы против латиницы: она зависит от реализации Intl.
  const types = eventTypes(events)
  assert.deepEqual([...types].sort(), ['JIRA', 'Риск'])
  assert.deepEqual(eventTypes(events), types)
})

test('поля комментария читаются под именами живого CLI', () => {
  // Backlog.md отдаёт `body` и `createdAt`, а не `text`/`date`. Догадка выглядела
  // правдоподобно и давала пустые события: лента писала «событий нет» при записанных
  // комментариях.
  const event = decodeEvent({ index: 1, body: '[Статус] Готово', createdAt: '2026-09-05T18:59:00Z' }, 0)
  assert.equal(event.title, 'Готово')
  assert.equal(event.date, '2026-09-05')
  assert.equal(event.index, 1)
})

test('отметка времени урезается до дня', () => {
  assert.equal(decodeEvent({ body: 'x', createdAt: '2026-09-05T18:59:00Z' }, 0).date, '2026-09-05')
})

test('свой номер комментария предпочтительнее позиции в массиве', () => {
  assert.equal(decodeEvent({ index: 7, body: 'x' }, 0).index, 7)
})
