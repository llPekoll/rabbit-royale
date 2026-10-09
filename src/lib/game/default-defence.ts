/**
 * THE DEFENCE A BURROW IS BORN WITH (2026-10-09).
 *
 * Players who never found DEFEND left their bombs in the allowance and their
 * planks in the bag, and an empty burrow is a free walk to the potager: the
 * accounts that were made, played once and never uninstalled became the
 * raid list. The user: "tout soit posé un peu stratégiquement pour que ça
 * soit difficile de base, mais pas pareil pour tout le monde".
 *
 * So a burrow stands DEFAULT.BOMBS bombs and DEFAULT.PLANKS planks the day it
 * is made, placed the way the raid matrix's smart defender places them —
 * planks where they lengthen the way in most, bombs on the tiles the most
 * shortest ways in go through — but each pick is DRAWN among the best few,
 * from a generator seeded on the player's id. On the shared ground
 * (`BURROW_GROUND`) the pure greedy would lay the same defence in every
 * burrow, and a raider who learned one would have learned them all.
 *
 * FREE, on top of the kit: the rows go into `traps` and `fences` without
 * touching the allowance, the bag or `trapsPlaced` (the quest board's
 * lifetime count — "bury something" is still a lesson to learn). A default
 * piece lifted by its owner goes back to the bag like any other, so it is
 * theirs.
 */
