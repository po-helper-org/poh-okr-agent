"""Собирает okr-quarter-planning/index.html по шаблону sprint-under-manager.

Из референса берутся стили, фото автора и оверлеи (лайтбокс, полноэкранное демо);
свои — слайды (slides.html), доп. стили, скрипт, скриншоты и демо-страницы.

Чтобы страница открывалась быстро, тяжёлое лежит рядом отдельными файлами:
  img/<имя>.webp       скриншоты под размер слайда (~30–50 КБ), грузятся лениво;
  img/full/<имя>.webp  полный размер — только для увеличения по клику;
  img/photo.webp       фото автора.
Картинки готовит towebp.mjs в out/img и out/full.
  demo/*.html      живые страницы ФАКТ, ПЛАН, TEAMPLANNER и презентация квартала — грузятся, когда открыт
                   их слайд или соседний, с индикатором загрузки.
"""
import base64
import html
import json
import os
import re
import shutil
import sys

REF, OUT = sys.argv[1], sys.argv[2]
ID = "okr-quarter-planning"
BASE = f"/{ID}/"  # пути от корня сайта: страница открывается и как /{ID}, и как /{ID}/
OUT_DIR = os.path.dirname(os.path.abspath(OUT))
TITLE = "Планирование квартала за час разговора с ИИ"
DESC = "Квартал — огромный и ресурсоёмкий сбор и аналитика данных. Как пройти весь путь — итоги прошлого квартала, планы на следующий, декомпозиция с техлидами — за час голосового разговора с ИИ-помощником."

ref = open(REF, encoding="utf-8").read()
style = ref[ref.index("<style>"):ref.index("</style>")]
photo = re.search(r'var PHOTO = "(data:[^"]+)"', ref).group(1)
shutil.rmtree(os.path.join(OUT_DIR, "img"), ignore_errors=True)
os.makedirs(os.path.join(OUT_DIR, "img", "full"), exist_ok=True)
os.makedirs(os.path.join(OUT_DIR, "demo"), exist_ok=True)
shutil.copyfile(os.path.join("out", "img", "photo.webp"), os.path.join(OUT_DIR, "img", "photo.webp"))
photo = BASE + "img/photo.webp"

