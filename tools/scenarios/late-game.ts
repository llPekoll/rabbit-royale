/**
 * LATE GAME — the PvP cases, played for real against a LOCAL rr-ws + LOCAL db.
 *
 *   RR_STAGE=1 WS_PORT=3012 bun run server/index.ts        (another shell)
 *   bun run tools/scenarios/late-game.ts [--only A3] [--watch]
 *
 * --watch opens the REAL Godot client on the same local server, signed in as
 * a level-10 watcher, and has it spectate each case before the move is made —
 * slowed down so the shove, the sea, the bolt and the bomb can be seen.
 *
 * Every rabbit here is a real guest, on a real island dealt by the server,
 * moved by real `move` / `lightning` / `plant` / `spectate` packets. The only
 * shortcut is the STAGE (server/stage.ts): it puts two rabbits face to face
 * next to a bomb or the sea, because the content seed is secret and walking
 * there by hand would be a whole run per case.
 *
 * Each case states the RULE AS WANTED (the brief), then what the server did.
 * A FAIL is a gap between the two — either a bug, or a rule not built yet.
 * Report: tools/scenarios/out/late-game.md
 */
import { io as connect, type Socket } from 'socket.io-client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../src/lib/db';
import { players } from '../../src/lib/db/schema';
import { grantItem } from '../../src/lib/game/grant';
import { levelTierAt, terrainNeighbors } from '../../src/lib/game/terrainBoard';
import { toColRow, toIndex, COLS, ROWS } from '../../src/config/gridConfig';
import { BLOOP, BOMB, DROWN, ENERGY, LIGHTNING } from '../../config/tuning';
import en from '../../godot/assets/i18n/en.json';

const BASE = process.env.STAGE_URL ?? 'http://localhost:3012';
const OUT = new URL('./out/', import.meta.url).pathname;
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const WATCH = process.argv.includes('--watch');
const GODOT = process.env.GODOT_BIN ?? '/Applications/Godot.app/Contents/MacOS/Godot';

/** The brief's number: the sea costs a bomb, plus ten. */
const WANTED_DROWN_LOSS = ENERGY.BOMB_LOSS + 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Players ──────────────────────────────────────────────────────────────────
interface P { id: string; token: string; name: string; s: Socket; events: Array<{ ev: string; p: any; t: number }> }

