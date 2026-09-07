/**
 * Сайдбар задачи.
 *
 * Открывается слева от панели, а не модалкой поверх неё: модалка закрывает ровно тот
 * список, по которому в этот момент и ориентируются. Ширина тянется за левую границу
 * и запоминается.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BlockType } from '../markdown-blocks.js'
import type { KeyResult, PoTask, PoTaskKind, Priority } from '../model.js'
import { PO_TASK_KINDS } from '../model.js'
import { BLOCK_TYPES } from '../markdown-blocks.js'
import { BlockEditor } from './BlockEditor.js'
import { Calendar } from './Calendar.js'
import { Icon, PriorityFlag } from './icons.js'
import type { OkrLocaleKey } from './locales.js'
import { Popover, PopoverItem } from './Popover.js'
import { classNames as css, dueLabel } from './styles.js'

export interface TaskSheetProps {
  task: PoTask
  /** Описание в markdown. `null` — ещё грузится. */
  content: string | null
  krs: KeyResult[]
  t: (key: OkrLocaleKey) => string
  onRename: (title: string) => void
  onToggleDone: () => void
  onSetDue: (value: string | null) => void
  onSetPriority: (value: Priority | null) => void
  onSetKind: (value: PoTaskKind) => void
  onSetKr: (value: string | null) => void
  /** Идентификатор передаётся явно: к моменту сохранения открыта может быть уже другая задача. */
  onSaveContent: (taskId: string, markdown: string) => void
  onDelete: () => void
  onClose: () => void
  onImportKrs: () => void
}

type OpenMenu = 'date' | 'priority' | 'kind' | 'kr' | 'blocks' | null

const PRIORITIES: ReadonlyArray<{ id: Priority | 'none'; key: OkrLocaleKey }> = [
  { id: 'high', key: 'priorityHigh' },
  { id: 'medium', key: 'priorityMedium' },
  { id: 'low', key: 'priorityLow' },
  { id: 'none', key: 'priorityNone' },
]
const KIND_LABEL: Readonly<Record<PoTaskKind, OkrLocaleKey>> = {
  task: 'tabTasks', control: 'tabControl', risk: 'tabRisks',
}
const BLOCK_LABEL: Readonly<Record<BlockType, OkrLocaleKey>> = {
  text: 'blockText', h1: 'blockH1', h2: 'blockH2', h3: 'blockH3',
  bullet: 'blockBulleted', number: 'blockNumbered', todo: 'blockCheck',
  quote: 'blockQuote', divider: 'blockDivider',
}
const BLOCK_GLYPH: Readonly<Record<BlockType, string>> = {
  text: 'T', h1: 'H1', h2: 'H2', h3: 'H3', bullet: '•', number: '1.',
  todo: '☑', quote: '❝', divider: '—',
}

const MIN_WIDTH = 320
const STORAGE_KEY = 'okr-task-sheet-width'