EXTRA_CSS = """
  /* okr-quarter-planning */
  .duo { display: grid; grid-template-columns: 390px minmax(0, 1fr); gap: 34px; flex: 1; min-height: 0; }
  .col { display: flex; flex-direction: column; gap: 14px; min-height: 0; }
  .lead { font-size: 17px; line-height: 1.45; color: var(--muted); }
  .lead b { color: var(--ink); }
  .unc { font-family: "JetBrains Mono", monospace; font-size: .82em; background: #fff3c4; border: 1px solid #d8c070; padding: 0 4px; color: var(--ink); white-space: nowrap; }
  .plus { color: #1c8a3a; }
  .shot { align-self: start; border: 1px solid var(--ink); box-shadow: 6px 6px 0 var(--ink); background: #fff; overflow: hidden; cursor: zoom-in; min-height: 0; }
  .shot img { width: 100%; height: auto; display: block; }
  ul.list { list-style: none; display: flex; flex-direction: column; gap: 13px; }
  ul.list li { display: grid; grid-template-columns: 20px 1fr; gap: 10px; align-items: baseline; font-size: 17px; line-height: 1.38; color: var(--muted); }
  ul.list li::before { content: "→"; color: var(--blue); font-weight: 700; }
  ul.list b { color: var(--ink); }
  ul.list.sm li { font-size: 15px; }
  .chat { display: flex; flex-direction: column; gap: 12px; justify-content: center; }
  .msg { font-size: 15px; line-height: 1.42; padding: 11px 14px; border: 1px solid var(--ink); background: #fff; max-width: 94%; align-self: flex-start; }
  .msg.po { align-self: flex-end; background: var(--ink); color: var(--bg); }
  .msg.wide { max-width: 100%; align-self: stretch; }
  .msg .who { display: block; font-size: 11px; font-weight: 700; letter-spacing: .08em; margin-bottom: 4px; opacity: .65; }
  .flow { display: grid; grid-template-columns: 1fr 34px 1fr 34px 1fr; align-items: stretch; }
  .flow .arr { display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 800; color: var(--blue); }
  .flow.tall { flex: 1; min-height: 0; grid-template-columns: 1.05fr 34px 1fr 34px 1fr; }
  ol.steps.compact { margin-top: 30px; gap: 10px; }
  ol.steps.compact b { font-size: 19px; }
  ol.steps.compact span { font-size: 15px; }
  .code { font-family: "JetBrains Mono", ui-monospace, Menlo, monospace; font-size: 12.5px; line-height: 1.5; background: var(--ink); color: #e9e8e2; padding: 14px 16px; white-space: pre; overflow: hidden; margin: 0; }
  .code .k { color: #9fb0ff; }
  .duo .demo { box-shadow: 6px 6px 0 var(--ink); overflow: hidden; }
  .duo .demo iframe { width: 142.86%; height: 142.86%; transform: scale(.7); transform-origin: 0 0; }
  .fs-btn { top: auto; bottom: 14px; }
  .pair { flex: 1; min-height: 0; }
  .pair .shot { max-height: 360px; }
  .pair .lead { font-size: 15px; }
  .tp-wrap { border: 1px solid var(--ink); box-shadow: 6px 6px 0 var(--ink); background: #fff; overflow: hidden; }
  table.tp { border-collapse: collapse; width: 100%; font-size: 12.5px; line-height: 1.35; }
  table.tp th { text-align: left; font-family: "JetBrains Mono", monospace; font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase; background: #f2f1ec; padding: 8px 9px; border-bottom: 2px solid var(--ink); }
  table.tp td { padding: 7px 9px; border-bottom: 1px solid #deddd6; vertical-align: top; }
  table.tp td.fill { background: #f4f6ff; border-left: 1px dashed var(--blue); color: var(--blue); font-style: italic; }
  table.tp td.role { font-family: "JetBrains Mono", monospace; font-weight: 700; }
  #lb .row { display: none; }
  /* Переработка: боль → решение. «Решает боль N» связывает этап с проблемой. */
  .solves { display: inline-block; align-self: flex-start; font-family: "JetBrains Mono", monospace; font-size: 12px; font-weight: 700;
    letter-spacing: .04em; color: var(--blue); border: 1px solid var(--blue); padding: 3px 8px; margin-top: 10px; }
  .card .solves { margin-top: 14px; }
  .col > .solves, .chat > .solves { margin: 0 0 4px; }
  .foot.big { font-size: 20px; font-weight: 700; color: var(--ink); margin-top: 34px; }
  .vision { margin-top: 34px; border-left: 4px solid var(--blue); padding: 6px 0 6px 20px; display: flex; flex-direction: column; gap: 10px; }
  .vision p { font-size: 19px; line-height: 1.45; color: var(--muted); max-width: 980px; }
  .vision b { color: var(--ink); }
  .repo-sm { font-family: "JetBrains Mono", monospace; font-size: 14px; color: var(--blue); text-decoration: none; font-weight: 700; }
  table.ba { width: 100%; border-collapse: collapse; background: var(--paper); border: 1px solid var(--ink); box-shadow: 6px 6px 0 var(--ink); }
  table.ba th { text-align: left; font-family: "JetBrains Mono", monospace; font-size: 12px; letter-spacing: .06em; text-transform: uppercase;
    padding: 10px 16px; border-bottom: 2px solid var(--ink); background: #f2f1ec; }
  table.ba th:last-child { color: var(--blue); }
  table.ba td { padding: 11px 16px; font-size: 16px; line-height: 1.35; border-bottom: 1px solid #deddd6; vertical-align: top; color: var(--muted); }
  table.ba td:first-child { font-weight: 800; color: var(--ink); white-space: nowrap; width: 150px; }
  table.ba td:last-child { color: var(--ink); }
  .install ol.steps.start { margin: 26px 0 30px; gap: 10px; }
  .install ol.steps.start b { font-family: "JetBrains Mono", monospace; font-size: 20px; }
  .install ol.steps.start span { font-size: 18px; }
  /* Демо грузится по требованию: пока страница не пришла — индикатор, а не пустая рамка. */
  .demo-loader { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 14px; background: #fff; font-family: "JetBrains Mono", monospace;
    font-size: 13px; color: var(--muted); transition: opacity .25s; }
  .demo-loader.done { opacity: 0; pointer-events: none; }
  .spin { width: 28px; height: 28px; border: 3px solid #d9d8d0; border-top-color: var(--blue, #2b3cff); border-radius: 50%;
    animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  #dfs .dfs-body { position: relative; flex: 1; display: flex; }
  #dfs .dfs-body iframe { flex: 1; }
"""

