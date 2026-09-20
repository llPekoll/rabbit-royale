// The energy dial on the DIG slab, in the real burrow, at both sizes.
//   node tools/verify-energy-dial.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
for (const [name, vp, extra] of [
  ['desktop', { width: 1376, height: 768 }, {}],
  ['seeker', { width: 890, height: 400 }, { isMobile: true, hasTouch: true }],
]) {
  const p = await b.newPage({ viewport: vp, deviceScaleFactor: 2, ...extra });
  const logs = [];
  p.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
  p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
  await p.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
  await p.click('button:has-text("Play as a guest")');
  await p.waitForSelector('.rr-hud', { timeout: 90_000 });
  await p.waitForTimeout(2000);
  await p.click('.rr-overlay button:has-text("Home")');
  await p.waitForSelector('.rr-loop-bar', { timeout: 60_000 });
  await p.waitForTimeout(2000);

  const g = await p.evaluate(() => {
    const ring = document.querySelector('.rr-loop-dial');
    const slab = document.querySelector('.rr-loop-dig');
    if (!ring) return { missing: true };
    const r = ring.getBoundingClientRect();
    const s = slab.getBoundingClientRect();
    const layers = [...ring.children].map((c) => {
      const cs = getComputedStyle(c);
      return {
        img: (cs.backgroundImage.match(/[^/]+\.webp/) ?? ['none'])[0],
        masked: cs.maskImage !== 'none' || cs.webkitMaskImage !== 'none',
      };
    });
    return {
      slab: { w: Math.round(s.width), h: Math.round(s.height) },
      ring: { w: Math.round(r.width), h: Math.round(r.height) },
      layers,
      line: slab.innerText.replace(/\s+/g, ' ').trim(),
    };
  });
  console.log(name, JSON.stringify(g, null, 1));

  const bar = await p.locator('.rr-loop-bar').boundingBox();
  await p.screenshot({ path: `${OUT}/dial-${name}.png`, clip: { x: bar.x - 10, y: bar.y - 14, width: bar.width + 20, height: bar.height + 28 } });
  const real = logs.filter((l) => !/401|WebGL|GPU stall/i.test(l));
  console.log(`[${name}] console:`, real.length ? real.slice(0, 5) : 'clean');
  await p.close();
}
await b.close();
