/**
 * Панель работы — единственная точка входа в раздел (требование N-02).
 *
 * Три вкладки одного вида: задачи, договорённости, риски. Различает их метка на задаче типа
 * `potask`, а не отдельный тип и не отдельное хранилище. Секции внутри вкладки считаются из
 * срока и статуса (см. `po-groups.ts`).
 *
 * Здесь же маршрутизация раздела: доска открывается только отсюда (требование N-03),
 * детальная страница — из сайдбара ключевого результата, и возврат с неё ведёт на доску,
 * а не в панель (требование G-05).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  poTaskLabel,
  type Board as BoardModel,
  type KeyResult,
  type PoTask,
  type PoTaskKind,
  type Priority,
} from '../model.js'
import type { RawTaskDetail } from '../backlog-json.js'
import { groupTasks, isoDay, type GroupKey } from '../po-groups.js'
import { Board } from './Board.js'
import { Composer, type ComposerDraft } from './Composer.js'
import { DetailPage } from './DetailPage.js'
import { KrSidebar } from './KrSidebar.js'
import { TaskSheet } from './TaskSheet.js'
import { Icon, PriorityFlag } from './icons.js'
import type { OkrLocaleKey } from './locales.js'
import type { PanelStoreHandle } from './index.js'
import { classNames as css, dueLabel } from './styles.js'
import { unwrap, type CallOkr } from './rpc.js'

export interface OkrPanelInjected {
  call: CallOkr
  /** «Продолжить в чате»: подставляет черновик в композер, не отправляя его. */
  openChatWithDraft(draft: string): Promise<void>
}

export type OkrPanelProps =
  PropsRuntime<'shell.overlay'> &
  PropsStore<PanelStoreHandle> &
  InjectFace<OkrPanelInjected> &
  PropsLocale<'okr.goals'>

const TABS: ReadonlyArray<[PoTaskKind, OkrLocaleKey]> = [
  ['task', 'tabTasks'],
  ['control', 'tabControl'],
  ['risk', 'tabRisks'],
]

const GROUP_LABELS: Readonly<Record<GroupKey, OkrLocaleKey>> = {
  overdue: 'groupOverdue',
  today: 'groupToday',
  week: 'groupWeek',
  later: 'groupLater',
  noDate: 'groupNoDate',
  done: 'groupDone',
}

type Route =
  | { view: 'panel' }
  | { view: 'board' }
  | { view: 'detail'; kr: KeyResult; objectiveTitle: string; detail: RawTaskDetail }

type Load<T> =
  | { phase: 'loading' }
  | { phase: 'ready'; value: T }
  | { phase: 'error'; message: string }

const PANEL_WIDTH_KEY = 'okr-panel-width'
const MIN_PANEL = 340

