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

export const styleText = `
/* ——— Кнопка раздела в подвале левой панели ——— */
.${c.navLayer}{display:flex;flex-direction:column;gap:4px;}
.${c.navButtons}{display:flex;align-items:center;gap:4px;}
.${c.navRail} .${c.navButtons}{flex-direction:column;}
.${c.navBadge}{display:flex;align-items:center;gap:8px;border:none;background:transparent;
  color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:8px;padding:8px;
  transition:background var(--ds-transition-duration-fast) ease,color var(--ds-transition-duration-fast) ease;}
.${c.navRail} .${c.navBadge}{width:36px;height:36px;justify-content:center;padding:0;border-radius:50%;}
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
.${c.tabBar}{display:flex;gap:2px;padding:0 12px;border-bottom:1px solid var(--dsw-alias-border-l2);}
.${c.tab}{flex:1;border:none;background:transparent;cursor:pointer;padding:10px 4px;
  font-size:13px;color:var(--dsw-alias-label-caption);border-bottom:2px solid transparent;}
.${c.tab}[data-active]{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-label-primary);}
.${c.body}{flex:1;overflow-y:auto;padding:8px 0 16px;}
.${c.footer}{padding:12px 16px;border-top:1px solid var(--dsw-alias-border-l2);}
.${c.fullWidth}{width:100%;}

.${c.addRow}{padding:8px 16px;}
.${c.addButton}{width:100%;display:flex;align-items:center;gap:8px;padding:8px 10px;
  border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;background:transparent;
  color:var(--dsw-alias-label-caption);cursor:pointer;font-size:13px;}
.${c.addButton}:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1);}

.${c.group}{margin-top:8px;}
.${c.groupHeader}{display:flex;align-items:center;gap:8px;padding:6px 16px;}
.${c.groupLabel}{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-caption);}
.${c.groupCount}{font-size:11px;color:var(--dsw-alias-label-caption);}
.${c.item}{display:flex;align-items:center;gap:10px;width:100%;padding:8px 16px;border:none;
  background:transparent;text-align:left;cursor:pointer;color:var(--dsw-alias-label-primary);}
.${c.item}:hover{background:var(--dsw-alias-bg-layer-1);}
.${c.itemCheck}{flex-shrink:0;width:16px;height:16px;border-radius:4px;cursor:pointer;
  border:1.5px solid var(--dsw-alias-border-l1);background:transparent;padding:0;}
.${c.itemCheck}[data-kind="control"]{border-color:#2F72B8;}
.${c.itemCheck}[data-kind="risk"]{border-color:#B33F3F;}
.${c.itemCheck}[data-done]{background:var(--dsw-alias-label-caption);border-color:var(--dsw-alias-label-caption);}
.${c.itemTitle}{flex:1;font-size:13px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;}
.${c.item}[data-done] .${c.itemTitle}{color:var(--dsw-alias-label-caption);text-decoration:line-through;}
.${c.itemMeta}{flex-shrink:0;font-size:11px;color:var(--dsw-alias-label-caption);}
.${c.itemToday}{color:var(--dsw-alias-label-primary);font-weight:600;}
.${c.itemNote}{flex-shrink:0;width:5px;height:5px;border-radius:50%;background:var(--dsw-alias-label-caption);}

.${c.stateBlock}{display:flex;flex-direction:column;align-items:center;gap:6px;padding:48px 24px;
  text-align:center;}
.${c.stateTitle}{font-size:14px;color:var(--dsw-alias-label-secondary);}
.${c.stateHint}{font-size:12px;color:var(--dsw-alias-label-caption);}
.${c.stateMessage}{font-size:12px;color:var(--dsw-alias-label-caption);word-break:break-word;}
.${c.skeletonGroup}{padding:8px 16px;}
.${c.skeletonHead}{height:11px;width:80px;margin:10px 0;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover);}
.${c.skeletonLine}{height:14px;margin:10px 0;border-radius:4px;background:var(--dsw-alias-interactive-bg-hover);}

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

/* ——— Попап задачи и меню блоков ——— */
.${c.popup}{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:60;
  width:min(560px,92vw);max-height:80vh;display:flex;flex-direction:column;pointer-events:auto;
  background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;
  box-shadow:0 16px 48px rgba(0,0,0,.28);}
.${c.popupHead}{display:flex;align-items:center;gap:8px;padding:12px 16px;
  border-bottom:1px solid var(--dsw-alias-border-l2);}
.${c.popupTitle}{flex:1;font-size:18px;font-weight:600;color:var(--dsw-alias-label-primary);outline:none;}
.${c.popupBody}{flex:1;overflow-y:auto;padding:12px 16px;}
.${c.popupFoot}{display:flex;align-items:center;gap:8px;padding:10px 16px;
  border-top:1px solid var(--dsw-alias-border-l2);font-size:11px;color:var(--dsw-alias-label-caption);}
.${c.content}{min-height:120px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);outline:none;}
.${c.content}:empty::before{content:attr(data-placeholder);color:var(--dsw-alias-label-caption);}
.${c.content} blockquote{margin:8px 0;padding-left:10px;border-left:2px solid var(--dsw-alias-border-l1);
  color:var(--dsw-alias-label-secondary);}
.${c.blockMenu}{position:fixed;z-index:70;min-width:190px;max-height:280px;overflow-y:auto;
  padding:4px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;
  box-shadow:0 8px 24px rgba(0,0,0,.24);pointer-events:auto;}
.${c.blockMenuItem}{width:100%;display:block;text-align:left;padding:6px 8px;border:none;
  background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;border-radius:5px;cursor:pointer;}
.${c.blockMenuItem}:hover{background:var(--dsw-alias-interactive-bg-hover);}

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
