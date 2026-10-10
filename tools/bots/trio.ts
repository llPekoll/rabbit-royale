/**
 * THE TRIO — three robot players, a separate database, a clock that runs a
 * day in about ten minutes. The question it answers is the balance one:
 * with today's tuning, does a player get to play when they come back, does
 * the ladder move, do the bombs and planks hold a raid, and when does the
 * shop become the thing they would pay for.
 *
 *   createdb rr_sim && DATABASE_URL=postgres://…/rr_sim bun db:migrate
 *   DATABASE_URL=postgres://…/rr_sim WS_PORT=3013 bun run server/index.ts   (another shell)
 *   DATABASE_URL=postgres://…/rr_sim bun run tools/bots/trio.ts --days 14 --fresh
 *
 * Built from tools/bots/swarm.ts (the island brain and the sim clock are its
 * own), brought to the rules of 30 September 2026: raids from RAID_MIN, one
 * bomb (the `trap`), planks round the potager, no bomb planted on islands.
 *
 * TIME. Every hour of sim time, each clock the bots own is moved back an
 * hour (`warp`). Sessions themselves run at real speed.
 *
 * Output in tools/bots/trio-out/: events.jsonl (every run, raid, purchase),
 * days.jsonl (each bot's state at the end of each day), report.md.
 */
import { io as connect, type Socket } from 'socket.io-client';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { eq } from 'drizzle-orm';

import postgres from 'postgres';
import { db } from '../../src/lib/db';
const sql = postgres(process.env.DATABASE_URL!, { max: 4 });
import { players, inventory, traps as trapsTable, fences as fencesTable } from '../../src/lib/db/schema';
import { grantItem } from '../../src/lib/game/grant';
import { cellOf, farmableTiles, inGrid, indexOf, terrainNeighbors } from '../../src/lib/game/terrainBoard';
import { fieldTiles, isTrappable, isDoorstep, walkableTiles, setBurrowEdits } from '../../src/game/burrow/board';
import { fenceSpans } from '../../src/game/burrow/fence';
import { distanceToField } from '../../src/lib/game/raid';
import { ENERGY, OUT_OF_RUN_ENERGY, RABBIT_LEVELS, RAID, RAID_RUN, SHOP, levelRow, upgradeCost } from '../../config/tuning';

const BASE = process.env.TRIO_URL ?? 'http://localhost:3013';
const OUT = new URL(`./${process.env.TRIO_OUT ?? 'trio-out'}/`, import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const DAYS = Number(args[args.indexOf('--days') + 1]) || 14;
const FRESH = args.includes('--fresh');
const ROSTER_FILE = OUT + 'roster.json';

if (!/rr_sim/.test(process.env.DATABASE_URL ?? '')) {
  console.error('refusing to run: DATABASE_URL must point at the rr_sim database (the trio moves clocks)');
  process.exit(1);
}

// ── The three players ────────────────────────────────────────────────────────
// Léa comes twice a day, reads half the numbers and never pays. Max comes three
// times, reads well, spends carrots on the burrow and on defence. Zoé comes
// five times, reads nearly everything, raids hard, and pays in USDC when the
// bar is empty — the player the shop is priced for.
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
  grief: number;                // chance per tick to bolt/bloop a rival on a shared island
  spend: Spend;
  traps: number;                // share of the held bombs it bothers to bury
  fences: number;               // share of the held planks it bothers to stand
  runs: number;                 // islands per session, at most
  raids: number;                // raids per session, at most (from RAID_MIN)
  exploit?: boolean;
}
// CAST=styles plays the raid rules against the players who live by them: two
// who only raid (they dig only to reach RAID_MIN, or when nobody is left to
// raid), three who only dig and defend, one who does both.
const CAST = process.env.CAST ?? 'trio';
const CASTS: Record<string, Archetype[]> = {
  trio: [
    { name: 'lea-casual', count: 1, sessions: [2, 2], skill: 0.5,  guess: 0.5,  flag: 0.5,  stepMs: [95, 140], raid: 0.2, revenge: 0.3, target: 'random',  grief: 0,    spend: 'none',           traps: 0.5, fences: 0.5, runs: 1, raids: 1 },
    { name: 'max-regular', count: 1, sessions: [3, 3], skill: 0.8, guess: 0.25, flag: 0.8,  stepMs: [95, 140], raid: 0.5, revenge: 0.6, target: 'richest', grief: 0.02, spend: 'carrots',        traps: 1,   fences: 1,   runs: 2, raids: 1 },
    { name: 'zoe-payer', count: 1, sessions: [5, 5], skill: 0.9,  guess: 0.15, flag: 0.9,  stepMs: [95, 140], raid: 0.8, revenge: 0.9, target: 'richest', grief: 0.05, spend: 'money-on-empty', traps: 1,   fences: 1,   runs: 3, raids: 1 },
  ],
  styles: [
    { name: 'raider', count: 2, sessions: [4, 4], skill: 0.8, guess: 0.25, flag: 0.8, stepMs: [95, 140], raid: 1, revenge: 1, target: 'richest', grief: 0.05, spend: 'carrots', traps: 0.3, fences: 0.3, runs: 1, raids: 4 },
    { name: 'digger', count: 2, sessions: [3, 3], skill: 0.85, guess: 0.2, flag: 0.85, stepMs: [95, 140], raid: 0, revenge: 0, target: 'revenge-only', grief: 0, spend: 'carrots', traps: 1, fences: 1, runs: 2, raids: 0 },
    { name: 'digger-casual', count: 1, sessions: [2, 2], skill: 0.55, guess: 0.5, flag: 0.5, stepMs: [95, 140], raid: 0, revenge: 0, target: 'revenge-only', grief: 0, spend: 'none', traps: 0.5, fences: 0.5, runs: 1, raids: 0 },
    { name: 'mixed', count: 1, sessions: [3, 3], skill: 0.8, guess: 0.25, flag: 0.8, stepMs: [95, 140], raid: 0.5, revenge: 0.7, target: 'richest', grief: 0.02, spend: 'carrots', traps: 1, fences: 1, runs: 2, raids: 1 },
  ],
};
const ARCHETYPES: Archetype[] = CASTS[CAST];

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
  await db.transaction((tx) => grantItem(tx as any, b.id, 'energy', 1, Date.now(), {
    currency: 'usdc', cost: Math.round(((SHOP.USDC_PRICES as any).energy ?? 0) * 1e6), paymentId: undefined as any,
  }));
  st(b, 'refill_money');
  event('refill_money', { bot: b.name });
  return pour(b);
}

