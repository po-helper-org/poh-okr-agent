/**
 * Идентификатор только что созданной задачи из вывода `backlog task create`.
 *
 * Нужен, чтобы кнопка быстрого добавления открывала новую запись сразу в режиме
 * редактирования: без идентификатора её пришлось бы искать в перечитанном списке по
 * названию, а названия по умолчанию совпадают у всех новых записей.
 *
 * Вывод отличается в зависимости от флагов: `Created task PO-27` без `--plain` и
 * `Task PO-26 - Название` с ним. Разбор принимает обе формы, потому что зависеть от
 * набора флагов в вызывающем коде хрупко.
 */
const CREATED_RE = /\btask\s+([A-Za-z]+-\d+(?:\.\d+)*)/i

export function parseCreatedId(stdout: string): string | null {
  const normalized = stdout.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  for (const line of normalized.split('\n')) {
    const match = CREATED_RE.exec(line)
    if (match) return match[1]
  }
  return null
}
