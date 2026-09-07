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
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsStore } from '@deepseek-ai/dsh-client-store'
import {
  Button, IconPlusOutline16, IconCloseOutline16, IconRefreshOutline16, Pill, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { poTaskLabel, type Board as BoardModel, type KeyResult, type PoTask, type PoTaskKind } from '../model.js'
import type { RawTaskDetail } from '../backlog-json.js'
import { groupTasks, isoDay, type GroupKey } from '../po-groups.js'
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

/** `2026-09-19` → `19.09`. Год не показываем: в панели задач он почти всегда текущий. */
function formatDue(iso: string): string {
  const [year, month, day] = iso.split('-')
  if (year === undefined || month === undefined || day === undefined) return iso
  return `${day}.${month}`
}

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
   * Счётчик и обещания идентификаторов для записей, заведённых оптимистично.
   *
   * Новая задача появляется в списке и открывается сразу, до ответа CLI, — иначе между
   * нажатием и карточкой проходят секунды на запуск процесса. До ответа настоящего
   * идентификатора нет, и правки такой записи некуда отправлять: временный идентификатор
   * CLI отвергнет. Поэтому каждая оптимистичная запись несёт обещание своего настоящего
   * идентификатора, а правки дожидаются его — счёт идёт на доли секунды, и человек этого
   * не замечает.
   */
  /** Причина последней неудавшейся правки. Список при этом остаётся на экране. */
  const [error, setError] = useState<string | null>(null)
  const tempCounter = useRef(0)
  const pendingIds = useRef(new Map<string, Promise<string>>())

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
    // У только что заведённой записи описания заведомо нет — читать его незачем.
    if (justCreated) {
      setOpenTask({ task, content: '', justCreated })
      return
    }
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

  /** Правит уже загруженный список на месте. Вне состояния «готово» правки не к чему применять. */
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
   *
   * Ждать ответа нельзя: каждое действие — это запуск процесса `backlog`, и отметка
   * выполнения занимала бы секунды. Если запись не прошла, список возвращается к прежнему
   * виду и показывается причина: молча разойтись с Backlog.md хуже, чем показать ошибку.
   */
  const mutate = (
    endpoint: string,
    id: string,
    payload: Record<string, unknown>,
    optimistic: (task: PoTask) => PoTask,
  ) => {
    const before = tasks.phase === 'ready' ? tasks.value.find(task => task.id === id) : undefined
    patchTasks(list => list.map(task => (task.id === id ? optimistic(task) : task)))

    void resolveId(id)
      .then(realId => unwrap(call(endpoint, { ...payload, id: realId })))
      .catch((cause: unknown) => {
        if (before !== undefined) patchTasks(list => list.map(task => (task.id === id ? before : task)))
        setError(cause instanceof Error ? cause.message : String(cause))
      })
  }

  /**
   * Заводит запись и открывает её, не дожидаясь CLI.
   *
   * Требование T-07 — «создаёт запись и сразу открывает её в режиме редактирования».
   * Буквально сразу: строка появляется в списке, карточка открывается с пустым контекстом
   * (у новой записи его и не может быть), а настоящий идентификатор подставляется, когда
   * ответит CLI. Перечитывать список после этого незачем — в нём уже ровно то, что создано.
   */
  const addTask = () => {
    tempCounter.current += 1
    const tempId = `new-${tempCounter.current}`
    const draft: PoTask = {
      id: tempId,
      title: t('newTask'),
      status: 'To Do',
      priority: 'medium',
      labels: [poTaskLabel(tab)],
      kind: tab,
      relatedKrIds: [],
    }

    patchTasks(list => [...list, draft])
    setOpenTask({ task: draft, content: '', justCreated: true })

    const created = unwrap<{ id: string | null }>(call('createPoTask', { title: draft.title, kind: tab }))
      .then(result => {
        if (result.id === null) {
          // Идентификатора в выводе CLI не нашлось. Запись создана, но связать её с
          // показанной строкой нечем — перечитываем список, чтобы экран не разошёлся с файлами.
          reload()
          throw new Error('CLI не вернул идентификатор созданной задачи')
        }
        const realId = result.id
        patchTasks(list => list.map(task => (task.id === tempId ? { ...task, id: realId } : task)))
        setOpenTask(current => (current?.task.id === tempId
          ? { ...current, task: { ...current.task, id: realId } }
          : current))
        pendingIds.current.delete(tempId)
        return realId
      })
      .catch((cause: unknown) => {
        // Строка-призрак хуже пустого списка: убираем её и говорим причину.
        patchTasks(list => list.filter(task => task.id !== tempId))
        setOpenTask(current => (current?.task.id === tempId ? null : current))
        pendingIds.current.delete(tempId)
        setError(cause instanceof Error ? cause.message : String(cause))
        throw cause
      })

    pendingIds.current.set(tempId, created)
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

  const now = new Date()
  const today = isoDay(now)
  const groups = tasks.phase === 'ready' ? groupTasks(tasks.value, tab, now) : []
  const empty = tasks.phase === 'ready' && groups.length === 0

  return (
    <>
      <aside className={css.panel} role="dialog" aria-label={t('panelTitle')}>
        <div className={css.header}>
          <div className={css.headerTitle}>{t('panelTitle')}</div>
          <Button variant="toolbar" size="sm" aria-label={t('refresh')} onClick={reload}
            icon={<IconRefreshOutline16 />} />
          <Button variant="toolbar" size="sm" aria-label={t('close')} onClick={() => { actions.close() }}
            icon={<IconCloseOutline16 />} />
        </div>

        <div className={css.tabsRow}>
          {TABS.map(([kind, label]) => (
            <Pill key={kind} active={tab === kind} onClick={() => { setTab(kind) }}>{t(label)}</Pill>
          ))}
        </div>

        <div className={css.body}>
          <div className={css.addRow}>
            <Button variant="outline" className={css.fullWidth} icon={<IconPlusOutline16 />} onClick={addTask}>
              {t('addTask')}
            </Button>
          </div>

          {error !== null && (
            <div className={css.stateMessage} role="alert">{error}</div>
          )}

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
                <span
                  className={group.key === 'overdue' ? `${css.groupLabel} ${css.overdue}` : css.groupLabel}
                >{t(GROUP_LABELS[group.key])}</span>
                <span className={css.groupCount}>{group.tasks.length}</span>
              </div>
              <div className={css.sectionCard}>
                {group.tasks.map(task => {
                  const done = task.status.toLowerCase() === 'done'
                  const overdue = !done && task.dueDate !== undefined && task.dueDate <= today
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
                          <span className={overdue ? `${css.rowMeta} ${css.overdue}` : css.rowMeta}>
                            {t('due')} {formatDue(task.dueDate)}
                          </span>
                        )}
                      </span>
                      {/* Высокий приоритет — точка состояния брендбука: отдельной иконки флажка
                          в наборе нет, а рисовать свою ради одного значка неправильно. */}
                      {task.priority === 'high' && !done && <StateDot state="warning" className={css.flag} />}
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

      {openTask !== null && openTask.content !== null && (
        <TaskPopup
          task={openTask.task}
          content={openTask.content}
          t={t}
          onRename={title => {
            mutate('renameTask', openTask.task.id, { title }, current => ({ ...current, title }))
            setOpenTask(current => (current === null ? null : { ...current, task: { ...current.task, title } }))
          }}
          onToggleDone={() => {
            const next = openTask.task.status.toLowerCase() === 'done' ? 'To Do' : 'Done'
            mutate('setStatus', openTask.task.id, { status: next }, current => ({ ...current, status: next }))
            setOpenTask(current => (current === null ? null : { ...current, task: { ...current.task, status: next } }))
          }}
          onSaveContent={text => {
            // Описание в строке списка не показывается, поэтому оптимистично менять нечего —
            // отправляем как есть, дождавшись настоящего идентификатора.
            void resolveId(openTask.task.id)
              .then(id => unwrap(call('setDescription', { id, text })))
              .catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : String(cause)) })
          }}
          onSetDue={date => {
            mutate('setDueDate', openTask.task.id, { dueDate: date }, current => ({ ...current, dueDate: date }))
            setOpenTask(current => (current === null ? null : { ...current, task: { ...current.task, dueDate: date } }))
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
          selectTitle={openTask.justCreated}
        />
      )}
    </>
  )
}
