// Drive the real game and MEASURE the arrival pan and the sink.
//
// A screenshot cannot show a camera move, so this samples the live stage
// instead: the island scene applies its camera as one transform on its
// container (see IslandScene.setCam), so the container's `y` IS the camera
// and its `alpha` IS the fade. Sampling both every animation frame gives the
// shape of the move, which is the thing being judged.
//
//   node tools/verify-arrival-pan.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });
const URL = 'http://localhost:3010/';

/**
 * Watch the island container from before it exists, sampling every frame.
 *
 * The island scene applies its camera as ONE transform on its container (see
 * IslandScene.setCam), so the container's `y` IS the camera and its `alpha` IS
 * the fade. Latching on from inside the page rather than polling from node is
 * what makes this trustworthy: the arrival starts the instant the iris opens,
 * and a sampler installed a few hundred ms later reports "nothing moved".
 */
const WATCH = () => {
  globalThis.__log = [];
  const find = (n, d) => {
    if (d > 5) return null;
    for (const c of n.children ?? []) {
      if ((c.children ?? []).some((g) => typeof g.label === 'string' && g.label.startsWith('tile-'))) return c;
      const x = find(c, d + 1); if (x) return x;
    }
    return null;
  };
  let island = null;
  const t0 = performance.now();
  const tick = () => {
    const app = globalThis.__PIXI_APP__;
    if (app) { const f = find(app.stage, 0); if (f) island = f; }
    if (island) {
      globalThis.__log.push({
        t: +(performance.now() - t0).toFixed(0),
        y: +island.y.toFixed(1),
        a: +island.alpha.toFixed(3),
        vis: island.visible,
      });
    }
    globalThis.__raf = requestAnimationFrame(tick);
  };
  tick();
};

/**
 * Judge a run of frames. The two failures this is here to catch are a pan that
 * never happens (travel 0, which a clamp silently caused) and a pan that
 * happens TWICE (the camera snapping back up and running again, which three
 * different callers each announcing the arrival caused).
 */
function describe(name, frames) {
  if (!frames?.length) return `[${name}] NO FRAMES`;
  const ys = frames.map((f) => f.y);
  const as = frames.map((f) => f.a);
  let restarts = 0, fades = 0;
  for (let i = 2; i < ys.length; i++) if (ys[i] > ys[i - 1] + 1) restarts++;
  for (let i = 1; i < as.length; i++) if (as[i] < as[i - 1] - 0.05) fades++;
  const travel = Math.max(...ys) - Math.min(...ys);
  const litAt = frames.find((f) => f.a >= 0.999)?.t;
  const settled = frames[frames.length - 1].t;
  return [
    `[${name}] ${frames.length} changed frames`,
    `  travel   ${travel.toFixed(1)}px   ${travel > 100 ? 'OK (the full drop)' : 'SUSPECT - the pan did not run'}`,
    `  restarts ${restarts}   ${restarts === 0 ? 'OK (one arrival)' : 'BAD - the pan ran more than once'}`,
    `  fades    ${fades}   ${fades === 1 ? 'OK (one fade up)' : 'BAD - the fade restarted'}`,
    `  alpha    from ${Math.min(...as)} to ${Math.max(...as)}`,
    `  fully lit at ${litAt ?? '?'}ms, camera settled by ${settled}ms`,
  ].join('\n');
}

const browser = await chromium.launch();
// A FRESH context every run. A guest is persisted and each crossing costs
// ENERGY.RUN_COST, so a reused profile eventually never reaches an island at
// all — which looks exactly like the feature being broken.
const ctx = await browser.newContext({ viewport: { width: 1376, height: 768 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  // Installed BEFORE the crossing: the arrival begins the moment the iris
  // opens, and a sampler started by polling from node misses its first half.
  await page.evaluate(WATCH);
  await page.click('button:has-text("Play as a guest")');
  await page.waitForFunction(() => globalThis.__log.some((r) => r.vis === true),
    null, { timeout: 90_000 });
  await page.waitForTimeout(4000);

  const frames = await page.evaluate(() => {
    const vis = globalThis.__log.filter((x) => x.vis);
    const out = []; let prev = null;
    for (const x of vis) { if (!prev || x.y !== prev.y || x.a !== prev.a) out.push(x); prev = x; }
    return out;
  });
  console.log(describe('first island arrival', frames));
  for (const f of frames.slice(0, 12)) console.log('   ', JSON.stringify(f));
  await page.screenshot({ path: `${OUT}/arrival-first-island.png` });
  writeFileSync(`${OUT}/arrival-frames.json`, JSON.stringify(frames, null, 1));
  console.log(`[out] ${OUT}/arrival-frames.json`);
} catch (e) {
  console.log('FAILED:', e.message);
  await page.screenshot({ path: `${OUT}/arrival-failure.png` }).catch(() => {});
}
console.log('[console errors]', logs.length ? logs.slice(0, 5).join(' | ') : 'none beyond the usual 401');
await browser.close();
