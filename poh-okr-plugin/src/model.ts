/**
 * Предметная модель раздела «Управление целями».
 *
 * Своего хранилища у плагина нет: всё живёт в Backlog.md и читается через его CLI.
 * Соответствие сущностей — единственное место, где это записано явно:
 *
 *   объектив (OBJ)      → milestone
 *   ключевой результат  → задача типа `okr` с привязкой к milestone
 *   операционная задача → задача типа `potask` со связью на KR
 *
 * Разделение типов не косметическое: у KR и операционной задачи разный жизненный цикл.
 * KR живёт квартал и меряется фазами по спринтам, операционная задача — это todo PO,
 * который закрывается за день и умирает.
 */

/** Фазы работы над KR внутри спринта. Индекс в массиве — код фазы, 0 занят пустой ячейкой. */
export const PHASES = ['research', 'analyze', 'dev', 'qa', 'release'] as const

export type Phase = (typeof PHASES)[number]

/**
 * Значение ячейки доски: 0 — фаза не назначена, 1..5 — индекс в `PHASES` со сдвигом на единицу.
 * Числом, а не строкой: доска — плотная матрица, и пустая ячейка должна быть дешевле строки.
 */
export type PhaseCode = 0 | 1 | 2 | 3 | 4 | 5

/** Сколько спринтов показывает доска. Квартал — шесть двухнедельных спринтов. */
export const SPRINT_COUNT = 6

export function phaseOf(code: PhaseCode): Phase | null {
  return code === 0 ? null : PHASES[code - 1]
}

export function codeOf(phase: Phase): PhaseCode {
  return (PHASES.indexOf(phase) + 1) as PhaseCode
}

/**
 * Метка фазы на задаче KR: `okr-phase:s3:dev`.
 *
 * Фазы хранятся метками, а не отдельным полем, потому что своего поля в Backlog.md нет,
 * а метки правятся точечно (`--add-label` / `--remove-label`) — клик по ячейке не перезаписывает
 * соседние метки задачи. Префикс `okr-phase:` отделяет их от прочих меток воркспейса.
 */
export const PHASE_LABEL_PREFIX = 'okr-phase:'

export function phaseLabel(sprint: number, phase: Phase): string {
  return `${PHASE_LABEL_PREFIX}s${sprint + 1}:${phase}`
}

/** Вкладки панели работы. Разделяются меткой на задаче типа `potask`, а не отдельным типом. */
export const PO_TASK_KINDS = ['task', 'control', 'risk'] as const

export type PoTaskKind = (typeof PO_TASK_KINDS)[number]

export const PO_TASK_LABEL_PREFIX = 'okr-kind:'

export function poTaskLabel(kind: PoTaskKind): string {
  return `${PO_TASK_LABEL_PREFIX}${kind}`
}

/**
 * Метка связи операционной задачи с ключевым результатом: `okr-kr:PO-30`.
 *
 * Дублирует зависимость `--dep`, и это осознанно. Смысловая связь — именно зависимость: она
 * видна в самом Backlog.md и участвует в его графе готовности. Но `task list --json` зависимостей
 * не отдаёт, только `task view`, — а панель работы показывает десятки задач сразу, и карточка на
 * каждую превратила бы открытие панели в десятки запусков CLI. Метки в списке есть, поэтому
 * связь дублируется меткой ради чтения списком.
 */
export const KR_LABEL_PREFIX = 'okr-kr:'

export function krLabel(krId: string): string {
  return `${KR_LABEL_PREFIX}${krId}`
}

export type Priority = 'high' | 'medium' | 'low'

/** Строка списка: всё, что видно без открытия задачи. */
export interface TaskSummary {
  id: string
  title: string
  /** Статус как его назвал воркспейс. Плагин не навязывает свой канон статусов. */
  status: string
  /** `null` — приоритет не выставлен. У Backlog.md нет значения «никакой». */
  priority: Priority | null
  labels: string[]
  /** `YYYY-MM-DD`. Появился в Backlog.md 1.51.0; на более старом CLI поля не будет. */
  dueDate?: string
  milestone?: string
}

/** Ключевой результат: строка доски. */
export interface KeyResult extends TaskSummary {
  /** Фактическая раскладка по спринтам. Длина — `SPRINT_COUNT`. */
  phases: PhaseCode[]
}

/**
 * Плановые спринты и ресурсы по стадиям.
 *
 * С `KeyResult.phases` не связаны: спецификация объявляет их независимыми. Плановый спринт
 * влияет только на граф детальной страницы, фактическая фаза — только на доску. Сверку
 * «план против факта» инструмент не делает и не должен.
 */
export type StagePlan = Partial<Record<Phase, { sprint?: number; resources?: string }>>

/** Операционная задача PO: то, что показывает панель работы. */
export interface PoTask extends TaskSummary {
  kind: PoTaskKind
  /** Идентификаторы KR, которым задача помогает. Пусто — задача сама по себе. */
  relatedKrIds: string[]
}

/** Объектив: группа строк на доске. */
export interface Objective {
  id: string
  title: string
  dueDate?: string
  krs: KeyResult[]
}

/** Доска целей целиком. */
export interface Board {
  /** Подписи столбцов. Длина — `SPRINT_COUNT`. */
  sprintLabels: string[]
  objectives: Objective[]
}

/** Подписи столбцов по умолчанию, пока воркспейс не задал свои. */
export function defaultSprintLabels(): string[] {
  return Array.from({ length: SPRINT_COUNT }, (_, i) => `S${i + 1}`)
}

/** Пустая раскладка фаз: доска рисует такую строку штриховкой во всех столбцах. */
export function emptyPhases(): PhaseCode[] {
  return Array.from({ length: SPRINT_COUNT }, () => 0 as PhaseCode)
}