async function api(p: P | null, method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(p ? { Authorization: `Bearer ${p.token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) as any };
}

let serial = 0;
/** Every guest this run made, demoted at the end. */
const created: Array<{ id: string }> = [];
/** A guest at `level`, with a full bar, a fat stock and the weapons asked for. */
async function player(tag: string, level: number, items: { lightning?: number; bomb?: number } = {}): Promise<P> {
  const { json } = await api(null, 'POST', '/api/auth/guest');
  if (!json?.token) throw new Error('guest failed ' + JSON.stringify(json));
  const name = `${tag}-${Date.now().toString(36).slice(-4)}${serial++}`;
  await db.update(players).set({
    name, level, runsPlayed: 5, energy: 300, energyUpdatedAt: new Date(),
    stock: 900_000 + serial, shieldedUntil: null,
  }).where(eq(players.id, json.player.id));
  for (const [kind, qty] of Object.entries(items)) {
    if (qty) await db.transaction((tx) => grantItem(tx as any, json.player.id, kind as any, qty));
  }
  const s = connect(BASE, { auth: { token: json.token }, transports: ['websocket'], reconnection: false, forceNew: true });
  await new Promise<void>((ok, ko) => { s.once('connect', () => ok()); s.once('connect_error', ko); });
  const p: P = { id: json.player.id, token: json.token, name, s, events: [] };
  created.push(p);
  s.onAny((ev, payload) => p.events.push({ ev, p: payload, t: Date.now() }));
  return p;
}

/** One bloop in `p`'s bag. */
async function grantBloop(p: P) {
  await db.transaction((tx) => grantItem(tx as any, p.id, 'bloop', 1));
}

async function join(p: P): Promise<any> {
  return new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error(`${p.name}: join timeout`)), 6000);
    p.s.once('island', (snap) => { clearTimeout(t); ok(snap); });
    p.s.once('error_msg', (e) => { clearTimeout(t); ko(new Error(`${p.name}: join refused ${JSON.stringify(e)}`)); });
    p.s.emit('join');
  });
}

function stage(p: P, req: Record<string, unknown>): Promise<any> {
  return new Promise((ok, ko) => {
    const t = setTimeout(() => ko(new Error('stage timeout — is the server running with RR_STAGE=1?')), 3000);
    p.s.emit('__stage', req, (res: any) => { clearTimeout(t); res?.error ? ko(new Error('stage: ' + res.error)) : ok(res); });
  });
}

/** Everything `p` heard of `ev` since `mark`, optionally filtered. */
function heard(p: P, ev: string, since: number, pred: (x: any) => boolean = () => true) {
  return p.events.filter((e) => e.ev === ev && e.t >= since && pred(e.p)).map((e) => e.p);
}
async function waitHeard(p: P, ev: string, since: number, pred: (x: any) => boolean = () => true, ms = 2500) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const got = heard(p, ev, since, pred);
    if (got.length) return got[0];
    await sleep(40);
  }
  return undefined;
}

async function bye(...ps: P[]) {
  for (const p of ps) { p.s.emit('leave'); }
  await sleep(300);
  for (const p of ps) p.s.disconnect();
}

// ── Watching (--watch) ───────────────────────────────────────────────────────
let watcher: P | null = null;
/**
 * Wait for the viewer (only while watching): a click on the banner in Godot
 * (relayed by the server as `__next`), or Enter in the terminal.
 */
const rl = WATCH ? createInterface({ input: process.stdin }) : null;
let waiting: (() => void) | null = null;
const go = () => { const w = waiting; waiting = null; w?.(); };
rl?.on('line', go);
const enter = (prompt: string) => new Promise<void>((ok) => {
  if (!rl) return ok();
  process.stdout.write(prompt + '\n');
  waiting = ok;
});

/** A socket of our own that outlives each case, to write on the watcher's screen. */
let director: P | null = null;
async function caption(text: string) {
  if (!watcher || !director) return;
  await stage(director, { op: 'caption', watcherId: watcher.id, text }).catch(() => {});
}
/** The case being played, for the watcher's banner. */
let playing: { id: string; title: string; brief: string } | null = null;

/** A level-10 guest, and the Godot client signed in as it. */
async function openGodot() {
  watcher = await player('Watcher', 10);
  director = await player('Director', 1);
  director.s.on('__next', go);
  watcher.s.disconnect(); // Godot holds this player's socket, not us
  const root = new URL('../../godot', import.meta.url).pathname;
  const child = spawn(GODOT, ['--path', root, '--', `--server=${BASE}`, `--token=${watcher.token}`],
    { stdio: 'ignore', detached: true });
  child.unref();
  console.log(`Godot lancé en spectateur (${watcher.name}) — il suit chaque cas.`);
}

/** Put the Godot watcher on `target`'s island and give the eye time to land. */
async function showtime(target: P) {
  if (!watcher) return;
  const end = Date.now() + 90_000; // Godot boots, signs in, reaches the burrow
  // Another spectator (the raider bot) may already be counted: wait for ONE MORE.
  const before = heard(target, 'watchers', 0).at(-1)?.count ?? 0;
  const t0 = Date.now();
  for (;;) {
    try { await stage(target, { op: 'follow', watcherId: watcher.id, playerId: target.id }); break; } catch (e) {
      if (Date.now() > end) throw e;
      await sleep(1000);
    }
  }
  if (playing) await caption(`${playing.id} — ${playing.title}\n${playing.brief}\n▶ CLIQUE ICI pour jouer le coup`);
  const seen = await waitHeard(target, 'watchers', t0, (x) => x.count > before, 15_000);
  console.log(seen ? `   👁  Godot regarde ${target.name}` : `   ⚠  Godot n'est pas arrivé sur l'île de ${target.name}`);
  await enter(`   ▶  ${playing?.id ?? ''} en place — clic sur le bandeau (ou Entrée) pour jouer `);
  if (playing) await caption(`${playing.id} — ${playing.title}`);
}

/** Hold the frame after the move, so the result is seen. */
const linger = (ms = 2500) => (watcher ? sleep(ms) : Promise.resolve());

// ── Geometry ─────────────────────────────────────────────────────────────────
interface Where { seed: string; level: number; spawn: number; tiles: number[]; revealed: number[]; hinted: number[]; bombs: number[]; chests: number[]; rabbits: any[] }

const isSea = (seed: string, i: number) => { const { col, row } = toColRow(i); return levelTierAt(seed, col, row) === 0; };
const cheb = (a: number, b: number) => { const p = toColRow(a), q = toColRow(b); return Math.max(Math.abs(p.col - q.col), Math.abs(p.row - q.row)); };

/**
 * A line pusher → victim → landing, one step apart, where the landing is
 * undug ground (`'ground'`) or open sea (`'sea'`). Away from the spawn and
 * from any other rabbit, so nobody else is in the frame.
 */
function line(w: Where, landing: 'ground' | 'sea') {
  const tiles = new Set(w.tiles);
  const busy = new Set([...w.revealed, ...w.hinted, ...w.chests]);
  const taken = new Set(w.rabbits.map((r) => r.tile));
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (const v of w.tiles) {
    if (busy.has(v) || taken.has(v) || cheb(v, w.spawn) < 4) continue;
    const { col, row } = toColRow(v);
    for (const [dc, dr] of dirs) {
      const pc = col - dc, pr = row - dr, tc = col + dc, tr = row + dr;
      if ([pc, tc].some((c) => c < 0 || c >= COLS) || [pr, tr].some((r) => r < 0 || r >= ROWS)) continue;
      const p = toIndex(pc, pr), t = toIndex(tc, tr);
      if (!tiles.has(p) || busy.has(p) || taken.has(p)) continue;
      if (!terrainNeighbors(w.seed, p).includes(v)) continue;
      if (landing === 'ground') {
        if (!tiles.has(t) || busy.has(t) || !terrainNeighbors(w.seed, v).includes(t)) continue;
      } else {
        if (!isSea(w.seed, t) || terrainNeighbors(w.seed, v).includes(t)) continue;
      }
      return { pusher: p, victim: v, landing: t };
    }
  }
  throw new Error(`no ${landing} line on this island`);
}

/** Two rabbits of `level` on one island, sheep gone, the board read. */
async function duel(level: number, items: { a?: any; b?: any } = {}) {
  const a = await player('A', level, items.a);
  const b = await player('B', level, items.b);
  await join(a);
  await join(b);
  const w0: Where = await stage(a, { op: 'where', islandId: islandOf(a) });
  if (!w0.rabbits.some((r) => r.playerId === b.id)) throw new Error(`A and B were dealt different islands at level ${level}`);
  await stage(a, { op: 'nosheep', islandId: islandOf(a) });
  return { a, b, w: w0 };
}
/** The live island's key is its seed (see MemoryIslandStore.create). */
const islandOf = (p: P) => [...p.events].reverse().find((e) => e.ev === 'island')!.p.seed as string;

async function setLine(a: P, b: P, w: Where, kind: 'ground' | 'sea', energies: { a: number; b: number }) {
  const L = line(w, kind);
  const id = islandOf(a);
  await stage(a, { op: 'open', islandId: id, tile: L.pusher });
  await stage(a, { op: 'open', islandId: id, tile: L.victim });
  await stage(a, { op: 'place', islandId: id, playerId: a.id, tile: L.pusher });
  await stage(a, { op: 'place', islandId: id, playerId: b.id, tile: L.victim });
  await stage(a, { op: 'energy', islandId: id, playerId: a.id, energy: energies.a });
  await stage(a, { op: 'energy', islandId: id, playerId: b.id, energy: energies.b });
  if (kind === 'ground') await stage(a, { op: 'bury', islandId: id, tile: L.landing });
  return L;
}

// ── Checks ───────────────────────────────────────────────────────────────────
interface Check { what: string; want: unknown; got: unknown; ok: boolean; note?: string; skipped?: true }
const check = (what: string, want: unknown, got: unknown, note?: string): Check =>
  ({ what, want, got, ok: JSON.stringify(want) === JSON.stringify(got), note });
/** A check the bench cannot make here — reported, never counted as a gap. */
const skip = (what: string, why: string): Check => ({ what, want: '—', got: '—', ok: true, note: why, skipped: true });

interface Case { id: string; title: string; brief: string; run: () => Promise<Check[]> }

// ── The cases ────────────────────────────────────────────────────────────────
const CASES: Case[] = [];

/* A — two players on one island, post level 5. */

for (const [id, lvl, ea, eb, label] of [
  ['A1', 10, 60, 250, 'le pousseur a MOINS d\'énergie que la victime'],
  ['A2', 10, 250, 60, 'le pousseur a PLUS d\'énergie que la victime'],
] as const) {
  CASES.push({
    id, title: `Niv. ${lvl} : A pousse B sur une bombe (${label})`,
    brief: 'Deux joueurs sur la même île ; l\'un pousse l\'autre sur une bombe, qu\'il ait plus d\'énergie ou non.',
    run: async () => {
      const { a, b, w } = await duel(lvl);
      const L = await setLine(a, b, w, 'ground', { a: ea, b: eb });
      await showtime(b);
    const t0 = Date.now();
      a.s.emit('move', { tile: L.victim });
      const shove = await waitHeard(b, 'rabbit_pushed', t0, (x) => x.playerId === b.id);
      const moved = await waitHeard(a, 'move_result', t0);
      const rej = heard(a, 'move_rejected', t0)[0];
      const revealed = heard(b, 'tile_revealed', t0, (x) => x.tile === L.landing)[0];
      await linger();
    await bye(a, b);
      return [
        check('la poussée passe', true, !!shove, rej ? `refusée : ${rej.reason}` : undefined),
        check('B atterrit sur la bombe', L.landing, shove?.to),
        check('la bombe explose sous B', 'bomb', revealed?.content),
        check(`B perd ${ENERGY.BOMB_LOSS}`, eb - ENERGY.BOMB_LOSS, shove?.energy),
        check('B sait qui l\'a poussé', a.id, shove?.pushedBy),
        check('B est sonné', true, (shove?.stunMs ?? 0) > BOMB.STUN_MS * 0.5),
        check('A prend la case de B', L.victim, moved?.tile),
        check('A ne paie rien (case déjà creusée)', ea, moved?.energy),
      ];
    },
  });
}

CASES.push({
  id: 'A3', title: 'Niv. 10 : poussé sur une bombe avec moins de 30 → mort, A nommé',
  brief: 'Même poussée ; B n\'a plus de quoi encaisser la bombe.',
  run: async () => {
    const { a, b, w } = await duel(10);
    const L = await setLine(a, b, w, 'ground', { a: 200, b: 25 });
    await showtime(b);
    const t0 = Date.now();
    a.s.emit('move', { tile: L.victim });
    const shove = await waitHeard(b, 'rabbit_pushed', t0, (x) => x.playerId === b.id);
    const over = await waitHeard(b, 'run_over', t0);
    const died = await waitHeard(a, 'rabbit_died', t0, (x) => x.playerId === b.id);
    await linger();
    await bye(a, b);
    return [
      check('run de B terminée', true, !!shove?.runOver),
      check('la salle voit B tomber', true, !!died),
      check('le récap de B nomme A', { id: a.id, how: 'shove' }, over?.killedBy && { id: over.killedBy.id, how: over.killedBy.how }),
    ];
  },
});

CASES.push({
  id: 'A4', title: 'Niv. 7 (duo, post niv. 5) : A pousse B sur une bombe',
  brief: '« 2 joueurs post lvl5 » — la brief dit qu\'on se pousse dès qu\'on partage une île (6-9 = duo).',
  run: async () => {
    const { a, b, w } = await duel(7);
    const L = await setLine(a, b, w, 'ground', { a: 200, b: 200 });
    await showtime(b);
    const t0 = Date.now();
    a.s.emit('move', { tile: L.victim });
    await sleep(600);
    const shove = heard(b, 'rabbit_pushed', t0)[0];
    const rej = heard(a, 'move_rejected', t0)[0];
    await linger();
    await bye(a, b);
    return [check('la poussée passe au niveau 7', true, !!shove,
      rej ? `refusée « ${rej.reason} » : RAID_MIN=10, en dessous un lapin est un mur` : undefined)];
  },
});

for (const [id, eb] of [['A5', 200], ['A6', 35]] as const) {
  CASES.push({
    id, title: `Niv. 10 : A pousse B dans l'eau (B à ${eb})`,
    brief: `Poussé dans l'eau : tu perds 10 de plus qu'une bombe (${WANTED_DROWN_LOSS}) et tu reviens au milieu.`,
    run: async () => {
      const { a, b, w } = await duel(10);
      const L = await setLine(a, b, w, 'sea', { a: 200, b: eb });
      await showtime(b);
    const t0 = Date.now();
      a.s.emit('move', { tile: L.victim });
      const shove = await waitHeard(b, 'rabbit_pushed', t0, (x) => x.playerId === b.id);
      const rej = heard(a, 'move_rejected', t0)[0];
      const wantE = Math.max(0, eb - WANTED_DROWN_LOSS);
      await linger();
    await bye(a, b);
      return [
        check('la poussée passe', true, !!shove, rej ? `refusée : ${rej.reason}` : undefined),
        check('B est noyé', true, !!shove?.drowned),
        check(`B perd ${WANTED_DROWN_LOSS} (bombe + 10)`, wantE, shove?.energy,
          `DROWN.LOSS vaut ${DROWN.LOSS} aujourd'hui (= BOMB_LOSS)`),
        check('run de B terminée', wantE === 0, !!shove?.runOver),
        check('B revient au milieu (≤ 2 cases du spawn)', true, shove ? cheb(shove.to, w.spawn) <= 2 : null,
          shove ? `spawn ${w.spawn}, remonté en ${shove.to}` : undefined),
        check('B sait qui l\'a poussé', a.id, shove?.pushedBy),
      ];
    },
  });
}

