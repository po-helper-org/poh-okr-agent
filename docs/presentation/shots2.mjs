import { chromium } from 'playwright-core';
const [D, CH] = [process.argv[2], process.argv[3]];
const b = await chromium.launch({executablePath: CH});
const pg = await b.newPage({viewport:{width:1280,height:800}, deviceScaleFactor: 1.5});
const shot = (n) => pg.screenshot({path:`${D}/${n}.jpg`, type:'jpeg', quality:82});
await pg.goto(`file://${D}/fact-draft.html`); await shot('r1-draft');
await pg.goto(`file://${D}/plan-draft.html`); await shot('p1-draft');
await pg.goto(`file://${D}/plan.html`);
await pg.click('tr.row[data-kr="1.2"]');
await pg.waitForTimeout(300);
const box = await pg.evaluate(() => {
  const bs = [...document.querySelectorAll('#sideNote .b[data-t="li"]')];
  const a = bs.find(x => /Тарифы утверждены/.test(x.textContent)); const z = bs[bs.indexOf(a)+1];
  a.scrollIntoView({block:'center'});
  const ra = a.getBoundingClientRect(), rz = z.getBoundingClientRect();
  return {x1: ra.left + 30, y1: ra.top + ra.height/2, x2: rz.right - 20, y2: rz.bottom - 6, txt: a.textContent + ' | ' + z.textContent};
});
console.log(box.txt);
await pg.evaluate(({x2,y2}) => {
  const bs = [...document.querySelectorAll('#sideNote .b[data-t="li"]')];
  const a = bs.find(x => /Тарифы утверждены/.test(x.textContent)); const z = bs[bs.indexOf(a)+1];
  const w = document.createTreeWalker(z, NodeFilter.SHOW_TEXT); let last = null; while (w.nextNode()) last = w.currentNode;
  const f = document.createTreeWalker(a, NodeFilter.SHOW_TEXT); f.nextNode();
  const r = document.createRange(); r.setStart(f.currentNode, 0); r.setEnd(last, last.textContent.length);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  document.getElementById('sideNote').dispatchEvent(new MouseEvent('mouseup', {bubbles: true, clientX: x2, clientY: y2}));
}, box);
await pg.waitForTimeout(200);
console.log(await pg.evaluate(() => [getSelection().toString().slice(0,80), document.querySelector('.sel-btn').hidden, getComputedStyle(document.querySelector('.sel-btn')).display]));
const vis = await pg.isVisible('.sel-btn');
console.log('selBtn', vis);
if (vis) { await shot('p2-select'); await pg.click('.sel-btn');
  await pg.fill('.popover textarea', 'Добавь зависимость от маркетинга: без макетов тарифа FE не стартует');
  await shot('p2-comment'); }
await b.close();
