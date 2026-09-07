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
import type { Phase, PoTaskKind, Priority } from './model.js'
import { PHASES, PO_TASK_KINDS, SPRINT_COUNT } from './model.js'
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
const KIND_SET: ReadonlySet<string> = new Set(PO_TASK_KINDS)
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const PRIORITY_SET: ReadonlySet<string> = new Set(['high', 'medium', 'low'])

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

      case 'createKr': {
        const title = stringField(payload, 'title')
        const objectiveId = stringField(payload, 'objectiveId')
        if (!title) return fail('bad-request', 'пустое название ключевого результата')
        if (!objectiveId) return fail('bad-request', 'не передан объектив')
        const id = await reader.writeCreating(
          writer.createKeyResult({ title, objectiveId, taskType: reader.krTaskType }),
          signal,
        )
        return ok({ id })
      }

      case 'createPoTask': {
        const title = stringField(payload, 'title')
        const kind = stringField(payload, 'kind')
        if (!title) return fail('bad-request', 'пустое название задачи')
        if (kind !== null && !KIND_SET.has(kind)) {
          return fail('bad-request', `неизвестная вкладка ${JSON.stringify(kind)}`)
        }
        const relatedKrId = stringField(payload, 'relatedKrId')
        const dueDate = stringField(payload, 'dueDate')
        const description = stringField(payload, 'description')
        const priority = stringField(payload, 'priority')
        if (priority !== null && !PRIORITY_SET.has(priority)) {
          return fail('bad-request', `неизвестный приоритет ${JSON.stringify(priority)}`)
        }
        const id = await reader.writeCreating(
          writer.createPoTask({
            title,
            kind: (kind ?? 'task') as PoTaskKind,
            taskType: reader.poTaskType,
            ...(relatedKrId ? { relatedKrId } : {}),
            ...(dueDate ? { dueDate } : {}),
            ...(description ? { description } : {}),
            ...(priority ? { priority: priority as Priority } : {}),
          }),
          signal,
        )
        return ok({ id })
      }

      // Смена типа и привязки к KR: текущие метки приходят от клиента — он их уже знает
      // из списка, и лишняя карточка на каждый клик замедлила бы панель.
      case 'setKind':
      case 'setKr': {
        const id = stringField(payload, 'id')
        const labels = field(payload, 'labels')
        const value = field(payload, 'value')
        if (!id) return fail('bad-request', 'не передан идентификатор задачи')
        if (!Array.isArray(labels)) return fail('bad-request', 'не переданы текущие метки задачи')
        if (value !== null && typeof value !== 'string') {
          return fail('bad-request', 'значение должно быть строкой или null')
        }
        if (endpoint === 'setKind' && value !== null && !KIND_SET.has(value)) {
          return fail('bad-request', `неизвестный тип ${JSON.stringify(value)}`)
        }

        const current = labels.filter((item): item is string => typeof item === 'string')
        const args = endpoint === 'setKind'
          ? writer.setKind(id, current, value as PoTaskKind | null)
          : writer.setKr(id, current, value)
        // `null` — менять нечего: запись уже в нужном состоянии. Это успех, а не ошибка.
        if (args) await reader.write(args, signal)
        return ok({ changed: args !== null })
      }

      case 'setStatus': {
        const id = stringField(payload, 'id')
        const status = stringField(payload, 'status')
        if (!id) return fail('bad-request', 'не передан идентификатор задачи')
        if (!status) return fail('bad-request', 'не передан статус')
        await reader.write(writer.setStatus(id, status), signal)
        return ok({ id, status })
      }

      case 'setPriority': {
        const id = stringField(payload, 'id')
        const priority = stringField(payload, 'priority')
        if (!id) return fail('bad-request', 'не передан идентификатор задачи')
        if (priority === null || !PRIORITY_SET.has(priority)) {
          return fail('bad-request', `неизвестный приоритет ${JSON.stringify(priority)}`)
        }
        await reader.write(writer.setPriority(id, priority as Priority), signal)
        return ok({ id, priority })
      }

      case 'setDueDate': {
        const id = stringField(payload, 'id')
        const dueDate = stringField(payload, 'dueDate')
        if (!id) return fail('bad-request', 'не передан идентификатор задачи')
        if (!dueDate || !ISO_DATE_RE.test(dueDate)) {
          return fail('bad-request', 'дата должна быть в виде ГГГГ-ММ-ДД')
        }
        await reader.write(writer.setDueDate(id, dueDate), signal)
        return ok({ id, dueDate })
      }

      // Текстовые поля карточки KR. Разные поля Backlog.md — разные подкоманды, чтобы
      // клиенту не приходилось знать, какое из них куда ложится.
      case 'setDescription':
      case 'setPlan': {
        const id = stringField(payload, 'id')
        const text = field(payload, 'text')
        if (!id) return fail('bad-request', 'не передан идентификатор задачи')
        if (typeof text !== 'string') return fail('bad-request', 'не передан текст')
        const args = endpoint === 'setPlan' ? writer.setPlan(id, text) : writer.setDescription(id, text)
        await reader.write(args, signal)
        return ok({ id })
      }

      case 'setConfluence':
      case 'setEpicLink': {
        const id = stringField(payload, 'id')
        const url = stringField(payload, 'url')
        if (!id) return fail('bad-request', 'не передан идентификатор задачи')
        if (!url) return fail('bad-request', 'не передана ссылка')
        const args = endpoint === 'setConfluence' ? writer.setConfluence(id, url) : writer.setEpicLink(id, url)
        await reader.write(args, signal)
        return ok({ id, url })
      }

      // Событие ленты детальной страницы — комментарий задачи: дату и автора проставляет CLI,
      // своей нумерации и своего хранилища у ленты нет.
      case 'addEvent': {
        const id = stringField(payload, 'id')
        const text = stringField(payload, 'text')
        if (!id) return fail('bad-request', 'не передан идентификатор задачи')
        if (!text) return fail('bad-request', 'пустой текст события')
        const author = stringField(payload, 'author')
        await reader.write(writer.addEvent(id, text, author ?? undefined), signal)
        return ok({ id })
      }

      /**
       * Удаление задачи — архивация, а не стирание файла.
       * Backlog.md переносит задачу в архив, откуда её можно вернуть; необратимого удаления
       * из интерфейса доски не предлагаем вовсе.
       */
      case 'deleteTask': {
        const id = stringField(payload, 'id')
        if (!id) return fail('bad-request', 'не передан идентификатор задачи')
        await reader.write(writer.deleteTask(id), signal)
        return ok({ id })
      }

      case 'createObjective': {
        const title = stringField(payload, 'title')
        if (!title) return fail('bad-request', 'пустое название объектива')
        const dueDate = stringField(payload, 'dueDate')
        await reader.write(writer.createObjective(title, dueDate ?? undefined), signal)
        return ok({ created: true })
      }

      case 'renameObjective': {
        const from = stringField(payload, 'from')
        const to = stringField(payload, 'to')
        if (!from) return fail('bad-request', 'не передан объектив')
        if (!to) return fail('bad-request', 'пустое название объектива')
        await reader.write(writer.renameObjective(from, to), signal)
        return ok({ from, to })
      }

      case 'removeObjective': {
        const id = stringField(payload, 'id')
        if (!id) return fail('bad-request', 'не передан объектив')
        await reader.write(writer.removeObjective(id), signal)
        return ok({ id })
      }

      case 'setSprintLabels': {
        const labels = field(payload, 'sprintLabels')
        if (!Array.isArray(labels)) return fail('bad-request', 'не переданы подписи столбцов')
        const clean = labels.filter((item): item is string => typeof item === 'string')
        if (clean.length !== SPRINT_COUNT) {
          return fail('bad-request', `подписей должно быть ровно ${SPRINT_COUNT}`)
        }
        await reader.saveBoardSettings({ sprintLabels: clean }, signal)
        return ok({ sprintLabels: clean })
      }

      default:
        return fail('bad-request', `неизвестная подкоманда «${endpoint}»`)
    }
  } catch (error) {
    return failure(error)
  }
}
