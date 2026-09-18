// Drive the chest compass on a NORMAL island: the chests sit on the rim, so at
// the opening zoom they are all off-screen and the edge chevrons are the only
// thing saying which way the island's goal lies.
//
// A guest's first island is the tutorial, which has one hand-placed chest and
// its own arrow (`ChestPointer`) and deliberately NO compass — so this goes
// Home first to bank the run, then digs again to land on a generated island.
//
// Usage: node tools/verify-chest-compass.mjs <out-dir>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1376, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// Playwright's own click, not a coordinate click: it waits for the element to
// be stable and hittable. The buttons here animate in, and a click computed
// from a bounding box lands where the button WAS.
const click = (sel) => page.click(sel, { timeout: 60_000 });

await page.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
await click('button:has-text("Play as a guest")');
await page.waitForSelector('.rr-hud', { timeout: 90_000 });
console.log('tutorial island up');

// Bank the tutorial run and go again — the second crossing is a real island.
await click('.rr-back-btn');
await page.waitForSelector('.rr-loop-bar', { timeout: 120_000 });
// The season board opens over the burrow on the way in and swallows the click
// that would otherwise land on DIG. Shut it if it is there.
const close = page.locator('.rr-lb-close');
if (await close.count()) await close.first().click({ force: true }).catch(() => {});
await page.waitForTimeout(500);
await click('.rr-loop-dig');
await page.waitForSelector('.rr-hud', { timeout: 120_000 });
console.log('normal island up');

/**
 * Read the compass off the live stage.
 *
 * The chevrons are the ARROW_DOWN sprite inside a counter-scaled layer at
 * zIndex 10000, so they are found by walking for sprites whose texture label
 * matches and which are visible — then reported in canvas pixels so their
 * distance to the frame edge can be checked.
 */
const scan = () => page.evaluate(() => {
  const app = globalThis.__PIXI_APP__;
  if (!app) return null;
  const W = app.canvas.width, H = app.canvas.height;
  // The compass layer, found by its OWN depth (20_000).
  //
  // 10_000 was not enough to identify it: `CloudField` sits at exactly that
  // number, so the first search found the clouds and measured eight cloud
  // sprites for eight chevrons — the same count, which is what made the wrong
  // reading look plausible for three runs. Matched on the compass's own depth,
  // and only its direct children are read.
  let layer = null;
  const find = (n) => {
    if (layer) return;
    if (n.zIndex === 20_000) { layer = n; return; }
    n.children?.forEach(find);
  };
  find(app.stage);
  const found = (layer?.children ?? [])
    .filter((c) => c.visible && c.constructor?.name === 'Sprite')
    .map((c) => {
      const g = c.getGlobalPosition();
      return {
        x: Math.round(g.x), y: Math.round(g.y),
        tint: '#' + (c.tint >>> 0).toString(16).padStart(6, '0'),
        rot: +(c.rotation ?? 0).toFixed(2),
      };
    });
  return { W, H, found, layer: !!layer };
});

// The board boots after the HUD mounts; poll rather than trusting a delay.
let info = null;
for (let i = 0; i < 40; i++) {
  info = await scan();
  if (info?.found?.length) break;
  await page.waitForTimeout(500);
}

const hud = await page.locator('.rr-hud').innerText().catch(() => '');
console.log('HUD:', hud.replace(/\n/g, ' | ').slice(0, 160));
console.log('canvas:', info?.W, 'x', info?.H);
console.log('chevrons:', info?.found?.length ?? 0);
for (const f of info?.found ?? []) {
  const edge = Math.min(f.x, f.y, info.W - f.x, info.H - f.y);
  console.log(`  at ${f.x},${f.y} tint ${f.tint} rot ${f.rot} — ${edge}px from the nearest edge`);
}
await page.screenshot({ path: `${OUT}/compass.png` });

// Pan the board and confirm the chevrons follow the camera rather than sitting
// where they were first drawn — the one failure a static screenshot cannot see.
await page.mouse.move(688, 384);
await page.mouse.down();
await page.mouse.move(1050, 560, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(800);
const after = await scan();
console.log('after pan, chevrons:', after?.found?.length ?? 0);
for (const f of after?.found ?? []) console.log(`  at ${f.x},${f.y} rot ${f.rot}`);
await page.screenshot({ path: `${OUT}/compass-panned.png` });

console.log('ERRORS:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
