/**
 * Всплывающий слой, привязанный к элементу.
 *
 * Свой, а не `Menu` брендбука: у меню харнесса содержимое — только строки списка, а нам
 * нужно класть внутрь календарь. Позиционирование и закрытие устроены так же: портал в
 * `body`, фиксированные координаты от прямоугольника якоря, закрытие по клику снаружи и Esc.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { classNames as css } from './styles.js'

export interface PopoverProps {
  /** Прямоугольник якоря. Функцией, а не значением: он меняется при прокрутке панели. */
  anchor: () => DOMRect | null
  onClose: () => void
  children: ReactNode
}

const GAP = 6
const EDGE = 8

export function Popover({ anchor, onClose, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  // Слой измеряется после отрисовки: до неё его размеры неизвестны, а от них зависит,
  // хватает ли места снизу. Поэтому первый кадр он держится невидимым.
  useLayoutEffect(() => {
    const node = ref.current
    const rect = anchor()
    if (node === null || rect === null) return
    const width = node.offsetWidth
    const height = node.offsetHeight
    const left = Math.max(EDGE, Math.min(rect.left, window.innerWidth - width - EDGE))
    const below = rect.bottom + GAP
    const top = below + height > window.innerHeight - EDGE
      ? Math.max(EDGE, rect.top - height - GAP)
      : below
    setPosition({ left, top })
  }, [anchor])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
    }
    const onPointer = (event: PointerEvent) => {
      const node = ref.current
      if (node !== null && !node.contains(event.target as Node)) onClose()
    }
    // `capture` у указателя: иначе клик по кнопке-якорю сперва переоткрыл бы слой,
    // и он мигал бы вместо закрытия.
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className={css.pop}
      style={position === null
        ? { left: 0, top: 0, visibility: 'hidden' }
        : { left: position.left, top: position.top }}
      role="dialog"
    >{children}</div>,
    document.body,
  )
}

/** Строка меню внутри слоя. */
export function PopoverItem(
  { glyph, label, sub, selected, onSelect }:
  { glyph?: ReactNode; label: ReactNode; sub?: string; selected?: boolean; onSelect: () => void },
) {
  return (
    <button
      type="button"
      className={css.popItem}
      data-selected={selected === true || undefined}
      aria-current={selected === true || undefined}
      onClick={onSelect}
    >
      {glyph !== undefined && <span className={css.popGlyph}>{glyph}</span>}
      <span>
        {label}
        {sub !== undefined && <span className={css.popSub}>{sub}</span>}
      </span>
    </button>
  )
}
