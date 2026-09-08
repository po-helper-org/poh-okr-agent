/**
 * Доска целей: heatmap «ключевые результаты × спринты».
 *
 * Доска только показывает состояние и ничего не меняет. Раскладка фаз, состав объективов
 * и подписи спринтов — результат планирования, а планирование идёт через чат с навыками
 * `/okr-*`: там есть контекст квартала, дебаты и валидация. Кнопка, правящая клетку в
 * обход этого, рассинхронизировала бы доску с артефактами планирования.
 *
 * Пояснительных подписей и легенды нет намеренно (требование B-09): расшифровка фаз живёт
 * в базе знаний, поэтому ячейка несёт только цвет и буквенный код.
 */
import { SPRINT_COUNT, phaseOf, type Board as BoardModel, type KeyResult } from '../model.js'
import { Icon } from './icons.js'
import type { OkrLocaleKey } from './locales.js'
import { classNames as css, PHASE_CODES } from './styles.js'

export interface BoardProps {
  board: BoardModel
  t: (key: OkrLocaleKey) => string
  onOpenKr: (kr: KeyResult, objectiveTitle: string) => void
  onOpenObjective: (id: string, title: string) => void
  onPlan: () => void
  onPresent: () => void
  onClose: () => void
}

export function Board({ board, t, onOpenKr, onOpenObjective, onPlan, onPresent, onClose }: BoardProps) {
  // Первая колонка — названия KR, дальше по колонке на спринт.
  const gridTemplate = `minmax(260px,360px) repeat(${SPRINT_COUNT},minmax(64px,1fr))`

  return (
    <div className={css.screen}>
      <div className={css.boardHeader}>
        <button type="button" className={css.iconButton} onClick={onClose} aria-label={t('back')}>
          <Icon name="chevronLeft" />
        </button>
        <div className={css.headerTitle}>{t('boardTitle')}</div>
        <span style={{ flex: 1 }} />
        {/* Обе кнопки уводят в чат с готовой командой: доска показывает, планирует агент. */}
        <button type="button" className={css.boardAction} onClick={onPlan}>{t('planOkr')}</button>
        <button type="button" className={css.boardAction} onClick={onPresent}>{t('generateDeck')}</button>
      </div>

      <div className={css.boardScroll}>
        <div className={css.board} style={{ gridTemplateColumns: gridTemplate }}>
          <div className={css.sprintHead}>
            <div className={css.sprintCorner} />
            {board.sprintLabels.map((label, index) => (
              <div key={index} className={`${css.sprintLabel} ${css.mono}`}>{label}</div>
            ))}
          </div>

          {board.objectives.map(objective => (
            <div key={objective.id || 'orphans'} style={{ display: 'contents' }}>
              {/* Объектив — такая же карточка, как ключевой результат: у него есть
                  описание и срок, и по нажатию открывается его страница. Группа
                  осиротевших KR карточкой не является — открывать нечего. */}
              {objective.id === '' ? (
                <div className={css.objRow}><div className={css.objTitle}>{t('noObjective')}</div></div>
              ) : (
                <button
                  type="button"
                  className={`${css.objRow} ${css.objRowButton}`}
                  onClick={() => { onOpenObjective(objective.id, objective.title) }}
                >
                  <span className={css.objTitle}>{objective.title}</span>
                  <span className={css.objCount}>{objective.krs.length}</span>
                </button>
              )}

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
                        className={phase === null ? `${css.cell} ${css.cellEmpty}` : `${css.cell} ${css.mono}`}
                        data-phase={phase ?? undefined}
                        title={`${kr.title} · ${board.sprintLabels[sprint]}`}
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
