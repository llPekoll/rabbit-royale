// The carrot pill on the wood board — in the real game, on both surfaces.
//   node tools/verify-plank.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:3010/';

/** The pill's own box and its plate's, so the board's height is a measurement. */
async function pill(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.rr-carrot-pill');
    const plate = document.querySelector('.rr-pill-plate');
    if (!el || !plate) return null;
    const r = el.getBoundingClientRect();
    const p = plate.getBoundingClientRect();
    const cs = getComputedStyle(plate);
    return {
      pill: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      plate: { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.width), h: Math.round(p.height) },
      slice: cs.borderImageSlice,
      source: cs.borderImageSource.slice(0, 60),
      chromeTop: getComputedStyle(document.documentElement).getPropertyValue('--rr-chrome-top'),
      centreOffset: Math.round((r.x + r.width / 2) - window.innerWidth / 2),
    };
  });
}

async function session(name, viewport, extra, steps) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...extra });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  const shot = async (tag) => { await page.screenshot({ path: `${OUT}/plank-${name}-${tag}.png` }); console.log(`[shot] ${name}-${tag}`); };
  try {
    await steps(page, shot);
  } catch (e) {
    console.log(`[${name}] FAILED: ${e.message}`);
    await shot('failure').catch(() => {});
  }
  // The 401 auth probe is expected noise; anything else is not.
  const real = logs.filter((l) => !/401|WebGL|GPU stall/i.test(l));
  console.log(`[${name}] console: ${real.length ? '\n  ' + real.slice(0, 8).join('\n  ') : 'clean'}`);
  await browser.close();
}

const run = async (page, shot) => {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Play as a guest")');
  await page.waitForSelector('.rr-hud', { timeout: 90_000 });
  await page.waitForTimeout(3000);
  console.log('[island]', JSON.stringify(await pill(page), null, 1));
  await shot('1-island');

  // Home: the burrow, where the pill sits over the loop bar.
  await page.click('.rr-overlay button:has-text("Home")');
  await page.waitForSelector('.rr-loop-bar', { timeout: 60_000 });
  await page.waitForTimeout(2500);
  console.log('[burrow]', JSON.stringify(await pill(page), null, 1));
  await shot('2-burrow');

  // Unfolded: the climb row under the figure, on a board of fixed height.
  const p = await page.locator('.rr-carrot-pill').first();
  if (await p.getAttribute('role') === 'button') {
    await p.click();
    await page.waitForTimeout(600);
    console.log('[unfolded]', JSON.stringify(await pill(page), null, 1));
    await shot('3-unfolded');
  } else {
    console.log('[unfolded] pill is not a button (unranked) — no climb to show');
  }
};

await session('desktop', { width: 1376, height: 768 }, {}, run);
await session('seeker', { width: 890, height: 400 }, { isMobile: true, hasTouch: true }, run);
