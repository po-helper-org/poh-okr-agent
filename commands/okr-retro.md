---
description: "OKR Retro — этап 1 планирования квартала: фактические итоги прошлого квартала и что переходит в новый. Точка входа, продолжает планирование с места остановки."
---

## Использование

```
/okr-retro <quarter>
```

`<quarter>` — планируемый квартал (`2026Q4`). Пайплайн:
`/okr-retro → /okr-scope → (/okr-stages) → /okr-teamplanner → (/okr-jira) → /okr-present`.

## На выходе

```
.okr/<quarter>/plan/retro-<prev>.json + .html
```

## Инструкция для LLM

Следуй процессу из `skills/okr-retro/SKILL.md`. Формат данных —
`skills/okr-scope/resources/plan_schema.md`.

## Отчёт

```
Retro <prev>: .okr/<quarter>/plan/retro-<prev>.html  [черновик | принято]

── СТОП ── PO: проверьте итоги и то, что переходит.
Дальше, после «принято»: /okr-scope <quarter>
```
