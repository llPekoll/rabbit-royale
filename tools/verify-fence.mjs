// The fence mode, driven end to end: DEFEND → fence slot → targets on the
// potager → hover → tap → plank. Every step is READ off the live Pixi stage
// (`__PIXI_APP__`) rather than trusted from the chrome, because the chrome was
// right three times while the board underneath it was not.
//   node tools/verify-fence.mjs [outDir]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'verify-out';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1376, height: 768 }, deviceScaleFactor: 1 });
const logs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
p.on('pageerror', (e) => logs.push('PAGEERROR ' + e.message));
const api = [];
let clickT = Date.now();
const since = () => `+${Date.now() - clickT}ms`;
p.on('request', (r) => { if (r.url().includes('/api/fences')) api.push(`${since()} ${r.method()} ${r.url().replace(/^.*\/api/, '/api')}`); });
p.on('response', async (r) => {
  if (!r.url().includes('/api/fences')) return;
  const at = since();
  let body = '';
  try { body = (await r.text()).slice(0, 90); } catch { /* streamed */ }
  api.push(`  ${at} ← ${r.status()} ${r.request().method()} ${body}`);
});

// A guest minted through the API and given one run in the database, so the
// boot opens on the BURROW: a zero-run guest is crossed to the first island,
// whose lesson withholds HOME until a bomb is marked — a whole other drive.
const API = process.env.API_SERVER_URL ?? 'http://localhost:3011';
const guest = await (await fetch(`${API}/api/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
const { execSync } = await import('node:child_process');
const { readFileSync } = await import('node:fs');
const dbUrl = readFileSync('.env', 'utf8').match(/^DATABASE_URL=(.*)$/m)[1].trim();
execSync(`psql "${dbUrl}" -tAc "update players set runs_played = 1, stock = 2000 where id = '${guest.player.id}'"`);
console.log('[guest]', guest.player.id);
await p.goto('http://localhost:3010/', { waitUntil: 'domcontentloaded' });
await p.evaluate((t) => localStorage.setItem('rr_token', t), guest.token);
await p.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
await p.waitForSelector('.rr-loop-bar', { timeout: 90_000 });
await p.waitForTimeout(3000);
await p.screenshot({ path: `${OUT}/fence-0-burrow.png` });

/** Walk the whole stage and describe every fence-related node and the camera. */
const probe = () => p.evaluate(() => {
  const app = globalThis.__PIXI_APP__;
  if (!app) return { error: 'no __PIXI_APP__' };
  const out = { marks: [], planks: [], hints: { visible: 0, alpha0: 0, total: 0 }, cam: null };
  const walk = (n, depth = 0) => {
    if (!n) return;
    const label = n.label ?? '';
    if (label.startsWith('fence-mark-')) {
      const g = n.getGlobalPosition();
      out.marks.push({ label, visible: n.visible, alpha: +n.alpha.toFixed(2), tint: n.tint.toString(16), gx: Math.round(g.x), gy: Math.round(g.y), parent: n.parent?.label ?? n.parent?.constructor?.name });
    } else if (label.startsWith('fence-plank-')) {
      const g = n.getGlobalPosition();
      out.planks.push({ label, visible: n.visible, alpha: +n.alpha.toFixed(2), gx: Math.round(g.x), gy: Math.round(g.y), sx: +n.scale.x.toFixed(2), sy: +n.scale.y.toFixed(2), z: +n.zIndex.toFixed(2), tex: n.texture?.width + 'x' + n.texture?.height });
    } else if (label.startsWith('burrow-hint-')) {
      out.hints.total++;
      if (n.visible) out.hints.visible++;
      if (n.visible && n.alpha < 0.01) out.hints.alpha0++;
    }
    for (const c of n.children ?? []) walk(c, depth + 1);
  };
  walk(app.stage);
  // The burrow scene's camera container: the one that holds the terrain.
  const find = (n) => { if (!n) return null; if ((n.label ?? '').startsWith('burrow-hint-')) return n; for (const c of n.children ?? []) { const r = find(c); if (r) return r; } return null; };
  const hint = find(app.stage);
  let cam = hint;
  while (cam && cam.parent && cam.parent !== app.stage) cam = cam.parent;
  if (cam) out.cam = { x: Math.round(cam.x), y: Math.round(cam.y), scale: +cam.scale.x.toFixed(3), label: cam.label };
  return out;
});

const summary = (r, tag) => {
  const vis = r.marks.filter((m) => m.visible);
  const gold = vis.filter((m) => m.tint === 'ffd45c');
  const planks = r.planks.filter((k) => k.visible);
  console.log(`[${tag}] cam=${JSON.stringify(r.cam)} hints=${JSON.stringify(r.hints)} marks: ${r.marks.length} total, ${vis.length} visible, ${gold.length} gold | planks visible: ${planks.length}/${r.planks.length}`);
  return { vis, gold, planks };
};

// 1. DEFEND → placing.
await p.click('.rr-loop-home');
await p.waitForSelector('.rr-kit-row', { timeout: 20_000 });
await p.waitForTimeout(1200);
let r = await probe();
summary(r, 'placing');
await p.screenshot({ path: `${OUT}/fence-1-placing.png` });

// 2. The fence slot: the 4th slot of the kit row (shield, smoke, trap, FENCE).
const slots = p.locator('.rr-kit-row button');
const n = await slots.count();
const labels = [];
for (let i = 0; i < n; i++) labels.push(await slots.nth(i).getAttribute('aria-label') ?? await slots.nth(i).getAttribute('title') ?? '?');
console.log('[kit] slots:', n, labels);
const fence = slots.filter({ hasText: /fence/i }).first();
const fenceCount = await fence.count();
const target = fenceCount ? fence : slots.nth(3);
const disabled = await target.isDisabled();
console.log('[kit] fence slot disabled?', disabled, 'label:', await target.getAttribute('aria-label'));
await target.click({ force: true });
// TIMELINE: what moves, and when, in the three seconds after the press.
const t0 = Date.now();
const line = [];
for (let i = 0; i < 20; i++) {
  await p.waitForTimeout(150);
  const q = await probe();
  const m = q.marks.find((k) => k.visible) ?? q.marks[0];
  line.push(`${String(Date.now() - t0).padStart(4)}ms mark(${m?.label ?? '-'}) a=${m?.alpha} @${m?.gx},${m?.gy} hintsA0=${q.hints.alpha0}/${q.hints.visible}`);
}
console.log('[timeline]\n  ' + line.join('\n  '));
// The chain of transforms above a hint, so the CAMERA container is named.
console.log('[chain]', JSON.stringify(await p.evaluate(() => {
  const app = globalThis.__PIXI_APP__;
  const find = (n) => { if ((n.label ?? '').startsWith('burrow-hint-')) return n; for (const c of n.children ?? []) { const r = find(c); if (r) return r; } return null; };
  let n = find(app.stage); const out = [];
  while (n && n !== app.stage) { out.push({ l: n.label ?? n.constructor?.name, x: Math.round(n.x), y: Math.round(n.y), s: +n.scale.x.toFixed(3) }); n = n.parent; }
  return out;
})));
r = await probe();
const w = summary(r, 'walling');
await p.screenshot({ path: `${OUT}/fence-2-walling.png` });
console.log('[walling] chrome: loopbar visible?', await p.locator('.rr-loop-bar').isVisible().catch(() => 'n/a'),
  'back?', await p.locator('button:has-text("Back")').count(), 'kitrow?', await p.locator('.rr-kit-row').count());
if (w.vis.length) console.log('[walling] first marks:', JSON.stringify(w.vis.slice(0, 3)));

// 3. Hover the first visible mark and read the tint — once the camera has
//    SETTLED: a position read mid-tween sent the pointer to where the mark
//    used to be, and the drive concluded that hover and tap did nothing.
if (w.vis.length) {
  let m = w.vis[0]; let same = 0;
  for (let i = 0; i < 30 && same < 3; i++) {
    await p.waitForTimeout(150);
    const q = (await probe()).marks.find((k) => k.label === m.label);
    same = q && q.gx === m.gx && q.gy === m.gy ? same + 1 : 0;
    m = q ?? m;
  }
  console.log('[settle] mark', m.label, 'at', m.gx, m.gy, 'stable reads:', same);
  await p.mouse.move(m.gx, m.gy);
  await p.waitForTimeout(400);
  r = await probe();
  const h = summary(r, 'hover');
  console.log('[hover] hovered mark:', JSON.stringify(r.marks.find((k) => k.label === m.label)));
  await p.screenshot({ path: `${OUT}/fence-3-hover.png` });

  // 4. Tap it: ONE plank goes up, on that span only. Polled rather than
  //    waited for, so the drive says WHEN the board caught up with the server.
  const until = async (want, tag) => {
    const t = Date.now();
    // 400ms apart, not 100: each probe walks the whole stage ON THE PAGE's
    // main thread, and a tight loop of them starved the very fetch and React
    // render it was timing — the board "took 2.5s" to show a plank the server
    // had confirmed in 10ms.
    for (let i = 0; i < 15; i++) {
      await p.waitForTimeout(400);
      const q = await probe();
      const n = q.planks.filter((k) => k.visible).length;
      if (want(n)) { console.log(`[${tag}] board caught up within ${Date.now() - t}ms (planks=${n})`); return q; }
    }
    const q = await probe();
    console.log(`[${tag}] board NEVER caught up in 6s (planks=${q.planks.filter((k) => k.visible).length})`);
    return q;
  };
  clickT = Date.now();
  await p.mouse.click(m.gx, m.gy);
  r = await until((n) => n === 1, 'after-tap');
  const t1 = summary(r, 'after-tap');
  console.log('[after-tap] planks:', JSON.stringify(r.planks.filter((k) => k.visible)));
  console.log(`[after-tap] ONE plank? ${t1.planks.length === 1 ? 'yes' : 'NO — ' + t1.planks.length}`);
  await p.screenshot({ path: `${OUT}/fence-4-after-tap.png` });

  // 5. Hover the plank: it goes gold (a tap would lift it).
  await p.mouse.move(m.gx + 3, m.gy + 3);
  await p.mouse.move(m.gx, m.gy);
  await p.waitForTimeout(400);
  r = await probe();
  const plank = r.planks.find((k) => k.visible);
  console.log('[hover-plank] tint:', plank && r.planks.length ? await p.evaluate((label) => {
    const app = globalThis.__PIXI_APP__; let out = null;
    const walk = (n) => { if (n.label === label) out = n.tint.toString(16); n.children?.forEach(walk); };
    walk(app.stage); return out;
  }, plank.label) : 'no plank');

  // 6. Tap it again: the plank comes down and the bag gets it back.
  clickT = Date.now();
  await p.mouse.click(m.gx, m.gy);
  r = await until((n) => n === 0, 'after-lift');
  const t2 = summary(r, 'after-lift');
  console.log(`[after-lift] plank gone? ${t2.planks.length === 0 ? 'yes' : 'NO — ' + t2.planks.length}`);
  await p.screenshot({ path: `${OUT}/fence-5-after-lift.png` });
}

console.log('[api]', api.length ? api : 'NO /api/fences traffic');
const real = logs.filter((l) => !/401|WebGL|GPU stall|DevTools|beforeinstallprompt/i.test(l));
console.log('[console]', real.length ? real.slice(0, 8) : 'clean');
await b.close();
