/**
 * Стили раздела — обычный текст CSS, инжектируемый одним `<style>` в `document.head`
 * (см. `apply()` в index.tsx), а не CSS-модуль.
 *
 * Причина та же, что у соседнего плагина харнесса: сборка стороннего плагина не умеет
 * `*.module.css`, а официальный `@tsdown/css` выносит стили в отдельный `lib/style.css`,
 * который `package.json#exports['./client']` не публикует и никто не подключает — вёрстка
 * тихо ломается без единой ошибки сборки. Текст CSS в `.ts` — приём, которым харнесс уже
 * пользуется вне монорепозитория.
 *
 * Раз хеширования имён от CSS-модуля нет, коллизии предотвращает префикс `okr-` на каждом
 * селекторе — через один и тот же объект `c`, чтобы разметка и карта имён не разошлись.
 *
 * Цвета хрома — только через токены харнесса `var(--dsw-alias-...)`: раздел живёт внутри чужой
 * оболочки и обязан следовать её теме. Имена берутся из живого харнесса, а не придумываются:
 * несуществующая переменная не вызывает ошибки — она молча наследует цвет родителя, и раздел
 * выглядит почти правильно ровно до первого экрана с собственным фоном, где вместо фона
 * оказывается дыра насквозь. «Бумажная» палитра прототипа сюда не переносится —
 * светлый лист внутри тёмного харнесса выглядел бы сломанным экраном, а не дизайном.
 *
 * Исключение — палитра пяти фаз: она из спецификации дословно. Эти цвета несут смысл
 * (фаза читается по цвету быстрее, чем по буквенному коду) и должны быть одинаковыми у всех,
 * кто смотрит на доску, независимо от выбранной темы. Каждая фаза — пара «фон / текст»,
 * контраст внутри пары держится сам по себе и от темы харнесса не зависит.
 */

