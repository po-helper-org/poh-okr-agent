import { chromium } from 'playwright-core'; import fs from 'fs';
// node towebp.mjs <dir> <chrome> <subdir> <maxWidth> <quality> <name.ext>...
const [D, CH, SUB, W, Q, ...files] = process.argv.slice(2);
const b = await chromium.launch({executablePath: CH}); const p = await b.newPage();
fs.mkdirSync(`${D}/out/${SUB}`, {recursive: true});
for (const file of files) {
  const n = file.replace(/\.\w+$/, ''), mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
  const src = `data:${mime};base64,` + fs.readFileSync(`${D}/${file}`).toString('base64');
  const r = await p.evaluate(async ([src, W, Q]) => {
    const im = new Image(); im.src = src; await im.decode();
    const k = Math.min(1, W / im.naturalWidth);
    const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
    return {w: c.width, h: c.height, data: c.toDataURL('image/webp', Q)};
  }, [src, +W, +Q]);
  fs.writeFileSync(`${D}/out/${SUB}/${n}.webp`, Buffer.from(r.data.split(',')[1], 'base64'));
  fs.writeFileSync(`${D}/out/${SUB}/${n}.json`, JSON.stringify({w: r.w, h: r.h}));
}
await b.close();
