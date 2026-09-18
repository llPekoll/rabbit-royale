// Drive a fresh guest's first island until a dig opens a ZONE, and watch the
// ripple: the numbers arriving in order of distance, and the ground rising and
// falling under the front.
//
// Measures the terrain BLOCKS, not the tiles. A cell's grass, cliff face and
// veil are the block's children (`IsoIslandView.mountVeil`), so the block is
// what has to move — lifting the tile container alone would raise the numbers
// off ground that stayed put, which is exactly the bug this drive would catch.
//
// Usage: node tools/verify-cascade-ripple.mjs <out-dir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1376, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
const guest = await page.locator('button:has-text("Play as a guest")').boundingBox();
await page.mouse.click(guest.x + guest.width / 2, guest.y + guest.height / 2);
await page.waitForSelector('.rr-hud', { timeout: 90_000 });

/**
 * Every land cell's vertical offset from where it rests, plus the numbers on
 * the board.
 *
 * A block is found by its veil: the fog sprite is labelled `tile-<index>` and
 * lives inside the block, so the veil's parent IS the block. Their resting y
 * is latched on the first scan, while the board is still.
 */
const scan = () => page.evaluate(() => {
  const app = globalThis.__PIXI_APP__;
  if (!app) return null;
  // The LID's own y, and — separately — the y of the terrain block holding it.
  // The ripple must move the first and never the second: lifting the block
  // heaves the grass and the cliff face with it, which is the bug this drive
  // exists to catch.
  const veils = new Map();
  const blocks = new Map();
  let numbers = 0;
  const walk = (n) => {
    if (typeof n.label === 'string' && n.label.startsWith('tile-') && n.parent) {
      veils.set(n.label, n.y);
      blocks.set(n.label, n.parent.y);
    }
    if (n.constructor?.name === 'BitmapText' && n.visible && /^\d$/.test(n.text ?? '')) numbers++;
    n.children?.forEach(walk);
  };
  walk(app.stage);
  return { veils: [...veils], blocks: [...blocks], numbers };
});

// Wait for the BOARD, not just the app: the HUD mounts well before the tiles
// exist, and a scan that lands in between finds an app with no cells and
// reports a flat board that simply had not been dealt yet.
let s = await scan();
for (let i = 0; i < 60 && (!s || s.veils.length === 0); i++) { await page.waitForTimeout(1000); s = await scan(); }
if (!s || s.veils.length === 0) { console.log('board never came up'); await browser.close(); process.exit(1); }
const rest = new Map(s.veils);
const restBlocks = new Map(s.blocks);
console.log(`board up: ${rest.size} cells, ${s.numbers} numbers showing`);

// The lit ring, in page coords — the tiles the board will actually accept.
const ring = () => page.evaluate(() => {
  const app = globalThis.__PIXI_APP__;
  const rect = app.canvas.getBoundingClientRect();
  const sx = rect.width / app.canvas.width, sy = rect.height / app.canvas.height;
  const out = [];
  const walk = (n) => {
    if (typeof n.label === 'string' && n.label.startsWith('tile-')) {
      const lit = n.parent.children.find((c) => c !== n && c.visible && c.constructor?.name === 'Sprite' && c.tint === 0xffd700);
      if (lit) {
        const g = n.getGlobalPosition();
        out.push({ label: n.label, x: rect.left + g.x * sx, y: rect.top + g.y * sy });
      }
    }
    n.children?.forEach(walk);
  };
  walk(app.stage);
  return out;
});

/** The biggest lift any cell is showing right now, and how many are moving. */
const motion = async () => {
  const now = await scan();
  if (!now) return { moving: 0, peak: 0, numbers: 0, ground: 0 };
  let moving = 0, peak = 0, ground = 0;
  for (const [label, y] of now.veils) {
    const d = Math.abs(y - (rest.get(label) ?? y));
    if (d > 0.01) { moving++; peak = Math.max(peak, d); }
  }
  // Any terrain block that shifted at all is a regression: the landscape must
  // stay put while the lids come off.
  for (const [label, y] of now.blocks) {
    if (Math.abs(y - (restBlocks.get(label) ?? y)) > 0.01) ground++;
  }
  return { moving, peak, numbers: now.numbers, ground };
};

// Dig until a cascade fires. A zero is what opens a zone, and which tile is a
// zero is not knowable from here — so this walks the ring and watches the
// number count jump by more than the one tile it just dug.
const dug = new Set();
let best = { moving: 0, peak: 0 };
let groundMoved = 0;
let zoneAt = -1;
for (let step = 0; step < 14; step++) {
  const lit = (await ring()).filter((t) => !dug.has(t.label));
  if (lit.length === 0) break;
  const pick = lit[0];
  dug.add(pick.label);
  const before = (await motion()).numbers;
  await page.mouse.click(pick.x, pick.y);

  // Sample fast across the dig: the whole ripple is ~0.6s of spread plus a
  // 0.45s bob, so 40ms steps see the front travel.
  for (let i = 0; i < 30; i++) {
    const m = await motion();
    if (m.moving > best.moving) best = m;
    groundMoved = Math.max(groundMoved, m.ground);
    // A zone, not a single tile: the dig writes one number, so a jump of
    // three or more says the cascade ran. Recorded per dig rather than once,
    // because the first digs on a board often open nothing at all.
    if (m.numbers - before >= 3 && zoneAt < 0) zoneAt = step;
    if (m.moving > 0 && zoneAt < 0) zoneAt = step;
    await page.waitForTimeout(40);
  }
  if (best.moving > 0) break;
}

await page.waitForTimeout(2000);
const settled = await motion();
const after = await scan();
let drift = 0;
for (const [label, y] of after.veils) {
  if (Math.abs(y - (rest.get(label) ?? y)) > 0.001) drift++;
}

console.log(`zone opened on dig #${zoneAt}`);
console.log(`peak: ${best.moving} LIDS moving, max lift ${best.peak.toFixed(2)}px`);
console.log(`terrain blocks that moved: ${groundMoved}  (must be 0 — the ground stays put)`);
console.log(`board has ${rest.size} cells; a zone is bounded to ~40, so a peak near ${rest.size} means the whole island rippled`);
console.log(`after settle: ${settled.moving} moving, drift ${drift} cells`);
console.log('errors:', errors.filter((e) => !/401/.test(e)).slice(0, 3));
await page.screenshot({ path: `${OUT}/cascade-ripple.png` });
await browser.close();
