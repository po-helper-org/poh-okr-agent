/**
 * Карточка объектива.
 *
 * Объектив — такая же сущность с полями, как ключевой результат, просто хранится
 * отдельным файлом milestone: у него есть название, срок и описание. Карточка только
 * показывает их: правка объективов идёт через планирование в чате, как и всё остальное
 * на доске.
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyResult } from '../model.js'
import type { MilestoneCard } from '../milestone-file.js'
import { Icon } from './icons.js'
import type { OkrLocaleKey } from './locales.js'
import { classNames as css, dueLabel } from './styles.js'
import { unwrap, type CallOkr } from './rpc.js'

export interface ObjectiveSheetProps {
  id: string
  title: string
  krs: KeyResult[]
  t: (key: OkrLocaleKey) => string
  call: CallOkr
  onOpenKr: (kr: KeyResult) => void
  onClose: () => void
}

const MIN_WIDTH = 320
const STORAGE_KEY = 'okr-objective-sheet-width'

export function ObjectiveSheet({ id, title, krs, t, call, onOpenKr, onClose }: ObjectiveSheetProps) {
  const sheetRef = useRef<HTMLElement>(null)
  const gripRef = useRef<HTMLDivElement>(null)
  const [card, setCard] = useState<MilestoneCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY))
      return Number.isFinite(stored) && stored >= MIN_WIDTH ? stored : 460
    } catch {
      // Приватное окно или запрет на хранилище — ширина по умолчанию, а не отказ открыться.
      return 460
    }
  })

  useEffect(() => {
    const controller = new AbortController()
    setCard(null)
    setError(null)
    unwrap<MilestoneCard>(call('objective', { id }, controller.signal))
      .then(value => { if (!controller.signal.aborted) setCard(value) })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => { controller.abort() }
  }, [id, call])

  useEffect(() => {
    const grip = gripRef.current
    if (grip === null) return
    let startX = 0
    let startWidth = 0
    const onMove = (event: PointerEvent) => {
      // Карточка прижата к правому краю: движение влево делает её шире.
      setWidth(Math.min(window.innerWidth - 24, Math.max(MIN_WIDTH, startWidth + (startX - event.clientX))))
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
      document.body.style.userSelect = 'none'
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    }
    grip.addEventListener('pointerdown', onDown)
    return () => { grip.removeEventListener('pointerdown', onDown) }
  }, [width])

  return (
    <aside ref={sheetRef} className={css.sheet} style={{ width, right: 0 }} role="dialog" aria-label={title}>
      <div ref={gripRef} className={css.grip} />

      <div className={css.detailHead}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={css.sidebarTag}>{t('objectiveTitle')}</div>
          <div className={css.detailTitle} style={{ paddingBottom: 0 }}>{card?.title ?? title}</div>
        </div>
        <button type="button" className={css.iconButton} aria-label={t('close')} onClick={onClose}>
          <Icon name="chevronRight" />
        </button>
      </div>

      <div className={css.detailBody}>
        {error !== null && <div className={css.stateMessage} role="alert">{error}</div>}

        {card !== null && card.dueDate !== null && (
          <div className={css.field}>
            <span className={css.fieldLabel}>{t('fieldDue')}</span>
            <span>{dueLabel(card.dueDate, t)}</span>
          </div>
        )}

        {card !== null && card.description !== '' && (
          <div className={css.field}>
            <span className={css.fieldLabel}>{t('fieldDescription')}</span>
            <span style={{ whiteSpace: 'pre-wrap' }}>{card.description}</span>
          </div>
        )}

        <div className={css.field}>
          <span className={css.fieldLabel}>{`${t('krCount')} · ${krs.length}`}</span>
        </div>
        <div className={css.sectionCard}>
          {krs.map(kr => (
            <button key={kr.id} type="button" className={css.item} onClick={() => { onOpenKr(kr) }}>
              <span className={css.rowMain}>
                <span className={css.itemTitle}>{kr.title}</span>
                <span className={`${css.rowMeta} ${css.mono}`}>{kr.id}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  )
}
