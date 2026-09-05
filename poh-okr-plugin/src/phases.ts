import {
  KR_LABEL_PREFIX,
  PHASES,
  PHASE_LABEL_PREFIX,
  PO_TASK_LABEL_PREFIX,
  PO_TASK_KINDS,
  SPRINT_COUNT,
  codeOf,
  emptyPhases,
  phaseLabel,
  type Phase,
  type PhaseCode,
  type PoTaskKind,
} from './model.js'

const PHASE_SET: ReadonlySet<string> = new Set(PHASES)
const KIND_SET: ReadonlySet<string> = new Set(PO_TASK_KINDS)

/** `okr-phase:s3:dev` → спринт 2 (с нуля) и фаза `dev`. Незнакомая метка — `null`. */
export function readPhaseLabel(label: string): { sprint: number; phase: Phase } | null {
  if (!label.startsWith(PHASE_LABEL_PREFIX)) return null
  const rest = label.slice(PHASE_LABEL_PREFIX.length)
  const match = /^s(\d+):(.+)$/.exec(rest)
  if (!match) return null

  const sprint = Number(match[1]) - 1
  if (!Number.isInteger(sprint) || sprint < 0 || sprint >= SPRINT_COUNT) return null
  if (!PHASE_SET.has(match[2])) return null

  return { sprint, phase: match[2] as Phase }
}

/**
 * Собирает раскладку по спринтам из меток задачи.
 *
 * На один спринт метка должна быть одна. Если их несколько (метки правились в обход плагина —
 * руками или скиллом), выигрывает последняя по порядку фаз: ячейка показывает самую позднюю
 * стадию, до которой дошли. Тихо брать первую попавшуюся хуже — доска показала бы откат назад.
 */
export function phasesFromLabels(labels: readonly string[]): PhaseCode[] {
  const phases = emptyPhases()
  for (const label of labels) {
    const parsed = readPhaseLabel(label)
    if (!parsed) continue
    const code = codeOf(parsed.phase)
    if (code > phases[parsed.sprint]) phases[parsed.sprint] = code
  }
  return phases
}

/** Все метки фаз задачи — то, что надо снять, меняя фазу спринта. */
export function phaseLabelsOf(labels: readonly string[], sprint: number): string[] {
  return labels.filter(label => readPhaseLabel(label)?.sprint === sprint)
}

/** Метка новой фазы спринта. `null` — фазу снимают, новой метки не будет. */
export function labelForPhase(sprint: number, phase: Phase | null): string | null {
  return phase === null ? null : phaseLabel(sprint, phase)
}

/** `okr-kind:risk` → `risk`. Незнакомая метка — `null`. */
export function readKindLabel(label: string): PoTaskKind | null {
  if (!label.startsWith(PO_TASK_LABEL_PREFIX)) return null
  const kind = label.slice(PO_TASK_LABEL_PREFIX.length)
  return KIND_SET.has(kind) ? (kind as PoTaskKind) : null
}

/**
 * Вкладка панели, на которой показывается задача.
 * Без метки — «Задачи»: задача, заведённая мимо плагина, должна быть видна, а не пропадать.
 */
export function kindFromLabels(labels: readonly string[]): PoTaskKind {
  for (const label of labels) {
    const kind = readKindLabel(label)
    if (kind) return kind
  }
  return 'task'
}

/** Идентификаторы KR, к которым привязана операционная задача. */
export function krIdsFromLabels(labels: readonly string[]): string[] {
  return labels
    .filter(label => label.startsWith(KR_LABEL_PREFIX))
    .map(label => label.slice(KR_LABEL_PREFIX.length))
    .filter(id => id !== '')
}