CASES.push({
  id: 'A7', title: 'Niv. 10 : A électrocute B d\'un clic (A juste à côté)',
  brief: 'Proposer une électrocution au clic : A tape le lapin de B.',
  run: async () => {
    const { a, b, w } = await duel(10, { a: { lightning: 1 } });
    const L = await setLine(a, b, w, 'sea', { a: 200, b: 200 }); // no bomb buried: just two rabbits side by side
    await showtime(b);
    const t0 = Date.now();
    a.s.emit('lightning', { tile: L.victim });
    const struck = await waitHeard(b, 'rabbit_struck', t0, (x) => x.playerId === b.id);
    const rej = heard(a, 'lightning_rejected', t0)[0];
    await sleep(300);
    const self = heard(a, 'rabbit_struck', t0, (x) => x.playerId === a.id)[0];
    const t1 = Date.now();
    const away = terrainNeighbors(w.seed, L.victim).find((n) => n !== L.pusher);
    b.s.emit('move', { tile: away }); // any step, while the current holds
    const stunned = await waitHeard(b, 'move_rejected', t1, () => true, 800);
    await linger();
    await bye(a, b);
    return [
      check('l\'éclair frappe B', true, !!struck, rej ? `refusé : ${rej.reason}` : undefined),
      check(`B perd ${LIGHTNING.SHOCK_LOSS}`, 200 - LIGHTNING.SHOCK_LOSS, struck?.energy),
      check('B sait qui l\'a frappé', a.id, struck?.by),
      check('A n\'est pas touché par son propre éclair', undefined, self),
      check('B sonné : son pas est refusé', 'stunned', stunned?.reason, stunned ? `raison ${stunned.reason}` : undefined),
    ];
  },
});

