import { InvalidMilestoneIdError, InvalidTaskIdError, SprintOutOfRangeError } from './errors.js'
import { SPRINT_COUNT, krLabel, poTaskLabel, type Phase, type PoTaskKind, type Priority } from './model.js'
import { labelForPhase, phaseLabelsOf } from './phases.js'

/**
 * Построение команд записи.
 *
 * Функции чистые: возвращают аргументы для `backlog`, но ничего не запускают. Так проверка
 * «правка ячейки снимает ровно старую метку и ставит ровно новую» не требует ни процесса,
 * ни воркспейса — а именно в этом месте ошибка стоит дороже всего: неверный набор аргументов
 * молча испортит задачу в репозитории пользователя.
 *
 * Прямых правок `.md` нет нигде: единственный писатель — CLI Backlog.md.
 */

const TASK_ID_RE = /^[A-Za-z]+-\d+(?:\.\d+)*$/
const MILESTONE_ID_RE = /^m-\d+$/

/**
 * Идентификаторы приходят из интерфейса и проверяются до похода в CLI.
 * `backlog task edit --help` тоже отвечает кодом 0, то есть значение вида `--help`
 * без этой проверки прошло бы как «успешная правка», ничего не изменив.
 */
function taskId(id: string): string {
  if (!TASK_ID_RE.test(id)) throw new InvalidTaskIdError(id)
  return id
}

function milestoneId(id: string): string {
  if (!MILESTONE_ID_RE.test(id)) throw new InvalidMilestoneIdError(id)
  return id
}

function sprintIndex(sprint: number): number {
  if (!Number.isInteger(sprint) || sprint < 0 || sprint >= SPRINT_COUNT) {
    throw new SprintOutOfRangeError(sprint, SPRINT_COUNT)
  }
  return sprint
}

/** Одна команда `backlog`: имя программы подставит вызывающий из конфигурации. */
export type BacklogArgs = string[]

export interface CreateKeyResultInput {
  title: string
  objectiveId: string
  taskType: string
  dueDate?: string
}

export function createKeyResult(input: CreateKeyResultInput): BacklogArgs {
  const args = [
    'task',
    'create',
    input.title,
    '--type',
    input.taskType,
    '--milestone',
    milestoneId(input.objectiveId),
  ]
  if (input.dueDate) args.push('--due-date', input.dueDate)
  return args
}

export interface CreatePoTaskInput {
  title: string
  kind: PoTaskKind
  taskType: string
  /** Контекст задачи, набранный во второй строке быстрого ввода. */
  description?: string
  priority?: Priority
  /** KR, которому задача помогает. Связь — зависимость, а не родительство: у операционной
   *  задачи свой жизненный цикл, и подзадачей KR она быть не должна. */
  relatedKrId?: string
  dueDate?: string
}

export function createPoTask(input: CreatePoTaskInput): BacklogArgs {
  // У `task create` флаг называется `--labels`, у `task edit` — `--label`. Имена разные,
  // и перепутать их нельзя: неизвестный флаг Backlog.md отвергает целиком.
  const labels = [poTaskLabel(input.kind)]
  // Связь дублируется меткой: `task list --json` зависимостей не отдаёт, а панель читает
  // список (см. KR_LABEL_PREFIX в model.ts).
  if (input.relatedKrId) labels.push(krLabel(taskId(input.relatedKrId)))
  const args = ['task', 'create', input.title, '--type', input.taskType, '--labels', labels.join(',')]
  if (input.relatedKrId) args.push('--dep', taskId(input.relatedKrId))
  if (input.dueDate) args.push('--due-date', input.dueDate)
  if (input.description) args.push('--description', input.description)
  // Приоритет не проставляется, когда его не выбрали: у Backlog.md нет значения «никакой»,
  // и подстановка умолчания выдала бы догадку за решение человека.
  if (input.priority) args.push('--priority', input.priority)
  return args
}

export function renameTask(id: string, title: string): BacklogArgs {
  return ['task', 'edit', taskId(id), '-t', title]
}

export function setStatus(id: string, status: string): BacklogArgs {
  return ['task', 'edit', taskId(id), '-s', status]
}

