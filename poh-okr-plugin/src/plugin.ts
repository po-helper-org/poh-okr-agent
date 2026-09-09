import type { Context } from '@deepseek-ai/cordis'
import { capturePolicy } from './agent-policy.js'
import { OKR_CHANNEL, dispatch, type RpcResult } from './channel.js'
import { Config, toOkrConfig, type PluginConfig } from './plugin-config.js'
import { BacklogReader } from './reader.js'

export const name = 'poh-okr-plugin'
export { Config }

/**
 * Место правила среди секций системного промпта.
 *
 * Число, а не имя из `getSectionOrder`: тот знает только секции самого харнесса. 700 —
 * между политикой команды (600) и остальными правилами инструментов (800+): правило
 * должно читаться до описаний инструментов, которыми модель его исполняет.
 */
const POLICY_ORDER = 700

/** Форма службы системного промпта, которой нам достаточно. */
interface SystemPromptLike {
  section: (section: { name: string; order: number; text: string }) => () => void
}

/** Форма службы соединения, которой нам достаточно. */
interface ConnectionLike {
  rpc: {
    handle: (
      channel: string,
      handler: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>,
      options?: { authority?: string },
    ) => () => Promise<void> | void
  }
}

/**
 * Поднимает раздел управления целями.
 * Служба соединения необязательна и берётся отложенной инъекцией: без неё композиция
 * без веб-интерфейса всё равно должна подниматься.
 */
export function apply(ctx: Context, config: PluginConfig): void {
  const okrConfig = toOkrConfig(config)
  const reader = new BacklogReader(okrConfig)

  // Правило записи для модели. Тоже отложенной инъекцией: композиция без агентского
  // цикла (например одни только тесты канала) должна подниматься без системного промпта.
  ctx.inject(['systemPrompt'], (scoped: Context) => {
    const systemPrompt = scoped.get('systemPrompt') as unknown as SystemPromptLike
    scoped.effect(
      () => systemPrompt.section({
        name: 'okr:capture-policy',
        order: POLICY_ORDER,
        text: capturePolicy(okrConfig),
      }),
      'poh-okr-plugin: правило записи задач PO',
    )
  })

  ctx.inject(['connection'], (scoped: Context) => {
    const connection = scoped.get('connection') as unknown as ConnectionLike
    scoped.effect(
      () => connection.rpc.handle(
        OKR_CHANNEL,
        (endpoint, payload, signal) => dispatch(reader, endpoint, payload, signal),
        { authority: 'loopback' },
      ),
      'poh-okr-plugin: канал /okr',
    )
  })
}
