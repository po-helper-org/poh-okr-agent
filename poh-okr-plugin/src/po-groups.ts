import type { PoTask, PoTaskKind } from './model.js'

/**
 * Группировка панели работы по срокам.
 *
 * Секции считаются из дедлайна и статуса, а не из отдельных меток «сегодня»/«на неделе»:
 * метка про срок разъезжается с самим сроком в тот же день, когда срок наступает, и хранить
 * обе — значит выбирать, какой из них врёт.
 *
 * Сегодня — дата, а не момент времени: дедлайн в Backlog.md это календарный день без времени
 * и часового пояса, и сравнивать его с точным временем нечем.
 */

export type GroupKey = 'overdue' | 'today' | 'week' | 'later' | 'noDate' | 'done'

export interface Group {
  key: GroupKey
  tasks: PoTask[]
}

/** Порядок секций в панели: ближайшее сверху, выполненное в конце. */
const ORDER: readonly GroupKey[] = ['overdue', 'today', 'week', 'later', 'noDate', 'done']

const DONE_STATUS = 'done'

/**
 * Сколько выполненное держится в списке.
 *
 * Секция выполненного росла без конца и вытесняла работу: к концу квартала под ней лежали
 * сотни строк, которые никто не читал. Сутки — окно «я только что это закрыл»: успеть
 * заметить ошибочную отметку и снять её. Более старое из панели уходит, но не удаляется —
 * оно остаётся в Backlog.md и видно через `backlog task list -s Done`.
 */
const DONE_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * Показывать ли выполненную задачу.
 *
 * Отметки «когда выполнено» у Backlog.md нет, поэтому свежесть считается по времени
 * последней правки: для закрытой и больше не тронутой задачи это и есть момент закрытия.
 * Задача без отметки времени (старый CLI) остаётся видимой: прятать по неизвестному
 * признаку хуже, чем показать лишнее.
 */
function isFreshDone(task: PoTask, now: Date): boolean {
  if (task.updatedAt === undefined) return true
  const updated = Date.parse(task.updatedAt)
  if (Number.isNaN(updated)) return true
  return now.getTime() - updated <= DONE_WINDOW_MS
}

/** `YYYY-MM-DD` календарного дня. */
export function isoDay(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Календарный день через `days` суток от `from`. */
function shiftDays(from: Date, days: number): string {
  const shifted = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days)
  return isoDay(shifted)
}

/**
 * Секция задачи.
 *
 * Просроченное вынесено в отдельную секцию, а не смешано с сегодняшним: срок, который уже
 * прошёл, — это другой сигнал, и в общем списке он теряется среди того, что ещё можно сделать
 * вовремя. Секция стоит первой и в интерфейсе окрашена тревожным цветом.
 */
export function groupOf(task: PoTask, today: Date): GroupKey {
  if (task.status.toLowerCase() === DONE_STATUS) return 'done'
  if (!task.dueDate) return 'noDate'
  const now = isoDay(today)
  if (task.dueDate < now) return 'overdue'
  if (task.dueDate === now) return 'today'
  return task.dueDate <= shiftDays(today, 7) ? 'week' : 'later'
}

/**
 * Раскладывает задачи вкладки по секциям.
 *
 * Пустые секции не возвращаются: заголовок с нулём — шум, а не информация. Выполненное
 * старше суток не возвращается вовсе — см. `DONE_WINDOW_MS`.
 */
export function groupTasks(tasks: readonly PoTask[], kind: PoTaskKind, today: Date): Group[] {
  const buckets = new Map<GroupKey, PoTask[]>()
  for (const task of tasks) {
    if (task.kind !== kind) continue
    const key = groupOf(task, today)
    if (key === 'done' && !isFreshDone(task, today)) continue
    const bucket = buckets.get(key)
    if (bucket) bucket.push(task)
    else buckets.set(key, [task])
  }

  const result: Group[] = []
  for (const key of ORDER) {
    const bucket = buckets.get(key)
    if (bucket && bucket.length > 0) {
      // Внутри секции — по сроку, задачи без срока в конце. Ровно тот же принцип, что и
      // между секциями: ближайшее выше.
      bucket.sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99'))
      result.push({ key, tasks: bucket })
    }
  }
  return result
}
