const path = require("path");
const { BRAND, newDeck, addTitleSlide, addRoadmapGridSlide, clampTableHeight, LAYOUT_W, LAYOUT_H, MARGIN } = require(
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
    x: MARGIN, y: 2.0, w: LAYOUT_W - MARGIN * 2, h: clampTableHeight(tableRows.length, 0.7, 2.0),
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

function validatePlanData(data) {
  function fail(path, msg) {
    throw new Error(`buildPlanDeck: data.${path} is ${msg}`);
  }
  if (!data || typeof data !== "object") fail("", "missing or not an object");
  ["meta", "objectives", "sprintPlan"].forEach((k) => {
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

  if (!Array.isArray(data.objectives)) fail("objectives", "missing or not an array");
  if (!Array.isArray(data.sprintPlan)) fail("sprintPlan", "missing or not an array");
}

function buildPlanDeck(data) {
  validatePlanData(data);
  const pres = newDeck();
  addTitleSlide(pres, data.meta, {
    title: `Квартальный план ${data.meta.quarterLabel} · ${data.meta.team}`,
    subtitle: "Цели квартала, план по спринтам и риски входа.",
  });
  addGoalsSlide(pres, data.objectives);
  if (data.roadmapGrid) addRoadmapGridSlide(pres, data.roadmapGrid, "Roadmap квартала");
  addSprintPlanSlide(pres, data.sprintPlan);
  addEntryRisksSlide(pres, data.entryRisks || []);
  return pres;
}

module.exports = { buildPlanDeck, addGoalsSlide, addSprintPlanSlide, addEntryRisksSlide, validatePlanData };

if (require.main === module) {
  const fs = require("fs");
  const [, , dataPath, outPath] = process.argv;
  if (!dataPath || !outPath) {
    console.error("Usage: node build_plan_deck.js <data.json> <out.pptx>");
    process.exit(1);
  }
  let pres;
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
    pres = buildPlanDeck(data);
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
