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
const trophy = page.locator('[aria-label*="eaderboard"], .rr-lb-launch button, [aria-label="Season board"]').first();
if (await trophy.count()) { await trophy.click(); } else { await page.locator('.rr-lb-launch').first().click(); }
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/lb-leaf.png` });
console.log(JSON.stringify(await page.evaluate(() => {
  const el = document.querySelector('.rr-lb'); if (!el) return null;
  const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
  return { w: Math.round(r.width), h: Math.round(r.height), bT: cs.borderTopWidth,
    overflow: cs.overflow, color: cs.color, src: (cs.borderImageSource||'').slice(0,54) };
}), null, 1));
await b.close();
