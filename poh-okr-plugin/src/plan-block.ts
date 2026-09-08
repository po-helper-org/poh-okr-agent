import { PHASES, SPRINT_COUNT, type Phase } from './model.js'

/**
 * Плановые спринты, ресурсы и ответственные — блок в поле «План реализации» задачи KR.
 *
 * Своих полей под это в Backlog.md нет, а заводить рядом собственный файл нельзя: хранилище
 * у раздела одно. Поле плана — единственное подходящее место: оно свободное, принадлежит
 * задаче и правится тем же CLI.
 *
 * Формат — строки `ключ: значение`, а не таблица и не JSON. Таблицу ломает любая ручная
 * правка разметки, JSON нечитаем для того, кто откроет задачу в редакторе или в веб-интерфейсе
 * Backlog.md. Строки переживают и то, и другое: неузнанная строка просто игнорируется, а
 * остальные разбираются.
 */

export interface StageRow {
  /** Номер спринта с нуля. `null` — стадия не запланирована. */
  sprint: number | null
  resources: string
}

export interface PlanBlock {
  stages: Record<Phase, StageRow>
  teams: string
  techLeads: string
  executors: string
}

const LABELS: Readonly<Record<string, keyof Omit<PlanBlock, 'stages'>>> = {
  teams: 'teams',
  techleads: 'techLeads',
  executors: 'executors',
}

const PHASE_SET: ReadonlySet<string> = new Set(PHASES)

export function emptyPlan(): PlanBlock {
  const stages = {} as Record<Phase, StageRow>
  for (const phase of PHASES) stages[phase] = { sprint: null, resources: '' }
  return { stages, teams: '', techLeads: '', executors: '' }
}

/**
 * Разбирает блок плана.
 * Всё, что не разобралось, молча пропускается: поле плана может содержать и обычный текст,
 * написанный человеком, и терять его из-за строгого разбора нельзя.
 */
export function parsePlan(text: string | null | undefined): PlanBlock {
  const plan = emptyPlan()
  if (!text) return plan

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^\s*([A-Za-zА-Яа-я]+)\s*:\s*(.*)$/.exec(line)
    if (!match) continue

    const key = match[1].toLowerCase()
    const value = match[2].trim()

    const plain = LABELS[key]
    if (plain) {
      plan[plain] = value
      continue
    }

    if (!PHASE_SET.has(key)) continue
    // `спринт 3 / 1 аналитик` — номер и ресурсы разделены косой чертой. Ресурсы свободный
    // текст и сами могут содержать что угодно, поэтому режем по первому разделителю.
    const [sprintPart, ...rest] = value.split('/')
    const sprintMatch = /(\d+)/.exec(sprintPart)
    const sprint = sprintMatch ? Number(sprintMatch[1]) - 1 : null
    plan.stages[key as Phase] = {
      sprint: sprint !== null && sprint >= 0 && sprint < SPRINT_COUNT ? sprint : null,
      resources: rest.join('/').trim(),
    }
  }
  return plan
}

/** Собирает блок обратно. Пустые стадии и пустые поля не пишутся — блок не должен разрастаться. */
export function formatPlan(plan: PlanBlock): string {
  const lines: string[] = []
  for (const phase of PHASES) {
    const row = plan.stages[phase]
    if (row.sprint === null && row.resources.trim() === '') continue
    const sprint = row.sprint === null ? '—' : `спринт ${row.sprint + 1}`
    lines.push(row.resources.trim() === '' ? `${phase}: ${sprint}` : `${phase}: ${sprint} / ${row.resources.trim()}`)
  }
  if (plan.teams.trim() !== '') lines.push(`teams: ${plan.teams.trim()}`)
  if (plan.techLeads.trim() !== '') lines.push(`techLeads: ${plan.techLeads.trim()}`)
  if (plan.executors.trim() !== '') lines.push(`executors: ${plan.executors.trim()}`)
  return lines.join('\n')
}
