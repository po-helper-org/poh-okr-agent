/**
 * Чтение OKR из нексусов воркспейса.
 *
 * Настоящие цели PO живут не в Backlog.md, а в каталоге нексусов (`GROUND/NEXUS/okr`) —
 * их пишут навыки `/okr-*`. Плагин же работает с задачами Backlog.md, потому что только
 * ими он умеет управлять: у нексуса нет ни статуса, ни срока, ни зависимостей.
 *
 * Поэтому нексусы не читаются на лету, а один раз переносятся в Backlog.md: объектив
 * становится milestone, ключевой результат — задачей типа `okr` с привязкой к нему.
 * Дальше источником истины служит Backlog.md, и повторный импорт ничего не дублирует.
 */

export interface NexusNode {
  nodeId: string
  nodeType: string
  title: string
  /** Для ключевого результата — идентификатор объектива, которому он служит. */
  serves: string | null
}

/**
 * Разбирает frontmatter нексуса.
 *
 * Свой разбор, а не библиотека YAML: нужны четыре скалярных поля из шапки, а тащить
 * зависимость в браузерный бандл ради этого нельзя. Всё, что сложнее строки, игнорируется —
 * многострочные значения и вложенные структуры в этих полях не встречаются.
 */
export function parseNexus(text: string): NexusNode | null {
  const normalized = text.replace(/\r\n?/g, '\n')
  if (!normalized.startsWith('---\n')) return null
  const end = normalized.indexOf('\n---', 3)
  if (end === -1) return null

  const fields = new Map<string, string>()
  for (const line of normalized.slice(4, end).split('\n')) {
    const match = /^([a-zA-Z_]+):\s*(.*)$/.exec(line)
    if (match === null) continue
    // Значение в кавычках и висящее `null` приводим к обычному виду.
    const raw = match[2].trim().replace(/^['"]|['"]$/g, '')
    fields.set(match[1], raw === 'null' ? '' : raw)
  }

  const nodeId = fields.get('node_id') ?? ''
  const nodeType = fields.get('node_type') ?? ''
  const title = fields.get('title') ?? ''
  if (nodeId === '' || nodeType === '') return null

  const serves = fields.get('serves') ?? ''
  return { nodeId, nodeType, title, serves: serves === '' ? null : serves }
}

export interface OkrTree {
  objectives: Array<{ nodeId: string; title: string }>
  keyResults: Array<{ nodeId: string; title: string; serves: string | null }>
}

/**
 * Раскладывает разобранные узлы на объективы и ключевые результаты.
 *
 * Узлы без названия отбрасываются: заводить в Backlog.md запись без имени бессмысленно,
 * её потом не найти. Ключевые результаты, чей объектив не встретился, сохраняются с
 * `serves: null` — они попадут в импорт без привязки, а не потеряются.
 */
export function buildOkrTree(nodes: readonly NexusNode[]): OkrTree {
  const objectives = nodes
    .filter(node => node.nodeType === 'objective' && node.title !== '')
    .map(node => ({ nodeId: node.nodeId, title: node.title }))

  const known = new Set(objectives.map(objective => objective.nodeId))
  const keyResults = nodes
    .filter(node => node.nodeType === 'key-result' && node.title !== '')
    .map(node => ({
      nodeId: node.nodeId,
      title: node.title,
      serves: node.serves !== null && known.has(node.serves) ? node.serves : null,
    }))

  return { objectives, keyResults }
}
