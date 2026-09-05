import z from '@deepseek-ai/schemastery'
import type { OkrConfig } from './config.js'

/**
 * Конфигурация из строки профиля харнесса.
 * Секретов здесь нет и быть не может: строка профиля лежит в файле рядом с репозиторием.
 */
export interface PluginConfig {
  workspaceRoot: string
  backlogBin: string
  krTaskType: string
  poTaskType: string
  boardDocTitle: string
  sessionPath: string
}

export const Config = z.object({
  workspaceRoot: z.string().required(),
  backlogBin: z.string().default('backlog'),
  krTaskType: z.string().default('okr'),
  poTaskType: z.string().default('potask'),
  boardDocTitle: z.string().default('okr-board'),
  // Пустая строка выключает привязку чатов (см. toOkrConfig ниже и OkrConfig.sessionPath).
  sessionPath: z.string().default(''),
})

export function toOkrConfig(plugin: PluginConfig): OkrConfig {
  // Схема пропускает пустую строку: `.required()` проверяет наличие ключа, а не содержимое.
  // Пустой корень означал бы запуск команд в неверном каталоге, поэтому падаем сразу и явно.
  const workspaceRoot = plugin.workspaceRoot?.trim()
  if (!workspaceRoot) {
    throw new Error(
      'в настройках плагина не задан workspaceRoot — укажите корень воркспейса, где лежит backlog/',
    )
  }

  return {
    workspaceRoot,
    backlogBin: plugin.backlogBin,
    krTaskType: plugin.krTaskType,
    poTaskType: plugin.poTaskType,
    boardDocTitle: plugin.boardDocTitle,
    // Пустая строка здесь осмысленна («не привязывать»), поэтому нормализуем пробелы,
    // а не подставляем умолчание вместо пустого значения.
    sessionPath: plugin.sessionPath?.trim() ?? '',
  }
}
