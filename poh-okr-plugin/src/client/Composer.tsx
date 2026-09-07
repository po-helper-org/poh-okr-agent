/**
 * Быстрый ввод задачи — постоянная строка вверху панели.
 *
 * Поведение взято из todo-приложений, где заведение задачи стоит одного нажатия:
 * набранный текст по умолчанию идёт в название, Shift+Enter открывает вторую строку под
 * описание, Enter заводит задачу. Команда «/» открывает меню свойств, «!» — сразу приоритет.
 *
 * Свойства ограничены тем, что умеет Backlog.md: срок и приоритет. Вложений, шаблонов и
 * превращения в заметку в нём нет, и предлагать их в меню — обещать несуществующее.
 * Список задавать не нужно: им служит активная вкладка панели.
 */
import { useEffect, useRef, useState } from 'react'
import { Button, IconPlusOutline16, Menu, StateDot, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Priority } from '../model.js'
import { isoDay } from '../po-groups.js'
import type { OkrLocaleKey } from './locales.js'
import { classNames as css } from './styles.js'

export interface ComposerDraft {
  title: string
  description: string
  dueDate: string | null
  priority: Priority | null
}

export interface ComposerProps {
  t: (key: OkrLocaleKey) => string
  /** Заводит задачу. Строка очищается только после успешной отправки в канал. */
  onSubmit: (draft: ComposerDraft) => void
}

/** Что сейчас открыто поверх строки ввода. */
type OpenMenu = 'commands' | 'priority' | 'date' | null

const PRIORITIES: ReadonlyArray<{ id: Priority | 'none'; key: OkrLocaleKey }> = [
  { id: 'high', key: 'priorityHigh' },
  { id: 'medium', key: 'priorityMedium' },
  { id: 'low', key: 'priorityLow' },
  { id: 'none', key: 'priorityNone' },
]

/** Сдвиг от сегодняшнего дня в днях. `null` — снять срок. */
const DATES: ReadonlyArray<{ id: string; key: OkrLocaleKey; days: number | null }> = [
  { id: 'today', key: 'dateToday', days: 0 },
  { id: 'tomorrow', key: 'dateTomorrow', days: 1 },
  { id: 'week', key: 'dateWeek', days: 7 },
  { id: 'none', key: 'dateNone', days: null },
]

function shift(days: number): string {
  const now = new Date()
  return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days))
}

/** `2026-09-19` → `19.09`. Год в строке ввода только шумит. */
function shortDate(iso: string): string {
  const [, month, day] = iso.split('-')
  return month === undefined || day === undefined ? iso : `${day}.${month}`
}

