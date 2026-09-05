/**
 * Детальная страница ключевого результата: граф связей слева, лента событий справа.
 *
 * Узлы графа рисуются только для заполненных данных (требование D-04): пустой узел
 * «Confluence» без ссылки не сообщает ничего, кроме того, что поле не заполнено, — а место
 * занимает и мешает читать остальные связи. Стадии без планового спринта показываются
 * приглушёнными: они часть модели, но работа по ним не запланирована.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { PHASES, type KeyResult } from '../model.js'
import { parsePlan } from '../plan-block.js'
import { decodeEvent, encodeEvent, eventTypes, sortEvents, type OkrEvent } from '../event-note.js'
import type { RawTaskDetail } from '../backlog-json.js'
import { layoutAround, type Point } from './graph.js'
import type { OkrLocaleKey } from './locales.js'
import { classNames as css, PHASE_COLORS } from './styles.js'
import { unwrap, type CallOkr } from './rpc.js'

export interface DetailPageProps {
  kr: KeyResult
  objectiveTitle: string
  detail: RawTaskDetail
  t: (key: OkrLocaleKey) => string
  call: CallOkr
  reload: () => void
  onBack: () => void
}

interface GraphNode {
  label: string
  sub?: string
  color?: string
  muted?: boolean
}

/** Узлы графа: только то, для чего есть данные. */
function buildNodes(kr: KeyResult, objectiveTitle: string, detail: RawTaskDetail, t: (k: OkrLocaleKey) => string): GraphNode[] {
  const plan = parsePlan(detail.implementationPlan)
  const nodes: GraphNode[] = []

  if (objectiveTitle !== '') nodes.push({ label: objectiveTitle })

  for (const phase of PHASES) {
    const sprint = plan.stages[phase].sprint
    nodes.push({
      label: phase,
      sub: sprint === null ? undefined : `S${sprint + 1}`,
      color: sprint === null ? undefined : PHASE_COLORS[phase].fg,
      muted: sprint === null,
    })
  }

  const confluence = detail.documentation[0]
  if (confluence) nodes.push({ label: t('fieldConfluence'), sub: hostOf(confluence) })
  const epic = detail.references[0]
  if (epic) nodes.push({ label: t('fieldJira'), sub: hostOf(epic) })
  if (plan.teams !== '') nodes.push({ label: t('fieldTeams'), sub: plan.teams })
  if (plan.techLeads !== '') nodes.push({ label: t('fieldTechLeads'), sub: plan.techLeads })
  if (plan.executors !== '') nodes.push({ label: t('fieldExecutors'), sub: plan.executors })
  if (kr.dueDate) nodes.push({ label: t('fieldDue'), sub: kr.dueDate })

  return nodes
}

/** Хост ссылки как подпись узла. Битый адрес — не повод падать, показываем как есть. */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url.slice(0, 24)
  }
}

