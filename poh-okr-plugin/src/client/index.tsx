/**
 * Раздел «Управление целями», браузерная половина.
 *
 * Регистрирует кнопку в подвале левой панели (`sidebar.footer.action`) и саму панель в слое
 * оверлеев (`shell.overlay`). Обе записи делят один стор слота: кнопка переключает `open`,
 * панель его читает, поэтому они не расходятся.
 *
 * Файл называется `index.tsx`, а не `index.ts`: он определяет разметку кнопки на месте,
 * а TypeScript разрешает JSX-грамматику только в `.tsx`.
 */
// Type-only: даёт декларацию `ctx.slots` в `Context`.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: даёт слияние SlotMap с записью 'sidebar.footer.action'.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: даёт слияние SlotMap с записью 'shell.overlay'.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: даёт декларацию `ctx.locale` в `Context`.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: службы цепочки запуска чата. Не в `inject` ниже — см. комментарий у openChatWithDraft.
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { IconGoalOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import { defineStore, type PropsStore, type StoreHandle } from '@deepseek-ai/dsh-client-store'
import type { RpcResult } from '../channel.js'
import { ru, type OkrLocaleKey } from './locales.js'
import { OkrPanel, type OkrPanelInjected } from './Panel.js'
import { classNames as css, styleText } from './styles.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'okr.goals': OkrLocaleKey }
}

const NS = 'okr.goals'

/**
 * Имя канала RPC-узла (`src/channel.ts`, `OKR_CHANNEL`). Продублировано строкой, а не
 * импортировано значением: `channel.ts` — общий модуль с node-половиной, и его код клиенту
 * не нужен. Импорт значения затащил бы разбор ошибок CLI в браузерный бандл.
 */
const CHANNEL = '/okr'

export interface PanelState {
  open: boolean
}

export type PanelStoreHandle = StoreHandle<PanelState, {
  toggle: (draft: PanelState) => void
  close: (draft: PanelState) => void
}>

/** Слоты дают место регистрации, стор — общее состояние видимости, локаль — копию. */
export const inject = ['slots', 'connection', 'locale']

export function apply(ctx: ClientContext): void {
  // Рабочий язык этого развёртывания — русский, поэтому оба обязательных слота встроенных
  // языков получают один словарь: подписи раздела остаются русскими независимо от того,
  // какой из них сейчас выбран. Третий язык через эту перегрузку не завести — она
  // типизирована жёстким списком встроенных, а расширение каталога языков меняет его для
  // всего харнесса, а не для одного раздела.
  ctx.effect(() => ctx.locale.register(NS, { zh: ru, en: ru }), 'poh-okr-plugin: словарь копии (ru)')

  // Сборка стороннего плагина не поддерживает `*.module.css`, а `@tsdown/css` выносит стили
  // в отдельный `lib/style.css`, который `exports['./client']` не публикует, — вёрстка тихо
  // ломается без ошибки сборки. Текст CSS одним <style> — приём, которым харнесс уже
  // пользуется вне монорепозитория (см. styles.ts).
  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-plugin', 'poh-okr-plugin')
    style.textContent = styleText
    document.head.appendChild(style)
    return () => { style.remove() }
  }, 'poh-okr-plugin: стили раздела')

  // Хэндл стора создаётся заново на каждый apply() и не экспортируется с модуля: иначе
  // модульный кэш стал бы замаскированным синглтоном между перезагрузками плагина.
  const panelStore: PanelStoreHandle = defineStore({
    init: (): PanelState => ({ open: false }),
    actions: {
      toggle: (draft) => { draft.open = !draft.open },
      close: (draft) => { draft.open = false },
    },
  })

  // Шелл типизирует `connection` как хостовую грань; в браузерном шелле тот же ключ хранит
  // полный клиентский handle. Берём только `.rpc.call`, не заводя типовой зависимости от
  // пакета, которого нет среди devDependencies.
  const connection = ctx.get('connection') as unknown as {
    rpc: {
      call(channel: string, endpoint: string, payload: unknown, signal?: AbortSignal): Promise<RpcResult<unknown>>
    }
  }
  const call = (endpoint: string, payload: unknown = {}, signal?: AbortSignal): Promise<RpcResult<unknown>> =>
    connection.rpc.call(CHANNEL, endpoint, payload, signal)

  /**
   * «Продолжить в чате»: connectWorkspace → scope → setDraft → open.
   * Черновик кладётся до открытия и НЕ отправляется ни при каких условиях — Enter жмёт человек.
   *
   * Все четыре службы читаются лениво в момент нажатия, а не через `export const inject`:
   * `inject` — жёсткое требование, при отсутствии службы падает весь клиентский boot, а раздел
   * без чата всё ещё осмыслен (доска и панель работают). Отсутствие службы должно ломать одну
   * кнопку, а не весь интерфейс.
   */
  const openChatWithDraft = async (draft: string): Promise<void> => {
    const uiWorkspace = ctx.get('uiWorkspace')
    const sessions = ctx.get('sessions')
    const workspaces = ctx.get('workspaces')
    const conversation = ctx.get('conversation')
    if (uiWorkspace === undefined || sessions === undefined || workspaces === undefined || conversation === undefined) {
      throw new Error('poh-okr-plugin: чат недоступен — нет sessions/uiWorkspace/workspaces/conversation')
    }
    const workspaceId = resolveWorkspaceId(sessions, workspaces)
    if (workspaceId === undefined) throw new Error('poh-okr-plugin: чат: не к чему подключаться')

    // Только connectWorkspace возвращает SessionId — startSession ничего не отдаёт.
    const sessionId = await uiWorkspace.connectWorkspace(workspaceId)
    const actx = sessions.scope(sessionId)
    if (actx === undefined) throw new Error(`poh-okr-plugin: чат: sessions.scope(${sessionId}) без скопа`)
    conversation.input.for(actx).setDraft(draft)
    sessions.open(sessionId)
  }

  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    { name: 'sidebar.footer.action', id: 'okr-goals', locale: NS, store: panelStore },
    GoalsButton,
  ))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'okr-goals',
      locale: NS,
      store: panelStore,
      inject: (): OkrPanelInjected => ({ call, openChatWithDraft }),
    },
    OkrPanel,
  ))
}

