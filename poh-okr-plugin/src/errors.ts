/** Общий предок ошибок плагина: интерфейс показывает `message` пользователю как есть. */
export class OkrError extends Error {}

/** `backlog` не найден. Показываем, как поставить, — это самая частая причина пустого раздела. */
export class BacklogUnavailableError extends OkrError {
  constructor(bin: string, reason: string) {
    super(
      `не удалось запустить «${bin}»: ${reason}. ` +
        'Установите Backlog.md (npm i -g backlog.md) или укажите путь в OKR_BACKLOG_BIN',
    )
  }
}

/** CLI отработал, но вернул ошибку. Первая строка stderr обычно и есть причина. */
export class BacklogFailedError extends OkrError {
  constructor(command: string, code: number, stderr: string) {
    const reason = stderr.trim().split('\n')[0] || 'без сообщения'
    super(`команда «${command}» завершилась с кодом ${code}: ${reason}`)
  }
}

/**
 * Порт остановил команду по собственному таймауту. Даже успешный код возврата ничего не значит:
 * ребёнок мог заглушить SIGTERM и досчитать сам — вывод всё равно собирался под давлением
 * остановки и не заслуживает доверия как полный.
 */
export class BacklogTimeoutError extends OkrError {
  constructor(command: string) {
    super(
      `команда «${command}» не уложилась в отведённое время и была остановлена — результат мог оказаться неполным`,
    )
  }
}

/**
 * Версия Backlog.md старше требуемой.
 *
 * Отдельная ошибка, а не молчаливая деградация: дедлайны появились только в 1.51.0, и на
 * старом CLI панель работы молча потеряла бы группировку «Сегодня / На неделе», выглядя при
 * этом исправной.
 */
export class BacklogTooOldError extends OkrError {
  constructor(found: string, required: string) {
    super(
      `Backlog.md версии ${found} не умеет дедлайны задач — нужна ${required} или новее ` +
        '(npm i -g backlog.md@latest)',
    )
  }
}

/**
 * Идентификатор задачи приходит от пользователя интерфейса, поэтому проверяется до похода в CLI.
 * `backlog task view --help --plain` тоже отвечает кодом 0 и печатает справку, то есть
 * идентификатор вида `--help` без этой проверки дал бы «успешный» разбор мусора.
 */
export class InvalidTaskIdError extends OkrError {
  constructor(received: string) {
    super(`идентификатор задачи «${received}» не похож на настоящий (ожидался вид ПРЕФИКС-число)`)
  }
}

/** Идентификатор объектива приходит оттуда же и проверяется по тем же причинам. */
export class InvalidMilestoneIdError extends OkrError {
  constructor(received: string) {
    super(`идентификатор объектива «${received}» не похож на настоящий (ожидался вид m-число)`)
  }
}

/** Backlog.md отвечает кодом 0 и текстом «не найдено»: обычно это устаревший идентификатор. */
export class TaskNotFoundError extends OkrError {
  constructor(id: string) {
    super(`задача «${id}» не найдена в Backlog.md — идентификатор мог устареть`)
  }
}

/** Номер спринта пришёл из интерфейса и должен лежать внутри доски. */
export class SprintOutOfRangeError extends OkrError {
  constructor(sprint: number, count: number) {
    super(`спринт ${sprint + 1} выходит за пределы доски: столбцов всего ${count}`)
  }
}
