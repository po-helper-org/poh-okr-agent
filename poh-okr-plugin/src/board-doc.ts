import { SPRINT_COUNT, defaultSprintLabels } from './model.js'

/**
 * Настройки доски в документе Backlog.md.
 *
 * Подписи столбцов — свойство доски, а не задачи: держать их на задачах негде и незачем.
 * Документ Backlog.md — единственное подходящее место, потому что своего хранилища у плагина
 * нет по условию, а документы читаются и правятся тем же CLI, что и задачи.
 *
 * Тело документа — JSON. Документ служебный: его читает плагин, а не человек, и формат должен
 * разбираться однозначно, без догадок о разметке.
 */

export interface BoardSettings {
  sprintLabels: string[]
}

const DOC_ID_RE = /^(doc-\d+)\s+-\s+(.+)$/

/** Разбирает `backlog doc list --plain`: строки вида `doc-1 - okr-board`. */
export function parseDocList(stdout: string): Array<{ id: string; title: string }> {
  const normalized = stdout.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const out: Array<{ id: string; title: string }> = []
  for (const line of normalized.split('\n')) {
    const match = DOC_ID_RE.exec(line.trim())
    if (match) out.push({ id: match[1], title: match[2].trim() })
  }
  return out
}

/**
 * Отрезает frontmatter от тела документа.
 * `doc view --plain` печатает метаданные YAML между `---`, а следом — содержимое.
 */
export function docBody(stdout: string): string {
  const normalized = stdout.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  if (!normalized.startsWith('---\n')) return normalized.trim()
  const end = normalized.indexOf('\n---\n', 3)
  return end === -1 ? '' : normalized.slice(end + 5).trim()
}

/**
 * Приводит содержимое документа к настройкам доски.
 *
 * Любая беда с содержимым — умолчания, а не исключение: документ мог отредактировать человек
 * или ещё не создал никто, и доска обязана открыться в обоих случаях. Ошибка здесь стоила бы
 * пустого экрана вместо доски из-за одной кривой строки в служебном файле.
 */
export function decodeBoardSettings(body: string): BoardSettings {
  const fallback: BoardSettings = { sprintLabels: defaultSprintLabels() }
  if (body.trim() === '') return fallback

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return fallback
  }
  if (typeof parsed !== 'object' || parsed === null) return fallback

  const raw = (parsed as Record<string, unknown>)['sprintLabels']
  if (!Array.isArray(raw)) return fallback

  // Ровно `SPRINT_COUNT` подписей: короче — дополняем умолчаниями, длиннее — обрезаем.
  // Доска рисует фиксированное число столбцов, и рассинхрон длины сдвинул бы все ячейки.
  const defaults = defaultSprintLabels()
  const labels = Array.from({ length: SPRINT_COUNT }, (_, i) => {
    const value = raw[i]
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : defaults[i]
  })
  return { sprintLabels: labels }
}

export function encodeBoardSettings(settings: BoardSettings): string {
  return JSON.stringify(settings)
}
