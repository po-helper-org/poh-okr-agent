/**
 * Быстрый ввод задачи — постоянная строка вверху панели.
 *
 * По умолчанию одна строка: набранное идёт в название, Enter заводит задачу. Расширенный
 * режим со вторым полем и рядом свойств открывается только по Shift+Enter — раскрытие по
 * фокусу заставляло панель прыгать от случайного клика мимо списка.
 *
 * Команды: «/» открывает меню свойств, «!» — сразу приоритет. Символ команды убирается из
 * текста, он служил только вызовом меню.
 */
import { useRef, useState } from 'react'
import type { KeyResult, Priority, PoTaskKind } from '../model.js'
import { PO_TASK_KINDS } from '../model.js'
import { Icon, PriorityFlag } from './icons.js'
import type { OkrLocaleKey } from './locales.js'
import { Popover, PopoverItem } from './Popover.js'
import { Calendar } from './Calendar.js'
import { classNames as css, dueLabel } from './styles.js'

export interface ComposerDraft {
  title: string
  description: string
  dueDate: string | null
  priority: Priority | null
  kind: PoTaskKind | null
  krId: string | null
}

export interface ComposerProps {
  t: (key: OkrLocaleKey) => string
  /** Вкладка панели: она же тип по умолчанию. */
  tab: PoTaskKind
  /** Ключевые результаты доски — из них наполняется меню привязки. */
  krs: KeyResult[]
  onSubmit: (draft: ComposerDraft) => void
  /** Перенос настоящих OKR из нексусов воркспейса в Backlog.md. */
  onImportKrs: () => void
}

type OpenMenu = 'commands' | 'priority' | 'date' | 'kind' | 'kr' | null

const PRIORITIES: ReadonlyArray<{ id: Priority | 'none'; key: OkrLocaleKey }> = [
  { id: 'high', key: 'priorityHigh' },
  { id: 'medium', key: 'priorityMedium' },
  { id: 'low', key: 'priorityLow' },
  { id: 'none', key: 'priorityNone' },
]

const KIND_LABEL: Readonly<Record<PoTaskKind, OkrLocaleKey>> = {
  task: 'tabTasks',
  control: 'tabControl',
  risk: 'tabRisks',
}

const EMPTY: ComposerDraft = {
  title: '', description: '', dueDate: null, priority: null, kind: null, krId: null,
}

