/**
 * Календарь выбора срока.
 *
 * Свой, а не компонент брендбука: календаря в нём нет. Показывает то, что умеет хранить
 * Backlog.md, — календарный день. Времени, напоминания и повтора здесь нет намеренно:
 * у срока в Backlog.md нет ни времени, ни часового пояса, и такие поля обещали бы то,
 * чего хранилище не умеет.
 */
import { useState } from 'react'
import { isoDay } from '../po-groups.js'
import { Icon, type IconName } from './icons.js'
import type { OkrLocaleKey } from './locales.js'
import { classNames as css } from './styles.js'

export interface CalendarProps {
  value: string | null
  t: (key: OkrLocaleKey) => string
  onPick: (value: string | null) => void
}

const MONTHS: OkrLocaleKey[] = [
  'monthJan', 'monthFeb', 'monthMar', 'monthApr', 'monthMay', 'monthJun',
  'monthJul', 'monthAug', 'monthSep', 'monthOct', 'monthNov', 'monthDec',
]
const DOW: OkrLocaleKey[] = ['dowMon', 'dowTue', 'dowWed', 'dowThu', 'dowFri', 'dowSat', 'dowSun']

const QUICK: ReadonlyArray<{ icon: IconName; key: OkrLocaleKey; days: number | null }> = [
  { icon: 'sun', key: 'dateToday', days: 0 },
  { icon: 'sunrise', key: 'dateTomorrow', days: 1 },
  { icon: 'weekAhead', key: 'dateWeek', days: 7 },
  { icon: 'ban', key: 'dateNone', days: null },
]

function shift(days: number): string {
  const now = new Date()
  return isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days))
}

export function Calendar({ value, t, onPick }: CalendarProps) {
  const today = isoDay(new Date())
  const [selected, setSelected] = useState(value)
  const [cursor, setCursor] = useState(() => (value === null ? new Date() : new Date(value)))

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  // Неделя начинается с понедельника, а getDay() отдаёт воскресенье нулём.
  const lead = (new Date(year, month, 1).getDay() + 6) % 7
  const start = new Date(year, month, 1 - lead)

  const days = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    return { date, value: isoDay(date), outside: date.getMonth() !== month }
  })

  return (
    <div className={css.cal}>
      <div className={css.calQuick}>
        {QUICK.map(item => (
          <button
            key={item.key}
            type="button"
            title={t(item.key)}
            onClick={() => { onPick(item.days === null ? null : shift(item.days)) }}
          >
            <Icon name={item.icon} size={18} />
            {t(item.key)}
          </button>
        ))}
      </div>

      <div className={css.calHead}>
        <div className={css.calMonth}>{`${t(MONTHS[month])} ${year}`}</div>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('monthPrev')}
          onClick={() => { setCursor(new Date(year, month - 1, 1)) }}
        ><Icon name="chevronLeft" /></button>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('monthNext')}
          onClick={() => { setCursor(new Date(year, month + 1, 1)) }}
        ><Icon name="chevronRight" /></button>
      </div>

      <div className={css.calGrid}>
        {DOW.map(key => <div key={key} className={css.calDow}>{t(key)}</div>)}
        {days.map(day => (
          <button
            key={day.value}
            type="button"
            className={css.calDay}
            data-out={day.outside || undefined}
            data-today={day.value === today || undefined}
            data-sel={day.value === selected || undefined}
            onClick={() => { setSelected(day.value) }}
          >{day.date.getDate()}</button>
        ))}
      </div>

      <div className={css.calFoot}>
        <button type="button" onClick={() => { onPick(null) }}>{t('clear')}</button>
        <button type="button" data-primary onClick={() => { onPick(selected) }}>{t('done')}</button>
      </div>
    </div>
  )
}
