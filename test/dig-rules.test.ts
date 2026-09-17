/**
 * THE DIG LOOP'S THREE RULES OF 17 SEPTEMBER 2026.
 *
 *   1. The cascade reaches ISLAND.CASCADE_RADIUS squares from the rabbit and is
 *      carried on by walking — an island is no longer born a quarter read.
 *   2. Bombs and golden carrots thicken with the walk from the spawn; the
 *      counts stay the tier's.
 *   3. The red X: mark a bomb around you. Right pays a little energy and a
 *      carrot bounty on a streak; wrong costs energy and reads the tile.
 */
import { describe, expect, it } from 'vitest';
import { ENERGY, FLAG, ISLAND, ISLAND_TIERS } from '../config/tuning';
import {
  boardNeighbors, cascadeAround, cascadeHints, generateIsland, islandProgress, publicView,
} from '../src/lib/game/island';
import { flagTile, resolveMove, spawnRabbit } from '../src/lib/game/run';
import { makeShape, toColRow } from '../src/config/gridConfig';
import { spawnTile, terrainNeighbors } from '../src/lib/game/terrainBoard';
import { mulberry32 } from '../src/lib/game/rng';
import type { Island } from '../src/lib/game/types';

const SEED = 'dig-rules';
/** Every island here is dealt at zero lifetime carrots: the first tier. */
const X_GAIN = ISLAND_TIERS[0].xGain;
const squares = (a: number, b: number) => {
  const p = toColRow(a);
  const q = toColRow(b);
  return Math.max(Math.abs(p.col - q.col), Math.abs(p.row - q.row));
};

/** A covered board with no bombs on it: one endless field of zeros. */
function quiet(seed = SEED): Island {
  const island = generateIsland({ seed, contentSeed: 'quiet' });
  for (const t of island.tiles.values()) {
    t.content = 'empty'; t.adjacent = 0; t.hinted = false; t.revealed = false; t.flagged = false;
  }
  island.dugCount = 0;
  return island;
}
const recount = (island: Island) => {
  for (const [i, t] of island.tiles) {
    t.adjacent = boardNeighbors(island, i).filter((n) => island.tiles.get(n)!.content === 'bomb').length;
  }
};

describe('the cascade is bounded around the rabbit', () => {
  it('writes nothing further than CASCADE_RADIUS squares out', () => {
    const island = quiet();
    const spawn = spawnTile(SEED);
    island.tiles.get(spawn)!.revealed = true;
    const opened = cascadeHints(island, [spawn], spawn);
    expect(opened.length).toBeGreaterThan(8);
    for (const h of opened) expect(squares(h.tile, spawn)).toBeLessThanOrEqual(ISLAND.CASCADE_RADIUS);
    // Unbounded, the same field opens to the shore — that is what was cut.
    const rest = cascadeHints(island, [spawn]);
    expect(rest.length).toBeGreaterThan(opened.length);
  });

  it('is carried on by a plain walk over dug ground', () => {
    const island = quiet();
    const spawn = spawnTile(SEED);
    island.tiles.get(spawn)!.revealed = true;
    cascadeHints(island, [spawn], spawn);
    const step = terrainNeighbors(SEED, spawn).find((n) => island.tiles.has(n))!;
    island.tiles.get(step)!.revealed = true;
    island.dugCount++;
    const rabbit = spawnRabbit('p1', 'P1', ENERGY.START, SEED);
    rabbit.lastMoveAt = 0;
    const out = resolveMove(island, rabbit, step, makeShape(SEED), mulberry32(1), 10_000);
    expect(out.ok).toBe(true);
    expect(out.dig).toBeUndefined();
    expect(out.hinted?.length).toBeGreaterThan(0);
    for (const h of out.hinted!) expect(squares(h.tile, step)).toBeLessThanOrEqual(ISLAND.CASCADE_RADIUS);
    // Standing still opens nothing more: the walk is what pays for the read.
    expect(cascadeAround(island, step)).toEqual([]);
  });

  it('gives a newborn island far less than it used to', () => {
    let open = 0;
    let total = 0;
    for (let s = 0; s < 12; s++) {
      const island = generateIsland({ seed: `born-${s}`, contentSeed: `c-${s}` });
      total += island.tiles.size;
      for (const t of island.tiles.values()) if (t.revealed || t.hinted) open++;
      const spawn = spawnTile(`born-${s}`);
      for (const [i, t] of island.tiles) {
        if (t.hinted) expect(squares(i, spawn)).toBeLessThanOrEqual(ISLAND.CASCADE_RADIUS);
        if (t.hinted) expect(t.content).not.toBe('bomb');
      }
    }
    // Was 23 % on Meadow, measured the same way before the bound.
    expect(open / total).toBeLessThan(0.1);
  });
});

