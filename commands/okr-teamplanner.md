---
description: "Перенос в TeamPlanner — этап 4 планирования квартала: таблица «строка на этап» из принятого Scope, чтобы техлиды заполнили ресурсы."
---

## Использование

```
/okr-teamplanner <quarter>
```

`<quarter>` — планируемый квартал (`2026Q4`). Пайплайн:
`/okr-retro → /okr-scope → /okr-stages → /okr-teamplanner`.

## На выходе

```
.okr/<quarter>/plan/teamplanner-<quarter>.csv
```

## Инструкция для LLM

Следуй процессу из `skills/okr-teamplanner/SKILL.md`. Формат данных —
`skills/okr-scope/resources/plan_schema.md`.

## Отчёт

```
TeamPlanner <quarter>: .okr/<quarter>/plan/teamplanner-<quarter>.csv

── СТОП ── Передайте таблицу техлидам: они заполняют ресурс и сроки.
```
