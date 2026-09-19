// Every kit panel's REAL rendered box, per surface — so each leaf-frame
// corner is a measurement rather than a guess.
//   node tools/measure-panels.mjs
import { chromium } from 'playwright';

const rows = [];
async function sweep(page, where) {
  const found = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('div,button')) {
      const cs = getComputedStyle(el);
      if (!cs.borderImageSource || cs.borderImageSource === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      out.push({
        cls: (el.className || '').toString().slice(0, 46),
        tag: el.tagName.toLowerCase(),
        w: Math.round(r.width), h: Math.round(r.height),
      });
    }
    return out;
  });
  for (const f of found) rows.push({ where, ...f });
}

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('pageerror', () => {});
await page.goto('http://localhost:3010/', { waitUntil: 'networkidle' });

const guest = page.locator('button:has-text("Play as a guest")');
if (await guest.count()) { await guest.first().click(); }
await page.waitForSelector('.rr-hud, .rr-loop-bar', { timeout: 30000 });
await page.waitForTimeout(2500);
await sweep(page, 'run/island');

const home = page.locator('.rr-overlay button:has-text("Home")');
if (await home.count()) { await home.first().click(); await page.waitForTimeout(2500); }
await sweep(page, 'burrow');

for (const [label, sel] of [['shop', '[aria-label="Shop"]'], ['story', '[aria-label="Story"]']]) {
  const t = page.locator(sel);
  if (await t.count()) {
    await t.first().click(); await page.waitForTimeout(1800);
    await sweep(page, label);
    await page.keyboard.press('Escape'); await page.waitForTimeout(900);
  }
}

const seen = new Map();
for (const r of rows) {
  const k = `${r.where}|${r.cls}|${r.w}x${r.h}`;
  if (!seen.has(k)) seen.set(k, r);
}
const all = [...seen.values()].sort((a, b) => a.w * a.h - b.w * b.h);
console.log('WHERE'.padEnd(11), 'BOX'.padEnd(12), 'FLOOR?', ' CLASS');
for (const r of all) {
  const under = r.w < 180 || r.h < 195;
  console.log(r.where.padEnd(11), `${r.w}x${r.h}`.padEnd(12), (under ? 'UNDER ' : '  ok  '), r.cls);
}
console.log(`\n${all.length} panels; ${all.filter(r => r.w < 180 || r.h < 195).length} under the 180x195 floor`);
await b.close();
