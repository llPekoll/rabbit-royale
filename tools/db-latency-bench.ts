/**
 * WHAT A FAR DATABASE COSTS, call by call — the yardstick for unifying the
 * regions on one Postgres (2026-10-23).
 *
 *   bun run tools/db-latency-proxy.ts --rtt 170                      (shell 1)
 *   DATABASE_URL=postgres://peko@localhost:5433/rr_crown \
 *     PG_TRACE=1 PG_TRACE_RTT=170 bun ws                              (shell 2)
 *   bun run tools/db-latency-bench.ts [--runs 3] [--json out.json] [--step-pace 500]   (shell 3)
 *
 * Plays what the Godot client calls, as two guests set up the way raid-lab
 * sets them (level 5, full bar, carrots, no shield): the boot reads, the
 * burrow, the shop, a whole raid (enter, steps, retreat), an island join and
 * leave. Each call is timed `--runs` times and the MEDIAN is printed, so the
 * table reads « this button takes 1.2 s in Singapore ». The bench talks to the
 * DB directly only to set the guests up — through 5432, never the proxy.
 *
 * Refuses a database or server that is not on this machine.
 */
import { io as connect } from 'socket.io-client';
import { writeFileSync } from 'node:fs';
import { and, eq, inArray, or } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../src/lib/db/schema';
import { burrowNeighbors, isDoorstep, isTrappable, setBurrowEdits, walkableTiles } from '../src/game/burrow/board';
import { distanceToField } from '../src/lib/game/raid';

const { players, raidRuns, traps, fences } = schema;
const BASE = process.env.BENCH_URL ?? `http://localhost:${process.env.WS_PORT ?? 3011}`;
const opt = (k: string, d: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const RUNS = Number(opt('--runs', '3'));
const JSON_OUT = opt('--json', '');
/** Milliseconds between two raid steps: 0 = back to back, the worst case for
 *  the raid's writes behind (src/lib/game/raid-live.ts); a player's pace is
 *  the hop on screen, about half a second. */
const STEP_PACE = Number(opt('--step-pace', '0'));
// Setup goes straight to Postgres, never through the proxy.
const DIRECT = (process.env.DATABASE_URL ?? '').replace(':5433/', ':5432/');
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(DIRECT) || !/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error('db-latency-bench : base ou serveur pas en local. Refusé.');
  process.exit(1);
}
const db = drizzle(postgres(DIRECT, { max: 2 }), { schema });

type Who = { id: string; token: string };
const times = new Map<string, number[]>();

async function api(who: Who | null, method: string, path: string, body?: unknown) {
  const t0 = performance.now();
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(who ? { authorization: `Bearer ${who.token}` } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, json, ms: performance.now() - t0 };
}

/** Time one call under `name`, keeping the reply. */
async function timed(name: string, who: Who | null, method: string, path: string, body?: unknown) {
  const r = await api(who, method, path, body);
  if (r.status >= 500) console.warn(`  ${name} → ${r.status}`);
  (times.get(name) ?? times.set(name, []).get(name)!).push(r.ms);
  return r;
}

async function guest(): Promise<Who> {
  const r = await timed('POST /api/auth/guest', null, 'POST', '/api/auth/guest');
  return { id: r.json.player.id, token: r.json.token };
}

async function topUp(id: string, name: string, stock: number) {
  await db.update(players).set({
    name, level: 5, runsPlayed: 5, energy: 300, energyUpdatedAt: new Date(), stock,
    shieldedUntil: null, solo: false, lastSeenAt: new Date(),
  }).where(eq(players.id, id));
}

