# poh-okr-agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `poh-okr-agent` — a portable Claude Code skill package (9 STOP-gated
pipeline commands) that lets a PO draft OKRs, derive a roadmap and top-level
decomposition, assemble a quarterly plan deck, and generate the mid-quarter
"equator" status report as both a structured `.md` document and a brand-matched
`.pptx` deck — then wire it into the `po-helper-org` manifest, replacing the
OKR/roadmap contour currently claimed by `poh-strategy-agents`.

**Architecture:** File-based pipeline mirroring `poh-bft-writer`/`poh-strategy-agents`:
`commands/*.md` are Claude Code slash commands (thin for simple stages, full
instructions inline for complex ones); `skills/*/SKILL.md` carry resources and
scripts for the three stages with real assets (context indexer, equator
report+deck generator, plan-deck generator). All state lives in `.okr/<quarter>/`
inside the *consuming* workspace, not this repo. Two pieces of real code exist:
a structural markdown linter (`okr-lint.py`, Python) and a `pptxgenjs`-based deck
generator (`build_equator_pptx.js` / `build_plan_deck.js`, Node) that renders a
fixed slide structure from a JSON data payload — the LLM fills data, the script
owns layout.

**Tech Stack:** Bash (`install.sh`, `test-okr-lint.sh`), Python 3 stdlib only
(`okr-lint.py` — no dependencies), Node.js + `pptxgenjs` (deck generation),
Markdown (commands, skills, templates, config).

## Global Constraints

- GitHub org/repo: `po-helper-org/poh-okr-agent`, public. Created and pushed via
  `gh` CLI directly to `main` for the initial scaffold (confirmed by PO) — every
  commit *after* the initial scaffold follows the org's branch+PR convention.
- Edits to `poh-strategy-agents` and `.github` (both pre-existing, live repos)
  go through a feature branch + PR — never a direct push to `main`.
- Naming mirrors `poh-bft-writer` exactly: `commands/okr-*.md`,
  `skills/okr-*/SKILL.md`, `okr-config.template.md` (not `bft-config...`),
  `install.sh` with the same 5 IDE-agent choices.
- Priority scale default: **PBV 1-9** (Priority Business Value), overridable via
  `okr-config.md`.
- Zero-fabrication principle (org-wide): every status/risk/commitment in the
  equator report traces to `.okr/<quarter>/` artifacts, tracker MCP, or direct
  PO input. Unknown → `[УТОЧНИТЬ у PO]`, never invented.
- Status enum for KR status columns: `Выполнено`, `В работе`, `На паузе`,
  `В ожидании`, `Отменено` — exactly these five strings.
- Brand palette (extracted from the real reference deck's `srgbClr` values, not
  the default Office theme):
  - `0F0F14` dark (dominant — title/divider backgrounds, primary text)
  - `E4E0DA` warm beige (content slide backgrounds)
  - `FFFFFF` white (text on dark, cards)
  - `8A8A8A` mid gray (secondary text/captions)
  - `42424A` dark gray (text on beige)
  - `A9DCEE` / `C9DDF5` blue — status "В работе"
  - `C7F8E2` / `CDE8D2` mint — status "Выполнено"
  - `FFD9E2` pink — status "Отменено"
  - `F7DCC4` peach — status "В ожидании"
  - `FFEDB0` yellow — status "На паузе" / attention
  - `4C6FFF` accent blue — sparing use only
  - Fonts: `Arial` (headings/body), `Courier New` (numbers/data — monospace
    technical accent)
  - Canvas: custom 16:9 at `20in × 11.25in` (not the pptxgenjs default
    `13.33in × 7.5in`) — set via `pres.defineLayout` + `pres.layout`
- `pptxgenjs` gotchas that apply throughout `build_equator_pptx.js` /
  `build_plan_deck.js`: hex colors never prefixed with `#`, never 8-digit;
  never reuse one options object (e.g. a `shadow` object) across two `add*`
  calls — build a fresh literal each time; `bullet: true` on list items, never
  a literal `•`; `breakLine: true` on every array item except the last;
  `margin: 0` on text boxes that must align with a shape edge; one
  `new pptxgen()` per output file; shadow `offset` must be ≥ 0.
