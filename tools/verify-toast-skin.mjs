// THE TOASTS' SKIN. The burrow's lines (the placing instruction, a refusal)
// used to arrive on the painted gold/red notice board; they take the island's
// dark caption pill now. This drives a fresh guest through the tutorial,
// banks the run, opens DEFEND, and reads what the toasts are actually wearing.
//   node tools/verify-toast-skin.mjs [outDir]
//
// CAVEAT, 2026-09-20: this does NOT reliably reach the burrow. The first
// island only ends on its chest, and driving a rabbit to a rim tile through
// the X lesson has not worked yet — it gives up with `toast-x-stuck.png` more
// often than not. The shot it DOES get every time is the island caption, which
// is the surface the toasts were made to match. What actually proves the
// change is test/toast-surface.test.ts, which runs the surface picker over the
// real classnames; this drive is here for the eyes, when it gets through.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1376, height: 768 }, deviceScaleFactor: 2 });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));

await p.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
await p.click('button:has-text("Play as a guest")');
// The HUD element mounts before the board boots and can sit hidden for a
// while; the Pixi app appearing is what actually says the island is up.
await p.waitForFunction(() => !!globalThis.__PIXI_APP__, null, { timeout: 120_000 });
// `.rr-hud` is an EMPTY header until the run's state lands, and an empty
// header has no box — Playwright calls that hidden and waits forever. The
// energy bar inside it is what says the run is really up.
await p.waitForSelector('.rr-energy', { timeout: 120_000 });

// The island caption, unchanged: the reference the toasts are being made to
// match. Shot before anything else, while "tap a tile" is still up.
await p.waitForTimeout(2500);
const cap = await p.locator('.rr-caption').first().boundingBox();
if (cap) await p.screenshot({ path: `${OUT}/toast-0-caption.png`, clip: { x: cap.x - 20, y: cap.y - 12, width: cap.width + 40, height: cap.height + 24 } });

/** Lit ring tiles, in page coordinates. */
const ring = () => p.evaluate(() => {
  const app = globalThis.__PIXI_APP__;
  if (!app) return [];
  const rect = app.canvas.getBoundingClientRect();
  const sx = rect.width / app.canvas.width, sy = rect.height / app.canvas.height;
  const out = [];
  const walk = (n) => {
    if (typeof n.label === 'string' && n.label.startsWith('tile-')
      && n.parent.children.some((c) => c !== n && c.visible && c.constructor?.name === 'Sprite' && c.tint === 0xffd700)) {
      const g = n.getGlobalPosition();
      out.push({ x: rect.left + g.x * sx, y: rect.top + g.y * sy });
    }
    n.children?.forEach(walk);
  };
  walk(app.stage);
  return out;
});

// PLAY THE TUTORIAL OUT. It has no door in the corner (page.tsx: the first
// run is one run with one ending), so the way to the burrow is its ending —
// the chest — and then the recap's own HOME.
//
// WALKING AT THE CHEST, not digging at random: the chests sit on the island's
// RIM, so a random walk wanders the middle and never ends the run (measured —
// 120 random digs, no chest). Each step takes the lit ring tile nearest the
// chest, which is what a player does once the compass has pointed.
const chestXY = () => p.evaluate(() => {
  const app = globalThis.__PIXI_APP__;
  if (!app) return null;
  const rect = app.canvas.getBoundingClientRect();
  const sx = rect.width / app.canvas.width, sy = rect.height / app.canvas.height;
  let hit = null;
  const walk = (n) => {
    // The chest's own beam carries the tile index in its label.
    if (typeof n.label === 'string' && /^chest(-arrow)?-\d+$/.test(n.label) && n.visible) {
      const g = n.getGlobalPosition();
      hit ??= { x: rect.left + g.x * sx, y: rect.top + g.y * sy };
    }
    n.children?.forEach(walk);
  };
  walk(app.stage);
  return hit;
});

const recapHome = p.locator('.rr-recap button:has-text("Home")');
let stuck = 0;
for (let i = 0; i < 150 && !(await recapHome.count()); i++) {
  const lit = await ring();
  if (!lit.length) { await p.waitForTimeout(1000); if (++stuck > 20) break; continue; }
  const goal = await chestXY();
  // Nearest the chest when the board shows one; otherwise push outward, since
  // that is where the chests are.
  const aim = goal
    ? lit.slice().sort((a, b) => Math.hypot(a.x - goal.x, a.y - goal.y) - Math.hypot(b.x - goal.x, b.y - goal.y))[0]
    : lit[Math.floor(Math.random() * lit.length)];
  const before = await p.evaluate(() => document.body.innerText);
  await p.mouse.click(aim.x, aim.y);
  await p.waitForTimeout(600);
  // Nothing moved: the X lesson wants the mark made before digging resumes.
  if (await p.evaluate(() => document.body.innerText) === before) {
    const mark = p.locator('.rr-mark-btn');
    if (await mark.count()) { await mark.click(); await p.waitForTimeout(400); }
    if (++stuck > 30) break;
  } else stuck = 0;
}
const ended = await recapHome.count() > 0;
console.log('[tutorial] recap reached:', ended);
if (!ended) { console.log('[tutorial] GAVE UP — no burrow shots this run'); await p.screenshot({ path: `${OUT}/toast-x-stuck.png` }); await b.close(); process.exit(1); }
await recapHome.first().click();
await p.waitForSelector('.rr-loop-bar', { timeout: 60_000 });
await p.waitForTimeout(2500);

// DEFEND — the slab that opens placing, and with it the instruction toast.
await p.click('.rr-loop-home');
await p.waitForSelector('.rr-toasts', { timeout: 20_000 });
await p.waitForTimeout(1200);

/** What each toast is wearing. */
const skin = () => p.evaluate(() => [...document.querySelectorAll('.rr-toast')].map((el) => {
  const cs = getComputedStyle(el);
  return {
    surface: (el.className.match(/wl-runtime-\w+/g) ?? []).join(' '),
    bg: cs.backgroundColor,
    art: (cs.borderImageSource.match(/[^/]+\.webp/) ?? ['none'])[0],
    radius: cs.borderTopLeftRadius,
    ink: cs.color,
    text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 56),
  };
}));
console.log('[placing]', JSON.stringify(await skin(), null, 1));

let box = await p.locator('.rr-toasts').boundingBox();
await p.screenshot({ path: `${OUT}/toast-1-placing.png`, clip: { x: box.x - 20, y: box.y - 14, width: box.width + 40, height: box.height + 28 } });
await p.screenshot({ path: `${OUT}/toast-2-burrow.png` });

// A REFUSAL: tap the board somewhere a trap cannot go, and see the red line.
const canvas = await p.locator('canvas').first().boundingBox();
for (const [dx, dy] of [[0.1, 0.9], [0.9, 0.1], [0.5, 0.05]]) {
  await p.mouse.click(canvas.x + canvas.width * dx, canvas.y + canvas.height * dy);
  await p.waitForTimeout(800);
  if (await p.locator('.rr-toast.refused').count()) break;
}
const refused = await p.locator('.rr-toast.refused').count();
console.log('[refusal] shown:', refused > 0);
if (refused) {
  console.log('[refusal]', JSON.stringify(await skin(), null, 1));
  box = await p.locator('.rr-toasts').boundingBox();
  await p.screenshot({ path: `${OUT}/toast-3-refused.png`, clip: { x: box.x - 20, y: box.y - 14, width: box.width + 40, height: box.height + 28 } });
}

const real = logs.filter((l) => !/401|WebGL|GPU stall/i.test(l));
console.log('console:', real.length ? real.slice(0, 5) : 'clean');
await b.close();
