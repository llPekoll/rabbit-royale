/**
 * THE SWARM — 50 robot players against a LOCAL rr-ws, to find what breaks.
 *
 *   WS_PORT=3011 bun run server/index.ts        (in another shell)
 *   bun run tools/bots/swarm.ts [--days 12] [--fresh]
 *
 * Every bot is a real guest (POST /api/auth/guest), plays through the real
 * socket and the real /api routes, and starts from zero: the tutorial, then
 * levels 1 → 10. Nobody is given a level. At 10 they raid, strike, plant and
 * shove each other, live.
 *
 * TIME. Regen is 30 an hour, so a real night would give each bot a run or two.
 * The swarm runs a SIMULATED clock instead: between two sim hours (never
 * during a session) every time column the bots own is moved back one hour —
 * the same thing as that hour having passed for them. Sessions themselves run
 * in real time, so live meetings on an island are real.
 *
 * MONEY. A "paying" bot tops up through `grantItem` with a USDC receipt: the
 * exact call /api/shop/pay makes once a transfer is confirmed on chain, minus
 * the chain. The five-a-day cap is checked the way the route checks it.
 *
 * Archetypes and their shares come from published player research (see
 * ARCHETYPES). Everything lands in tools/bots/out/: events.jsonl (every
 * notable thing), anomalies.jsonl (invariant breaks), summary.json.
 */
import { io as connect, type Socket } from 'socket.io-client';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { eq, inArray, sql as raw } from 'drizzle-orm';

import postgres from 'postgres';
import { db } from '../../src/lib/db';
const sql = postgres(process.env.DATABASE_URL!, { max: 4 });
import { players, inventory } from '../../src/lib/db/schema';
import { grantItem } from '../../src/lib/game/grant';
import { farmableTiles, terrainNeighbors } from '../../src/lib/game/terrainBoard';
import { toColRow, toIndex, COLS, ROWS } from '../../src/config/gridConfig';
import { burrowNeighbors, fieldTiles, isTrappable, isDoorstep, walkableTiles, setBurrowEdits } from '../../src/game/burrow/board';
import { distanceToField } from '../../src/lib/game/raid';
import { ENERGY_PACK, OUT_OF_RUN_ENERGY, RABBIT_LEVELS, RAID, SHOP, levelRow } from '../../config/tuning';

const BASE = process.env.SWARM_URL ?? 'http://localhost:3011';
const OUT = new URL('./out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const DAYS = Number(args[args.indexOf('--days') + 1]) || 12;
const FRESH = args.includes('--fresh');
const ROSTER_FILE = OUT + 'roster.json';

// ── Archetypes ───────────────────────────────────────────────────────────────
// Shares: Bartle/Yee for the motivation split, GameAnalytics 2025 for session
// counts, Mistplay 2024 for when payers pay, griefing/cheating surveys for the
// killer and exploiter rows. Skill numbers are assumptions (no published
// minesweeper error rates exist); see the report that came with this file.
type Spend = 'none' | 'carrots' | 'money-on-empty' | 'money-free';
interface Archetype {
  name: string; count: number;
  sessions: [number, number];   // per sim day
  skill: number;                // chance a given deduction is seen
  guess: number;                // chance to guess when nothing is proven (else go home)
  flag: number;                 // chance to X a proven bomb next to it
  stepMs: [number, number];
  raid: number; revenge: number;
  target: 'richest' | 'weakest' | 'random' | 'revenge-only';
  grief: number;                // chance per tick, at 10, to shove/strike/plant a rival
  spend: Spend;
  traps: number;                // share of the free traps it bothers to bury
  exploit?: boolean;
}
const ARCHETYPES: Archetype[] = [
  { name: 'tourist',  count: 5,  sessions: [1, 2],  skill: 0.2,  guess: 0.8,  flag: 0.2, stepMs: [180, 400], raid: 0,    revenge: 0,   target: 'random',  grief: 0,    spend: 'none',           traps: 0 },
  { name: 'casual',   count: 14, sessions: [3, 4],  skill: 0.45, guess: 0.5,  flag: 0.5, stepMs: [150, 350], raid: 0.1,  revenge: 0.3, target: 'random',  grief: 0.02, spend: 'none',           traps: 0.4 },
  { name: 'solver',   count: 7,  sessions: [3, 3],  skill: 0.95, guess: 0.05, flag: 0.95, stepMs: [150, 300], raid: 0.2, revenge: 0.4, target: 'richest', grief: 0.01, spend: 'carrots',        traps: 1 },
  { name: 'grinder',  count: 8,  sessions: [6, 8],  skill: 0.7,  guess: 0.2,  flag: 0.8, stepMs: [110, 220], raid: 0.5,  revenge: 0.6, target: 'richest', grief: 0.05, spend: 'carrots',        traps: 1 },
  { name: 'raider',   count: 4,  sessions: [5, 5],  skill: 0.6,  guess: 0.3,  flag: 0.6, stepMs: [110, 220], raid: 0.9,  revenge: 0.9, target: 'weakest', grief: 0.25, spend: 'carrots',        traps: 0.5 },
  { name: 'turtle',   count: 6,  sessions: [2, 3],  skill: 0.75, guess: 0.15, flag: 0.8, stepMs: [150, 300], raid: 0.05, revenge: 0.7, target: 'revenge-only', grief: 0, spend: 'carrots',   traps: 1 },
  { name: 'exploiter',count: 3,  sessions: [8, 8],  skill: 0.5,  guess: 0.9,  flag: 0.4, stepMs: [95, 120],  raid: 0.6,  revenge: 0.5, target: 'weakest', grief: 0.3,  spend: 'none',           traps: 0.3, exploit: true },
  { name: 'minnow',   count: 2,  sessions: [4, 5],  skill: 0.6,  guess: 0.25, flag: 0.6, stepMs: [130, 260], raid: 0.4,  revenge: 0.6, target: 'richest', grief: 0.05, spend: 'money-on-empty', traps: 0.7 },
  { name: 'whale',    count: 1,  sessions: [10, 12],skill: 0.7,  guess: 0.2,  flag: 0.7, stepMs: [110, 200], raid: 0.8,  revenge: 0.9, target: 'richest', grief: 0.15, spend: 'money-free',     traps: 1 },
];

// ── Logging ──────────────────────────────────────────────────────────────────
let simHour = 0;
const counters: Record<string, number> = {};
const bump = (k: string, n = 1) => { counters[k] = (counters[k] ?? 0) + n; };
function event(kind: string, data: Record<string, unknown> = {}) {
  appendFileSync(OUT + 'events.jsonl', JSON.stringify({ h: simHour, t: Date.now(), kind, ...data }) + '\n');
}
function anomaly(kind: string, data: Record<string, unknown> = {}) {
  bump('anomaly:' + kind);
  appendFileSync(OUT + 'anomalies.jsonl', JSON.stringify({ h: simHour, t: Date.now(), kind, ...data }) + '\n');
  console.log(`  !! ${kind}`, JSON.stringify(data).slice(0, 220));
}
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── HTTP ─────────────────────────────────────────────────────────────────────
async function api(token: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 200) }; }
  if (res.status >= 500) anomaly('http_5xx', { method, path, status: res.status, body: json });
  return { status: res.status, json };
}