CASES.push({
  id: 'A8', title: 'Niv. 10 : électrocuter sans éclair en stock',
  brief: 'Le clic est proposé, mais sans éclair acheté il est refusé sans rien coûter.',
  run: async () => {
    const { a, b, w } = await duel(10);
    const L = await setLine(a, b, w, 'sea', { a: 200, b: 200 });
    await showtime(b);
    const t0 = Date.now();
    a.s.emit('lightning', { tile: L.victim });
    const rej = await waitHeard(a, 'lightning_rejected', t0);
    await linger();
    await bye(a, b);
    return [check('refusé none-held', 'none-held', rej?.reason)];
  },
});

CASES.push({
  id: 'A9', title: 'Niv. 10 : A lance un bloop sur B en jeu → B encré, bloqué sur l\'île',
  brief: 'Bloop façon Mario Kart, au tap sur un rival : de l\'encre plein l\'écran, et tu ne peux pas partir du jeu.',
  run: async () => {
    const { a, b, w } = await duel(10);
    await grantBloop(a);
    const L = await setLine(a, b, w, 'sea', { a: 200, b: 200 });
    await showtime(b);
    const t0 = Date.now();
    a.s.emit('bloop', { tile: L.victim });
    const inked = await waitHeard(b, 'rabbit_inked', t0, (x) => x.playerId === b.id);
    const rej = heard(a, 'bloop_rejected', t0)[0];
    const t1 = Date.now();
    b.s.emit('leave');
    const stay = await waitHeard(b, 'leave_rejected', t1);
    // Once the ink has run off, the way home is open again.
    await sleep(BLOOP.INK_MS + 300 - (Date.now() - t0));
    const t2 = Date.now();
    b.s.emit('leave');
    await sleep(500);
    const stillStuck = heard(b, 'leave_rejected', t2)[0];
    const left = heard(a, 'rabbit_left', t2, (x) => x.playerId === b.id)[0];
    await linger();
    await bye(a, b);
    return [
      check('le bloop touche B', true, !!inked, rej ? `refusé : ${rej.reason}` : undefined),
      check('B sait qui', a.id, inked?.by),
      check('B ne peut pas rentrer pendant l\'encre', 'inked', stay?.reason),
      check('reste d\'encre annoncé (ms)', true, (stay?.inkMs ?? 0) > 0 && (stay?.inkMs ?? 0) <= BLOOP.INK_MS),
      check('encre partie : B rentre', true, !stillStuck && !!left),
    ];
  },
});

