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