- Workspace layout produced by the pipeline (inside the *consuming* repo, not
  this one):
  ```
  .okr/index/{domain.md,glossary.md,stakeholders.md,sources.md,MANIFEST.md}
  .okr/<quarter>/
    artefacts/okr-context-pack.md
    OKR-<quarter>.md
    roadmap.md
    KR-EPIC-MAP.md
    plan-deck.pptx
    equator/экватор-<quarter>.md
    equator/экватор-<quarter>.pptx
  ```
  `<quarter>` format: `2026Q3` (matches the PO's real filenames).

---

## Task 1: Repo skeleton, README, config template

**Files:**
- Create: `README.md`
- Create: `.gitignore`
- Create: `okr-config.template.md`

**Interfaces:**
- Produces: the public-facing contract other tasks reference — command table,
  workspace tree, config field names (`tracker_projects`, `pbv_scale`,
  `brand_override`, `wiki_space`, `leadership_stakeholders`) used verbatim by
  later commands/skills.

- [ ] **Step 1: Write `okr-config.template.md`**

```markdown
# okr-config (шаблон)

Скопируй в корень воркспейса как `okr-config.md` и заполни. Читается
`/okr-index` и всем пайплайном. Всё опционально — незаданное автодетектится
или помечается `UNAVAILABLE` в `MANIFEST.md`.

## team
Название команды/инициативы для шапок отчётов (напр. `GDS`). Пусто →
берётся из `/okr-index`, если определимо, иначе `[УТОЧНИТЬ]`.

## po_name
Имя PO для шапок документов (напр. `Ишманов Алексей`).

## tracker_projects
Коды проектов трекера через запятую (напр. `GDSLV, TLND`). Пусто →
живой статус в `/okr-equator` не подтягивается, всё — ручной ввод PO.

## wiki_space
Ключ пространства Confluence для публикации (опционально). Пусто →
публикация ручная.

## pbv_scale
Шкала приоритезации Key Result. Дефолт: `1-9` (Priority Business Value).
Можно переопределить, напр. `RICE` или `1-5` — тогда `/okr-draft` и
`okr-lint.py` используют заданный диапазон вместо `1-9`.

## brand_override
Путь к альтернативному `brandbook.md`, если у команды свои цвета/шрифты
вместо дефолтного (см. `skills/okr-equator/resources/brandbook.md`). Пусто →
дефолтный брендбук.

## leadership_stakeholders
Кому адресован раздел «Что нужно от руководителей» в экваторе (через
запятую, напр. `Д. Зорихин, ГД`). Пусто → раздел собирается без адресата,
PO дополняет вручную.

## quarter_start_month
Месяц начала квартала (`1`, `4`, `7`, `10`). Дефолт: `7` (Q3-стиль
календарного года PO). Используется для авто-подсказки текущего `<quarter>`.
```

- [ ] **Step 2: Write `.gitignore`**

```gitignore
.okr/
node_modules/
*.pyc
__pycache__/
.DS_Store
/tmp/
```

- [ ] **Step 3: Write `README.md`**

```markdown
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
```

- [ ] **Step 4: Verify required sections exist**

Run:
```bash
grep -c '^## ' README.md
grep -c '^| # |' README.md
```
Expected: `grep -c '^## '` ≥ 6 (Установка/Для ИИ-помощника/HowToDemo/Команды/
Рабочая папка/Проверка структуры/Место в конвейере); second command prints `1`
(command table present).

- [ ] **Step 5: Commit**

```bash
git add README.md .gitignore okr-config.template.md
git commit -m "Add repo skeleton: README, config template, gitignore"
```

---

## Task 2: install.sh

**Files:**
- Create: `install.sh`

**Interfaces:**
- Consumes: nothing (standalone bootstrap script).
- Produces: `$ROOT/$CMD_DIR/*` and `$ROOT/skills/*` in the *target* repo when
  run; `okr-config.template.md` copied to target root.

- [ ] **Step 1: Write `install.sh`**

```bash
#!/bin/bash
set -e
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
REPO_URL="https://github.com/po-helper-org/poh-okr-agent.git"

# Источник: если запущено из клона — текущая папка; если через curl — клонируем
if [ -d "./commands" ] && [ -d "./skills" ]; then
  SRC="."
else
  echo -e "${BLUE}Клонирую poh-okr-agent…${NC}"
  TEMP_DIR="$(mktemp -d)"
  git clone --depth 1 "$REPO_URL" "$TEMP_DIR"
  SRC="$TEMP_DIR"
fi

echo -e "${BLUE}Какой IDE-агент?${NC}"
echo "  1) Claude Code   (.claude/)"
echo "  2) Codex         (.agents/)"
echo "  3) Cline         (.clinerules/)"
echo "  4) DevX (МТС)    (.clinerules/)"
echo "  5) Universal     (.agents/)"
if [ -r /dev/tty ]; then
  read -rp "Выбор [1]: " choice < /dev/tty 2>/dev/null || choice=""
else
  choice=""
fi
choice="${choice:-1}"
case "$choice" in
  1) ROOT=".claude";     CMD_DIR="commands" ;;
  2) ROOT=".agents";     CMD_DIR="prompts" ;;
  3) ROOT=".clinerules"; CMD_DIR="workflows" ;;
  4) ROOT=".clinerules"; CMD_DIR="workflows" ;;
  5) ROOT=".agents";     CMD_DIR="commands" ;;
  *) echo "Неизвестный выбор"; exit 1 ;;
esac

# Синк команд
mkdir -p "$ROOT/$CMD_DIR"
cp -R "$SRC"/commands/. "$ROOT/$CMD_DIR"/

# Синк навыков с инъекцией frontmatter (name + description из первой строки SKILL.md)
mkdir -p "$ROOT/skills"
for skill_src in "$SRC"/skills/*; do
  [ -d "$skill_src" ] || continue
  [ -f "$skill_src/SKILL.md" ] || continue
  skill_name="$(basename "$skill_src")"
  skill_dst="$ROOT/skills/$skill_name"
  mkdir -p "$skill_dst"
  cp -R "$skill_src"/. "$skill_dst"/
  if ! head -1 "$skill_src/SKILL.md" | grep -q '^---$'; then
    desc="$(sed -n '1s/^# *//p;q' "$skill_src/SKILL.md")"
    desc="${desc:-$skill_name}"
    desc="${desc//\\/\\\\}"; desc="${desc//\"/\\\"}"
    { printf -- '---\nname: %s\ndescription: "%s"\n---\n' "$skill_name" "$desc"; sed '1d' "$skill_src/SKILL.md"; } > "$skill_dst/SKILL.md"
  fi
done

# Конфиг-шаблон в корень (если ещё нет)
[ -f okr-config.md ] || cp "$SRC/okr-config.template.md" ./okr-config.template.md 2>/dev/null || true

[ "$SRC" = "$TEMP_DIR" ] && rm -rf "$TEMP_DIR"

echo -e "${GREEN}✔ Установлено в $ROOT/${NC}"
echo -e "${YELLOW}Следующий шаг:${NC} запусти ${GREEN}/okr-index${NC} — навык построит контекст воркспейса."
```

- [ ] **Step 2: Make executable and smoke-test locally**

Run:
```bash
chmod +x install.sh
mkdir -p /tmp/okr-install-smoke && cd /tmp/okr-install-smoke
echo "1" | bash /Users/aleksishmanov/projects/poh-org/poh-okr-agent/install.sh
ls .claude/commands | head -3
ls .claude/skills
cd /Users/aleksishmanov/projects/poh-org/poh-okr-agent
```
Expected: `install.sh` errors cleanly at this point in the plan because
`commands/` and `skills/` don't exist yet in this repo — **this step is a
placeholder command to re-run after Task 18** (once all commands/skills exist),
not now. Skip execution now; re-run as the verification step of Task 18
instead.

- [ ] **Step 3: Commit**

```bash
chmod +x install.sh
git add install.sh
git commit -m "Add install.sh bootstrap script"
```

---

## Task 3: okr-index skill + command

**Files:**
- Create: `skills/okr-index/SKILL.md`
- Create: `skills/okr-index/resources/index_schema.md`
- Create: `commands/okr-index.md`

**Interfaces:**
- Produces: `.okr/index/{domain.md,glossary.md,stakeholders.md,sources.md,MANIFEST.md}`
  in the consuming workspace — read by `/okr-context` (Task 4) and referenced
  by name in every later command.

- [ ] **Step 1: Write `skills/okr-index/resources/index_schema.md`**

```markdown
# Схема индекса `.okr/index/`

| Файл | Содержимое | Источники |
|---|---|---|
| `domain.md` | Продукт, команда, ключевые системы, текущие Objectives (если есть предыдущий квартал) | локальные доки, код (serena MCP), предыдущий `OKR-<quarter>.md` |
| `glossary.md` | Термины домена, аббревиатуры команд/систем | локальные доки, JIRA-описания (если MCP доступен) |
| `stakeholders.md` | Кто владеет каким Objective/направлением, кому адресован экватор | `okr-config.md → leadership_stakeholders`, локальные доки |
| `sources.md` | Реестр всех найденных источников с якорями (`path:line`, JIRA-key, Confluence-URL) | сводится из остальных паков |
| `MANIFEST.md` | Покрытие по каждому паку: `INDEXED` / `UNAVAILABLE`, дата сборки | сводится из остальных паков |

Каждый факт в паке — с якорем-источником, записанным inline как
`[источник: <anchor>]`. Источник недоступен → `UNAVAILABLE` в `MANIFEST.md`;
вывод оттуда в паках downstream → `[УТОЧНИТЬ у PO]`. Пусто ≠ «нет данных».
```

- [ ] **Step 2: Write `skills/okr-index/SKILL.md`**

```markdown
---
name: okr-index
description: Индексатор контекста OKR — первичная аналитика воркспейса, строит само-генерируемый индекс .okr/index/ (домен, глоссарий, стейкхолдеры, реестр источников) как доказательную базу для всего пайплайна OKR. Используй когда — /okr-index, построить контекст, проиндексировать воркспейс перед формированием OKR.
---

# Навык: Индексатор контекста OKR (OKR Context Indexer)

## Роль

Ты — Context Builder. Навык проводит первичную аналитику воркспейса и строит
само-генерируемый индекс `.okr/index/` — основу для всего пайплайна OKR.
Заменяет внешние централизованные базы знаний: всё собирается локально.

## Принцип нулевого допуска

Каждый факт в индексе → якорь-источник, записанный inline и в реестр
`sources.md`. Источник недоступен → `UNAVAILABLE` в `MANIFEST.md`; вывод
оттуда downstream → `[УТОЧНИТЬ у PO]`.

## Источники (автодетект, per-source fallback)

1. **Доки** — локальные `.md`/roadmap-доки воркспейса (дефолт `**/*.md` минус
   `node_modules`/`vendor`/`dist`/`.git`).
2. **Код** — через serena MCP (`get_symbols_overview`, `find_symbol`), если в
   воркспейсе есть код и serena подключена. Даёт понимание продуктовых
   систем/сервисов, упомянутых в OKR.
3. **Трекер** — JIRA/Confluence через Atlassian MCP, если `tracker_projects`/
   `wiki_space` заданы в `okr-config.md` и MCP доступен. Иначе `UNAVAILABLE`.
4. **Предыдущий квартал** — `.okr/<prev-quarter>/OKR-<prev-quarter>.md` и
   `.okr/<prev-quarter>/equator/`, если существуют — источник открытых
   вопросов и незакрытых KR для следующего цикла.

## Процесс

1. Прочитать `okr-config.md` (нет → дефолты, отметить в `MANIFEST.md`).
2. Инвентаризация источников по типам, заполнить `MANIFEST.md` (статусы).
3. По каждому паку схемы (`resources/index_schema.md`) — извлечь факты с
   якорями.
4. Собрать `sources.md` — реестр всех якорей.
5. STOP: показать `MANIFEST.md` (покрытие), дать PO решить — достаточно ли
   для `/okr-context`.

Инкрементальность: повторный `/okr-index` идемпотентен — обновляет паки, не
плодит дубли, дата в `MANIFEST.md` обновляется.

## Ресурсы

- `resources/index_schema.md` — схема каждого пака индекса.

## Главное правило

Индекс — доказательная база пайплайна. Что не попало в индекс с якорем — в
OKR/экватор идёт как `[УТОЧНИТЬ]`, а не как факт. Качество результата ≤
качество индекса — не выдумывай покрытие.
```

- [ ] **Step 3: Write `commands/okr-index.md`**

```markdown
---
description: Первичная аналитика воркспейса — строит .okr/index/ (домен, глоссарий, стейкхолдеры, реестр источников) как доказательную базу для пайплайна OKR. Запускается первым после установки и повторно при устаревании индекса.
---

## Использование

```
/okr-index
```

Без параметров — сканирует весь воркспейс.

## На выходе

```
.okr/index/
├── domain.md
├── glossary.md
├── stakeholders.md
├── sources.md
└── MANIFEST.md
```

## Инструкция для LLM

Следуй процессу из `skills/okr-index/SKILL.md` и схеме
`skills/okr-index/resources/index_schema.md`. Создай `.okr/index/` в корне
воркспейса. После сборки выведи `MANIFEST.md` целиком и спроси PO,
достаточно ли покрытия перед `/okr-context <quarter>`.

## Отчёт

```
Индекс собран: .okr/index/

Покрытие:
<MANIFEST.md целиком>

── СТОП ── PO: проверьте покрытие, особенно UNAVAILABLE по релевантным темам.
Дальше: /okr-context <quarter>
```
```

- [ ] **Step 4: Verify frontmatter and required sections**

Run:
```bash
head -1 skills/okr-index/SKILL.md
head -1 commands/okr-index.md
grep -l "На выходе" commands/okr-index.md
```
Expected: first two commands each print `---`; third prints
`commands/okr-index.md`.

- [ ] **Step 5: Commit**

```bash
git add skills/okr-index commands/okr-index.md
git commit -m "Add okr-index context builder skill and command"
```

---

## Task 4: okr-context command

**Files:**
- Create: `commands/okr-context.md`

**Interfaces:**
- Consumes: `.okr/index/` (Task 3).
- Produces: `.okr/<quarter>/artefacts/okr-context-pack.md`, consumed by
  `/okr-draft` (Task 5).

- [ ] **Step 1: Write `commands/okr-context.md`**

```markdown
---
description: Контекст-пак для формирования OKR — индекс .okr/index/ + предыдущий квартал (если есть) + LLM-синтез бизнес-целей. Готов за 1-2 минуты. Пак неполон — перезапусти /okr-index.
---

## Использование

```
/okr-context <quarter>
```

**Параметры:**
- `<quarter>` — код квартала в формате `2026Q3`.

## Важно

Разделяй факт и вывод LLM явно: `(источник)` для фактов, `[вывод LLM,
требует проверки]` для выводов, `[УТОЧНИТЬ у PO]` для неизвестного.

## На выходе

```
.okr/<quarter>/artefacts/
└── okr-context-pack.md
```

**Иные файлы не создавать.** Pack — единственный артефакт, который читает
`/okr-draft`.

## Инструкция для LLM

### Этап 0: Подготовка

1. Создай `.okr/<quarter>/artefacts/`.
2. Прочитай `.okr/index/MANIFEST.md` — зафиксируй покрытие.

### Этап 1: Индекс

Прочитай релевантное из `.okr/index/domain.md`, `glossary.md`,
`stakeholders.md`. Зафиксируй: что нашёл / чего нет
(`[УТОЧНИТЬ: нет в индексе]`).

### Этап 2: Предыдущий квартал (если есть)

Если существует `.okr/<prev-quarter>/`: прочитай его `OKR-<prev-quarter>.md`
и `equator/экватор-<prev-quarter>.md → ## Открытые вопросы`. Незакрытые KR и
открытые вопросы — кандидаты на перенос в новый квартал.

### Этап 3: Бизнес-цели квартала

Спроси PO напрямую (в диалоге, не в файле) о цели квартала, если она не
выводится из индекса/предыдущего квартала однозначно. Не выдумывай Objectives
на этом этапе — контекст-пак собирает вводные, не решения.

### Этап 4: Сборка pack

Собери `.okr/<quarter>/artefacts/okr-context-pack.md`:
1. Шапка: квартал, дата, покрытие индекса.
2. Выдержки из индекса (домен/глоссарий/стейкхолдеры).
3. Незакрытые KR и открытые вопросы предыдущего квартала (если есть).
4. Бизнес-цели квартала — с пометкой факт/вывод LLM/`[УТОЧНИТЬ]`.
5. Требует уточнения — сводный список.

## Отчёт

```
Контекст-пак собран: .okr/<quarter>/artefacts/okr-context-pack.md

── СТОП ── PO: проверьте pack.
Дальше: /okr-draft <quarter>
```
```

- [ ] **Step 2: Verify frontmatter present**

Run: `head -1 commands/okr-context.md`
Expected: `---`

- [ ] **Step 3: Commit**

```bash
git add commands/okr-context.md
git commit -m "Add okr-context command"
```

---

## Task 5: okr-draft command

**Files:**
- Create: `commands/okr-draft.md`

**Interfaces:**
- Consumes: `.okr/<quarter>/artefacts/okr-context-pack.md` (Task 4).
- Produces: `.okr/<quarter>/OKR-<quarter>.md` with sections `# OKR <quarter>`,
  one `## Objective N — <name>` per objective, each followed by a markdown
  table `| KR | Описание | PBV |`. This exact table shape is consumed by
  `/okr-roadmap` (Task 7), `/okr-decompose` (Task 8), and `/okr-equator`
  (Task 16).

- [ ] **Step 1: Write `commands/okr-draft.md`**

```markdown
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

### Этап 1: Собери вводные

Прочитай `.okr/<quarter>/artefacts/okr-context-pack.md`. Если бизнес-цели
квартала помечены `[УТОЧНИТЬ]` — спроси PO напрямую перед черновиком, не
придумывай Objectives.

### Этап 2: Сформулируй Objectives

3-5 штук. Каждый — качественная, вдохновляющая цель (не число), укладывается
в квартал, привязана к бизнес-цели из контекст-пака.

### Этап 3: Сформулируй Key Results

3-6 на Objective. Каждый KR:
- **Измеримый результат**, не активность («выкатить продажу TC на витрине»,
  не «работать над TC»).
- PBV по умолчанию 1-9 (см. `okr-config.md → pbv_scale`, если переопределено).
- Пронумерован `<objective>.<kr>` (напр. `1.1`, `1.2`).

### Этап 4: Запись и линт

Запиши `OKR-<quarter>.md` по формату выше. Каждый KR — отдельная строка
таблицы, PBV — одно число из диапазона, без текста в той же ячейке.

## Отчёт

```
Черновик OKR собран: .okr/<quarter>/OKR-<quarter>.md
<N> Objectives, <M> Key Results.

── СТОП ── PO: проверьте формулировки и PBV.
Дальше: /okr-debate <quarter>
```
```

- [ ] **Step 2: Verify frontmatter and table format documented**

Run: `grep -c '| KR | Описание | PBV |' commands/okr-draft.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add commands/okr-draft.md
git commit -m "Add okr-draft command"
```

---

## Task 6: okr-debate command

**Files:**
- Create: `commands/okr-debate.md`

**Interfaces:**
- Consumes: `.okr/<quarter>/OKR-<quarter>.md` (Task 5) — reads the
  `| KR | Описание | PBV |` tables.
- Produces: appends a `## Вердикт adversarial-проверки` section to the same
  file (does not create a new file).

- [ ] **Step 1: Write `commands/okr-debate.md`**

```markdown
---
description: Devil's Advocate — adversarial-проверка черновика OKR отдельным запуском (не загрязняет составление). Проверяет измеримость, реалистичность, пересечения, скрытые зависимости.
---

## Использование

```
/okr-debate <quarter>
```

## На выходе

Дописывает секцию `## Вердикт adversarial-проверки` в конец
`.okr/<quarter>/OKR-<quarter>.md`. Новых файлов не создаёт.

## Инструкция для LLM

Прочитай `OKR-<quarter>.md`. Для каждого KR — проверь по четырём осям:

1. **Измеримость.** Формулировка допускает однозначное «да/нет сделано»?
   Если нет — предложи переформулировку.
2. **Реалистичность.** Не sandbagging (искусственно заниженная цель) и не
   недостижимо в горизонте квартала — сверься со стадией/объёмом из
   `okr-context-pack.md`, если там есть сигналы трудоёмкости.
3. **Пересечения.** KR не дублирует другой KR (в том же или другом
   Objective) под другой формулировкой.
4. **Скрытые зависимости.** KR явно зависит от внешней команды/системы, не
   упомянутой в описании — вынеси в замечание.

Формат вердикта:

```markdown
## Вердикт adversarial-проверки

| KR | Проблема | Предложение |
|---|---|---|
| 1.2 | Не измерим — «улучшить конверсию» без порога | Добавить целевое значение или критерий приёмки |

Без замечаний: 1.1, 1.3, 2.1, ...
```

Если найдены проблемы — **не исправляй KR сам**, только фиксируй вердикт.
Исправление — задача `/okr-draft`, перезапущенного PO.

## Отчёт

```
Adversarial-проверка завершена: <N> KR без замечаний, <M> с замечаниями.

<если M > 0>
── СТОП ── PO: доработайте отмеченные KR, затем повторите /okr-draft <quarter>.
<иначе>
── СТОП ── PO: OKR прошли проверку.
Дальше: /okr-roadmap <quarter>
</иначе>
```
```

- [ ] **Step 2: Verify frontmatter present**

Run: `head -1 commands/okr-debate.md`
Expected: `---`

- [ ] **Step 3: Commit**

```bash
git add commands/okr-debate.md
git commit -m "Add okr-debate command"
```

---

## Task 7: okr-roadmap command

**Files:**
- Create: `commands/okr-roadmap.md`

**Interfaces:**
- Consumes: `.okr/<quarter>/OKR-<quarter>.md` (Task 5/6).
- Produces: `.okr/<quarter>/roadmap.md` with one `## Objective N` section per
  objective, each containing three sub-lists `### Now`, `### Next`,
  `### Later`, every bullet tagged with the KR code it maps to. Consumed by
  `/okr-plan-deck` (Task 17) and `/okr-equator` (Task 16, roadmap-grid slide).

- [ ] **Step 1: Write `commands/okr-roadmap.md`**

```markdown
---
description: Roadmap Architect — строит roadmap.md (now-next-later) из OKR-<quarter>.md, с привязкой каждого пункта к Key Result.
---

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

Прочитай `OKR-<quarter>.md`. Для каждого Objective разложи его KR по
`Now`/`Next`/`Later`:
- **Now** — уже в работе или стартует в первые недели квартала.
- **Next** — стартует после Now, в пределах квартала.
- **Later** — осознанно отложено (нет ресурса/приоритета сейчас) или выходит
  за горизонт квартала.

Каждый буллет — `[<KR-код>] <краткое описание конкретного шага>`, не
переписывание формулировки KR целиком. Один KR может дать несколько буллетов
(декомпозиция на шаги), но каждый буллет ссылается ровно на один KR-код.

Если распределение неочевидно (нет сигналов трудоёмкости/приоритета в
контекст-паке) — спроси PO, не гадай молча.

## Отчёт

```
Roadmap собран: .okr/<quarter>/roadmap.md

── СТОП ── PO: проверьте приоритизацию Now/Next/Later.
Дальше: /okr-decompose <quarter>
```
```

- [ ] **Step 2: Verify frontmatter present**

Run: `head -1 commands/okr-roadmap.md`
Expected: `---`

- [ ] **Step 3: Commit**

```bash
git add commands/okr-roadmap.md
git commit -m "Add okr-roadmap command"
```

---

## Task 8: okr-decompose command

**Files:**
- Create: `commands/okr-decompose.md`

**Interfaces:**
- Consumes: `.okr/<quarter>/OKR-<quarter>.md`, `.okr/<quarter>/roadmap.md`.
- Produces: `.okr/<quarter>/KR-EPIC-MAP.md` — one entry per KR with
  `Эпик-кандидат`, `В объёме`, `Не в объёме`, `How to Demo` fields. Consumed
  by `/okr-equator` (part1-detail and part2-plan slides reference epic names)
  and, downstream in the pipeline, by `poh-bft-writer` as optional context.

- [ ] **Step 1: Write `commands/okr-decompose.md`**

```markdown
---
description: Decomposer — верхнеуровневая декомпозиция и требования по каждому KR (объём, границы, How to Demo). Не полный БФТ — для детальных требований на эпик используй poh-bft-writer.
---

## Использование

```
/okr-decompose <quarter>
```

## На выходе

```
.okr/<quarter>/KR-EPIC-MAP.md
```

## Формат документа

```markdown
# KR → Эпик карта <quarter>

## <KR-код> — <описание KR из OKR-<quarter>.md>

**Эпик-кандидат:** <рабочее название эпика для трекера>

**В объёме:**
- <пункт>

**Не в объёме:**
- <пункт>

**How to Demo:** <как поймём, что сделано — конкретный проверяемый сценарий>

**Зависимости:** <смежные команды/системы, или «нет»>
```

## Важно

Это **верхнеуровневые** требования — границы объёма и критерий готовности,
не корпоративный формат БФТ (без БТ/ПТ/ИТ/ФТ/НФТ, без adversarial-дебатов на
уровне требований). Если PO просит полный БФТ на эпик — это задача
`poh-bft-writer` (`/bft-context-gen`), не этой команды; `KR-EPIC-MAP.md`
можно передать туда как один из источников контекста.

## Инструкция для LLM

Для каждого KR из `OKR-<quarter>.md`:
1. Предложи рабочее название эпика-кандидата (без привязки к реальному
   трекер-ключу — он появится при заведении эпика).
2. Из `roadmap.md` и `okr-context-pack.md` выведи границы объёма — что явно
   входит, что явно не входит (даже если это выглядит очевидным — явное
   исключение экономит согласования позже).
3. Сформулируй How to Demo — конкретный, проверяемый сценарий приёмки, не
   общая фраза («PoC генерации FAQ доступен на проде для 3 тестовых
   категорий», не «FAQ работает»).
4. Зависимости — смежные команды/системы, если есть сигнал в индексе или
   контекст-паке; иначе «нет» или `[УТОЧНИТЬ]`, если подозреваешь
   зависимость, но не уверен.

## Отчёт

```
Декомпозиция собрана: .okr/<quarter>/KR-EPIC-MAP.md
<N> KR декомпозировано.

── СТОП ── PO: проверьте границы объёма и How to Demo.
Дальше: /okr-plan-deck <quarter>
```
```

- [ ] **Step 2: Verify frontmatter present**

Run: `head -1 commands/okr-decompose.md`
Expected: `---`

- [ ] **Step 3: Commit**

```bash
git add commands/okr-decompose.md
git commit -m "Add okr-decompose command"
```

---

## Task 9: equator-report-template.md resource

**Files:**
- Create: `skills/okr-equator/resources/equator-report-template.md`

**Interfaces:**
- Produces: the exact section skeleton that `okr-lint.py` (Task 10) validates
  against and that `/okr-equator` (Task 16) fills with real content.

- [ ] **Step 1: Create directories and write the template**

```bash
mkdir -p skills/okr-equator/resources skills/okr-equator/scripts/fixtures
```

```markdown
# Экватор <quarter> — <team>

> Отчёт к экватору квартала. PO: <po_name>. Команда: <team>.
> Часть 1 — статус за первую половину квартала (<period1>): «Эти задачи мы
> брали в квартал».
> Часть 2 — план на оставшуюся часть квартала (<period2>): «Задачи до конца
> квартала».
> Дата составления: <дата>.
> Источники: `.okr/<quarter>/OKR-<quarter>.md`, `roadmap.md`,
> `KR-EPIC-MAP.md`, живой трекер (если подключён), ручные правки PO.
> Статусы: Выполнено · В работе · На паузе · В ожидании · Отменено.
> **PBV** (Priority Business Value) — шкала из `okr-config.md → pbv_scale`,
> дефолт 1-9. Чем выше PBV, тем выше важность и критичность задачи.

## Главное за 60 секунд

**Что уже сделано.** <2-3 предложения: сколько KR закрыто, где основной
объём выполнения.>

**Планы на вторую половину квартала.** <2-3 предложения: горизонт, ключевые
коммитменты, точки риска.>

**Сложности и проблемы.** <2-3 категории: внешние блокеры / ресурсные /
системные — по 1-2 пункта.>

---

# Часть 1. Эти задачи мы брали в квартал

*Статус за первую половину квартала (<period1>)*

## Сводка по цифрам

| Инициатива | Всего KR | Выполнено | В работе | На паузе | В ожидании | Отменено |
|---|---|---|---|---|---|---|
| Objective 1 — <название> | | | | | | |
| **Итого** | | | | | | |

<Повтори блок ниже для каждого Objective>

## Objective N — <название>

*«<заострение цели, опционально>»*

### Завершено

| KR | Задача | PBV | Что сделано |
|---|---|---|---|

### В работе / в ожидании

| KR | Задача | PBV | Статус | Стадия | Что сделано | Что осталось |
|---|---|---|---|---|---|---|

### Актуальные риски

| KR | Описание риска | Как решаем |
|---|---|---|

### Отменено

| KR | Задача | PBV | Когда | Кто отменил | Комментарий |
|---|---|---|---|---|---|

---

# Часть 2. Задачи до конца квартала

*Горизонт: <period2>*

## Сводка по цифрам

| Инициатива | Активных KR | Из них есть реалистичный коммитмент | Под вопросом |
|---|---|---|---|

<Повтори блок ниже для каждого Objective>

## Objective N — <название>

| KR | Задача | PBV | Коммитмент до конца квартала | Условие / риск невыполнения |
|---|---|---|---|---|

### Новые KR — <Objective N, если есть>

| Задача | Коммитмент до конца квартала | Условие / риск невыполнения |
|---|---|---|

## Системные риски квартала, не привязанные к одному KR

| # | Риск | Влияет на |
|---|---|---|

## Открытые вопросы

- <пункт>
```

- [ ] **Step 2: Verify template is well-formed markdown**

Run: `grep -c '^## ' skills/okr-equator/resources/equator-report-template.md`
Expected: a number ≥ 5 (non-zero, confirming headers parsed as markdown).

- [ ] **Step 3: Commit**

```bash
git add skills/okr-equator/resources/equator-report-template.md
git commit -m "Add equator report markdown template"
```

---

## Task 10: okr-lint.py + tests (TDD)

**Files:**
- Create: `skills/okr-equator/scripts/okr-lint.py`
- Create: `skills/okr-equator/scripts/test-okr-lint.sh`
- Create: `skills/okr-equator/scripts/fixtures/valid-equator.md`
- Create: `skills/okr-equator/scripts/fixtures/invalid-missing-section.md`
- Create: `skills/okr-equator/scripts/fixtures/invalid-bad-status.md`

**Interfaces:**
- Produces: `lint(path) -> list[str]` (importable) and a CLI
  (`python3 okr-lint.py <path>`, exit 0 = OK / exit 1 = errors printed to
  stdout / exit 2 = usage error). Consumed by `/okr-equator` (Task 16) and
  `/okr-validate` (Task 18).

- [ ] **Step 1: Write the fixtures first**

`skills/okr-equator/scripts/fixtures/valid-equator.md`:
```markdown
# Экватор Q1 2099 — Тест

## Главное за 60 секунд

Текст для теста.

# Часть 1. Эти задачи мы брали в квартал

## Сводка по цифрам

| Инициатива | Всего | Выполнено |
|---|---|---|
| OBJ 1 | 3 | 1 |

| KR | Задача | PBV | Статус |
|---|---|---|---|
| 1.1 | Тестовая задача | 5 | Выполнено |
| 1.2 | Другая задача | — | Отменено |

# Часть 2. Задачи до конца квартала

## Сводка по цифрам

| Инициатива | Активных KR |
|---|---|
| OBJ 1 | 2 |

## Системные риски квартала

| # | Риск |
|---|---|
| 1 | Тестовый риск |

## Открытые вопросы

- Нет открытых вопросов.
```

`skills/okr-equator/scripts/fixtures/invalid-missing-section.md` (same as
valid, minus the final `## Открытые вопросы` section):
```markdown
# Экватор Q1 2099 — Тест

## Главное за 60 секунд

Текст для теста.

# Часть 1. Эти задачи мы брали в квартал

## Сводка по цифрам

| Инициатива | Всего | Выполнено |
|---|---|---|
| OBJ 1 | 3 | 1 |

| KR | Задача | PBV | Статус |
|---|---|---|---|
| 1.1 | Тестовая задача | 5 | Выполнено |

# Часть 2. Задачи до конца квартала

## Сводка по цифрам

| Инициатива | Активных KR |
|---|---|
| OBJ 1 | 2 |

## Системные риски квартала

| # | Риск |
|---|---|
| 1 | Тестовый риск |
```

`skills/okr-equator/scripts/fixtures/invalid-bad-status.md` (same as valid,
status `Выполнено` replaced with the non-enum value `Задумано`):
```markdown
# Экватор Q1 2099 — Тест

## Главное за 60 секунд

Текст для теста.

# Часть 1. Эти задачи мы брали в квартал

## Сводка по цифрам

| Инициатива | Всего | Выполнено |
|---|---|---|
| OBJ 1 | 3 | 1 |

| KR | Задача | PBV | Статус |
|---|---|---|---|
| 1.1 | Тестовая задача | 5 | Задумано |
| 1.2 | Другая задача | — | Отменено |

# Часть 2. Задачи до конца квартала

## Сводка по цифрам

| Инициатива | Активных KR |
|---|---|
| OBJ 1 | 2 |

## Системные риски квартала

| # | Риск |
|---|---|
| 1 | Тестовый риск |

## Открытые вопросы

- Нет открытых вопросов.
```

- [ ] **Step 2: Write `test-okr-lint.sh` (it will fail — okr-lint.py doesn't exist yet)**

```bash
#!/bin/bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="python3 $DIR/okr-lint.py"

pass=0
fail=0

run_case() {
  local file="$1" expect="$2"
  local out
  out="$($PY "$DIR/fixtures/$file" 2>&1)" && actual=0 || actual=$?
  if [ "$actual" = "$expect" ]; then
    echo "OK   $file (exit $actual)"
    pass=$((pass+1))
  else
    echo "FAIL $file (expected exit $expect, got $actual)"
    echo "$out"
    fail=$((fail+1))
  fi
}

run_case "valid-equator.md" 0
run_case "invalid-missing-section.md" 1
run_case "invalid-bad-status.md" 1

echo "---"
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
```

- [ ] **Step 3: Run test to verify it fails**

Run: `chmod +x skills/okr-equator/scripts/test-okr-lint.sh && bash skills/okr-equator/scripts/test-okr-lint.sh`
Expected: FAIL — `python3: can't open file '.../okr-lint.py'` (script doesn't
exist yet).

- [ ] **Step 4: Write `okr-lint.py`**

```python
#!/usr/bin/env python3
"""Структурный линтер для экватор-<quarter>.md.

Проверяет: обязательные разделы присутствуют, PBV в диапазоне 1-9 (или
маркер неопределённости), статус — из допустимого enum (или маркер
неопределённости). Ничего не проверяет по содержанию — только структуру.
"""
import re
import sys

REQUIRED_HEADERS = [
    r"^## Главное за 60 секунд",
    r"^# Часть 1\.",
    r"^# Часть 2\.",
    r"^## Системные риски квартала",
    r"^## Открытые вопросы",
]

ALLOWED_STATUSES = {"Выполнено", "В работе", "На паузе", "В ожидании", "Отменено"}
UNCERTAIN_MARKERS = {"уточнить у po", "[уточнить у po]", "уточнить", "—", "-", ""}


def check_headers(text):
    errors = []
    for pattern in REQUIRED_HEADERS:
        if not re.search(pattern, text, re.MULTILINE):
            errors.append(f"Отсутствует обязательный раздел: {pattern}")
    if len(re.findall(r"^## Сводка по цифрам", text, re.MULTILINE)) < 2:
        errors.append(
            "«Сводка по цифрам» должна быть в Части 1 и в Части 2 (найдено < 2 раз)"
        )
    return errors


def parse_tables(text):
    """Возвращает список (header_cells, [row_cells, ...]) для каждой markdown-таблицы."""
    tables = []
    lines = text.splitlines()
    i = 0
    sep_re = re.compile(r"^\s*\|[\s:|-]+\|\s*$")
    while i < len(lines):
        line = lines[i]
        if line.strip().startswith("|") and i + 1 < len(lines) and sep_re.match(lines[i + 1]):
            header = [c.strip() for c in line.strip().strip("|").split("|")]
            rows = []
            j = i + 2
            while j < len(lines) and lines[j].strip().startswith("|"):
                rows.append([c.strip() for c in lines[j].strip().strip("|").split("|")])
                j += 1
            tables.append((header, rows))
            i = j
        else:
            i += 1
    return tables


def check_pbv_and_status(text):
    errors = []
    for header, rows in parse_tables(text):
        pbv_idx = next((k for k, h in enumerate(header) if h.upper() == "PBV"), None)
        status_idx = next((k for k, h in enumerate(header) if h.lower() == "статус"), None)
        for row in rows:
            if pbv_idx is not None and pbv_idx < len(row):
                val = row[pbv_idx].strip()
                if val.lower() not in UNCERTAIN_MARKERS and not re.fullmatch(r"[1-9]", val):
                    errors.append(f"PBV вне диапазона 1-9: {val!r} в строке {row}")
            if status_idx is not None and status_idx < len(row):
                val = row[status_idx].strip()
                if val.lower() not in UNCERTAIN_MARKERS and val not in ALLOWED_STATUSES:
                    errors.append(f"Недопустимый статус: {val!r} в строке {row}")
    return errors


def lint(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return check_headers(text) + check_pbv_and_status(text)


def main():
    if len(sys.argv) != 2:
        print("Usage: okr-lint.py <path-to-экватор.md>", file=sys.stderr)
        sys.exit(2)
    errors = lint(sys.argv[1])
    if errors:
        print(f"НЕ ПРОШЁЛ: {len(errors)} ошибок")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    print("OK")
    sys.exit(0)


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bash skills/okr-equator/scripts/test-okr-lint.sh`
Expected:
```
OK   valid-equator.md (exit 0)
OK   invalid-missing-section.md (exit 1)
OK   invalid-bad-status.md (exit 1)
---
3 passed, 0 failed
```

- [ ] **Step 6: Commit**

```bash
chmod +x skills/okr-equator/scripts/okr-lint.py
git add skills/okr-equator/scripts/okr-lint.py skills/okr-equator/scripts/test-okr-lint.sh skills/okr-equator/scripts/fixtures
git commit -m "Add okr-lint.py structural linter with tests"
```

---

## Task 11: brandbook.md resource

**Files:**
- Create: `skills/okr-equator/resources/brandbook.md`

**Interfaces:**
- Produces: the canonical hex/font/canvas reference. `skills/okr-plan-deck/`
  (Task 17) references this file by relative path instead of duplicating it.

- [ ] **Step 1: Write `skills/okr-equator/resources/brandbook.md`**

```markdown
# Брендбук экватора

Извлечено из реального референс-деку PO (`srgbClr`, не тема Office по
умолчанию). Используется `build_equator_pptx.js` и (по ссылке)
`skills/okr-plan-deck/scripts/build_plan_deck.js`. Переопределяется через
`okr-config.md → brand_override`.

## Палитра

| Роль | Hex | Применение |
|---|---|---|
| Доминирующий тёмный | `0F0F14` | фон титульных/разделительных слайдов, основной текст |
| Тёплый беж | `E4E0DA` | фон контентных слайдов |
| Белый | `FFFFFF` | текст на тёмном, карточки |
| Серый вторичный | `8A8A8A` | подписи, второстепенный текст |
| Тёмно-серый | `42424A` | текст на бежевом |
| Голубой (чип) | `A9DCEE` / `C9DDF5` | статус «В работе» |
| Мятный (чип) | `C7F8E2` / `CDE8D2` | статус «Выполнено» |
| Розовый (чип) | `FFD9E2` | статус «Отменено» |
| Персиковый (чип) | `F7DCC4` | статус «В ожидании» |
| Жёлтый (чип) | `FFEDB0` | статус «На паузе» / внимание |
| Акцент | `4C6FFF` | точечное использование, не более 1 раза на слайд |

## Типографика

- **Arial** — заголовки и текст.
- **Courier New** — цифры/данные (PBV, счётчики, метки статуса) —
  моноширинный технический акцент.

## Canvas

Нестандартный масштаб 16:9: **20in × 11.25in** (не дефолтные пресеты
pptxgenjs `13.33in × 7.5in` / `10in × 5.625in`). Задаётся явно:

```js
pres.defineLayout({ name: "OKR_EQUATOR_WIDE", width: 20, height: 11.25 });
pres.layout = "OKR_EQUATOR_WIDE";
```

## Правила (из скилла pptx, обязательны)

- Hex-цвета без `#`, никогда 8 цифр.
- `bullet: true` на пунктах списка, никогда литеральный `•`.
- `breakLine: true` на каждом элементе массива текста кроме последнего.
- `margin: 0` на текстовых блоках, которые должны совпадать по краю с
  фигурой/линией.
- Никогда не переиспользовать один options-объект (особенно `shadow`) между
  двумя вызовами `add*` — pptxgenjs мутирует объект in place.
- Не использовать акцентные полосы/цветные бордюры с одной стороны — читается
  как AI-генерация.
```

- [ ] **Step 2: Verify hex table matches Global Constraints**

Run: `grep -oE '[0-9A-F]{6}' skills/okr-equator/resources/brandbook.md | sort -u`
Expected: exactly `0F0F14 E4E0DA FFFFFF 8A8A8A 42424A A9DCEE C9DDF5 C7F8E2
CDE8D2 FFD9E2 F7DCC4 FFEDB0 4C6FFF` (13 unique hex codes, no others).

- [ ] **Step 3: Commit**

```bash
git add skills/okr-equator/resources/brandbook.md
git commit -m "Add equator brandbook resource"
```

---

## Task 12: build_equator_pptx.js — structural slides

**Files:**
- Create: `skills/okr-equator/scripts/build_equator_pptx.js`
- Create: `skills/okr-equator/scripts/fixtures/sample-equator-data.json` (grows
  across Tasks 12-15, minimal subset needed here)

**Interfaces:**
- Produces: `newDeck()`, `addTitleSlide(pres, meta)`,
  `addDividerSlide(pres, title, subtitle)`,
  `addSummaryFunnelSlide(pres, summaryFunnel)`,
  `addStatusTableSlide(pres, summaryFunnel)`, and the shared `BRAND` object —
  all `module.exports`-ed. Consumed by Tasks 13-15 (more slide builders) and
  the final orchestrator (Task 15).
- Consumes: nothing external — pure `pptxgenjs`.

- [ ] **Step 1: Write the minimal sample data fixture**

```bash
mkdir -p skills/okr-equator/scripts/fixtures
```

`skills/okr-equator/scripts/fixtures/sample-equator-data.json`:
```json
{
  "meta": {
    "team": "GDS",
    "po": "Тестовый PO",
    "period1": "01.07 — 17.08",
    "period2": "19.08 — 30.09",
    "quarterLabel": "Q3 2026",
    "scopeNote": "GDS · Live · UMC"
  },
  "summaryFunnel": {
    "objectives": [
      {"name": "OBJ 1 — Отделение от БАЗИС", "total": 7, "done": 1, "inProgress": 5, "notStarted": 1, "cancelled": 0},
      {"name": "OBJ 2 — Развитие витрины", "total": 15, "done": 4, "inProgress": 2, "notStarted": 3, "cancelled": 6}
    ],
    "total": {"total": 22, "done": 5, "inProgress": 7, "notStarted": 4, "cancelled": 6}
  }
}
```

- [ ] **Step 2: Write `build_equator_pptx.js` (structural slides only)**

```js
const pptxgen = require("pptxgenjs");

const BRAND = {
  dark: "0F0F14",
  beige: "E4E0DA",
  white: "FFFFFF",
  grayMid: "8A8A8A",
  grayDark: "42424A",
  statusInProgress: "A9DCEE",
  statusInProgress2: "C9DDF5",
  statusDone: "C7F8E2",
  statusDone2: "CDE8D2",
  statusCancelled: "FFD9E2",
  statusWaiting: "F7DCC4",
  statusHold: "FFEDB0",
  accent: "4C6FFF",
  fontHead: "Arial",
  fontMono: "Courier New",
};

const LAYOUT_NAME = "OKR_EQUATOR_WIDE";
const LAYOUT_W = 20;
const LAYOUT_H = 11.25;
const MARGIN = 0.6;

function newDeck() {
  const pres = new pptxgen();
  pres.defineLayout({ name: LAYOUT_NAME, width: LAYOUT_W, height: LAYOUT_H });
  pres.layout = LAYOUT_NAME;
  return pres;
}

function addTitleSlide(pres, meta) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.dark };
  slide.addText(`Экватор ${meta.quarterLabel} · ${meta.team}`, {
    x: MARGIN, y: 3.6, w: LAYOUT_W - MARGIN * 2, h: 1.6,
    fontFace: BRAND.fontHead, fontSize: 44, bold: true, color: BRAND.white, margin: 0,
  });
  slide.addText("Что сделали за первую половину квартала и что планируем закончить.", {
    x: MARGIN, y: 5.2, w: LAYOUT_W - MARGIN * 2, h: 0.8,
    fontFace: BRAND.fontHead, fontSize: 18, color: BRAND.grayMid, margin: 0,
  });
  slide.addText(`${meta.period1} / ${meta.period2}`, {
    x: MARGIN, y: 6.1, w: LAYOUT_W - MARGIN * 2, h: 0.6,
    fontFace: BRAND.fontMono, fontSize: 16, color: BRAND.white, margin: 0,
  });
  slide.addText(`PO — ${meta.po}`, {
    x: MARGIN, y: 9.6, w: LAYOUT_W - MARGIN * 2, h: 0.5,
    fontFace: BRAND.fontHead, fontSize: 14, color: BRAND.grayMid, margin: 0,
  });
  slide.addText(meta.scopeNote || "", {
    x: MARGIN, y: 10.1, w: LAYOUT_W - MARGIN * 2, h: 0.5,
    fontFace: BRAND.fontHead, fontSize: 14, color: BRAND.grayMid, margin: 0,
  });
  return slide;
}

function addDividerSlide(pres, title, subtitle) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.dark };
  slide.addText(title, {
    x: MARGIN, y: 4.6, w: LAYOUT_W - MARGIN * 2, h: 1.2,
    fontFace: BRAND.fontHead, fontSize: 32, bold: true, color: BRAND.white, margin: 0,
  });
  slide.addText(subtitle || "", {
    x: MARGIN, y: 5.8, w: LAYOUT_W - MARGIN * 2, h: 0.8,
    fontFace: BRAND.fontHead, fontSize: 18, color: BRAND.grayMid, margin: 0,
  });
  return slide;
}

function statusBreakdown(obj) {
  return [
    { label: "Выполнено", value: obj.done, color: BRAND.statusDone },
    { label: "В работе", value: obj.inProgress, color: BRAND.statusInProgress },
    { label: "Не начато", value: obj.notStarted, color: BRAND.statusWaiting },
    { label: "Отменено", value: obj.cancelled, color: BRAND.statusCancelled },
  ];
}

function addSummaryFunnelSlide(pres, summaryFunnel) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText("Что сделано и что в работе", {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.9,
    fontFace: BRAND.fontHead, fontSize: 30, bold: true, color: BRAND.dark, margin: 0,
  });

  const rows = [...summaryFunnel.objectives, { name: "Итого", ...summaryFunnel.total }];
  const barX = MARGIN, barW = LAYOUT_W - MARGIN * 2 - 3.0;
  let y = 1.8;
  const rowH = (LAYOUT_H - y - MARGIN) / rows.length;

  rows.forEach((row) => {
    slide.addText(row.name, {
      x: barX, y, w: 4.5, h: rowH * 0.8,
      fontFace: BRAND.fontHead, fontSize: 14, color: BRAND.grayDark, margin: 0, valign: "middle",
    });
    let segX = barX + 4.7;
    const segTotalW = barW - 4.7;
    const total = row.total || 1;
    statusBreakdown(row).forEach((seg) => {
      const segW = (seg.value / total) * segTotalW;
      if (segW > 0) {
        slide.addShape("rect", {
          x: segX, y: y + rowH * 0.15, w: segW, h: rowH * 0.5,
          fill: { color: seg.color }, line: { type: "none" },
        });
        segX += segW;
      }
    });
    slide.addText(String(row.total), {
      x: barX + barW + 0.2, y, w: 1.0, h: rowH * 0.8,
      fontFace: BRAND.fontMono, fontSize: 16, bold: true, color: BRAND.dark, margin: 0, valign: "middle",
    });
    y += rowH;
  });
  return slide;
}

function addStatusTableSlide(pres, summaryFunnel) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText("Часть 1 · Статус по инициативам", {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.9,
    fontFace: BRAND.fontHead, fontSize: 28, bold: true, color: BRAND.dark, margin: 0,
  });

  const header = ["Инициатива", "Всего", "Выполнено", "В работе", "Не начато", "Отменено"];
  const rows = summaryFunnel.objectives.map((o) => [o.name, o.total, o.done, o.inProgress, o.notStarted, o.cancelled]);
  const total = summaryFunnel.total;
  rows.push(["Итого", total.total, total.done, total.inProgress, total.notStarted, total.cancelled]);

  const tableRows = [
    header.map((h) => ({ text: h, options: { bold: true, fill: { color: BRAND.dark }, color: BRAND.white, fontFace: BRAND.fontHead, fontSize: 13 } })),
    ...rows.map((r) => r.map((c) => ({ text: String(c), options: { fontFace: BRAND.fontMono, fontSize: 13, color: BRAND.grayDark } }))),
  ];

  slide.addTable(tableRows, {
    x: MARGIN, y: 2.0, w: LAYOUT_W - MARGIN * 2, h: 0.6 * tableRows.length,
    border: { type: "solid", color: BRAND.grayMid, pt: 0.5 },
    autoPage: false,
  });
  return slide;
}

module.exports = {
  BRAND, LAYOUT_NAME, LAYOUT_W, LAYOUT_H, MARGIN,
  newDeck, addTitleSlide, addDividerSlide, addSummaryFunnelSlide, addStatusTableSlide,
  statusBreakdown,
};
```

- [ ] **Step 3: Write and run a smoke test for these four builders**

```bash
cd skills/okr-equator/scripts
node -e '
const fs = require("fs");
const { newDeck, addTitleSlide, addDividerSlide, addSummaryFunnelSlide, addStatusTableSlide } = require("./build_equator_pptx.js");
const data = JSON.parse(fs.readFileSync("./fixtures/sample-equator-data.json", "utf8"));
const pres = newDeck();
addTitleSlide(pres, data.meta);
addDividerSlide(pres, "ЧАСТЬ 2", "Полный отчёт");
addSummaryFunnelSlide(pres, data.summaryFunnel);
addStatusTableSlide(pres, data.summaryFunnel);
pres.writeFile({ fileName: "/tmp/okr-equator-smoke-task12.pptx" }).then(() => console.log("OK: 4 slides written"));
'
```
Expected: `OK: 4 slides written`, no exceptions. If `pptxgenjs` is not
installed, run `npm install pptxgenjs` in `skills/okr-equator/scripts/` first
(preinstalled in the sandboxed pptx-skill environment; a fresh clone needs it
explicitly — add a `package.json` with `pptxgenjs` as a dependency in this
step if `require` fails).

- [ ] **Step 4: Commit**

```bash
git add skills/okr-equator/scripts/build_equator_pptx.js skills/okr-equator/scripts/fixtures/sample-equator-data.json
git commit -m "Add pptx builder: title, divider, summary-funnel, status-table slides"
```

---

## Task 13: build_equator_pptx.js — risks, roadmap-grid, sprints slides

**Files:**
- Modify: `skills/okr-equator/scripts/build_equator_pptx.js`
- Modify: `skills/okr-equator/scripts/fixtures/sample-equator-data.json`

**Interfaces:**
- Consumes: `BRAND`, `LAYOUT_W`, `LAYOUT_H`, `MARGIN` (Task 12, same file).
- Produces: `addRisksSlide(pres, risks)`, `addRoadmapGridSlide(pres, grid)`,
  `addSprintsSlide(pres, sprints)` — added to the same `module.exports`.

- [ ] **Step 1: Extend the sample data fixture**

Add to `skills/okr-equator/scripts/fixtures/sample-equator-data.json` (merge
into the existing JSON object, alongside `meta` and `summaryFunnel`):

```json
  "risks": [
    {"category": "Внешнее", "title": "Kafka от TC не готова", "detail": "Если не выкатится — заказы уходят за квартал."},
    {"category": "Ресурс", "title": "Аналитики перегружены", "detail": "Временный перегруз из-за крупных задач."}
  ],
  "roadmapGrid": {
    "columns": ["OBJ 1 · БАЗИС", "OBJ 2 · ВИТРИНА"],
    "items": [
      ["Dataflow TC → UMC, пилот", "Заказы TicketsCloud 24.08"],
      ["FAQ на LLM — PoC на проде"]
    ]
  },
  "sprints": {
    "sprintLabels": ["Спринт 1\n19.08–01.09", "Спринт 2\n02.09–15.09", "Спринт 3\n16.09–30.09"],
    "rows": [
      {"objective": "O1", "title": "Заказы и возвраты TicketsCloud", "stagesPerSprint": [["бек", "приёмка"], ["бек"], []]},
      {"objective": "O2", "title": "FAQ на LLM — PoC", "stagesPerSprint": [["аналитика"], ["бек", "приёмка"], []]}
    ]
  }
```

- [ ] **Step 2: Append the three builder functions to `build_equator_pptx.js`**

Insert before the `module.exports = {` line:

```js
function addRisksSlide(pres, risks) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText("Риски и проблемы", {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.9,
    fontFace: BRAND.fontHead, fontSize: 30, bold: true, color: BRAND.dark, margin: 0,
  });

  const cols = 2;
  const cardW = (LAYOUT_W - MARGIN * 2 - 0.6) / cols;
  const cardH = 2.4;
  risks.forEach((risk, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN + col * (cardW + 0.6);
    const y = 2.0 + row * (cardH + 0.5);
    slide.addShape("roundRect", {
      x, y, w: cardW, h: cardH, rectRadius: 0.08,
      fill: { color: BRAND.white }, line: { type: "none" },
      shadow: { type: "outer", color: "000000", opacity: 0.15, blur: 6, offset: 2, angle: 90 },
    });
    slide.addShape("roundRect", {
      x: x + 0.3, y: y + 0.3, w: 1.8, h: 0.4, rectRadius: 0.2,
      fill: { color: BRAND.statusWaiting }, line: { type: "none" },
    });
    slide.addText(risk.category.toUpperCase(), {
      x: x + 0.3, y: y + 0.3, w: 1.8, h: 0.4,
      fontFace: BRAND.fontHead, fontSize: 11, bold: true, color: BRAND.grayDark,
      align: "center", valign: "middle", margin: 0,
    });
    slide.addText(risk.title, {
      x: x + 0.3, y: y + 0.85, w: cardW - 0.6, h: 0.6,
      fontFace: BRAND.fontHead, fontSize: 16, bold: true, color: BRAND.dark, margin: 0,
    });
    slide.addText(risk.detail, {
      x: x + 0.3, y: y + 1.45, w: cardW - 0.6, h: cardH - 1.6,
      fontFace: BRAND.fontHead, fontSize: 12, color: BRAND.grayMid, margin: 0,
    });
  });
  return slide;
}

function addRoadmapGridSlide(pres, grid) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText("Roadmap на вторую часть", {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.9,
    fontFace: BRAND.fontHead, fontSize: 30, bold: true, color: BRAND.dark, margin: 0,
  });

  const cols = grid.columns.length;
  const colW = (LAYOUT_W - MARGIN * 2 - (cols - 1) * 0.5) / cols;
  grid.columns.forEach((colTitle, i) => {
    const x = MARGIN + i * (colW + 0.5);
    slide.addText(colTitle, {
      x, y: 2.0, w: colW, h: 0.6,
      fontFace: BRAND.fontHead, fontSize: 16, bold: true, color: BRAND.dark, margin: 0,
    });
    const items = grid.items[i] || [];
    const textItems = items.map((item, idx) => ({
      text: item,
      options: { bullet: true, breakLine: idx < items.length - 1, fontFace: BRAND.fontHead, fontSize: 13, color: BRAND.grayDark, paraSpaceAfter: 8 },
    }));
    if (textItems.length) {
      slide.addText(textItems, { x, y: 2.7, w: colW, h: LAYOUT_H - 2.7 - MARGIN, margin: 0 });
    }
  });
  return slide;
}

function addSprintsSlide(pres, sprints) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText("Инициативы по спринтам", {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.9,
    fontFace: BRAND.fontHead, fontSize: 30, bold: true, color: BRAND.dark, margin: 0,
  });

  const header = ["Инициатива", ...sprints.sprintLabels];
  const tableRows = [
    header.map((h) => ({ text: h, options: { bold: true, fill: { color: BRAND.dark }, color: BRAND.white, fontFace: BRAND.fontHead, fontSize: 12 } })),
    ...sprints.rows.map((r) => {
      const titleCell = { text: `[${r.objective}] ${r.title}`, options: { fontFace: BRAND.fontHead, fontSize: 12, color: BRAND.grayDark } };
      const stageCells = r.stagesPerSprint.map((stages) => ({
        text: stages.length ? stages.join(", ") : "—",
        options: { fontFace: BRAND.fontMono, fontSize: 11, color: BRAND.grayDark, fill: { color: stages.length ? BRAND.statusInProgress2 : BRAND.white } },
      }));
      return [titleCell, ...stageCells];
    }),
  ];

  slide.addTable(tableRows, {
    x: MARGIN, y: 2.0, w: LAYOUT_W - MARGIN * 2, h: 0.6 * tableRows.length,
    border: { type: "solid", color: BRAND.grayMid, pt: 0.5 },
    autoPage: false,
  });
  return slide;
}
```

Update the `module.exports` block (Task 12's version) to add these three
names:

```js
module.exports = {
  BRAND, LAYOUT_NAME, LAYOUT_W, LAYOUT_H, MARGIN,
  newDeck, addTitleSlide, addDividerSlide, addSummaryFunnelSlide, addStatusTableSlide,
  addRisksSlide, addRoadmapGridSlide, addSprintsSlide,
  statusBreakdown,
};
```

- [ ] **Step 3: Write and run a smoke test for these three builders**

```bash
cd skills/okr-equator/scripts
node -e '
const fs = require("fs");
const b = require("./build_equator_pptx.js");
const data = JSON.parse(fs.readFileSync("./fixtures/sample-equator-data.json", "utf8"));
const pres = b.newDeck();
b.addRisksSlide(pres, data.risks);
b.addRoadmapGridSlide(pres, data.roadmapGrid);
b.addSprintsSlide(pres, data.sprints);
pres.writeFile({ fileName: "/tmp/okr-equator-smoke-task13.pptx" }).then(() => console.log("OK: 3 slides written"));
'
```
Expected: `OK: 3 slides written`, no exceptions.

- [ ] **Step 4: Commit**

```bash
git add skills/okr-equator/scripts/build_equator_pptx.js skills/okr-equator/scripts/fixtures/sample-equator-data.json
git commit -m "Add pptx builder: risks, roadmap-grid, sprints slides"
```

---

## Task 14: build_equator_pptx.js — per-objective quad slides

**Files:**
- Modify: `skills/okr-equator/scripts/build_equator_pptx.js`
- Modify: `skills/okr-equator/scripts/fixtures/sample-equator-data.json`

**Interfaces:**
- Consumes: `BRAND`, `LAYOUT_W`, `LAYOUT_H`, `MARGIN` (Task 12).
- Produces: `addStageFunnelSlide`, `addPart2PlanSlide`,
  `addPart1DetailTableSlide`, `addNewTasksSlide`, `addObjRisksSlide` — added
  to `module.exports`. Each takes one `objective` object (shape defined in
  Step 1 below).

- [ ] **Step 1: Extend the sample data fixture with one objective**

Add to `skills/okr-equator/scripts/fixtures/sample-equator-data.json`:

```json
  "objectives": [
    {
      "code": "OBJ 1",
      "name": "Отделение витрины Ticketland от БАЗИС",
      "goalQuote": "«Недоступность БАЗИС не останавливает Ticketland»",
      "stageFunnel": {"total": 7, "waiting": 1, "research": 3, "analysis": 0, "dev": 2, "debug": 0, "done": 1, "cancelled": 0},
      "part2Plan": {"inProgress": ["1.1 Dataflow TC → UMC → web_db", "1.2 Заказы TicketsCloud"], "waiting": ["1.5 extapi_go B2B"], "new": []},
      "part1Table": [
        {"status": "выполнено", "kr": "1.1.E1", "task": "Дизайн дедубликации", "pbv": 9, "done": "Артефакт готов", "left": "—"},
        {"status": "в работе", "kr": "1.1", "task": "Продажа TC через UMC", "pbv": 9, "done": "Аналитика", "left": "Разработка"}
      ],
      "newTasks": [],
      "risks": [
        {"type": "Внешнее", "risk": "Kafka от TC не готова к 24.08", "mitigation": "Отслеживаем 24.08"}
      ]
    }
  ]
```

- [ ] **Step 2: Append the five builder functions to `build_equator_pptx.js`**

Insert before `module.exports`:

```js
function statusChipColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "выполнено") return BRAND.statusDone;
  if (s === "в работе") return BRAND.statusInProgress;
  if (s === "на паузе") return BRAND.statusHold;
  if (s === "в ожидании") return BRAND.statusWaiting;
  if (s === "отменено") return BRAND.statusCancelled;
  return BRAND.white;
}

function addStageFunnelSlide(pres, objective) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText(`${objective.code} — ${objective.name}`, {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.8,
    fontFace: BRAND.fontHead, fontSize: 26, bold: true, color: BRAND.dark, margin: 0,
  });
  if (objective.goalQuote) {
    slide.addText(objective.goalQuote, {
      x: MARGIN, y: 1.3, w: LAYOUT_W - MARGIN * 2, h: 0.6,
      fontFace: BRAND.fontHead, italic: true, fontSize: 15, color: BRAND.grayMid, margin: 0,
    });
  }

  const stats = [
    { label: "Всего KR", value: objective.stageFunnel.total, color: BRAND.dark },
    { label: "В ожидании", value: objective.stageFunnel.waiting, color: BRAND.statusWaiting },
    { label: "Исследование", value: objective.stageFunnel.research, color: BRAND.statusInProgress2 },
    { label: "Аналитика", value: objective.stageFunnel.analysis, color: BRAND.statusInProgress2 },
    { label: "Разработка", value: objective.stageFunnel.dev, color: BRAND.statusInProgress },
    { label: "Отладка", value: objective.stageFunnel.debug, color: BRAND.statusInProgress },
    { label: "Выполнено", value: objective.stageFunnel.done, color: BRAND.statusDone },
    { label: "Отменено", value: objective.stageFunnel.cancelled, color: BRAND.statusCancelled },
  ];
  const boxW = (LAYOUT_W - MARGIN * 2 - 0.3 * (stats.length - 1)) / stats.length;
  stats.forEach((s, i) => {
    const x = MARGIN + i * (boxW + 0.3);
    slide.addShape("rect", {
      x, y: 2.4, w: boxW, h: 2.0, fill: { color: s.color }, line: { type: "none" },
    });
    slide.addText(String(s.value), {
      x, y: 2.6, w: boxW, h: 1.0, align: "center",
      fontFace: BRAND.fontMono, fontSize: 32, bold: true, color: BRAND.dark, margin: 0,
    });
    slide.addText(s.label, {
      x, y: 3.6, w: boxW, h: 0.7, align: "center",
      fontFace: BRAND.fontHead, fontSize: 11, color: BRAND.grayDark, margin: 0,
    });
  });
  return slide;
}

function bulletColumn(slide, x, w, title, items, chipColor) {
  slide.addShape("roundRect", {
    x, y: 2.0, w: 1.8, h: 0.4, rectRadius: 0.2,
    fill: { color: chipColor }, line: { type: "none" },
  });
  slide.addText(title.toUpperCase(), {
    x, y: 2.0, w: 1.8, h: 0.4, align: "center", valign: "middle",
    fontFace: BRAND.fontHead, fontSize: 11, bold: true, color: BRAND.grayDark, margin: 0,
  });
  if (items.length) {
    const textItems = items.map((item, idx) => ({
      text: item,
      options: { bullet: true, breakLine: idx < items.length - 1, fontFace: BRAND.fontHead, fontSize: 13, color: BRAND.grayDark, paraSpaceAfter: 8 },
    }));
    slide.addText(textItems, { x, y: 2.6, w, h: LAYOUT_H - 2.6 - MARGIN, margin: 0 });
  } else {
    slide.addText("нет задач", {
      x, y: 2.6, w, h: 0.5, fontFace: BRAND.fontHead, italic: true, fontSize: 13, color: BRAND.grayMid, margin: 0,
    });
  }
}

function addPart2PlanSlide(pres, objective) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText(`${objective.code} · чем занимаемся до конца квартала`, {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.8,
    fontFace: BRAND.fontHead, fontSize: 26, bold: true, color: BRAND.dark, margin: 0,
  });
  const colW = (LAYOUT_W - MARGIN * 2 - 1.0) / 3;
  bulletColumn(slide, MARGIN, colW, "В работе", objective.part2Plan.inProgress, BRAND.statusInProgress);
  bulletColumn(slide, MARGIN + colW + 0.5, colW, "В ожидании", objective.part2Plan.waiting, BRAND.statusWaiting);
  bulletColumn(slide, MARGIN + 2 * (colW + 0.5), colW, "Новое", objective.part2Plan.new, BRAND.statusDone);
  return slide;
}

function addPart1DetailTableSlide(pres, objective) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText(`${objective.code} — что сделано из того, что брали`, {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.8,
    fontFace: BRAND.fontHead, fontSize: 24, bold: true, color: BRAND.dark, margin: 0,
  });

  const header = ["KR", "Задача", "PBV", "Что сделано", "Что осталось"];
  const tableRows = [
    header.map((h) => ({ text: h, options: { bold: true, fill: { color: BRAND.dark }, color: BRAND.white, fontFace: BRAND.fontHead, fontSize: 12 } })),
    ...objective.part1Table.map((r) => [
      { text: r.kr, options: { fontFace: BRAND.fontMono, fontSize: 12, color: BRAND.grayDark, fill: { color: statusChipColor(r.status) } } },
      { text: r.task, options: { fontFace: BRAND.fontHead, fontSize: 12, color: BRAND.grayDark } },
      { text: String(r.pbv), options: { fontFace: BRAND.fontMono, fontSize: 12, color: BRAND.grayDark, align: "center" } },
      { text: r.done, options: { fontFace: BRAND.fontHead, fontSize: 11, color: BRAND.grayDark } },
      { text: r.left, options: { fontFace: BRAND.fontHead, fontSize: 11, color: BRAND.grayDark } },
    ]),
  ];
  slide.addTable(tableRows, {
    x: MARGIN, y: 1.6, w: LAYOUT_W - MARGIN * 2, h: 0.8 * tableRows.length,
    border: { type: "solid", color: BRAND.grayMid, pt: 0.5 },
    autoPage: false,
  });
  return slide;
}

function addNewTasksSlide(pres, objective) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText(`${objective.code} · новые задачи`, {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.8,
    fontFace: BRAND.fontHead, fontSize: 26, bold: true, color: BRAND.dark, margin: 0,
  });
  const header = ["Название", "How to demo", "PBV", "Заказчик"];
  const tableRows = [
    header.map((h) => ({ text: h, options: { bold: true, fill: { color: BRAND.dark }, color: BRAND.white, fontFace: BRAND.fontHead, fontSize: 12 } })),
    ...objective.newTasks.map((t) => [
      { text: t.name, options: { fontFace: BRAND.fontHead, fontSize: 12, color: BRAND.grayDark } },
      { text: t.howToDemo, options: { fontFace: BRAND.fontHead, fontSize: 11, color: BRAND.grayDark } },
      { text: t.pbv == null ? "—" : String(t.pbv), options: { fontFace: BRAND.fontMono, fontSize: 12, color: BRAND.grayDark, align: "center" } },
      { text: t.owner || "—", options: { fontFace: BRAND.fontHead, fontSize: 12, color: BRAND.grayDark } },
    ]),
  ];
  slide.addTable(tableRows, {
    x: MARGIN, y: 1.8, w: LAYOUT_W - MARGIN * 2, h: 0.8 * tableRows.length,
    border: { type: "solid", color: BRAND.grayMid, pt: 0.5 },
    autoPage: false,
  });
  slide.addText("Эти задачи не входили в исходный план квартала.", {
    x: MARGIN, y: LAYOUT_H - 1.0, w: LAYOUT_W - MARGIN * 2, h: 0.5,
    fontFace: BRAND.fontHead, italic: true, fontSize: 12, color: BRAND.grayMid, margin: 0,
  });
  return slide;
}

function addObjRisksSlide(pres, objective) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText(`${objective.code} · риски и эскалации`, {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.8,
    fontFace: BRAND.fontHead, fontSize: 26, bold: true, color: BRAND.dark, margin: 0,
  });
  const header = ["Тип", "Риск", "Что делаем"];
  const tableRows = [
    header.map((h) => ({ text: h, options: { bold: true, fill: { color: BRAND.dark }, color: BRAND.white, fontFace: BRAND.fontHead, fontSize: 12 } })),
    ...objective.risks.map((r) => [
      { text: r.type, options: { fontFace: BRAND.fontHead, fontSize: 12, color: BRAND.grayDark, fill: { color: BRAND.statusWaiting } } },
      { text: r.risk, options: { fontFace: BRAND.fontHead, fontSize: 12, color: BRAND.grayDark } },
      { text: r.mitigation, options: { fontFace: BRAND.fontHead, fontSize: 12, color: BRAND.grayDark } },
    ]),
  ];
  slide.addTable(tableRows, {
    x: MARGIN, y: 1.8, w: LAYOUT_W - MARGIN * 2, h: 0.9 * tableRows.length,
    border: { type: "solid", color: BRAND.grayMid, pt: 0.5 },
    autoPage: false,
  });
  return slide;
}
```

Update `module.exports` to add these six names (five slide builders +
`statusChipColor`):

```js
module.exports = {
  BRAND, LAYOUT_NAME, LAYOUT_W, LAYOUT_H, MARGIN,
  newDeck, addTitleSlide, addDividerSlide, addSummaryFunnelSlide, addStatusTableSlide,
  addRisksSlide, addRoadmapGridSlide, addSprintsSlide,
  addStageFunnelSlide, addPart2PlanSlide, addPart1DetailTableSlide, addNewTasksSlide, addObjRisksSlide,
  statusBreakdown, statusChipColor,
};
```

- [ ] **Step 3: Write and run a smoke test for these five builders**

```bash
cd skills/okr-equator/scripts
node -e '
const fs = require("fs");
const b = require("./build_equator_pptx.js");
const data = JSON.parse(fs.readFileSync("./fixtures/sample-equator-data.json", "utf8"));
const pres = b.newDeck();
const obj = data.objectives[0];
b.addStageFunnelSlide(pres, obj);
b.addPart2PlanSlide(pres, obj);
b.addPart1DetailTableSlide(pres, obj);
b.addObjRisksSlide(pres, obj);
pres.writeFile({ fileName: "/tmp/okr-equator-smoke-task14.pptx" }).then(() => console.log("OK: 4 slides written"));
'
```
Expected: `OK: 4 slides written`. `addNewTasksSlide` is exercised separately
in Task 15's full-deck smoke test once `newTasks` has data (this fixture's
`newTasks` is intentionally empty — orchestrator skips it, matching the
"skip when empty" rule from the design).

- [ ] **Step 4: Commit**

```bash
git add skills/okr-equator/scripts/build_equator_pptx.js skills/okr-equator/scripts/fixtures/sample-equator-data.json
git commit -m "Add pptx builder: per-objective quad slides"
```

---

## Task 15: build_equator_pptx.js — leadership-asks + orchestrator + full smoke test

**Files:**
- Modify: `skills/okr-equator/scripts/build_equator_pptx.js`
- Modify: `skills/okr-equator/scripts/fixtures/sample-equator-data.json`
- Create: `skills/okr-equator/scripts/package.json`

**Interfaces:**
- Consumes: every builder from Tasks 12-14, `data.objectives[].newTasks`
  (needs a non-empty entry to exercise `addNewTasksSlide` in the full-deck
  test).
- Produces: `buildEquatorDeck(data) -> pres`, and a CLI entry point
  (`node build_equator_pptx.js <data.json> <out.pptx>`). This is the function
  `/okr-equator` (Task 16) invokes.

- [ ] **Step 1: Add a second objective with `newTasks` to the fixture, plus `leadershipAsks`**

Update `skills/okr-equator/scripts/fixtures/sample-equator-data.json` —
replace the `"objectives": [...]` array with two entries (the first
unchanged from Task 14, a second added), and add `leadershipAsks`:

```json
  "objectives": [
    {
      "code": "OBJ 1",
      "name": "Отделение витрины Ticketland от БАЗИС",
      "goalQuote": "«Недоступность БАЗИС не останавливает Ticketland»",
      "stageFunnel": {"total": 7, "waiting": 1, "research": 3, "analysis": 0, "dev": 2, "debug": 0, "done": 1, "cancelled": 0},
      "part2Plan": {"inProgress": ["1.1 Dataflow TC → UMC → web_db", "1.2 Заказы TicketsCloud"], "waiting": ["1.5 extapi_go B2B"], "new": []},
      "part1Table": [
        {"status": "выполнено", "kr": "1.1.E1", "task": "Дизайн дедубликации", "pbv": 9, "done": "Артефакт готов", "left": "—"},
        {"status": "в работе", "kr": "1.1", "task": "Продажа TC через UMC", "pbv": 9, "done": "Аналитика", "left": "Разработка"}
      ],
      "newTasks": [],
      "risks": [
        {"type": "Внешнее", "risk": "Kafka от TC не готова к 24.08", "mitigation": "Отслеживаем 24.08"}
      ]
    },
    {
      "code": "OBJ 2",
      "name": "Развитие витрины",
      "goalQuote": "",
      "stageFunnel": {"total": 15, "waiting": 5, "research": 0, "analysis": 0, "dev": 1, "debug": 1, "done": 3, "cancelled": 5},
      "part2Plan": {"inProgress": ["2.5 Email-рестораны"], "waiting": ["2.7 VibeApp/Музыка"], "new": ["AI-Harness — пилот"]},
      "part1Table": [
        {"status": "выполнено", "kr": "2.4", "task": "RELEASE КИНО", "pbv": 9, "done": "Закрыт 23-24.07", "left": "—"}
      ],
      "newTasks": [
        {"name": "FAQ на LLM", "howToDemo": "Первая версия генерации FAQ в проде", "pbv": null, "owner": null}
      ],
      "risks": []
    }
  ],
  "leadershipAsks": [
    {"num": 1, "title": "SUPPORT", "why": "Support-задачи конкурируют с фичами, но не видны в OKR.", "ask": "Выделить поддержку отдельной строкой в планировании."},
    {"num": 2, "title": "НОВЫЕ ЗАДАЧИ", "why": "Уже выполняются и занимают ресурс команды.", "ask": "Зафиксировать в OKR AI Harness и FAQ на LLM."}
  ]
```

- [ ] **Step 2: Append `addLeadershipAsksSlide` and `buildEquatorDeck` to `build_equator_pptx.js`**

Insert before `module.exports`:

```js
function addLeadershipAsksSlide(pres, asks) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.dark };
  slide.addText("Что нужно от руководителей", {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.9,
    fontFace: BRAND.fontHead, fontSize: 30, bold: true, color: BRAND.white, margin: 0,
  });
  const cols = Math.min(asks.length, 3) || 1;
  const cardW = (LAYOUT_W - MARGIN * 2 - 0.6 * (cols - 1)) / cols;
  asks.forEach((ask, i) => {
    const x = MARGIN + i * (cardW + 0.6);
    slide.addText(String(ask.num), {
      x, y: 2.0, w: 1.2, h: 1.0,
      fontFace: BRAND.fontMono, fontSize: 40, bold: true, color: BRAND.accent, margin: 0,
    });
    slide.addText(ask.title, {
      x, y: 3.1, w: cardW, h: 0.6,
      fontFace: BRAND.fontHead, fontSize: 18, bold: true, color: BRAND.white, margin: 0,
    });
    slide.addText(ask.why, {
      x, y: 3.8, w: cardW, h: 1.3,
      fontFace: BRAND.fontHead, fontSize: 13, color: BRAND.grayMid, margin: 0,
    });
    slide.addText(ask.ask, {
      x, y: 5.3, w: cardW, h: 1.3,
      fontFace: BRAND.fontHead, fontSize: 14, bold: true, color: BRAND.white, margin: 0,
    });
  });
  return slide;
}

function buildEquatorDeck(data) {
  const pres = newDeck();
  addTitleSlide(pres, data.meta);
  addSummaryFunnelSlide(pres, data.summaryFunnel);
  addRisksSlide(pres, data.risks);
  addRoadmapGridSlide(pres, data.roadmapGrid);
  addSprintsSlide(pres, data.sprints);
  addDividerSlide(pres, "ЧАСТЬ 2", "Полный отчёт");
  addStatusTableSlide(pres, data.summaryFunnel);
  data.objectives.forEach((obj) => {
    addStageFunnelSlide(pres, obj);
    addPart2PlanSlide(pres, obj);
    addPart1DetailTableSlide(pres, obj);
    if (obj.newTasks && obj.newTasks.length) addNewTasksSlide(pres, obj);
    if (obj.risks && obj.risks.length) addObjRisksSlide(pres, obj);
  });
  addLeadershipAsksSlide(pres, data.leadershipAsks);
  return pres;
}
```

Replace the final `module.exports` block with:

```js
module.exports = {
  BRAND, LAYOUT_NAME, LAYOUT_W, LAYOUT_H, MARGIN,
  newDeck, addTitleSlide, addDividerSlide, addSummaryFunnelSlide, addStatusTableSlide,
  addRisksSlide, addRoadmapGridSlide, addSprintsSlide,
  addStageFunnelSlide, addPart2PlanSlide, addPart1DetailTableSlide, addNewTasksSlide, addObjRisksSlide,
  addLeadershipAsksSlide, buildEquatorDeck,
  statusBreakdown, statusChipColor,
};

if (require.main === module) {
  const [, , dataPath, outPath] = process.argv;
  if (!dataPath || !outPath) {
    console.error("Usage: node build_equator_pptx.js <data.json> <out.pptx>");
    process.exit(1);
  }
  const data = JSON.parse(require("fs").readFileSync(dataPath, "utf8"));
  const pres = buildEquatorDeck(data);
  pres.writeFile({ fileName: outPath }).then(() => console.log(`Written ${outPath}`));
}
```

- [ ] **Step 3: Add `package.json` for the scripts directory**

```json
{
  "name": "poh-okr-agent-equator-scripts",
  "private": true,
  "dependencies": {
    "pptxgenjs": "^3.12.0"
  }
}
```

- [ ] **Step 4: Run the full-deck smoke test via the CLI entry point**

```bash
cd skills/okr-equator/scripts
[ -d node_modules ] || npm install
node build_equator_pptx.js fixtures/sample-equator-data.json /tmp/okr-equator-full-smoke.pptx
```
Expected: `Written /tmp/okr-equator-full-smoke.pptx`. Slide count for this
fixture: 1 (title) + 1 (summary) + 1 (risks) + 1 (roadmap grid) + 1 (sprints)
+ 1 (divider) + 1 (status table) + OBJ1 (3: funnel/plan/table, no
newTasks/risks-table since risks has 1 entry so it DOES render — 4 slides:
funnel/plan/table/risks) + OBJ2 (funnel/plan/table/newTasks — risks empty so
skipped — 4 slides) + 1 (leadership asks) = 16 slides.

- [ ] **Step 5: Validate the generated file structurally**

Using the `pptx` skill's validator (already available in this environment
per the skill's own docs):
```bash
python3 "$(find "$HOME/Library/Application Support/Claude" -iname validate.py -path '*pptx/scripts/office*' 2>/dev/null | head -1)" /tmp/okr-equator-full-smoke.pptx
```
Expected: no fatal errors reported (chart-related warnings don't apply — this
deck has no `addChart` calls). If the validator path isn't found in a given
environment, open the file with `python-pptx` as a fallback check:
```bash
python3 -c "from pptx import Presentation; p = Presentation('/tmp/okr-equator-full-smoke.pptx'); print(len(p.slides.__iter__.__self__._sldIdLst))"
```

- [ ] **Step 6: Commit**

```bash
git add skills/okr-equator/scripts/build_equator_pptx.js skills/okr-equator/scripts/fixtures/sample-equator-data.json skills/okr-equator/scripts/package.json
git commit -m "Add pptx builder: leadership-asks slide, full-deck orchestrator, CLI entry point"
```

---

## Task 16: okr-equator SKILL.md + command

**Files:**
- Create: `skills/okr-equator/SKILL.md`
- Create: `commands/okr-equator.md`

**Interfaces:**
- Consumes: `OKR-<quarter>.md`, `roadmap.md`, `KR-EPIC-MAP.md` (Tasks 5-8),
  `equator-report-template.md` (Task 9), `okr-lint.py` (Task 10),
  `build_equator_pptx.js` `buildEquatorDeck`/CLI (Task 15).
- Produces: `.okr/<quarter>/equator/экватор-<quarter>.md` and `.pptx`.

- [ ] **Step 1: Write `skills/okr-equator/SKILL.md`**

```markdown
---
name: okr-equator
description: Equator Reporter — генерирует отчёт-экватор квартала (экватор-<quarter>.md + экватор-<quarter>.pptx) из .okr/<quarter>/ артефактов. Структура обоих документов зафиксирована шаблоном/кодом, LLM только заполняет данные. Используй когда — /okr-equator, отчёт о статусе на середине квартала, экватор.
---

# Навык: Equator Reporter

## Роль

Ты — автор статус-отчёта на середине квартала. Собираешь факты из
`.okr/<quarter>/` артефактов и (опционально) трекера, заполняешь ими **готовую
структуру** — не изобретаешь структуру заново на каждый запуск.

## Принцип нулевого допуска

Каждый факт (статус KR, риск, коммитмент) → источник: `OKR-<quarter>.md`,
`roadmap.md`, `KR-EPIC-MAP.md`, JIRA (если подключён), или прямой ответ PO в
диалоге. Неизвестное → `[УТОЧНИТЬ у PO]`, никогда не придумывается.

## Процесс

1. Прочитай `.okr/<quarter>/OKR-<quarter>.md`, `roadmap.md`, `KR-EPIC-MAP.md`.
2. Если `okr-config.md → tracker_projects` задан и JIRA MCP доступен — подтяни
   статус связанных эпиков/задач одним запросом на проект (не на каждый KR
   отдельно, чтобы не захлёбываться в вызовах).
3. Для каждого KR определи статус (`Выполнено`/`В работе`/`На паузе`/
   `В ожидании`/`Отменено`). Источник неочевиден → спроси PO напрямую в
   диалоге перед записью, не гадай.
4. Заполни `resources/equator-report-template.md` реальными данными → сохрани
   как `.okr/<quarter>/equator/экватор-<quarter>.md`.
5. Прогони `python3 scripts/okr-lint.py .okr/<quarter>/equator/экватор-<quarter>.md`.
   Ненулевой exit → почини структуру (не содержание) и повтори. Не сохраняй
   документ с ошибками линтера.
6. Собери JSON-payload под схему `buildEquatorDeck` (см.
   `scripts/build_equator_pptx.js`, секция `fixtures/sample-equator-data.json`
   как пример формы данных) из того же материала, что и `.md`-отчёт — оба
   документа описывают одни и те же факты в двух форматах.
7. Сгенерируй `.pptx`:
   `node scripts/build_equator_pptx.js <payload.json> .okr/<quarter>/equator/экватор-<quarter>.pptx`.
8. STOP: покажи сводку (сколько KR по каждому статусу, сколько
   `[УТОЧНИТЬ]`) и оба пути файлов.

## Ресурсы и скрипты

- `resources/equator-report-template.md` — фиксированная структура `.md`.
- `resources/brandbook.md` — палитра/шрифты/canvas для `.pptx`.
- `scripts/okr-lint.py` — структурный линтер `.md` (обязателен перед
  сохранением).
- `scripts/build_equator_pptx.js` — генератор `.pptx`, 16-27 слайдов в
  зависимости от числа Objectives и заполненности «новые задачи»/«риски» по
  каждому.

## Главное правило

Структура — код и шаблон, не решение LLM на лету. LLM отвечает за данные и за
честность разметки факт/`[УТОЧНИТЬ]`, не за раскладку.
```

- [ ] **Step 2: Write `commands/okr-equator.md`**

```markdown
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
```

- [ ] **Step 3: Verify frontmatter and cross-references resolve**

Run:
```bash
head -1 skills/okr-equator/SKILL.md
grep -c "okr-lint.py" skills/okr-equator/SKILL.md commands/okr-equator.md
grep -c "build_equator_pptx.js" skills/okr-equator/SKILL.md commands/okr-equator.md
```
Expected: first prints `---`; both grep commands report ≥ 1 match in each
file.

- [ ] **Step 4: Commit**

```bash
git add skills/okr-equator/SKILL.md commands/okr-equator.md
git commit -m "Add okr-equator skill and command wiring template, lint, and pptx generator"
```

---

## Task 17: okr-plan-deck skill, generator, command

**Files:**
- Create: `skills/okr-plan-deck/SKILL.md`
- Create: `skills/okr-plan-deck/scripts/build_plan_deck.js`
- Create: `commands/okr-plan-deck.md`

**Interfaces:**
- Consumes: `BRAND`, `newDeck`, `addDividerSlide` from
  `../okr-equator/scripts/build_equator_pptx.js` (Task 15, relative
  `require`) — reuses the brandbook constants instead of duplicating them.
- Produces: `.okr/<quarter>/plan-deck.pptx`.

- [ ] **Step 1: Write `skills/okr-plan-deck/scripts/build_plan_deck.js`**

```js
const path = require("path");
const { BRAND, newDeck, addDividerSlide, LAYOUT_W, LAYOUT_H, MARGIN } = require(
  path.join(__dirname, "..", "..", "okr-equator", "scripts", "build_equator_pptx.js")
);

function addGoalsSlide(pres, objectives) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText("Цели квартала", {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.9,
    fontFace: BRAND.fontHead, fontSize: 30, bold: true, color: BRAND.dark, margin: 0,
  });
  let y = 2.0;
  objectives.forEach((obj) => {
    slide.addText(`${obj.code} — ${obj.name}`, {
      x: MARGIN, y, w: LAYOUT_W - MARGIN * 2, h: 0.6,
      fontFace: BRAND.fontHead, fontSize: 18, bold: true, color: BRAND.dark, margin: 0,
    });
    y += 0.9;
  });
  return slide;
}

function addSprintPlanSlide(pres, sprintPlan) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText("План по спринтам", {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.9,
    fontFace: BRAND.fontHead, fontSize: 30, bold: true, color: BRAND.dark, margin: 0,
  });
  const header = ["Спринт", "Фокус"];
  const tableRows = [
    header.map((h) => ({ text: h, options: { bold: true, fill: { color: BRAND.dark }, color: BRAND.white, fontFace: BRAND.fontHead, fontSize: 13 } })),
    ...sprintPlan.map((s) => [
      { text: s.label, options: { fontFace: BRAND.fontMono, fontSize: 13, color: BRAND.grayDark } },
      { text: s.focus, options: { fontFace: BRAND.fontHead, fontSize: 13, color: BRAND.grayDark } },
    ]),
  ];
  slide.addTable(tableRows, {
    x: MARGIN, y: 2.0, w: LAYOUT_W - MARGIN * 2, h: 0.7 * tableRows.length,
    border: { type: "solid", color: BRAND.grayMid, pt: 0.5 },
    autoPage: false,
  });
  return slide;
}

function addEntryRisksSlide(pres, risks) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText("Риски входа в квартал", {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.9,
    fontFace: BRAND.fontHead, fontSize: 30, bold: true, color: BRAND.dark, margin: 0,
  });
  if (risks.length) {
    const textItems = risks.map((r, idx) => ({
      text: r, options: { bullet: true, breakLine: idx < risks.length - 1, fontFace: BRAND.fontHead, fontSize: 15, color: BRAND.grayDark, paraSpaceAfter: 10 },
    }));
    slide.addText(textItems, { x: MARGIN, y: 2.0, w: LAYOUT_W - MARGIN * 2, h: LAYOUT_H - 2.0 - MARGIN, margin: 0 });
  }
  return slide;
}

function buildPlanDeck(data) {
  const pres = newDeck();
  addDividerSlide(pres, `Квартальный план · ${data.meta.quarterLabel}`, data.meta.team);
  addGoalsSlide(pres, data.objectives);
  addSprintPlanSlide(pres, data.sprintPlan);
  addEntryRisksSlide(pres, data.entryRisks || []);
  return pres;
}

module.exports = { buildPlanDeck, addGoalsSlide, addSprintPlanSlide, addEntryRisksSlide };

if (require.main === module) {
  const [, , dataPath, outPath] = process.argv;
  if (!dataPath || !outPath) {
    console.error("Usage: node build_plan_deck.js <data.json> <out.pptx>");
    process.exit(1);
  }
  const data = JSON.parse(require("fs").readFileSync(dataPath, "utf8"));
  const pres = buildPlanDeck(data);
  pres.writeFile({ fileName: outPath }).then(() => console.log(`Written ${outPath}`));
}
```

- [ ] **Step 2: Write a smoke-test fixture and run it**

```bash
mkdir -p skills/okr-plan-deck/scripts/fixtures
cat > skills/okr-plan-deck/scripts/fixtures/sample-plan-data.json <<'JSON'
{
  "meta": {"team": "GDS", "quarterLabel": "Q3 2026"},
  "objectives": [{"code": "OBJ 1", "name": "Отделение от БАЗИС"}, {"code": "OBJ 2", "name": "Развитие витрины"}],
  "sprintPlan": [{"label": "Спринт 1", "focus": "Заказы TicketsCloud, dataflow пилот"}],
  "entryRisks": ["Kafka от TC не готова к 24.08"]
}
JSON
cd skills/okr-plan-deck/scripts
node build_plan_deck.js fixtures/sample-plan-data.json /tmp/okr-plan-deck-smoke.pptx
```
Expected: `Written /tmp/okr-plan-deck-smoke.pptx`, no exceptions (confirms the
relative `require` into `okr-equator/scripts/` resolves correctly).

- [ ] **Step 3: Write `skills/okr-plan-deck/SKILL.md`**

```markdown
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
```

- [ ] **Step 4: Write `commands/okr-plan-deck.md`**

```markdown
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
```

- [ ] **Step 5: Commit**

```bash
git add skills/okr-plan-deck commands/okr-plan-deck.md
git commit -m "Add okr-plan-deck skill, generator, and command"
```

---

## Task 18: okr-validate command + install.sh re-verification

**Files:**
- Create: `commands/okr-validate.md`

**Interfaces:**
- Consumes: `skills/okr-equator/scripts/okr-lint.py` (Task 10).

- [ ] **Step 1: Write `commands/okr-validate.md`**

```markdown
---
description: Validator — ручной прогон структурного линтера на любом экватор-<quarter>.md (или другом markdown-артефакте пайплайна). Дублирует автоматическую проверку внутри /okr-equator — для аудита и повторной проверки после ручных правок.
---

## Использование

```
/okr-validate <path>
```

**Параметры:**
- `<path>` — путь к `экватор-<quarter>.md` (или другому артефакту).

## Инструкция для LLM

Запусти:
```bash
python3 skills/okr-equator/scripts/okr-lint.py <path>
```
Покажи вывод PO без интерпретации — линтер сам форматирует ошибки. Не
пытайся чинить контент самостоятельно без запроса PO.

## Отчёт

```
<вывод okr-lint.py дословно>

<если exit 0>
── СТОП ── Документ прошёл структурную проверку.
<если exit 1>
── СТОП ── PO: почините отмеченные структурные ошибки, затем повторите /okr-validate.
```
```

- [ ] **Step 2: Verify frontmatter present**

Run: `head -1 commands/okr-validate.md`
Expected: `---`

- [ ] **Step 3: Re-run the install.sh smoke test now that commands/skills exist**

```bash
rm -rf /tmp/okr-install-smoke && mkdir -p /tmp/okr-install-smoke && cd /tmp/okr-install-smoke
echo "1" | bash /Users/aleksishmanov/projects/poh-org/poh-okr-agent/install.sh
ls .claude/commands
ls .claude/skills
head -5 .claude/skills/okr-equator/SKILL.md
cd /Users/aleksishmanov/projects/poh-org/poh-okr-agent
rm -rf /tmp/okr-install-smoke
```
Expected: `.claude/commands` lists all 9 `okr-*.md` files; `.claude/skills`
lists `okr-index`, `okr-equator`, `okr-plan-deck`; the `SKILL.md` head shows
valid `---` frontmatter (already present in source, so `install.sh`'s
frontmatter-injection branch is skipped — confirms the "don't duplicate
frontmatter" guard works).

- [ ] **Step 4: Commit**

```bash
git add commands/okr-validate.md
git commit -m "Add okr-validate command"
```

---

## Task 19: Update poh-strategy-agents (branch + PR)

**Files:**
- Modify: `/Users/aleksishmanov/projects/poh-org/poh-strategy-agents/VISION.md`
- Modify: `/Users/aleksishmanov/projects/poh-org/poh-strategy-agents/README.md`

**Interfaces:**
- No code interfaces — documentation-only edit reflecting the design's
  "Изменение позиционирования poh-strategy-agents" section.

- [ ] **Step 1: Create a branch**

```bash
cd /Users/aleksishmanov/projects/poh-org/poh-strategy-agents
git status
git checkout -b hand-off-okr-roadmap-to-poh-okr-agent
```
Expected: `git status` shows a clean working tree before branching (if not,
stop and report — don't branch over uncommitted work).

- [ ] **Step 2: Edit `VISION.md`**

In the `## Функции (контур стратегии)` table, remove the row:
```
| 5 | **Роадмап и OKR** | Now-next-later + дерево метрик, привязка к цели |
```

In `## Место в конвейере poh-org`, replace:
```markdown
`poh-strategy-agents` (что и почему) → `poh-bft-writer` (требования к эпикам) →
`poh-sprint-agents` (исполнение спринта). Стратегия задаёт квартальную цель и
образ результата; БФТ переводит их в требования; спринт-агенты доводят до факта.
Контекст передаётся вниз по конвейеру, не переоткрывается на каждом шаге.
```
with:
```markdown
`poh-strategy-agents` (идея → проблема → ставка) → `poh-okr-agent`
(OKR → roadmap → верхнеуровневая декомпозиция → квартальный план → экватор) →
`poh-bft-writer` (требования к эпикам) → `poh-sprint-agents` (исполнение
спринта). Стратегия отдаёт формирование OKR и roadmap в `poh-okr-agent`
(целиком, включая шаг `/strat-roadmap`, выведенный из этого пайплайна);
дальше БФТ переводит их в требования, спринт-агенты доводят до факта.
Контекст передаётся вниз по конвейеру, не переоткрывается на каждом шаге.
```

In `## Дорожная карта срезов`, item 5, replace:
```markdown
5. **Связки конвейера** — сквозная передача контекста в `bft-writer` (стратегия →
   эпики) и `sprint-agents` (стратегия → квартальная цель → спринты).
```
with:
```markdown
5. **Связки конвейера** — сквозная передача контекста в `poh-okr-agent`
   (ставка → OKR/roadmap), дальше в `bft-writer` (эпики) и `sprint-agents`
   (спринты). `/strat-roadmap` выведен из этого пайплайна — OKR/roadmap
   формирует `poh-okr-agent`.
```

- [ ] **Step 3: Edit `README.md`**

Remove the `/strat-roadmap` row from the "Команды (STOP после каждой)" table:
```
| `/strat-roadmap` | Roadmap Architect | `strategy.md` (North Star, now-next-later, OKR) |
```

Update the workflow line:
```markdown
Полный workflow (human-in-the-loop):
`/strat-index → /strat-context → /strat-problem → /strat-options → /strat-debate → /strat-roadmap → /strat-validate → /strat-deliver`
```
to:
```markdown
Полный workflow (human-in-the-loop):
`/strat-index → /strat-context → /strat-problem → /strat-options → /strat-debate → /strat-validate → /strat-deliver`

Формирование OKR и roadmap из принятой ставки — задача
[`poh-okr-agent`](https://github.com/po-helper-org/poh-okr-agent), не этого
репозитория.
```

Update `## Место в конвейере`:
```markdown
`poh-strategy-agents` (что и почему) → `poh-bft-writer` (требования) →
`poh-sprint-agents` (исполнение). Стратегия задаёт квартальную цель и
образ результата; контекст передаётся вниз по конвейеру.
```
to:
```markdown
`poh-strategy-agents` (идея → проблема → ставка) → `poh-okr-agent`
(OKR → roadmap → декомпозиция → квартальный план → экватор) →
`poh-bft-writer` (требования) → `poh-sprint-agents` (исполнение). Контекст
передаётся вниз по конвейеру.
```

- [ ] **Step 4: Verify `/strat-roadmap` is fully removed**

Run: `grep -rn "strat-roadmap" README.md VISION.md`
Expected: no matches (empty output, exit code 1 from `grep`).

- [ ] **Step 5: Commit and open a PR**

```bash
git add VISION.md README.md
git commit -m "Hand off OKR/roadmap formation to poh-okr-agent"
git push -u origin hand-off-okr-roadmap-to-poh-okr-agent
gh pr create --title "Hand off OKR/roadmap contour to poh-okr-agent" --body "$(cat <<'EOF'
## Summary
- poh-okr-agent now owns OKR + roadmap formation end-to-end (was /strat-roadmap here, unpublished slice 1).
- Removes function 5 ("Роадмап и OKR") from this repo's function table and the /strat-roadmap step from the pipeline/README.
- Pipeline now reads: strategy-agents (idea → bet) → okr-agent (OKR/roadmap/decomposition/plan-deck/equator) → bft-writer → sprint-agents.

## Test plan
- [ ] `grep -rn "strat-roadmap" README.md VISION.md` returns nothing
- [ ] Manual read-through: pipeline diagrams in both files agree with each other
EOF
)"
```

---

## Task 20: Update .github manifest (branch + PR)

**Files:**
- Modify: `/Users/aleksishmanov/projects/poh-org/.github/profile/README.md`

**Interfaces:**
- No code interfaces — manifest table edit.

- [ ] **Step 1: Create a branch**

```bash
cd /Users/aleksishmanov/projects/poh-org/.github
git status
git checkout -b add-poh-okr-agent-to-manifest
```
Expected: clean working tree before branching.

- [ ] **Step 2: Edit `profile/README.md`**

In the "Контур PO" table, change the `poh-strategy-agents` row from:
```
| poh-strategy-agents | 1 | Абстрактная идея → доказуемая стратегия: контекст, проблема, ставки, pre-mortem, роадмап и OKR | срез 1, не опубликован |
```
to:
```
| poh-strategy-agents | 1 | Абстрактная идея → доказуемая стратегия: контекст, проблема, ставки, pre-mortem | срез 1, не опубликован |
```

Add a new row directly below it:
```
| [poh-okr-agent](https://github.com/po-helper-org/poh-okr-agent) | 1 · 4 | Ставка → OKR, roadmap, верхнеуровневая декомпозиция, квартальный план-дек, экватор (статус+риски на середине квартала, `.md`+`.pptx`) | живой |
```

- [ ] **Step 3: Verify the table still parses as markdown**

Run: `grep -c '^|' profile/README.md`
Expected: a number at least 1 greater than before the edit (confirms one row
was added, not just modified in place — sanity check by re-running
`git diff --stat` and confirming exactly one line insertion beyond the
modified line).

- [ ] **Step 4: Commit and open a PR**

```bash
git add profile/README.md
git commit -m "Add poh-okr-agent to the PO contour manifest"
git push -u origin add-poh-okr-agent-to-manifest
gh pr create --title "Add poh-okr-agent to org manifest" --body "$(cat <<'EOF'
## Summary
- New repo poh-okr-agent (functions 1 · 4) takes over OKR/roadmap formation from poh-strategy-agents.
- Narrows poh-strategy-agents' manifest description to drop "роадмап и OKR" accordingly.

## Test plan
- [ ] Table renders correctly on GitHub (row count +1, existing rows unchanged otherwise)
- [ ] Link to poh-okr-agent resolves once that repo is public
EOF
)"
```

---

## Task 21: Create and publish poh-okr-agent on GitHub

**Files:** none (repository operations only).

**Interfaces:** none.

- [ ] **Step 1: Final local check before publishing**

```bash
cd /Users/aleksishmanov/projects/poh-org/poh-okr-agent
git status
git log --oneline
find . -not -path './.git*' -not -path './docs/superpowers*' -type f | sort
```
Expected: working tree clean, one commit per prior task, and the file listing
matches the structure documented in the design spec's "Установка и
репозиторий" section (`README.md`, `install.sh`, `okr-config.template.md`,
`.gitignore`, `commands/` with 9 files, `skills/{okr-index,okr-equator,okr-plan-deck}/`).

- [ ] **Step 2: Create the GitHub repository and push**

```bash
gh repo create po-helper-org/poh-okr-agent --public --source=. --remote=origin --push
```
Expected: command reports the new repo URL and pushes `main` with the full
commit history from Tasks 1-18.

- [ ] **Step 3: Verify the pushed repo**

```bash
gh repo view po-helper-org/poh-okr-agent --web=false
curl -fsSL https://raw.githubusercontent.com/po-helper-org/poh-okr-agent/main/install.sh | head -5
```
Expected: `gh repo view` shows the repo description/visibility; the `curl`
prints the shebang line of `install.sh` (confirms `main` is publicly
reachable — this URL is what `README.md`'s "Установка" section instructs
users to `curl`).

- [ ] **Step 4: Report completion**

No commit — this task publishes what Tasks 1-18 already committed locally.
Summarize for the user: repo URL, PR URLs from Tasks 19-20, and the
`/okr-index` next-step instruction from `README.md`.