// ── Bots ─────────────────────────────────────────────────────────────────────
interface Bot {
  id: string; token: string; name: string; arch: Archetype;
  level: number; lastLevel: number;
  reachedTenAtHour?: number;
  raidedBy: Set<string>;
  sessionsToday: number[];
  stats: Record<string, number>;
}
const bots: Bot[] = [];
const byId = new Map<string, Bot>();
const st = (b: Bot, k: string, n = 1) => { b.stats[k] = (b.stats[k] ?? 0) + n; bump(k, n); };

async function loadOrCreateRoster() {
  if (!FRESH && existsSync(ROSTER_FILE)) {
    const saved = JSON.parse(readFileSync(ROSTER_FILE, 'utf8')) as Array<{ id: string; token: string; name: string; arch: string }>;
    for (const s of saved) {
      const arch = ARCHETYPES.find((a) => a.name === s.arch)!;
      const b: Bot = { ...s, arch, level: 1, lastLevel: 1, raidedBy: new Set(), sessionsToday: [], stats: {} };
      bots.push(b); byId.set(b.id, b);
    }
    console.log(`roster: ${bots.length} bots reloaded`);
    return;
  }
  let n = 0;
  for (const arch of ARCHETYPES) {
    for (let i = 0; i < arch.count; i++) {
      const { json } = await api(null, 'POST', '/api/auth/guest');
      if (!json?.token) throw new Error('guest failed: ' + JSON.stringify(json));
      const name = `Bot-${arch.name}-${String(++n).padStart(2, '0')}`;
      await db.update(players).set({ name }).where(eq(players.id, json.player.id));
      const b: Bot = { id: json.player.id, token: json.token, name, arch, level: 1, lastLevel: 1, raidedBy: new Set(), sessionsToday: [], stats: {} };
      bots.push(b); byId.set(b.id, b);
    }
  }
  writeFileSync(ROSTER_FILE, JSON.stringify(bots.map((b) => ({ id: b.id, token: b.token, name: b.name, arch: b.arch.name })), null, 1));
  console.log(`roster: ${bots.length} bots created`);
}

// ── Sim clock ────────────────────────────────────────────────────────────────
/** One hour passes for every bot: every clock they own moves back an hour. */
async function warp(hours = 1) {
  const ids = bots.map((b) => b.id);
  const iv = `${hours} hours`;
  await sql`update players set
      energy_updated_at = energy_updated_at - ${iv}::interval,
      garden_collected_at = garden_collected_at - ${iv}::interval,
      traps_claimed_at = traps_claimed_at - ${iv}::interval,
      shielded_until = shielded_until - ${iv}::interval,
      smoke_until = smoke_until - ${iv}::interval,
      watered_until = watered_until - ${iv}::interval,
      fertilised_until = fertilised_until - ${iv}::interval,
      energy_packs_since = energy_packs_since - ${iv}::interval
    where id = any(${ids})`;
  await sql`update traps set placed_at = placed_at - ${iv}::interval, sprung_at = sprung_at - ${iv}::interval where owner_id = any(${ids})`;
  await sql`update raid_runs set started_at = started_at - ${iv}::interval, ended_at = ended_at - ${iv}::interval, struck_at = struck_at - ${iv}::interval
    where attacker_id = any(${ids}) or defender_id = any(${ids})`;
  await sql`update raids set created_at = created_at - ${iv}::interval where attacker_id = any(${ids}) or defender_id = any(${ids})`;
}

async function row(id: string) {
  return db.query.players.findFirst({ where: eq(players.id, id) });
}

/** What every player row must satisfy whatever just happened to it. */
async function checkRow(b: Bot, where: string) {
  const p = await row(b.id);
  if (!p) return anomaly('player_row_gone', { bot: b.name, where });
  if (p.energy < 0 || p.energy > OUT_OF_RUN_ENERGY.MAX) anomaly('energy_out_of_range', { bot: b.name, where, energy: p.energy });
  if (p.stock < 0) anomaly('negative_stock', { bot: b.name, where, stock: p.stock });
  if (p.seasonScore < 0) anomaly('negative_score', { bot: b.name, where, score: p.seasonScore });
  if (p.level < b.lastLevel) anomaly('level_went_down', { bot: b.name, where, from: b.lastLevel, to: p.level });
  if (p.level > b.lastLevel + 1) anomaly('level_skipped', { bot: b.name, where, from: b.lastLevel, to: p.level });
  if (p.level < 1 || p.level > RABBIT_LEVELS.MAX) anomaly('level_out_of_range', { bot: b.name, where, level: p.level });
  b.lastLevel = p.level; b.level = p.level;
  if (b.level >= 10 && b.reachedTenAtHour === undefined) { b.reachedTenAtHour = simHour; event('reached_10', { bot: b.name, arch: b.arch.name }); console.log(`  ★ ${b.name} reached level 10 at sim hour ${simHour}`); }
  return p;
}

/** The tank as the server reads it now (regen folded in). */
async function tank(b: Bot): Promise<number> {
  const { json } = await api(b.token, 'GET', '/api/burrow');
  return Number(json?.player?.energy ?? 0);
}

