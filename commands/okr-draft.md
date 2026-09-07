---
description: Objective/KR Designer — формирует черновик OKR-<quarter>.md из контекст-пака. 3-5 Objectives, у каждого 3-6 измеримых Key Results с PBV.
---

## Использование

```
/okr-draft <quarter>
```

## На выходе

```
.okr/<quarter>/OKR-<quarter>.md
```

## Формат документа

```markdown
# OKR <quarter> — <team>

> PO: <po_name>. Составлено: <дата>.

## Objective 1 — <короткая формулировка>

*«<цитата-заострение цели, опционально>»*

| KR | Описание | PBV |
|---|---|---|
| 1.1 | <измеримый результат, не активность> | <1-9> |
| 1.2 | ... | ... |

## Objective 2 — ...
```

## Инструкция для LLM

Следуй процессу из `skills/okr-draft/SKILL.md`.

## Отчёт

```
Черновик OKR собран: .okr/<quarter>/OKR-<quarter>.md
<N> Objectives, <M> Key Results.

── СТОП ── PO: проверьте формулировки и PBV.
Дальше: /okr-debate <quarter>
```
