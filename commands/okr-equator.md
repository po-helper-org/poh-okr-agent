---
description: Equator Reporter — генерирует экватор-<quarter>.md + экватор-<quarter>.pptx из .okr/<quarter>/ артефактов. Структура фиксирована, LLM заполняет данные.
---

## Использование

```
/okr-equator <quarter>
```

## На выходе

```
.okr/<quarter>/equator/
├── экватор-<quarter>.md
└── экватор-<quarter>.pptx
```

## Инструкция для LLM

Следуй процессу из `skills/okr-equator/SKILL.md`. Коротко:
1. Собери факты из `OKR-<quarter>.md`/`roadmap.md`/`KR-EPIC-MAP.md`
   (+ трекер, если подключён).
2. Заполни `экватор-<quarter>.md` по шаблону, прогони `okr-lint.py`, почини
   структурные ошибки, пока не станет `OK`.
3. Собери тот же материал в JSON и вызови `build_equator_pptx.js` для
   `.pptx`.
4. Отчитайся.

## Отчёт

```
Экватор <quarter> собран:
- .okr/<quarter>/equator/экватор-<quarter>.md  (линтер: OK)
- .okr/<quarter>/equator/экватор-<quarter>.pptx (<N> слайдов)

KR по статусам: Выполнено <a> · В работе <b> · На паузе <c> · В ожидании <d> · Отменено <e>
[УТОЧНИТЬ у PO]: <k> пунктов — см. «Открытые вопросы» в .md.

── СТОП ── PO: проверьте отчёт перед показом руководству.
```