// ── Money ────────────────────────────────────────────────────────────────────
/** A refill "paid in USDC": the same grant the pay route makes after the chain. */
async function fakePay(b: Bot): Promise<boolean> {
  const p = await row(b.id);
  if (!p) return false;
  const since = p.energyPacksSince?.getTime() ?? 0;
  const inWindow = Date.now() - since < ENERGY_PACK.WINDOW_MS ? p.energyPacksBought ?? 0 : 0;
  if (inWindow >= ENERGY_PACK.MAX_PER_DAY) { st(b, 'refill_capped'); return false; }
  await db.transaction((tx) => grantItem(tx as any, b.id, 'energy', 1, Date.now(), {
    currency: 'usdc', cost: Math.round(((SHOP.USDC_PRICES as any).energy ?? 0) * 1e6), paymentId: undefined as any,
  }));
  st(b, 'refill_money');
  event('refill_money', { bot: b.name });
  return true;
}

async function buy(b: Bot, kind: string, qty = 1): Promise<boolean> {
  const { status, json } = await api(b.token, 'POST', '/api/shop', { kind, qty });
  if (status === 200 && !json?.error) { st(b, `buy_${kind}`); return true; }
  st(b, `buy_fail_${json?.error ?? status}`);
  return false;
}

/** Get a run's worth into the tank, the archetype's way — or say no. */
async function ensureEnergy(b: Bot, need = 40): Promise<boolean> {
  let e = await tank(b);
  if (e >= need) return true;
  const s = b.arch.spend;
  if (s === 'money-free' || s === 'money-on-empty') {
    if (s === 'money-free' || e < 10 || Math.random() < 0.5) if (await fakePay(b)) return (await tank(b)) >= need;
  }
  if (s === 'carrots' || s === 'money-on-empty') {
    const p = await row(b.id);
    const price = (SHOP.PRICES as any).energy as number;
    if (p && p.stock >= price + 300 && Math.random() < 0.6) {
      if (await buy(b, 'energy')) { e = await tank(b); return e >= need; }
    }
  }
  st(b, 'session_skipped_no_energy');
  return false;
}

// ── The island brain ─────────────────────────────────────────────────────────
interface Cell { dug?: string; adj?: number; hint?: number; flagged?: boolean }

function neighbours8(tiles: Set<number>, t: number): number[] {
  const { col, row } = toColRow(t);
  const out: number[] = [];
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
    if (!dc && !dr) continue;
    const c = col + dc, r = row + dr;
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
    const n = toIndex(c, r);
    if (tiles.has(n)) out.push(n);
  }
  return out;
}

class IslandRun {
  socket!: Socket;
  seed = ''; level = 1; first = false; taught: number | null = null;
  tiles = new Set<number>();
  cells = new Map<number, Cell>();
  chests = new Set<number>();
  rabbits = new Map<string, { tile: number; alive: boolean; level?: number; name?: string }>();
  sheep = new Map<string, number>();
  me = 0; energy = 0; carrots = 0; alive = true;
  over: any = null; clearing = false;
  stunnedUntil = 0;
  pending: ((v: any) => void) | null = null;
  deducedBomb = new Set<number>();
  deducedSafe = new Set<number>();
  lastEnergyEvent = 0;

  constructor(public b: Bot) {}

  cell(t: number) { let c = this.cells.get(t); if (!c) { c = {}; this.cells.set(t, c); } return c; }
  isBomb(t: number) { const c = this.cells.get(t); return c?.dug === 'bomb' || !!c?.flagged || this.deducedBomb.has(t); }
  isSafe(t: number) { const c = this.cells.get(t); return (!!c?.dug && c.dug !== 'bomb') || c?.hint !== undefined || this.chests.has(t) || this.deducedSafe.has(t); }
  isDug(t: number) { return !!this.cells.get(t)?.dug; }

  load(snap: any) {
    this.seed = snap.seed; this.level = snap.level ?? 0; this.first = !!snap.first;
    this.taught = snap.taughtBomb ?? null;
    this.tiles = new Set(farmableTiles(this.seed));
    for (const r of snap.revealed ?? []) Object.assign(this.cell(r.tile), { dug: r.content, adj: r.adjacent });
    for (const h of snap.hinted ?? []) this.cell(h.tile).hint = h.adjacent;
    for (const f of snap.flagged ?? []) this.cell(f).flagged = true;
    for (const c of snap.chests ?? []) this.chests.add(c.tile);
    for (const r of snap.rabbits ?? []) this.rabbits.set(r.playerId, { tile: r.tile, alive: r.alive, name: r.name });
    for (const s of snap.sheep ?? []) this.sheep.set(s.id, toIndex(s.x, s.y));
    const mine = this.rabbits.get(this.b.id);
    if (mine) { this.me = mine.tile; }
    const self = (snap.rabbits ?? []).find((r: any) => r.playerId === this.b.id);
    if (self) { this.energy = self.energy; this.carrots = self.carrots; }
  }

