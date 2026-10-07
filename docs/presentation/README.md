# Презентация «Планирование квартала за час разговора с ИИ»

Исходники презентации о poh-okr-agent, опубликованной в каталоге
[slides.aleksishmanov.ru/okr-quarter-planning](https://slides.aleksishmanov.ru/okr-quarter-planning/)
(репозиторий `slides-catalog`, папка `okr-quarter-planning/`). Данные — демо
(команда «Витрина»), реальных данных команд здесь нет.

| Файл | Что это |
|---|---|
| `slides.html` | текст и разметка слайдов; `__IMG:<имя>__` и `__DEMO:<fact\|plan\|tp\|present>__` — места для скриншотов и живых демо |
| `build.py` | сборка `index.html` по шаблону `sprint-under-manager/index.html` из `slides-catalog`: стили, фото, оверлеи; картинки и демо — отдельными файлами рядом |
| `retro-2026Q3.json`, `scope-2026Q4.json`, `teamplanner-2026Q4.json`, `present-2026Q4.json` | данные живых демо (фикстуры `okr-plan.py` с оценками в днях и KR 2.1 с одной подзадачей БФТ) |
| `make_drafts.py` | первые итерации ФАКТ и ПЛАН для слайдов «первая итерация» |
| `shots2.mjs` | скриншоты первых итераций `r1-draft.jpg`, `p1-draft.jpg` |
| `towebp.mjs` | скриншоты → WebP: под размер слайда (`out/img`) и полный (`out/full`) |
| `chk.mjs`, `cover.mjs` | проверка всех слайдов и обложка `cover.png` — через локальный сервер на `127.0.0.1:8765` |

## Сборка

Нужны Python 3, Node.js и `playwright-core` с Chromium (`CH` — путь к браузеру).

```bash
P=../../skills/okr-scope/scripts/okr-plan.py
C=<путь к slides-catalog>

python3 make_drafts.py
for p in "retro-2026Q3 fact" "retro-draft fact-draft" "scope-2026Q4 plan" "scope-draft plan-draft" \
         "teamplanner-2026Q4 teamplanner" "present-2026Q4 present"; do set -- $p; python3 $P render $1.json $2.html; done

node shots2.mjs "$PWD" "$CH"
node towebp.mjs "$PWD" "$CH" img 1100 0.72 r1-draft.jpg p1-draft.jpg
node towebp.mjs "$PWD" "$CH" full 1920 0.8 r1-draft.jpg p1-draft.jpg
cp "$C/okr-quarter-planning/img/photo.webp" out/img/   # фото автора (уже сжатое)

python3 build.py "$C/sprint-under-manager/index.html" "$C/okr-quarter-planning/index.html"
(cd "$C" && python3 -m http.server 8765 &) ; node chk.mjs "$PWD" "$CH"; node cover.mjs "$C/okr-quarter-planning/cover.png" "$CH"
```

После сборки — запись в `slides-catalog/catalog.js` (число слайдов, дата) и
коммит в `main` каталога.
