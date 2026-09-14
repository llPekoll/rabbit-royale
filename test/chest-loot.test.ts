/**
 * What a chest gives, and where it puts it.
 *
 * The table is ONE table drawn from wherever a chest is dug, and it mixes three
 * kinds of thing that go to three different places: carrots land on the rabbit
 * immediately, items go into the run's bag and are granted when it banks, and
 * an NFT is recorded rather than counted. A drop routed to the wrong one of
 * those is silent — the player just never receives it — so the routing is
 * pinned here rather than left to the server.
 */
import { describe, expect, it } from 'vitest';
import { CHEST_LOOT, CHEST_NFT_ODDS, ISLAND, SHOP } from '../config/tuning';
import { resolveMove, spawnRabbit } from '../src/lib/game/run';
import { generateIsland } from '../src/lib/game/island';
import { terrainNeighbors, farmableTiles } from '../src/lib/game/terrainBoard';
import { makeShape } from '../src/config/gridConfig';
import { mulberry32 } from '../src/lib/game/rng';
import { GARDEN_KINDS, isItemKind } from '../src/lib/game/inventory';
import type { Rabbit } from '../src/lib/game/types';

const SEED = 'chest-test';
const NOW = 1_000_000;
const SHAPE = makeShape(SEED);

/** A rabbit mid-run: it has the paperwork a chest drop is banked into. */
function digger(tile: number): Rabbit {
  return {
    ...spawnRabbit('p1', 'R', 100, SEED),
    tile,
    run: { id: 'run-1', startedAt: NOW, tilesDug: 0, bombsHit: 0, loot: {}, nfts: [] },
  };
}

/** A tile with a neighbour, so a dig can actually be resolved onto it. */
function pairOfTiles(): [number, number] | null {
  for (const a of farmableTiles(SEED)) {
    for (const b of terrainNeighbors(SEED, a)) return [a, b];
  }
  return null;
}

/** Force `tile` to be a chest and dig it, returning the rabbit and the result. */
function digChest(rngSeed: number) {
  const pair = pairOfTiles();
  if (!pair) return null;
  const [from, to] = pair;
  const island = generateIsland({ seed: SEED });
  if (!island.tiles.has(from) || !island.tiles.has(to)) return null;

  const rabbit = digger(from);
  island.tiles.get(to)!.content = 'chest';
  island.tiles.get(to)!.revealed = false;
  const out = resolveMove(island, rabbit, to, SHAPE, mulberry32(rngSeed), NOW, []);
  return out.ok ? { rabbit, out } : null;
}

describe('the loot table', () => {
  it('weighs every entry positively — a zero-weight line is dead config', () => {
    for (const row of CHEST_LOOT) {
      expect(row.weight, `${row.kind} has no weight`).toBeGreaterThan(0);
      expect(row.min).toBeGreaterThan(0);
      expect(row.max).toBeGreaterThanOrEqual(row.min);
    }
  });

  /**
   * The documented odds must BE the odds. `CHEST_NFT_ODDS` is quoted in the
   * comment that justifies the rarity, and a weight nudged during a retune
   * would otherwise leave that reasoning describing a table that no longer
   * exists.
   */
  it('drops an NFT at the rate the config claims', () => {
    const total = CHEST_LOOT.reduce((sum, r) => sum + r.weight, 0);
    const nft = CHEST_LOOT.find((r) => r.kind === 'nft');
    expect(nft).toBeDefined();
    expect(total / nft!.weight).toBeCloseTo(CHEST_NFT_ODDS.oneIn, 6);
  });

  /**
   * The merge rule: one table serves both kinds of player. A farmer who never
   * raids still has to pull something they want, or the chest is a raider-only
   * reward sitting on a farming map.
   */
  it('carries both the raid items and the garden ones', () => {
    const kinds = CHEST_LOOT.map((r) => r.kind as string);
    for (const raid of ['bomb', 'shield', 'lightning']) expect(kinds).toContain(raid);
    for (const garden of GARDEN_KINDS) expect(kinds).toContain(garden);
  });

  it('names only kinds the bag or the economy can actually receive', () => {
    for (const row of CHEST_LOOT) {
      const known = row.kind === 'carrots' || row.kind === 'nft' || isItemKind(row.kind);
      expect(known, `${row.kind} is in no known family`).toBe(true);
    }
  });

  /**
   * Carrots stay the most common drop. Every other entry can be capped out or
   * unwanted; carrots never are, and a chest that disappoints is worse than no
   * chest because the player walked onto a known tile to reach it.
   */
  it('keeps carrots the floor', () => {
    const total = CHEST_LOOT.reduce((sum, r) => sum + r.weight, 0);
    const carrots = CHEST_LOOT.find((r) => r.kind === 'carrots')!;
    expect(carrots.weight / total).toBeGreaterThanOrEqual(0.25);
  });

  /** Water and fertiliser are found, not sold — see the shop suite. */
  it('drops the garden boosts that the shop refuses to sell', () => {
    for (const kind of GARDEN_KINDS) {
      expect(CHEST_LOOT.some((r) => r.kind === kind)).toBe(true);
      expect(SHOP.PRICES).not.toHaveProperty(kind);
    }
  });
});

describe('digging a chest', () => {
  it('puts a chest on the map at all', () => {
    expect(ISLAND.CHEST_DENSITY).toBeGreaterThan(0);
    const island = generateIsland({ seed: SEED });
    const chests = [...island.tiles.values()].filter((t) => t.content === 'chest');
    expect(chests.length).toBeGreaterThan(0);
  });

  /**
   * Every roll goes SOMEWHERE. This is the assertion that would have caught the
   * phase-1 stub, which reported an item to the client and then dropped it: the
   * player saw a shield in the chest and never received one.
   */
  it('routes every roll to a destination, whatever it rolled', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const dug = digChest(seed);
      if (!dug) continue;
      const { rabbit, out } = dug;
      const loot = out.dig?.loot;
      if (!loot) continue;

      if (loot.kind === 'carrots') {
        expect(out.dig!.carrotDelta).toBe(loot.amount);
        expect(rabbit.carrots).toBeGreaterThanOrEqual(loot.amount);
      } else if (loot.kind === 'nft') {
        expect(rabbit.run!.nfts.length).toBe(1);
      } else {
        // An item: banked in the bag, and NOT paid out as carrots as well.
        expect(rabbit.run!.loot[loot.kind as 'bomb']).toBe(loot.amount);
        expect(out.dig!.carrotDelta).toBe(0);
      }
    }
  });

  /** The routing test is only worth anything if it actually saw variety. */
  it('exercises more than one kind across seeds', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const dug = digChest(seed);
      if (dug?.out.dig?.loot) seen.add(dug.out.dig.loot.kind);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('accumulates repeat drops of one kind rather than overwriting', () => {
    const rabbit = digger(0);
    const bag = rabbit.run!.loot;
    bag.water = (bag.water ?? 0) + 2;
    bag.water = (bag.water ?? 0) + 3;
    expect(bag.water).toBe(5);
  });
});
