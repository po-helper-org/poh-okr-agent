/**
 * Сайдбар краткой информации о ключевом результате.
 *
 * Три вкладки: описание, ссылки, планирование. Название правится прямо в шапке, правка сразу
 * уходит в Backlog.md и возвращается на доску — своего состояния у сайдбара нет.
 *
 * Вкладка «Описание» отличается от прототипа: «что уже сделано» и «что осталось» там были
 * свободными текстовыми полями, здесь это списки связанных операционных задач — закрытые и
 * открытые. Так они не расходятся с панелью работы: и то, и другое — одни и те же задачи
 * Backlog.md, а не два независимых текста, которые кто-то забудет синхронизировать.
 */
import { useEffect, useState } from 'react'
import { PHASES, SPRINT_COUNT, type KeyResult, type PoTask } from '../model.js'
import { formatPlan, parsePlan, type PlanBlock } from '../plan-block.js'
import type { RawTaskDetail } from '../backlog-json.js'
import type { OkrLocaleKey } from './locales.js'
import { classNames as css } from './styles.js'
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

type Tab = 'description' | 'links' | 'planning'

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
      {multiline
        ? <textarea className={css.fieldArea} value={draft} onChange={e => { setDraft(e.target.value) }} onBlur={commit} />
        : <input className={css.fieldInput} value={draft} onChange={e => { setDraft(e.target.value) }} onBlur={commit} />}
    </label>
  )
}

export function KrSidebar(props: KrSidebarProps) {
  const { kr, objectiveTitle, poTasks, t, call, reload, onOpenDetail, onContinueInChat, onClose } = props
  const [tab, setTab] = useState<Tab>('description')
  const [detail, setDetail] = useState<RawTaskDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setDetail(null)
    setError(null)
    unwrap<RawTaskDetail>(call('task', { id: kr.id }, controller.signal))
      .then(value => { if (!controller.signal.aborted) setDetail(value) })
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

  const plan: PlanBlock = parsePlan(detail?.implementationPlan)
  const writePlan = (next: PlanBlock) => { write('setPlan', { id: kr.id, text: formatPlan(next) }) }

  const related = poTasks.filter(task => task.relatedKrIds.includes(kr.id))
  const done = related.filter(task => task.status.toLowerCase() === 'done')
  const open = related.filter(task => task.status.toLowerCase() !== 'done' && task.kind !== 'risk')
  const risks = related.filter(task => task.kind === 'risk')

  return (
    <>
      <div className={css.backdrop} onClick={onClose} />
      <aside className={css.sidebar} role="dialog" aria-label={kr.title}>
        <div className={css.sidebarHead}>
          <div style={{ flex: 1 }}>
            <div className={css.sidebarTag}>{objectiveTitle}</div>
            <div
              className={css.sidebarTitle}
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
          <button type="button" className={css.iconButton} onClick={onClose} aria-label={t('close')}>✕</button>
        </div>

        <div className={css.tabBar}>
          {([['description', 'tabDescription'], ['links', 'tabLinks'], ['planning', 'tabPlanning']] as const)
            .map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={css.tab}
                data-active={tab === key || undefined}
                onClick={() => { setTab(key) }}
              >{t(label)}</button>
            ))}
        </div>

        <div className={css.body}>
          {error !== null && <div className={css.stateMessage}>{error}</div>}

          {tab === 'description' && (
            <>
              <Field
                label={t('fieldDescription')}
                value={detail?.description ?? ''}
                multiline
                onCommit={next => { write('setDescription', { id: kr.id, text: next }) }}
              />
              <RelatedList title={t('fieldDone')} tasks={done} />
              <RelatedList title={t('fieldTodo')} tasks={open} />
              <RelatedList title={t('fieldRisks')} tasks={risks} />
            </>
          )}

          {tab === 'links' && (
            <>
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
              <Field
                label={t('fieldDue')}
                value={kr.dueDate ?? ''}
                onCommit={next => { write('setDueDate', { id: kr.id, dueDate: next }) }}
              />
            </>
          )}

          {tab === 'planning' && (
            <>
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
            </>
          )}
        </div>

        <div className={css.footer} style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className={`${css.addButton}`}
            disabled={detail === null}
            onClick={() => { if (detail !== null) onOpenDetail(detail) }}
          >{t('detailPage')}</button>
          <button
            type="button"
            className={`${css.addButton}`}
            onClick={() => { onContinueInChat(kr) }}
          >{t('continueInChat')}</button>
        </div>
      </aside>
    </>
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
