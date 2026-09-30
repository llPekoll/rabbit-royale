/**
 * The raid matrix's pieces: stand planks, bury bombs, raid — on the real
 * burrow rules (board, fences, clues, drain, stake). Shared by
 * tools/raid-matrix.sim.ts (the settings) and tools/burrow-ground-pick.ts
 * (the grounds). Reads TRAPS and RAID_RUN live, so a caller may retune them.
 */
import { RAID_RUN, TRAPS, FENCES } from '../config/tuning';
import {
  entranceTile, fieldTiles, burrowNeighbors, walkableTiles, isTrappable, isDoorstep, burrowCell,
} from '../src/game/burrow/board';
import { fenceSpans, raiderSteps, type FenceSeg } from '../src/game/burrow/fence';
import { fencePlacementBlocker } from '../src/lib/game/fences';
import { distanceToField, raidProgress, trapClues } from '../src/lib/game/raid';
import { mulberry32 } from '../src/lib/game/rng';


/** Loot on the field (the game's rule since 2026-09-30); false replays the old loot by depth. */
let LOOT_AT_FIELD = true;
export const setLootAtField = (on: boolean) => { LOOT_AT_FIELD = on; };

/** Steps from the entrance to the field for a raider, planks in the way. */
export function crossing(seed: string, fenced: FenceSeg[]): number {
  const field = new Set(fieldTiles(seed));
  const start = entranceTile(seed);
  const dist = new Map([[start, 0]]);
  const q = [start];
  while (q.length) {
    const t = q.shift()!;
    if (field.has(t)) return dist.get(t)!;
    for (const n of raiderSteps(seed, fenced, t)) if (!dist.has(n)) { dist.set(n, dist.get(t)! + 1); q.push(n); }
  }
  return Infinity;
}

/** Planks, SMART: each one where it lengthens the way in most. */
export function standPlanks(seed: string, count: number, smart: boolean, rand: () => number): FenceSeg[] {
  const fenced: FenceSeg[] = [];
  for (let i = 0; i < count; i++) {
    const offers = fenceSpans(seed)
      .map((s: any) => ({ tile: s.tile, side: s.side }))
      .filter((s) => !fencePlacementBlocker(seed, 1, fenced, s.tile, s.side));
    if (!offers.length) break;
    let pick = offers[Math.floor(rand() * offers.length)];
    if (smart) {
      let best = -1;
      for (const o of offers) {
        const d = crossing(seed, [...fenced, o as FenceSeg]) + rand() * 0.1;
        if (d > best) { best = d; pick = o; }
      }
    }
    fenced.push(pick as FenceSeg);
  }
  return fenced;
}

/** Bombs, SMART: greedily on the tiles most shortest ways in go through. */
export function buryBombs(seed: string, count: number, fenced: FenceSeg[], smart: boolean, rand: () => number): Set<number> {
  const cands = walkableTiles(seed).filter((t) => isTrappable(seed, t) && !isDoorstep(seed, t) && burrowCell(seed, t) !== 'field');
  const mined = new Set<number>();
  if (!smart) {
    while (mined.size < Math.min(count, cands.length)) mined.add(cands[Math.floor(rand() * cands.length)]);
    return mined;
  }
  for (let i = 0; i < count; i++) {
    // Count shortest paths through each tile, avoiding the bombs already buried
    // (a raider who reads walks round them).
    const field = new Set(fieldTiles(seed));
    const start = entranceTile(seed);
    const d = new Map([[start, 0]]); const ways = new Map([[start, 1]]); const order = [start];
    for (let k = 0; k < order.length; k++) {
      const t = order[k];
      if (field.has(t)) continue;
      for (const n of raiderSteps(seed, fenced, t)) {
        if (mined.has(n)) continue;
        if (!d.has(n)) { d.set(n, d.get(t)! + 1); ways.set(n, 0); order.push(n); }
        if (d.get(n) === d.get(t)! + 1) ways.set(n, ways.get(n)! + ways.get(t)!);
      }
    }
    const back = new Map<number, number>();
    const best = Math.min(...[...field].map((f) => d.get(f) ?? Infinity));
    for (const f of field) if (d.get(f) === best) back.set(f, 1);
    for (let k = order.length - 1; k >= 0; k--) {
      const t = order[k];
      if (field.has(t)) continue;
      let b = 0;
      for (const n of raiderSteps(seed, fenced, t)) if (!mined.has(n) && d.get(n) === d.get(t)! + 1) b += back.get(n) ?? 0;
      back.set(t, b);
    }
    let pick = -1, score = -1;
    for (const t of cands) {
      if (mined.has(t)) continue;
      const s = (ways.get(t) ?? 0) * (back.get(t) ?? 0) + rand() * 0.5;
      if (s > score) { score = s; pick = t; }
    }
    if (pick < 0) break;
    mined.add(pick);
  }
  return mined;
}

