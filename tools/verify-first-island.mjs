// A fresh guest's first island: are the numbers readable, and does the one
// under the rabbit lift?  node tools/verify-first-island.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1376, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
await page.click('button:has-text("Play as a guest")');
await page.waitForSelector('.rr-hud', { timeout: 90_000 });

const scan = () => page.evaluate(() => {
  const app = globalThis.__PIXI_APP__;
  if (!app) return null;
  const rect = app.canvas.getBoundingClientRect();
  const sx = rect.width / app.canvas.width, sy = rect.height / app.canvas.height;
  const lit = [], texts = [];
  const walk = (n) => {
    if (typeof n.label === 'string' && n.label.startsWith('tile-')) {
      if (n.parent.children.some((c) => c !== n && c.visible && c.constructor?.name === 'Sprite' && c.tint === 0xffd700)) {
        const g = n.getGlobalPosition();
        lit.push({ label: n.label, x: rect.left + g.x * sx, y: rect.top + g.y * sy });
      }
    }
    if (n.constructor?.name === 'BitmapText' && n.visible && n.tint !== 0) {
      const g = n.getGlobalPosition();
      texts.push({ t: n.text, x: Math.round(rect.left + g.x * sx), y: Math.round(rect.top + g.y * sy) });
    }
    n.children?.forEach(walk);
  };
  walk(app.stage);
  return { lit, texts, costNote: !!document.querySelector('.rr-caption-cost') };
});

let s = await scan();
for (let i = 0; i < 40 && (!s || s.lit.length === 0); i++) { await page.waitForTimeout(1000); s = await scan(); }
console.log('[spawn] lit ring tiles:', s.lit.length, '| visible numbers:', s.texts.filter((t) => /^\d$/.test(t.t)).map((t) => `${t.t}@${t.x},${t.y}`).join(' '), '| cost note on first island:', s.costNote);
await page.screenshot({ path: `${OUT}/first-1-spawn.png` });

// The ring tile nearest a visible "1".
const ones = s.texts.filter((t) => t.t === '1');
const target = s.lit.map((l) => ({ ...l, d: Math.min(...ones.map((o) => Math.hypot(o.x - l.x, o.y - l.y))) })).sort((a, b) => a.d - b.d)[0];
console.log('[spawn] nearest lit tile to a "1":', target && `${target.label} (${Math.round(target.d)}px away)`);
if (target) {
  await page.mouse.click(target.x, target.y);
  await page.waitForTimeout(1300);
  const after = await scan();
  console.log('[stood] numbers now:', after.texts.filter((t) => /^\d$/.test(t.t)).map((t) => `${t.t}@${t.x},${t.y}`).join(' '));
  await page.screenshot({ path: `${OUT}/first-2-on-the-one.png` });
}
console.log('[errors]', errors.join(' | ') || 'none');
await browser.close();
