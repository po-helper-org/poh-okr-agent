# poh-okr-agent

Единственная цель — управление OKR-целями Product Owner: формирование OKR,
roadmap и верхнеуровневой декомпозиции с требованиями, сборка квартальной
презентации плана для команды, и отчёт «экватор квартала» (`.md` + `.pptx`) о
статусе исполнения на середине квартала. Переносимый навык: подключается в
любой воркспейс, сам строит контекст, работает без обязательных внешних
runtime-зависимостей.

**Функция [манифеста](https://github.com/po-helper-org/.github/blob/main/profile/README.md):**
1 · 4 — снятие неопределённости (OKR/roadmap, забирает контур у
`poh-strategy-agents`) и риски/раннее предупреждение (экватор — сигнал об
отклонениях с последствиями для целей, до эскалации перед руководством).

## Установка

**Через ИИ-помощника:** скажи «Установи okr-agent в этот репозиторий».

**Через терминал:**
```bash
curl -ksSL https://raw.githubusercontent.com/po-helper-org/poh-okr-agent/main/install.sh | bash
```
Скрипт спросит IDE-агента (Claude Code / Codex / Cline / DevX / Universal) и
синкнет команды и навыки в нужный корень. После установки запусти
`/okr-index` — навык проведёт первичную аналитику воркспейса.

## Для ИИ-помощника (bootstrap)

Если пользователь просит «Установи okr-agent»: (1) запусти
`curl -ksSL <repo>/install.sh | bash` или склонируй и запусти `install.sh`,
выбрав IDE-агента пользователя; (2) после синка сразу запусти `/okr-index`
для первичной аналитики воркспейса; (3) покажи `MANIFEST.md` и предложи
`/okr-context <quarter>`.

## HowToDemo

1. Открываю репозиторий.
2. Устанавливаю себе скиллы `okr-agent` (curl-бутстрап выше).
3. Прохожу онбординг (`/okr-index`) и формирую OKR (`/okr-context` →
   `/okr-draft` → `/okr-debate`).
4. Для OKR формирую roadmap (`/okr-roadmap`) и верхнеуровневую декомпозицию с
   требованиями (`/okr-decompose`).
5. Собираю планы квартала в презентацию для команды (`/okr-plan-deck`).
6. Создаю экватор квартала — отчёт `.md` + презентация `.pptx`
   (`/okr-equator`).

## Команды

| # | Команда | Роль | Артефакт |
|---|---|---|---|
| 0 | `/okr-index` | Context Builder | `.okr/index/` |
| 1 | `/okr-context <quarter>` | Context Builder | `.okr/<quarter>/artefacts/okr-context-pack.md` |
| 2 | `/okr-draft <quarter>` | Objective/KR Designer | `.okr/<quarter>/OKR-<quarter>.md` |
| 3 | `/okr-debate <quarter>` | Devil's Advocate | вердикт в `OKR-<quarter>.md` |
| 4 | `/okr-roadmap <quarter>` | Roadmap Architect | `.okr/<quarter>/roadmap.md` |
| 5 | `/okr-decompose <quarter>` | Decomposer | `.okr/<quarter>/KR-EPIC-MAP.md` |
| 6 | `/okr-plan-deck <quarter>` | Deck Builder | `.okr/<quarter>/plan-deck.pptx` |
| 7 | `/okr-equator <quarter>` | Equator Reporter | `.okr/<quarter>/equator/экватор-<quarter>.md` + `.pptx` |
| 8 | `/okr-validate <path>` | Validator | структурный отчёт линтера |

STOP-пауза после каждой — PO подтверждает переход. Полный workflow:
`/okr-index → /okr-context → /okr-draft → /okr-debate → /okr-roadmap → /okr-decompose → /okr-plan-deck → /okr-equator`

## Рабочая папка

```
.okr/index/{domain.md, glossary.md, stakeholders.md, sources.md, MANIFEST.md}
.okr/<quarter>/
  artefacts/okr-context-pack.md
  OKR-<quarter>.md
  roadmap.md
  KR-EPIC-MAP.md
  plan-deck.pptx
  equator/экватор-<quarter>.md
  equator/экватор-<quarter>.pptx
```

## Проверка структуры экватора

Структуру `экватор-<quarter>.md` проверяет скрипт, не самоотчёт модели:

```bash
python3 skills/okr-equator/scripts/okr-lint.py .okr/<quarter>/equator/экватор-<quarter>.md
```

Ненулевой код выхода — документ не по шаблону: потерян обязательный раздел,
PBV вне диапазона, недопустимое значение статуса. `/okr-equator` прогоняет
линтер перед каждой записью файла и не сохраняет документ с ошибками.
Самотест линтера: `bash skills/okr-equator/scripts/test-okr-lint.sh`.

## Место в конвейере poh-org

`poh-strategy-agents` (идея → проблема → ставка) → **`poh-okr-agent`**
(OKR → roadmap → декомпозиция → квартальный план → экватор) →
`poh-bft-writer` (полные требования на эпик) → `poh-sprint-agents`
(исполнение спринта). `poh-okr-agent` полностью забирает OKR/roadmap-контур,
ранее заявленный в `poh-strategy-agents`.
