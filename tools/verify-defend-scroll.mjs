// The two painted boards — DEFEND's parchment and RAID's skull — in the real
// burrow, at both shipping sizes.
//   node tools/verify-defend-scroll.mjs [outDir]
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
    const read = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      // The art is on ::before, so that is where the picture has to be.
      const skin = getComputedStyle(el, '::before');
      const verb = el.querySelector('.rr-loop-verb');
      const line = el.querySelector('.rr-loop-line');
      const vr = verb?.getBoundingClientRect();
      return {
        slab: { w: Math.round(r.width), h: Math.round(r.height) },
        art: (skin.borderImageSource.match(/[^/]+\.webp/) ?? ['none'])[0],
        slice: skin.borderImageSlice,
        verbInk: verb ? getComputedStyle(verb).color : null,
        // Does the verb clear the badge in the left cap?
        verbStartsAt: vr ? Math.round(vr.x - r.x) : null,
        text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 44),
      };
    };
    return { defend: read('.rr-loop-home'), raid: read('.rr-loop-raid') };
  });
  console.log(name, JSON.stringify(g, null, 1));

  const bar = await p.locator('.rr-loop-bar').boundingBox();
  await p.screenshot({ path: `${OUT}/defend-${name}.png`, clip: { x: bar.x - 10, y: bar.y - 16, width: bar.width + 20, height: bar.height + 32 } });
  console.log(`[shot] ${name}`);
  const real = logs.filter((l) => !/401|WebGL|GPU stall/i.test(l));
  console.log(`[${name}] console:`, real.length ? real.slice(0, 5) : 'clean');
  await p.close();
}
await b.close();
