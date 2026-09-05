import { BacklogSchemaError } from './backlog-json.js'
import {
  BacklogFailedError,
  BacklogTimeoutError,
  BacklogTooOldError,
  BacklogUnavailableError,
  InvalidMilestoneIdError,
  InvalidTaskIdError,
  SprintOutOfRangeError,
  TaskNotFoundError,
} from './errors.js'
import type { BacklogReader } from './reader.js'
import type { Phase } from './model.js'
import { PHASES } from './model.js'
import * as writer from './writer.js'

/** Имя канала. Одна регистрация, подкоманды разбираются внутри. */
export const OKR_CHANNEL = '/okr'

export type RpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details: object } }

/** Ошибки предметной области несут готовый текст для пользователя — он и едет наружу. */
const CODES: ReadonlyArray<[new (...args: never[]) => Error, string]> = [
  [BacklogUnavailableError, 'backlog-unavailable'],
  [BacklogTimeoutError, 'backlog-timeout'],
  [BacklogTooOldError, 'backlog-too-old'],
  [BacklogFailedError, 'backlog-failed'],
  [BacklogSchemaError, 'backlog-schema'],
  [TaskNotFoundError, 'task-not-found'],
  [InvalidTaskIdError, 'invalid-task-id'],
  [InvalidMilestoneIdError, 'invalid-milestone-id'],
  [SprintOutOfRangeError, 'sprint-out-of-range'],
]

function ok<T>(value: T): RpcResult<T> {
  return { ok: true, value }
}

function fail(code: string, message: string): RpcResult<never> {
  return { ok: false, error: { code, message, details: {} } }
}

function failure(error: unknown): RpcResult<never> {
  // Само извлечение сообщения защищено отдельным try/catch: `error` — исключение из чужого
  // кода, и его форма не гарантирована. `String(error)` вызывает чужой `toString`, а `.message`
  // на самодельном подклассе `Error` может оказаться бросающим геттером. Без этой защиты
  // `failure` сама бросила бы прямо из `catch` в `dispatch`, и свойство «наружу всегда уходит
  // значение» нарушилось бы.
  try {
    const message = error instanceof Error ? error.message : String(error)
    for (const [type, code] of CODES) {
      if (error instanceof type) return fail(code, message)
    }
    return fail('internal', message)
  } catch {
    return fail('internal', 'не удалось разобрать исключение')
  }
}

function field(payload: unknown, name: string): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined
  return (payload as Record<string, unknown>)[name]
}

function stringField(payload: unknown, name: string): string | null {
  const value = field(payload, name)
  return typeof value === 'string' && value !== '' ? value : null
}

const PHASE_SET: ReadonlySet<string> = new Set(PHASES)

/**
 * Разбирает подкоманду канала.
 * Наружу всегда уходит значение: любое исключение оборачивается в ответ с кодом,
 * потому что через провод исключения не летят.
 */
export async function dispatch(
  reader: BacklogReader,
  endpoint: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<RpcResult<unknown>> {
  try {
    switch (endpoint) {
      case 'board':
        return ok(await reader.readBoard(signal))

      case 'poTasks':
        return ok(await reader.listPoTasks(signal))

      case 'task': {
        const id = stringField(payload, 'id')
        if (!id) return fail('bad-request', 'не передан идентификатор задачи')
        return ok(await reader.getTask(id, signal))
      }

      // Клик по ячейке доски. Текущие метки приходят от клиента, потому что он их уже знает
      // из доски: лишний `task view` на каждый клик сделал бы доску заметно медленнее.
      case 'setPhase': {
        const id = stringField(payload, 'id')
        const sprint = field(payload, 'sprint')
        const phase = field(payload, 'phase')
        const labels = field(payload, 'labels')

        if (!id) return fail('bad-request', 'не передан идентификатор задачи')
        if (typeof sprint !== 'number') return fail('bad-request', 'не передан номер спринта')
        if (!Array.isArray(labels)) return fail('bad-request', 'не переданы текущие метки задачи')
        if (phase !== null && !(typeof phase === 'string' && PHASE_SET.has(phase))) {
          return fail('bad-request', `неизвестная фаза ${JSON.stringify(phase)}`)
        }

        const current = labels.filter((item): item is string => typeof item === 'string')
        const args = writer.setPhase(id, current, sprint, phase as Phase | null)
        // `null` — менять нечего: ячейка уже в нужном состоянии. Это успех, а не ошибка.
        if (args) await reader.write(args, signal)
        return ok({ changed: args !== null })
      }

      case 'renameTask': {
        const id = stringField(payload, 'id')
        const title = stringField(payload, 'title')
        if (!id) return fail('bad-request', 'не передан идентификатор задачи')
        if (!title) return fail('bad-request', 'пустое название задачи')
        await reader.write(writer.renameTask(id, title), signal)
        return ok({ id, title })
      }

      default:
        return fail('bad-request', `неизвестная подкоманда «${endpoint}»`)
    }
  } catch (error) {
    return failure(error)
  }
}
