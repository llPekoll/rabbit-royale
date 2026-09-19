// The badge's 9-slice and the close button's sprite, shot from Storybook.
//   node tools/verify-leaf-badge.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:6007/iframe.html?id=chrome-leafbadge--';
const STORIES = ['counts', 'sizes', 'close-states', 'on-chrome'];

const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 900, height: 620 }, deviceScaleFactor: 2 })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

for (const id of STORIES) {
  await page.goto(BASE + id, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const info = await page.evaluate(async () => {
    const out = {};
    const bg = document.querySelector('.rr-leaf-badge');
    if (bg) {
      const cs = getComputedStyle(bg), r = bg.getBoundingClientRect();
      out.badge = { w: Math.round(r.width), h: Math.round(r.height), slice: cs.borderImageSlice };
      const src = cs.borderImageSource.match(/url\("?([^")]+)"?\)/)?.[1];
      if (src) { const res = await fetch(src); out.badgeAsset = res.status; }
    }
    const cl = document.querySelector('.rr-leaf-close');
    if (cl) {
      const cs = getComputedStyle(cl), r = cl.getBoundingClientRect();
      out.close = { w: Math.round(r.width), h: Math.round(r.height) };
      const src = cs.backgroundImage.match(/url\("?([^")]+)"?\)/)?.[1];
      if (src) { const res = await fetch(src); out.closeAsset = res.status; }
    }
    return out;
  });
  console.log(`[${id}]`, JSON.stringify(info));
  await page.screenshot({ path: `${OUT}/badge-${id}.png`, fullPage: true });
}
console.log(errs.length ? `ERRORS:\n${errs.join('\n')}` : 'no console errors');
await b.close();