/** Pour a refill out of the bag (carried since 2026-10-08). False when the bag
 *  is empty, the day's pours are spent, or the tank is already full. */
async function pour(b: Bot): Promise<boolean> {
  const { status, json } = await api(b.token, 'POST', '/api/burrow', { action: 'refill' });
  if (status === 200 && !json?.error) { st(b, 'refill_poured'); return true; }
  st(b, `refill_fail_${json?.error ?? status}`);
  return false;
}

async function buy(b: Bot, kind: string, qty = 1): Promise<boolean> {
  const { status, json } = await api(b.token, 'POST', '/api/shop', { kind, qty });
  if (status === 200 && !json?.error) { st(b, `buy_${kind}`); return true; }
  st(b, `buy_fail_${json?.error ?? status}`);
  return false;
}

/**
 * Get a run's worth into the tank, the archetype's way — or say no. Every
 * "no" is logged with what the player held: that is the moment the shop is
 * for, and what they would have had to pay.
 */
async function ensureEnergy(b: Bot, firstOfSession: boolean, need: number = ENERGY.MIN_TO_CROSS): Promise<boolean> {
  const e = await tank(b);
  if (e >= need) return true;
  if (!firstOfSession) return false;   // played already this session: stopping is fine
  const p = await row(b.id);
  const price = SHOP.PRICES.energy;
  const s = b.arch.spend;
  let how: string | null = (await pour(b)) ? 'bag' : null;
  if (!how && (s === 'money-free' || s === 'money-on-empty')) { if (await fakePay(b)) how = 'usdc'; }
  if (!how && (s === 'carrots' || s === 'money-on-empty') && p && p.stock >= price + RAID.SAFE_FLOOR) {
    if (await buy(b, 'energy') && await pour(b)) how = 'carrots';
  }
  event('empty_on_arrival', { bot: b.name, tank: e, stock: p?.stock, couldPayCarrots: (p?.stock ?? 0) >= price, bought: how, minutesToCross: Math.ceil((need - e) / 0.5) });
  if (how) { st(b, 'refill_' + how); return (await tank(b)) >= need; }
  st(b, 'session_blocked_no_energy');
  return false;
}

// ── The island brain ─────────────────────────────────────────────────────────
interface Cell { dug?: string; adj?: number; hint?: number; flagged?: boolean }

