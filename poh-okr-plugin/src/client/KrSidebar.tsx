/**
 * Карточка ключевого результата.
 *
 * Устроена как карточка задачи: крупное название и большое описание в том же блочном
 * редакторе. Разделы «Ссылки» и «Планирование» идут следом одной прокруткой, а чипы
 * сверху — навигация к ним, а не переключатели панелей: при переключении панелями
 * описание пропадало с экрана, хотя именно оно и есть содержание карточки.
 */
import { useEffect, useRef, useState } from 'react'
import { PHASES, SPRINT_COUNT, type KeyResult, type PoTask } from '../model.js'
import { formatPlan, parsePlan, type PlanBlock } from '../plan-block.js'
import type { RawTaskDetail } from '../backlog-json.js'
import { BlockEditor } from './BlockEditor.js'
import { Icon } from './icons.js'
import type { OkrLocaleKey } from './locales.js'
import { classNames as css, dueLabel } from './styles.js'
import { unwrap, type CallOkr } from './rpc.js'

export interface KrSidebarProps {
  kr: KeyResult
  objectiveTitle: string
  poTasks: PoTask[]
  t: (key: OkrLocaleKey) => string
  call: CallOkr
  reload: () => void
  onOpenDetail: (task: RawTaskDetail) => void
  onContinueInChat: (kr: KeyResult) => void
  onClose: () => void
}

/** Разделы карточки: они же цели навигации. */
const SECTIONS: ReadonlyArray<{ id: string; key: OkrLocaleKey }> = [
  { id: 'description', key: 'tabDescription' },
  { id: 'links', key: 'tabLinks' },
  { id: 'planning', key: 'tabPlanning' },
]

const MIN_WIDTH = 360
const STORAGE_KEY = 'okr-kr-sheet-width'

/** Поле, которое пишет значение по уходу фокуса, а не на каждое нажатие клавиши. */
function Field(
  { label, value, multiline, onCommit }:
  { label: string; value: string; multiline?: boolean; onCommit: (next: string) => void },
) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  const commit = () => { if (draft !== value) onCommit(draft) }
  return (
    <label className={css.field}>
      <span className={css.fieldLabel}>{label}</span>
      {multiline === true
        ? <textarea className={css.fieldArea} value={draft} onChange={e => { setDraft(e.target.value) }} onBlur={commit} />
        : <input className={css.fieldInput} value={draft} onChange={e => { setDraft(e.target.value) }} onBlur={commit} />}
    </label>
  )
}