/** Плоская карта «семантическое имя → фактический класс». Единственный источник этих строк. */
export const classNames = {
  navLayer: 'okr-nav-layer',
  navRail: 'okr-nav-rail',
  navButtons: 'okr-nav-buttons',
  navBadge: 'okr-nav-badge',
  navBadgeLabel: 'okr-nav-badge-label',

  panel: 'okr-panel',
  header: 'okr-header',
  headerTitle: 'okr-header-title',
  iconButton: 'okr-icon-button',
  tabBar: 'okr-tab-bar',
  tab: 'okr-tab',
  body: 'okr-body',
  footer: 'okr-footer',
  fullWidth: 'okr-full-width',

  addRow: 'okr-add-row',
  composer: 'okr-composer',
  composerLine: 'okr-composer-line',
  composerTitle: 'okr-composer-title',
  composerDescription: 'okr-composer-description',
  composerTools: 'okr-composer-tools',
  dateBtn: 'okr-date-btn',
  addBtn: 'okr-add-btn',
  pop: 'okr-pop',
  popItem: 'okr-pop-item',
  popGlyph: 'okr-pop-glyph',
  popSub: 'okr-pop-sub',
  cal: 'okr-cal',
  calQuick: 'okr-cal-quick',
  calHead: 'okr-cal-head',
  calMonth: 'okr-cal-month',
  calGrid: 'okr-cal-grid',
  calDow: 'okr-cal-dow',
  calDay: 'okr-cal-day',
  calFoot: 'okr-cal-foot',
  sheet: 'okr-sheet',
  grip: 'okr-grip',
  detailHead: 'okr-detail-head',
  detailBody: 'okr-detail-body',
  detailTitle: 'okr-detail-title',
  detailFoot: 'okr-detail-foot',
  editor: 'okr-editor',
  todoBox: 'okr-todo-box',
  todoText: 'okr-todo-text',
  sectionCard: 'okr-section-card',
  rowMain: 'okr-row-main',
  rowMeta: 'okr-row-meta',
  rowMarks: 'okr-row-marks',
  overdue: 'okr-overdue',
  flag: 'okr-flag',
  dateChip: 'okr-date-chip',
  dateChipLabel: 'okr-date-chip-label',
  dateChipInput: 'okr-date-chip-input',
  tabsRow: 'okr-tabs-row',
  addButton: 'okr-add-button',
  group: 'okr-group',
  groupHeader: 'okr-group-header',
  groupLabel: 'okr-group-label',
  groupCount: 'okr-group-count',
  item: 'okr-item',
  itemCheck: 'okr-item-check',
  itemTitle: 'okr-item-title',
  itemMeta: 'okr-item-meta',
  itemToday: 'okr-item-today',
  itemNote: 'okr-item-note',

  stateBlock: 'okr-state-block',
  stateTitle: 'okr-state-title',
  stateHint: 'okr-state-hint',
  stateMessage: 'okr-state-message',
  skeletonGroup: 'okr-skeleton-group',
  skeletonHead: 'okr-skeleton-head',
  skeletonLine: 'okr-skeleton-line',

  screen: 'okr-screen',
  boardHeader: 'okr-board-header',
  boardScroll: 'okr-board-scroll',
  board: 'okr-board',
  sprintHead: 'okr-sprint-head',
  sprintCorner: 'okr-sprint-corner',
  sprintLabel: 'okr-sprint-label',
  objRow: 'okr-obj-row',
  objTitle: 'okr-obj-title',
  objActions: 'okr-obj-actions',
  krRow: 'okr-kr-row',
  krTitle: 'okr-kr-title',
  cell: 'okr-cell',
  cellEmpty: 'okr-cell-empty',

  backdrop: 'okr-backdrop',
  sidebar: 'okr-sidebar',
  sidebarHead: 'okr-sidebar-head',
  sidebarTag: 'okr-sidebar-tag',
  sidebarTitle: 'okr-sidebar-title',
  field: 'okr-field',
  fieldLabel: 'okr-field-label',
  fieldInput: 'okr-field-input',
  fieldArea: 'okr-field-area',
  fieldRow: 'okr-field-row',
  planTable: 'okr-plan-table',
  planStage: 'okr-plan-stage',

  popup: 'okr-popup',
  card: 'okr-card',
  popupHead: 'okr-popup-head',
  popupTitle: 'okr-popup-title',
  popupBody: 'okr-popup-body',
  popupFoot: 'okr-popup-foot',
  content: 'okr-content',
  blockMenu: 'okr-block-menu',
  blockMenuItem: 'okr-block-menu-item',

  detail: 'okr-detail',
  detailTop: 'okr-detail-top',
  detailMain: 'okr-detail-main',
  graphPane: 'okr-graph-pane',
  graphNode: 'okr-graph-node',
  graphNodeSub: 'okr-graph-node-sub',
  graphCenter: 'okr-graph-center',
  graphMuted: 'okr-graph-muted',
  eventsPane: 'okr-events-pane',
  eventsFilter: 'okr-events-filter',
  chip: 'okr-chip',
  eventsList: 'okr-events-list',
  event: 'okr-event',
  eventDate: 'okr-event-date',
  eventType: 'okr-event-type',
  eventTitle: 'okr-event-title',
  mono: 'okr-mono',
} as const

const c = classNames

/**
 * Палитра фаз из спецификации. Пара «фон / текст» на каждую фазу.
 * Значения переносятся дословно: они и есть визуальный язык доски.
 */
export const PHASE_COLORS: Readonly<Record<string, { bg: string; fg: string }>> = {
  research: { bg: '#EDE9FB', fg: '#6E56CF' },
  analyze: { bg: '#E5EFF8', fg: '#2F72B8' },
  dev: { bg: '#E4F4EC', fg: '#2F9E6E' },
  qa: { bg: '#F8EEDC', fg: '#C1861A' },
  release: { bg: '#F7E7E5', fg: '#B33F3F' },
}

/** Буквенный код фазы в ячейке: интерфейс без пояснительных подписей (требование B-09). */
export const PHASE_CODES: Readonly<Record<string, string>> = {
  research: 'R',
  analyze: 'A',
  dev: 'D',
  qa: 'Q',
  release: 'L',
}

const phaseRules = Object.entries(PHASE_COLORS)
  .map(([phase, { bg, fg }]) => `.${c.cell}[data-phase="${phase}"]{background:${bg};color:${fg};}`)
  .join('\n')