  wire(s: Socket) {
    this.socket = s;
    s.on('tile_revealed', (r: any) => {
      Object.assign(this.cell(r.tile), { dug: r.content, adj: r.adjacent });
      this.chests.delete(r.tile);
      if (r.plantedBy && r.dugBy === this.b.id) { st(this.b, 'stepped_on_planted_bomb'); event('planted_bomb_hit', { bot: this.b.name, by: byId.get(r.plantedBy)?.name ?? r.plantedBy }); }
    });
    const hints = (p: any) => { for (const h of p.tiles ?? []) this.cell(h.tile).hint = h.adjacent; };
    s.on('hints_revealed', hints);
    s.on('hints_changed', (p: any) => { hints(p); this.deducedBomb.clear(); this.deducedSafe.clear(); });
    s.on('bomb_flagged', (p: any) => { this.cell(p.tile).flagged = true; });
    s.on('rabbit_moved', (r: any) => this.rabbits.set(r.playerId, { ...(this.rabbits.get(r.playerId) ?? {}), tile: r.tile, alive: r.alive }));
    s.on('rabbit_joined', (r: any) => this.rabbits.set(r.playerId, { tile: r.tile, alive: r.alive, name: r.name }));
    s.on('rabbit_left', (r: any) => { if (!r.grace) this.rabbits.delete(r.playerId); });
    s.on('rabbit_died', (r: any) => { const x = this.rabbits.get(r.playerId); if (x) x.alive = false; });
    s.on('rabbit_energy', (r: any) => { if (r.playerId === this.b.id) { this.energy = r.energy; this.carrots = r.carrots; } });
    s.on('rabbit_pushed', (p: any) => {
      const x = this.rabbits.get(p.playerId); if (x) x.tile = p.to;
      if (p.playerId === this.b.id) {
        this.me = p.to; this.energy = p.energy;
        if (p.stunMs) this.stunnedUntil = Date.now() + p.stunMs;
        st(this.b, p.drowned ? 'got_drowned' : 'got_pushed');
        event(p.drowned ? 'drowned' : 'pushed', { bot: this.b.name, by: byId.get(p.pushedBy)?.name, runOver: p.runOver });
      }
      if (p.pushedBy === this.b.id) st(this.b, p.drowned ? 'drowned_someone' : 'pushed_someone');
    });
    s.on('bomb_hit', (p: any) => {
      const x = this.rabbits.get(p.playerId); if (x) x.tile = p.tile;
      if (p.playerId === this.b.id) { this.me = p.tile; this.stunnedUntil = Date.now() + (p.stunMs ?? 0); }
    });
    s.on('rabbit_struck', (p: any) => {
      if (p.playerId === this.b.id) { st(this.b, 'got_struck'); event('struck', { bot: this.b.name, by: byId.get(p.by)?.name, energy: p.energy }); }
    });
    s.on('lightning_struck', (p: any) => { if (p.castBy === this.b.id) st(this.b, 'lightning_cast'); });
    s.on('lightning_rejected', (p: any) => st(this.b, 'lightning_rejected_' + p.reason));
    s.on('plant_rejected', (p: any) => st(this.b, 'plant_rejected_' + p.reason));
    s.on('bomb_planted', () => st(this.b, 'bomb_planted'));
    s.on('sheep_moved', (p: any) => { for (const f of p.sheep ?? []) this.sheep.set(f.id, f.tile); });
    s.on('eruption', () => { this.clearing = true; });
    s.on('run_over', (p: any) => { this.over = p; this.alive = false; this.pending?.({ over: true }); });
    s.on('move_result', (o: any) => { this.me = o.tile; this.energy = o.energy; this.carrots = o.carrots; this.pending?.({ ok: true, o }); });
    s.on('move_rejected', (o: any) => this.pending?.({ ok: false, reason: o.reason }));
    s.on('flag_result', (f: any) => { if (f.correct) this.cell(f.tile).flagged = true; else this.deducedBomb.delete(f.tile); this.pending?.({ ok: true, f }); });
    s.on('flag_rejected', (o: any) => this.pending?.({ ok: false, reason: o.reason }));
  }

  /** Send one intention and wait for its answer (or a timeout — itself a finding). */
  ask(event_: string, payload: unknown, ms = 4000): Promise<any> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.pending = null; resolve({ timeout: true }); }, ms);
      this.pending = (v) => { clearTimeout(timer); this.pending = null; resolve(v); };
      this.socket.emit(event_, payload);
    });
  }

  /** Minesweeper, to the archetype's eye: each constraint is read with probability `skill`. */
  deduce() {
    const skill = this.b.arch.skill;
    let changed = true, guard = 0;
    while (changed && guard++ < 6) {
      changed = false;
      for (const [t, c] of this.cells) {
        const n = c.dug && c.dug !== 'bomb' ? c.adj : c.hint;
        if (n === undefined || Math.random() > skill) continue;
        const nb = neighbours8(this.tiles, t);
        const unknown = nb.filter((x) => !this.isBomb(x) && !this.isSafe(x));
        if (!unknown.length) continue;
        const rem = n - nb.filter((x) => this.isBomb(x)).length;
        if (rem === 0) { for (const x of unknown) this.deducedSafe.add(x); changed = true; }
        else if (rem === unknown.length) { for (const x of unknown) this.deducedBomb.add(x); changed = true; }
      }
    }
  }

  riskOf(t: number): number {
    let p = levelRow(Math.max(1, this.level)).bombDensity;
    for (const n of neighbours8(this.tiles, t)) {
      const c = this.cells.get(n);
      const v = c?.dug && c.dug !== 'bomb' ? c.adj : c?.hint;
      if (v === undefined) continue;
      const nb = neighbours8(this.tiles, n);
      const unknown = nb.filter((x) => !this.isBomb(x) && !this.isSafe(x)).length;
      if (unknown) p = Math.max(p, (v - nb.filter((x) => this.isBomb(x)).length) / unknown);
    }
    return p;
  }

  occupied(): Set<number> {
    const s = new Set<number>(this.sheep.values());
    for (const [id, r] of this.rabbits) if (id !== this.b.id) s.add(r.tile);
    return s;
  }

  /** BFS over ground we can stand on for free or have proven safe. */
  plan(): { path: number[]; target: number; kind: string } | null {
    const occ = this.occupied();
    const prev = new Map<number, number>([[this.me, -1]]);
    const q = [this.me];
    const found: Array<{ t: number; d: number; kind: string }> = [];
    const dist = new Map<number, number>([[this.me, 0]]);
    while (q.length) {
      const t = q.shift()!;
      for (const n of terrainNeighbors(this.seed, t)) {
        if (prev.has(n) || occ.has(n) || !this.tiles.has(n) || this.isBomb(n)) continue;
        if (!this.isSafe(n)) continue;
        prev.set(n, t); dist.set(n, dist.get(t)! + 1);
        if (!this.isDug(n)) found.push({ t: n, d: dist.get(n)!, kind: this.chests.has(n) ? 'chest' : 'safe' });
        else q.push(n);
      }
    }
    if (!found.length) return null;
    const chestDist = (t: number) => {
      let m = 99; const a = toColRow(t);
      for (const c of this.chests) { const b = toColRow(c); m = Math.min(m, Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row))); }
      return m;
    };
    found.sort((x, y) => (x.kind === 'chest' ? -100 : 0) + x.d + 0.7 * chestDist(x.t) - ((y.kind === 'chest' ? -100 : 0) + y.d + 0.7 * chestDist(y.t)));
    const target = found[0].t;
    const path: number[] = [];
    for (let t = target; t !== this.me; t = prev.get(t)!) path.unshift(t);
    return { path, target, kind: found[0].kind };
  }

  /** The least risky unknown cell we can step onto from ground we can reach. */
  guessTarget(): { path: number[]; target: number; risk: number } | null {
    const occ = this.occupied();
    const prev = new Map<number, number>([[this.me, -1]]);
    const q = [this.me];
    let best: { t: number; risk: number } | null = null;
    while (q.length) {
      const t = q.shift()!;
      for (const n of terrainNeighbors(this.seed, t)) {
        if (prev.has(n) || occ.has(n) || !this.tiles.has(n) || this.isBomb(n)) continue;
        prev.set(n, t);
        if (this.isDug(n)) { q.push(n); continue; }
        const risk = this.riskOf(n) + Math.random() * 0.02;
        if (!best || risk < best.risk) best = { t: n, risk };
      }
    }
    if (!best) return null;
    const path: number[] = [];
    for (let t = best.t; t !== this.me; t = prev.get(t)!) path.unshift(t);
    return { path, target: best.t, risk: best.risk };
  }
}