export function Composer({ t, tab, krs, onSubmit, onImportKrs }: ComposerProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  /** Позиция символа команды: при выборе пункта его надо убрать из названия. */
  const triggerAt = useRef<number | null>(null)

  const [draft, setDraft] = useState<ComposerDraft>(EMPTY)
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState<OpenMenu>(null)

  const kind = draft.kind ?? tab
  const anchorRect = () => anchorRef.current?.getBoundingClientRect() ?? null

  const closeMenu = () => { setMenu(null) }

  /** Убирает символ команды из названия. */
  const dropTrigger = () => {
    const at = triggerAt.current
    triggerAt.current = null
    if (at === null) return
    setDraft(current => {
      const symbol = current.title[at]
      if (symbol !== '/' && symbol !== '!') return current
      return { ...current, title: current.title.slice(0, at) + current.title.slice(at + 1) }
    })
  }

  const reset = () => {
    setDraft(EMPTY)
    setOpen(false)
    triggerAt.current = null
    setMenu(null)
  }

  const submit = () => {
    if (draft.title.trim() === '') return
    onSubmit({ ...draft, title: draft.title.trim(), description: draft.description.trim() })
    // Расширенный режим не схлопывается после отправки: заводя несколько задач подряд,
    // человек продолжает пользоваться теми же свойствами.
    setDraft(EMPTY)
    triggerAt.current = null
    setMenu(null)
    titleRef.current?.focus()
  }

  const onTitleChange = (next: string, caret: number) => {
    // Команда распознаётся по только что набранному символу в начале слова: «/» и «!» —
    // обычные знаки, и в середине текста они ничего открывать не должны.
    if (next.length === draft.title.length + 1) {
      const at = caret - 1
      const typed = next[at]
      const before = at === 0 ? ' ' : next[at - 1]
      if ((typed === '/' || typed === '!') && (before === ' ' || before === undefined)) {
        triggerAt.current = at
        anchorRef.current = titleRef.current
        setMenu(typed === '!' ? 'priority' : 'commands')
      }
    }
    setDraft(current => ({ ...current, title: next }))
  }

  const openFrom = (event: { currentTarget: HTMLElement }, next: OpenMenu) => {
    anchorRef.current = event.currentTarget
    setMenu(next)
  }

  const titleInput = (
    <input
      ref={titleRef}
      className={css.composerTitle}
      autoComplete="off"
      placeholder={open ? t('composerTitle') : t('composerCollapsed')}
      value={draft.title}
      onChange={event => { onTitleChange(event.target.value, event.target.selectionStart ?? event.target.value.length) }}
      onKeyDown={event => {
        if (event.key === 'Enter' && event.shiftKey) {
          // Единственный вход в расширенный режим.
          event.preventDefault()
          setOpen(true)
          return
        }
        if (event.key === 'Enter') { event.preventDefault(); submit() }
        if (event.key === 'Escape' && menu === null) { event.preventDefault(); reset() }
      }}
    />
  )

  const dateButton = (
    <button
      type="button"
      className={css.dateBtn}
      data-set={draft.dueDate !== null || undefined}
      onClick={event => { openFrom(event, 'date') }}
    >
      <Icon name="calendar" size={15} />
      {draft.dueDate === null ? t('fieldDue') : dueLabel(draft.dueDate, t)}
    </button>
  )

  return (
    <div className={css.composer} data-open={open || undefined}>
      {open ? titleInput : (
        <div className={css.composerLine}>
          {titleInput}
          {dateButton}
          {/* Шеврон раскрывает расширенный режим. Раньше это была картинка без действия:
              на кнопку жмут, а она не кнопка. */}
          <button
            type="button"
            className={css.iconButton}
            aria-label={t('expand')}
            aria-expanded={false}
            onClick={() => { setOpen(true) }}
          ><Icon name="chevronDown" size={15} /></button>
        </div>
      )}

      {open && (
        <>
          <textarea
            className={css.composerDescription}
            placeholder={t('composerDescription')}
            value={draft.description}
            rows={1}
            onChange={event => {
              const node = event.target
              setDraft(current => ({ ...current, description: node.value }))
              node.style.height = 'auto'
              node.style.height = `${node.scrollHeight}px`
            }}
            onKeyDown={event => {
              // В описании Enter переносит строку; отправляет Cmd/Ctrl+Enter.
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit() }
              if (event.key === 'Escape') { event.preventDefault(); titleRef.current?.focus() }
            }}
          />

          <div className={css.composerLine}>
            <div className={css.composerTools}>
              {dateButton}
              <button
                type="button"
                className={css.iconButton}
                title={t('fieldPriority')}
                data-on={draft.priority !== null || undefined}
                onClick={event => { openFrom(event, 'priority') }}
              ><PriorityFlag priority={draft.priority} size={16} className={css.flag} /></button>
              {/* Ящик — привязка к ключевому результату: операционная задача помогает его достичь. */}
              <button
                type="button"
                className={css.iconButton}
                title={draft.krId === null
                  ? t('fieldKr')
                  : `${t('fieldKr')}: ${krs.find(kr => kr.id === draft.krId)?.title ?? draft.krId}`}
                data-on={draft.krId !== null || undefined}
                onClick={event => { openFrom(event, 'kr') }}
              ><Icon name="inbox" /></button>
              {/* Лейбл — тип записи: задача, договорённость или риск. */}
              <button
                type="button"
                className={css.iconButton}
                title={`${t('fieldKind')}: ${t(KIND_LABEL[kind])}`}
                data-on={draft.kind !== null || undefined}
                onClick={event => { openFrom(event, 'kind') }}
              ><Icon name="tag" /></button>
              <button type="button" className={css.iconButton} title={t('more')}>
                <Icon name="dots" />
              </button>
            </div>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className={css.addBtn}
              disabled={draft.title.trim() === ''}
              onClick={submit}
            >{t('addTask')}</button>
          </div>
        </>
      )}

      {menu !== null && (
        <Popover anchor={anchorRect} onClose={() => { dropTrigger(); closeMenu() }}>
          {menu === 'commands' && (
            <>
              <PopoverItem glyph={<Icon name="calendar" size={15} />} label={t('fieldDue')}
                onSelect={() => { dropTrigger(); setMenu('date') }} />
              <PopoverItem glyph={<PriorityFlag priority={null} size={15} />} label={t('fieldPriority')}
                onSelect={() => { dropTrigger(); setMenu('priority') }} />
              <PopoverItem glyph={<Icon name="inbox" size={15} />} label={t('fieldKr')}
                onSelect={() => { dropTrigger(); setMenu('kr') }} />
              <PopoverItem glyph={<Icon name="tag" size={15} />} label={t('fieldKind')}
                onSelect={() => { dropTrigger(); setMenu('kind') }} />
            </>
          )}

          {menu === 'priority' && PRIORITIES.map(item => (
            <PopoverItem
              key={item.id ?? 'none'}
              selected={(item.id === 'none' ? null : item.id) === draft.priority}
              // «Без приоритета» — тот же флажок серым: четыре уровня различаются цветом,
              // и перечёркнутый круг выпадал из этого ряда.
              glyph={<PriorityFlag priority={item.id === 'none' ? null : item.id} size={15} className={css.flag} />}
              label={t(item.key)}
              onSelect={() => {
                setDraft(current => ({ ...current, priority: item.id === 'none' ? null : item.id as Priority }))
                dropTrigger(); closeMenu()
              }}
            />
          ))}

          {menu === 'kind' && PO_TASK_KINDS.map(item => (
            <PopoverItem
              key={item}
              selected={item === kind}
              glyph={<Icon name="tag" size={15} />}
              label={t(KIND_LABEL[item])}
              onSelect={() => {
                setDraft(current => ({ ...current, kind: item }))
                dropTrigger(); closeMenu()
              }}
            />
          ))}

          {menu === 'kr' && (
            <>
              <PopoverItem glyph={<Icon name="ban" size={15} />} label={t('krNone')}
                selected={draft.krId === null}
                onSelect={() => { setDraft(current => ({ ...current, krId: null })); dropTrigger(); closeMenu() }} />
              {krs.map(kr => (
                <PopoverItem
                  key={kr.id}
                  selected={kr.id === draft.krId}
                  glyph={<Icon name="inbox" size={15} />}
                  label={kr.title}
                  sub={kr.id}
                  onSelect={() => { setDraft(current => ({ ...current, krId: kr.id })); dropTrigger(); closeMenu() }}
                />
              ))}
              {/* Настоящие цели PO живут в нексусах воркспейса, а плагин управляет задачами
                  Backlog.md. Пункт переносит их туда — иначе меню пустует, и непонятно почему. */}
              <PopoverItem
                glyph={<Icon name="weekAhead" size={15} />}
                label={t('importKrs')}
                sub={t('importKrsHint')}
                onSelect={() => { onImportKrs(); dropTrigger(); closeMenu() }}
              />
            </>
          )}

          {menu === 'date' && (
            <Calendar
              value={draft.dueDate}
              t={t}
              onPick={value => {
                setDraft(current => ({ ...current, dueDate: value }))
                dropTrigger(); closeMenu()
              }}
            />
          )}
        </Popover>
      )}
    </div>
  )
}
