/**
 * Иконки раздела.
 *
 * Часть берётся из набора харнесса — он и есть брендбук. Флажка приоритета, метки и ящика
 * в нём нет вовсе (проверено по экспорту `dsh-client-ui-primitives`), поэтому они нарисованы
 * здесь в той же манере: контур 16×16, толщина 1.4, скруглённые концы. Заводить ради трёх
 * значков стороннюю библиотеку значило бы тащить в бандл шрифт или спрайт ради трёх путей.
 */
import type { ReactNode } from 'react'

const PATHS = {
  calendar: 'M3 6.2h10M4.6 3.2v2M11.4 3.2v2M3 5.2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  flag: 'M4 13.5V3M4 3.6h7.2l-1.6 2.6 1.6 2.6H4',
  inbox: 'M2.6 8h3l.9 1.6h3l.9-1.6h3M2.6 8l1.8-4.4h7.2L13.4 8v4a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1z',
  tag: 'M7.6 2.6H13v5.4l-5.6 5.6a1 1 0 0 1-1.4 0L2.6 10a1 1 0 0 1 0-1.4zM10.6 5.4h.01',
  note: 'M4 4.4h8M4 7.4h8M4 10.4h5',
  ban: 'M8 2.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 8 2.4M4.2 4.2l7.6 7.6',
  sun: 'M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6M8 1.6v1.4M8 13v1.4M2.6 8H1.2M14.8 8h-1.4M4.2 4.2l-1-1M12.8 12.8l-1-1M4.2 11.8l-1 1M12.8 3.2l-1 1',
  sunrise: 'M2 12.4h12M5.2 9.6a2.8 2.8 0 0 1 5.6 0M8 2v3.2M4.4 5.2l1 1M11.6 5.2l-1 1',
  weekAhead: 'M3 6.2h10M3 5.2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM6.2 9.6h3.6M8 7.8v3.6',
  chevronDown: 'M4.5 6.5L8 10l3.5-3.5',
  chevronLeft: 'M10 3.5L5.5 8l4.5 4.5',
  chevronRight: 'M6 3.5L10.5 8 6 12.5',
  dots: 'M4 8h.01M8 8h.01M12 8h.01',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/**
 * Флажок приоритета: высокий и средний залиты, низкий контурный.
 * Заливка отличает их быстрее цвета — на мелком значке оттенок читается хуже формы.
 */
export function PriorityFlag({ priority, size = 14 }: { priority: string | null; size?: number }): ReactNode {
  const filled = priority === 'high' || priority === 'medium'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS.flag} />
    </svg>
  )
}
