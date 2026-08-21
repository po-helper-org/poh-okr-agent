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

function clampTableHeight(rowCount, rowHeight, startY) {
  const available = LAYOUT_H - startY - MARGIN;
  const wanted = rowCount * rowHeight;
  if (wanted > available) {
    console.error(
      `⚠ Таблица на ${rowCount} строк (желаемая высота ${wanted.toFixed(2)}in) не помещается в доступные ${available.toFixed(2)}in — слайд может потребовать ручного разделения.`
    );
  }
  return Math.min(wanted, available);
}

function newDeck() {
  const pres = new pptxgen();
  pres.defineLayout({ name: LAYOUT_NAME, width: LAYOUT_W, height: LAYOUT_H });
  pres.layout = LAYOUT_NAME;
  return pres;
}

function addTitleSlide(pres, meta, opts) {
  const title = (opts && opts.title) || `Экватор ${meta.quarterLabel} · ${meta.team}`;
  const subtitle = (opts && opts.subtitle) || "Что сделали за первую половину квартала и что планируем закончить.";
  const slide = pres.addSlide();
  slide.background = { color: BRAND.dark };
  slide.addText(title, {
    x: MARGIN, y: 3.6, w: LAYOUT_W - MARGIN * 2, h: 1.6,
    fontFace: BRAND.fontHead, fontSize: 44, bold: true, color: BRAND.white, margin: 0,
  });
  slide.addText(subtitle, {
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
    x: MARGIN, y: 2.0, w: LAYOUT_W - MARGIN * 2, h: clampTableHeight(tableRows.length, 0.6, 2.0),
    border: { type: "solid", color: BRAND.grayMid, pt: 0.5 },
    autoPage: false,
  });
  return slide;
}

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
  const lastRow = Math.floor((risks.length - 1) / cols);
  const lastCardBottom = 2.0 + lastRow * (cardH + 0.5) + cardH;
  if (risks.length && lastCardBottom > LAYOUT_H - MARGIN) {
    console.error(
      `⚠ Сетка рисков на ${risks.length} карточек (нижний край ${lastCardBottom.toFixed(2)}in) не помещается в доступные ${(LAYOUT_H - MARGIN).toFixed(2)}in — слайд может потребовать ручного разделения.`
    );
  }
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

function addRoadmapGridSlide(pres, grid, title = "Roadmap на вторую часть") {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.beige };
  slide.addText(title, {
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
    x: MARGIN, y: 2.0, w: LAYOUT_W - MARGIN * 2, h: clampTableHeight(tableRows.length, 0.6, 2.0),
    border: { type: "solid", color: BRAND.grayMid, pt: 0.5 },
    autoPage: false,
  });
  return slide;
}

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
    x: MARGIN, y: 1.6, w: LAYOUT_W - MARGIN * 2, h: clampTableHeight(tableRows.length, 0.8, 1.6),
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
    x: MARGIN, y: 1.8, w: LAYOUT_W - MARGIN * 2, h: clampTableHeight(tableRows.length, 0.8, 1.8),
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
    x: MARGIN, y: 1.8, w: LAYOUT_W - MARGIN * 2, h: clampTableHeight(tableRows.length, 0.9, 1.8),
    border: { type: "solid", color: BRAND.grayMid, pt: 0.5 },
    autoPage: false,
  });
  return slide;
}