/** One raid. The reader deduces from the clues it has seen; the blind one does not. */
export function raid(seed: string, fenced: FenceSeg[], mined: Set<number>, reader: boolean, rand: () => number) {
  const clues = trapClues(seed, mined);
  const field = new Set(fieldTiles(seed));
  const dist = distanceToField(seed);
  let tile = entranceTile(seed);
  let energy = RAID_RUN.STAKE - RAID_RUN.TOLL;
  const visited = new Set([tile]);
  const safe = new Set([tile]);
  const bomb = new Set<number>();
  let steps = 0, sprung = 0;
  while (energy > 0 && !field.has(tile)) {
    if (reader) {
      // One-clue deductions over the tiles walked.
      for (let pass = 0; pass < 3; pass++) for (const v of visited) {
        const nb = burrowNeighbors(seed, v);
        const unknown = nb.filter((n) => !safe.has(n) && !bomb.has(n));
        if (!unknown.length) continue;
        const left = (clues.get(v) ?? 0) - nb.filter((n) => bomb.has(n)).length;
        if (left === 0) unknown.forEach((n) => safe.add(n));
        else if (left === unknown.length) unknown.forEach((n) => bomb.add(n));
      }
    }
    const risk = (t: number) => {
      if (safe.has(t) || field.has(t)) return 0;
      if (bomb.has(t)) return 1;
      if (!reader) return 0;
      let r = 0.1;
      for (const v of burrowNeighbors(seed, t)) if (visited.has(v)) {
        const nb = burrowNeighbors(seed, v);
        const unknown = nb.filter((n) => !safe.has(n) && !bomb.has(n)).length;
        const left = (clues.get(v) ?? 0) - nb.filter((n) => bomb.has(n)).length;
        if (unknown) r = Math.max(r, left / unknown);
      }
      return r;
    };
    // Dijkstra to the field, a tile costing a step plus its expected drain.
    const cost = new Map([[tile, 0]]); const first = new Map<number, number>();
    const open = [tile];
    while (open.length) {
      open.sort((a, b) => cost.get(a)! - cost.get(b)!);
      const t = open.shift()!;
      if (field.has(t)) break;
      for (const n of raiderSteps(seed, fenced, t)) {
        const c = cost.get(t)! + 1 + risk(n) * TRAPS.DRAIN * 1.5 + rand() * 0.01;
        if (c < (cost.get(n) ?? Infinity)) { cost.set(n, c); first.set(n, t === tile ? n : first.get(t)!); open.push(n); }
      }
    }
    const goal = [...field].filter((f) => cost.has(f)).sort((a, b) => cost.get(a)! - cost.get(b)!)[0];
    if (goal === undefined) break;
    const next = first.get(goal)!;
    tile = next; steps++; visited.add(tile);
    energy -= RAID_RUN.STEP_COST;
    if (mined.has(tile)) { energy -= TRAPS.DRAIN; sprung++; mined.delete(tile); bomb.delete(tile); }
    safe.add(tile);
  }
  const reached = field.has(tile);
  const progress = raidProgress(seed, tile, dist);
  // Reaching the field refunds the steps (STEP_REFUND_AT_FIELD); the drains stay burnt.
  const spent = RAID_RUN.TOLL + (reached ? sprung * TRAPS.DRAIN : Math.min(RAID_RUN.STAKE - RAID_RUN.TOLL, steps * RAID_RUN.STEP_COST + sprung * TRAPS.DRAIN));
  const lootShare = LOOT_AT_FIELD
    ? (reached ? 1 : RAID_RUN.MIN_LOOT_FRACTION + 0.25 * progress)
    : RAID_RUN.MIN_LOOT_FRACTION + (1 - RAID_RUN.MIN_LOOT_FRACTION) * progress;
  return { reached, progress, steps, sprung, spent, lootShare };
}

