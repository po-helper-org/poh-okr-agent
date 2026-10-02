/* Презентация квартала команде — .pptx в стиле отчёта-экватора (/okr-equator):
   тот же брендбук (resources/brandbook.md экватора) и холст 20×11.25in.
   Рассказ от общего к частному:

     Вводная:  титул → HERO → результаты прошлого квартала → актуальные риски →
               верхнеуровневый roadmap → инициативы по спринтам (по неделям)
     Ретро:    HERO → статус по целям прошлого квартала → по каждой цели: HERO с
               общим статусом → что сделали, что осталось, что переносим
     Планы:    HERO → обзор предстоящих работ → по каждой цели: HERO с цифрами →
               инициативы, известные риски, GANTT по сотрудникам
     Финал:    HERO → как работаем, что нужно от команды
   HERO — визуальная пауза: текст по центру и «Дальше» — о чём пойдёт речь.

   Данные (data.json) считает okr-plan.py present — здесь только вёрстка.
   Запуск: node build_present_pptx.js <data.json> <out.pptx>
   pptxgenjs ставит install.sh в skills/okr-equator/scripts (общий с экватором). */
const path = require("path");
const eq = require(path.join(__dirname, "..", "..", "okr-equator", "scripts", "build_equator_pptx.js"));

const { BRAND, LAYOUT_W, LAYOUT_H, newDeck } = eq;
const C = Object.assign({}, BRAND, {
  paper: "FFFFFF",        // фон таблиц и шкал
  light: "F3F1EE",        // фон карточных слайдов
  card: "F7F5F2",         // карточка на светлом
  idle: "E4E0DA",         // «не начато», линии таблиц
  dev: "C9DDF5",          // разработка
  qa: "DCE9F8",           // тестирование
  analysis: "F7DCC4",     // аналитика, архитектура, требования
  release: "CDE8D2",      // приёмка и выкатка
  ext: "FFD9E2",          // внешняя команда
  red: "B23A3A",
});
const X = 1.05;                       // левое поле, как в референсе
const W = LAYOUT_W - X * 2;           // ширина контента
const FOOT = LAYOUT_H - 0.7;          // нижняя граница контента