/** One run, from `join` to `leave`. Returns why it ended. */
async function playRun(b: Bot, s: Socket): Promise<string> {
  const run = new IslandRun(b);
  run.wire(s);
  const joined = await new Promise<any>((resolve) => {
    const t = setTimeout(() => resolve({ timeout: true }), 8000);
    s.once('island', (snap) => { clearTimeout(t); resolve(snap); });
    s.once('error_msg', (e) => { clearTimeout(t); resolve({ error: e }); });
    s.emit('join');
    // THE EXPLOITER'S DOUBLE JOIN: a second ask on the same socket, at once.
    if (b.arch.exploit && Math.random() < 0.3) { s.emit('join'); st(b, 'exploit_double_join'); }
  });
  if (joined.timeout) { anomaly('join_timeout', { bot: b.name }); return 'join_timeout'; }
  if (joined.error) { st(b, 'join_refused_' + joined.error.code); return 'join_' + joined.error.code; }
  run.load(joined);
  const joinedDug = (joined.revealed ?? []).length, joinedChests = `${joined.chestsTaken}/${joined.chestsTotal}`, joinedSeed = String(joined.seed).slice(0, 8);
  const before = await row(b.id);
  st(b, 'runs');
  if (run.first) st(b, 'tutorial_runs');
  st(b, `runs_L${run.level || 0}`);
  const others = [...run.rabbits.keys()].filter((id) => id !== b.id);
  if (others.length) { st(b, 'runs_shared'); event('shared_island', { bot: b.name, level: run.level, with: others.map((o) => byId.get(o)?.name ?? o) }); }
  if (run.level && run.level <= 5 && others.length) anomaly('solo_level_shared', { bot: b.name, level: run.level, others: others.length });
  if (run.level >= 6 && run.level <= 9 && others.length > 1) anomaly('duo_level_overfull', { bot: b.name, level: run.level, others: others.length });
  const startEnergy = run.energy;
  let steps = 0, wasted = 0, rejections: Record<string, number> = {};
  const deadline = Date.now() + 6 * 60_000;
  let endReason = 'running';
  const leaveAt = b.arch.raid >= 0.5 && b.level >= 10 ? 70 : b.arch.guess < 0.2 ? 32 : 0;

  // Exploiter at low level: probe the level gates from the inside.
  if (b.arch.exploit && run.level < 10) {
    s.emit('lightning', { tile: run.me }); // must be refused: level_locked or none-held
  }

  while (Date.now() < deadline) {
    if (run.over) { endReason = run.over.cleared ? 'cleared' : run.over.tutorialDone ? 'tutorial_done' : 'dry'; break; }
    if (run.clearing) { await sleep(300); continue; }
    if (Date.now() < run.stunnedUntil) { await sleep(run.stunnedUntil - Date.now() + 20); continue; }
    await sleep(rand(...b.arch.stepMs));
    if (run.over) continue;

    // PvP, only where the server allows it — the bot tries anyway sometimes.
    const rivals = [...run.rabbits.entries()].filter(([id, r]) => id !== b.id && r.alive);
    if (rivals.length && Math.random() < b.arch.grief) {
      const [vid, v] = pick(rivals);
      const roll = Math.random();
      if (roll < 0.35) { s.emit('lightning', { tile: v.tile }); st(b, 'try_lightning'); await sleep(150); continue; }
      if (roll < 0.6) {
        const spots = neighbours8(run.tiles, v.tile).filter((t) => !run.isDug(t) && run.cell(t).hint === undefined && !run.chests.has(t));
        if (spots.length) { s.emit('plant', { tile: pick(spots) }); st(b, 'try_plant'); await sleep(150); continue; }
      }
      if (terrainNeighbors(run.seed, run.me).includes(v.tile)) {
        const r = await run.ask('move', { tile: v.tile });
        st(b, 'try_shove'); if (!r.ok && r.reason) rejections[r.reason] = (rejections[r.reason] ?? 0) + 1;
        continue;
      }
      void vid;
    }

    // Walk home with a raid's worth, or before the last bomb.
    if (leaveAt && run.energy <= leaveAt && run.energy > 0) { endReason = 'left_to_keep_energy'; break; }

    run.deduce();
    // The tutorial: go mark the taught bomb first.
    if (run.taught !== null && !run.cell(run.taught).flagged) run.deducedBomb.add(run.taught);

    // X a proven bomb next to us.
    const adjBomb = neighbours8(run.tiles, run.me).find((t) => run.deducedBomb.has(t) && !run.cell(t).flagged && !run.isDug(t));
    if (adjBomb !== undefined && (Math.random() < b.arch.flag || adjBomb === run.taught)) {
      const r = await run.ask('flag', { tile: adjBomb });
      if (r.ok) { st(b, r.f.correct ? 'x_right' : 'x_wrong'); if (!r.f.correct) anomaly('x_wrong_on_proven_bomb', { bot: b.name, tile: adjBomb, level: run.level, note: 'deduction said bomb — solver bug or mirage/plant' }); }
      else if (r.reason) { rejections['flag_' + r.reason] = (rejections['flag_' + r.reason] ?? 0) + 1; run.deducedBomb.delete(adjBomb); }
      continue;
    }

    let plan = run.plan();
    let guessed = false;
    if (!plan) {
      if (Math.random() > b.arch.guess && !run.first) { endReason = 'no_safe_move_went_home'; break; }
      const g = run.guessTarget();
      if (!g) { endReason = 'stuck'; wasted++; if (wasted > 30) break; await sleep(300); continue; }
      plan = { path: g.path, target: g.target, kind: 'guess' };
      guessed = true;
    }
    const next = plan.path[0];
    const r = await run.ask('move', { tile: next });
    if (r.timeout) { anomaly('move_timeout', { bot: b.name, tile: next }); wasted++; if (wasted > 20) { endReason = 'timeouts'; break; } continue; }
    if (r.over) continue;
    if (!r.ok) {
      rejections[r.reason] = (rejections[r.reason] ?? 0) + 1;
      wasted++;
      if (r.reason === 'no-energy' || r.reason === 'dead') { endReason = 'rejected_' + r.reason; break; }
      if (wasted > 60) { endReason = 'too_many_rejections'; break; }
      continue;
    }
    steps++;
    if (guessed && plan.path.length === 1) st(b, 'guesses');
    const dig = r.o.dig;
    if (dig?.content === 'bomb') { st(b, 'bombs_hit'); if (!guessed) anomaly('bomb_on_proven_safe', { bot: b.name, tile: dig.tile, level: run.level }); }
    if (dig?.content === 'chest') st(b, 'chests');
  }

  if (!run.over && !['left_to_keep_energy', 'no_safe_move_went_home'].includes(endReason) && Date.now() >= deadline) endReason = 'time_cap';
  // Leave, as Godot does (walk home, or "dig again").
  s.emit('leave');
  await sleep(400);
  s.removeAllListeners();

  const after = await checkRow(b, 'after_run');
  // THE TANK COMES HOME: what the rabbit had is what the burrow has.
  if (after && before) {
    const expected = run.over && !run.over.cleared && !run.over.tutorialDone ? 0 : run.energy + (steps === 0 ? 5 : 0);
    if (Math.abs(after.energy - Math.min(OUT_OF_RUN_ENERGY.MAX, expected)) > 2 && !run.over?.cleared && steps > 0) {
      anomaly('tank_mismatch_after_run', { bot: b.name, rabbitEnergy: run.energy, tank: after.energy, endReason });
    }
    if (steps === 0 && !run.over) st(b, 'looked_only');
  }
  if (run.over?.cleared) { st(b, 'clears'); if (run.over.leveledUp) st(b, 'level_ups'); }
  if (endReason === 'dry' || (run.over && !run.over.cleared && !run.over.tutorialDone)) st(b, 'runs_dry');
  if (run.over?.killedBy) { st(b, 'killed_by_player'); event('killed', { bot: b.name, by: run.over.killedBy }); }
  // Cleared with the last chest on the last point: the ladder should still move.
  if (endReason === 'dry' && run.chests.size === 0 && run.level) anomaly('last_chest_on_empty_bar_no_level', { bot: b.name, level: run.level });
  for (const [k, v] of Object.entries(rejections)) bump('reject:' + k, v);
  event('run', { bot: b.name, arch: b.arch.name, level: run.level, first: run.first, endReason, steps, startEnergy, endEnergy: run.energy, carrots: run.carrots, chestsLeft: run.chests.size, shared: others.length, joinedDug, joinedChests, seed: joinedSeed, rejections });
  return endReason;
}

