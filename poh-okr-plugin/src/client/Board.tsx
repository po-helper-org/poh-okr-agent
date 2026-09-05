/**
 * Доска целей: heatmap «ключевые результаты × спринты».
 *
 * Строки сгруппированы по объективам, ячейка — фаза KR в спринте. Левая кнопка мыши двигает
 * фазу вперёд по циклу, правая — назад и в пустое состояние.
 *
 * Пояснительных подписей, легенды и заголовков на доске нет намеренно (требование B-09):
 * расшифровка фаз живёт в базе знаний, на которую ведёт иконка в шапке. Поэтому ячейка несёт
 * только цвет и буквенный код.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { PHASES, SPRINT_COUNT, phaseOf, type Board as BoardModel, type KeyResult, type Phase } from '../model.js'
import { classNames as css, PHASE_CODES } from './styles.js'
import type { OkrLocaleKey } from './locales.js'
import { unwrap, type CallOkr } from './rpc.js'

export interface BoardProps {
  board: BoardModel
  t: (key: OkrLocaleKey) => string
  call: CallOkr
  /** Перечитать доску после записи: источник истины — Backlog.md, а не состояние экрана. */
  reload: () => void
  onOpenKr: (kr: KeyResult, objectiveTitle: string) => void
  onClose: () => void
}

/** Следующая фаза по циклу. `null` — пустая ячейка; она часть цикла, а не его отсутствие. */
function cycle(current: Phase | null, direction: 1 | -1): Phase | null {
  const index = current === null ? -1 : PHASES.indexOf(current)
  const next = index + direction
  if (next < 0) return PHASES[PHASES.length - 1]
  if (next >= PHASES.length) return null
  return PHASES[next]
}

/**
 * Правка текста прямо в разметке.
 * Значение пишется по `blur`, а не по каждому нажатию клавиши: запись идёт в Backlog.md через
 * CLI, и вызов на каждую букву превратил бы переименование в очередь из десятков процессов.
 */
function useCommitOnBlur(initial: string, commit: (value: string) => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current && ref.current.textContent !== initial) ref.current.textContent = initial
  }, [initial])
  const onBlur = useCallback(() => {
    const value = ref.current?.textContent?.trim() ?? ''
    if (value !== '' && value !== initial) commit(value)
    else if (ref.current) ref.current.textContent = initial
  }, [initial, commit])
  return { ref, onBlur }
}

function EditableText(
  { value, onCommit, className }: { value: string; onCommit: (next: string) => void; className: string },
) {
  const { ref, onBlur } = useCommitOnBlur(value, onCommit)
  return (
    <div
      ref={ref}
      className={className}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={onBlur}
      onKeyDown={event => {
        // Enter завершает правку, а не переносит строку: это однострочная подпись.
        if (event.key === 'Enter') { event.preventDefault(); (event.target as HTMLElement).blur() }
        if (event.key === 'Escape') { event.preventDefault(); (event.target as HTMLElement).blur() }
      }}
    >
      {value}
    </div>
  )
}

export function Board({ board, t, call, reload, onOpenKr, onClose }: BoardProps) {
  const [error, setError] = useState<string | null>(null)

  const write = useCallback(async (endpoint: string, payload: unknown) => {
    try {
      await unwrap(call(endpoint, payload))
      setError(null)
      reload()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [call, reload])

  const setPhase = (kr: KeyResult, sprint: number, direction: 1 | -1) => {
    const next = cycle(phaseOf(kr.phases[sprint]), direction)
    void write('setPhase', { id: kr.id, sprint, phase: next, labels: kr.labels })
  }

  const renameSprint = (index: number, label: string) => {
    const labels = [...board.sprintLabels]
    labels[index] = label
    void write('setSprintLabels', { sprintLabels: labels })
  }

  // Первая колонка — названия KR, дальше по колонке на спринт.
  const gridTemplate = `minmax(260px,360px) repeat(${SPRINT_COUNT},minmax(64px,1fr))`

  return (
    <div className={css.screen}>
      <div className={css.boardHeader}>
        <button type="button" className={css.iconButton} onClick={onClose} aria-label={t('close')}>✕</button>
        <div className={css.headerTitle}>{t('boardTitle')}</div>
        <button
          type="button"
          className={css.iconButton}
          aria-label={t('addObjective')}
          onClick={() => { void write('createObjective', { title: t('untitledObjective') }) }}
        >+</button>
        {/* База знаний (требование B-10). Целевая страница не определена — пока адрес не задан,
            кнопка отсутствует, а не ведёт в никуда. */}
      </div>

      {error !== null && <div className={css.stateMessage}>{error}</div>}

      <div className={css.boardScroll}>
        <div className={css.board} style={{ gridTemplateColumns: gridTemplate }}>
          <div className={css.sprintHead}>
            <div className={css.sprintCorner} />
            {board.sprintLabels.map((label, index) => (
              <EditableText
                key={index}
                value={label}
                className={`${css.sprintLabel} ${css.mono}`}
                onCommit={next => { renameSprint(index, next) }}
              />
            ))}
          </div>

          {board.objectives.map(objective => (
            <div key={objective.id || 'orphans'} style={{ display: 'contents' }}>
              <div className={css.objRow}>
                {/* Группа осиротевших KR — не объектив: переименовывать и удалять нечего. */}
                {objective.id === '' ? (
                  <div className={css.objTitle}>{t('noObjective')}</div>
                ) : (
                  <EditableText
                    value={objective.title}
                    className={css.objTitle}
                    onCommit={next => { void write('renameObjective', { from: objective.id, to: next }) }}
                  />
                )}
                {objective.id !== '' && (
                  <div className={css.objActions}>
                    <button
                      type="button"
                      className={css.iconButton}
                      aria-label={t('addKr')}
                      onClick={() => { void write('createKr', { title: t('newKr'), objectiveId: objective.id }) }}
                    >+</button>
                    <button
                      type="button"
                      className={css.iconButton}
                      aria-label={t('delete')}
                      onClick={() => { void write('removeObjective', { id: objective.id }) }}
                    >✕</button>
                  </div>
                )}
              </div>

              {objective.krs.map(kr => (
                <div key={kr.id} className={css.krRow}>
                  <button
                    type="button"
                    className={css.krTitle}
                    onClick={() => { onOpenKr(kr, objective.title) }}
                  >{kr.title}</button>
                  {kr.phases.map((code, sprint) => {
                    const phase = phaseOf(code)
                    return (
                      <div
                        key={sprint}
                        role="button"
                        tabIndex={0}
                        className={phase === null ? `${css.cell} ${css.cellEmpty}` : `${css.cell} ${css.mono}`}
                        data-phase={phase ?? undefined}
                        aria-label={`${kr.title} · ${board.sprintLabels[sprint]}`}
                        onClick={() => { setPhase(kr, sprint, 1) }}
                        onContextMenu={event => { event.preventDefault(); setPhase(kr, sprint, -1) }}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setPhase(kr, sprint, 1)
                          }
                        }}
                      >{phase === null ? '' : PHASE_CODES[phase]}</div>
                    )
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
