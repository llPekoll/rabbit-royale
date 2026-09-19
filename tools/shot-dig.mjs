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
await p.waitForSelector('.rr-loop-dial', { timeout: 10000 });

const cell = await p.locator('.rr-loop-cell:has(.rr-loop-dial)').boundingBox();
const clip = { x: Math.max(0, cell.x - 14), y: Math.max(0, cell.y - 30), width: 360, height: cell.height + 60 };
const carrotY = async () => p.evaluate(() => {
  const c = document.querySelector('.rr-loop-dial-carrot');
  const d = document.querySelector('.rr-loop-dial');
  const cr = c.getBoundingClientRect(), dr = d.getBoundingClientRect();
  return { carrotCY: +(cr.y + cr.height / 2).toFixed(1), carrotH: Math.round(cr.height),
           dialY: +dr.y.toFixed(1) };
});
console.log('rest   ', JSON.stringify(await carrotY()));
await p.screenshot({ path: `${OUT}/dig-rest.png`, clip });

// press and hold on the DIG slab, then measure again
const slab = await p.locator('.rr-loop-slab.rr-loop-dig').boundingBox();
await p.mouse.move(slab.x + slab.width / 2, slab.y + slab.height / 2);
await p.mouse.down();
await p.waitForTimeout(220);
console.log('pressed', JSON.stringify(await carrotY()));
await p.screenshot({ path: `${OUT}/dig-press.png`, clip });
await p.mouse.up();

// the badge
console.log(JSON.stringify(await p.evaluate(() => {
  const b = document.querySelector('.rr-loop-bar .rr-hub-badge');
  if (!b) return { badge: 'none' };
  const cs = getComputedStyle(b), r = b.getBoundingClientRect();
  return { badge: { w: Math.round(r.width), h: Math.round(r.height), text: b.textContent,
    src: (cs.borderImageSource.match(/[\w-]+\.webp/) || ['none'])[0], slice: cs.borderImageSlice } };
}), null, 1));
await b.close();
