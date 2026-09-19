import { chromium } from 'playwright';
const OUT = process.argv[2] ?? 'verify-out';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
const g = page.locator('button:has-text("Play as a guest")');
if (await g.count()) await g.first().click();
await page.waitForSelector('.rr-hud, .rr-loop-bar', { timeout: 30000 });
await page.waitForTimeout(2500);
const home = page.locator('.rr-overlay button:has-text("Home")');
if (await home.count()) { await home.first().click(); await page.waitForTimeout(2500); }
await page.locator('[aria-label="Shop"]').first().click();
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/shop-leaf.png` });
console.log(JSON.stringify(await page.evaluate(() => {
  const m = document.querySelector('.rr-shop-modal');
  const t = document.querySelector('.rr-shop-tile-face');
  const g = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return { w: Math.round(r.width), h: Math.round(r.height), bT: cs.borderTopWidth, bL: cs.borderLeftWidth,
      src: (cs.borderImageSource||'').slice(0,58) }; };
  return { modal: g(m), tile: g(t) };
}), null, 1));
await b.close();
