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

module.exports = {
  BRAND, LAYOUT_NAME, LAYOUT_W, LAYOUT_H, MARGIN,
  newDeck, addTitleSlide, addDividerSlide, addSummaryFunnelSlide, addStatusTableSlide,
  addRisksSlide, addRoadmapGridSlide, addSprintsSlide,
  statusBreakdown,
};