function neighbours8(seed: string, tiles: Set<number>, t: number): number[] {
  const { col, row } = cellOf(seed, t);
  const out: number[] = [];
  for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
    if (!dc && !dr) continue;
    const c = col + dc, r = row + dr;
    if (!inGrid(seed, c, r)) continue;
    const n = indexOf(seed, c, r);
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
  over: any = null; clearing = false; bank: any = null;
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
    for (const s of snap.sheep ?? []) this.sheep.set(s.id, indexOf(this.seed, s.x, s.y));
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
    s.on('banked', (p: any) => { this.bank = p; });
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
        const nb = neighbours8(this.seed, this.tiles, t);
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
    for (const n of neighbours8(this.seed, this.tiles, t)) {
      const c = this.cells.get(n);
      const v = c?.dug && c.dug !== 'bomb' ? c.adj : c?.hint;
      if (v === undefined) continue;
      const nb = neighbours8(this.seed, this.tiles, n);
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
      let m = 99; const a = cellOf(this.seed, t);
      for (const c of this.chests) { const b = cellOf(this.seed, c); m = Math.min(m, Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row))); }
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
  const leaveAt = b.arch.raid >= 0.5 && b.level >= RABBIT_LEVELS.RAID_MIN ? 70 : b.arch.guess < 0.2 ? 32 : 0;
  const t0 = Date.now(); let digs = 0, chestsOpened = 0, flags = 0;


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
      if (roll < 0.6) { s.emit('bloop', { tile: v.tile }); st(b, 'try_bloop'); await sleep(150); continue; }
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
    const adjBomb = neighbours8(run.seed, run.tiles, run.me).find((t) => run.deducedBomb.has(t) && !run.cell(t).flagged && !run.isDug(t));
    if (adjBomb !== undefined && (Math.random() < b.arch.flag || adjBomb === run.taught)) {
      const r = await run.ask('flag', { tile: adjBomb });
      if (r.ok) { flags++; st(b, r.f.correct ? 'x_right' : 'x_wrong'); if (!r.f.correct) anomaly('x_wrong_on_proven_bomb', { bot: b.name, tile: adjBomb, level: run.level, note: 'deduction said bomb — solver bug or mirage/plant' }); }
      else if (r.reason) { rejections['flag_' + r.reason] = (rejections['flag_' + r.reason] ?? 0) + 1; run.deducedBomb.delete(adjBomb); }
      continue;
    }

    let plan = run.plan();
    let guessed = false;
    if (!plan) {
      // A player keeps going while the bar allows it: stuck on a proven board they
      // guess the likeliest tile. `guess` is how low the bar may run before they
      // stop betting and walk home instead (a careful player keeps a reserve).
      const reserve = Math.round((1 - b.arch.guess) * 40);
      if (run.energy <= reserve && !run.first) { endReason = 'no_safe_move_went_home'; break; }
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
    if (dig) digs++;
    if (dig?.content === 'bomb') { st(b, 'bombs_hit'); if (!guessed) anomaly('bomb_on_proven_safe', { bot: b.name, tile: dig.tile, level: run.level }); }
    if (dig?.content === 'chest') { st(b, 'chests'); chestsOpened++; }
  }

  if (!run.over && !['left_to_keep_energy', 'no_safe_move_went_home'].includes(endReason) && Date.now() >= deadline) endReason = 'time_cap';
  // Leave, as Godot does (walk home, or "dig again"). What the run's chests
  // gave rides on `banked` — items, as the server grants them.
  s.emit('leave');
  for (let w = 0; w < 15 && !run.bank; w++) await sleep(100);
  const bank = run.bank;
  await sleep(200);
  s.removeAllListeners();
  const chestLoot: Record<string, number> = bank?.loot ?? {};
  for (const [k, v] of Object.entries(chestLoot)) st(b, 'loot_' + k, Number(v) || 0);

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
  event('run', { bot: b.name, arch: b.arch.name, level: run.level, digs, walks: steps - digs, flags, chestsOpened, chestLoot, simSeconds: Math.round((Date.now() - t0) / 1000), cleared: !!run.over?.cleared, first: run.first, endReason, steps, startEnergy, endEnergy: run.energy, carrots: run.carrots, chestsLeft: run.chests.size, shared: others.length, joinedDug, joinedChests, seed: joinedSeed, rejections });
  return endReason;
}

