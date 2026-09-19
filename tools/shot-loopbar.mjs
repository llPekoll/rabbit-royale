import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:6007/iframe.html?id=chrome-loopbar--';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1100, height: 400 }, deviceScaleFactor: 2 })).newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
for (const id of ['pointed-dig', 'pointed-home', 'pointed-raid', 'empty', 'full']) {
  await p.goto(BASE + id, { waitUntil: 'networkidle' });
  await p.waitForSelector('.rr-loop-bar', { timeout: 10000 });
  await p.waitForTimeout(700);
  const info = await p.evaluate(() => {
    const bg = document.querySelector('.rr-hub-badge');
    if (!bg) return { badge: 'none' };
    const cs = getComputedStyle(bg), r = bg.getBoundingClientRect();
    return { badge: { w: Math.round(r.width), h: Math.round(r.height), text: bg.textContent,
      src: (cs.borderImageSource.match(/[\w-]+\.webp/) || ['none'])[0],
      slice: cs.borderImageSlice, vis: cs.display } };
  });
  console.log(`[${id}]`, JSON.stringify(info));
  await p.screenshot({ path: `${OUT}/loop-${id}.png` });
}
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
await b.close();
