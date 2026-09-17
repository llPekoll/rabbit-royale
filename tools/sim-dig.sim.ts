/**
 * DIG-LOOP SIMULATOR — three robot players on real generated islands, through
 * the real rules (`resolveMove`, `flagTile`). Not part of the suite: run it with
 *
 *   SIM_OUT=/tmp/sim.txt SIM_SETS='[{"name":"live"}]' npx vitest run -c tools/vitest.sim.config.ts
 *
 * A set names the values to try; anything it leaves out is read from tuning,
 * so `{"name":"live"}` measures the game as it ships.
 *
 * The robots read the board the way a casual player does — one number at a
 * time ("this 2 already has its two bombs", "this 1 has one tile left") — and
 * differ only in what they do with it:
 *
 *   walker   never places an X. Digs what it knows is safe, guesses the rest.
 *   reader   places an X on every bomb it can prove. Never bets an X.
 *   gambler  never reads: Xs and digs at random among what it can reach.
 */
import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as T from '../config/tuning';
import { boardNeighbors, generateIsland, islandProgress } from '../src/lib/game/island';
import { flagTile, resolveMove, spawnRabbit } from '../src/lib/game/run';
import { makeShape } from '../src/config/gridConfig';
import { terrainNeighbors } from '../src/lib/game/terrainBoard';
import { mulberry32 } from '../src/lib/game/rng';
import type { Island } from '../src/lib/game/types';

type Policy = 'walker' | 'reader' | 'gambler';
const mut = <O extends object>(o: O) => o as { -readonly [K in keyof O]: O[K] };

function play(seed: string, lifetime: number, policy: Policy, rand: () => number) {
  const island: Island = generateIsland({ seed, contentSeed: `c:${seed}`, lifetimeCarrots: lifetime });
  const shape = makeShape(seed);
  const rabbit = spawnRabbit('bot', 'bot', T.ENERGY.START, seed);
  rabbit.run = { startedAt: 0, tilesDug: 0, bombsHit: 0, loot: {}, nfts: [] };
  let now = 1_000_000;
  let digs = 0, bombs = 0, right = 0, wrong = 0, guesses = 0;
  const tiles = island.tiles;

  for (let guard = 0; guard < 5000 && rabbit.alive; guard++) {
    // Ground the rabbit can walk for free from where it stands.
    const region = new Set<number>([rabbit.tile]);
    const q = [rabbit.tile];
    while (q.length) {
      for (const nb of terrainNeighbors(seed, q.pop()!)) {
        const t = tiles.get(nb);
        if (t && t.revealed && !region.has(nb)) { region.add(nb); q.push(nb); }
      }
    }
    // One-number deductions.
    const safe = new Set<number>(), mines = new Set<number>(), risk = new Map<number, number>();
    for (const [i, t] of tiles) {
      if (!(t.revealed || t.hinted) || t.content === 'bomb' && t.revealed) continue;
      const nbs = boardNeighbors(island, i);
      const known = nbs.filter((n) => { const u = tiles.get(n)!; return u.flagged || (u.revealed && u.content === 'bomb'); }).length;
      const unknown = nbs.filter((n) => { const u = tiles.get(n)!; return !u.revealed && !u.hinted && !u.flagged; });
      if (!unknown.length) continue;
      const left = t.adjacent - known;
      if (left <= 0) unknown.forEach((n) => safe.add(n));
      else if (left === unknown.length) unknown.forEach((n) => mines.add(n));
      for (const n of unknown) risk.set(n, Math.max(risk.get(n) ?? 0, left / unknown.length));
    }
    for (const [i, t] of tiles) if (t.hinted && !t.revealed) safe.add(i);

    const standFor = (target: number, nbs: number[]) => nbs.find((n) => region.has(n));
    const diggable: number[] = [], markable: number[] = [];
    for (const [i, t] of tiles) {
      if (t.revealed || t.flagged) continue;
      if (standFor(i, terrainNeighbors(seed, i)) !== undefined) diggable.push(i);
      if (!t.hinted && t.content !== 'chest' && standFor(i, boardNeighbors(island, i)) !== undefined) markable.push(i);
    }
    if (!diggable.length) break;

    const mark = (i: number) => {
      rabbit.tile = standFor(i, boardNeighbors(island, i))!;
      const out = flagTile(island, rabbit, i, (now += 10_000));
      if (out.flag?.correct) right++; else if (out.ok) wrong++;
    };
    const dig = (i: number) => {
      rabbit.tile = standFor(i, terrainNeighbors(seed, i))!;
      rabbit.lastMoveAt = 0;
      const out = resolveMove(island, rabbit, i, shape, mulberry32(i + 1), (now += 10_000));
      if (!out.ok) return false;
      digs++; if (out.dig?.content === 'bomb') bombs++;
      return true;
    };

    if (policy === 'gambler') {
      if (markable.length && rand() < 0.3) mark(markable[Math.floor(rand() * markable.length)]);
      else if (!dig(diggable[Math.floor(rand() * diggable.length)])) break;
      continue;
    }
    if (policy === 'reader') {
      const proven = markable.find((i) => mines.has(i));
      if (proven !== undefined) { mark(proven); continue; }
    }
    const sure = diggable.find((i) => safe.has(i));
    if (sure !== undefined) { if (!dig(sure)) break; continue; }
    // Nothing is certain: the least bad bet. Proven bombs are never stepped on.
    const bets = diggable.filter((i) => !mines.has(i));
    if (!bets.length) break;
    bets.sort((a, b) => (risk.get(a) ?? 0.2) - (risk.get(b) ?? 0.2));
    guesses++;
    if (!dig(bets[0])) break;
  }
  const p = islandProgress(island);
  return { digs, bombs, right, wrong, guesses, cleared: p.fraction, carrots: rabbit.carrots, died: !rabbit.alive, energy: rabbit.energy };
}

