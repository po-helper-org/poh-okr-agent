import type { Priority, TaskSummary } from './model.js'

/**
 * Разбор машинного вывода Backlog.md (`--json`).
 *
 * Плагин намеренно не читает `--plain`: тот формат предназначен человеку и меняется вместе с
 * интерфейсом. В 1.51.0, например, к строке списка добавился хвост ` (ac: 0/3)`, который
 * позиционный разбор молча забирает в заголовок задачи. У `--json` есть `schemaVersion`,
 * то есть о ломающем изменении можно узнать явно, а не по кривым данным на экране.
 */

/** Версия схемы, под которую написан разбор. */
export const SUPPORTED_SCHEMA = 1

/** Задача, как её отдаёт `task list --json`. Перечислены только используемые поля. */
export interface RawTask {
  id: string
  title: string
  status: string
  type: string | null
  priority: string | null
  labels: string[]
  milestone: string | null
  dueDate: string | null
  assignees: string[]
  references: string[]
  parentTaskId: string | null
  acceptanceCriteriaCompleted: number
  acceptanceCriteriaCount: number
}

/**
 * Комментарий задачи. Служит событием ленты на детальной странице KR.
 *
 * Имена полей взяты из живого ответа CLI: текст лежит в `body`, отметка времени — в
 * `createdAt`. Догадка «text/date» выглядела правдоподобно, разбор молча давал пустые
 * события, и лента писала «событий нет» при записанных комментариях.
 */
export interface RawComment {
  index?: number | null
  author?: string | null
  createdAt?: string | null
  body?: string | null
}

/** Дополнение `RawTask` полями, которые есть только в `task view --json`. */
export interface RawTaskDetail extends RawTask {
  description: string | null
  implementationPlan: string | null
  implementationNotes: string | null
  documentation: string[]
  dependencies: string[]
  comments: RawComment[]
}

export class BacklogSchemaError extends Error {
  constructor(reason: string) {
    super(
      `не удалось разобрать ответ Backlog.md: ${reason}. ` +
        'Скорее всего, версия CLI новее той, под которую написан плагин',
    )
  }
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BacklogSchemaError(`${what} — не объект`)
  }
  return value as Record<string, unknown>
}

function str(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' && value !== '' ? value : null
}

function strList(source: Record<string, unknown>, key: string): string[] {
  const value = source[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function num(source: Record<string, unknown>, key: string): number {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Проверяет конверт ответа и достаёт полезную нагрузку.
 *
 * Незнакомая `schemaVersion` — ошибка, а не повод разбирать наугад: разбор чужой схемы даст
 * правдоподобный мусор, который на экране не отличить от настоящих данных.
 *
 * Вид ответа и имя поля с данными задаются отдельно и не выводятся друг из друга: у карточки
 * задачи `kind` равен `task-view`, а данные лежат в поле `task`. Попытка вывести одно из
 * другого ровно здесь и обошлась ошибкой на живом CLI.
 */
function unwrap(json: unknown, kind: string, field: string): unknown {
  const envelope = asRecord(json, 'ответ')
  const version = envelope['schemaVersion']
  if (version !== SUPPORTED_SCHEMA) {
    throw new BacklogSchemaError(
      `ожидалась schemaVersion ${SUPPORTED_SCHEMA}, пришла ${JSON.stringify(version)}`,
    )
  }
  if (envelope['kind'] !== kind) {
    throw new BacklogSchemaError(`ожидался kind «${kind}», пришёл ${JSON.stringify(envelope['kind'])}`)
  }
  return envelope[field]
}

function decodeTask(value: unknown): RawTask {
  const raw = asRecord(value, 'задача')
  const id = str(raw, 'id')
  const title = str(raw, 'title')
  if (!id) throw new BacklogSchemaError('у задачи нет идентификатора')
  return {
    id,
    // Пустой заголовок — законное состояние: задачу заводят кнопкой «+» и называют потом.
    title: title ?? '',
    status: str(raw, 'status') ?? '',
    type: str(raw, 'type'),
    priority: str(raw, 'priority'),
    labels: strList(raw, 'labels'),
    milestone: str(raw, 'milestone'),
    dueDate: str(raw, 'dueDate'),
    assignees: strList(raw, 'assignees'),
    references: strList(raw, 'references'),
    parentTaskId: str(raw, 'parentTaskId'),
    acceptanceCriteriaCompleted: num(raw, 'acceptanceCriteriaCompleted'),
    acceptanceCriteriaCount: num(raw, 'acceptanceCriteriaCount'),
  }
}

export function parseTaskList(stdout: string): RawTask[] {
  const payload = unwrap(JSON.parse(stdout), 'task-list', 'tasks')
  if (!Array.isArray(payload)) throw new BacklogSchemaError('поле tasks — не массив')
  return payload.map(decodeTask)
}

export function parseTaskView(stdout: string): RawTaskDetail {
  const payload = unwrap(JSON.parse(stdout), 'task-view', 'task')
  const raw = asRecord(payload, 'задача')
  const comments = Array.isArray(raw['comments'])
    ? (raw['comments'] as unknown[]).map(item => {
        const c = asRecord(item, 'комментарий')
        const index = c['index']
        return {
          index: typeof index === 'number' ? index : null,
          author: str(c, 'author'),
          createdAt: str(c, 'createdAt'),
          body: str(c, 'body'),
        }
      })
    : []

  return {
    ...decodeTask(payload),
    description: str(raw, 'description'),
    implementationPlan: str(raw, 'implementationPlan'),
    implementationNotes: str(raw, 'implementationNotes'),
    documentation: strList(raw, 'documentation'),
    dependencies: strList(raw, 'dependencies'),
    comments,
  }
}

const PRIORITIES: ReadonlySet<string> = new Set(['high', 'medium', 'low'])

/** Приводит сырую задачу к строке списка. Незнакомый приоритет считается средним. */
export function toSummary(raw: RawTask): TaskSummary {
  const priority = (raw.priority ?? '').toLowerCase()
  return {
    id: raw.id,
    title: raw.title,
    status: raw.status,
    priority: (PRIORITIES.has(priority) ? priority : 'medium') as Priority,
    labels: raw.labels,
    ...(raw.dueDate ? { dueDate: raw.dueDate } : {}),
    ...(raw.milestone ? { milestone: raw.milestone } : {}),
  }
}