export function OkrPanel({ t, useStore, actions, call, openChatWithDraft }: OkrPanelProps) {
  const open = useStore(state => state.open)

  const [route, setRoute] = useState<Route>({ view: 'panel' })
  const [tab, setTab] = useState<PoTaskKind>('task')
  const [tasks, setTasks] = useState<Load<PoTask[]>>({ phase: 'loading' })
  const [board, setBoard] = useState<Load<BoardModel>>({ phase: 'loading' })
  const [openKr, setOpenKr] = useState<{ kr: KeyResult; objectiveTitle: string } | null>(null)
  const [openTask, setOpenTask] = useState<{ task: PoTask; content: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  /**
   * Счётчик и обещания идентификаторов для записей, заведённых оптимистично.
   *
   * Новая задача появляется в списке сразу, до ответа CLI, — иначе между нажатием и
   * строкой проходят секунды на запуск процесса. До ответа настоящего идентификатора нет,
   * и правки такой записи некуда отправлять: временный идентификатор CLI отвергнет. Поэтому
   * каждая оптимистичная запись несёт обещание своего идентификатора, а правки его ждут.
   */
  const tempCounter = useRef(0)
  const pendingIds = useRef(new Map<string, Promise<string>>())
  const panelRef = useRef<HTMLElement>(null)
  const gripRef = useRef<HTMLDivElement>(null)

  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(PANEL_WIDTH_KEY))
      return Number.isFinite(stored) && stored >= MIN_PANEL ? stored : 420
    } catch {
      // Приватное окно или запрет на хранилище — ширина по умолчанию, а не отказ открыться.
      return 420
    }
  })

  const reload = useCallback(() => { setReloadToken(token => token + 1) }, [])

  // Сайдбар задачи встаёт слева от панели и должен знать её ширину. Переменная на корне —
  // единственный способ отдать её туда, не протаскивая через все промежуточные компоненты.
  useEffect(() => {
    document.documentElement.style.setProperty('--okr-panel-width', `${panelWidth}px`)
  }, [panelWidth])

  useEffect(() => {
    const grip = gripRef.current
    if (grip === null || !open) return
    let startX = 0
    let startWidth = 0

    const onMove = (event: PointerEvent) => {
      // Панель прижата к правому краю: движение влево делает её шире.
      setPanelWidth(Math.min(window.innerWidth - 24, Math.max(MIN_PANEL, startWidth + (startX - event.clientX))))
    }
    const onUp = () => {
      grip.removeAttribute('data-dragging')
      document.body.style.userSelect = ''
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      try {
        const current = panelRef.current?.getBoundingClientRect().width
        if (current !== undefined) window.localStorage.setItem(PANEL_WIDTH_KEY, String(Math.round(current)))
      } catch { /* см. чтение ширины выше */ }
    }
    const onDown = (event: PointerEvent) => {
      event.preventDefault()
      startX = event.clientX
      startWidth = panelRef.current?.getBoundingClientRect().width ?? panelWidth
      grip.setAttribute('data-dragging', '')
      document.body.style.userSelect = 'none'
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    }

    grip.addEventListener('pointerdown', onDown)
    return () => { grip.removeEventListener('pointerdown', onDown) }
  }, [open, panelWidth])

  // Панель закрыли — раздел возвращается в исходное состояние. Иначе следующее открытие
  // показало бы доску или детальную страницу вместо списка задач, хотя нажимали на пункт меню.
  useEffect(() => {
    if (!open) {
      setRoute({ view: 'panel' })
      setOpenKr(null)
      setOpenTask(null)
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setTasks({ phase: 'loading' })
    unwrap<PoTask[]>(call('poTasks', {}, controller.signal))
      .then(value => { if (!controller.signal.aborted) setTasks({ phase: 'ready', value }) })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setTasks({ phase: 'error', message: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { controller.abort() }
  }, [open, call, reloadToken])

  // Доска нужна не только своему экрану: из неё берётся список ключевых результатов для
  // меню привязки, а оно доступно прямо из панели.
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    unwrap<BoardModel>(call('board', {}, controller.signal))
      .then(value => { if (!controller.signal.aborted) setBoard({ phase: 'ready', value }) })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setBoard({ phase: 'error', message: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { controller.abort() }
  }, [open, call, reloadToken])

  // Esc закрывает верхний открытый слой: карточка, сайдбар KR, экран, панель (требование G-01).
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (openTask !== null) { setOpenTask(null); return }
      if (openKr !== null) { setOpenKr(null); return }
      if (route.view === 'detail') { setRoute({ view: 'board' }); return }
      if (route.view === 'board') { setRoute({ view: 'panel' }); return }
      actions.close()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [open, openTask, openKr, route.view, actions])

  if (!open) return null

  const krs: KeyResult[] = board.phase === 'ready'
    ? board.value.objectives.flatMap(objective => objective.krs)
    : []

  const patchTasks = (update: (list: PoTask[]) => PoTask[]) => {
    setTasks(current => (current.phase === 'ready' ? { phase: 'ready', value: update(current.value) } : current))
  }

  /** Настоящий идентификатор записи: у оптимистичной он приходит обещанием от CLI. */
  const resolveId = async (id: string): Promise<string> => {
    const pending = pendingIds.current.get(id)
    return pending === undefined ? id : pending
  }

  /**
   * Правка с немедленным откликом: список меняется сразу, CLI отвечает следом.
   * Не прошло — список возвращается к прежнему виду и показывается причина: молча
   * разойтись с Backlog.md хуже, чем показать ошибку.
   */
  const mutate = (
    endpoint: string,
    id: string,
    payload: Record<string, unknown>,
    optimistic: (task: PoTask) => PoTask,
  ) => {
    const before = tasks.phase === 'ready' ? tasks.value.find(task => task.id === id) : undefined
    patchTasks(list => list.map(task => (task.id === id ? optimistic(task) : task)))
    setOpenTask(current => (current?.task.id === id ? { ...current, task: optimistic(current.task) } : current))

    void resolveId(id)
      .then(realId => unwrap(call(endpoint, { ...payload, id: realId })))
      .catch((cause: unknown) => {
        if (before !== undefined) {
          patchTasks(list => list.map(task => (task.id === id ? before : task)))
          setOpenTask(current => (current?.task.id === id ? { ...current, task: before } : current))
        }
        setError(cause instanceof Error ? cause.message : String(cause))
      })
  }

  /** Заводит запись, не дожидаясь CLI: строка появляется сразу. */
  const addTask = (input: ComposerDraft) => {
    tempCounter.current += 1
    const tempId = `new-${tempCounter.current}`
    const kind = input.kind ?? tab
    const labels = [poTaskLabel(kind)]
    const draft: PoTask = {
      id: tempId,
      title: input.title,
      status: 'To Do',
      priority: input.priority,
      labels,
      kind,
      relatedKrIds: input.krId === null ? [] : [input.krId],
      ...(input.dueDate !== null ? { dueDate: input.dueDate } : {}),
    }

    patchTasks(list => [...list, draft])

    const created = unwrap<{ id: string | null }>(call('createPoTask', {
      title: input.title,
      kind,
      ...(input.description !== '' ? { description: input.description } : {}),
      ...(input.dueDate !== null ? { dueDate: input.dueDate } : {}),
      ...(input.priority !== null ? { priority: input.priority } : {}),
      ...(input.krId !== null ? { relatedKrId: input.krId } : {}),
    }))
      .then(result => {
        if (result.id === null) {
          // Идентификатора в выводе CLI не нашлось. Запись создана, но связать её с
          // показанной строкой нечем — перечитываем список, чтобы экран не разошёлся с файлами.
          reload()
          throw new Error('CLI не вернул идентификатор созданной задачи')
        }
        const realId = result.id
        patchTasks(list => list.map(task => (task.id === tempId ? { ...task, id: realId } : task)))
        // Карточку тоже: она могла быть открыта по временному идентификатору, и тогда любая
        // правка уходила в CLI с «new-1», а тот отвечал «Task new-1 not found».
        setOpenTask(current => (current?.task.id === tempId
          ? { ...current, task: { ...current.task, id: realId } }
          : current))
        // Запись из карты не удаляется намеренно: где-то мог остаться объект задачи со
        // старым временным идентификатором, и без этой записи его правка ушла бы в CLI
        // как есть — тот отвечает «Task new-1 not found».
        return realId
      })
      .catch((cause: unknown) => {
        // Строка-призрак хуже пустого списка: убираем её и говорим причину.
        patchTasks(list => list.filter(task => task.id !== tempId))
        pendingIds.current.delete(tempId)
        setError(cause instanceof Error ? cause.message : String(cause))
        throw cause
      })

    pendingIds.current.set(tempId, created)
  }

  const openTaskCard = (task: PoTask) => {
    setOpenTask({ task, content: null })
    void resolveId(task.id)
      .then(id => unwrap<RawTaskDetail>(call('task', { id })))
      .then(detail => {
        setOpenTask(current => (current?.task.id === task.id
          ? { ...current, content: detail.description ?? '' }
          : current))
      })
      .catch(() => {
        // Описание не прочиталось — карточку не открываем: пустое поле выглядит как
        // «описания нет» и при первой правке стёрло бы настоящее.
        setOpenTask(current => (current?.task.id === task.id ? null : current))
      })
  }

  const importKrs = () => {
    setError(null)
    unwrap<{ objectives: number; keyResults: number }>(call('importOkr', {}))
      .then(result => {
        reload()
        if (result.objectives === 0 && result.keyResults === 0) setError(t('importKrsNothing'))
      })
      .catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)) })
  }

  const continueInChat = (kr: KeyResult) => {
    void openChatWithDraft(`Работаем над ключевым результатом ${kr.id} («${kr.title}»). Открой его: backlog task ${kr.id} --plain`)
  }

  if (route.view === 'detail') {
    return (
      <DetailPage
        kr={route.kr}
        objectiveTitle={route.objectiveTitle}
        detail={route.detail}
        t={t}
        call={call}
        reload={reload}
        onBack={() => { setRoute({ view: 'board' }) }}
      />
    )
  }

  if (route.view === 'board') {
    return (
      <>
        {board.phase === 'loading' && (
          <div className={css.screen}>
            <div className={css.stateBlock}><span className={css.stateTitle}>{t('loading')}</span></div>
          </div>
        )}
        {board.phase === 'error' && (
          <div className={css.screen}>
            <div className={css.stateBlock}>
              <span className={css.stateTitle}>{t('errorTitle')}</span>
              <span className={css.stateMessage}>{board.message}</span>
              <button type="button" className={css.addBtn} onClick={reload}>{t('retry')}</button>
            </div>
          </div>
        )}
        {board.phase === 'ready' && (
          <Board
            board={board.value}
            t={t}
            call={call}
            reload={reload}
            onOpenKr={(kr, objectiveTitle) => { setOpenKr({ kr, objectiveTitle }) }}
            onClose={() => { setRoute({ view: 'panel' }) }}
          />
        )}
        {openKr !== null && (
          <KrSidebar
            kr={openKr.kr}
            objectiveTitle={openKr.objectiveTitle}
            poTasks={tasks.phase === 'ready' ? tasks.value : []}
            t={t}
            call={call}
            reload={reload}
            onOpenDetail={detail => {
              setRoute({ view: 'detail', kr: openKr.kr, objectiveTitle: openKr.objectiveTitle, detail })
              setOpenKr(null)
            }}
            onContinueInChat={continueInChat}
            onClose={() => { setOpenKr(null) }}
          />
        )}
      </>
    )
  }

  const now = new Date()
  const today = isoDay(now)
  const groups = tasks.phase === 'ready' ? groupTasks(tasks.value, tab, now) : []
  const empty = tasks.phase === 'ready' && groups.length === 0

  return (
    <>
      <aside
        ref={panelRef}
        className={css.panel}
        style={{ width: panelWidth }}
        role="dialog"
        aria-label={t('panelTitle')}
      >
        <div ref={gripRef} className={css.grip} />

        <div className={css.header}>
          {/* Заголовка нет намеренно: раздел уже назван кнопкой левого меню, а вкладки
              под ним говорят, что это за список. Строка-подпись только съедала высоту. */}
          <span style={{ flex: 1 }} />
          <button type="button" className={css.iconButton} onClick={reload} aria-label={t('refresh')}>⟳</button>
          <button type="button" className={css.iconButton} onClick={() => { actions.close() }} aria-label={t('close')}>✕</button>
        </div>

        <div className={css.tabsRow}>
          {TABS.map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={css.tab}
              data-active={tab === kind || undefined}
              onClick={() => { setTab(kind); setOpenTask(null) }}
            >{t(label)}</button>
          ))}
        </div>

        <div className={css.body}>
          <Composer t={t} tab={tab} krs={krs} onSubmit={addTask} onImportKrs={importKrs} />

          {error !== null && <div className={css.stateMessage} role="alert">{error}</div>}

          {tasks.phase === 'loading' && (
            <div className={css.skeletonGroup}>
              <div className={css.skeletonHead} />
              <div className={css.skeletonLine} />
              <div className={css.skeletonLine} />
              <div className={css.skeletonLine} />
            </div>
          )}

          {tasks.phase === 'error' && (
            <div className={css.stateBlock}>
              <span className={css.stateTitle}>{t('errorTitle')}</span>
              <span className={css.stateMessage}>{tasks.message}</span>
              <button type="button" className={css.addBtn} onClick={reload}>{t('retry')}</button>
            </div>
          )}

          {empty && (
            <div className={css.stateBlock}>
              <span className={css.stateTitle}>{t('emptyTasks')}</span>
              <span className={css.stateHint}>{t('emptyTasksHint')}</span>
            </div>
          )}

          {groups.map(group => (
            <div key={group.key} className={css.group}>
              <div className={css.groupHeader}>
                <span className={css.groupLabel} data-overdue={group.key === 'overdue' || undefined}>
                  {t(GROUP_LABELS[group.key])}
                </span>
                <span className={css.groupCount}>{group.tasks.length}</span>
              </div>
              <div className={css.sectionCard}>
                {group.tasks.map(task => {
                  const done = task.status.toLowerCase() === 'done'
                  const overdue = !done && task.dueDate !== undefined && task.dueDate < today
                  return (
                    <div
                      key={task.id}
                      className={css.item}
                      data-done={done || undefined}
                      data-active={openTask?.task.id === task.id || undefined}
                      role="button"
                      tabIndex={0}
                      onClick={() => { openTaskCard(task) }}
                      onKeyDown={event => { if (event.key === 'Enter') openTaskCard(task) }}
                    >
                      <button
                        type="button"
                        className={css.itemCheck}
                        data-kind={task.kind}
                        data-done={done || undefined}
                        data-overdue={overdue || undefined}
                        aria-pressed={done}
                        aria-label={task.title}
                        onClick={event => {
                          // Клик по чекбоксу отмечает выполнение, не открывая карточку
                          // (требование T-05).
                          event.stopPropagation()
                          const next = done ? 'To Do' : 'Done'
                          mutate('setStatus', task.id, { status: next }, current => ({ ...current, status: next }))
                        }}
                      />
                      <span className={css.rowMain}>
                        <span className={css.itemTitle}>{task.title}</span>
                        {task.dueDate !== undefined && (
                          <span className={css.rowMeta} data-overdue={overdue || undefined}>
                            {dueLabel(task.dueDate, t)}
                          </span>
                        )}
                      </span>
                      <span className={css.rowMarks}>
                        {task.relatedKrIds.length > 0 && <Icon name="inbox" size={14} />}
                        {task.priority !== null && !done && (
                          <span className={css.flag} data-priority={task.priority}>
                            <PriorityFlag priority={task.priority} />
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <div className={css.footer}>
          <button
            type="button"
            className={`${css.addButton} ${css.fullWidth}`}
            onClick={() => { setBoard({ phase: 'loading' }); setRoute({ view: 'board' }) }}
          >{t('openBoard')}</button>
        </div>
      </aside>

      {openTask !== null && (
        <TaskSheet
          task={openTask.task}
          content={openTask.content}
          krs={krs}
          t={t}
          onRename={title => { mutate('renameTask', openTask.task.id, { title }, current => ({ ...current, title })) }}
          onToggleDone={() => {
            const next = openTask.task.status.toLowerCase() === 'done' ? 'To Do' : 'Done'
            mutate('setStatus', openTask.task.id, { status: next }, current => ({ ...current, status: next }))
          }}
          onSetDue={value => {
            if (value === null) return
            mutate('setDueDate', openTask.task.id, { dueDate: value }, current => ({ ...current, dueDate: value }))
          }}
          onSetPriority={value => {
            // Снятие приоритета Backlog.md не умеет: значения «никакой» у него нет.
            // Поэтому «Без приоритета» в меню недоступно у уже заведённой задачи.
            if (value === null) return
            mutate('setPriority', openTask.task.id, { priority: value }, current => ({ ...current, priority: value }))
          }}
          onSetKind={value => {
            mutate('setKind', openTask.task.id, { value, labels: openTask.task.labels },
              current => ({ ...current, kind: value }))
          }}
          onSetKr={value => {
            mutate('setKr', openTask.task.id, { value, labels: openTask.task.labels },
              current => ({ ...current, relatedKrIds: value === null ? [] : [value] }))
          }}
          onSaveContent={(taskId, markdown) => {
            // Идентификатор приходит от карточки: к этому моменту открыта может быть уже
            // другая задача, и брать его из состояния панели значило бы писать не туда.
            void resolveId(taskId)
              .then(id => unwrap(call('setDescription', { id, text: markdown })))
              .then(() => {
                setOpenTask(current => (current?.task.id === taskId ? { ...current, content: markdown } : current))
              })
              .catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)) })
          }}
          onDelete={() => {
            const id = openTask.task.id
            setOpenTask(null)
            patchTasks(list => list.filter(task => task.id !== id))
            void resolveId(id)
              .then(real => unwrap(call('deleteTask', { id: real })))
              .catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)); reload() })
          }}
          onClose={() => { setOpenTask(null) }}
          onImportKrs={importKrs}
        />
      )}
    </>
  )
}
