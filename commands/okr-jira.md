---
description: "Перенос плана квартала в JIRA: эпики-enabler, бессрочные эпики и истории из Scope и TeamPlanner. Сначала показывает структуру и ждёт подтверждения PO, потом создаёт задачи (Atlassian MCP) или готовит CSV для импорта."
---

## Использование

```
/okr-jira <quarter>
```

`<quarter>` — планируемый квартал (`2026Q4`). Идёт после `/okr-scope`
(и `/okr-teamplanner`, если он был).

## На выходе

```
.okr/<quarter>/plan/jira-<quarter>.json (+ .csv, если нет доступа к JIRA)
```

## Инструкция для LLM

Следуй процессу из `skills/okr-jira/SKILL.md`. Формат данных —
`skills/okr-scope/resources/plan_schema.md`, раздел «JIRA». Главное: сначала
показать структуру (`okr-plan.py preview`) и дождаться явного подтверждения PO;
задачи в JIRA — только после `okr-plan.py jira-ready`.

## Отчёт

```
JIRA <quarter>: эпиков N (enabler N, бессрочных N), историй N.

── СТОП ── Переносим в JIRA в таком виде? Правки — словами.
```