export function DetailPage({ kr, objectiveTitle, detail: initial, t, call, reload, onBack }: DetailPageProps) {
  /**
   * Карточка, из которой рисуются граф и лента.
   *
   * Своё состояние, а не проп напрямую: карточка приезжает сюда снимком в момент перехода
   * с доски, и после записи события её надо перечитать. Общий `reload` этого не делает —
   * он обновляет доску, а не открытый снимок.
   */
  const [detail, setDetail] = useState(initial)
  useEffect(() => { setDetail(initial) }, [initial])

  const paneRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [editing, setEditing] = useState<OkrEvent | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Раскладка графа считается от фактического размера области, а не от предположения о нём:
  // панель событий фиксированной ширины, и на узком экране места слева остаётся заметно меньше.
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(pane)
    return () => { observer.disconnect() }
  }, [])

  const nodes = useMemo(
    () => buildNodes(kr, objectiveTitle, detail, t),
    [kr, objectiveTitle, detail, t],
  )
  const points: Point[] = useMemo(
    () => (size.width > 0 && size.height > 0 ? layoutAround(nodes.length, size) : []),
    [nodes.length, size],
  )

  const events = useMemo(() => sortEvents(detail.comments.map(decodeEvent)), [detail.comments])
  const types = useMemo(() => eventTypes(events), [events])
  const visible = events.filter(event => !hidden.has(event.type))

  const addEvent = (type: string, title: string, note: string) => {
    unwrap(call('addEvent', { id: kr.id, text: encodeEvent(type, title, note) }))
      // Лента живёт в карточке, поэтому её перечитываем здесь же: без этого событие
      // записалось бы в Backlog.md и не появилось на экране до возврата на доску.
      .then(() => unwrap<RawTaskDetail>(call('task', { id: kr.id })))
      .then(fresh => { setDetail(fresh); setEditing(null); reload() })
      .catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)) })
  }

  return (
    <div className={css.screen}>
      <div className={css.detailTop}>
        <button type="button" className={css.iconButton} onClick={onBack} aria-label={t('back')}>←</button>
        <div className={css.headerTitle}>{kr.title}</div>
      </div>

      {error !== null && <div className={css.stateMessage}>{error}</div>}

      <div className={css.detailMain}>
        <div className={css.graphPane} ref={paneRef}>
          {size.width > 0 && (
            <svg width={size.width} height={size.height} style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
              {points.map((point, index) => (
                <line
                  key={index}
                  x1={size.width / 2}
                  y1={size.height / 2}
                  x2={point.x}
                  y2={point.y}
                  stroke="currentColor"
                  strokeOpacity={nodes[index].muted ? 0.12 : 0.28}
                />
              ))}
            </svg>
          )}
          <div className={css.graphCenter} style={{ left: size.width / 2, top: size.height / 2 }}>
            {kr.title}
          </div>
          {points.map((point, index) => {
            const node = nodes[index]
            return (
              <div
                key={index}
                className={node.muted ? `${css.graphNode} ${css.graphMuted}` : css.graphNode}
                style={{
                  left: point.x,
                  top: point.y,
                  ...(node.color ? { borderColor: node.color, color: node.color } : {}),
                }}
              >
                {node.label}
                {node.sub !== undefined && <span className={`${css.graphNodeSub} ${css.mono}`}>{node.sub}</span>}
              </div>
            )
          })}
        </div>

        <div className={css.eventsPane}>
          <div className={css.eventsFilter}>
            {types.map(type => (
              <button
                key={type}
                type="button"
                className={css.chip}
                data-active={!hidden.has(type) || undefined}
                onClick={() => {
                  const next = new Set(hidden)
                  if (next.has(type)) next.delete(type)
                  else next.add(type)
                  setHidden(next)
                }}
              >{type}</button>
            ))}
          </div>

          <div className={css.eventsList}>
            {visible.length === 0 && <div className={css.stateBlock}><span className={css.stateTitle}>{t('emptyEvents')}</span></div>}
            {visible.map(event => (
              <button key={event.index} type="button" className={css.event} onClick={() => { setEditing(event) }}>
                <span className={`${css.eventDate} ${css.mono}`}>{event.date}{event.author && ` · ${event.author}`}</span>
                {event.type !== '' && <span className={css.eventType}>{event.type}</span>}
                <span className={css.eventTitle}>{event.title}</span>
              </button>
            ))}
          </div>

          <div className={css.addRow}>
            <button
              type="button"
              className={css.addButton}
              onClick={() => { setEditing({ index: -1, date: '', author: '', type: '', title: '', note: '' }) }}
            >+&nbsp;&nbsp;{t('addEvent')}</button>
          </div>
        </div>
      </div>

      {editing !== null && (
        <EventPopup
          event={editing}
          t={t}
          onClose={() => { setEditing(null) }}
          onSave={addEvent}
        />
      )}
    </div>
  )
}

/**
 * Попап события.
 *
 * Существующее событие открывается только на чтение: комментарий Backlog.md после записи
 * не редактируется и не удаляется его CLI. Показывать кнопки, которые ничего не сделают,
 * хуже, чем не показывать их вовсе, — поэтому у прочитанного события их нет.
 */
function EventPopup(
  { event, t, onClose, onSave }:
  { event: OkrEvent; t: (k: OkrLocaleKey) => string; onClose: () => void; onSave: (type: string, title: string, note: string) => void },
) {
  const isNew = event.index === -1
  const [type, setType] = useState(event.type)
  const [title, setTitle] = useState(event.title)
  const [note, setNote] = useState(event.note)

  return (
    <>
      <div className={css.backdrop} onClick={onClose} />
      <div className={css.popup} role="dialog">
        <div className={css.popupHead}>
          <span className={`${css.eventDate} ${css.mono}`}>{event.date}</span>
          <div className={css.popupTitle}>{isNew ? t('addEvent') : event.title}</div>
          <button type="button" className={css.iconButton} onClick={onClose} aria-label={t('close')}>✕</button>
        </div>
        <div className={css.popupBody}>
          {isNew ? (
            <>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('eventType')}</span>
                <input className={css.fieldInput} value={type} onChange={e => { setType(e.target.value) }} />
              </label>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('eventTitle')}</span>
                <input className={css.fieldInput} value={title} onChange={e => { setTitle(e.target.value) }} />
              </label>
              <label className={css.field}>
                <span className={css.fieldLabel}>{t('eventNote')}</span>
                <textarea className={css.fieldArea} value={note} onChange={e => { setNote(e.target.value) }} />
              </label>
            </>
          ) : (
            <div className={css.content}>{event.note === '' ? event.title : event.note}</div>
          )}
        </div>
        {isNew && (
          <div className={css.popupFoot}>
            <button
              type="button"
              className={css.addButton}
              disabled={title.trim() === ''}
              onClick={() => { onSave(type, title, note) }}
            >{t('addEvent')}</button>
          </div>
        )}
      </div>
    </>
  )
}
