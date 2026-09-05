/**
 * Конфигурация плагина: корень воркспейса, исполняемый файл Backlog.md, типы задач.
 *
 * Функция чистая — окружение приходит параметром, а не читается из `process.env`.
 * Так ядро остаётся без ввода-вывода и тестируется без подмены глобальных объектов;
 * `process.env` подставляет host-слой в точке запуска.
 *
 * Секретов здесь нет и быть не может: плагин ходит только в локальный `backlog`.
 */

export interface OkrConfig {
  /** Корень воркспейса: внутри него лежит `backlog/` с задачами, объективами и документами. */
  workspaceRoot: string
  /** Исполняемый файл Backlog.md. Обычно просто `backlog` из PATH. */
  backlogBin: string
  /** Тип задач Backlog.md, который считается ключевым результатом. */
  krTaskType: string
  /** Тип задач Backlog.md для операционных задач PO из панели работы. */
  poTaskType: string
  /**
   * Документ Backlog.md, в котором лежат подписи столбцов доски.
   *
   * Подписи спринтов — свойство доски, а не задачи, и держать их негде, кроме документа:
   * своего хранилища у плагина нет по условию. Документ читается и правится тем же CLI,
   * что и задачи.
   */
  boardDocTitle: string
  /**
   * Рабочее пространство по умолчанию для чатов по целям, относительно корня воркспейса.
   * К нему привязываются сессии кнопки «Продолжить в чате»: агент стартует там, где лежит
   * `backlog/`, и диалоги по целям собираются отдельной группой.
   *
   * Пустая строка означает «не привязывать» — тогда чат откатывается к текущему рабочему
   * пространству харнесса.
   */
  sessionPath: string
}

/** Версия Backlog.md, начиная с которой у задач и объективов есть дедлайны. */
export const REQUIRED_BACKLOG_VERSION = '1.51.0'

/**
 * Значения по умолчанию — рабочие без единой переменной окружения, кроме корня воркспейса.
 * Типы задач вынесены в настройку, а не зашиты: в чужом воркспейсе `okr` и `potask` могут
 * быть уже заняты под другое.
 */
const DEFAULTS = {
  backlogBin: 'backlog',
  krTaskType: 'okr',
  poTaskType: 'potask',
  boardDocTitle: 'okr-board',
  sessionPath: '',
} as const

export type Env = Record<string, string | undefined>

/** Пустая строка в окружении равносильна незаданной переменной. */
function value(env: Env, name: string): string | undefined {
  const raw = env[name]
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Собирает конфигурацию из окружения.
 * Бросает ошибку только на `OKR_WORKSPACE_ROOT` — без него плагину нечего читать,
 * а угадывать корень чужого воркспейса опаснее, чем упасть сразу и явно.
 */
export function loadConfig(env: Env): OkrConfig {
  const workspaceRoot = value(env, 'OKR_WORKSPACE_ROOT')
  if (!workspaceRoot) {
    throw new Error('не задан OKR_WORKSPACE_ROOT — укажите корень воркспейса, где лежит backlog/')
  }

  return {
    workspaceRoot,
    backlogBin: value(env, 'OKR_BACKLOG_BIN') ?? DEFAULTS.backlogBin,
    krTaskType: value(env, 'OKR_KR_TASK_TYPE') ?? DEFAULTS.krTaskType,
    poTaskType: value(env, 'OKR_PO_TASK_TYPE') ?? DEFAULTS.poTaskType,
    boardDocTitle: value(env, 'OKR_BOARD_DOC') ?? DEFAULTS.boardDocTitle,
    // Отдельно от value(): здесь пустая строка — не «переменная не задана», а осмысленное
    // «не привязывать чаты никуда». Смотрим на наличие ключа, а не на непустоту значения,
    // иначе выключить привязку через окружение было бы нечем.
    sessionPath: env['OKR_SESSION_PATH'] === undefined
      ? DEFAULTS.sessionPath
      : env['OKR_SESSION_PATH'].trim(),
  }
}

/** Человекочитаемая сводка о конфигурации — для диагностики в интерфейсе и логах. */
export function describeConfig(config: OkrConfig): string[] {
  return [
    `воркспейс: ${config.workspaceRoot}`,
    `backlog: ${config.backlogBin}`,
    `тип KR: ${config.krTaskType}`,
    `тип задач PO: ${config.poTaskType}`,
    `документ доски: ${config.boardDocTitle}`,
    `рабочее пространство чатов: ${config.sessionPath === '' ? 'не привязано (текущее)' : config.sessionPath}`,
  ]
}