/**
 * Рабочее пространство для чата — тем же выводом, каким его определяет сам харнесс:
 * пространство текущей сессии, а если её нет — самое недавно активное. Ни одного вообще —
 * `undefined`, и цепочка останавливается, а не подключается вслепую.
 */
function resolveWorkspaceId(sessions: ISessions, workspaces: IWorkspaces): WorkspaceId | undefined {
  const sessionList = sessions.list.getSnapshot()
  const workspaceList = workspaces.list.getSnapshot()
  const current = sessionList.current
  const currentWorkspaceId = current === undefined
    ? undefined
    : workspaceList.items.find(item => item.sessionIds.includes(current))?.workspaceId
  if (currentWorkspaceId !== undefined) return currentWorkspaceId

  let recent: WorkspaceId | undefined
  let recentTime = Number.NEGATIVE_INFINITY
  for (const item of workspaceList.items) {
    let latest = Number.NEGATIVE_INFINITY
    for (const sessionId of item.sessionIds) {
      const session = sessionList.byId[sessionId]
      if (session !== undefined) latest = Math.max(latest, session.updatedAt)
    }
    if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(item.createdAt)
    if (recent === undefined || latest > recentTime) {
      recent = item.workspaceId
      recentTime = latest
    }
  }
  return recent
}

/** Кнопка раздела в подвале левой панели: переключает общий с панелью стор видимости. */
function GoalsButton({ t, useStore, actions, wide }: PropsStore<PanelStoreHandle> & {
  t: (key: OkrLocaleKey) => string
  wide: boolean
}) {
  const open = useStore(state => state.open)
  return (
    <div className={wide ? css.navLayer : `${css.navLayer} ${css.navRail}`}>
      <div className={css.navButtons}>
        <button
          type="button"
          className={css.navBadge}
          data-active={open || undefined}
          aria-pressed={open}
          aria-label={t('nav')}
          onClick={() => { actions.toggle() }}
        >
          <IconGoalOutline16 size={wide ? 16 : 18} />
          {wide && <span className={css.navBadgeLabel}>{t('nav')}</span>}
        </button>
      </div>
    </div>
  )
}