/** What the client reads when it opens the game and the burrow. */
async function boot(me: Who) {
  await timed('GET /api/auth/me', me, 'GET', '/api/auth/me');
  await timed('GET /api/config', me, 'GET', '/api/config');
  await timed('GET /api/player', me, 'GET', '/api/player');
  await timed('GET /api/burrow', me, 'GET', '/api/burrow');
  await timed('GET /api/quests', me, 'GET', '/api/quests');
  await timed('GET /api/snack', me, 'GET', '/api/snack?tz=0');
  await timed('GET /api/traps', me, 'GET', '/api/traps?all=1');
  await timed('GET /api/fences', me, 'GET', '/api/fences?all=1');
  await timed('GET /api/shop', me, 'GET', '/api/shop');
  await timed('GET /api/skins', me, 'GET', '/api/skins');
  await timed('GET /api/leaderboard', me, 'GET', '/api/leaderboard?limit=50');
  await timed('GET /api/player/history', me, 'GET', '/api/player/history');
  await timed('GET /api/raid/incoming', me, 'GET', '/api/raid/incoming');
  await timed('GET /api/pass', me, 'GET', '/api/pass');
}

async function burrowWrites(me: Who) {
  await timed('POST /api/burrow harvest', me, 'POST', '/api/burrow', { action: 'harvest' });
  await db.delete(traps).where(eq(traps.ownerId, me.id));
  const burrow = await api(me, 'GET', '/api/burrow');
  setBurrowEdits(me.id, burrow.json?.edits ?? burrow.json?.burrow?.edits ?? null);
  const spot = walkableTiles(me.id).find((t) => isTrappable(me.id, t) && !isDoorstep(me.id, t));
  if (spot !== undefined) {
    await timed('POST /api/traps', me, 'POST', '/api/traps', { tile: spot });
    await timed('DELETE /api/traps', me, 'DELETE', `/api/traps?tile=${spot}`);
  }
}

/** Enter, walk toward the garden a few steps, retreat. */
async function raid(me: Who, target: Who) {
  await db.delete(raidRuns).where(or(eq(raidRuns.attackerId, me.id), eq(raidRuns.defenderId, me.id)));
  await topUp(me.id, 'Banc', 3000);
  await timed('GET /api/raid (list)', me, 'GET', '/api/raid');
  const enter = await timed('POST /api/raid', me, 'POST', '/api/raid', { defenderId: target.id });
  if (enter.status !== 200) return console.warn(`  raid refusé : ${JSON.stringify(enter.json)}`);
  setBurrowEdits(target.id, enter.json.raid?.defender?.edits ?? null);
  const dist = distanceToField(target.id);
  let tile: number = enter.json.raid?.tile;
  const walked = new Set([tile]);
  for (let n = 0; n < 4; n++) {
    const next = burrowNeighbors(target.id, tile).filter((t) => !walked.has(t))
      .sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99))[0];
    if (next === undefined) break;
    if (STEP_PACE) await new Promise((r) => setTimeout(r, STEP_PACE));
    const step = await timed(n === 0 ? 'PATCH /api/raid (1st step)' : 'PATCH /api/raid (step)', me, 'PATCH', '/api/raid', { tile: next });
    if (step.status !== 200 || step.json.outcome || step.json.struck) break;
    tile = next;
    walked.add(next);
  }
  if (STEP_PACE) await new Promise((r) => setTimeout(r, STEP_PACE));
  await timed('GET /api/raid (in raid)', me, 'GET', '/api/raid');
  await timed('DELETE /api/raid', me, 'DELETE', '/api/raid');
}

/** A whole raid to the garden: the LAST step is the one that settles the
 *  loot against the database while the raider waits. */