CASES.push({
  id: 'A10', title: 'Niv. 10 : bloop sur une case vide → refusé, pas payé',
  brief: 'Un bloop raté (personne sur la case) ne coûte rien.',
  run: async () => {
    const { a, b, w } = await duel(10);
    await grantBloop(a);
    const L = await setLine(a, b, w, 'sea', { a: 200, b: 200 });
    const empty = terrainNeighbors(w.seed, L.pusher).find((n) => n !== L.victim)!;
    const t0 = Date.now();
    a.s.emit('bloop', { tile: empty });
    const rej = await waitHeard(a, 'bloop_rejected', t0);
    const t1 = Date.now();
    a.s.emit('bloop', { tile: L.victim });
    const inked = await waitHeard(b, 'rabbit_inked', t1);
    await bye(a, b);
    return [
      check('refusé no-rival', 'no-rival', rej?.reason),
      check('le bloop est toujours là : le suivant part', true, !!inked),
    ];
  },
});

/* B — from the burrow: RAID, a player is out digging, watch, strike, bloop. */

async function watched() {
  const a = await player('Digger', 10);
  const c = await player('Raider', 10, { lightning: 1, bomb: 1 });
  await join(a);
  const id = islandOf(a);
  await stage(a, { op: 'nosheep', islandId: id });
  const w: Where = await stage(a, { op: 'where', islandId: id });
  // A somewhere quiet, on opened ground, with undug ground around.
  const L = line(w, 'ground');
  await stage(a, { op: 'open', islandId: id, tile: L.victim });
  await stage(a, { op: 'place', islandId: id, playerId: a.id, tile: L.victim });
  return { a, c, w, id, at: L.victim, next: L.landing };
}