// ── Burrow: garden, traps, upgrades, raids ───────────────────────────────────
async function tendBurrow(b: Bot) {
  const h = await api(b.token, 'POST', '/api/burrow', { action: 'harvest' });
  if (h.status === 200) st(b, 'harvests');
  // Traps: bury what the archetype bothers to.
  const ts = await api(b.token, 'GET', '/api/traps');
  const free = Math.min(Number(ts.json?.held ?? 0), Math.max(0, Number(ts.json?.maxPlaced ?? 8) - (ts.json?.armed?.length ?? 0) - (ts.json?.rearming?.length ?? 0)));
  const want = Math.round(free * b.arch.traps);
  if (want > 0) {
    const cands = walkableTiles(b.id).filter((t) => isTrappable(b.id, t) && !isDoorstep(b.id, t));
    for (let i = 0; i < want && cands.length; i++) {
      const tile = cands.splice(Math.floor(Math.random() * cands.length), 1)[0];
      const r = await api(b.token, 'POST', '/api/traps', { tile });
      if (r.status === 200) st(b, 'traps_buried'); else st(b, 'trap_err_' + (r.json?.error ?? r.status));
    }
  }
  // Upgrade when rich (grinders and whales first).
  const p = await row(b.id);
  if (p && p.stock > 3000 && ['grinder', 'whale', 'solver', 'turtle'].includes(b.arch.name) && Math.random() < 0.3) {
    const u = await api(b.token, 'POST', '/api/burrow', { action: 'upgrade' });
    if (u.status === 200) st(b, 'upgrades');
  }
  // Stock up on weapons at 10.
  if (b.level >= 10 && p && p.stock > 2500 && b.arch.grief > 0.1) {
    if (Math.random() < 0.5) await buy(b, 'lightning');
    if (Math.random() < 0.5) await buy(b, 'bomb');
  }
}

