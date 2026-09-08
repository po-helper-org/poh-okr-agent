import type { Context } from '@deepseek-ai/cordis'
import { OKR_CHANNEL, dispatch, type RpcResult } from './channel.js'
import { Config, toOkrConfig, type PluginConfig } from './plugin-config.js'
import { BacklogReader } from './reader.js'

export const name = 'poh-okr-plugin'
export { Config }

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
  const reader = new BacklogReader(toOkrConfig(config))

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
