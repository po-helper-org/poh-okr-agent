---
description: "Декомпозиция по этапам — этап 3 планирования квартала: этапы по ролям PO/SA/BE/FE/ADR, условия, риски, зависимости и неопределённости каждой инициативы в заметках scope-<quarter>.html."
---

## Использование

```
/okr-stages <quarter>
```

`<quarter>` — планируемый квартал (`2026Q4`). Пайплайн:
`/okr-retro → /okr-scope → /okr-stages → /okr-teamplanner`.

## На выходе

```
.okr/<quarter>/plan/scope-<quarter>.json + .html (заметки notes)
```

## Инструкция для LLM

Следуй процессу из `skills/okr-stages/SKILL.md`. Формат данных —
`skills/okr-scope/resources/plan_schema.md`.

## Отчёт

```
Декомпозиция <quarter>: .okr/<quarter>/plan/scope-<quarter>.html  [черновик | принято]

── СТОП ── PO: проверьте этапы, риски и зависимости.
Дальше, после «принято»: /okr-teamplanner <quarter>
```
