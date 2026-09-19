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
console.log(JSON.stringify(await p.evaluate(() => {
  const c = document.querySelector('.rr-loop-dial-carrot');
  const d = document.querySelector('.rr-loop-dial');
  const g = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
             cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }; };
  const cs = c ? getComputedStyle(c) : null;
  return { carrot: g(c), dial: g(d), z: cs && cs.zIndex, natural: c ? { w: c.naturalWidth, h: c.naturalHeight } : null };
}), null, 1));
const cell = await p.locator('.rr-loop-cell:has(.rr-loop-dial)').boundingBox();
await p.screenshot({ path: `${OUT}/dial.png`,
  clip: { x: Math.max(0, cell.x - 12), y: Math.max(0, cell.y - 24), width: 300, height: cell.height + 48 } });
console.log('[shot] dial');
await b.close();
