---
description: Deck Builder — собирает plan-deck.pptx (кикофф-презентация квартала для команды) из OKR-<quarter>.md и roadmap.md.
---

## Использование

```
/okr-plan-deck <quarter>
```

## На выходе

```
.okr/<quarter>/plan-deck.pptx
```

## Инструкция для LLM

Следуй `skills/okr-plan-deck/SKILL.md`. Собери JSON-payload из
`OKR-<quarter>.md` + `roadmap.md`, вызови
`node skills/okr-plan-deck/scripts/build_plan_deck.js <payload.json> .okr/<quarter>/plan-deck.pptx`.

## Отчёт

```
Квартальный план собран: .okr/<quarter>/plan-deck.pptx

── СТОП ── PO: проверьте перед показом команде.
Дальше: /okr-equator <quarter> (в середине квартала)
```
