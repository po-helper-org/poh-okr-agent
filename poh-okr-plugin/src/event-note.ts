import type { RawComment } from './backlog-json.js'

/**
 * Событие ленты детальной страницы — комментарий задачи Backlog.md.
 *
 * У комментария есть автор и дата, но нет ни типа, ни отдельного заголовка. Заводить ради них
 * своё хранилище нельзя, поэтому тип и заголовок живут в первой строке текста:
 *
 *     [Риск] Подрядчик не подтвердил сроки
 *     Ждём ответа до пятницы, иначе двигаем релиз.
 *
 * Разбор снисходителен: комментарий без скобок — событие без типа, с текстом целиком в
 * заголовке. Комментарии пишет не только плагин (их оставляют люди и навыки), и требовать от
 * них формата нельзя — иначе чужая запись просто исчезла бы из ленты.
 */

export interface OkrEvent {
  /** Номер комментария из ответа CLI; при его отсутствии — позиция в списке. */
  index: number
  date: string
  author: string
  type: string
  title: string
  note: string
}

const HEAD_RE = /^\s*\[([^\]]{1,40})\]\s*(.*)$/

export function decodeEvent(comment: RawComment, index: number): OkrEvent {
  const text = (comment.body ?? '').replace(/\r\n?/g, '\n')
  const [head = '', ...rest] = text.split('\n')
  const match = HEAD_RE.exec(head)

  return {
    // Свой номер комментария предпочтительнее позиции в массиве: порядок в ответе CLI
    // не обещан, а номер стабилен.
    index: comment.index ?? index,
    // Отметка времени приходит целиком (`2026-09-05T18:59:00Z`); ленте нужен день.
    date: (comment.createdAt ?? '').slice(0, 10),
    author: comment.author ?? '',
    type: match ? match[1].trim() : '',
    title: (match ? match[2] : head).trim(),
    note: rest.join('\n').trim(),
  }
}

export function encodeEvent(type: string, title: string, note: string): string {
  const head = type.trim() === '' ? title.trim() : `[${type.trim()}] ${title.trim()}`
  return note.trim() === '' ? head : `${head}\n${note.trim()}`
}

/**
 * Лента в обратном хронологическом порядке: новые сверху.
 * Комментарии без даты не выбрасываются, а уходят вниз: событие без даты всё равно событие,
 * а вверху ленты ему делать нечего.
 */
export function sortEvents(events: readonly OkrEvent[]): OkrEvent[] {
  return [...events].sort((a, b) => {
    if (a.date === b.date) return b.index - a.index
    if (a.date === '') return 1
    if (b.date === '') return -1
    return a.date < b.date ? 1 : -1
  })
}

/** Типы, встречающиеся в данных, — из них строятся чипы-фильтры (требование D-07). */
export function eventTypes(events: readonly OkrEvent[]): string[] {
  const seen = new Set<string>()
  for (const event of events) {
    if (event.type !== '') seen.add(event.type)
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'ru'))
}
