---
name: okr-plan-deck
description: Совместимость с okr-plan-deck. Предложи собрать презентацию квартала через okr-present.
---

> **[deprecated]** `/okr-plan-deck` устарела и больше не поддерживается. Планирование
> квартала идёт по пайплайну `/okr-retro → /okr-scope → (/okr-stages) → /okr-teamplanner`.
> Замена: `/okr-present <quarter>` — презентация квартала команде из принятых Scope и TeamPlanner.

**Инструкция для LLM, до любых действий:** сообщи пользователю, что `/okr-plan-deck`
устарела и неактуальна, назови замену и предложи запустить её. Продолжай по
старому процессу ниже, только если пользователь явно попросит именно его.

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
2. Собери roadmap-грид (те же колонки/пункты, что и на roadmap-слайде
   экватора — `roadmapGrid` в payload) из `roadmap.md → Now/Next`.
3. Собери план по спринтам из `roadmap.md → Now/Next` (Later — вне слайда,
   это горизонт за пределами ближайших спринтов).
4. Риски входа — из `okr-context-pack.md`, если там зафиксированы внешние
   блокеры на старте квартала.
5. Собери JSON-payload под схему `buildPlanDeck` (см.
   `scripts/fixtures/sample-plan-data.json`; `meta` — те же поля, что у
   `addTitleSlide` в `okr-equator`: `team`, `quarterLabel`, `po`, `period1`,
   `period2`, `scopeNote`) и вызови (требует Node.js/npm и установленный
   `pptxgenjs` — ставится автоматически через `install.sh`, при
   необходимости вручную: `npm install --prefix ../okr-equator/scripts`):
   `node scripts/build_plan_deck.js <payload.json> .okr/<quarter>/plan-deck.pptx`.

## Скрипты

- `scripts/build_plan_deck.js` — генератор `.pptx`, 5 слайдов (титул/цели/
  roadmap/спринты/риски входа). `roadmapGrid` в payload опционален — если
  не задан, roadmap-слайд пропускается.
