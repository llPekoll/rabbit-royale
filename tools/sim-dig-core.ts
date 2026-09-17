/**
 * The robot players behind tools/sim-dig.sim.ts and tools/economy-day.sim.ts.
 * See sim-dig.sim.ts for what each policy does.
 */
import * as T from '../config/tuning';
import { boardNeighbors, generateIsland, islandProgress } from '../src/lib/game/island';
import { flagTile, resolveMove, spawnRabbit } from '../src/lib/game/run';
import { makeShape } from '../src/config/gridConfig';
import { terrainNeighbors } from '../src/lib/game/terrainBoard';
import { mulberry32 } from '../src/lib/game/rng';
import type { Island } from '../src/lib/game/types';

export type Policy = 'walker' | 'reader' | 'solver' | 'prober' | 'gambler';
export const mut = <O extends object>(o: O) => o as { -readonly [K in keyof O]: O[K] };

/**
 * What-if stocks, for tools/gold-x.sim.ts. Neither exists in the game.
 *   gold      golden Xs carried into the run: a wrong one costs nothing and keeps the streak.
 *   goldAt    spend one on the tile the robot would otherwise have to bet on, when its risk is at least this.
 *   redCap    red Xs the robot may place in the run (a stocked red X).
 */
export type Stocks = { gold?: number; goldAt?: number; redCap?: number };

export function play(seed: string, lifetime: number, policy: Policy, rand: () => number, stocks: Stocks = {}) {
  const island: Island = generateIsland({ seed, contentSeed: `c:${seed}`, lifetimeCarrots: lifetime });
  const shape = makeShape(seed);
  const rabbit = spawnRabbit('bot', 'bot', T.ENERGY.START, seed);
  rabbit.run = { startedAt: 0, tilesDug: 0, bombsHit: 0, loot: {}, nfts: [] };
  let now = 1_000_000;
  let digs = 0, bombs = 0, right = 0, wrong = 0, guesses = 0, wasted = 0, low = rabbit.energy, ticks = 0, full = 0, sum = 0;
  const tiles = island.tiles;
  let gold = stocks.gold ?? 0, goldUsed = 0, goldHit = 0, reds = 0;
  const goldAt = stocks.goldAt ?? 0.25, redCap = stocks.redCap ?? Infinity;

  for (let guard = 0; guard < 5000 && rabbit.alive; guard++) {
    ticks++; sum += rabbit.energy; if (rabbit.energy >= T.ENERGY.MAX - 2) full++; if (rabbit.energy < low) low = rabbit.energy;
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
    const constraints: Array<{ cells: number[]; left: number }> = [];
    for (const [i, t] of tiles) {
      if (!(t.revealed || t.hinted) || t.content === 'bomb' && t.revealed) continue;
      const nbs = boardNeighbors(island, i);
      const known = nbs.filter((n) => { const u = tiles.get(n)!; return u.flagged || (u.revealed && u.content === 'bomb'); }).length;
      const unknown = nbs.filter((n) => { const u = tiles.get(n)!; return !u.revealed && !u.hinted && !u.flagged; });
      if (!unknown.length) continue;
      const left = t.adjacent - known;
      constraints.push({ cells: unknown, left });
      if (left <= 0) unknown.forEach((n) => safe.add(n));
      else if (left === unknown.length) unknown.forEach((n) => mines.add(n));
      for (const n of unknown) risk.set(n, Math.max(risk.get(n) ?? 0, left / unknown.length));
    }
    if (policy === 'solver' || policy === 'prober') {
      // Subset rule, to a fixed point: A inside B => B minus A holds (B.left - A.left).
      for (let pass = 0; pass < 3; pass++) {
        let found = false;
        for (const a of constraints) for (const b of constraints) {
          if (a === b || a.cells.length >= b.cells.length) continue;
          const inB = new Set(b.cells);
          if (!a.cells.every((c) => inB.has(c))) continue;
          const inA = new Set(a.cells);
          const rest = b.cells.filter((c) => !inA.has(c));
          const left = b.left - a.left;
          if (left === 0) for (const c of rest) { if (!safe.has(c)) { safe.add(c); found = true; } }
          else if (left === rest.length) for (const c of rest) { if (!mines.has(c)) { mines.add(c); found = true; } }
        }
        if (!found) break;
      }
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
      reds++;
      rabbit.tile = standFor(i, boardNeighbors(island, i))!;
      const out = flagTile(island, rabbit, i, (now += 10_000));
      if (out.flag?.correct) { right++; if (out.flag.energyDelta === 0) wasted++; } else if (out.ok) wrong++;
    };
    // The golden X, modelled outside the rules: the loss is lifted for one call and the streak put back.
    const markGold = (i: number) => {
      gold--; goldUsed++;
      rabbit.tile = standFor(i, boardNeighbors(island, i))!;
      const loss = T.FLAG.LOSS, streak = rabbit.run!.flagStreak;
      mut(T.FLAG).LOSS = 0 as typeof loss;
      const out = flagTile(island, rabbit, i, (now += 10_000));
      mut(T.FLAG).LOSS = loss;
      if (out.flag?.correct) goldHit++; else rabbit.run!.flagStreak = streak;
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
    if (policy === 'reader' || policy === 'solver' || policy === 'prober') {
      const proven = markable.find((i) => mines.has(i));
      if (proven !== undefined && reds < redCap) { mark(proven); continue; }
    }
    const sure = diggable.find((i) => safe.has(i));
    if (sure !== undefined) { if (!dig(sure)) break; continue; }
    // Nothing is certain: the least bad bet. Proven bombs are never stepped on.
    const bets = diggable.filter((i) => !mines.has(i));
    if (!bets.length) break;
    bets.sort((a, b) => (risk.get(a) ?? 0.2) - (risk.get(b) ?? 0.2));
    guesses++;
    if (gold > 0 && (risk.get(bets[0]) ?? 0.2) >= goldAt && markable.includes(bets[0])) { markGold(bets[0]); continue; }
    if (policy === 'prober') {
      const hot = markable.filter((i) => (risk.get(i) ?? 0) >= 0.5).sort((a, b) => risk.get(b)! - risk.get(a)!)[0];
      if (hot !== undefined) { mark(hot); continue; }
    }
    if (!dig(bets[0])) break;
  }
  const p = islandProgress(island);
  return { goldUsed, goldHit, digs, bombs, right, wrong, guesses, wasted, low, atFull: full / Math.max(1, ticks), mean: sum / Math.max(1, ticks), cleared: p.fraction, carrots: rabbit.carrots, died: !rabbit.alive, energy: rabbit.energy };
}

