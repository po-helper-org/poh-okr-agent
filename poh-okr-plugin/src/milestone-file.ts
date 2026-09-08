/**
 * Карточка объектива — файл milestone в Backlog.md.
 *
 * У `backlog milestone` нет подкоманды просмотра: список отдаёт только идентификатор,
 * название и счётчик. Поэтому описание и срок читаются из самого файла — он лежит рядом
 * с задачами и имеет тот же вид: frontmatter и разделы markdown.
 */

export interface MilestoneCard {
  id: string
  title: string
  dueDate: string | null
  description: string
}

const FRONT_RE = /^---\n([\s\S]*?)\n---\n?/
const SECTION_RE = /^##\s+Description\s*$/m

/** `m-1 - objective-1.md` → `m-1`. Имя файла начинается с идентификатора. */
export function milestoneIdFromFile(name: string): string | null {
  const match = /^(m-\d+)\s+-\s+/.exec(name)
  return match === null ? null : match[1]
}

function unquote(value: string): string {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

/**
 * Разбирает файл объектива.
 *
 * Отсутствие описания — обычное состояние: milestone заводится одной командой и раздела
 * может не быть вовсе. Возвращаем пустую строку, а не `null`: карточке всё равно, а
 * вызывающему не приходится различать «нет раздела» и «раздел пуст».
 */
export function parseMilestoneFile(text: string): MilestoneCard | null {
  const normalized = text.replace(/\r\n?/g, '\n')
  const front = FRONT_RE.exec(normalized)
  if (front === null) return null

  const fields = new Map<string, string>()
  for (const line of front[1].split('\n')) {
    const match = /^([a-z_]+):\s*(.*)$/.exec(line)
    if (match !== null) fields.set(match[1], unquote(match[2]))
  }

  const id = fields.get('id') ?? ''
  if (id === '') return null

  const body = normalized.slice(front[0].length)
  const section = SECTION_RE.exec(body)
  let description = ''
  if (section !== null && section.index !== undefined) {
    const after = body.slice(section.index + section[0].length)
    // Описание заканчивается следующим заголовком того же уровня.
    const next = /^##\s+/m.exec(after)
    description = (next === null ? after : after.slice(0, next.index)).trim()
    // Служебные маркеры секций Backlog.md в текст не входят.
    description = description.replace(/<!--\s*SECTION:[^>]*-->/g, '').trim()
  }

  const due = fields.get('due_date') ?? fields.get('dueDate') ?? ''
  return {
    id,
    title: fields.get('title') ?? '',
    dueDate: due === '' ? null : due,
    description,
  }
}

/** Текущий квартал в виде `2026Q3` — им параметризуются команды навыков. */
export function currentQuarter(now: Date): string {
  return `${now.getFullYear()}Q${Math.floor(now.getMonth() / 3) + 1}`
}
