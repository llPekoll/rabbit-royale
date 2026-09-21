// A TOUR OF THE ONE-TANK SURFACES, screenshotted: the burrow, the energy
// panel (tap the ring), the island list (DIG), the raid list or its refusal
// (RAID), an island with the ring, the exit's "raid ready", the recap, and
// the out-of-energy window. Reuses the guest saved by verify-ios-burrow.mjs.
//
//   node tools/verify-energy-tour.mjs [width] [height] [tag] [energy]
//   ENERGY=n  set the guest's tank in the local db first (restarts bun ws)
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import { openSync, mkdirSync, readFileSync } from 'node:fs';
const S = (process.env.OUT ?? 'verify-out') + '/';
mkdirSync(S, { recursive: true });
const [w, h, tag] = [Number(process.argv[2] ?? 1376), Number(process.argv[3] ?? 768), process.argv[4] ?? 'tour'];
const STATE = `${S}guest-state.json`;
const touch = w < 1000;
const shot = async (p, name) => { await p.waitForTimeout(700); await p.screenshot({ path: `${S}${tag}-${name}.png` }); console.log('shot', name); };
const act = (p, sel) => touch ? p.tap(sel, { force: true }) : p.click(sel, { force: true });

if (process.env.ENERGY) {
  execSync(`psql rr_crown -Atc "update players set energy = ${Number(process.env.ENERGY)}, energy_updated_at = now() where runs_played >= 1 and name like 'GoldenHop%'"`);
  try { execSync('lsof -ti tcp:3011 | xargs kill'); } catch {}
  await new Promise((r) => setTimeout(r, 1000));
  const log = openSync(`${S}ws.log`, 'a');
  spawn('bun', ['ws'], { cwd: process.cwd(), detached: true, stdio: ['ignore', log, log] }).unref();
  for (let i = 0; i < 30; i++) { try { if ((await fetch('http://localhost:3011/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  console.log('energy set to', process.env.ENERGY, '; ws restarted');
}
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, storageState: STATE, ...(touch ? { isMobile: true, hasTouch: true } : {}) });
const p = await ctx.newPage();
await p.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
await p.waitForSelector('.rr-loop-bar', { timeout: 60_000 });
await p.waitForTimeout(2500);
const close = p.locator('.rr-lb-close');
if (await close.count()) { await close.first().click({ force: true }).catch(() => {}); await p.waitForTimeout(500); }
await shot(p, '1-burrow');
await act(p, '.rr-dial-tap'); await shot(p, '2-energy-panel'); await p.keyboard.press('Escape');
await act(p, '.rr-loop-raid'); await shot(p, '3-raid'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await act(p, '.rr-loop-dig'); await shot(p, '4-islands');
const openBtn = p.locator('.rr-island-pick .rr-raid-row button:not([disabled])').first();
if (await openBtn.count() && !process.env.NO_ISLAND) {
  await openBtn.click({ force: true });
  try {
    await p.waitForSelector('.rr-back-btn', { timeout: 40_000 });
    await p.waitForTimeout(2500);
    await shot(p, '5-island');
    if (await p.locator('.rr-dial-tap').count()) { await act(p, '.rr-dial-tap'); await shot(p, '6-island-energy'); await p.keyboard.press('Escape'); }
    console.log('exit label:', await p.locator('.rr-back-btn').innerText());
    await act(p, '.rr-back-btn');
    await p.waitForTimeout(3500);
    await shot(p, '7-recap');
    console.log('recap text:', (await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 600))));
  } catch (e) { console.log('island step failed:', e.message.split('\n')[0]); await shot(p, '5-fail'); }
} else {
  console.log('no island button, or NO_ISLAND');
  await p.keyboard.press('Escape');
}
await b.close();
