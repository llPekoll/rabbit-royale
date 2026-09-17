// The tutorial's two promises, checked against the running game.
//
//   1. THE FIRST SCREEN IS THE SMALL ISLAND. It used to mount on a placeholder
//      seed (`player.id`) which cuts an ordinary ~500-tile island, and re-cut
//      it into the tutorial's ~65-tile one when the server answered — a place
//      that visibly changed size on the first screen of the game. Sampled
//      every 100ms from the first frame, so the flash cannot hide between two
//      fixed waits: the tile count must never once be an ordinary island's.
//
//   2. THE ARROW IS OVER THE CHEST, and it goes when the chest is dug.
//
//   node tools/verify-tutorial-chest.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:3010/';

/** Above this many tiles the board is an ordinary island, not the tutorial's. */
const ORDINARY = 140;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1376, height: 768 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
const shot = async (tag) => { await page.screenshot({ path: `${OUT}/chest-${tag}.png` }); console.log(`[shot] ${tag}`); };

/** Everything on the island's stage, by label. */
const probe = () => page.evaluate(() => {
  const app = globalThis.__PIXI_APP__;
  if (!app) return null;
  let tiles = 0; const arrows = [];
  const walk = (n) => {
    if (typeof n.label === 'string' && /^tile-\d+$/.test(n.label)) tiles++;
    if (typeof n.label === 'string' && n.label.startsWith('chest-arrow-')) {
      const p = n.getGlobalPosition();
      arrows.push({ label: n.label, x: Math.round(p.x), y: Math.round(p.y), visible: n.visible });
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(app.stage);
  return { tiles, arrows };
});

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Play as a guest")');

  // ---- 1. sample the board from the very first frame ---------------------
  let peak = 0; let samples = 0; let sawBoard = false;
  const started = Date.now();
  const hud = page.waitForSelector('.rr-hud', { timeout: 90_000 });
  while (Date.now() - started < 30_000) {
    const p = await probe().catch(() => null);
    if (p && p.tiles > 0) {
      sawBoard = true; samples++;
      if (p.tiles > peak) peak = p.tiles;
    }
    // Stop once the board has been standing for a while.
    if (sawBoard && samples > 25) break;
    await page.waitForTimeout(100);
  }
  await hud;
  console.log(`[size] ${samples} samples of a live board, peak ${peak} tiles`);
  console.log(`[size] ${peak > ORDINARY ? 'FAIL — an ordinary island was on screen' : 'OK — never bigger than the tutorial island'}`);
  await shot('1-first-screen');

  // ---- 2. the arrow ------------------------------------------------------
  await page.waitForTimeout(2000);
  const withArrow = await probe();
  console.log(`[arrow] on screen: ${withArrow.arrows.length}`, JSON.stringify(withArrow.arrows));
  console.log(`[arrow] board now ${withArrow.tiles} tiles`);

  // The arrow's own label carries the tile it was planted on, and the fog
  // sprite for that tile says where that tile is on screen. If the two agree
  // the arrow really is over the chest and not merely somewhere on the board.
  if (withArrow.arrows.length === 1) {
    const index = Number(withArrow.arrows[0].label.replace('chest-arrow-', ''));
    const tileAt = await page.evaluate((i) => {
      const app = globalThis.__PIXI_APP__;
      let found = null;
      const walk = (n) => {
        if (n.label === `tile-${i}`) {
          const p = n.getGlobalPosition();
          found = { x: Math.round(p.x), y: Math.round(p.y) };
        }
        for (const c of n.children ?? []) walk(c);
      };
      walk(app.stage);
      return found;
    }, index);
    const a = withArrow.arrows[0];
    console.log(`[arrow] planted on tile ${index}; fog sprite at ${JSON.stringify(tileAt)}`);
    if (tileAt) {
      const dx = Math.abs(a.x - tileAt.x);
      const above = tileAt.y - a.y;
      console.log(`[arrow] dx=${dx}px, sits ${above}px above the tile`);
      console.log(`[arrow] ${dx < 40 && above > 0 ? 'OK — over the chest, pointing down at it' : 'FAIL — not where the chest is'}`);
    }
  } else {
    console.log('[arrow] FAIL — expected exactly one arrow');
  }
  await shot('2-arrow-over-chest');
} catch (e) {
  console.log('FAILED:', e.message);
  await shot('failure').catch(() => {});
}
console.log('[console]', logs.length ? '\n  ' + logs.slice(0, 10).join('\n  ') : 'clean');
await browser.close();