export function KrSidebar(props: KrSidebarProps) {
  const { kr, objectiveTitle, poTasks, t, call, reload, onOpenDetail, onContinueInChat, onClose } = props
  const sheetRef = useRef<HTMLElement>(null)
  const gripRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<{ id: string; markdown: string } | null>(null)
  const baselineRef = useRef<{ id: string; text: string } | null>(null)

  const [detail, setDetail] = useState<RawTaskDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState('description')
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY))
      return Number.isFinite(stored) && stored >= MIN_WIDTH ? stored : 560
    } catch {
      // Приватное окно или запрет на хранилище — ширина по умолчанию, а не отказ открыться.
      return 560
    }
  })

  useEffect(() => {
    const controller = new AbortController()
    setDetail(null)
    setError(null)
    unwrap<RawTaskDetail>(call('task', { id: kr.id }, controller.signal))
      .then(value => {
        if (controller.signal.aborted) return
        setDetail(value)
        baselineRef.current = { id: kr.id, text: value.description ?? '' }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => { controller.abort() }
  }, [kr.id, call])

  const write = (endpoint: string, payload: unknown) => {
    unwrap(call(endpoint, payload))
      .then(() => { reload() })
      .catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)) })
  }

  /** Сохраняет описание, если правили именно эту карточку. */
  const persist = () => {
    const draft = draftRef.current
    const baseline = baselineRef.current
    draftRef.current = null
    if (draft === null || baseline === null) return
    if (draft.id !== baseline.id || draft.markdown === baseline.text) return
    write('setDescription', { id: draft.id, text: draft.markdown })
  }
  const persistRef = useRef(persist)
  persistRef.current = persist
  // Уход с карточки сохраняет описание: иначе правка теряется молча при переключении.
  useEffect(() => () => { persistRef.current() }, [kr.id])

  useEffect(() => {
    const grip = gripRef.current
    if (grip === null) return
    let startX = 0
    let startWidth = 0
    const onMove = (event: PointerEvent) => {
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

  /**
   * Подсветка чипа по прокрутке.
   *
   * Слушатель прокрутки, а не IntersectionObserver: подсветка тут — производная от
   * положения прокрутки, и считать её напрямую короче, чем подбирать пороги наблюдателя
   * под разделы разной высоты.
   */
  useEffect(() => {
    const root = bodyRef.current
    if (root === null) return
    let scheduled = false
    const recompute = () => {
      scheduled = false
      const edge = root.getBoundingClientRect().top + 24
      let current = SECTIONS[0].id
      for (const section of SECTIONS) {
        const node = root.querySelector(`#okr-section-${section.id}`)
        if (node !== null && node.getBoundingClientRect().top <= edge) current = section.id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (scheduled) return
      scheduled = true
      requestAnimationFrame(recompute)
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    recompute()
    return () => { root.removeEventListener('scroll', onScroll) }
  }, [detail])

  const goTo = (id: string) => {
    setActive(id)
    const body = bodyRef.current
    const target = body?.querySelector(`#okr-section-${id}`)
    if (body === null || target === null || target === undefined) return
    const from = body.scrollTop
    const to = Math.min(
      body.scrollHeight - body.clientHeight,
      from + target.getBoundingClientRect().top - body.getBoundingClientRect().top - 8,
    )
    if (Math.abs(to - from) < 2) return
    const started = performance.now()
    const step = (now: number) => {
      const phase = Math.min(1, (now - started) / 240)
      body.scrollTop = from + (to - from) * (1 - (1 - phase) ** 3)
      if (phase < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  const plan: PlanBlock = parsePlan(detail?.implementationPlan)
  const writePlan = (next: PlanBlock) => { write('setPlan', { id: kr.id, text: formatPlan(next) }) }

  const related = poTasks.filter(task => task.relatedKrIds.includes(kr.id))
  const done = related.filter(task => task.status.toLowerCase() === 'done')
  const open = related.filter(task => task.status.toLowerCase() !== 'done' && task.kind !== 'risk')
  const risks = related.filter(task => task.kind === 'risk')

  return (
    <aside ref={sheetRef} className={css.sheet} style={{ width, right: 0 }} role="dialog" aria-label={kr.title}>
      <div ref={gripRef} className={css.grip} />

      <div className={css.detailHead}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={css.sidebarTag}>{objectiveTitle}</div>
          <div
            className={css.detailTitle}
            style={{ paddingBottom: 0 }}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            onBlur={event => {
              const next = event.currentTarget.textContent?.trim() ?? ''
              if (next !== '' && next !== kr.title) write('renameTask', { id: kr.id, title: next })
              else event.currentTarget.textContent = kr.title
            }}
          >{kr.title}</div>
        </div>
        <button type="button" className={css.iconButton} aria-label={t('close')} onClick={() => { persist(); onClose() }}>
          <Icon name="chevronRight" />
        </button>
      </div>

      {/* Чипы — навигация по разделам одной прокрутки, а не переключение панелей. */}
      <div className={css.tabsRow} style={{ padding: '10px 14px' }}>
        {SECTIONS.map(section => (
          <button
            key={section.id}
            type="button"
            className={css.tab}
            data-active={active === section.id || undefined}
            onClick={() => { goTo(section.id) }}
          >{t(section.key)}</button>
        ))}
      </div>

      <div className={`${css.detailBody} ${css.navBody}`} ref={bodyRef}>
        {error !== null && <div className={css.stateMessage} role="alert">{error}</div>}

        <section id="okr-section-description">
          {detail !== null && (
            <BlockEditor
              value={detail.description ?? ''}
              placeholder={t('editorPlaceholder')}
              onChange={markdown => { draftRef.current = { id: kr.id, markdown } }}
              onCommand={() => { /* меню блоков карточки KR подключается вместе с общим слоем */ }}
            />
          )}

          <RelatedList title={t('fieldDone')} tasks={done} />
          <RelatedList title={t('fieldTodo')} tasks={open} />
          <RelatedList title={t('fieldRisks')} tasks={risks} />
        </section>

        <section id="okr-section-links" className={css.sectionHead}>
          <div className={css.sectionTitle}>{t('tabLinks')}</div>
          <Field
            label={t('fieldConfluence')}
            value={detail?.documentation[0] ?? ''}
            onCommit={next => { write('setConfluence', { id: kr.id, url: next }) }}
          />
          <Field
            label={t('fieldJira')}
            value={detail?.references[0] ?? ''}
            onCommit={next => { write('setEpicLink', { id: kr.id, url: next }) }}
          />
          <div className={css.field}>
            <span className={css.fieldLabel}>{t('fieldDue')}</span>
            <span>{kr.dueDate === undefined ? '—' : dueLabel(kr.dueDate, t)}</span>
          </div>
        </section>

        <section id="okr-section-planning" className={css.sectionHead}>
          <div className={css.sectionTitle}>{t('tabPlanning')}</div>
          <div className={css.planTable}>
            {PHASES.map(phase => (
              <div key={phase} className={css.planStage}>
                <span className={`${css.fieldLabel} ${css.mono}`}>{phase}</span>
                <select
                  className={css.fieldInput}
                  value={plan.stages[phase].sprint ?? ''}
                  onChange={event => {
                    const raw = event.target.value
                    writePlan({
                      ...plan,
                      stages: {
                        ...plan.stages,
                        [phase]: { ...plan.stages[phase], sprint: raw === '' ? null : Number(raw) },
                      },
                    })
                  }}
                >
                  <option value="">{t('fieldNoSprint')}</option>
                  {Array.from({ length: SPRINT_COUNT }, (_, i) => (
                    <option key={i} value={i}>{i + 1}</option>
                  ))}
                </select>
                <input
                  className={css.fieldInput}
                  defaultValue={plan.stages[phase].resources}
                  placeholder={t('fieldResources')}
                  onBlur={event => {
                    const next = event.target.value
                    if (next === plan.stages[phase].resources) return
                    writePlan({
                      ...plan,
                      stages: { ...plan.stages, [phase]: { ...plan.stages[phase], resources: next } },
                    })
                  }}
                />
              </div>
            ))}
          </div>
          <Field label={t('fieldTeams')} value={plan.teams} onCommit={next => { writePlan({ ...plan, teams: next }) }} />
          <Field label={t('fieldTechLeads')} value={plan.techLeads} onCommit={next => { writePlan({ ...plan, techLeads: next }) }} />
          <Field label={t('fieldExecutors')} value={plan.executors} onCommit={next => { writePlan({ ...plan, executors: next }) }} />
        </section>
      </div>

      <div className={css.detailFoot}>
        <button
          type="button"
          className={css.boardAction}
          disabled={detail === null}
          onClick={() => { if (detail !== null) { persist(); onOpenDetail(detail) } }}
        >{t('detailPage')}</button>
        <button
          type="button"
          className={css.boardAction}
          onClick={() => { persist(); onContinueInChat(kr) }}
        >{t('continueInChat')}</button>
      </div>
    </aside>
  )
}

/** Список связанных операционных задач. Пустой список секции не рисует — лишний шум. */
function RelatedList({ title, tasks }: { title: string; tasks: PoTask[] }) {
  if (tasks.length === 0) return null
  return (
    <div className={css.field}>
      <span className={css.fieldLabel}>{title}</span>
      {tasks.map(task => (
        <div key={task.id} className={css.itemTitle}>{task.title}</div>
      ))}
    </div>
  )
}