// ── Burrow: garden, bombs, planks, upgrades, raids ───────────────────────────
async function tendBurrow(b: Bot) {
  const h = await api(b.token, 'POST', '/api/burrow', { action: 'harvest' });
  if (h.status === 200) { st(b, 'harvests'); st(b, 'harvested', Number(h.json?.harvested ?? h.json?.gained ?? 0)); }

  let p = await row(b.id);
  if (!p) return;
  // The burrow first: everyone upgrades once the stock clears the price and the floor.
  while (p && p.stock >= upgradeCost(p.burrowLevel) + RAID.SAFE_FLOOR) {
    const u = await api(b.token, 'POST', '/api/burrow', { action: 'upgrade' });
    if (u.status !== 200) { st(b, 'upgrade_err_' + (u.json?.error ?? u.status)); break; }
    st(b, 'upgrades'); event('upgrade', { bot: b.name, to: p.burrowLevel + 1, cost: upgradeCost(p.burrowLevel) });
    p = await row(b.id);
  }
  if (!p) return;

  // Defence is bought once raids are possible, by the players who spend.
  if (b.level >= RABBIT_LEVELS.RAID_MIN - 1 && b.arch.spend !== 'none') {
    const ts = await api(b.token, 'GET', '/api/traps');
    const owned = Number(ts.json?.held ?? 0) + (ts.json?.armed?.length ?? 0) + (ts.json?.rearming?.length ?? 0);
    if (owned < 8 && p.stock >= SHOP.PRICES.trap + 800) { if (await buy(b, 'trap')) event('buy', { bot: b.name, item: 'trap', price: SHOP.PRICES.trap }); }
    const fs = await api(b.token, 'GET', '/api/fences');
    const fOwned = Number(fs.json?.held ?? 0) + (fs.json?.placed?.length ?? 0);
    if (fOwned < 6 && p.stock >= SHOP.PRICES.fence + 800) { if (await buy(b, 'fence')) event('buy', { bot: b.name, item: 'fence', price: SHOP.PRICES.fence }); }
  }

  // Bury what the archetype bothers to.
  const ts = await api(b.token, 'GET', '/api/traps');
  const free = Math.min(Number(ts.json?.held ?? 0), Math.max(0, Number(ts.json?.maxPlaced ?? 8) - (ts.json?.armed?.length ?? 0) - (ts.json?.rearming?.length ?? 0)));
  const want = Math.round(free * b.arch.traps);
  if (want > 0) {
    // Buried where a raider walks: the tiles closest to the field first, past the doorstep.
    const dist = distanceToField(b.id);
    const taken = new Set<number>([...(ts.json?.armed ?? []), ...(ts.json?.rearming ?? []).map((r: any) => r.tile ?? r.trap?.tile)]);
    const cands = walkableTiles(b.id).filter((t) => isTrappable(b.id, t) && !isDoorstep(b.id, t) && !taken.has(t))
      .sort((x, y) => (dist.get(x) ?? 99) - (dist.get(y) ?? 99) + (Math.random() - 0.5) * 2);
    for (let i = 0; i < want && cands.length; i++) {
      const tile = cands.shift()!;
      const r = await api(b.token, 'POST', '/api/traps', { tile });
      if (r.status === 200) st(b, 'traps_buried'); else { st(b, 'trap_err_' + (r.json?.error ?? r.status)); }
    }
  }
  // Stand the planks it holds.
  const fs = await api(b.token, 'GET', '/api/fences');
  let fWant = Math.round(Number(fs.json?.held ?? 0) * b.arch.fences);
  const offers: Array<{ tile: number; side: string }> = [...(fs.json?.offers ?? [])];
  while (fWant > 0 && offers.length) {
    const o = offers.splice(Math.floor(Math.random() * offers.length), 1)[0];
    const r = await api(b.token, 'POST', '/api/fences', { tile: o.tile, side: o.side });
    if (r.status === 200) { st(b, 'fences_stood'); fWant--; } else st(b, 'fence_err_' + (r.json?.error ?? r.status));
  }
}