import { eq, sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import { fences, traps } from '@/lib/db/schema';
import {
  burrowCell, entranceTile, fieldTiles, isDoorstep, isTrappable, walkableTiles,
} from '@/game/burrow/board';
import { houseTiles } from '@/game/burrow/buildings';
import { fenceSpans, raiderSteps, type FenceSeg } from '@/game/burrow/fence';
import { fencePlacementBlocker } from '@/lib/game/fences';
import { loadBurrowEdits } from '@/lib/game/burrowEdits';
import { distanceToField } from '@/lib/game/raid';
import { mulberry32, seedFrom, type Rng } from '@/lib/game/rng';
import { TRAPS } from '@/lib/tuning/tables';

export const DEFAULT_DEFENCE = {
  /** Bombs buried in a new burrow — under TRAPS.MAX_PLACED, so the owner can still add their own. */
  BOMBS: 5,
  /**
   * ...of which this many ON THE WAY, at least PATH_MIN_STEPS from the field.
   * The chokepoint count alone puts every bomb against the potager — that is
   * where all the shortest ways meet — and the user, seeing it: "un peu trop
   * centré au même endroit, mettre une ou deux sur le chemin".
   */
  ON_PATH: 2,
  PATH_MIN_STEPS: 4,
  /** Planks stood round the potager. */
  PLANKS: 5,
  /**
   * Each pick is drawn among this many best candidates, weighted towards the
   * best. 1 is the pure greedy (one layout for everybody on the shared
   * ground); 4 measured at 120 distinct layouts in 120 burrows for a defence
   * as strong as the greedy's.
   */
  SPREAD: 4,
} as const;

/** Steps from the entrance to the field for a raider, planks in the way. */
function crossing(seed: string, fenced: readonly FenceSeg[]): number {
  const field = new Set(fieldTiles(seed));
  const start = entranceTile(seed);
  const dist = new Map([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const t = queue.shift()!;
    if (field.has(t)) return dist.get(t)!;
    for (const n of raiderSteps(seed, fenced, t)) {
      if (!dist.has(n)) { dist.set(n, dist.get(t)! + 1); queue.push(n); }
    }
  }
  return Infinity;
}

/** One of the best `SPREAD` by score, the best the likeliest (weights k, k-1, …, 1). */
function drawAmongBest<T>(rand: Rng, scored: { item: T; score: number }[]): T | null {
  if (!scored.length) return null;
  const best = [...scored].sort((a, b) => b.score - a.score).slice(0, DEFAULT_DEFENCE.SPREAD);
  const weights = best.map((_, i) => best.length - i);
  let r = rand() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < best.length; i++) {
    r -= weights[i];
    if (r <= 0) return best[i].item;
  }
  return best[best.length - 1].item;
}

/** Planks, each where it lengthens the shortest way in most — never the last way. */
export function standDefaultPlanks(seed: string, count: number, rand: Rng): FenceSeg[] {
  const fenced: FenceSeg[] = [];
  for (let i = 0; i < count; i++) {
    const offers = fenceSpans(seed)
      .map((s) => ({ tile: s.tile, side: s.side }) as FenceSeg)
      .filter((s) => !fencePlacementBlocker(seed, 1, fenced, s.tile, s.side));
    const pick = drawAmongBest(rand, offers.map((o) => ({ item: o, score: crossing(seed, [...fenced, o]) })));
    if (!pick) break;
    fenced.push(pick);
  }
  return fenced;
}

/** Can the owner's own `POST /api/traps` put a bomb here? The same refusals, in one test. */
function minable(seed: string, tile: number, house: ReadonlySet<number>): boolean {
  return isTrappable(seed, tile) && !isDoorstep(seed, tile)
    && burrowCell(seed, tile) !== 'field' && !house.has(tile);
}

/**
 * Bombs on the crossing's chokepoints: the tiles the most shortest ways from
 * the door to the field go through, counted again after each bomb with the
 * ones already buried walked round (a raider who reads does exactly that).
 */
export function buryDefaultBombs(
  seed: string,
  count: number,
  fenced: readonly FenceSeg[],
  rand: Rng,
  onPath = 0,
): number[] {
  const house = new Set(houseTiles(seed));
  const all = walkableTiles(seed).filter((t) => minable(seed, t, house));
  const fromField = distanceToField(seed);
  const far = all.filter((t) => (fromField.get(t) ?? 0) >= DEFAULT_DEFENCE.PATH_MIN_STEPS);
  const field = new Set(fieldTiles(seed));
  const start = entranceTile(seed);
  const mined = new Set<number>();
  for (let i = 0; i < Math.min(count, TRAPS.MAX_PLACED); i++) {
    // Ways from the door to each tile, breadth-first...
    const d = new Map([[start, 0]]);
    const ways = new Map([[start, 1]]);
    const order = [start];
    for (let k = 0; k < order.length; k++) {
      const t = order[k];
      if (field.has(t)) continue;
      for (const n of raiderSteps(seed, fenced, t)) {
        if (mined.has(n)) continue;
        if (!d.has(n)) { d.set(n, d.get(t)! + 1); ways.set(n, 0); order.push(n); }
        if (d.get(n) === d.get(t)! + 1) ways.set(n, ways.get(n)! + ways.get(t)!);
      }
    }
    // ...and from each tile on to the nearest field tiles, walked back.
    const back = new Map<number, number>();
    const nearest = Math.min(...[...field].map((f) => d.get(f) ?? Infinity));
    for (const f of field) if (d.get(f) === nearest) back.set(f, 1);
    for (let k = order.length - 1; k >= 0; k--) {
      const t = order[k];
      if (field.has(t)) continue;
      let b = 0;
      for (const n of raiderSteps(seed, fenced, t)) {
        if (!mined.has(n) && d.get(n) === d.get(t)! + 1) b += back.get(n) ?? 0;
      }
      back.set(t, b);
    }
    // The first `onPath` out on the way, the rest wherever the ways meet.
    const cands = i < onPath && far.length ? far : all;
    const scored = cands
      .filter((t) => !mined.has(t))
      .map((t) => ({ item: t, score: (ways.get(t) ?? 0) * (back.get(t) ?? 0) }));
    const pick = drawAmongBest(rand, scored);
    if (pick === null) break;
    mined.add(pick);
  }
  return [...mined];
}

/** The default defence for a burrow — the same answer for the same burrow, every time. */
export function defaultDefence(seed: string): { bombs: number[]; planks: FenceSeg[] } {
  const rand = mulberry32(seedFrom(`${seed}:defence`));
  const planks = standDefaultPlanks(seed, DEFAULT_DEFENCE.PLANKS, rand);
  const bombs = buryDefaultBombs(seed, DEFAULT_DEFENCE.BOMBS, planks, rand, DEFAULT_DEFENCE.ON_PATH);
  return { bombs, planks };
}

/**
 * Stand the default defence in a burrow that has NONE — not one bomb, not one
 * plank. A burrow its owner has started to defend is theirs to finish, and is
 * left as it is. Returns what was placed (empty when the burrow was skipped).
 *
 * Reads the owner's arrangement first (`loadBurrowEdits`): the rules judge the
 * ground they laid out, and a default bomb must stand where their own could.
 */
export async function placeDefaultDefence(
  playerId: string,
  tx: typeof db | PgTransaction<never, never, never> = db,
): Promise<{ bombs: number; planks: number }> {
  const t = tx as typeof db;
  const [{ n: bombsStanding }] = await t.select({ n: sql<number>`count(*)::int` }).from(traps).where(eq(traps.ownerId, playerId));
  const [{ n: planksStanding }] = await t.select({ n: sql<number>`count(*)::int` }).from(fences).where(eq(fences.ownerId, playerId));
  if (bombsStanding > 0 || planksStanding > 0) return { bombs: 0, planks: 0 };

  await loadBurrowEdits(playerId);
  const { bombs, planks } = defaultDefence(playerId);
  // ONE instant for every piece: that is how a default nobody has touched is
  // told apart later (scripts/default-defence-backfill.ts --redo).
  const placedAt = new Date();
  if (bombs.length) {
    await t.insert(traps).values(bombs.map((tile) => ({ ownerId: playerId, tile, placedAt }))).onConflictDoNothing();
  }
  if (planks.length) {
    await t.insert(fences).values(planks.map((p) => ({ ownerId: playerId, tile: p.tile, side: p.side, placedAt }))).onConflictDoNothing();
  }
  return { bombs: bombs.length, planks: planks.length };
}
