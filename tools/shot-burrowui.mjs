import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 520, height: 900 }, deviceScaleFactor: 2 })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
for (const id of process.argv.slice(3)) {
  await p.goto(`http://localhost:6007/iframe.html?id=ui-burrow-column--${id}`, { waitUntil: 'networkidle' });
  await p.waitForSelector('.rr-hub-card', { timeout: 10000 });
  await p.waitForTimeout(800);
  console.log(`[${id}]`, JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.rr-hub-btn')].map((el) => {
    const cs = getComputedStyle(el);
    return { text: (el.textContent || '').trim().slice(0, 12), disabled: el.disabled,
      bg: cs.backgroundColor, op: cs.opacity };
  }))));
  await p.screenshot({ path: `${OUT}/burrowui-${id}.png`, fullPage: true });
}
console.log(errs.length ? errs.join('\n') : 'no console errors');
await b.close();
