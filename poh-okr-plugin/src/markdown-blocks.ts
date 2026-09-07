/**
 * Блоки описания задачи ↔ markdown.
 *
 * Описание в Backlog.md — обычный markdown: его читают человек, навыки и CLI. Редактор
 * поэтому не заводит своей разметки, а разбирает markdown построчно и собирает обратно.
 * Логика вынесена сюда и проверяется тестами: ошибка здесь молча портит текст задачи
 * в репозитории пользователя, а на экране выглядит как «просто криво отрисовалось».
 */

export const BLOCK_TYPES = [
  'text', 'h1', 'h2', 'h3', 'bullet', 'number', 'todo', 'quote', 'divider',
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

export interface Block {
  type: BlockType
  text: string
  /** Только для `todo`: отмечен ли пункт. */
  done: boolean
}

/** Типы, которые Enter продолжает сам: следующий пункт того же списка. */
export const CONTINUING: ReadonlySet<BlockType> = new Set(['bullet', 'number', 'todo'])

const DIVIDER_RE = /^(-{3,}|\*{3,}|_{3,})$/
const TODO_RE = /^[-*]\s+\[([ xX])\]\s?(.*)$/
const PREFIXED: ReadonlyArray<[RegExp, BlockType]> = [
  [/^###\s+(.*)$/, 'h3'],
  [/^##\s+(.*)$/, 'h2'],
  [/^#\s+(.*)$/, 'h1'],
  [/^>\s?(.*)$/, 'quote'],
  [/^[-*]\s+(.*)$/, 'bullet'],
  [/^\d+[.)]\s+(.*)$/, 'number'],
]

/** Одна строка markdown → блок. Нераспознанное остаётся обычным текстом, а не теряется. */
export function parseLine(line: string): Block {
  if (DIVIDER_RE.test(line.trim())) return { type: 'divider', text: '', done: false }

  // Пункт списка дел проверяется раньше маркированного: он тоже начинается с дефиса,
  // и общее правило списка съело бы его вместе с квадратными скобками.
  const todo = TODO_RE.exec(line)
  if (todo) return { type: 'todo', text: todo[2], done: todo[1].toLowerCase() === 'x' }

  for (const [pattern, type] of PREFIXED) {
    const match = pattern.exec(line)
    if (match) return { type, text: match[1], done: false }
  }
  return { type: 'text', text: line, done: false }
}

export function parseBlocks(markdown: string | null | undefined): Block[] {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  // Пустое описание — одна пустая строка, а не ноль блоков: редактору нужно, куда поставить
  // курсор.
  if (lines.length === 1 && lines[0] === '') return [{ type: 'text', text: '', done: false }]
  return lines.map(parseLine)
}

export function formatBlock(block: Block): string {
  switch (block.type) {
    case 'divider': return '---'
    case 'h1': return `# ${block.text}`
    case 'h2': return `## ${block.text}`
    case 'h3': return `### ${block.text}`
    case 'bullet': return `- ${block.text}`
    // Все пункты пишутся единицей: markdown нумерует их сам при отрисовке, а хранить
    // фактические номера значило бы переписывать весь список при вставке в середину.
    case 'number': return `1. ${block.text}`
    case 'quote': return `> ${block.text}`
    case 'todo': return `- [${block.done ? 'x' : ' '}] ${block.text}`
    default: return block.text
  }
}

export function formatBlocks(blocks: readonly Block[]): string {
  const lines = blocks.map(formatBlock)
  // Хвостовые пустые строки смысла не несут и копились бы при каждом сохранении.
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.join('\n')
}

/**
 * Сокращения, срабатывающие прямо при наборе: «- » превращает строку в пункт списка,
 * «[] » — в пункт списка дел, «# » — в заголовок.
 *
 * Без них чеклист можно получить только через меню, а человек по привычке набирает
 * разметку руками и видит, что «ничего не работает». Возвращает тип блока и текст,
 * который должен остаться в строке после замены.
 */
export function shortcutFor(text: string): { type: BlockType; rest: string } | null {
  const rules: ReadonlyArray<[RegExp, BlockType]> = [
    [/^###\s(.*)$/, 'h3'],
    [/^##\s(.*)$/, 'h2'],
    [/^#\s(.*)$/, 'h1'],
    [/^>\s(.*)$/, 'quote'],
    // Пункт списка дел проверяется раньше маркированного: «- [] » начинается с дефиса.
    [/^[-*]\s\[[ xX]?\]\s?(.*)$/, 'todo'],
    [/^\[[ xX]?\]\s(.*)$/, 'todo'],
    [/^[-*]\s(.*)$/, 'bullet'],
    [/^\d+[.)]\s(.*)$/, 'number'],
  ]
  for (const [pattern, type] of rules) {
    const match = pattern.exec(text)
    if (match) return { type, rest: match[1] }
  }
  return null
}