async function spectate(c: P, target: P) {
  const t0 = Date.now();
  c.s.emit('spectate', { playerId: target.id });
  return waitHeard(c, 'island', t0);
}

CASES.push({
  id: 'B1', title: 'RAID : un joueur en partie → je clique → je le vois → je l\'électrocute',
  brief: 'Je me connecte, j\'ouvre RAID, un joueur est en jeu ; je clique, je le vois, je l\'électrocute.',
  run: async () => {
    const { a, c, at } = await watched();
    const list = await api(c, 'GET', '/api/raid');
    const row = (list.json?.targets ?? []).find((t: any) => t.id === a.id);
    const snap = await spectate(c, a);
    const seen = snap?.rabbits?.find((r: any) => r.playerId === a.id);
    await showtime(a);
    const t0 = Date.now();
    c.s.emit('lightning', { tile: seen?.tile ?? at });
    const struck = await waitHeard(a, 'rabbit_struck', t0, (x) => x.playerId === a.id);
    const rej = heard(c, 'lightning_rejected', t0)[0];
    await linger();
    await bye(a, c);
    return [
      check('A est dans la liste RAID', true, !!row),
      process.env.REDIS_URL
        ? check('A y est marqué « digging »', 'digging', row?.presence)
        : skip('A y est marqué « digging »', 'pas de REDIS_URL : la présence est vide en local'),
      check('je vois l\'île de A', true, !!snap),
      check('je vois A à sa place', at, seen?.tile),
      check('mon éclair frappe A', true, !!struck, rej ? `refusé : ${rej.reason}` : undefined),
      check(`A perd ${LIGHTNING.SHOCK_LOSS}`, 300 - ENERGY.CROSSING_COST - LIGHTNING.SHOCK_LOSS, struck?.energy, `bar 300 − ${ENERGY.CROSSING_COST} de traversée`),
      check('A sait que c\'est moi', c.id, struck?.by),
    ];
  },
});