test('simulate', () => {
  type Set = { name: string; START: number; DIG: number; BOMB: number; GOLDEN: number; GAIN: number; LOSS: number };
  const live: Omit<Set, 'name'> = {
    START: T.ENERGY.START, DIG: T.ENERGY.DIG_COST, BOMB: T.ENERGY.BOMB_LOSS,
    GOLDEN: T.ENERGY.GOLDEN_GAIN, GAIN: T.FLAG.GAIN, LOSS: T.FLAG.LOSS,
  };
  const sets = (JSON.parse(process.env.SIM_SETS ?? '[{"name":"live"}]') as Array<Partial<Set> & { name: string }>)
    .map((s) => ({ ...live, ...s }));
  const N = Number(process.env.SIM_N ?? 12);
  const lines: string[] = [];
  for (const s of sets) {
    Object.assign(mut(T.ENERGY), { START: s.START, MAX: s.START, DIG_COST: s.DIG, BOMB_LOSS: s.BOMB, GOLDEN_GAIN: s.GOLDEN });
    Object.assign(mut(T.FLAG), { GAIN: s.GAIN, LOSS: s.LOSS });
    lines.push(`\n## ${s.name}  (start ${s.START}, dig ${s.DIG}, bomb ${s.BOMB}, golden +${s.GOLDEN}, X +${s.GAIN}/-${s.LOSS})`);
    for (const [tier, lifetime] of [['Meadow', 0], ['Ashland', 6000], ['Caldera', 10000]] as const) {
      for (const policy of ['walker', 'reader', 'gambler'] as const) {
        const rand = mulberry32(7);
        const runs = Array.from({ length: N }, (_, k) => play(`sim-${tier}-${k}`, lifetime, policy, rand));
        const avg = (f: (r: (typeof runs)[number]) => number) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
        lines.push(`${tier.padEnd(8)} ${policy.padEnd(8)} digs ${avg((r) => r.digs).toFixed(0).padStart(4)}  cleared ${(100 * avg((r) => r.cleared)).toFixed(0).padStart(3)}%  died ${(100 * avg((r) => +r.died)).toFixed(0).padStart(3)}%  bombs ${avg((r) => r.bombs).toFixed(1).padStart(5)}  X ok/ko ${avg((r) => r.right).toFixed(0)}/${avg((r) => r.wrong).toFixed(0)}  guesses ${avg((r) => r.guesses).toFixed(0).padStart(3)}  carrots ${avg((r) => r.carrots).toFixed(0)}`);
      }
    }
  }
  writeFileSync(process.env.SIM_OUT ?? 'sim-out.txt', lines.join('\n'));
});
