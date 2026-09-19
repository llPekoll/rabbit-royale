// The leaf frame's 9-slice, shot from Storybook and measured in the DOM.
//   node tools/verify-leaf-frame.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:6007/iframe.html?id=chrome-leafframe--';

const STORIES = ['shapes', 'corners', 'on-busy-ground', 'against-the-kit', 'too-small'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

for (const id of STORIES) {
  await page.goto(BASE + id, { waitUntil: 'networkidle' });
  await page.waitForSelector('.rr-leaf-frame', { timeout: 5000 });
  // The art must actually be decoded — a 404 here is a silently frameless box.
  const ok = await page.evaluate(async () => {
    const el = document.querySelector('.rr-leaf-frame');
    const src = getComputedStyle(el).borderImageSource.match(/url\("?([^")]+)"?\)/)?.[1];
    const r = await fetch(src);
    const bmp = await createImageBitmap(await r.blob());
    return { status: r.status, w: bmp.width, h: bmp.height, slice: getComputedStyle(el).borderImageSlice };
  });
  console.log(`[${id}]`, JSON.stringify(ok));
  await page.screenshot({ path: `${OUT}/leaf-${id}.png`, fullPage: true });
  console.log(`[shot] ${id}`);
}

console.log(errs.length ? `ERRORS:\n${errs.join('\n')}` : 'no console errors');
await browser.close();