export function Composer({ t, onSubmit }: ComposerProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  /** Позиция символа-команды в названии: при выборе пункта его надо убрать из текста. */
  const triggerAt = useRef<number | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [showDescription, setShowDescription] = useState(false)
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [priority, setPriority] = useState<Priority | null>(null)
  const [menu, setMenu] = useState<OpenMenu>(null)

  useEffect(() => {
    if (showDescription) descriptionRef.current?.focus()
  }, [showDescription])

  const reset = () => {
    setTitle('')
    setDescription('')
    setShowDescription(false)
    setDueDate(null)
    setPriority(null)
    setMenu(null)
    triggerAt.current = null
  }

  const submit = () => {
    if (title.trim() === '') return
    onSubmit({ title: title.trim(), description: description.trim(), dueDate, priority })
    reset()
    titleRef.current?.focus()
  }

  /** Убирает символ команды из названия — он служил только для вызова меню. */
  const dropTrigger = () => {
    const at = triggerAt.current
    triggerAt.current = null
    if (at === null) return
    setTitle(current => (current[at] === '/' || current[at] === '!'
      ? current.slice(0, at) + current.slice(at + 1)
      : current))
  }

  const onTitleChange = (next: string) => {
    // Команда распознаётся по только что набранному символу, а не поиском по всей строке:
    // «/» и «!» — обычные знаки, и в середине текста они ничего открывать не должны.
    if (next.length === title.length + 1) {
      const at = next.length - 1
      const typed = next[at]
      const before = at === 0 ? ' ' : next[at - 1]
      const atWordStart = before === ' ' || before === undefined
      if (typed === '/' && atWordStart) { triggerAt.current = at; setMenu('commands') }
      else if (typed === '!' && atWordStart) { triggerAt.current = at; setMenu('priority') }
    }
    setTitle(next)
  }

  const commandItems: MenuEntry[] = [
    { id: 'date', label: t('fieldDue') },
    { id: 'priority', label: t('fieldPriority') },
  ]

  const priorityItems: MenuEntry[] = PRIORITIES.map(item => ({
    id: item.id,
    label: t(item.key),
    icon: item.id === 'none' ? undefined : <StateDot state={item.id === 'high' ? 'error' : 'warning'} />,
  }))

  const dateItems: MenuEntry[] = DATES.map(item => ({ id: item.id, label: t(item.key) }))

  const onSelect = (id: string) => {
    if (menu === 'commands') {
      dropTrigger()
      setMenu(id === 'date' ? 'date' : 'priority')
      return
    }
    if (menu === 'priority') {
      setPriority(id === 'none' ? null : (id as Priority))
    } else if (menu === 'date') {
      const found = DATES.find(item => item.id === id)
      setDueDate(found === undefined || found.days === null ? null : shift(found.days))
    }
    dropTrigger()
    setMenu(null)
    titleRef.current?.focus()
  }

  const items = menu === 'commands' ? commandItems : menu === 'priority' ? priorityItems : dateItems

  return (
    <div className={css.composer} ref={boxRef} data-active={title !== '' || showDescription || undefined}>
      <input
        ref={titleRef}
        className={css.composerTitle}
        placeholder={t('composerPlaceholder')}
        value={title}
        onChange={event => { onTitleChange(event.target.value) }}
        onKeyDown={event => {
          if (event.key === 'Enter' && event.shiftKey) {
            // Shift+Enter уводит во вторую строку, а не переносит строку в названии:
            // название однострочное по смыслу.
            event.preventDefault()
            setShowDescription(true)
            return
          }
          if (event.key === 'Enter') { event.preventDefault(); submit() }
          if (event.key === 'Escape' && menu === null) { event.preventDefault(); reset() }
        }}
      />

      {showDescription && (
        <textarea
          ref={descriptionRef}
          className={css.composerDescription}
          placeholder={t('composerDescription')}
          value={description}
          onChange={event => { setDescription(event.target.value) }}
          onKeyDown={event => {
            // В описании Enter переносит строку; отправляет Cmd/Ctrl+Enter.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit() }
            if (event.key === 'Escape') { event.preventDefault(); titleRef.current?.focus() }
          }}
        />
      )}

      <div className={css.composerFoot}>
        <Menu
          open={menu !== null}
          portal
          getAnchorRect={() => boxRef.current?.getBoundingClientRect() ?? null}
          anchor={
            <button type="button" className={css.composerChip} onClick={() => { setMenu('date') }}>
              {dueDate === null ? t('fieldDue') : shortDate(dueDate)}
            </button>
          }
          items={items}
          onSelect={onSelect}
          onClose={() => { setMenu(null); dropTrigger() }}
        />

        <button type="button" className={css.composerChip} onClick={() => { setMenu('priority') }}>
          {priority === null
            ? t('fieldPriority')
            : <>
                <StateDot state={priority === 'high' ? 'error' : 'warning'} />
                {t(priority === 'high' ? 'priorityHigh' : priority === 'medium' ? 'priorityMedium' : 'priorityLow')}
              </>}
        </button>

        <span style={{ flex: 1 }} />
        <span className={css.composerHint}>{t('composerHint')}</span>
        <Button
          variant="primary"
          size="sm"
          icon={<IconPlusOutline16 />}
          disabled={title.trim() === ''}
          onClick={submit}
        >{t('addTask')}</Button>
      </div>
    </div>
  )
}