async function raidToField(me: Who, target: Who) {
  await db.delete(raidRuns).where(or(eq(raidRuns.attackerId, me.id), eq(raidRuns.defenderId, target.id)));
  // A bare burrow: the walk must reach the garden, whatever the default
  // defence put on it.
  await db.delete(traps).where(eq(traps.ownerId, target.id));
  await db.delete(fences).where(eq(fences.ownerId, target.id));
  await topUp(me.id, 'Banc', 3000);
  await topUp(target.id, 'Cible2', 5_000_000);
  const enter = await api(me, 'POST', '/api/raid', { defenderId: target.id });
  if (enter.status !== 200) return console.warn(`  raid au potager refusé : ${JSON.stringify(enter.json)}`);
  setBurrowEdits(target.id, enter.json.raid?.defender?.edits ?? null);
  const dist = distanceToField(target.id);
  let tile: number = enter.json.raid?.tile;
  const walked = new Set([tile]);
  for (let n = 0; n < 40; n++) {
    const next = burrowNeighbors(target.id, tile).filter((t) => !walked.has(t))
      .sort((a, b) => (dist.get(a) ?? 99) - (dist.get(b) ?? 99))[0];
    if (next === undefined) break;
    if (STEP_PACE) await new Promise((r) => setTimeout(r, STEP_PACE));
    const t0 = performance.now();
    const step = await api(me, 'PATCH', '/api/raid', { tile: next });
    if (step.status !== 200) {
      console.warn(`  pas refusé : ${JSON.stringify(step.json).slice(0, 120)}`);
      await api(me, 'DELETE', '/api/raid');
      return;
    }
    if (step.json.outcome) {
      (times.get('PATCH /api/raid (last step)') ?? times.set('PATCH /api/raid (last step)', []).get('PATCH /api/raid (last step)')!).push(performance.now() - t0);
      return;
    }
    tile = next;
    walked.add(next);
  }
  // Stuck short of the garden: out, so the next raid is not refused.
  console.warn('  raid au potager : coincé, retraite');
  await api(me, 'DELETE', '/api/raid');
}

/** Socket: connect, join an island, leave. */
async function island(me: Who) {
  const t0 = performance.now();
  const s = connect(BASE, { auth: { token: me.token }, transports: ['websocket'], reconnection: false, forceNew: true });
  await new Promise<void>((ok, ko) => { s.once('connect', () => ok()); s.once('connect_error', ko); });
  (times.get('socket connect') ?? times.set('socket connect', []).get('socket connect')!).push(performance.now() - t0);
  const t1 = performance.now();
  const snap = await new Promise<any>((ok) => {
    const t = setTimeout(() => ok({ timeout: true }), 15000);
    s.once('island', (x) => { clearTimeout(t); ok(x); });
    s.once('error_msg', (e) => { clearTimeout(t); ok({ error: e }); });
    s.emit('join');
  });
  if (snap.timeout || snap.error) console.warn(`  join : ${JSON.stringify(snap.error ?? 'timeout')}`);
  else (times.get('socket join') ?? times.set('socket join', []).get('socket join')!).push(performance.now() - t1);
  s.emit('leave');
  await new Promise((r) => setTimeout(r, 300));
  s.close();
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main() {
  if (!(await fetch(BASE + '/health').catch(() => null))?.ok) {
    console.error(`db-latency-bench : pas de serveur sur ${BASE}.`);
    process.exit(1);
  }
  const me = await guest();
  const target = await guest();
  const target2 = await guest();
  await topUp(me.id, 'Banc', 3000);
  await topUp(target.id, 'Cible', 5_000_000);
  // Warm the pool and the route modules once, untimed.
  await boot(me);
  times.clear();

  for (let i = 0; i < RUNS; i++) {
    await topUp(me.id, 'Banc', 3000);
    await boot(me);
    await burrowWrites(me);
    await raid(me, target);
    await raidToField(me, target2);
    await island(me);
  }

  const rows = [...times].map(([name, xs]) => ({ name, ms: Math.round(median(xs)) }));
  const w = Math.max(...rows.map((r) => r.name.length));
  for (const r of rows) console.log(`${r.name.padEnd(w)}  ${String(r.ms).padStart(6)} ms`);
  console.log(`${'TOTAL (one of each)'.padEnd(w)}  ${String(rows.reduce((s, r) => s + r.ms, 0)).padStart(6)} ms`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));

  const all = [me.id, target.id, target2.id];
  await db.delete(raidRuns).where(or(inArray(raidRuns.attackerId, all), inArray(raidRuns.defenderId, all)));
  await db.delete(traps).where(and(inArray(traps.ownerId, all)));
  process.exit(0);
}

void main();
