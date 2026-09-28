---
description: '[deprecated] Устарело, используй /okr-scope, /okr-stages, /okr-teamplanner. Deck Builder — собирает plan-deck.pptx (кикофф-презентация квартала для команды) из OKR-<quarter>.md и roadmap.md.'
---

> **[deprecated]** `/okr-plan-deck` устарела и больше не поддерживается. Планирование
> квартала идёт по пайплайну `/okr-retro → /okr-scope → /okr-stages → /okr-teamplanner`.
> Замена: документ `scope-<quarter>.html` из `/okr-scope` и `/okr-stages` для команды и `/okr-teamplanner <quarter>` для техлидов.

**Инструкция для LLM, до любых действий:** сообщи пользователю, что `/okr-plan-deck`
устарела и неактуальна, назови замену и предложи запустить её. Продолжай по
старому процессу ниже, только если пользователь явно попросит именно его.

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
`OKR-<quarter>.md` + `roadmap.md`, вызови (путь — относительно корня
установки, куда `install.sh` синкнул навыки; обычно `.claude/skills/...`,
зависит от выбора при установке)
`node <корень установки>/skills/okr-plan-deck/scripts/build_plan_deck.js <payload.json> .okr/<quarter>/plan-deck.pptx`.

## Отчёт

```
Квартальный план собран: .okr/<quarter>/plan-deck.pptx

── СТОП ── PO: проверьте перед показом команде.
Дальше: /okr-equator <quarter> (в середине квартала)
```
