// Drive the real game through the loop bar and capture what it shows.
//   node tools/verify-loop-bar.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:3010/';

async function session(name, viewport, steps) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  const shot = async (tag) => { await page.screenshot({ path: `${OUT}/${name}-${tag}.png` }); console.log(`[shot] ${name}-${tag}`); };
  try {
    await steps(page, shot);
  } catch (e) {
    console.log(`[${name}] FAILED: ${e.message}`);
    await shot('failure').catch(() => {});
  }
  console.log(`[${name}] console: ${logs.length ? '\n  ' + logs.slice(0, 12).join('\n  ') : 'clean'}`);
  await browser.close();
}

const text = async (page, sel) => (await page.locator(sel).first().innerText().catch(() => '<none>')).replace(/\s+/g, ' ').trim();

await session('desktop', { width: 1376, height: 768 }, async (page, shot) => {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Play as a guest")');
  // A fresh guest is crossed to the first island by itself.
  await page.waitForSelector('.rr-hud', { timeout: 90_000 });
  await page.waitForTimeout(2500);
  console.log('[island] home button:', await text(page, '.rr-overlay button:has-text("Home")'));
  await shot('1-first-island');
  // Step around the ring: one of its tiles carries the taught "1", and a
  // rabbit standing on it should lift the number above its head.
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowLeft']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(700);
  }
  await shot('1b-island-after-steps');

  // Home: the run banks (runsPlayed -> 1) and the burrow shows the loop bar.
  await page.click('.rr-overlay button:has-text("Home")');
  await page.waitForSelector('.rr-loop-bar', { timeout: 60_000 });
  await page.waitForTimeout(2500);
  console.log('[burrow] DIG slab:', await text(page, '.rr-loop-dig'));
  console.log('[burrow] HOME slab:', await text(page, '.rr-loop-home'));
  console.log('[burrow] RAID slab:', await text(page, '.rr-loop-raid'));
  console.log('[burrow] top-right:', (await page.locator('.rr-topbar [aria-label="Shop"], .rr-topbar [aria-label="Story"]').count()), 'icon buttons');
  console.log('[burrow] column cards:', await text(page, '.rr-burrow'));
  console.log('[burrow] HubTabs left?', await page.locator('.rr-hub-row').count(), '| Go farm?', await page.locator('button:has-text("Go farm")').count());
  await shot('2-burrow-loop-bar');

  // HOME -> placing: the bar slides away, BACK takes the floor.
  await page.click('.rr-loop-home');
  await page.waitForTimeout(900);
  console.log('[placing] bar away?', await page.locator('.rr-loop-bar.rr-loop-away').count(), '| back slab:', await text(page, '.rr-farm-btn'));
  await shot('3-home-placing');
  await page.click('.rr-farm-btn:has-text("Back")');
  await page.waitForTimeout(700);

  // RAID -> the target list.
  await page.click('.rr-loop-raid');
  await page.waitForTimeout(1200);
  await shot('4-raid-targets');
  console.log('[raid] dialogs:', await page.locator('[role="dialog"]').count(), '| text:', (await text(page, '[role="dialog"]')).slice(0, 160));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  const closeBtn = page.locator('[role="dialog"] button[aria-label="Close"]');
  if (await closeBtn.count()) await closeBtn.first().click();
  await page.waitForTimeout(500);

  // NEXT strip / quest card and the shop icon badge.
  console.log('[next] first card:', (await text(page, '.rr-burrow')).slice(0, 120));
  await page.click('.rr-topbar [aria-label="Shop"]');
  await page.waitForTimeout(800);
  console.log('[shop] dialogs:', await page.locator('[role="dialog"]').count());
  await shot('5-shop-from-top');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const x = page.locator('button.rr-shop-x');
  if (await x.count()) await x.first().click();
  await page.waitForTimeout(400);

  // DIG with energy: crosses. 60 -> 35 after the first island, 35 -> 10 now.
  await page.click('.rr-loop-dig');
  await page.waitForSelector('.rr-overlay .rr-hud', { timeout: 60_000 });
  await page.waitForTimeout(1500);
  console.log('[dig] cost note:', await text(page, '.rr-caption-cost'));
  await shot('6-dig-second-island');
  await page.click('.rr-overlay button:has-text("Home")');
  await page.waitForSelector('.rr-loop-bar', { timeout: 60_000 });
  await page.waitForTimeout(2000);
  console.log('[burrow] DIG slab now:', await text(page, '.rr-loop-dig'));

  // DIG with 10 energy: the popup, not a crossing.
  await page.click('.rr-loop-dig');
  await page.waitForTimeout(1200);
  console.log('[empty] energy dialog:', await page.locator('[aria-label="Out of energy"]').count(), '| still burrow?', await page.locator('.rr-loop-bar').count());
  await shot('7-dig-empty-popup');
});

await session('phone', { width: 390, height: 844 }, async (page, shot) => {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Play as a guest")');
  await page.waitForSelector('.rr-hud', { timeout: 90_000 });
  await page.waitForTimeout(1500);
  await page.click('.rr-overlay button:has-text("Home")');
  await page.waitForSelector('.rr-loop-bar', { timeout: 60_000 });
  await page.waitForTimeout(2500);
  const bar = await page.locator('.rr-loop-bar').boundingBox();
  const slabs = await page.locator('.rr-loop-slab').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; }));
  console.log('[phone] bar box:', bar, '| slabs:', JSON.stringify(slabs));
  await shot('8-burrow-portrait');
});
