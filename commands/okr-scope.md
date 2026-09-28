---
description: "OKR Scope — этап 2 планирования квартала: PO свободно (голосом или текстом) рассказывает, что хочет увидеть в квартале, навык собирает драфт scope-<quarter>.html и ведёт итерации правок."
---

## Использование

```
/okr-scope <quarter>
```

`<quarter>` — планируемый квартал (`2026Q4`). Пайплайн:
`/okr-retro → /okr-scope → /okr-stages → /okr-teamplanner`.

## На выходе

```
.okr/<quarter>/plan/scope-<quarter>.json + .html
```

## Инструкция для LLM

Следуй процессу из `skills/okr-scope/SKILL.md`. Формат данных —
`skills/okr-scope/resources/plan_schema.md`.

## Отчёт

```
Scope <quarter>: .okr/<quarter>/plan/scope-<quarter>.html  [черновик | принято]

── СТОП ── PO: правьте словами или голосом, я обновлю документ.
Дальше, после «принято»: /okr-stages <quarter>
```