async function raid(b: Bot) {
  const list = await api(b.token, 'GET', '/api/raid');
  if (list.json?.raid) { await api(b.token, 'DELETE', '/api/raid'); st(b, 'raid_leftover_abandoned'); }
  const targets: any[] = (list.json?.targets ?? []).filter((t: any) => !t.shielded);
  if (b.level < 10) {
    if ((list.json?.targets ?? []).length) anomaly('raid_list_below_10', { bot: b.name, level: b.level, n: list.json.targets.length });
    // An exploiter tries anyway, straight at someone.
    if (b.arch.exploit) {
      const victim = pick(bots.filter((x) => x.id !== b.id));
      const r = await api(b.token, 'POST', '/api/raid', { defenderId: victim.id });
      if (r.status === 200) anomaly('raid_accepted_below_10', { bot: b.name, level: b.level, victim: victim.name, victimLevel: victim.level });
      else st(b, 'raid_refused_' + (r.json?.error ?? r.status));
      if (r.status === 200) await api(b.token, 'DELETE', '/api/raid');
    }
    return;
  }
  let pool = targets;
  const revengeIds = [...b.raidedBy].filter((id) => targets.some((t) => t.id === id));
  let target: any;
  if (revengeIds.length && Math.random() < b.arch.revenge) { target = targets.find((t) => t.id === pick(revengeIds)); st(b, 'revenge_raids'); }
  else if (b.arch.target === 'revenge-only') return;
  else if (b.arch.target === 'richest') target = pool.sort((x, y) => (y.stock + y.garden) - (x.stock + x.garden))[0];
  else if (b.arch.target === 'weakest') target = pool.sort((x, y) => x.stock - y.stock)[0];
  else target = pick(pool);
  if (!target) { st(b, 'raid_no_target'); return; }

  const reveal = b.arch.exploit && Math.random() < 0.5 ? '?reveal=1' : '';
  const enter = await api(b.token, 'POST', '/api/raid' + reveal, { defenderId: target.id });
  if (enter.status !== 200) { st(b, 'raid_refused_' + (enter.json?.error ?? enter.status)); return; }
  st(b, 'raids_started');
  const defBefore = await row(target.id);
  const myBefore = await row(b.id);
  let view = enter.json.raid;
  if (reveal && view.view?.length > 20) { st(b, 'exploit_reveal_worked'); anomaly('raid_reveal_leaks_board', { bot: b.name, tilesSeen: view.view.length }); }
  setBurrowEdits(target.id, view.defender?.edits ?? null);
  const dist = distanceToField(target.id);
  const field = new Set(fieldTiles(target.id));
  const clue = new Map<number, number | null>();
  let outcome: any = null, n = 0;
  // Exploiter: two first steps at once (double toll? double settle?).
  if (b.arch.exploit && view.steps?.length) {
    const t = view.steps[0];
    const [a, c] = await Promise.all([api(b.token, 'PATCH', '/api/raid', { tile: t }), api(b.token, 'PATCH', '/api/raid', { tile: t })]);
    st(b, 'exploit_double_step');
    if (a.status === 200 && c.status === 200) event('double_step_both_ok', { bot: b.name });
    view = (c.json?.raid ?? a.json?.raid) ?? view;
    outcome = a.json?.outcome ?? c.json?.outcome ?? null;
  }
  while (!outcome && n++ < 60) {
    for (const v of view.view ?? []) clue.set(v.tile, v.clue);
    const steps: number[] = view.steps ?? [];
    if (!steps.length) break;
    const here = clue.get(view.tile) ?? 0;
    const walked = new Set<number>(view.walked ?? []);
    const score = (t: number) => (dist.get(t) ?? 50) + (walked.has(t) ? 3 : 0) + (here && !walked.has(t) ? Math.random() * 2 * (1 - b.arch.skill) + 1 : 0) + (field.has(t) ? -100 : 0);
    const next = steps.sort((x, y) => score(x) - score(y))[0];
    const r = await api(b.token, 'PATCH', '/api/raid', { tile: next });
    if (r.status !== 200) { st(b, 'raid_step_err_' + (r.json?.error ?? r.status)); if (r.json?.error === 'no_energy') break; if (r.status >= 400) break; }
    if (r.json?.sprungTrap) st(b, 'raid_traps_sprung');
    view = r.json?.raid ?? view;
    outcome = r.json?.outcome ?? null;
    if (view.finished || r.json?.struck) break;
    await sleep(60);
  }
  if (!outcome && !view.finished) { await api(b.token, 'DELETE', '/api/raid'); st(b, 'raid_retreated'); }
  if (outcome) {
    st(b, outcome.reachedField ? 'raids_reached_field' : 'raids_died');
    st(b, 'raid_loot', outcome.loot ?? 0);
    byId.get(target.id)?.raidedBy.add(b.id);
    event('raid', { bot: b.name, victim: target.name, loot: outcome.loot, garden: outcome.lootFromGarden, reached: outcome.reachedField, progress: outcome.progress });
    const defAfter = await row(target.id);
    const myAfter = await row(b.id);
    if (defBefore && defAfter && myBefore && myAfter) {
      const lost = defBefore.stock - defAfter.stock;
      const stockLoot = (outcome.loot ?? 0) - (outcome.lootFromGarden ?? 0);
      if (defAfter.stock < RAID.SAFE_FLOOR && defBefore.stock >= RAID.SAFE_FLOOR) anomaly('raid_breached_safe_floor', { bot: b.name, victim: target.name, before: defBefore.stock, after: defAfter.stock });
      if (Math.abs(lost - stockLoot) > 1 && lost >= 0) anomaly('raid_stock_mismatch', { bot: b.name, victim: target.name, lost, stockLoot, garden: outcome.lootFromGarden });
      const scoreGain = myAfter.seasonScore - myBefore.seasonScore;
      const scoreLoss = defBefore.seasonScore - defAfter.seasonScore;
      if (scoreGain > scoreLoss + 1) { bump('score_created_by_raid', scoreGain - scoreLoss); event('score_created', { bot: b.name, gain: scoreGain, loss: scoreLoss }); }
    }
  }
  await checkRow(b, 'after_raid');
}

/** A spectator's sabotage: watch someone live and drop a bolt or a bomb on them. */
async function sabotage(b: Bot, s: Socket) {
  const live = bots.filter((x) => x.id !== b.id && busy.has(x.id));
  if (!live.length) return;
  const victim = pick(live);
  const got = await new Promise<any>((resolve) => {
    const t = setTimeout(() => resolve(null), 3000);
    s.once('island', (snap) => { clearTimeout(t); resolve(snap); });
    s.once('error_msg', () => { clearTimeout(t); resolve(null); });
    s.emit('spectate', { playerId: victim.id });
  });
  if (!got) return;
  st(b, 'spectated');
  const vr = (got.rabbits ?? []).find((r: any) => r.playerId === victim.id);
  const lvl = got.level ?? 0;
  const lowLevelTarget = !lvl || lvl < 10 || victim.level < 10 || b.level < 10;
  const revealed = new Set((got.revealed ?? []).map((r: any) => r.tile));
  const hinted = new Set((got.hinted ?? []).map((r: any) => r.tile));
  const chests = new Set((got.chests ?? []).map((c: any) => c.tile));
  const tiles = new Set(farmableTiles(got.seed));
  const spot = vr ? neighbours8(tiles, vr.tile).find((t) => !revealed.has(t) && !hinted.has(t) && !chests.has(t)) : undefined;
  const planted = new Promise<string>((resolve) => {
    const t = setTimeout(() => resolve('silence'), 2000);
    s.once('bomb_planted', () => { clearTimeout(t); resolve('planted'); });
    s.once('plant_rejected', (p: any) => { clearTimeout(t); resolve('rejected:' + p.reason); });
  });
  if (spot !== undefined) {
    s.emit('plant', { tile: spot });
    const res = await planted;
    st(b, 'spectator_plant_' + res.split(':')[0]);
    if (res === 'planted' && lowLevelTarget) anomaly('plant_bypasses_level_lock', { bot: b.name, botLevel: b.level, victim: victim.name, islandLevel: lvl });
  }
  const struck = new Promise<string>((resolve) => {
    const t = setTimeout(() => resolve('silence'), 2000);
    s.once('lightning_struck', () => { clearTimeout(t); resolve('struck'); });
    s.once('lightning_rejected', (p: any) => { clearTimeout(t); resolve('rejected:' + p.reason); });
  });
  if (vr) {
    s.emit('lightning', { tile: vr.tile });
    const res = await struck;
    st(b, 'spectator_lightning_' + res.replace(':', '_'));
    if (res === 'struck' && lowLevelTarget) anomaly('lightning_bypasses_level_lock', { bot: b.name, botLevel: b.level, victim: victim.name, islandLevel: lvl });
  }
  s.emit('leave');
  await sleep(200);
}

