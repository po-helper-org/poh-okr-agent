/**
 * Панель работы — единственная точка входа в раздел (требование N-02).
 *
 * Три вкладки одного вида: задачи, договорённости, риски. Различает их метка на задаче типа
 * `potask`, а не отдельный тип и не отдельное хранилище. Секции внутри вкладки считаются из
 * срока и статуса (см. `po-groups.ts`).
 *
 * Здесь же живёт маршрутизация раздела: доска открывается только отсюда (требование N-03),
 * детальная страница — из сайдбара ключевого результата, и возврат с неё ведёт на доску,
 * а не в панель (требование G-05).
 */
import { useCallback, useEffect, useState } from 'react'
import type { PropsStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { Board as BoardModel, KeyResult, PoTask, PoTaskKind } from '../model.js'
import type { RawTaskDetail } from '../backlog-json.js'
import { groupTasks, type GroupKey } from '../po-groups.js'
import { Board } from './Board.js'
import { DetailPage } from './DetailPage.js'
import { KrSidebar } from './KrSidebar.js'
import { TaskPopup } from './TaskPopup.js'
import type { OkrLocaleKey } from './locales.js'
import type { PanelStoreHandle } from './index.js'
import { classNames as css } from './styles.js'
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

// Грань `inject` фреймворк раскладывает прямо в пропсы, а не кладёт объектом.
export function OkrPanel({ t, useStore, actions, call, openChatWithDraft }: OkrPanelProps) {
  const open = useStore(state => state.open)

  const [route, setRoute] = useState<Route>({ view: 'panel' })
  const [tab, setTab] = useState<PoTaskKind>('task')
  const [tasks, setTasks] = useState<Load<PoTask[]>>({ phase: 'loading' })
  const [board, setBoard] = useState<Load<BoardModel>>({ phase: 'loading' })
  const [openKr, setOpenKr] = useState<{ kr: KeyResult; objectiveTitle: string } | null>(null)
  /**
   * Открытая карточка задачи. `content: null` — описание ещё грузится.
   *
   * Попап нельзя открывать с пустым контекстом до загрузки: сохранение по уходу фокуса
   * записало бы эту пустоту поверх существующего описания задачи.
   */
  const [openTask, setOpenTask] = useState<{ task: PoTask; content: string | null; justCreated: boolean } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  /**
   * Задача, которую надо открыть на редактирование, как только список перечитается.
   *
   * Требование T-07: кнопка быстрого добавления заводит запись и сразу открывает её.
   * Открыть карточку прямо в обработчике нельзя — списка с новой задачей ещё нет, а
   * карточке нужен сам объект задачи. Искать её потом по названию тоже нельзя: у всех
   * новых записей название одинаковое, поэтому канал возвращает идентификатор.
   */
  const [pendingOpenId, setPendingOpenId] = useState<string | null>(null)

  const reload = useCallback(() => { setReloadToken(token => token + 1) }, [])

  // Панель закрыли — раздел возвращается в исходное состояние. Иначе следующее открытие
  // показало бы доску или детальную страницу вместо списка задач, хотя пользователь нажимал
  // на пункт меню, а не на «открыть доску».
  useEffect(() => {
    if (!open) {
      setRoute({ view: 'panel' })
      setOpenKr(null)
      setOpenTask(null)
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

  useEffect(() => {
    if (route.view === 'panel') return
    const controller = new AbortController()
    unwrap<BoardModel>(call('board', {}, controller.signal))
      .then(value => { if (!controller.signal.aborted) setBoard({ phase: 'ready', value }) })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setBoard({ phase: 'error', message: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => { controller.abort() }
  }, [route.view, call, reloadToken])

  useEffect(() => {
    if (pendingOpenId === null || tasks.phase !== 'ready') return
    const created = tasks.value.find(task => task.id === pendingOpenId)
    if (created === undefined) return
    setPendingOpenId(null)
    openTaskCard(created, true)
    // openTaskCard пересоздаётся на каждый рендер и в зависимости не идёт: он читает только
    // `call`, а добавление его сюдагоняло бы эффект вхолостую на каждый рендер.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOpenId, tasks])

  // Esc закрывает верхний открытый слой: меню блоков живёт внутри попапа, дальше попап,
  // сайдбар, экран, панель (требование G-01).
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

  const openTaskCard = (task: PoTask, justCreated = false) => {
    setOpenTask({ task, content: null, justCreated })
    unwrap<RawTaskDetail>(call('task', { id: task.id }))
      .then(detail => {
        setOpenTask(current => (current?.task.id === task.id
          ? { ...current, content: detail.description ?? '' }
          : current))
      })
      .catch(() => {
        // Описание не прочиталось — карточку закрываем, а не показываем пустой: пустое поле
        // выглядит как «описания нет» и при первой же правке стёрло бы настоящее.
        setOpenTask(current => (current?.task.id === task.id ? null : current))
      })
  }

  const write = (endpoint: string, payload: unknown) => {
    unwrap(call(endpoint, payload)).then(() => { reload() }).catch((cause: unknown) => {
      setTasks({ phase: 'error', message: cause instanceof Error ? cause.message : String(cause) })
    })
  }

  const continueInChat = (kr: KeyResult) => {
    // Чату передаётся идентификатор задачи: остальное он возьмёт из Backlog.md сам.
    // Дублировать сюда содержимое ключевого результата незачем — оно к моменту чтения
    // может уже устареть, а идентификатор нет.
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
        {board.phase === 'loading' && <div className={css.screen}><div className={css.stateBlock}><span className={css.stateTitle}>{t('loading')}</span></div></div>}
        {board.phase === 'error' && (
          <div className={css.screen}>
            <div className={css.stateBlock}>
              <span className={css.stateTitle}>{t('errorTitle')}</span>
              <span className={css.stateMessage}>{board.message}</span>
              <button type="button" className={css.addButton} onClick={reload}>{t('retry')}</button>
              <button type="button" className={css.addButton} onClick={() => { setRoute({ view: 'panel' }) }}>{t('close')}</button>
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

  const groups = tasks.phase === 'ready' ? groupTasks(tasks.value, tab, new Date()) : []
  const empty = tasks.phase === 'ready' && groups.length === 0

  return (
    <>
      <aside className={css.panel} role="dialog" aria-label={t('panelTitle')}>
        <div className={css.header}>
          <div className={css.headerTitle}>{t('panelTitle')}</div>
          <button type="button" className={css.iconButton} onClick={reload} aria-label={t('refresh')}>⟳</button>
          <button type="button" className={css.iconButton} onClick={() => { actions.close() }} aria-label={t('close')}>✕</button>
        </div>

        <div className={css.tabBar}>
          {TABS.map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              className={css.tab}
              data-active={tab === kind || undefined}
              onClick={() => { setTab(kind) }}
            >{t(label)}</button>
          ))}
        </div>

        <div className={css.body}>
          <div className={css.addRow}>
            <button
              type="button"
              className={css.addButton}
              onClick={() => {
                unwrap<{ id: string | null }>(call('createPoTask', { title: t('newTask'), kind: tab }))
                  .then(created => {
                    // Идентификатора может не быть, если вывод CLI изменится: запись всё равно
                    // создана, поэтому список обновляем в любом случае, а карточку не открываем.
                    if (created.id !== null) setPendingOpenId(created.id)
                    reload()
                  })
                  .catch((cause: unknown) => {
                    setTasks({ phase: 'error', message: cause instanceof Error ? cause.message : String(cause) })
                  })
              }}
            >+&nbsp;&nbsp;{t('addTask')}</button>
          </div>

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
              <button type="button" className={css.addButton} onClick={reload}>{t('retry')}</button>
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
                <span className={css.groupLabel}>{t(GROUP_LABELS[group.key])}</span>
                <span className={css.groupCount}>{group.tasks.length}</span>
              </div>
              {group.tasks.map(task => {
                const done = task.status.toLowerCase() === 'done'
                return (
                  <div
                    key={task.id}
                    className={css.item}
                    data-done={done || undefined}
                    role="button"
                    tabIndex={0}
                    onClick={() => { openTaskCard(task) }}
                    onKeyDown={event => {
                      if (event.key === 'Enter') openTaskCard(task)
                    }}
                  >
                    <button
                      type="button"
                      className={css.itemCheck}
                      data-kind={task.kind}
                      data-done={done || undefined}
                      aria-pressed={done}
                      aria-label={task.title}
                      onClick={event => {
                        // Клик по чекбоксу отмечает выполнение, не открывая карточку
                        // (требование T-05).
                        event.stopPropagation()
                        write('setStatus', { id: task.id, status: done ? 'To Do' : 'Done' })
                      }}
                    />
                    <span className={css.itemTitle}>{task.title}</span>
                    {task.dueDate !== undefined && (
                      <span className={`${css.itemMeta} ${css.mono}`}>{task.dueDate}</span>
                    )}
                  </div>
                )
              })}
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

      {openTask !== null && openTask.content !== null && (
        <TaskPopup
          task={openTask.task}
          content={openTask.content}
          t={t}
          onRename={title => { write('renameTask', { id: openTask.task.id, title }) }}
          onToggleDone={() => {
            const done = openTask.task.status.toLowerCase() === 'done'
            write('setStatus', { id: openTask.task.id, status: done ? 'To Do' : 'Done' })
          }}
          onSaveContent={text => { write('setDescription', { id: openTask.task.id, text }) }}
          onSetDue={date => { write('setDueDate', { id: openTask.task.id, dueDate: date }) }}
          onDelete={() => { write('deleteTask', { id: openTask.task.id }); setOpenTask(null) }}
          onClose={() => { setOpenTask(null) }}
          selectTitle={openTask.justCreated}
        />
      )}
    </>
  )
}