export function TaskSheet(props: TaskSheetProps) {
  const { task, content, krs, t } = props
  const gripRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  const blockApply = useRef<((type: BlockType) => void) | null>(null)
  /**
   * Черновик описания и его исходник — оба с идентификатором задачи.
   *
   * Без идентификатора сохранение при уходе с задачи записывало текст в соседнюю: уборка
   * эффекта срабатывает уже после перерисовки под новую задачу, и «текущий» идентификатор
   * к этому моменту — чужой. Один раз это молча перенесло описание между задачами.
   */
  const draftRef = useRef<{ id: string; markdown: string } | null>(null)
  const baselineRef = useRef<{ id: string; text: string } | null>(null)

  const [menu, setMenu] = useState<OpenMenu>(null)
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY))
      return Number.isFinite(stored) && stored >= MIN_WIDTH ? stored : 520
    } catch {
      // Приватное окно или запрет на хранилище — ширина по умолчанию, а не отказ открыться.
      return 520
    }
  })

  /**
   * Ширина ужимается до свободного места слева от панели.
   *
   * Панель прижата к правому краю, сайдбар встаёт левее неё: на узком окне сумма ширин
   * превышала экран, и сайдбар уезжал за левый край вместе со своей ручкой — вернуть его
   * мышью было уже нечем.
   */
  useEffect(() => {
    const fit = () => {
      const panel = document.querySelector(`.${css.panel}`)?.getBoundingClientRect().width ?? 0
      const room = Math.max(MIN_WIDTH, window.innerWidth - panel - 24)
      setWidth(current => Math.min(current, room))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => { window.removeEventListener('resize', fit) }
  }, [])

  const today = new Date().toISOString().slice(0, 10)
  const done = task.status.toLowerCase() === 'done'
  const overdue = !done && task.dueDate !== undefined && task.dueDate <= today
  const krTitle = krs.find(kr => kr.id === task.relatedKrIds[0])?.title

  const anchorRect = useCallback(() => anchorRef.current?.getBoundingClientRect() ?? null, [])
  const openFrom = (event: { currentTarget: HTMLElement }, next: OpenMenu) => {
    anchorRef.current = event.currentTarget
    setMenu(next)
  }

  // Растягивание. Панель прижата к правому краю, поэтому движение влево увеличивает ширину.
  useEffect(() => {
    const grip = gripRef.current
    if (grip === null) return
    let startX = 0
    let startWidth = 0

    const onMove = (event: PointerEvent) => {
      const room = window.innerWidth - 24
      setWidth(Math.min(room, Math.max(MIN_WIDTH, startWidth + (startX - event.clientX))))
    }
    const onUp = () => {
      grip.removeAttribute('data-dragging')
      document.body.style.userSelect = ''
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      try {
        const current = sheetRef.current?.getBoundingClientRect().width
        if (current !== undefined) window.localStorage.setItem(STORAGE_KEY, String(Math.round(current)))
      } catch { /* см. чтение ширины выше */ }
    }
    const onDown = (event: PointerEvent) => {
      event.preventDefault()
      startX = event.clientX
      startWidth = sheetRef.current?.getBoundingClientRect().width ?? width
      grip.setAttribute('data-dragging', '')
      // Иначе при перетаскивании выделяется текст всей страницы.
      document.body.style.userSelect = 'none'
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    }

    grip.addEventListener('pointerdown', onDown)
    return () => { grip.removeEventListener('pointerdown', onDown) }
  }, [width])

  // Исходник запоминается вместе с идентификатором, как только описание загрузилось.
  useEffect(() => {
    if (content !== null) baselineRef.current = { id: task.id, text: content }
  }, [task.id, content])

  const persist = () => {
    const draft = draftRef.current
    const baseline = baselineRef.current
    draftRef.current = null
    if (draft === null || baseline === null) return
    // Сохраняем только то, что правили у этой же задачи: рассинхрон означает, что сайдбар
    // уже переключился, и запись ушла бы не туда.
    if (draft.id !== baseline.id || draft.markdown === baseline.text) return
    props.onSaveContent(draft.id, draft.markdown)
  }

  /**
   * Сохранение описания при уходе с задачи.
   *
   * Раньше оно происходило только по кнопке закрытия, и переключение на соседнюю строку
   * списка теряло правку молча: сайдбар просто перерисовывался под другую задачу. Ссылка
   * на актуальный `persist` держится отдельно, потому что эффект уборки видит замыкание
   * того рендера, в котором был создан, — а в нём ещё нет только что набранного текста.
   */
  const persistRef = useRef(persist)
  persistRef.current = persist
  useEffect(() => () => { persistRef.current() }, [task.id])

  const close = () => { persist(); props.onClose() }

  return (
    <aside
      ref={sheetRef}
      className={css.sheet}
      style={{ width, right: 'var(--okr-panel-width, 420px)' }}
      role="dialog"
      aria-label={task.title}
    >
      <div ref={gripRef} className={css.grip} />

      <div className={css.detailHead}>
        <button
          type="button"
          className={css.itemCheck}
          data-kind={task.kind}
          data-done={done || undefined}
          data-overdue={overdue || undefined}
          aria-pressed={done}
          aria-label={task.title}
          onClick={props.onToggleDone}
        />
        <button
          type="button"
          className={css.dateBtn}
          data-set={task.dueDate !== undefined || undefined}
          onClick={event => { openFrom(event, 'date') }}
        >
          <Icon name="calendar" size={15} />
          {task.dueDate === undefined ? t('fieldDue') : dueLabel(task.dueDate, t)}
        </button>
        <button
          type="button"
          className={css.iconButton}
          title={t('fieldPriority')}
          data-on={task.priority !== null || undefined}
          onClick={event => { openFrom(event, 'priority') }}
        ><PriorityFlag priority={task.priority} size={16} className={css.flag} /></button>
        <span style={{ flex: 1 }} />
        <button type="button" className={css.iconButton} aria-label={t('close')} onClick={close}>
          <Icon name="chevronRight" />
        </button>
      </div>

      <div className={css.detailBody}>
        <div
          className={css.detailTitle}
          contentEditable
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={event => {
            const next = event.currentTarget.textContent?.trim() ?? ''
            if (next !== '' && next !== task.title) props.onRename(next)
            else event.currentTarget.textContent = task.title
          }}
        >{task.title}</div>

        {content !== null && (
          <BlockEditor
            value={content}
            placeholder={t('editorPlaceholder')}
            onChange={markdown => { draftRef.current = { id: task.id, markdown } }}
            onCommand={(anchor, apply) => {
              anchorRef.current = anchor
              blockApply.current = apply
              setMenu('blocks')
            }}
          />
        )}
      </div>

      <div className={css.detailFoot}>
        <button
          type="button"
          className={css.iconButton}
          title={krTitle === undefined ? t('fieldKr') : `${t('fieldKr')}: ${krTitle}`}
          data-on={task.relatedKrIds.length > 0 || undefined}
          onClick={event => { openFrom(event, 'kr') }}
        ><Icon name="inbox" /></button>
        <button
          type="button"
          className={css.iconButton}
          title={`${t('fieldKind')}: ${t(KIND_LABEL[task.kind])}`}
          onClick={event => { openFrom(event, 'kind') }}
        ><Icon name="tag" /></button>
        <span className={css.mono}>{task.id}</span>
        {krTitle !== undefined && (
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {`· ${krTitle}`}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('delete')}
          onClick={() => { props.onDelete() }}
        >✕</button>
      </div>

      {menu !== null && (
        <Popover anchor={anchorRect} onClose={() => { setMenu(null) }}>
          {menu === 'date' && (
            <Calendar value={task.dueDate ?? null} t={t}
              onPick={value => { props.onSetDue(value); setMenu(null) }} />
          )}
          {/* «Без приоритета» здесь нет: у Backlog.md нет значения «никакой», и пункт,
              который ничего не делает, хуже отсутствующего. */}
          {menu === 'priority' && PRIORITIES.filter(item => item.id !== 'none').map(item => (
            <PopoverItem
              key={item.id ?? 'none'}
              selected={item.id === task.priority}
              // «Без приоритета» — тот же флажок серым: четыре уровня различаются цветом,
              // и перечёркнутый круг выпадал из этого ряда.
              glyph={<PriorityFlag priority={item.id === 'none' ? null : item.id} size={15} className={css.flag} />}
              label={t(item.key)}
              onSelect={() => { props.onSetPriority(item.id === 'none' ? null : item.id as Priority); setMenu(null) }}
            />
          ))}
          {menu === 'kind' && PO_TASK_KINDS.map(item => (
            <PopoverItem key={item} selected={item === task.kind} glyph={<Icon name="tag" size={15} />}
              label={t(KIND_LABEL[item])}
              onSelect={() => { props.onSetKind(item); setMenu(null) }} />
          ))}
          {menu === 'kr' && (
            <>
              <PopoverItem glyph={<Icon name="ban" size={15} />} label={t('krNone')}
                selected={task.relatedKrIds.length === 0}
                onSelect={() => { props.onSetKr(null); setMenu(null) }} />
              {krs.map(kr => (
                <PopoverItem key={kr.id} selected={task.relatedKrIds.includes(kr.id)}
                  glyph={<Icon name="inbox" size={15} />} label={kr.title} sub={kr.id}
                  onSelect={() => { props.onSetKr(kr.id); setMenu(null) }} />
              ))}
              <PopoverItem glyph={<Icon name="weekAhead" size={15} />} label={t('importKrs')}
                sub={t('importKrsHint')}
                onSelect={() => { props.onImportKrs(); setMenu(null) }} />
            </>
          )}
          {menu === 'blocks' && BLOCK_TYPES.map(type => (
            <PopoverItem
              key={type}
              glyph={BLOCK_GLYPH[type]}
              label={t(BLOCK_LABEL[type])}
              onSelect={() => { blockApply.current?.(type); setMenu(null) }}
            />
          ))}
        </Popover>
      )}
    </aside>
  )
}
