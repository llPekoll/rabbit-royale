import { chromium } from 'playwright';
const OUT = process.argv[2] ?? 'verify-out';
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 })).newPage();
p.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await p.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
const g = p.locator('button:has-text("Play as a guest")');
if (await g.count()) await g.first().click();
await p.waitForSelector('.rr-hud, .rr-loop-bar', { timeout: 30000 });
await p.waitForTimeout(2500);
const h = p.locator('.rr-overlay button:has-text("Home")');
if (await h.count()) { await h.first().click(); await p.waitForTimeout(2800); }
console.log(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('.rr-hub-card')].map((el) => {
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), bL: cs.borderLeftWidth,
    slice: cs.borderImageSlice, overflow: cs.overflow,
    src: (cs.borderImageSource.match(/[\w-]+\.webp/) || ['none'])[0],
    text: (el.textContent || '').trim().slice(0, 26) };
})), null, 1));
await p.screenshot({ path: `${OUT}/cards.png`, clip: { x: 0, y: 60, width: 420, height: 520 } });
console.log('[shot] cards');
await b.close();
