// The burrow on an iPhone under Safari's bar — the shortest screen the game
// meets (852x320; see .claude/skills/verify). Screenshot plus the geometry of
// the top bar, the column, the slabs and their text.
//
//   node tools/verify-ios-burrow.mjs [width] [height] [tag]
//   REUSE=1  reopen the guest saved by the last run instead of making one
//   SAFE=59  emulate the notch's side insets (CDP), the way iOS reports them
//
// HOW IT REACHES THE BURROW WITHOUT PLAYING. A fresh guest is crossed to the
// first island, whose exit is hidden until the bomb lesson is done. So this
// marks the guest `runs_played = 1` in the LOCAL database and restarts
// `bun ws`, which holds the run's seat in memory; reopened, the guest is a
// returning player and lands in the burrow. Local dev only, by construction.
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
const S = (process.env.OUT ?? 'verify-out') + '/';
mkdirSync(S, { recursive: true });
const [w, h, tag] = [Number(process.argv[2] ?? 852), Number(process.argv[3] ?? 320), process.argv[4] ?? 'burrow'];
const STATE = `${S}guest-state.json`;
const b = await chromium.launch();
const mk = () => b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, ...(process.env.REUSE ? { storageState: STATE } : {}) });
if (!process.env.REUSE) {
  const ctx = await mk();
  const p = await ctx.newPage();
  await p.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
  await p.tap('button:has-text("Play as a guest")');
  await p.waitForTimeout(4000);
  const name = (await p.evaluate(() => document.querySelector('.rr-wallet-name')?.textContent ?? '')).trim();
  execSync(`psql rr_crown -Atc "update players set runs_played = 1 where name = '${name.replace(/'/g, "''")}'"`);
  await ctx.storageState({ path: STATE });
  await ctx.close();
  // Forget the seat: restart the game server.
  try { execSync('lsof -ti tcp:3011 | xargs kill'); } catch {}
  await new Promise((r) => setTimeout(r, 1000));
  const log = openSync(`${S}ws.log`, 'a');
  spawn('bun', ['ws'], { cwd: process.cwd(), detached: true, stdio: ['ignore', log, log] }).unref();
  for (let i = 0; i < 30; i++) { try { if ((await fetch('http://localhost:3011/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  console.log('guest', name, 'marked; ws restarted');
}
const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, storageState: STATE });
const p = await ctx.newPage();
if (process.env.SAFE) { const cdp = await ctx.newCDPSession(p); const n = Number(process.env.SAFE); try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { left: n, right: n, top: 0, bottom: 21 } }); console.log('safe-area override on'); } catch (e) { console.log('no safe-area override:', e.message.split('\n')[0]); } }
await p.goto('http://localhost:3010/', { waitUntil: 'networkidle' });
try { await p.waitForSelector('.rr-loop-bar', { timeout: 60_000 }); } catch { await p.screenshot({ path: `${S}${tag}-fail.png` }); console.log('no burrow:', await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200))); process.exit(1); }
await p.waitForTimeout(3000);
const close = p.locator('.rr-lb-close');
if (await close.count()) { await close.first().tap({ force: true }).catch(() => {}); await p.waitForTimeout(800); }
await p.screenshot({ path: `${S}${tag}.png` });
console.log(await p.evaluate(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(','); };
  const out = [];
  for (const e of document.querySelectorAll('button, [role=button]')) {
    const r = e.getBoundingClientRect(); if (!r.width) continue;
    out.push(`BTN ${box(e)} .${e.className.toString().trim().split(/\s+/).slice(0, 4).join('.')} | ${(e.getAttribute('aria-label') || e.textContent).replace(/\s+/g, ' ').trim().slice(0, 40)}`);
  }
  for (const sel of ['.rr-topbar', '.rr-wallet', '.rr-carrot-pill', '.rr-burrow', '.rr-burrow > div', '.rr-loop-bar', '.rr-loop-dig', '.rr-loop-home', '.rr-loop-raid', '.rr-col-more-btn', '.rr-lb-launch', '.rr-sound']) {
    const e = document.querySelector(sel); if (e) out.push(`EL ${sel} ${box(e)} pad=${getComputedStyle(e).padding}`);
  }
  for (const sel of ['.rr-loop-home > .nine-btn__content', '.rr-loop-home .rr-loop-verb', '.rr-loop-home .rr-loop-line', '.rr-loop-raid .rr-loop-verb', '.rr-loop-raid .rr-loop-line']) {
    const e = document.querySelector(sel); if (e) out.push(`EL ${sel} ${box(e)} fs=${getComputedStyle(e).fontSize} lh=${getComputedStyle(e).lineHeight}`);
  }
  document.querySelectorAll('.rr-burrow > div').forEach((c, i) => { const inner = c.firstElementChild; out.push(`CARD${i} ${box(c)} scrollH=${c.scrollHeight} clientH=${c.clientHeight} first=${inner ? box(inner) : '-'} text=${c.textContent.replace(/\s+/g,' ').slice(0,30)}`); });
  out.push(`more=${document.querySelector('.rr-burrow')?.dataset.more} mask=${getComputedStyle(document.querySelector('.rr-burrow')).webkitMaskImage?.slice(0,40)}`);
  const cs = getComputedStyle(document.documentElement);
  out.push(`icon=${cs.getPropertyValue('--rr-icon')} loop-h=${cs.getPropertyValue('--rr-loop-h')} edge=${cs.getPropertyValue('--rr-edge')}`);
  return out.join('\n');
}));
await b.close();