async function raid(b: Bot) {
  if (b.level < RABBIT_LEVELS.RAID_MIN) return;
  const list = await api(b.token, 'GET', '/api/raid');
  if (list.json?.raid) { await api(b.token, 'DELETE', '/api/raid'); st(b, 'raid_leftover_abandoned'); }
  const all: any[] = list.json?.targets ?? [];
  const targets = all.filter((t: any) => !t.shielded);
  if (!all.length) { st(b, 'raid_no_target_listed'); return; }
  if (!targets.length) { st(b, 'raid_all_shielded'); return; }
  const revengeIds = [...b.raidedBy].filter((id) => targets.some((t) => t.id === id));
  let target: any;
  if (revengeIds.length && Math.random() < b.arch.revenge) { target = targets.find((t) => t.id === pick(revengeIds)); st(b, 'revenge_raids'); }
  else if (b.arch.target === 'revenge-only') return;
  else if (b.arch.target === 'richest') target = [...targets].sort((x, y) => (y.stock + y.garden) - (x.stock + x.garden))[0];
  else if (b.arch.target === 'weakest') target = [...targets].sort((x, y) => x.stock - y.stock)[0];
  else target = pick(targets);
  if (!target) { st(b, 'raid_no_target'); return; }

  const tankBefore = await tank(b);
  const enter = await api(b.token, 'POST', '/api/raid', { defenderId: target.id });
  if (enter.status !== 200) { st(b, 'raid_refused_' + (enter.json?.error ?? enter.status)); event('raid_refused', { bot: b.name, victim: target.name, why: enter.json?.error ?? enter.status, tank: tankBefore }); return; }
  st(b, 'raids_started');
  const defBefore = await row(target.id);
  let view = enter.json.raid;
  setBurrowEdits(target.id, view.defender?.edits ?? null);
  const dist = distanceToField(target.id);
  const field = new Set(fieldTiles(target.id));
  const clue = new Map<number, number | null>();
  let outcome: any = null, n = 0, sprung = 0, steps = 0;
  while (!outcome && n++ < 60) {
    for (const v of view.view ?? []) clue.set(v.tile, v.clue);
    const moves: number[] = view.steps ?? [];
    if (!moves.length) break;
    const here = clue.get(view.tile) ?? 0;
    const walked = new Set<number>(view.walked ?? []);
    const score = (t: number) => (dist.get(t) ?? 50) + (walked.has(t) ? 3 : 0) + (here && !walked.has(t) ? Math.random() * 2 * (1 - b.arch.skill) + 1 : 0) + (field.has(t) ? -100 : 0);
    const next = moves.sort((x, y) => score(x) - score(y))[0];
    const r = await api(b.token, 'PATCH', '/api/raid', { tile: next });
    if (r.status !== 200) { st(b, 'raid_step_err_' + (r.json?.error ?? r.status)); break; }
    steps++;
    if (r.json?.sprungTrap) { st(b, 'raid_traps_sprung'); sprung++; }
    view = r.json?.raid ?? view;
    outcome = r.json?.outcome ?? null;
    if (view.finished || r.json?.struck) break;
    await sleep(40);
  }
  if (!outcome && !view.finished) { await api(b.token, 'DELETE', '/api/raid'); st(b, 'raid_retreated'); }
  const tankAfter = await tank(b);
  if (outcome) {
    st(b, outcome.reachedField ? 'raids_reached_field' : 'raids_died');
    st(b, 'raid_loot', outcome.loot ?? 0);
    const victim = byId.get(target.id);
    victim?.raidedBy.add(b.id);
    if (victim) { st(victim, 'raided_times'); st(victim, 'raided_lost', outcome.loot ?? 0); }
    const [armed, planks] = await Promise.all([
      sql`select count(*)::int as n from traps where owner_id = ${target.id}`,
      sql`select count(*)::int as n from fences where owner_id = ${target.id}`,
    ]);
    event('raid', {
      bot: b.name, victim: target.name, victimStock: defBefore?.stock, loot: outcome.loot, garden: outcome.lootFromGarden,
      reached: outcome.reachedField, progress: outcome.progress, steps, sprung,
      victimBombs: armed[0].n, victimPlanks: planks[0].n, energySpent: tankBefore - tankAfter,
    });
  }
  await checkRow(b, 'after_raid');
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
    const arrive = await tank(b);
    event('arrive', { bot: b.name, tank: arrive, level: b.level });
    await tendBurrow(b);

    const inc = await sql`select distinct attacker_id from raids where defender_id = ${b.id}`;
    for (const r of inc) b.raidedBy.add(r.attacker_id as string);

    // Raids first for whoever raids: that is what the session is for.
    let raided = 0;
    if (b.level >= RABBIT_LEVELS.RAID_MIN) {
      for (let k = 0; k < b.arch.raids; k++) {
        if (b.arch.raid < 1 && Math.random() > b.arch.raid) break;
        // A raider refills with carrots to raid, as it would to dig: is the loot worth the tank?
        if (b.arch.raids >= 3 && !(await ensureEnergy(b, k === 0, RAID_RUN.TOLL + RAID_RUN.WALK_FLOOR * RAID_RUN.STEP_COST))) break;
        const before = b.stats.raids_started ?? 0;
        await raid(b);
        if ((b.stats.raids_started ?? 0) === before) break;   // refused, nobody to raid, or no energy
        raided++;
      }
    }
    // A pure raider digs to reach RAID_MIN, and when there was nobody to raid.
    const pureRaider = b.arch.raids >= 3;
    const runs = pureRaider && b.level >= RABBIT_LEVELS.RAID_MIN && raided > 0 ? 0 : b.arch.runs;
    let played = 0;
    for (let i = 0; i < runs; i++) {
      if (!(await ensureEnergy(b, played === 0))) break;
      await playRun(b, s);
      played++;
    }
    if (!played && !raided) st(b, 'sessions_without_a_run');
    await tendBurrow(b);
  } catch (e) {
    anomaly('session_crash', { bot: b.name, err: String(e).slice(0, 300) });
  } finally {
    s.disconnect();
    busy.delete(b.id);
  }
}