/** Короткая подпись срока: сегодня и завтра словом, остальное числом. */
export function dueLabel(due: string, t: (key: 'dateToday' | 'dateTomorrow' | 'dateYesterday') => string): string {
  const now = new Date()
  const day = (shift: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift)
    const pad = (n: number) => `${n}`.padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  if (due === day(0)) return t('dateToday')
  if (due === day(1)) return t('dateTomorrow')
  if (due === day(-1)) return t('dateYesterday')
  return `${due.slice(8, 10)}.${due.slice(5, 7)}`
}

export const styleText = `
/* ——— Кнопка раздела в подвале левой панели ———
 *
 * Подвал («footerActions» харнесса) — один flex-ряд с «nowrap», рассчитанный на одну запись.
 * Соседний раздел занимает его целиком фиксированной шириной, поэтому вторая запись уезжает
 * за правый край сайдбара: в разметке она есть, на экране её нет и нажать нечего.
 *
 * Разрешаем ряду переносить записи и просим для себя целую строку. Правило точечное — оно
 * действует только на тот подвал, внутри которого есть наша запись, и ничего не меняет там,
 * где её нет. Между рядом и записью стоит якорь слота с «display:contents», поэтому в
 * селекторе два уровня вложенности, а не один. */
div:has(> div > .${c.navLayer}){flex-wrap:wrap;}
.${c.navLayer}{display:flex;flex-direction:column;gap:4px;flex-basis:100%;width:100%;
  /* Столько же, сколько подвал сам отбивает до «Settings»: иначе наша запись висит
   * с разными зазорами сверху и снизу. */
  margin-top:4px;}
.${c.navButtons}{display:flex;align-items:center;gap:4px;}
.${c.navRail} .${c.navButtons}{flex-direction:column;}
/* Геометрия снята с соседних записей подвала (раздел требований и «Settings») и повторена
 * числом в число: высота 42, радиус 12, отступы 0/10/0/8, шрифт 14. Расхождение хотя бы в
 * паре пикселей видно сразу — иконки трёх строк перестают стоять на одной вертикали.
 * Ширина 260 при контейнере 256 достигается вылетом на 2px в каждую сторону — так же,
 * как это сделано у соседа. */
.${c.navBadge}{display:flex;align-items:center;gap:8px;border:none;background:transparent;
  color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:12px;
  padding:0 10px 0 8px;height:42px;font-size:14px;text-align:left;
  width:calc(100% + 4px);margin:0 -2px;
  transition:background var(--ds-transition-duration-fast) ease;}
.${c.navRail} .${c.navLayer}{flex-basis:auto;width:auto;}
.${c.navRail} .${c.navBadge}{width:36px;height:36px;justify-content:center;padding:0;
  border-radius:50%;margin:0;}
.${c.navBadge}:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}
.${c.navBadge}[data-active]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}
.${c.navBadgeLabel}{font-size:13px;white-space:nowrap;}

/* ——— Панель работы ——— */
.${c.panel}{position:fixed;top:0;right:0;bottom:0;width:420px;max-width:100vw;z-index:40;
  display:flex;flex-direction:column;pointer-events:auto;
  background:var(--dsw-alias-bg-base);border-left:1px solid var(--dsw-alias-border-l2);
  box-shadow:-8px 0 24px rgba(0,0,0,.12);}
.${c.header}{display:flex;align-items:center;gap:8px;padding:12px 16px;
  border-bottom:1px solid var(--dsw-alias-border-l2);}
.${c.headerTitle}{flex:1;font-size:11px;letter-spacing:.08em;text-transform:uppercase;
  color:var(--dsw-alias-label-caption);}
.${c.iconButton}{display:flex;align-items:center;justify-content:center;width:28px;height:28px;
  border:none;background:transparent;color:var(--dsw-alias-label-caption);border-radius:6px;cursor:pointer;}
.${c.iconButton}:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}
.${c.tabsRow}{display:flex;gap:6px;padding:10px 14px 2px;}
/* Вкладки — чипы брендбука; подчёркнутых табов в нём нет. */
.${c.tabBar}{display:flex;gap:2px;padding:0 12px;}
.${c.body}{flex:1;overflow-y:auto;padding:8px 0 16px;}
.${c.footer}{padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l2);}
.${c.fullWidth}{width:100%;}

.${c.addRow}{padding:10px 14px 4px;}

/* Быстрый ввод: постоянная строка вверху панели. Рамка подсвечивается, только когда в него
 * начали писать, — пустой composer не должен перетягивать внимание на себя. */
/* ——— Быстрый ввод ———
 * По умолчанию одна строка. Раскрывается только по Shift+Enter: раскрытие по фокусу
 * заставляло панель прыгать от случайного клика мимо списка. */
.${c.composer}{margin:10px 14px 4px;padding:9px 10px;border-radius:10px;position:relative;
  border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);
  display:flex;flex-direction:column;gap:8px;
  transition:border-color var(--ds-transition-duration-fast) ease;}
.${c.composer}[data-open]{border-color:var(--dsw-alias-button-info-fill);}
.${c.composerLine}{display:flex;align-items:center;gap:8px;}
.${c.composerTitle},.${c.composerDescription}{border:none;background:transparent;padding:0;
  font:inherit;outline:none;width:100%;color:var(--dsw-alias-label-primary);}
/* Название всегда одна строка: перенос ломает ритм строк списка и сдвигает секции. */
.${c.composerTitle}{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.${c.composerTitle}::placeholder,.${c.composerDescription}::placeholder{
  color:var(--dsw-alias-label-caption);}
.${c.composerDescription}{font-size:13px;color:var(--dsw-alias-label-secondary);resize:none;
  min-height:22px;overflow:hidden;}
.${c.composerTools}{display:flex;align-items:center;gap:2px;}
.${c.dateBtn}{display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:8px;
  border:none;background:transparent;cursor:pointer;font-size:13px;
  color:var(--dsw-alias-label-tertiary);}
.${c.dateBtn}:hover{background:var(--dsw-alias-interactive-bg-hover);}
.${c.dateBtn}[data-set]{color:var(--dsw-alias-button-info-fill);}
.${c.addBtn}{padding:6px 16px;border-radius:999px;border:none;cursor:pointer;font-size:13px;
  background:var(--dsw-alias-button-info-fill);color:#fff;}
.${c.addBtn}:disabled{opacity:.35;cursor:default;}

/* ——— Всплывающие слои и календарь ——— */
.${c.pop}{position:fixed;z-index:80;padding:4px;border-radius:12px;
  background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);
  box-shadow:0 12px 32px rgba(0,0,0,.22);pointer-events:auto;}
.${c.popItem}{display:flex;align-items:center;gap:9px;width:100%;text-align:left;padding:7px 9px;
  border:none;background:transparent;border-radius:7px;cursor:pointer;font-size:13px;
  color:var(--dsw-alias-label-primary);white-space:nowrap;}
.${c.popItem}:hover{background:var(--dsw-alias-interactive-bg-hover);}
.${c.popGlyph}{width:22px;flex-shrink:0;text-align:center;font-size:12px;
  color:var(--dsw-alias-label-tertiary);display:flex;justify-content:center;}
.${c.popSub}{display:block;font-size:11px;color:var(--dsw-alias-label-caption);}
.${c.cal}{width:268px;padding:10px;}
.${c.calQuick}{display:flex;gap:4px;padding:2px 2px 8px;
  border-bottom:1px solid var(--dsw-alias-border-l2);}
.${c.calQuick} button{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;
  padding:6px 2px;border:none;background:transparent;border-radius:8px;cursor:pointer;
  font-size:10px;color:var(--dsw-alias-label-tertiary);}
.${c.calQuick} button:hover{background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-primary);}
.${c.calHead}{display:flex;align-items:center;gap:4px;padding:8px 2px 6px;}
.${c.calMonth}{flex:1;font-size:14px;font-weight:600;}
.${c.calGrid}{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
.${c.calDow}{text-align:center;font-size:11px;color:var(--dsw-alias-label-caption);padding:2px 0 4px;}
.${c.calDay}{height:30px;border:none;background:transparent;border-radius:8px;cursor:pointer;
  font-size:13px;color:var(--dsw-alias-label-primary);}
.${c.calDay}:hover{background:var(--dsw-alias-interactive-bg-hover);}
.${c.calDay}[data-out]{color:var(--dsw-alias-label-caption);}
.${c.calDay}[data-today]{box-shadow:inset 0 0 0 1px var(--dsw-alias-button-info-fill);}
.${c.calDay}[data-sel]{background:var(--dsw-alias-button-info-fill);color:#fff;}
.${c.calFoot}{display:flex;gap:8px;padding-top:10px;margin-top:6px;
  border-top:1px solid var(--dsw-alias-border-l2);}
.${c.calFoot} button{flex:1;padding:7px;border-radius:8px;cursor:pointer;font-size:13px;
  border:1px solid var(--dsw-alias-border-l2);background:transparent;
  color:var(--dsw-alias-label-secondary);}
.${c.calFoot} button[data-primary]{border-color:transparent;
  background:var(--dsw-alias-button-info-fill);color:#fff;}

/* ——— Список ——— */
.${c.addRow}{padding:10px 14px 4px;}
.${c.group}{padding:6px 14px 10px;}
.${c.groupHeader}{display:flex;align-items:baseline;gap:6px;padding:6px 2px;}
.${c.groupLabel}{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);}
.${c.groupLabel}[data-overdue]{color:var(--dsw-alias-state-error-primary);}
.${c.groupCount}{font-size:12px;color:var(--dsw-alias-label-caption);}
/* Секция — не только заголовок, но и отдельная карточка: на длинном списке глаз теряет,
 * где группа кончилась. Подложка — тонированный слой наведения, а не bg-layer-1: в светлой
 * теме он равен фону панели, и карточки не видно вовсе. */
.${c.sectionCard}{border-radius:12px;background:var(--dsw-alias-interactive-bg-hover);
  overflow:hidden;}

/* Строка задачи: круглый чекбокс, название в одну строку, срок под ним, значки справа. */
.${c.item}{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:none;
  background:transparent;text-align:left;cursor:pointer;color:var(--dsw-alias-label-primary);}
.${c.item} + .${c.item}{box-shadow:inset 0 1px 0 var(--dsw-alias-border-l2);}
.${c.item}:hover,.${c.item}[data-active]{background:var(--dsw-alias-interactive-bg-hover);}

/* Круглый чекбокс. Контур цветом подписи, а не токеном границы: границы в этой теме
 * волосяные (4% чёрного), и контрол с такой рамкой выглядит отсутствующим. */
.${c.itemCheck}{flex-shrink:0;width:18px;height:18px;border-radius:50%;cursor:pointer;
  border:1.5px solid var(--dsw-alias-label-caption);background:transparent;padding:0;
  display:flex;align-items:center;justify-content:center;
  transition:border-color var(--ds-transition-duration-fast) ease,
    background var(--ds-transition-duration-fast) ease;}
.${c.itemCheck}:hover{border-color:var(--dsw-alias-label-primary);}
.${c.itemCheck}[data-kind="control"]{border-color:#2F72B8;}
.${c.itemCheck}[data-kind="risk"]{border-color:#B33F3F;}
.${c.itemCheck}[data-overdue]{border-color:var(--dsw-alias-state-error-primary);}
.${c.itemCheck}[data-done]{background:var(--dsw-alias-label-secondary);
  border-color:var(--dsw-alias-label-secondary);}
.${c.itemCheck}[data-done]::after{content:"";width:9px;height:5px;margin-top:-2px;
  border-left:1.5px solid var(--dsw-alias-bg-base);
  border-bottom:1.5px solid var(--dsw-alias-bg-base);transform:rotate(-45deg);}

.${c.rowMain}{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}
/* Название всегда одна строка: перенос ломает ритм строк и сдвигает секции. */
.${c.itemTitle}{font-size:14px;line-height:1.35;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;}
.${c.item}[data-done] .${c.itemTitle}{color:var(--dsw-alias-label-caption);
  text-decoration:line-through;}
.${c.rowMeta}{font-size:12px;color:var(--dsw-alias-label-caption);white-space:nowrap;}
.${c.rowMeta}[data-overdue]{color:var(--dsw-alias-state-error-primary);}
.${c.rowMarks}{display:flex;align-items:center;gap:6px;flex-shrink:0;
  color:var(--dsw-alias-label-caption);}
.${c.flag}[data-priority="high"]{color:var(--dsw-alias-state-error-primary);}
.${c.flag}[data-priority="medium"]{color:#C1861A;}
.${c.flag}[data-priority="low"]{color:var(--dsw-alias-button-info-fill);}

.${c.stateBlock}{display:flex;flex-direction:column;align-items:center;gap:6px;
  padding:52px 24px;text-align:center;}
.${c.stateTitle}{font-size:14px;color:var(--dsw-alias-label-secondary);}
.${c.stateHint}{font-size:12px;color:var(--dsw-alias-label-caption);}
.${c.stateMessage}{font-size:12px;color:var(--dsw-alias-label-caption);word-break:break-word;
  padding:8px 16px;}
.${c.skeletonGroup}{padding:8px 16px;}
.${c.skeletonHead}{height:11px;width:80px;margin:10px 0;border-radius:4px;
  background:var(--dsw-alias-interactive-bg-hover);}
.${c.skeletonLine}{height:14px;margin:10px 0;border-radius:4px;
  background:var(--dsw-alias-interactive-bg-hover);}

/* ——— Экран доски и детальной страницы ——— */
.${c.screen}{position:fixed;inset:0;z-index:30;display:flex;flex-direction:column;
  pointer-events:auto;background:var(--dsw-alias-bg-base);}
.${c.boardHeader}{flex-shrink:0;display:flex;align-items:center;gap:8px;padding:8px 16px;
  border-bottom:1px solid var(--dsw-alias-border-l1);}
.${c.boardScroll}{flex:1;overflow:auto;}
.${c.board}{display:grid;min-width:max-content;}
.${c.sprintHead}{display:contents;}
.${c.sprintCorner}{position:sticky;left:0;top:0;z-index:3;background:var(--dsw-alias-bg-base);
  border-bottom:1px solid var(--dsw-alias-border-l1);}
.${c.sprintLabel}{position:sticky;top:0;z-index:2;padding:8px 6px;text-align:center;
  background:var(--dsw-alias-bg-base);border-bottom:1px solid var(--dsw-alias-border-l1);
  font-size:11px;color:var(--dsw-alias-label-caption);outline:none;}
.${c.sprintLabel}:focus{color:var(--dsw-alias-label-primary);}
.${c.objRow}{grid-column:1/-1;display:flex;align-items:center;gap:8px;padding:8px 12px;
  position:sticky;left:0;background:var(--dsw-alias-interactive-bg-hover);border-top:1px solid var(--dsw-alias-border-l1);}
.${c.objTitle}{flex:1;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);outline:none;}
.${c.objActions}{display:flex;gap:2px;}
.${c.krRow}{display:contents;}
.${c.krTitle}{position:sticky;left:0;z-index:1;min-width:260px;max-width:360px;padding:8px 12px;
  background:var(--dsw-alias-bg-base);border-top:1px solid var(--dsw-alias-border-l2);text-align:left;
  border-left:none;border-right:none;border-bottom:none;color:var(--dsw-alias-label-primary);
  font-size:13px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.${c.krTitle}:hover{background:var(--dsw-alias-bg-layer-1);}
.${c.cell}{min-width:64px;border-top:1px solid var(--dsw-alias-border-l2);
  border-left:1px solid var(--dsw-alias-border-l2);cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:600;letter-spacing:.04em;user-select:none;}
${phaseRules}
.${c.cellEmpty}{background:repeating-linear-gradient(45deg,transparent,transparent 4px,
  var(--dsw-alias-border-l2) 4px,var(--dsw-alias-border-l2) 5px);}

/* ——— Сайдбар ключевого результата ——— */
.${c.backdrop}{position:fixed;inset:0;z-index:45;background:rgba(0,0,0,.35);pointer-events:auto;}
.${c.sidebar}{position:fixed;top:0;right:0;bottom:0;width:420px;max-width:100vw;z-index:50;
  display:flex;flex-direction:column;pointer-events:auto;background:var(--dsw-alias-bg-base);
  border-left:1px solid var(--dsw-alias-border-l2);box-shadow:-8px 0 24px rgba(0,0,0,.12);}
.${c.sidebarHead}{display:flex;align-items:flex-start;gap:8px;padding:12px 16px;
  border-bottom:1px solid var(--dsw-alias-border-l2);}
.${c.sidebarTag}{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-caption);}
.${c.sidebarTitle}{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);outline:none;
  margin-top:2px;}
.${c.field}{padding:10px 16px;display:flex;flex-direction:column;gap:4px;}
.${c.fieldLabel}{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-caption);}
.${c.fieldInput},.${c.fieldArea}{width:100%;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:6px 8px;font-size:13px;
  font-family:inherit;}
.${c.fieldArea}{min-height:64px;resize:vertical;}
.${c.fieldRow}{display:flex;gap:8px;}
.${c.fieldRow} > *{flex:1;}
.${c.planTable}{display:flex;flex-direction:column;gap:6px;padding:0 16px;}
.${c.planStage}{display:grid;grid-template-columns:72px 1fr 1fr;gap:6px;align-items:center;}

/* ——— Сайдбар задачи ———
 * Задача открывается сайдбаром слева от панели, а не модалкой поверх неё: модалка
 * закрывает ровно тот список, по которому в этот момент и ориентируются. */
.${c.sheet}{position:fixed;top:0;bottom:0;display:flex;flex-direction:column;z-index:44;
  pointer-events:auto;background:var(--dsw-alias-bg-base);
  border-left:1px solid var(--dsw-alias-border-l2);
  border-right:1px solid var(--dsw-alias-border-l2);
  box-shadow:-8px 0 24px rgba(0,0,0,.10);}
/* Ручка растягивания: узкая полоса вдоль левой границы, видимая под курсором. */
.${c.grip}{position:absolute;left:-3px;top:0;bottom:0;width:6px;cursor:col-resize;z-index:5;}
.${c.grip}:hover,.${c.grip}[data-dragging]{background:var(--dsw-alias-button-info-fill);
  opacity:.5;}
.${c.detailHead}{display:flex;align-items:center;gap:10px;padding:12px 16px;
  border-bottom:1px solid var(--dsw-alias-border-l2);}
.${c.detailBody}{flex:1;overflow-y:auto;padding:14px 18px;}
.${c.detailTitle}{font-size:20px;font-weight:700;line-height:1.3;outline:none;
  padding-bottom:8px;color:var(--dsw-alias-label-primary);}
.${c.detailFoot}{display:flex;align-items:center;gap:4px;padding:10px 14px;
  border-top:1px solid var(--dsw-alias-border-l2);font-size:12px;
  color:var(--dsw-alias-label-caption);}

/* ——— Блочный редактор описания ———
 * Каждая строка — блок со своим типом в data-block, и тип целиком отвечает за вид.
 * Так разметку можно собрать обратно в markdown построчно, а Backlog.md хранит именно
 * markdown: описание, открытое в CLI или в файле, должно остаться читаемым. */
.${c.editor}{width:100%;min-height:220px;outline:none;font-size:14px;line-height:1.6;
  color:var(--dsw-alias-label-primary);counter-reset:okr-num;}
.${c.editor} > *{margin:0;padding:2px 0;position:relative;}
/* Подсказка только у полностью пустого описания: на каждой пустой строке она
 * превращает редактор в частокол из повторяющегося текста. */
.${c.editor}[data-empty] [data-block="text"]:empty::before{content:attr(data-placeholder);
  color:var(--dsw-alias-label-caption);}
.${c.editor} [data-block="h1"]{font-size:21px;font-weight:700;padding-top:10px;}
.${c.editor} [data-block="h2"]{font-size:17px;font-weight:700;padding-top:8px;}
.${c.editor} [data-block="h3"]{font-size:15px;font-weight:600;padding-top:6px;}
.${c.editor} [data-block="bullet"],.${c.editor} [data-block="number"]{padding-left:22px;}
.${c.editor} [data-block="bullet"]::before{content:"\\2022";position:absolute;left:6px;
  color:var(--dsw-alias-button-info-fill);}
.${c.editor} [data-block="number"]{counter-increment:okr-num;}
.${c.editor} [data-block="number"]::before{content:counter(okr-num) ".";position:absolute;
  left:2px;color:var(--dsw-alias-label-caption);font-size:13px;}
.${c.editor} [data-block="quote"]{padding-left:12px;color:var(--dsw-alias-label-secondary);
  border-left:2px solid var(--dsw-alias-border-l3);}
.${c.editor} [data-block="divider"]{padding:0;height:1px;
  background:var(--dsw-alias-border-l2);margin:12px 0;}
.${c.editor} [data-block="todo"]{display:flex;align-items:flex-start;gap:8px;}
.${c.todoBox}{flex-shrink:0;width:16px;height:16px;margin-top:4px;border-radius:4px;
  border:1.5px solid var(--dsw-alias-label-caption);background:transparent;cursor:pointer;
  padding:0;display:flex;align-items:center;justify-content:center;}
.${c.todoBox}[data-on]{background:var(--dsw-alias-button-info-fill);
  border-color:var(--dsw-alias-button-info-fill);}
.${c.todoBox}[data-on]::after{content:"";width:8px;height:4px;margin-top:-2px;
  border-left:1.5px solid #fff;border-bottom:1.5px solid #fff;transform:rotate(-45deg);}
.${c.editor} .${c.todoText}{flex:1;outline:none;}
.${c.editor} [data-block="todo"][data-done] .${c.todoText}{
  color:var(--dsw-alias-label-caption);text-decoration:line-through;}

/* ——— Детальная страница ——— */
.${c.detailTop}{flex-shrink:0;display:flex;align-items:center;gap:8px;padding:8px 16px;
  border-bottom:1px solid var(--dsw-alias-border-l1);}
.${c.detailMain}{flex:1;display:flex;min-height:0;}
.${c.graphPane}{flex:1;min-width:0;position:relative;overflow:hidden;}
.${c.graphNode}{position:absolute;transform:translate(-50%,-50%);max-width:132px;padding:5px 8px;
  border-radius:7px;background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);
  font-size:11px;line-height:1.25;color:var(--dsw-alias-label-primary);text-align:center;}
.${c.graphNodeSub}{display:block;font-size:10px;color:var(--dsw-alias-label-caption);}
.${c.graphMuted}{opacity:.42;}
.${c.graphCenter}{position:absolute;transform:translate(-50%,-50%);max-width:190px;padding:10px 12px;
  border-radius:9px;background:var(--dsw-alias-bg-base);border:2px solid var(--dsw-alias-label-primary);
  font-size:13px;font-weight:600;text-align:center;color:var(--dsw-alias-label-primary);}
.${c.eventsPane}{width:380px;max-width:38%;flex-shrink:0;display:flex;flex-direction:column;
  border-left:1px solid var(--dsw-alias-border-l1);}
.${c.eventsFilter}{display:flex;flex-wrap:wrap;gap:4px;padding:10px 12px;
  border-bottom:1px solid var(--dsw-alias-border-l2);}
.${c.chip}{padding:3px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);
  background:transparent;color:var(--dsw-alias-label-caption);font-size:11px;cursor:pointer;}
.${c.chip}[data-active]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);
  border-color:var(--dsw-alias-border-l1);}
.${c.eventsList}{flex:1;overflow-y:auto;padding:4px 0;}
.${c.event}{width:100%;display:flex;flex-direction:column;gap:2px;padding:8px 12px;border:none;
  background:transparent;text-align:left;cursor:pointer;}
.${c.event}:hover{background:var(--dsw-alias-bg-layer-1);}
.${c.eventDate}{font-size:10px;color:var(--dsw-alias-label-caption);}
.${c.eventType}{font-size:10px;color:var(--dsw-alias-label-secondary);}
.${c.eventTitle}{font-size:13px;color:var(--dsw-alias-label-primary);}
.${c.mono}{font-family:var(--ds-font-family-code),ui-monospace,SFMono-Regular,Menlo,monospace;}

@media (max-width:620px){
  .${c.panel},.${c.sidebar}{width:100vw;}
  .${c.eventsPane}{width:100%;max-width:100%;}
  .${c.detailMain}{flex-direction:column;}
}
`
