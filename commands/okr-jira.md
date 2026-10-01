---
description: "Перенос плана квартала в JIRA прямо из TeamPlanner: KR — эпики (enabler или бессрочный), подзадачи — истории. Нет TeamPlanner — собирает; есть — просит PO подтвердить и проверяет. Задачи (Atlassian MCP) или CSV для импорта — только после явного «да»."
---

## Использование

```
/okr-jira <quarter>
```

`<quarter>` — планируемый квартал (`2026Q4`). Идёт после `/okr-teamplanner`;
если TeamPlanner ещё нет — соберёт его сам.

## На выходе

```
.okr/<quarter>/plan/teamplanner-<quarter>.json + .html   с jira_project и ключами jira_key
.okr/<quarter>/plan/jira-<quarter>.csv                   только если нет доступа к JIRA
```

## Инструкция для LLM

Следуй процессу из `skills/okr-jira/SKILL.md`. Формат данных —
`skills/okr-scope/resources/plan_schema.md`, разделы «TeamPlanner» и «Перенос
в JIRA». Главное: показать страницу TeamPlanner (в чат — короткая сводка) и
дождаться явного подтверждения PO; задачи в JIRA — только после
`okr-plan.py jira-ready`.

## Отчёт

```
TeamPlanner для переноса в JIRA: .okr/<quarter>/plan/teamplanner-<quarter>.html
Эпиков N (enabler N, бессрочных N), историй N. Проект: <ключ>.
Мешает переносу: <…или «ничего»>.

── СТОП ── Переносим в JIRA в таком виде?
```
