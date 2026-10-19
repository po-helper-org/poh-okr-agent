# Кейсы доработок — `docs/solutions/`

Кейсы репозитория `poh-okr-agent`: что ломалось или чего не хватало, почему и как решили. Формат
и правила — в соглашении [SOLUTIONS.md](https://github.com/po-helper-org/.github/blob/main/SOLUTIONS.md).
Кейсы с пометкой `source: retro` восстановлены по истории PR и могут быть неточны в деталях.

| Дата | Кейс | Вид | Область | PR |
|---|---|---|---|---|
| 2026-10-19 | [curl без ключа отключения проверки TLS в инструкциях установки](2026-10-19-curl-no-insecure-flag.md) | security | docs-install | 15 |
| 2026-10-08 | [Обоснование одной инициативы — презентация «брать или нет»](2026-10-08-okr-justify-deck.md) | feature | okr-justify | 14 |
| 2026-10-07 | [Презентация квартала команде — HTML, а не слайды из редактора](2026-10-07-okr-present-html-deck.md) | feature | okr-present | 12 |
| 2026-10-01 | [Исследовательские KR получают подзадачу сбора требований по умолчанию](2026-10-01-research-kr-default-subtask.md) | feature | okr-teamplanner | 11 |
| 2026-10-01 | [Перенос плана в JIRA без дублей при прерывании](2026-10-01-okr-jira-transfer.md) | feature | okr-jira | 10 |
| 2026-10-01 | [Обзорный вид эпиков в TeamPlanner](2026-10-01-epic-overview-rows.md) | feature | planning-pages | 10,11 |
| 2026-09-29 | [TeamPlanner — страница-редактор вместо ручного JSON](2026-09-29-teamplanner-editor-page.md) | feature | planning-pages | 8,11 |
| 2026-09-29 | [Неверный тип поля JSON ронял скрипт трейсбеком](2026-09-29-schema-lint-not-traceback.md) | bug | okr-plan-py | 8 |
| 2026-09-29 | [Комментарии для агента по правому клику вместо правки страницы](2026-09-29-right-click-comments.md) | feature | planning-pages | 7,11 |
| 2026-09-29 | [Пайплайн планирования квартала переписан под разговор с PO](2026-09-29-quarter-planning-rewrite.md) | feature | okr-skills | 7 |
| 2026-09-29 | [LLM пишет только JSON, весь вывод считает скрипт](2026-09-29-llm-writes-json-only.md) | feature | okr-plan-py | 7 |
| 2026-09-29 | [Флаг «берём в квартал» закрывает принятие перегруженного плана](2026-09-29-in-quarter-flag.md) | feature | okr-plan-py | 8 |
| 2026-09-29 | [SecurityError при переключении цели в iframe srcdoc](2026-09-29-iframe-srcdoc-replacestate.md) | bug | planning-pages | 9 |
| 2026-09-09 | [Кнопка пайплайна падала на первом же шаге без контекста](2026-09-09-okr-draft-self-bootstrap.md) | bug | okr-skills | 4 |
| 2026-09-09 | [Меню привязки задачи вываливало сорок целей без поиска](2026-09-09-kr-picker-local-search.md) | feature | plugin-panel | 5 |
| 2026-09-09 | [Задачи после встречи уезжали в заметку мимо панели](2026-09-09-agent-capture-policy-prompt.md) | bug | agent-integration | 5 |
| 2026-09-08 | [Команды записи CLI — чистые функции с аргументами](2026-09-08-write-commands-pure-functions.md) | feature | plugin-core | 3 |
| 2026-09-08 | [Слэш-команда в харнессе не находила пайплайн без каталога навыков](2026-09-08-slash-commands-need-skills.md) | bug | harness-integration | 3 |
| 2026-09-08 | [Панель ждала ответа CLI секунды на каждое действие](2026-09-08-optimistic-panel-writes.md) | perf | plugin-panel | 3 |
| 2026-09-08 | [Каретка прыгала в начало при наборе в блочном редакторе](2026-09-08-contenteditable-imperative-editor.md) | bug | block-editor | 3 |
| 2026-09-08 | [Первый символ набора уходил в чекбокс пункта списка](2026-09-08-checkbox-out-of-flow.md) | bug | block-editor | 3 |
| 2026-09-08 | [Enter проваливался в браузерное поведение при пустом событии клавиши](2026-09-08-beforeinput-not-keydown.md) | bug | block-editor | 3 |
| 2026-09-08 | [Позиционный разбор вывода CLI молча портил заголовки задач](2026-09-08-backlog-cli-json-not-plain.md) | bug | backlog-md-cli | 3 |

