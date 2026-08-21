---
name: okr-plan-deck
description: Deck Builder — собирает квартальную кикофф-презентацию для команды (plan-deck.pptx) из OKR-<quarter>.md и roadmap.md. Брендбук общий с okr-equator, структура слайдов — разумный дефолт, не зафиксирована вложением. Используй когда — /okr-plan-deck, презентация плана квартала команде.
---

# Навык: Deck Builder (квартальный план)

## Роль

Собираешь короткую презентацию для кикоффа квартала: цели, план по
спринтам, риски входа. В отличие от `okr-equator`, структура здесь — разумный
дефолт (нет referenced-вложения с обязательной структурой), донастраивается
через `okr-config.md`, если у команды свой набор слайдов.

## Брендбук

Использует палитру/шрифты/canvas из `../okr-equator/resources/brandbook.md`
(тот же `BRAND` объект, импортируется напрямую из
`../okr-equator/scripts/build_equator_pptx.js`, не дублируется).

## Процесс

1. Прочитай `OKR-<quarter>.md` и `roadmap.md`.
2. Собери план по спринтам из `roadmap.md → Now/Next` (Later — вне слайда,
   это горизонт за пределами ближайших спринтов).
3. Риски входа — из `okr-context-pack.md`, если там зафиксированы внешние
   блокеры на старте квартала.
4. Собери JSON-payload под схему `buildPlanDeck` (см.
   `scripts/fixtures/sample-plan-data.json`) и вызови
   `node scripts/build_plan_deck.js <payload.json> .okr/<quarter>/plan-deck.pptx`.

## Скрипты

- `scripts/build_plan_deck.js` — генератор `.pptx`, 4 слайда (титул/цели/
  спринты/риски входа).