SCRIPT = """<script>
  var PHOTO = "%s";
  var slides = [].slice.call(document.querySelectorAll('.slide'));
  /* Живые демо: iframe получает src, когда открыт его слайд или предыдущий. */
  /* load приходит и от пустой рамки about:blank — считаем загруженной только страницу демо. */
  function loaded(f) { try { return f.contentWindow.location.href !== 'about:blank'; } catch (e) { return true; } }
  function loadDemos(slide) {
    if (!slide) return;
    slide.querySelectorAll('iframe[data-src]:not([src])').forEach(function (f) {
      var l = f.parentNode.querySelector('.demo-loader');
      f.onload = function () { if (l && loaded(f)) l.classList.add('done'); };
      f.src = f.getAttribute('data-src');
    });
  }
  /* Скриншоты ленивые: сразу грузятся текущий слайд и два следующих, остальные —
     тихо в фоне после загрузки страницы, чтобы листание шло без пауз. */
  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      document.querySelectorAll('img[loading="lazy"]').forEach(function (im) { im.loading = 'eager'; });
    }, 300);
  });
  var cur = 0;
  function fit() {
    var s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    document.getElementById('stage').style.transform = 'scale(' + s + ')';
  }
  window.addEventListener('resize', fit); fit();
  function show(i, push) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function (s, k) { s.classList.toggle('on', k === cur); });
    loadDemos(slides[cur]); loadDemos(slides[cur + 1]);
    [cur, cur + 1, cur + 2].forEach(function (k) {
      if (slides[k]) slides[k].querySelectorAll('img[loading="lazy"]').forEach(function (im) { im.loading = 'eager'; });
    });
    document.getElementById('pos').textContent = (cur + 1) + ' / ' + slides.length;
    document.getElementById('bar').style.width = ((cur + 1) / slides.length * 100) + '%%';
    if (push !== false) history.replaceState(null, '', '#slide=' + (cur + 1));
  }
  document.getElementById('prev').onclick = function () { show(cur - 1); };
  document.getElementById('next').onclick = function () { show(cur + 1); };
  document.getElementById('coverPhoto').src = PHOTO;

  var lb = document.getElementById('lb');
  document.querySelectorAll('.shot').forEach(function (s) {
    s.onclick = function () {
      var im = s.querySelector('img');
      document.getElementById('lbImg').src = im.getAttribute('data-full') || im.src;
      document.getElementById('lbTitle').textContent = im.alt;
      document.getElementById('lbPos').textContent = '';
      lb.classList.add('on');
    };
  });
  function closeLb() { lb.classList.remove('on'); }
  document.getElementById('lbX').onclick = closeLb;
  lb.addEventListener('click', function (e) { if (e.target === lb || e.target.className === 'body') closeLb(); });

  var dfs = document.getElementById('dfs');
  document.querySelectorAll('.fs-btn').forEach(function (b) {
    b.onclick = function () {
      var f = document.getElementById(b.getAttribute('data-frame'));
      document.getElementById('dfsTitle').textContent = f.title;
      var dl = document.getElementById('dfsLoader');
      dl.classList.remove('done');
      var df = document.getElementById('dfsFrame');
      df.onload = function () { if (loaded(df)) dl.classList.add('done'); };
      df.src = f.getAttribute('data-src');
      dfs.classList.add('on');
    };
  });
  function closeDfs() { dfs.classList.remove('on'); document.getElementById('dfsFrame').removeAttribute('src'); }
  document.getElementById('dfsX').onclick = closeDfs;

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (dfs.classList.contains('on')) return closeDfs();
      if (lb.classList.contains('on')) return closeLb();
    }
    if (lb.classList.contains('on') || dfs.classList.contains('on')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); show(cur + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(cur - 1); }
    if (e.key === 'Home') { e.preventDefault(); show(0); }
    if (e.key === 'End') { e.preventDefault(); show(slides.length - 1); }
  });
  function fromHash() { var m = location.hash.match(/slide=(\\d+)/); return m ? parseInt(m[1], 10) - 1 : 0; }
  window.addEventListener('hashchange', function () { show(fromHash(), false); });
  show(fromHash(), false);
</script>""" % photo