/* Исходы KR прошлого квартала и статусы подзадач. */
const OUTCOME = {
  done: { label: "закрыт", color: C.statusDone },
  partial: { label: "частично", color: C.statusInProgress },
  failed: { label: "не сделан", color: C.idle },
  dropped: { label: "отменён", color: C.statusCancelled },
  unknown: { label: "нет оценки", color: C.paper },
};
const STATUS = {
  TODO: { label: "не начато", color: C.idle },
  "IN PROGRESS": { label: "в работе", color: C.statusInProgress },
  BLOCKED: { label: "заблокировано", color: C.statusCancelled },
  DONE: { label: "готово", color: C.statusDone },
};
/* Типы работ — как «бек / аналитика / qa / приёмка» в таблице спринтов референса. */
const WORK = [
  { key: "analysis", label: "аналитика", short: "аналит.", color: C.analysis, roles: ["PO", "ADR", "SA", "BA"] },
  { key: "dev", label: "разработка", short: "разраб.", color: C.dev, roles: ["BE", "FE", "DOPS"] },
  { key: "qa", label: "тесты", short: "тесты", color: C.qa, roles: ["QA"] },
  { key: "release", label: "выкатка", short: "выкатка", color: C.release, roles: ["RM"] },
  { key: "ext", label: "внешние", short: "внешн.", color: C.ext, roles: [] },
];
function workOf(role) {
  if (/^EXT\[/.test(role)) return WORK[4];
  return WORK.find((w) => w.roles.indexOf(role) >= 0) || WORK[1];
}

function quarterLabel(q) {
  const m = /^(\d{4})Q([1-4])$/.exec(q || "");
  return m ? `Q${m[2]} ${m[1]}` : q || "";
}
function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out.length ? out : [[]];
}
const dash = (v) => (v == null || v === "" ? "—" : String(v));
/* PowerPoint не пересчитывает «shrink» при открытии — длинное режем сами. */
function clip(t, max) {
  t = String(t || "");
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/* ---------- каркас слайдов ---------- */
function slideBase(pres, bg) {
  const s = pres.addSlide();
  s.background = { color: bg };
  return s;
}
function heading(s, title, eyebrow, dark) {
  if (eyebrow) {
    s.addText(eyebrow.toUpperCase(), {
      x: X, y: 0.75, w: W, h: 0.45, fontFace: C.fontMono, fontSize: 15, color: C.grayMid, margin: 0, charSpacing: 2,
    });
  }
  const size = title.length > 60 ? 36 : title.length > 46 ? 42 : 54;
  s.addText(title, {
    x: X, y: eyebrow ? 1.2 : 0.85, w: W, h: 1.2, fontFace: C.fontHead, fontSize: size, bold: true,
    color: dark ? C.white : C.dark, margin: 0, valign: "middle", fit: "shrink",
  });
  return eyebrow ? 2.65 : 2.35;
}
function mono(s, text, x, y, w, h, opts) {
  s.addText(text, Object.assign({ x, y, w, h, fontFace: C.fontMono, fontSize: 13, color: C.grayMid, margin: 0, valign: "middle" }, opts || {}));
}
function pill(s, text, x, y, w, h, fill, opts) {
  s.addShape("roundRect", { x, y, w, h, rectRadius: Math.min(0.12, h / 2), fill: { color: fill }, line: { type: "none" } });
  if (text) {
    s.addText(text, Object.assign({ x, y, w, h, align: "center", valign: "middle", fontFace: C.fontHead, fontSize: 14,
      color: C.dark, margin: 0, fit: "shrink" }, opts || {}));
  }
}
function legend(s, items, y) {
  let x = X;
  items.forEach((it) => {
    s.addShape("roundRect", { x, y: y + 0.1, w: 0.22, h: 0.22, rectRadius: 0.05, fill: { color: it.color }, line: { type: "none" } });
    mono(s, it.label.toUpperCase(), x + 0.32, y, 2.6, 0.42, { fontSize: 13, color: C.grayDark, charSpacing: 1 });
    x += 0.5 + it.label.length * 0.14 + 0.6;
  });
}
function hline(s, x, y, w, color) {
  s.addShape("line", { x, y, w, h: 0, line: { color: color || C.idle, width: 1 } });
}

/* Таблица в стиле референса: шапка — моно капсом, строки разделены линиями. */
function table(s, cols, rows, y, opts) {
  const o = opts || {};
  const head = cols.map((c) => ({ text: c.title.toUpperCase(), options: {
    fontFace: C.fontMono, fontSize: 13, color: C.grayMid, bold: false, charSpacing: 1,
    border: [{ type: "none" }, { type: "none" }, { type: "solid", color: C.grayMid, pt: 1 }, { type: "none" }] } }));
  const body = rows.map((r) => r.map((c, i) => {
    const base = { fontFace: C.fontHead, fontSize: o.fontSize || 16, color: C.dark, valign: "top",
      border: [{ type: "none" }, { type: "none" }, { type: "solid", color: C.idle, pt: 1 }, { type: "none" }] };
    if (c && typeof c === "object" && !Array.isArray(c) && "text" in c) return { text: c.text, options: Object.assign(base, c.options || {}) };
    return { text: Array.isArray(c) ? c : dash(c), options: Object.assign(base, cols[i].options || {}) };
  }));
  s.addTable([head, ...body], {
    x: X, y, w: W, colW: cols.map((c) => c.w), margin: [0.06, 0.1, 0.06, 0.1], autoPage: false,
  });
}
function chipCell(text, color) {
  return [{ text: ` ${text} `, options: { highlight: color } }];
}

/* ---------- вводная ---------- */
function addTitle(pres, d) {
  const m = d.meta;
  const s = slideBase(pres, C.accent);
  s.addText(`Квартал ${quarterLabel(m.quarter)} · ${m.team}`, {
    x: X, y: 2.6, w: W, h: 2.6, fontFace: C.fontHead, fontSize: 88, bold: true, color: C.white, margin: 0,
    valign: "bottom", fit: "shrink",
  });
  s.addText(m.message || "Чем занимаемся в квартале, кто за что отвечает и как двигаемся.", {
    x: X, y: 5.5, w: W * 0.72, h: 1.5, fontFace: C.fontHead, fontSize: 26, color: C.white, margin: 0, valign: "top", fit: "shrink",
  });
  mono(s, [m.period, `PO — ${m.po}`, m.updated ? `обновлено ${m.updated}` : ""].filter(Boolean).join("   ·   "),
    X, 7.6, W, 0.5, { fontSize: 16, color: C.white });
}

function addPastResults(pres, r, note) {
  const s = slideBase(pres, C.paper);
  let y = heading(s, `Результаты ${quarterLabel(r.quarter)}`, "Вводная · откуда мы идём");
  legend(s, ["done", "partial", "failed", "dropped"].map((k) => OUTCOME[k]), y - 0.1);
  y += 0.55;
  const labelW = 6.0, totalW = 1.0, barX = X + labelW + 0.2, barW = W - labelW - 0.2 - totalW - 2.6;
  const rows = r.objectives.map((o) => ({ name: `${o.code} — ${o.name}`, c: o.counts }));
  const rowH = Math.min(0.85, (FOOT - y - 1.6 - (note ? 1.7 : 0)) / (rows.length + 1));
  const drawRow = (row, yy, big) => {
    s.addText(row.name, { x: X, y: yy, w: labelW, h: rowH * 0.8, fontFace: big ? C.fontMono : C.fontHead, fontSize: big ? 18 : 18,
      bold: !big, color: C.dark, margin: 0, valign: "middle", fit: "shrink" });
    const total = row.c.total || 1;
    let sx = barX;
    ["done", "partial", "failed", "dropped", "unknown"].forEach((k) => {
      const v = row.c[k] || 0;
      if (!v) return;
      const w = (v / total) * barW;
      s.addShape("rect", { x: sx, y: yy + rowH * 0.08, w, h: rowH * 0.66, fill: { color: OUTCOME[k].color }, line: { color: C.white, width: 1 } });
      if (w > 0.35) {
        s.addText(String(v), { x: sx, y: yy + rowH * 0.08, w, h: rowH * 0.66, align: "center", valign: "middle",
          fontFace: C.fontMono, fontSize: big ? 20 : 16, color: C.dark, margin: 0 });
      }
      sx += w;
    });
    mono(s, String(row.c.total), barX + barW + 0.2, yy, totalW, rowH * 0.8, { fontSize: 17, align: "right" });
  };
  rows.forEach((row, i) => drawRow(row, y + i * rowH, false));
  const ty = y + rows.length * rowH + 0.2;
  hline(s, X, ty - 0.1, barX + barW + totalW + 0.2 - X);
  drawRow({ name: "ИТОГО", c: r.counts }, ty + 0.05, true);
  // Итог квартала по PBV — крупно справа.
  const bx = LAYOUT_W - X - 2.3;
  s.addText(r.weighted == null ? "—" : `${r.weighted}%`, { x: bx, y, w: 2.3, h: 1.2, align: "right",
    fontFace: C.fontMono, fontSize: 54, bold: true, color: C.dark, margin: 0 });
  mono(s, "ИТОГ ПО PBV", bx, y + 1.2, 2.3, 0.4, { align: "right", fontSize: 13 });
  if (note) {
    const ny = Math.max(ty + rowH + 0.45, FOOT - 1.7);
    s.addShape("roundRect", { x: X, y: ny, w: W, h: 1.6, rectRadius: 0.1, fill: { color: C.light }, line: { type: "none" } });
    mono(s, "ВЫВОД", X + 0.35, ny + 0.2, 3, 0.4, { fontSize: 13, charSpacing: 2 });
    s.addText(note, { x: X + 0.35, y: ny + 0.6, w: W - 0.7, h: 0.85, fontFace: C.fontHead, fontSize: 18, color: C.dark,
      margin: 0, valign: "top", fit: "shrink" });
  }
}

function addRisks(pres, risks) {
  const s = slideBase(pres, C.dark);
  let y = heading(s, "Актуальные риски и проблемы", "Вводная", true) + 0.2;
  const shown = risks.slice(0, 7);
  const rowH = Math.min(1.15, (FOOT - y) / Math.max(shown.length, 1));
  shown.forEach((r, i) => {
    const yy = y + i * rowH;
    if (i) s.addShape("line", { x: X, y: yy - 0.08, w: W, h: 0, line: { color: C.grayDark, width: 1 } });
    mono(s, (r.category || "общее").toUpperCase() + (r.kr ? `  ·  KR ${r.kr}` : ""), X, yy, 3.6, 0.5,
      { fontSize: 13, color: C.grayMid, valign: "top", charSpacing: 1 });
    s.addText(r.title, { x: X + 3.8, y: yy, w: 6.6, h: rowH - 0.2, fontFace: C.fontHead, fontSize: 18, bold: true,
      color: C.white, margin: 0, valign: "top", fit: "shrink" });
    s.addText(r.detail || "", { x: X + 10.8, y: yy, w: W - 10.8, h: rowH - 0.2, fontFace: C.fontHead, fontSize: 16,
      color: C.grayMid, margin: 0, valign: "top", fit: "shrink" });
  });
  if (risks.length > shown.length) {
    mono(s, `+ ещё ${risks.length - shown.length} — в разборе по целям`, X, FOOT, W, 0.4, { fontSize: 13 });
  }
}

function addRoadmap(pres, roadmap, quarter) {
  const s = slideBase(pres, C.light);
  const y = heading(s, `Roadmap ${quarterLabel(quarter)}`, "Вводная · верхнеуровнево");
  const n = Math.max(roadmap.length, 1), gap = 0.3;
  const cw = (W - gap * (n - 1)) / n, ch = FOOT - y;
  roadmap.forEach((col, i) => {
    const x = X + i * (cw + gap);
    s.addShape("roundRect", { x, y, w: cw, h: ch, rectRadius: 0.12, fill: { color: C.paper }, line: { type: "none" } });
    mono(s, `${col.code} · ${col.name}`.toUpperCase(), x + 0.3, y + 0.25, cw - 0.6, 0.75,
      { fontSize: 12, color: C.grayMid, valign: "top", charSpacing: 1, fit: "shrink" });
    const items = col.items.length ? col.items : ["нет KR в квартале"];
    s.addText(items.map((t, k) => ({ text: t, options: { breakLine: k < items.length - 1, paraSpaceAfter: 14 } })), {
      x: x + 0.3, y: y + 1.15, w: cw - 0.6, h: ch - 1.4, fontFace: C.fontHead, fontSize: 17, color: C.dark,
      margin: 0, valign: "top", fit: "shrink",
    });
  });
}

/* Сетка по неделям квартала с шапкой спринтов — общая для спринтов и GANTT. */
function weekGrid(s, d, y, labelW) {
  const weeks = d.weeks, gx = X + labelW, cw = (W - labelW) / weeks.length;
  (d.sprints ? d.sprints.labels : []).forEach((sp) => {
    const x0 = gx + sp.w0 * cw + 0.03, w = (sp.w1 - sp.w0 + 1) * cw - 0.06;
    pill(s, "", x0, y - 0.1, w, 0.62, C.dark);
    s.addText([{ text: sp.name, options: { color: C.white, bold: true, breakLine: true } }, { text: sp.dates, options: { color: C.grayMid } }], {
      x: x0 + 0.1, y: y - 0.1, w: w - 0.2, h: 0.62, fontFace: C.fontMono, fontSize: 11, margin: 0, valign: "middle" });
  });
  return { gx, cw };
}

function addSprints(pres, d) {
  const rows = d.sprints.rows;
  chunk(rows, 12).forEach((part, p) => {
    const s = slideBase(pres, C.paper);
    let y = heading(s, "Инициативы по спринтам" + (p ? " (продолжение)" : ""), "Вводная");
    const labelW = 6.4;
    const g = weekGrid(s, d, y - 0.1, labelW);
    y += 0.7;
    const rowH = Math.min(0.62, (FOOT - y - 0.6) / Math.max(part.length, 1));
    part.forEach((r, i) => {
      const yy = y + i * rowH;
      hline(s, X, yy, labelW - 0.1);
      s.addText([{ text: `0${r.obj}`.slice(-2) + "  ", options: { fontFace: C.fontMono, color: C.grayMid, fontSize: 13 } },
                 { text: clip(`${r.kr} ${r.title}`, 52), options: { color: C.dark } }], {
        x: X, y: yy, w: labelW - 0.15, h: rowH, fontFace: C.fontHead, fontSize: 16, margin: 0, valign: "middle" });
      // Ячейка на спринт: какие типы работ идут по KR в эти недели.
      d.sprints.labels.forEach((sp) => {
        const roles = [].concat(...r.weeks.slice(sp.w0, sp.w1 + 1));
        if (!roles.length) return;
        const groups = WORK.filter((w) => roles.some((role) => workOf(role) === w));
        const label = groups.length === 1 ? groups[0].label : groups.length === 2
          ? groups.map((gr) => gr.short).join(" + ") : groups.slice(0, 2).map((gr) => gr.short).join(" + ") + " …";
        pill(s, label, g.gx + sp.w0 * g.cw + 0.04, yy + 0.06, (sp.w1 - sp.w0 + 1) * g.cw - 0.08, rowH - 0.12,
          groups[0].color, { fontSize: label.length > 16 ? 11 : 13 });
      });
    });
    legend(s, WORK, FOOT - 0.1);
    if (p === 0 && d.sprints.undated.length) {
      mono(s, `сроки не заданы: ${d.sprints.undated.join("; ")}`, X + 9.5, FOOT - 0.1, W - 9.5, 0.42, { fontSize: 12 });
    }
  });
}

/* ---------- HERO: визуальная пауза — о чём дальше пойдёт речь ---------- */
function addHero(pres, eyebrow, title, lead, next, dark, stats) {
  const s = slideBase(pres, dark ? C.dark : C.light);
  const top = stats ? 2.3 : 3.0;
  mono(s, eyebrow.toUpperCase(), X, top, W, 0.5, { fontSize: 15, align: "center", charSpacing: 3 });
  s.addText(title, { x: X + 1, y: top + 0.55, w: W - 2, h: 2.2, fontFace: C.fontHead, fontSize: title.length > 40 ? 52 : 72,
    bold: true, color: dark ? C.white : C.dark, margin: 0, align: "center", valign: "middle" });
  let y = top + 2.85;
  if (lead) {
    s.addText(lead, { x: X + 2, y, w: W - 4, h: 0.9, fontFace: C.fontHead, fontSize: 20, color: dark ? C.grayMid : C.grayDark,
      margin: 0, align: "center", valign: "top" });
    y += 1.05;
  }
  if (next && next.length) {
    const shown = next.slice(0, 5).map((t) => clip(t, 38));
    const widths = shown.map((t) => 0.6 + t.length * 0.13);
    const total = widths.reduce((a, b) => a + b, 0) + 0.25 * (shown.length - 1) + 1.4;
    let x = Math.max(X, (LAYOUT_W - total) / 2);
    mono(s, "ДАЛЬШЕ", x, y, 1.3, 0.5, { fontSize: 12, charSpacing: 2 });
    x += 1.4;
    shown.forEach((t, i) => {
      s.addShape("roundRect", { x, y, w: widths[i], h: 0.5, rectRadius: 0.25, fill: { color: dark ? C.dark : C.light },
        line: { color: dark ? C.grayDark : C.dark, width: 1 } });
      s.addText(t, { x, y, w: widths[i], h: 0.5, fontFace: C.fontHead, fontSize: 14, color: dark ? C.white : C.dark,
        margin: 0, align: "center", valign: "middle" });
      x += widths[i] + 0.25;
    });
  }
  if (stats) statLine(s, LAYOUT_H - 2.4, stats);
}


/* ---------- ретро ---------- */
function addRetroStatus(pres, r) {
  const s = slideBase(pres, C.light);
  const y = heading(s, `Статус по целям ${quarterLabel(r.quarter)}`, `Часть 1 · ретро ${quarterLabel(r.quarter)}`);
  const n = (v) => ({ text: dash(v), options: { fontFace: C.fontMono, align: "center" } });
  const rows = r.objectives.map((o) => [{ text: `${o.code} — ${o.name}`, options: { bold: true } },
    n(o.counts.total), n(o.counts.done), n(o.counts.partial), n(o.counts.failed), n(o.counts.dropped),
    n(o.weighted == null ? null : `${o.weighted}%`)]);
  const c = r.counts, chip = (v, color) => ({ text: chipCell(dash(v), color), options: { fontFace: C.fontMono, align: "center" } });
  rows.push([{ text: "Итого", options: { fontFace: C.fontMono } }, n(c.total), chip(c.done, OUTCOME.done.color),
    chip(c.partial, OUTCOME.partial.color), chip(c.failed, OUTCOME.failed.color), chip(c.dropped, OUTCOME.dropped.color),
    chip(r.weighted == null ? null : `${r.weighted}%`, C.paper)]);
  s.addShape("roundRect", { x: X - 0.3, y: y - 0.2, w: W + 0.6, h: Math.min(FOOT - y + 0.2, 0.75 * (rows.length + 1) + 0.6),
    rectRadius: 0.12, fill: { color: C.paper }, line: { type: "none" } });
  table(s, [{ title: "Цель", w: 7.3 }, { title: "Всего KR", w: 1.7 }, { title: "Закрыто", w: 1.7 }, { title: "Частично", w: 1.7 },
    { title: "Не сделано", w: 1.8 }, { title: "Отменено", w: 1.8 }, { title: "Итог PBV", w: 1.9 }], rows, y, { fontSize: 18 });
}

function statLine(s, y, stats) {
  const bw = W / stats.length;
  stats.forEach((st, i) => {
    const x = X + i * bw;
    s.addShape("line", { x, y, w: bw - 0.3, h: 0, line: { color: st.color || C.idle, width: 3 } });
    s.addText(String(st.value), { x, y: y + 0.12, w: bw - 0.3, h: 0.8, fontFace: C.fontMono, fontSize: 36, bold: true,
      color: C.dark, margin: 0, valign: "middle" });
    mono(s, st.label, x, y + 0.92, bw - 0.3, 0.4, { fontSize: 12, color: C.grayDark });
  });
}

function addRetroObjective(pres, o, quarter, afterHero) {
  const ql = quarterLabel(quarter);
  chunk(o.rows, afterHero ? 6 : 5).forEach((rows, p) => {
    const s = slideBase(pres, C.paper);
    let y = heading(s, (afterHero ? `${o.code} — что сделали, что осталось` : `${o.code} — ${o.name}`) + (p ? " (продолжение)" : ""),
      `Часть 1 · ретро ${ql}`);
    if (!p && !afterHero) {
      if (o.goal) {
        s.addText(`Цель: ${o.goal}`, { x: X, y: y - 0.2, w: W, h: 0.5, fontFace: C.fontHead, fontSize: 18, color: C.grayDark, margin: 0 });
        y += 0.45;
      }
      statLine(s, y, [
        { label: "ВСЕГО KR", value: o.counts.total, color: C.dark },
        { label: "ЗАКРЫТО", value: o.counts.done, color: OUTCOME.done.color },
        { label: "ЧАСТИЧНО", value: o.counts.partial, color: OUTCOME.partial.color },
        { label: "НЕ СДЕЛАНО", value: o.counts.failed, color: OUTCOME.failed.color },
        { label: "ОТМЕНЕНО", value: o.counts.dropped, color: OUTCOME.dropped.color },
        { label: "ИТОГ ПО PBV", value: o.weighted == null ? "—" : `${o.weighted}%`, color: C.accent },
      ]);
      y += 1.65;
    }
    const list = (items) => (items.length ? items.join("; ") : "—");
    table(s, [{ title: "KR", w: 0.9 }, { title: "Задача", w: 3.6 }, { title: "PBV", w: 0.8 }, { title: "Итог", w: 2.2 },
      { title: "Что сделали", w: 3.6 }, { title: "Что осталось", w: 3.6 }, { title: "Переносим", w: 3.2 }],
      rows.map((r) => [
        { text: r.kr, options: { bold: true } }, r.title, { text: dash(r.pbv), options: { fontFace: C.fontMono } },
        { text: chipCell((OUTCOME[r.outcome] || OUTCOME.unknown).label, (OUTCOME[r.outcome] || OUTCOME.unknown).color)
            .concat(r.result ? [{ text: "\n" + r.result.replace(/^[^—]*— ?/, ""), options: { color: C.grayMid, fontSize: 13 } }] : []) },
        { text: list(r.done), options: { fontSize: 14 } }, { text: list(r.left), options: { fontSize: 14 } },
        { text: r.next, options: { fontSize: 14 } }]), y, { fontSize: 15 });
  });
}

/* ---------- планы ---------- */
function addPlanOverview(pres, d) {
  const s = slideBase(pres, C.paper);
  let y = heading(s, `Предстоящие работы ${quarterLabel(d.meta.quarter)}`, `Часть ${d.retro ? 2 : 1} · планы · обзор`);
  legend(s, WORK, y - 0.1);
  y += 0.55;
  const labelW = 6.0, infoW = 3.4, barX = X + labelW + 0.2, barW = W - labelW - 0.2 - infoW;
  const rows = d.objectives.map((o) => ({ name: `${o.code} — ${o.name}`, o }));
  const rowH = Math.min(0.9, (FOOT - y - 1.2) / (rows.length + 1));
  const draw = (name, groups, info, yy, big) => {
    s.addText(name, { x: X, y: yy, w: labelW, h: rowH * 0.8, fontFace: big ? C.fontMono : C.fontHead, fontSize: 18,
      bold: !big, color: C.dark, margin: 0, valign: "middle", fit: "shrink" });
    const total = WORK.reduce((a, w) => a + (groups[w.key] || 0), 0) || 1;
    let sx = barX;
    WORK.forEach((w) => {
      const v = groups[w.key] || 0;
      if (!v) return;
      const ww = (v / total) * barW;
      s.addShape("rect", { x: sx, y: yy + rowH * 0.08, w: ww, h: rowH * 0.66, fill: { color: w.color }, line: { color: C.white, width: 1 } });
      if (ww > 0.35) s.addText(String(v), { x: sx, y: yy + rowH * 0.08, w: ww, h: rowH * 0.66, align: "center", valign: "middle",
        fontFace: C.fontMono, fontSize: 15, color: C.dark, margin: 0 });
      sx += ww;
    });
    mono(s, info, barX + barW + 0.2, yy, infoW - 0.2, rowH * 0.8, { fontSize: 14, color: C.grayDark, align: "right", fit: "shrink" });
  };
  const groupsOf = (steps) => steps.reduce((a, st) => { const k = workOf(st.role).key; a[k] = (a[k] || 0) + 1; return a; }, {});
  const infoOf = (o) => {
    const days = o.krs.reduce((a, k) => a + (k.days || 0), 0);
    const open = o.gantt.filter((g) => g.who === "исполнитель не выбран").length;
    return `KR ${o.krs.length} · ${o.gantt.length} подз.` + (days ? ` · ${Math.round(days * 10) / 10} дн` : "") + (open ? ` · без исп. ${open}` : "");
  };
  rows.forEach((r, i) => draw(r.name, groupsOf(r.o.gantt), infoOf(r.o), y + i * rowH, false));
  const ty = y + rows.length * rowH + 0.2;
  hline(s, X, ty - 0.1, W);
  const all = { krs: [].concat(...d.objectives.map((o) => o.krs)), gantt: [].concat(...d.objectives.map((o) => o.gantt)) };
  draw("ИТОГО", groupsOf(all.gantt), infoOf(all), ty + 0.05, true);
  mono(s, "Число подзадач по типам работ. Сроки и исполнители — в GANTT по каждой цели.", X, FOOT, W, 0.4, { fontSize: 13 });
}

function addObjInitiatives(pres, o, d) {
  chunk(o.krs, 6).forEach((krs, p) => {
    const s = slideBase(pres, C.paper);
    const y = heading(s, `${o.code} · инициативы` + (p ? " (продолжение)" : ""), `Часть ${d.retro ? 2 : 1} · планы`);
    const typeText = (k) => [k.category, k.epic === "epic" ? "эпик" : "enabler"].filter(Boolean).join(" · ");
    table(s, [{ title: "KR", w: 0.9 }, { title: "Инициатива", w: 4.6 }, { title: "PBV", w: 0.8 }, { title: "Тип", w: 2.0 },
      { title: "Образ результата", w: 5.1 }, { title: "Отвечает", w: 2.2 }, { title: "Сроки", w: 2.3 }],
      krs.map((k) => [
        { text: k.id, options: { bold: true } },
        { text: [{ text: (k.tag ? `[${k.tag}] ` : "") + k.title, options: { breakLine: !!k.from_retro } }]
            .concat(k.from_retro ? chipCell(`из ${quarterLabel(d.meta.prev_quarter) || "прошлого квартала"}`, C.statusHold) : []) },
        { text: dash(k.pbv), options: { fontFace: C.fontMono } },
        { text: typeText(k), options: { fontFace: C.fontMono, fontSize: 13, color: C.grayDark } },
        { text: dash(k.result), options: { fontSize: 14 } },
        { text: dash(k.owner), options: { fontSize: 14 } },
        { text: ([k.start, k.end].filter(Boolean).join(" — ") || "уточняется") + (k.days != null ? `\n${k.days} дн` : ""),
          options: { fontFace: C.fontMono, fontSize: 13 } },
      ]), y, { fontSize: 16 });
  });
}

function addObjRisks(pres, o, d) {
  const s = slideBase(pres, C.paper);
  const y = heading(s, `${o.code} · известные риски`, `Часть ${d.retro ? 2 : 1} · планы`);
  table(s, [{ title: "Тип", w: 2.4 }, { title: "KR", w: 1.0 }, { title: "Риск", w: 7.0 }, { title: "Что делаем", w: 7.5 }],
    o.risks.slice(0, 8).map((r) => [
      { text: dash(r.category), options: { bold: true } }, { text: r.kr, options: { fontFace: C.fontMono } }, r.title,
      r.detail ? r.detail : { text: "обсудить на встрече", options: { italic: true, color: C.grayMid } },
    ]), y, { fontSize: 17 });
}

/* GANTT по сотрудникам: строка — человек, полосы — недели, где он работает над KR цели;
   в полосе — номера KR, цвет — статус его подзадач. Соседние одинаковые недели — одной полосой. */
function addObjGantt(pres, o, d) {
  const people = o.people || [];
  if (!people.length) return;
  const pages = Math.ceil(people.length / 12);
  chunk(people, Math.ceil(people.length / pages)).forEach((rows, p) => {
    const s = slideBase(pres, C.paper);
    let y = heading(s, `${o.code} · GANTT по сотрудникам` + (p ? " (продолжение)" : ""), `Часть ${d.retro ? 2 : 1} · планы`);
    const labelW = 6.4;
    const g = weekGrid(s, d, y - 0.1, labelW);
    y += 0.7;
    const rowH = Math.min(0.66, (FOOT - y - 0.6) / Math.max(rows.length, 1));
    rows.forEach((pr, i) => {
      const yy = y + i * rowH;
      hline(s, X, yy, labelW - 0.1);
      const warn = pr.kind === "none";
      const who = pr.who.replace("внешний ресурс: ", "внешн. ");
      s.addText([{ text: `${pr.roles.join(", ")}  `, options: { fontFace: C.fontMono, bold: true, color: C.grayDark, fontSize: 13 } },
                 { text: clip(who, 34), options: { bold: true, color: warn ? C.red : C.dark } }], {
        x: X, y: yy, w: labelW - 2.1, h: rowH, fontFace: C.fontHead, fontSize: 16, margin: 0, valign: "middle" });
      mono(s, `${pr.steps} подз.` + (pr.days ? ` · ${pr.days} дн` : ""), X + labelW - 2.1, yy, 1.95, rowH,
        { fontSize: 12, align: "right", color: C.grayDark });
      // Склеиваем соседние недели с теми же KR и статусом в одну полосу.
      let k = 0;
      while (k < pr.weeks.length) {
        const c = pr.weeks[k];
        if (!c.krs.length) { k++; continue; }
        let e = k;
        while (e + 1 < pr.weeks.length && pr.weeks[e + 1].krs.join() === c.krs.join() && pr.weeks[e + 1].status === c.status) e++;
        pill(s, c.krs.join(" · "), g.gx + k * g.cw + 0.04, yy + 0.07, (e - k + 1) * g.cw - 0.08, rowH - 0.14,
          (STATUS[c.status] || STATUS.TODO).color, { fontFace: C.fontMono, fontSize: 12 });
        k = e + 1;
      }
      if (pr.undated) mono(s, `без сроков: ${pr.undated}`, LAYOUT_W - X - 2.2, yy, 2.2, rowH, { fontSize: 11, align: "right" });
    });
    legend(s, ["TODO", "IN PROGRESS", "BLOCKED", "DONE"].map((key) => STATUS[key]), FOOT - 0.1);
    mono(s, "в полосе — номера KR цели", X + 11.5, FOOT - 0.1, W - 11.5, 0.42, { fontSize: 12, align: "right" });
  });
}

/* ---------- финал ---------- */
function addHow(pres, how) {
  const s = slideBase(pres, C.light);
  const y = heading(s, "Как работаем в квартале", "Процесс");
  how.slice(0, 6).forEach((t, i) => {
    const yy = y + i * 1.05;
    mono(s, String(i + 1).padStart(2, "0"), X, yy, 1.0, 0.8, { fontSize: 22, color: C.accent, bold: true });
    s.addText(t, { x: X + 1.1, y: yy, w: W - 1.1, h: 0.8, fontFace: C.fontHead, fontSize: 22, color: C.dark, margin: 0,
      valign: "middle", fit: "shrink" });
  });
}

function addAsks(pres, asks) {
  const s = slideBase(pres, C.dark);
  const y = heading(s, "Что нужно от команды", "После встречи", true);
  asks.slice(0, 6).forEach((a, i) => {
    const yy = y + i * 1.1;
    if (i) s.addShape("line", { x: X, y: yy - 0.15, w: W, h: 0, line: { color: C.grayDark, width: 1 } });
    mono(s, String(a.num), X, yy, 1.0, 0.8, { fontSize: 26, bold: true, color: C.accent });
    s.addText(a.title, { x: X + 1.1, y: yy, w: W - 1.1, h: 0.8, fontFace: C.fontHead, fontSize: 24, bold: true,
      color: C.white, margin: 0, valign: "middle", fit: "shrink" });
  });
}

/* ---------- сборка ---------- */
function validatePresentData(d) {
  ["meta", "weeks", "risks", "roadmap", "objectives", "how", "asks"].forEach((k) => {
    if (d[k] === undefined) throw new Error(`build_present_pptx: data.${k} отсутствует — собери данные: okr-plan.py present`);
  });
  if (!Array.isArray(d.objectives)) throw new Error("build_present_pptx: data.objectives — не список");
}

function buildPresentDeck(d) {
  validatePresentData(d);
  const pres = newDeck();
  const q = quarterLabel(d.meta.quarter);
  // Вводная — от общего: итоги, риски, roadmap, спринты.
  addTitle(pres, d);
  addHero(pres, "Вводная", "Картина квартала", "Откуда идём, что мешает и как раскладываем работу по времени.",
    [].concat(d.retro ? [`Результаты ${quarterLabel(d.retro.quarter)}`] : [], d.risks.length ? ["Актуальные риски"] : [],
      ["Roadmap"], d.sprints && d.sprints.rows.length ? ["Инициативы по спринтам"] : []), true);
  if (d.retro) addPastResults(pres, d.retro, d.meta.retro_note);
  if (d.risks.length) addRisks(pres, d.risks);
  addRoadmap(pres, d.roadmap, d.meta.quarter);
  if (d.sprints && d.sprints.rows.length) addSprints(pres, d);
  // Часть 1 — ретро: общий статус, затем каждая цель.
  if (d.retro) {
    const rq = quarterLabel(d.retro.quarter);
    addHero(pres, "Часть 1", `Ретро ${rq}`, "Что обещали в прошлом квартале и что из этого вышло.",
      ["Статус по целям"].concat(d.retro.objectives.map((o) => o.code)), true);
    addRetroStatus(pres, d.retro);
    d.retro.objectives.forEach((o) => {
      addHero(pres, `Часть 1 · ретро ${rq}`, `${o.code} — ${o.name}`, o.goal ? `Цель: ${o.goal}` : "",
        ["Что сделали", "Что осталось", "Что переносим"], false, [
          { label: "ВСЕГО KR", value: o.counts.total, color: C.dark },
          { label: "ЗАКРЫТО", value: o.counts.done, color: OUTCOME.done.color },
          { label: "ЧАСТИЧНО", value: o.counts.partial, color: OUTCOME.partial.color },
          { label: "НЕ СДЕЛАНО", value: o.counts.failed, color: OUTCOME.failed.color },
          { label: "ОТМЕНЕНО", value: o.counts.dropped, color: OUTCOME.dropped.color },
          { label: "ИТОГ ПО PBV", value: o.weighted == null ? "—" : `${o.weighted}%`, color: C.accent }]);
      addRetroObjective(pres, o, d.retro.quarter, true);
    });
  }
  // Часть 2 — планы: обзор, затем каждая цель.
  addHero(pres, `Часть ${d.retro ? 2 : 1}`, `Планы ${q}`, d.meta.message,
    ["Обзор предстоящих работ"].concat(d.objectives.map((o) => o.code)), true);
  addPlanOverview(pres, d);
  d.objectives.forEach((o) => {
    const days = Math.round(o.krs.reduce((a, k) => a + (k.days || 0), 0) * 10) / 10;
    const open = o.gantt.filter((g) => g.who === "исполнитель не выбран" || g.who === "нет роли в команде").length;
    addHero(pres, `Часть ${d.retro ? 2 : 1} · планы ${q}`, `${o.code} — ${o.name}`, o.goal ? `Цель: ${o.goal}` : "",
      ["Инициативы"].concat(o.risks.length ? ["Известные риски"] : [], d.gantt && o.people.length ? ["GANTT по сотрудникам"] : []), false, [
        { label: "KR", value: o.krs.length, color: C.dark },
        { label: "ПОДЗАДАЧ", value: o.gantt.length, color: C.dev },
        { label: "ОЦЕНКА, ДН", value: days || "—", color: C.analysis },
        { label: "ЛЮДЕЙ", value: o.people.filter((p) => p.kind === "person").length, color: C.statusDone },
        { label: "БЕЗ ИСПОЛНИТЕЛЯ", value: open, color: C.statusCancelled },
        { label: "РИСКОВ", value: o.risks.length, color: C.statusHold }]);
    addObjInitiatives(pres, o, d);
    if (o.risks.length) addObjRisks(pres, o, d);
    if (d.gantt) addObjGantt(pres, o, d);
  });
  if (d.how.length || d.asks.length) {
    addHero(pres, "Финал", "Как работаем дальше", "", [].concat(d.how.length ? ["Как работаем в квартале"] : [],
      d.asks.length ? ["Что нужно от команды"] : []), true);
  }
  if (d.how.length) addHow(pres, d.how);
  if (d.asks.length) addAsks(pres, d.asks);
  return pres;
}

module.exports = { buildPresentDeck, validatePresentData, quarterLabel, workOf };

if (require.main === module) {
  const fs = require("fs");
  const [, , dataPath, outPath] = process.argv;
  if (!dataPath || !outPath) {
    console.error("Usage: node build_present_pptx.js <data.json> <out.pptx>");
    process.exit(1);
  }
  let pres;
  try {
    pres = buildPresentDeck(JSON.parse(fs.readFileSync(dataPath, "utf8")));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  pres.writeFile({ fileName: outPath })
    .then(() => console.log(`Written ${outPath}`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
