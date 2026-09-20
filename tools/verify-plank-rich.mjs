// The board carrying a realistic figure, a rank chip, and the unfolded climb.
//   node tools/verify-plank-rich.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1376, height: 768 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));

await page.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
await page.click('button:has-text("Play as a guest")');
await page.waitForSelector('.rr-hud', { timeout: 90_000 });
await page.waitForTimeout(2500);
await page.click('.rr-overlay button:has-text("Home")');
await page.waitForSelector('.rr-loop-bar', { timeout: 60_000 });
await page.waitForTimeout(2000);

// Claim the quest so the pill holds a real figure, not "0".
const claim = page.locator('button:has-text("CLAIM")').first();
if (await claim.count()) {
  await claim.click();
  await page.waitForTimeout(2500);
  console.log('[claimed]');
}

const shot = async (tag) => {
  const el = page.locator('.rr-carrot-pill').first();
  const b = await el.boundingBox();
  // The board plus air around it, so the centring can be judged against it.
  await page.screenshot({
    path: `${OUT}/rich-${tag}.png`,
    clip: { x: b.x - 70, y: b.y - 14, width: b.width + 140, height: b.height + 28 },
  });
  console.log(`[shot] ${tag}`);
};

const geom = () => page.evaluate(() => {
  const plate = document.querySelector('.rr-pill-plate');
  const p = plate.getBoundingClientRect();
  // Where the visible ink actually sits, versus the board's own midpoint.
  const kids = [...plate.querySelectorAll('span, img')]
    .map((k) => k.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  const left = Math.min(...kids.map((r) => r.left));
  const right = Math.max(...kids.map((r) => r.right));
  return {
    boardMid: Math.round(p.x + p.width / 2),
    inkMid: Math.round((left + right) / 2),
    drift: Math.round((left + right) / 2 - (p.x + p.width / 2)),
    boardH: Math.round(p.height),
    text: plate.innerText.replace(/\s+/g, ' ').trim(),
  };
});

console.log('[folded]', JSON.stringify(await geom()));
await shot('1-folded');

const pill = page.locator('.rr-carrot-pill').first();
if (await pill.getAttribute('role') === 'button') {
  await pill.click();
  await page.waitForTimeout(700);
  console.log('[unfolded]', JSON.stringify(await geom()));
  await shot('2-unfolded');
} else {
  console.log('[unfolded] still unranked — no climb row');
}

const real = logs.filter((l) => !/401|WebGL|GPU stall/i.test(l));
console.log('console:', real.length ? real.slice(0, 6) : 'clean');
await browser.close();
