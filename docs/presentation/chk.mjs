import { chromium } from 'playwright-core';
const [D, CH] = process.argv.slice(2);
const U = 'http://127.0.0.1:8765/okr-quarter-planning/';
const b = await chromium.launch({executablePath: CH});
const p = await b.newPage({viewport:{width:1280,height:720}}); const errs = []; p.on('pageerror', e => errs.push(e.message));
const reqs = []; p.on('request', r => reqs.push(r.url().replace(U, '')));
await p.goto(U); await p.waitForTimeout(300);
console.log('first requests', reqs.slice(0, 6).join(' '));
const n = await p.$$eval('.slide', s => s.length);
for (let i = 1; i <= n; i++) {
  await p.evaluate(k => { location.hash = 'slide=' + k; }, i); await p.waitForTimeout(300);
  if (await p.$eval('.slide.on', s => s.scrollHeight > 720 || s.scrollWidth > 1280)) console.log('OVERFLOW', i);
  await p.screenshot({path: `${D}/s${String(i).padStart(2,'0')}.png`});
}
await p.evaluate(() => { location.hash = 'slide=6'; }); await p.waitForTimeout(200);
await p.click('.slide.on .shot >> nth=0'); await p.waitForTimeout(400);
console.log('lightbox', await p.$eval('#lbImg', i => i.src.replace(location.origin, '') + ' ' + i.naturalWidth));
await p.screenshot({path: `${D}/lb.png`});
console.log('broken', await p.$$eval('img', ims => ims.filter(i => i.id !== 'lbImg' && i.complete && i.naturalWidth === 0).map(i => i.src)), 'errors', errs);
console.log('cover photo', await p.$eval('#coverPhoto', i => i.naturalWidth));
await b.close();
