---
description: "TeamPlanner — этап 4 планирования квартала: каждый KR квартала раскладывается на операционные этапы (PO, ADR, SA, BA, BE, FE, QA, DOPS, RM, EXT) с исполнителями и сроками; страница-редактор для техлидов и лист для Google Sheets."
---

## Использование

```
/okr-teamplanner <quarter>
```

`<quarter>` — планируемый квартал (`2026Q4`). Пайплайн:
`/okr-retro → /okr-scope → (/okr-stages) → /okr-teamplanner`.

## На выходе

```
.okr/<quarter>/plan/teamplanner-<quarter>.json / .html / .csv
```

## Инструкция для LLM

Следуй процессу из `skills/okr-teamplanner/SKILL.md`. Формат данных —
`skills/okr-scope/resources/plan_schema.md`, раздел «TeamPlanner».

## Отчёт

```
TeamPlanner <quarter>: .okr/<quarter>/plan/teamplanner-<quarter>.html
Без исполнителя N, нет роли в команде N, внешний ресурс N.

── СТОП ── Передайте страницу техлидам: исполнители и сроки выбираются на ней,
«Скачать JSON» — и файл обратно агенту.
```