export function setDueDate(id: string, dueDate: string): BacklogArgs {
  return ['task', 'edit', taskId(id), '--due-date', dueDate]
}

export function setDescription(id: string, text: string): BacklogArgs {
  return ['task', 'edit', taskId(id), '--desc', text]
}

/** Событие ленты детальной страницы — комментарий задачи: дата и автор проставляются CLI. */
export function addEvent(id: string, text: string, author?: string): BacklogArgs {
  const args = ['task', 'edit', taskId(id), '--comment', text]
  if (author) args.push('--comment-author', author)
  return args
}

/**
 * Смена фазы в ячейке доски.
 *
 * Возвращает одну команду, а не пару «снять / поставить»: `--remove-label` и `--add-label`
 * комбинируются в одном вызове, поэтому промежуточного состояния «фаза уже снята, новая ещё
 * не проставлена» не возникает. Снимаются все метки этого спринта, а не только ожидаемая
 * старая: если метки правились в обход плагина, дубликаты надо убрать, иначе они переживут
 * правку и ячейка не изменится.
 *
 * `null` в `phase` — очистка ячейки (правая кнопка мыши на последней фазе).
 * Возвращает `null`, если делать нечего: снимать нечего и ставить нечего.
 */
export function setPhase(
  id: string,
  currentLabels: readonly string[],
  sprint: number,
  phase: Phase | null,
): BacklogArgs | null {
  const index = sprintIndex(sprint)
  const next = labelForPhase(index, phase)
  const stale = phaseLabelsOf(currentLabels, index).filter(label => label !== next)

  if (stale.length === 0 && (next === null || currentLabels.includes(next))) return null

  const args = ['task', 'edit', taskId(id)]
  if (stale.length > 0) args.push('--remove-label', stale.join(','))
  if (next !== null && !currentLabels.includes(next)) args.push('--add-label', next)
  return args
}

export function createObjective(title: string, dueDate?: string): BacklogArgs {
  const args = ['milestone', 'add', title]
  if (dueDate) args.push('--due-date', dueDate)
  return args
}

export function renameObjective(from: string, to: string): BacklogArgs {
  return ['milestone', 'rename', from, to]
}

/**
 * Удаление объектива.
 *
 * `--task-handling keep` вместо умолчания `clear`: по умолчанию Backlog.md стирает привязку
 * к объективу у всех его задач. Сами KR при этом живы, но их принадлежность объективу теряется
 * безвозвратно — восстановить, какой KR к какому объективу относился, будет уже неоткуда.
 * Клик по крестику на полосе доски такого стоить не должен.
 */
export function removeObjective(id: string): BacklogArgs {
  return ['milestone', 'remove', milestoneId(id), '--task-handling', 'keep']
}

export function deleteTask(id: string): BacklogArgs {
  return ['task', 'archive', taskId(id)]
}

/** Подписи столбцов доски: тело служебного документа целиком переписывается. */
export function updateBoardDoc(docId: string, content: string): BacklogArgs {
  if (!/^doc-\d+$/.test(docId)) throw new InvalidTaskIdError(docId)
  return ['doc', 'update', docId, '--content', content]
}

export function createBoardDoc(title: string): BacklogArgs {
  return ['doc', 'create', title, '--plain']
}

export function setDependencies(id: string, dependsOn: readonly string[]): BacklogArgs {
  return ['task', 'edit', taskId(id), '--dep', dependsOn.map(taskId).join(',')]
}

export function setAssignee(id: string, assignee: string): BacklogArgs {
  return ['task', 'edit', taskId(id), '-a', assignee]
}

/** Ссылка на Confluence живёт в documentation, ссылка на эпик трекера — в references. */
export function setConfluence(id: string, url: string): BacklogArgs {
  return ['task', 'edit', taskId(id), '--doc', url]
}

export function setEpicLink(id: string, url: string): BacklogArgs {
  return ['task', 'edit', taskId(id), '--ref', url]
}

/** Плановые спринты и ресурсы по стадиям: блок плагина в поле «План реализации». */
export function setPlan(id: string, text: string): BacklogArgs {
  return ['task', 'edit', taskId(id), '--plan', text]
}