describe('risk rises with the walk from the spawn', () => {
  it('keeps the tier counts and moves the bombs outward', () => {
    let near = 0, nearN = 0, far = 0, farN = 0;
    for (let s = 0; s < 30; s++) {
      const seed = `grad-${s}`;
      const island = generateIsland({ seed, contentSeed: `g-${s}` });
      const spawn = spawnTile(seed);
      const bombs = [...island.tiles.values()].filter((t) => t.content === 'bomb').length;
      expect(bombs).toBe(Math.floor(island.tiles.size * ISLAND_TIERS[0].bombDensity));
      const ds = [...island.tiles.keys()].map((i) => squares(i, spawn));
      const cut = [...ds].sort((a, b) => a - b)[Math.floor(ds.length / 2)];
      for (const [i, t] of island.tiles) {
        const inner = squares(i, spawn) <= cut;
        if (inner) { nearN++; if (t.content === 'bomb') near++; } else { farN++; if (t.content === 'bomb') far++; }
      }
    }
    expect(far / farN).toBeGreaterThan((near / nearN) * 1.25);
  });
});

describe('the red X', () => {
  /** A rabbit beside one buried bomb and one plain tile, nothing read yet. */
  function beside() {
    const island = quiet();
    const spawn = spawnTile(SEED);
    island.tiles.get(spawn)!.revealed = true;
    const around = boardNeighbors(island, spawn);
    const [bomb, plain] = around;
    island.tiles.get(bomb)!.content = 'bomb';
    recount(island);
    // Well under the ceiling, so a gain is never clipped by ENERGY.MAX.
    const rabbit = spawnRabbit('p1', 'P1', ENERGY.START - 3 * X_GAIN, SEED);
    rabbit.run = { startedAt: 0, tilesDug: 0, bombsHit: 0, loot: {}, nfts: [] };
    const far = [...island.tiles.keys()].find((i) => squares(i, spawn) > 2)!;
    return { island, spawn, bomb, plain, far, rabbit };
  }

  it('pays a little energy and a carrot bounty when it is right, and digs nothing', () => {
    const { island, bomb, rabbit } = beside();
    const energy = rabbit.energy;
    const out = flagTile(island, rabbit, bomb, 10_000);
    expect(out.flag).toEqual({
      tile: bomb, correct: true, energyDelta: X_GAIN, carrotDelta: FLAG.CARROTS_BASE, streak: 1,
    });
    expect(rabbit.energy).toBe(energy + X_GAIN);
    expect(rabbit.carrots).toBe(FLAG.CARROTS_BASE);
    const t = island.tiles.get(bomb)!;
    expect(t.flagged).toBe(true);
    expect(t.revealed).toBe(false);
    expect(publicView(island).flagged).toEqual([bomb]);
  });

  it('is what pays for digging: a dig costs, a right X buys several', () => {
    const { island, plain, bomb, rabbit } = beside();
    const energy = rabbit.energy;
    rabbit.lastMoveAt = 0;
    const dug = resolveMove(island, rabbit, plain, makeShape(SEED), mulberry32(1), 10_000);
    expect(dug.ok).toBe(true);
    expect(ENERGY.DIG_COST).toBeGreaterThan(0);
    expect(rabbit.energy).toBe(energy - ENERGY.DIG_COST);
    // One proven bomb funds a handful of digs — the loop the tuning is built on.
    expect(X_GAIN / ENERGY.DIG_COST).toBeGreaterThanOrEqual(5);
    // And the bomb is still markable from the tile the rabbit walked onto, if
    // it is still beside it; from the spawn ring it always was.
    rabbit.tile = spawnTile(SEED);
    expect(flagTile(island, rabbit, bomb, 20_000).flag?.correct).toBe(true);
  });

  it('never fills the bar past its ceiling, and pays the overflow in carrots', () => {
    const { island, bomb, rabbit } = beside();
    rabbit.energy = ENERGY.MAX - 1;
    const out = flagTile(island, rabbit, bomb, 10_000);
    expect(rabbit.energy).toBe(ENERGY.MAX);
    expect(out.flag?.energyDelta).toBe(1);
    // Seven points the bar had no room for: a right X always pays something.
    expect(out.flag?.carrotDelta).toBe(FLAG.CARROTS_BASE + (X_GAIN - 1) * FLAG.OVERFLOW_CARROTS);
    expect(rabbit.carrots).toBe(out.flag!.carrotDelta);
  });

  it('pays no overflow while the bar has room', () => {
    const { island, bomb, rabbit } = beside();
    const out = flagTile(island, rabbit, bomb, 10_000);
    expect(out.flag?.energyDelta).toBe(X_GAIN);
    expect(out.flag?.carrotDelta).toBe(FLAG.CARROTS_BASE);
  });

  it('costs energy when it is wrong, and writes the number it paid for', () => {
    const { island, plain, rabbit } = beside();
    rabbit.run!.flagStreak = 4;
    const energy = rabbit.energy;
    const out = flagTile(island, rabbit, plain, 10_000);
    expect(out.flag).toMatchObject({ correct: false, energyDelta: -FLAG.LOSS, carrotDelta: 0, streak: 0 });
    expect(rabbit.energy).toBe(energy - FLAG.LOSS);
    expect(rabbit.run!.flagStreak).toBe(0);
    const t = island.tiles.get(plain)!;
    expect(t.hinted).toBe(true);
    expect(t.revealed).toBe(false);
    expect(t.flagged).toBeFalsy();
    expect(out.flag?.hinted?.[0]).toEqual({ tile: plain, adjacent: t.adjacent });
    // The carrot, if any, is still in the ground: a wrong X reads, it does not dig.
    expect(islandProgress(island).safeLeft).toBe(island.tiles.size - 2);
  });

  it('prices a blind guess to lose and a sure thing to win', () => {
    // q*GAIN - (1-q)*LOSS: negative at a coin flip, positive on a certainty,
    // and a wrong X is cheaper than the blast it stands in for.
    expect(0.5 * X_GAIN - 0.5 * FLAG.LOSS).toBeLessThan(0);
    expect(X_GAIN).toBeGreaterThan(0);
    expect(FLAG.LOSS).toBeLessThan(ENERGY.BOMB_LOSS);
  });

  it('ends the run when a wrong X spends the last of the energy', () => {
    const { island, plain, rabbit } = beside();
    rabbit.energy = FLAG.LOSS;
    const out = flagTile(island, rabbit, plain, 10_000);
    expect(out.runOver).toBe(true);
    expect(rabbit.alive).toBe(false);
  });

  it('refuses ground that already says something, and ground out of reach', () => {
    const { island, spawn, bomb, plain, far, rabbit } = beside();
    expect(flagTile(island, rabbit, far, 10_000).rejection).toBe('not-adjacent');
    expect(flagTile(island, rabbit, spawn, 10_000).rejection).toBe('not-adjacent');
    island.tiles.get(plain)!.hinted = true;
    expect(flagTile(island, rabbit, plain, 10_000).rejection).toBe('known');
    flagTile(island, rabbit, bomb, 10_000);
    expect(flagTile(island, rabbit, bomb, 10_000).rejection).toBe('known');
    rabbit.stunnedUntil = 99_999;
    expect(flagTile(island, rabbit, bomb, 10_000).rejection).toBe('stunned');
  });

  it('running dry by digging leaves the rabbit alive, and a right X revives it', () => {
    const { island, plain, bomb, rabbit } = beside();
    rabbit.energy = ENERGY.DIG_COST;
    rabbit.lastMoveAt = 0;
    const dug = resolveMove(island, rabbit, plain, makeShape(SEED), mulberry32(1), 10_000);
    expect(rabbit.energy).toBe(0);
    expect(rabbit.alive).toBe(true);
    expect(dug.runOver).toBe(false);
    // Dry: no more digging...
    const fresh = boardNeighbors(island, rabbit.tile).find((n) => {
      const t = island.tiles.get(n)!;
      return !t.revealed && t.content !== 'bomb' && terrainNeighbors(SEED, rabbit.tile).includes(n);
    });
    if (fresh !== undefined) {
      rabbit.lastMoveAt = 0;
      expect(resolveMove(island, rabbit, fresh, makeShape(SEED), mulberry32(1), 20_000).rejection).toBe('no-energy');
    }
    // ...but the puzzle still pays, and what it pays is the way back in.
    rabbit.tile = spawnTile(SEED);
    const out = flagTile(island, rabbit, bomb, 30_000);
    expect(out.flag?.correct).toBe(true);
    expect(rabbit.energy).toBe(X_GAIN);
    expect(rabbit.alive).toBe(true);
  });

  it('a blast on the last of the energy still ends the run, and so does a wrong X at zero', () => {
    const a = beside();
    a.rabbit.energy = ENERGY.DIG_COST;
    a.rabbit.lastMoveAt = 0;
    const hit = resolveMove(a.island, a.rabbit, a.bomb, makeShape(SEED), mulberry32(1), 10_000);
    expect(hit.dig?.content).toBe('bomb');
    expect(a.rabbit.alive).toBe(false);
    expect(hit.runOver).toBe(true);

    const b = beside();
    b.rabbit.energy = 0;
    const wrong = flagTile(b.island, b.rabbit, b.plain, 10_000);
    expect(wrong.flag?.correct).toBe(false);
    expect(wrong.runOver).toBe(true);
  });

  it('will not let anyone walk onto a marked bomb', () => {
    const { island, bomb, rabbit } = beside();
    flagTile(island, rabbit, bomb, 10_000);
    rabbit.lastMoveAt = 0;
    const energy = rabbit.energy;
    const out = resolveMove(island, rabbit, bomb, makeShape(SEED), mulberry32(1), 20_000);
    expect(out.ok).toBe(false);
    expect(out.rejection).toBe('flagged');
    expect(rabbit.energy).toBe(energy);
  });

  it('climbs with the streak, caps, digs up a raid bomb, and a blast resets it', () => {
    const { island, bomb, rabbit } = beside();
    rabbit.run!.flagStreak = FLAG.ITEM_EVERY - 1;
    const out = flagTile(island, rabbit, bomb, 10_000);
    expect(out.flag).toMatchObject({ carrotDelta: FLAG.CARROTS_MAX, streak: FLAG.ITEM_EVERY, item: true });
    expect(rabbit.run!.loot.bomb).toBe(1);

    // A second bomb, stepped on: the streak goes with the energy.
    const spawn = spawnTile(SEED);
    const next = terrainNeighbors(SEED, spawn).find((n) => island.tiles.has(n) && n !== bomb)!;
    island.tiles.get(next)!.content = 'bomb';
    rabbit.lastMoveAt = 0;
    const hit = resolveMove(island, rabbit, next, makeShape(SEED), mulberry32(1), 20_000);
    expect(hit.dig?.content).toBe('bomb');
    expect(rabbit.run!.flagStreak).toBe(0);
  });
});
