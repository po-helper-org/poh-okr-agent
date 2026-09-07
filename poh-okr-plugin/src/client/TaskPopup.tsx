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

  return (
    <>
      <div className={css.backdrop} onClick={() => { commit(); onClose() }} />
      <div className={css.popup} role="dialog" aria-label={task.title}>
        <div className={css.popupHead}>
          <button
            type="button"
            className={css.itemCheck}
            data-kind={task.kind}
            data-done={done || undefined}
            aria-pressed={done}
            aria-label={task.title}
            onClick={onToggleDone}
          />
          <input
            className={`${css.fieldInput} ${css.mono}`}
            style={{ width: 132 }}
            type="date"
            value={task.dueDate ?? ''}
            onChange={event => { if (event.target.value !== '') onSetDue(event.target.value) }}
          />
          <button type="button" className={css.iconButton} onClick={() => { commit(); onClose() }} aria-label={t('close')}>✕</button>
        </div>

        <div
          ref={titleRef}
          className={css.popupTitle}
          style={{ padding: '10px 16px 0' }}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={event => {
            const next = event.currentTarget.textContent?.trim() ?? ''
            if (next !== '' && next !== task.title) onRename(next)
            else event.currentTarget.textContent = task.title
          }}
        >{task.title}</div>

        <div className={css.popupBody}>
          <textarea
            ref={areaRef}
            className={css.fieldArea}
            style={{ minHeight: 200 }}
            placeholder={t('taskContext')}
            value={draft}
            onChange={event => { setDraft(event.target.value) }}
            onBlur={commit}
          />
        </div>

        <div className={css.popupFoot}>
          <button
            type="button"
            className={css.iconButton}
            aria-label={t('blockText')}
            onClick={event => {
              const rect = event.currentTarget.getBoundingClientRect()
              setMenu({ x: rect.left, y: rect.bottom + 4 })
            }}
          >+</button>
          <span className={css.mono}>{task.id}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className={css.iconButton} aria-label={t('delete')} onClick={onDelete}>✕</button>
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
    </>
  )
}
