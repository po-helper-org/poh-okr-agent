/**
 * Разбор `backlog milestone list --plain`.
 *
 * Единственное место, где приходится читать формат «для человека»: у команд объективов
 * и документов машинного вывода в Backlog.md 1.51.0 ещё нет. Формат простой и устойчивый:
 *
 *   Active milestones (1):
 *     m-0: Sprint 2026-09-03 – 2026-09-16 (3/8 done)
 */

export interface MilestoneRow {
  id: string
  title: string
  /** Сколько задач объектива закрыто. `null` — счётчик не показан. */
  done: number | null
  total: number | null
  /** Объектив из раздела завершённых. */
  completed: boolean
}

const SECTION_RE = /^(Active|Completed)\s+milestones\b/i
const ROW_RE = /^\s+(m-\d+):\s+(.+?)(?:\s+\((\d+)\/(\d+)\s+done\))?\s*$/
/** Заглушка пустого раздела — не строка объектива. */
const NONE_RE = /^\s+\(none\)\s*$/

export function parseMilestoneList(stdout: string): MilestoneRow[] {
  const normalized = stdout.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const out: MilestoneRow[] = []
  let completed = false

  for (const line of normalized.split('\n')) {
    const section = SECTION_RE.exec(line)
    if (section) {
      completed = section[1].toLowerCase() === 'completed'
      continue
    }
    if (NONE_RE.test(line)) continue

    const row = ROW_RE.exec(line)
    if (!row) continue

    out.push({
      id: row[1],
      title: row[2].trim(),
      done: row[3] === undefined ? null : Number(row[3]),
      total: row[4] === undefined ? null : Number(row[4]),
      completed,
    })
  }
  return out
}