CASES.push({
  id: 'B2', title: 'RAID : je regarde un joueur en partie et je lui lance un bloop',
  brief: 'Bloop façon Mario Kart : de l\'encre plein l\'écran, et il ne peut pas rentrer tant qu\'elle tient.',
  run: async () => {
    const { a, c, at } = await watched();
    await grantBloop(c);
    await spectate(c, a);
    await showtime(a);
    const t0 = Date.now();
    c.s.emit('bloop', { tile: at });
    const inked = await waitHeard(a, 'rabbit_inked', t0, (x) => x.playerId === a.id);
    const rej = heard(c, 'bloop_rejected', t0)[0];
    const t1 = Date.now();
    a.s.emit('leave');
    const stay = await waitHeard(a, 'leave_rejected', t1);
    await linger();
    await bye(a, c);
    return [
      check('le bloop touche le joueur', true, !!inked, rej ? `refusé : ${rej.reason}` : undefined),
      check('il sait que c\'est moi', c.id, inked?.by),
      check(`l'encre tient ${BLOOP.INK_MS} ms`, BLOOP.INK_MS, inked?.inkMs),
      check('encré, il ne peut pas rentrer', 'inked', stay?.reason),
      check('texte « … inked you »', true, /inked/i.test((en as any).run?.hitBloop?.$t ?? ''), `en.json run.hitBloop = "${(en as any).run?.hitBloop?.$t}"`),
    ];
  },
});

CASES.push({
  id: 'B4', title: 'RAID : poser une bombe sur son île n\'existe plus',
  brief: 'La bombe, c\'est seulement pour protéger la base : le serveur ne répond plus à « plant ».',
  run: async () => {
    const { a, c, next } = await watched();
    await spectate(c, a);
    const t0 = Date.now();
    c.s.emit('plant', { tile: next });
    await sleep(800);
    const any = [...heard(c, 'bomb_planted', t0), ...heard(c, 'plant_rejected', t0), ...heard(a, 'hints_changed', t0)];
    await bye(a, c);
    return [check('rien ne se passe', 0, any.length)];
  },
});

