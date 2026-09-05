import { parseMilestoneList, type MilestoneRow } from './parse-milestones.js'
import {
  parseTaskList,
  parseTaskView,
  toSummary,
  type RawTask,
  type RawTaskDetail,
} from './backlog-json.js'
import {
  BacklogFailedError,
  BacklogTimeoutError,
  BacklogTooOldError,
  BacklogUnavailableError,
  InvalidTaskIdError,
} from './errors.js'
import { REQUIRED_BACKLOG_VERSION, type OkrConfig } from './config.js'
import { defaultSprintLabels, type Board, type KeyResult, type Objective, type PoTask } from './model.js'
import { kindFromLabels, phasesFromLabels } from './phases.js'
import { runCommandWithNode, type RunCommand } from './ports.js'

export interface BacklogPorts {
  run: RunCommand
}

const TASK_ID_RE = /^[A-Za-z]+-\d+(?:\.\d+)*$/

/** `1.51.0` → `[1, 51, 0]`. Хвост вида `-beta.1` отбрасывается. */
function versionParts(raw: string): number[] {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(raw)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : []
}

function isAtLeast(found: string, required: string): boolean {
  const a = versionParts(found)
  const b = versionParts(required)
  if (a.length !== 3) return false
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return true
}

/**
 * Чтение и запись через CLI Backlog.md.
 *
 * Своего хранилища у плагина нет: и доска, и панель работы — это проекции задач Backlog.md.
 * Писать напрямую в `.md` нельзя даже там, где это выглядело бы проще: файл несёт метаданные,
 * которые CLI держит в согласованном состоянии.
 */
export class BacklogReader {
  private readonly run: RunCommand
  /** Проверка версии делается один раз за жизнь плагина, а не на каждый вызов. */
  private versionChecked: Promise<void> | null = null

  constructor(
    private readonly config: OkrConfig,
    ports: BacklogPorts = { run: runCommandWithNode },
  ) {
    this.run = ports.run
  }

  /**
   * Выполняет команду `backlog` и отдаёт stdout.
   * Разбор кодов возврата — здесь и только здесь: «нет CLI», «таймаут» и «команда вернула
   * ошибку» — три разные ситуации с разными сообщениями пользователю.
   */
  private async exec(args: string[], signal?: AbortSignal): Promise<string> {
    const result = await this.run(this.config.backlogBin, args, this.config.workspaceRoot, signal)
    const shown = `${this.config.backlogBin} ${args.join(' ')}`

    if (result.timedOut) throw new BacklogTimeoutError(shown)
    if (result.code === -1) throw new BacklogUnavailableError(this.config.backlogBin, result.stderr)
    if (result.code !== 0) throw new BacklogFailedError(shown, result.code, result.stderr)
    return result.stdout
  }

  /**
   * Убеждается, что CLI умеет дедлайны.
   *
   * Отдельная проверка, а не молчаливая деградация: на 1.50 и старше `--due-date` просто нет,
   * и панель работы потеряла бы группировку «Сегодня / На неделе», выглядя при этом исправной.
   */
  async ensureVersion(signal?: AbortSignal): Promise<void> {
    this.versionChecked ??= (async () => {
      const stdout = await this.exec(['--version'], signal)
      const found = stdout.trim().split('\n')[0] ?? ''
      if (!isAtLeast(found, REQUIRED_BACKLOG_VERSION)) {
        throw new BacklogTooOldError(found || 'неизвестной', REQUIRED_BACKLOG_VERSION)
      }
    })().catch(error => {
      // Неудачная проверка не должна запомниться как выполненная: следующий вызов должен
      // попробовать снова, иначе временный сбой CLI выключил бы раздел до перезапуска.
      this.versionChecked = null
      throw error
    })
    return this.versionChecked
  }

  private async listByType(type: string, signal?: AbortSignal): Promise<RawTask[]> {
    await this.ensureVersion(signal)
    // Фильтрация типа — на стороне CLI: на большом воркспейсе так не приходится тащить
    // через провод весь бэклог, чтобы выбросить из него почти всё.
    return parseTaskList(await this.exec(['task', 'list', '--type', type, '--json'], signal))
  }

  /** Ключевые результаты — строки доски. */
  async listKeyResults(signal?: AbortSignal): Promise<KeyResult[]> {
    const raw = await this.listByType(this.config.krTaskType, signal)
    return raw.map(task => ({ ...toSummary(task), phases: phasesFromLabels(task.labels) }))
  }

  /** Операционные задачи PO — содержимое панели работы. */
  async listPoTasks(signal?: AbortSignal): Promise<PoTask[]> {
    const raw = await this.listByType(this.config.poTaskType, signal)
    return raw.map(task => ({
      ...toSummary(task),
      kind: kindFromLabels(task.labels),
      relatedKrIds: [],
    }))
  }

  async listObjectives(signal?: AbortSignal): Promise<MilestoneRow[]> {
    await this.ensureVersion(signal)
    return parseMilestoneList(await this.exec(['milestone', 'list', '--plain'], signal))
  }

  /**
   * Доска целиком: объективы с вложенными KR.
   *
   * KR без объектива собираются в отдельную группу в конце, а не отбрасываются: задача,
   * заведённая мимо плагина, должна быть видна и её можно будет перетащить в объектив.
   */
  async readBoard(signal?: AbortSignal): Promise<Board> {
    const [objectives, krs] = await Promise.all([
      this.listObjectives(signal),
      this.listKeyResults(signal),
    ])

    const groups = new Map<string, Objective>()
    for (const row of objectives) {
      groups.set(row.id, { id: row.id, title: row.title, krs: [] })
    }

    const orphans: KeyResult[] = []
    for (const kr of krs) {
      const group = kr.milestone ? groups.get(kr.milestone) : undefined
      if (group) group.krs.push(kr)
      else orphans.push(kr)
    }

    const result = [...groups.values()]
    if (orphans.length > 0) {
      result.push({ id: '', title: 'Без объектива', krs: orphans })
    }

    return { sprintLabels: defaultSprintLabels(), objectives: result }
  }

  async getTask(id: string, signal?: AbortSignal): Promise<RawTaskDetail> {
    if (!TASK_ID_RE.test(id)) throw new InvalidTaskIdError(id)
    await this.ensureVersion(signal)
    return parseTaskView(await this.exec(['task', 'view', id, '--json'], signal))
  }

  /**
   * Выполняет команду записи, построенную в `writer.ts`.
   * Отдельный метод, а не публичный `exec`: писать может только то, что собрано проверенным
   * построителем, — произвольная строка аргументов снаружи сюда не попадает.
   */
  async write(args: string[], signal?: AbortSignal): Promise<void> {
    await this.ensureVersion(signal)
    await this.exec(args, signal)
  }
}
