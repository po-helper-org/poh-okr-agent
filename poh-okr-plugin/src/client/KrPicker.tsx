/**
 * Выбор ключевого результата.
 *
 * Меню показывало все цели доски разом — на живом воркспейсе это больше сорока строк,
 * и нужную искали глазами через всю панель. Теперь список закрыт, пока не набран запрос:
 * поле поиска сверху, максимум пять совпадений, подбор — `searchKeyResults` (локальный,
 * без сети, с учётом регистра, «ё» и не переключённой раскладки).
 */
import { useEffect, useRef, useState } from 'react'
import { MIN_QUERY, normalize, searchKeyResults } from '../kr-search.js'
import type { KeyResult } from '../model.js'
import { Icon } from './icons.js'
import type { OkrLocaleKey } from './locales.js'
import { PopoverItem } from './Popover.js'
import { classNames as css } from './styles.js'

export interface KrPickerProps {
  krs: KeyResult[]
  /** Уже выбранные цели: отмечаются галочкой, когда попадают в выдачу. */
  selected: readonly string[]
  t: (key: OkrLocaleKey) => string
  /** `null` — снять привязку. */
  onPick: (krId: string | null) => void
  onImport: () => void
}

export function KrPicker({ krs, selected, t, onPick, onImport }: KrPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')

  // Фокус ставится кадром позже, а не атрибутом `autoFocus`: слой всплывает по нажатию
  // указателя, и фокус на этом же кадре забирает кнопка-якорь — поле оставалось пустым,
  // сколько ни печатай.
  useEffect(() => {
    const id = requestAnimationFrame(() => { inputRef.current?.focus() })
    return () => { cancelAnimationFrame(id) }
  }, [])
  const tooShort = normalize(query).length < MIN_QUERY
  const found = tooShort ? [] : searchKeyResults(krs, query)

  return (
    <>
      <input
        ref={inputRef}
        className={css.pickerInput}
        value={query}
        placeholder={t('krSearch')}
        onChange={event => { setQuery(event.target.value) }}
        onKeyDown={event => {
          // Enter выбирает первое совпадение: набрал три буквы — и готово, без мыши.
          if (event.key === 'Enter' && found.length > 0) {
            event.preventDefault()
            onPick(found[0].id)
          }
        }}
      />

      <PopoverItem
        glyph={<Icon name="ban" size={15} />}
        label={t('krNone')}
        selected={selected.length === 0}
        onSelect={() => { onPick(null) }}
      />

      {tooShort && <div className={css.pickerHint}>{t('krSearchHint')}</div>}
      {!tooShort && found.length === 0 && <div className={css.pickerHint}>{t('krNothing')}</div>}

      {found.map(kr => (
        <PopoverItem
          key={kr.id}
          selected={selected.includes(kr.id)}
          glyph={<Icon name="inbox" size={15} />}
          label={kr.title}
          sub={kr.id}
          onSelect={() => { onPick(kr.id) }}
        />
      ))}

      {/* Настоящие цели PO живут в нексусах воркспейса, а плагин управляет задачами
          Backlog.md. Перенос предлагается, когда целей нет вовсе или запрос ничего не
          нашёл: иначе непонятно, почему меню пустует. */}
      {(krs.length === 0 || (!tooShort && found.length === 0)) && (
        <PopoverItem
          glyph={<Icon name="weekAhead" size={15} />}
          label={t('importKrs')}
          sub={t('importKrsHint')}
          onSelect={onImport}
        />
      )}
    </>
  )
}
