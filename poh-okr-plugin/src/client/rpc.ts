import type { RpcResult } from '../channel.js'

/**
 * Грань вызова канала `/okr`, которую index.tsx прокидывает компонентам.
 *
 * Компоненты не знают ни имени канала, ни формы соединения: им отдают одну функцию.
 * Так экраны тестируются подделкой одного вызова, а не подменой службы харнесса.
 */
export type CallOkr = (
  endpoint: string,
  payload?: unknown,
  signal?: AbortSignal,
) => Promise<RpcResult<unknown>>

/**
 * Разворачивает ответ канала или бросает с текстом, написанным для пользователя.
 * Сообщения ошибок собираются на node-половине (`src/channel.ts`) и здесь не переписываются:
 * там известно, что именно случилось с CLI, а здесь — нет.
 */
export async function unwrap<T>(call: Promise<RpcResult<unknown>>): Promise<T> {
  const result = await call
  if (!result.ok) throw new Error(result.error.message)
  return result.value as T
}
