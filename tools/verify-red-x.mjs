// Drive the red X on a fresh guest's first island: the energy bar replaces the
// hearts, the X button arms, the ring turns red, and one mark is answered.
// Usage: node tools/verify-red-x.mjs <out-dir> [phone]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'verify-out';
const PHONE = process.argv[3] === 'phone';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage(PHONE
  ? { viewport: { width: 890, height: 400 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1376, height: 768 }, deviceScaleFactor: 1 });
const tag = PHONE ? 'phone' : 'desk';
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const press = (x, y) => (PHONE ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));

await page.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
await press(...await page.locator('button:has-text("Play as a guest")').boundingBox().then((b) => [b.x + b.width / 2, b.y + b.height / 2]));
await page.waitForSelector('.rr-hud', { timeout: 90_000 });

const scan = () => page.evaluate(() => {
  const app = globalThis.__PIXI_APP__;
  if (!app) return null;
  const rect = app.canvas.getBoundingClientRect();
  const sx = rect.width / app.canvas.width, sy = rect.height / app.canvas.height;
  const gold = [], red = [], texts = []; let marks = 0;
  const walk = (n) => {
    if (typeof n.label === 'string' && n.label.startsWith('tile-')) {
      const ring = n.parent.children.find((c) => c !== n && c.visible && c.constructor?.name === 'Sprite' && (c.tint === 0xffd700 || c.tint === 0xff5a4a));
      if (ring) {
        const g = n.getGlobalPosition();
        (ring.tint === 0xffd700 ? gold : red).push({ label: n.label, x: rect.left + g.x * sx, y: rect.top + g.y * sy });
      }
    }
    if (n.constructor?.name === 'BitmapText' && n.visible && n.tint !== 0) {
      const g = n.getGlobalPosition();
      texts.push({ t: n.text, x: Math.round(rect.left + g.x * sx), y: Math.round(rect.top + g.y * sy) });
    }
    n.children?.forEach(walk);
  };
  walk(app.stage);
  return { gold, red, texts };
});
const hud = () => page.evaluate(() => ({
  energy: document.querySelector('.rr-energy-value')?.textContent ?? null,
  bar: !!document.querySelector('.rr-hud .rr-energy'),
  fill: [...(document.querySelector('.rr-energy-fill')?.classList ?? [])].find((c) => c.startsWith('tone-')) ?? null,
  inPlate: !!document.querySelector('.rr-hud-plate .rr-energy'),
  hearts: !!document.querySelector('.rr-hud .rr-hearts'),
  button: document.querySelector('.rr-mark-btn')?.getBoundingClientRect().toJSON() ?? null,
  armed: document.querySelector('.rr-mark-btn')?.getAttribute('aria-pressed'),
  hint: document.querySelector('.rr-mark-hint')?.textContent ?? null,
  carrots: document.querySelector('.rr-carrot-pill, [class*="carrot-pill"]')?.textContent ?? null,
}));
const nums = (s) => s.texts.filter((t) => /^\d$/.test(t.t)).map((t) => `${t.t}@${t.x},${t.y}`).join(' ');

let s = await scan();
for (let i = 0; i < 40 && (!s || s.gold.length + s.red.length === 0); i++) { await page.waitForTimeout(1000); s = await scan(); }
console.log(`[${tag}] spawn: gold ring ${s.gold.length}, red ring ${s.red.length}, numbers: ${nums(s)}`);
console.log(`[${tag}] hud:`, JSON.stringify(await hud()));
await page.screenshot({ path: `${OUT}/x-${tag}-1-spawn.png` });

// Dig a few tiles first, so the bar is off its ceiling and a gain can show.
// Towards the "1": it is the tile that touches the taught bomb. Only ground
// the board calls safe (gold ring) is stepped on.
const toggle = async () => { const b = (await hud()).button; await press(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(350); };
const caption = () => page.evaluate(() => document.querySelector('.rr-caption:not(.rr-caption-cost) [role="status"]')?.textContent ?? null);
const seen = new Set();
for (let step = 0; step < 9; step++) {
  s = await scan();
  const ones = s.texts.filter((t) => t.t === '1');
  const fresh = s.gold.filter((l) => !seen.has(l.label));
  if (!fresh.length || !ones.length) break;
  const target = fresh.map((l) => ({ ...l, d: Math.min(...ones.map((o) => Math.hypot(o.x - l.x, o.y - l.y))) })).sort((a, b) => a.d - b.d)[0];
  seen.add(target.label);
  const e0 = (await hud()).energy;
  await press(target.x, target.y);
  await page.waitForTimeout(1300);
  console.log(`[${tag}] step ${step + 1} onto ${target.label}: energy ${e0} -> ${(await hud()).energy} | caption: ${await caption()}`);
  // The ring is gold while moving; only X mode shows what can be marked. So
  // arm it to look, and leave it armed if there is something to mark.
  await toggle();
  if ((await scan()).red.length) break;
  await toggle();
}
s = await scan();
console.log(`[${tag}] now: gold ${s.gold.length}, red ${s.red.length} (red only shows in X mode)`);

// Armed by the loop above when something is markable; arm it anyway if not.
if ((await hud()).armed !== 'true') await toggle();
const armed = await scan();
console.log(`[${tag}] armed:`, JSON.stringify({ ...(await hud()), button: undefined }), `| ring now gold ${armed.gold.length}, red ${armed.red.length}`);
await page.screenshot({ path: `${OUT}/x-${tag}-2-armed.png` });

// Mark one red tile and read the answer off the bar.
const before = (await hud()).energy;
const pick = armed.red[0];

if (pick) console.log(`[${tag}] pick`, JSON.stringify(pick), 'element there:', await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName}.${e.className}` : null; }, [pick.x, pick.y]));
page.on('console', (m) => { if (/flag|move/i.test(m.text())) console.log('  [browser]', m.text()); });
if (pick) {
  await press(pick.x, pick.y);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/x-${tag}-3-answer.png` });
  await page.waitForTimeout(1200);
  const after = await hud();
  const s2 = await scan();
  console.log(`[${tag}] marked ${pick.label}: energy ${before} -> ${after.energy}, armed=${after.armed}, numbers: ${nums(s2)}`);
  console.log(`[${tag}] caption after the X: ${await caption()}`);
  console.log(`[${tag}] verdict: ${Number(after.energy) < Number(before) ? 'WRONG X (energy paid, number written)' : 'RIGHT X (bomb marked)'}; ring back to gold ${s2.gold.length} / red ${s2.red.length}`);
  await page.screenshot({ path: `${OUT}/x-${tag}-4-after.png` });
} else console.log(`[${tag}] no red tile to mark`);
// Then keep digging known-safe ground: every fresh tile should cost a point.
for (let step = 0; step < 6; step++) {
  const now = await scan();
  const fresh = now.gold.filter((l) => !seen.has(l.label));
  if (!fresh.length) break;
  seen.add(fresh[0].label);
  const e0 = (await hud()).energy;
  await press(fresh[0].x, fresh[0].y);
  await page.waitForTimeout(1300);
  console.log(`[${tag}] dig ${fresh[0].label}: energy ${e0} -> ${(await hud()).energy}`);
}
await page.screenshot({ path: `${OUT}/x-${tag}-5-dug.png` });
console.log(`[${tag}] errors:`, errors.join(' | ') || 'none');
await browser.close();