// ── Sessions ─────────────────────────────────────────────────────────────────
const busy = new Set<string>();

async function session(b: Bot) {
  busy.add(b.id);
  const s = connect(BASE, { auth: { token: b.token }, transports: ['websocket'], reconnection: false, forceNew: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
      s.once('connect', () => { clearTimeout(t); resolve(); });
      s.once('connect_error', (e) => { clearTimeout(t); reject(e); });
    });
    await checkRow(b, 'session_start');
    st(b, 'sessions');
    await tendBurrow(b);

    // Incoming raids since last time: who to take revenge on.
    const inc = await sql`select distinct attacker_id from raids where defender_id = ${b.id}`;
    for (const r of inc) b.raidedBy.add(r.attacker_id as string);

    // THE EXPLOITER'S RAID DURING A RUN — the free-energy hole, probed.
    const raidFirst = b.level >= 10 && Math.random() < b.arch.raid;
    if (raidFirst && !b.arch.exploit) await raid(b);

    const runs = b.arch.name === 'whale' ? 3 : b.arch.name === 'grinder' ? 2 : 1;
    for (let i = 0; i < runs; i++) {
      if (!(await ensureEnergy(b))) break;
      if (b.arch.exploit && b.level >= 10 && Math.random() < 0.5) {
        // Join, and raid over HTTP while the rabbit stands on the island.
        const tBefore = await tank(b);
        const p = playRun(b, s);
        await sleep(1500);
        await raid(b);
        await p;
        const tAfter = await tank(b);
        event('exploit_raid_during_run', { bot: b.name, tankBefore: tBefore, tankAfter: tAfter });
      } else {
        await playRun(b, s);
      }
    }
    if (b.level >= 10 && Math.random() < b.arch.grief) await sabotage(b, s);
    if (b.level < 10 && b.arch.exploit) { await sabotage(b, s); await raid(b); }
    if (!raidFirst && b.level >= 10 && Math.random() < b.arch.raid) await raid(b);
  } catch (e) {
    anomaly('session_crash', { bot: b.name, err: String(e).slice(0, 300) });
  } finally {
    s.disconnect();
    busy.delete(b.id);
  }
}

function planDay() {
  for (const b of bots) {
    const n = Math.round(rand(b.arch.sessions[0], b.arch.sessions[1] + 0.49));
    const hours = new Set<number>();
    while (hours.size < Math.min(n, 16)) hours.add(7 + Math.floor(Math.random() * 16));
    b.sessionsToday = [...hours];
  }
}

function summary() {
  const byArch: Record<string, any> = {};
  for (const b of bots) {
    const a = (byArch[b.arch.name] ??= { bots: 0, levels: [] as number[], reached10: 0, hoursTo10: [] as number[], stats: {} as Record<string, number> });
    a.bots++; a.levels.push(b.level);
    if (b.reachedTenAtHour !== undefined) { a.reached10++; a.hoursTo10.push(b.reachedTenAtHour); }
    for (const [k, v] of Object.entries(b.stats)) a.stats[k] = (a.stats[k] ?? 0) + v;
  }
  const out = { simHour, day: Math.floor(simHour / 24), counters, byArch, bots: bots.map((b) => ({ name: b.name, level: b.level, reached10: b.reachedTenAtHour, stats: b.stats })) };
  writeFileSync(OUT + 'summary.json', JSON.stringify(out, null, 1));
  return out;
}

async function main() {
  const h = await fetch(BASE + '/health').then((r) => r.json()).catch(() => null);
  if (!h) throw new Error(`no rr-ws at ${BASE} — start it: WS_PORT=3011 bun run server/index.ts`);
  if (FRESH) for (const f of ['events.jsonl', 'anomalies.jsonl']) writeFileSync(OUT + f, '');
  await loadOrCreateRoster();
  for (const b of bots) await checkRow(b, 'boot');
  console.log(`swarm: ${bots.length} bots, ${DAYS} sim days against ${BASE}`);

  for (let day = 0; day < DAYS; day++) {
    planDay();
    for (let hour = 0; hour < 24; hour++) {
      simHour = day * 24 + hour;
      const due = bots.filter((b) => b.sessionsToday.includes(hour));
      if (due.length) {
        const t0 = Date.now();
        // Staggered a little, so a level's players arrive close enough to share.
        await Promise.all(due.map((b, i) => sleep(i * 120).then(() => session(b))));
        const lv = bots.map((b) => b.level);
        console.log(`day ${day} ${String(hour).padStart(2, '0')}h — ${due.length} sessions in ${Math.round((Date.now() - t0) / 1000)}s · levels ${JSON.stringify(histogram(lv))} · anomalies ${Object.entries(counters).filter(([k]) => k.startsWith('anomaly:')).reduce((n, [, v]) => n + v, 0)}`);
        summary();
      }
      await warp(1);
    }
    if (bots.every((b) => b.level >= 10) && day >= 2) console.log('everyone is level 10 — the rest is PvP');
  }
  const s = summary();
  console.log(JSON.stringify(s.counters, null, 1));
  await sql.end();
  process.exit(0);
}

function histogram(xs: number[]) { const h: Record<number, number> = {}; for (const x of xs) h[x] = (h[x] ?? 0) + 1; return h; }

main().catch((e) => { console.error(e); process.exit(1); });
