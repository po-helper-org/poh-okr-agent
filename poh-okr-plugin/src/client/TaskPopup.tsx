/**
 * Режим редактирования операционной задачи.
 *
 * Контекст задачи хранится в описании задачи Backlog.md как markdown, а не как HTML.
 * Прототип использовал `contenteditable` с богатой разметкой, но хранилище здесь общее с
 * навыками и человеком: HTML в описании задачи нечитаем в `backlog task view`, в веб-интерфейсе
 * Backlog.md и в самом `.md`-файле. Markdown читается везде и переживает правку в обход плагина.
 *
 * Поэтому меню блоков вставляет markdown-разметку в позицию курсора. Пункты прототипа
 * «Attachment», «Subtask», «Tag» и «Linked task/note» сюда не перенесены: у них нет
 * соответствия в описании задачи, и кнопка, которая ничего не делает, хуже отсутствующей.
 * Подзадачи и связи в Backlog.md есть отдельными механизмами — им место в отдельной работе,
 * а не в виде вставки текста.
 */
import { useEffect, useRef, useState } from 'react'
import {
  Button, IconAlarmClockOutline16, IconListPenOutline16, IconTrashOutline16, Modal, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PoTask } from '../model.js'
import type { OkrLocaleKey } from './locales.js'
import { classNames as css } from './styles.js'

export interface TaskPopupProps {
  task: PoTask
  /** Описание задачи: приходит из карточки, пока не загружено — пусто. */
  content: string
  t: (key: OkrLocaleKey) => string
  onRename: (title: string) => void
  onToggleDone: () => void
  onSaveContent: (text: string) => void
  onSetDue: (date: string) => void
  onDelete: () => void
  onClose: () => void
  /**
   * Выделить название целиком при открытии.
   *
   * Включается для только что заведённой записи: у неё название — заглушка, и первое, что
   * делает человек, — печатает своё поверх. Для существующей задачи выделение опасно:
   * случайное нажатие клавиши стёрло бы настоящее имя, поэтому там курсор просто встаёт
   * в конец.
   */
  selectTitle?: boolean
}

/** Блоки меню: подпись и вставляемая разметка. */
const BLOCKS: ReadonlyArray<{ key: OkrLocaleKey; snippet: string }> = [
  { key: 'blockText', snippet: '' },
  { key: 'blockH1', snippet: '# ' },
  { key: 'blockH2', snippet: '## ' },
  { key: 'blockH3', snippet: '### ' },
  { key: 'blockBulleted', snippet: '- ' },
  { key: 'blockNumbered', snippet: '1. ' },
  { key: 'blockCheck', snippet: '- [ ] ' },
  { key: 'blockQuote', snippet: '> ' },
  { key: 'blockDivider', snippet: '---\n' },
]