def img(name):
    shutil.copyfile(os.path.join("out", "img", name + ".webp"), os.path.join(OUT_DIR, "img", name + ".webp"))
    shutil.copyfile(os.path.join("out", "full", name + ".webp"), os.path.join(OUT_DIR, "img", "full", name + ".webp"))
    size = json.load(open(os.path.join("out", "img", name + ".json")))
    return (f'{BASE}img/{name}.webp" data-full="{BASE}img/full/{name}.webp" width="{size["w"]}" height="{size["h"]}" '
            'loading="lazy" decoding="async')


slides = open("slides.html", encoding="utf-8").read()
slides = re.sub(r"__IMG:([\w-]+)__", lambda m: img(m.group(1)), slides)
# В демо TeamPlanner сразу раскрыт первый KR — иначе в рамке слайда одни заголовки.
OPEN_FIRST = "<script>var k=document.querySelector('details.kr');if(k)k.setAttribute('open','')</script></body>"
LOADER = '<div class="demo-loader"><span class="spin"></span>Загружаем живое демо…</div>'
for name, src in (("fact", "fact.html"), ("plan", "plan.html"), ("tp", "teamplanner.html"), ("present", "present.html")):
    if f"__DEMO:{name}__" not in slides:
        continue
    page_html = open(src, encoding="utf-8").read()
    if name == "tp":
        page_html = page_html.replace("</body>", OPEN_FIRST)
    with open(os.path.join(OUT_DIR, "demo", src), "w", encoding="utf-8") as f:
        f.write(page_html)
    slides = slides.replace(f'srcdoc="__DEMO:{name}__"', f'data-src="{BASE}demo/{src}"')
slides = re.sub(r'(<div class="demo">)', r"\1" + LOADER, slides)
assert "__" not in slides, "плейсхолдер не заменён"

head = f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{TITLE}</title>

<!-- Превью ссылки. Краулеры не выполняют JS, поэтому блок статический.
     Живёт в шаблоне, а не дописывается руками: иначе теряется при пересборке. -->
<meta name="description" content="{DESC}">
<link rel="canonical" href="https://slides.aleksishmanov.ru/{ID}/">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Каталог презентаций · Алексей Ишманов">
<meta property="og:locale" content="ru_RU">
<meta property="og:url" content="https://slides.aleksishmanov.ru/{ID}/">
<meta property="og:title" content="{TITLE}">
<meta property="og:description" content="{DESC}">
<meta property="og:image" content="https://slides.aleksishmanov.ru/{ID}/cover.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="720">
<meta property="og:image:alt" content="Первый слайд презентации «{TITLE}»">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{TITLE}">
<meta name="twitter:description" content="{DESC}">
<meta name="twitter:image" content="https://slides.aleksishmanov.ru/{ID}/cover.png">
<meta name="twitter:image:alt" content="Первый слайд презентации «{TITLE}»">
"""
overlays = ref[ref.index('<div id="lb">'):ref.index("<script>")]
overlays = re.sub(r"<b>Демо отчёта по спринту</b>", '<b id="dfsTitle"></b>', overlays)
overlays = overlays.replace("Демо отчёта, полный экран", "Демо, полный экран")
overlays = re.sub(r'(<iframe id="dfsFrame"[^>]*></iframe>)',
                  r'<div class="dfs-body"><div class="demo-loader" id="dfsLoader"><span class="spin"></span>'
                  r'Загружаем живое демо…</div>\1</div>', overlays)
assert 'id="dfsLoader"' in overlays

page = (head + style + EXTRA_CSS + "</style>\n</head>\n<body>\n<div id=\"bar\"></div>\n<div id=\"stage\">\n\n"
        + slides + "\n</div>\n\n" + overlays + SCRIPT + "\n</body>\n</html>\n")
open(OUT, "w", encoding="utf-8").write(page)
count = page.count('<section class="slide')
print(f"Written {OUT}: {len(page)} bytes, {count} slides")
