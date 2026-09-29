---
description: '[deprecated] Устарело, используй /okr-teamplanner. Roadmap Architect — строит roadmap.md (now-next-later) из OKR-<quarter>.md, с привязкой каждого пункта к Key Result.'
---

> **[deprecated]** `/okr-roadmap` устарела и больше не поддерживается. Планирование
> квартала идёт по пайплайну `/okr-retro → /okr-scope → (/okr-stages) → /okr-teamplanner`.
> Замена: `/okr-teamplanner <quarter>` — этапы по ролям с исполнителями и сроками; раскладка now/next/later больше не строится.

**Инструкция для LLM, до любых действий:** сообщи пользователю, что `/okr-roadmap`
устарела и неактуальна, назови замену и предложи запустить её. Продолжай по
старому процессу ниже, только если пользователь явно попросит именно его.

## Использование

```
/okr-roadmap <quarter>
```

## На выходе

```
.okr/<quarter>/roadmap.md
```

## Формат документа

```markdown
# Roadmap <quarter> — <team>

## Objective 1 — <название>

### Now
- [1.1] <что делаем прямо сейчас>

### Next
- [1.2] <что дальше в этом квартале>

### Later
- [1.3] <что осознанно после, за горизонтом квартала или в конце>

## Objective 2 — ...
```

## Инструкция для LLM

Следуй процессу из `skills/okr-roadmap/SKILL.md`.

## Отчёт

```
Roadmap собран: .okr/<quarter>/roadmap.md

── СТОП ── PO: проверьте приоритизацию Now/Next/Later.
Дальше: /okr-decompose <quarter>
```
