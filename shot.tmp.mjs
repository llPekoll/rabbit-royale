import { chromium } from 'playwright';
const OUT = process.argv[2];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
p.on('console', m => { if (m.type()==='error') console.log('CONSOLE ERROR:', m.text()); });
p.on('pageerror', e => console.log('PAGE ERROR:', e.message));
await p.goto('http://localhost:6007/iframe.html?id=burrow-board--camera&viewMode=story', { waitUntil: 'networkidle' });
await p.waitForTimeout(4500);
for (const mode of ['placing','raiding','home']) {
  await p.click(`button:text-is("${mode}")`);
  await p.waitForTimeout(1400);
  await p.screenshot({ path: `${OUT}/cam-${mode}.png` });
  console.log('mode', mode, 'ok');
}
await b.close();
