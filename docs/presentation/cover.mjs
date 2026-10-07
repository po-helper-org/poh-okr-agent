import { chromium } from 'playwright-core';
const [OUT, CH] = process.argv.slice(2);
const b = await chromium.launch({executablePath: CH}); const p = await b.newPage({viewport:{width:1280,height:720}});
await p.goto('http://127.0.0.1:8765/okr-quarter-planning/'); await p.waitForTimeout(600);
await p.screenshot({path: OUT}); await b.close();