CASES.push({
  id: 'B3', title: 'RAID : un spectateur de niveau 9 essaie d\'électrocuter',
  brief: 'Le raid et le sabotage sont réservés au niveau 10 : un 9 qui regarde ne frappe pas.',
  run: async () => {
    const a = await player('Digger', 10);
    const c = await player('Nine', 9, { lightning: 1 });
    await join(a);
    const snap = await spectate(c, a);
    await showtime(a);
    const t0 = Date.now();
    c.s.emit('lightning', { tile: snap?.rabbits?.find((r: any) => r.playerId === a.id)?.tile });
    const rej = await waitHeard(c, 'lightning_rejected', t0);
    await linger();
    await bye(a, c);
    return [check('refusé level_locked', 'level_locked', rej?.reason)];
  },
});

// ── Run ──────────────────────────────────────────────────────────────────────
async function main() {
  const h = await fetch(BASE + '/health').then((r) => r.json()).catch(() => null);
  if (!h) throw new Error(`no rr-ws at ${BASE} — RR_STAGE=1 WS_PORT=3012 bun run server/index.ts`);
  mkdirSync(OUT, { recursive: true });
  if (WATCH) await openGodot();
  const md: string[] = [`# Late game — ${new Date().toISOString()}`, '', `Serveur ${BASE}, base locale.`, ''];
  let pass = 0, fail = 0;
  for (const c of CASES) {
    if (only && c.id !== only) continue;
    let checks: Check[];
    playing = c;
    if (watcher) {
      console.log(`\n── ${c.id} — ${c.title}`);
      await caption(`${c.id} — ${c.title}\n(mise en place…)`);
    }
    try { checks = await c.run(); } catch (e) { checks = [{ what: 'le cas a planté', want: 'ok', got: String(e), ok: false }]; }
    const ok = checks.every((x) => x.ok);
    if (watcher) {
      const gaps = checks.filter((x) => !x.ok).map((x) => `✗ ${x.what} : attendu ${JSON.stringify(x.want)}, obtenu ${JSON.stringify(x.got)}`);
      await caption(`${c.id} — ${ok ? 'OK ✓' : 'ÉCART'}\n${gaps.join('\n')}\n⏭ CLIQUE ICI pour le cas suivant`);
    }
    ok ? pass++ : fail++;
    console.log(`\n${ok ? '✅' : '❌'} ${c.id} — ${c.title}`);
    md.push(`## ${ok ? '✅' : '❌'} ${c.id} — ${c.title}`, '', `> ${c.brief}`, '', '| | attendu | obtenu | note |', '|---|---|---|---|');
    for (const x of checks) {
      console.log(`   ${x.skipped ? '·' : x.ok ? '✓' : '✗'} ${x.what} — attendu ${JSON.stringify(x.want)}, obtenu ${JSON.stringify(x.got)}${x.note ? `  (${x.note})` : ''}`);
      md.push(`| ${x.skipped ? '· (sauté)' : x.ok ? '✓' : '✗'} ${x.what} | \`${JSON.stringify(x.want)}\` | \`${JSON.stringify(x.got)}\` | ${x.note ?? ''} |`);
    }
    md.push('');
    if (watcher) await enter('   ⏭  clic sur le bandeau (ou Entrée) pour le cas suivant');
  }
  console.log(`\n${pass} ok, ${fail} en écart`);
  writeFileSync(OUT + 'late-game.md', md.join('\n'));
  await caption('Fin des scénarios');
  // Out of the RAID list: the bench's guests would otherwise crowd it (top 20 by stock).
  const ids = created.map((p) => p.id);
  if (ids.length) await db.update(players).set({ level: 1 }).where(inArray(players.id, ids));
  rl?.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