export function TaskPopup(props: TaskPopupProps) {
  const { task, content, t, onRename, onToggleDone, onSaveContent, onSetDue, onDelete, onClose, selectTitle } = props
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState(content)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const done = task.status.toLowerCase() === 'done'

  /**
   * Фокус в название при открытии карточки.
   *
   * Карточка открывается в том числе сразу после создания записи (требование T-07), и первое,
   * что делает человек, — даёт задаче имя. Без фокуса он вынужден сперва прицелиться мышью в
   * заголовок, хотя карточку для этого и открыли.
   */
  useEffect(() => {
    const node = titleRef.current
    if (node === null) return
    node.focus()
    const range = document.createRange()
    range.selectNodeContents(node)
    if (selectTitle !== true) range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, [task.id, selectTitle])

  /**
   * Вставляет блок в позицию курсора; без курсора — в конец (требование C-05).
   * Блок начинается с новой строки, если курсор стоит не в её начале: иначе `- ` приклеился бы
   * к концу предыдущей фразы и списком бы не стал.
   */
  const insertBlock = (snippet: string) => {
    const area = areaRef.current
    const at = area?.selectionStart ?? draft.length
    const before = draft.slice(0, at)
    const after = draft.slice(at)
    const prefix = before === '' || before.endsWith('\n') ? '' : '\n'
    const next = `${before}${prefix}${snippet}${after}`
    setDraft(next)
    setMenu(null)
    // Курсор — сразу за вставленной разметкой, чтобы можно было продолжить печатать.
    queueMicrotask(() => {
      const position = before.length + prefix.length + snippet.length
      area?.focus()
      area?.setSelectionRange(position, position)
    })
  }

  const commit = () => { if (draft !== content) onSaveContent(draft) }

  const overdue = !done && task.dueDate !== undefined && task.dueDate <= new Date().toISOString().slice(0, 10)

  return (
    <Modal
      open
      headless
      title={task.title}
      onClose={() => { commit(); onClose() }}
    >
      {/* В headless-режиме модалка кладёт детей прямо в диалог и своих горизонтальных
          отступов не даёт (contentClassName в этом режиме не применяется) — поэтому
          содержимое обёрнуто своим слоем с отступами. */}
      <div className={css.card}>
      {/* Шапка карточки по образцу брендбука: состояние, срок и приоритет одной строкой,
          закрытие берёт на себя сам Modal. */}
      <div className={css.popupHead}>
        <button
          type="button"
          className={css.itemCheck}
          data-kind={task.kind}
          data-done={done || undefined}
          data-overdue={overdue || undefined}
          aria-pressed={done}
          aria-label={task.title}
          onClick={onToggleDone}
        />
        {/* Пока срок не задан, поле показывает подпись, а не пустой шаблон «дд.мм.гггг»:
            сырой формат в шапке читается как незаполненная форма, а не как «срока нет». */}
        <label className={css.dateChip} data-overdue={overdue || undefined} data-empty={task.dueDate === undefined || undefined}>
          <IconAlarmClockOutline16 />
          <span className={css.dateChipLabel}>{t('fieldDue')}</span>
          <input
            className={css.dateChipInput}
            type="date"
            aria-label={t('fieldDue')}
            value={task.dueDate ?? ''}
            onChange={event => { if (event.target.value !== '') onSetDue(event.target.value) }}
          />
        </label>
        <span style={{ flex: 1 }} />
        {task.priority === 'high' && !done && <StateDot state="warning" />}
      </div>

      <div
        ref={titleRef}
        className={css.popupTitle}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={event => {
          const next = event.currentTarget.textContent?.trim() ?? ''
          if (next !== '' && next !== task.title) onRename(next)
          else event.currentTarget.textContent = task.title
        }}
      >{task.title}</div>

      <textarea
        ref={areaRef}
        className={css.fieldArea}
        style={{ minHeight: 220, border: 'none', background: 'transparent', padding: 0 }}
        placeholder={t('taskContext')}
        value={draft}
        onChange={event => { setDraft(event.target.value) }}
        onBlur={commit}
      />

      <div className={css.popupFoot}>
        <Button
          variant="toolbar"
          size="sm"
          aria-label={t('blockText')}
          icon={<IconListPenOutline16 />}
          onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect()
            setMenu({ x: rect.left, y: rect.bottom + 4 })
          }}
        />
        <span className={css.mono}>{task.id}</span>
        <span style={{ flex: 1 }} />
        <Button variant="toolbar" size="sm" aria-label={t('delete')}
          icon={<IconTrashOutline16 />} onClick={onDelete} />
      </div>

      </div>

      {menu !== null && (
        <>
          <div className={css.backdrop} style={{ background: 'transparent' }} onClick={() => { setMenu(null) }} />
          <div className={css.blockMenu} style={{ left: menu.x, top: menu.y }} role="menu">
            {BLOCKS.map(block => (
              <button
                key={block.key}
                type="button"
                className={css.blockMenuItem}
                role="menuitem"
                onClick={() => { insertBlock(block.snippet) }}
              >{t(block.key)}</button>
            ))}
          </div>
        </>
      )}
    </Modal>
  )
}