function addLeadershipAsksSlide(pres, asks) {
  const slide = pres.addSlide();
  slide.background = { color: BRAND.dark };
  slide.addText("Что нужно от руководителей", {
    x: MARGIN, y: MARGIN, w: LAYOUT_W - MARGIN * 2, h: 0.9,
    fontFace: BRAND.fontHead, fontSize: 30, bold: true, color: BRAND.white, margin: 0,
  });
  const cols = Math.min(asks.length, 3) || 1;
  const cardW = (LAYOUT_W - MARGIN * 2 - 0.6 * (cols - 1)) / cols;
  const rowH = 4.8;
  const lastRow = Math.floor((asks.length - 1) / cols);
  const lastCardBottom = lastRow * rowH + 6.6;
  if (asks.length && lastCardBottom > LAYOUT_H - MARGIN) {
    console.error(
      `⚠ Сетка leadership asks на ${asks.length} карточек (нижний край ${lastCardBottom.toFixed(2)}in) не помещается в доступные ${(LAYOUT_H - MARGIN).toFixed(2)}in — слайд может потребовать ручного разделения.`
    );
  }
  asks.forEach((ask, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN + col * (cardW + 0.6);
    const y = row * rowH;
    slide.addText(String(ask.num), {
      x, y: y + 2.0, w: 1.2, h: 1.0,
      fontFace: BRAND.fontMono, fontSize: 40, bold: true, color: BRAND.accent, margin: 0,
    });
    slide.addText(ask.title, {
      x, y: y + 3.1, w: cardW, h: 0.6,
      fontFace: BRAND.fontHead, fontSize: 18, bold: true, color: BRAND.white, margin: 0,
    });
    slide.addText(ask.why, {
      x, y: y + 3.8, w: cardW, h: 1.3,
      fontFace: BRAND.fontHead, fontSize: 13, color: BRAND.grayMid, margin: 0,
    });
    slide.addText(ask.ask, {
      x, y: y + 5.3, w: cardW, h: 1.3,
      fontFace: BRAND.fontHead, fontSize: 14, bold: true, color: BRAND.white, margin: 0,
    });
  });
  return slide;
}

function validateEquatorData(data) {
  function fail(path, msg) {
    throw new Error(`buildEquatorDeck: data.${path} is ${msg}`);
  }

  if (!data || typeof data !== "object") fail("", "missing or not an object");

  const topKeys = ["meta", "summaryFunnel", "risks", "roadmapGrid", "sprints", "objectives", "leadershipAsks"];
  topKeys.forEach((k) => {
    if (data[k] === undefined) fail(k, "missing");
  });

  const metaStringKeys = ["quarterLabel", "team", "po", "period1", "period2"];
  if (!data.meta || typeof data.meta !== "object") {
    fail("meta", "missing or not an object");
  } else {
    metaStringKeys.forEach((k) => {
      if (typeof data.meta[k] !== "string" || data.meta[k].length === 0) {
        fail(`meta.${k}`, "missing or not a string");
      }
    });
  }

  if (!data.summaryFunnel || !Array.isArray(data.summaryFunnel.objectives)) {
    fail("summaryFunnel.objectives", "missing or not an array");
  }
  const funnelNumKeys = ["total", "done", "inProgress", "notStarted", "cancelled"];
  data.summaryFunnel.objectives.forEach((entry, i) => {
    funnelNumKeys.forEach((k) => {
      if (!entry || typeof entry[k] !== "number") fail(`summaryFunnel.objectives[${i}].${k}`, "missing or not a number");
    });
  });

  if (!Array.isArray(data.objectives)) fail("objectives", "missing or not an array");
  const objKeys = ["code", "name", "stageFunnel", "part2Plan", "part1Table", "newTasks", "risks"];
  const stageFunnelKeys = ["total", "waiting", "research", "analysis", "dev", "debug", "done", "cancelled"];
  data.objectives.forEach((obj, i) => {
    objKeys.forEach((k) => {
      if (!obj || obj[k] === undefined) fail(`objectives[${i}].${k}`, "missing");
    });
    if (obj && obj.stageFunnel) {
      stageFunnelKeys.forEach((sk) => {
        if (typeof obj.stageFunnel[sk] !== "number") fail(`objectives[${i}].stageFunnel.${sk}`, "missing or not a number");
      });
    }
  });
}

function buildEquatorDeck(data) {
  validateEquatorData(data);
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

module.exports = {
  BRAND, LAYOUT_NAME, LAYOUT_W, LAYOUT_H, MARGIN,
  newDeck, addTitleSlide, addDividerSlide, addSummaryFunnelSlide, addStatusTableSlide,
  addRisksSlide, addRoadmapGridSlide, addSprintsSlide,
  addStageFunnelSlide, addPart2PlanSlide, addPart1DetailTableSlide, addNewTasksSlide, addObjRisksSlide,
  addLeadershipAsksSlide, buildEquatorDeck, validateEquatorData, clampTableHeight,
  statusBreakdown, statusChipColor,
};

if (require.main === module) {
  const fs = require("fs");
  const path = require("path");
  const [, , dataPath, outPath] = process.argv;
  if (!dataPath || !outPath) {
    console.error("Usage: node build_equator_pptx.js <data.json> <out.pptx>");
    process.exit(1);
  }
  let pres;
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    pres = buildEquatorDeck(data);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  pres
    .writeFile({ fileName: outPath })
    .then(() => console.log(`Written ${outPath}`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