function planDay() {
  // Sessions spread over the waking day: 8h, 12h, 16h, 19h, 22h and between.
  const slots: Record<number, number[]> = { 1: [19], 2: [8, 19], 3: [8, 13, 20], 4: [8, 12, 17, 21], 5: [7, 11, 14, 18, 22] };
  for (const b of bots) {
    const n = Math.round(rand(b.arch.sessions[0], b.arch.sessions[1] + 0.49));
    b.sessionsToday = (slots[Math.min(5, n)] ?? []).map((h) => h + (Math.random() < 0.3 ? 1 : 0));
  }
}

// ── The day's line, and the report ───────────────────────────────────────────
const lastStats = new Map<string, Record<string, number>>();
async function snapshotDay(day: number) {
  for (const b of bots) {
    const p = await row(b.id);
    const ts = await api(b.token, 'GET', '/api/traps');
    const fs = await api(b.token, 'GET', '/api/fences');
    const prev = lastStats.get(b.id) ?? {};
    const delta: Record<string, number> = {};
    for (const [k, v] of Object.entries(b.stats)) if (v - (prev[k] ?? 0)) delta[k] = v - (prev[k] ?? 0);
    lastStats.set(b.id, { ...b.stats });
    const line = {
      day, bot: b.name, level: p?.level, burrowLevel: p?.burrowLevel, stock: p?.stock, energy: await tank(b), score: p?.seasonScore,
      bombsHeld: Number(ts.json?.held ?? 0), bombsPlaced: (ts.json?.armed?.length ?? 0) + (ts.json?.rearming?.length ?? 0),
      planksHeld: Number(fs.json?.held ?? 0), planksPlaced: fs.json?.placed?.length ?? 0, today: delta,
    };
    appendFileSync(OUT + 'days.jsonl', JSON.stringify(line) + '\n');
  }
}

function summary() {
  const out = { simHour, day: Math.floor(simHour / 24), counters, bots: bots.map((b) => ({ name: b.name, level: b.level, stats: b.stats })) };
  writeFileSync(OUT + 'summary.json', JSON.stringify(out, null, 1));
  return out;
}

async function main() {
  const h = await fetch(BASE + '/health').then((r) => r.json()).catch(() => null);
  if (!h) throw new Error(`no rr-ws at ${BASE}`);
  if (FRESH) for (const f of ['events.jsonl', 'anomalies.jsonl', 'days.jsonl']) writeFileSync(OUT + f, '');
  await loadOrCreateRoster();
  for (const b of bots) await checkRow(b, 'boot');
  console.log(`trio: ${bots.length} bots, ${DAYS} sim days against ${BASE}`);

  for (let day = 0; day < DAYS; day++) {
    planDay();
    for (let hour = 0; hour < 24; hour++) {
      simHour = day * 24 + hour;
      const due = bots.filter((b) => b.sessionsToday.includes(hour));
      if (due.length) {
        const t0 = Date.now();
        await Promise.all(due.map((b, i) => sleep(i * 120).then(() => session(b))));
        console.log(`day ${day} ${String(hour).padStart(2, '0')}h — ${due.map((b) => b.name.split('-')[1]).join(',')} in ${Math.round((Date.now() - t0) / 1000)}s · levels ${bots.map((b) => b.level).join('/')}`);
        summary();
      }
      await warp(1);
    }
    await snapshotDay(day);
  }
  summary();
  await sql.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
