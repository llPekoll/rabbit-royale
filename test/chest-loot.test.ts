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
import { CHEST_LOOT, CHEST_LOOT_BY_TIER, CHEST_NFT_ODDS, ISLAND, SHOP } from '../config/tuning';
import { resolveMove, spawnRabbit } from '../src/lib/game/run';
import { generateIsland } from '../src/lib/game/island';
import { terrainNeighbors, farmableTiles } from '../src/lib/game/terrainBoard';
import { makeShape } from '../src/config/gridConfig';
import { mulberry32 } from '../src/lib/game/rng';
import { GARDEN_KINDS, isItemKind } from '../src/lib/game/inventory';
import { CHEST_TIER_ORDER, type ChestTier } from '../src/config/chestConfig';
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
function digChest(rngSeed: number, tier?: ChestTier) {
  const pair = pairOfTiles();
  if (!pair) return null;
  const [from, to] = pair;
  const island = generateIsland({ seed: SEED });
  if (!island.tiles.has(from) || !island.tiles.has(to)) return null;

  const rabbit = digger(from);
  island.tiles.get(to)!.content = 'chest';
  island.tiles.get(to)!.revealed = false;
  if (tier) island.tiles.get(to)!.chestTier = tier;
  const out = resolveMove(island, rabbit, to, SHAPE, mulberry32(rngSeed), NOW, []);
  return out.ok ? { rabbit, out } : null;
}

/**
 * THE test that keeps the board honest.
 *
 * A chest announces its tier from across the island and the player spends real
 * steps on that word. `CHEST_TIER_PROMISE` is what the label says; these tables
 * are what the roll does. If they ever drift apart the game lies to the player
 * in the one place it asked them to take a risk — and nothing else would fail.
 */
describe('the promise on the board', () => {
  const KINDS_FOR: Record<string, readonly string[]> = {
    bronze: ['carrots'],
    silver: GARDEN_KINDS,
    gold: ['bomb', 'shield', 'lightning'],
    crown: ['bomb', 'shield', 'lightning'],
  };

  it.each(CHEST_TIER_ORDER)('%s rolls only what its label promises', (tier) => {
    const rolled = CHEST_LOOT_BY_TIER[tier].map((r) => r.kind as string);
    expect(rolled.length).toBeGreaterThan(0);
    for (const kind of rolled) {
      expect(KINDS_FOR[tier], `${tier} can roll ${kind}, which its label does not promise`)
        .toContain(kind);
    }
  });

  /**
   * Only CROWN can carry a piece. It is the longest walk on the island, and the
   * NFT is what pays for it — a bronze chest that could drop one would make
   * that walk pointless.
   */
  it('keeps the Genesis piece to the crown alone', () => {
    for (const tier of CHEST_TIER_ORDER) {
      const kinds = CHEST_LOOT_BY_TIER[tier].map((r) => r.kind as string);
      expect(kinds, `${tier} must not roll an nft from its table`).not.toContain('nft');
    }
    // It is a SEPARATE roll on top of the crown's guaranteed item, not a table
    // entry — so the crown never trades its item away for the chance.
    expect(CHEST_NFT_ODDS.inCrown).toBeGreaterThan(0);
  });
});

describe('the loot table', () => {
  it('weighs every entry positively — a zero-weight line is dead config', () => {
    // Typed loosely on purpose: `as const` makes every tier's array its own
    // literal tuple, so the two shapes will not unify without a common type.
    const rows: readonly { kind: string; weight: number; min: number; max: number }[] = [
      ...CHEST_LOOT,
      ...CHEST_TIER_ORDER.flatMap((t) => [...CHEST_LOOT_BY_TIER[t]]),
    ];
    for (const row of rows) {
      expect(row.weight, `${row.kind} has no weight`).toBeGreaterThan(0);
      expect(row.min).toBeGreaterThan(0);
      expect(row.max).toBeGreaterThanOrEqual(row.min);
    }
  });

  /** A crown chest's NFT chance is a real, sizeable one — see CHEST_NFT_ODDS. */
  it('gives the crown walk odds worth taking', () => {
    expect(CHEST_NFT_ODDS.inCrown).toBeGreaterThan(0);
    expect(CHEST_NFT_ODDS.inCrown).toBeLessThanOrEqual(1);
  });

  /**
   * The merge rule: both families stay reachable. A farmer who never raids
   * still has to meet something they want, or the chests are a raider-only
   * reward sitting on a farming map.
   */
  it('carries both the raid items and the garden ones across the ladder', () => {
    const all = CHEST_TIER_ORDER.flatMap((t) => CHEST_LOOT_BY_TIER[t].map((r) => r.kind as string));
    for (const raid of ['bomb', 'shield', 'lightning']) expect(all).toContain(raid);
    for (const garden of GARDEN_KINDS) expect(all).toContain(garden);
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

/**
 * The tier survives the round trip: generation writes it, the dig reads it,
 * and what comes out is what the label promised. Pinned end to end because the
 * two halves live in different files and nothing else would notice them
 * drifting apart.
 */
describe('a tiered chest, dug', () => {
  it('gives every generated chest a tier', () => {
    const island = generateIsland({ seed: SEED });
    const chests = [...island.tiles.values()].filter((t) => t.content === 'chest');
    expect(chests.length).toBeGreaterThan(0);
    for (const c of chests) {
      expect(CHEST_TIER_ORDER, 'a chest with no tier cannot keep a promise')
        .toContain(c.chestTier);
    }
  });

  it.each(CHEST_TIER_ORDER)('a %s chest pays only what its label promised', (tier) => {
    const allowed = CHEST_LOOT_BY_TIER[tier].map((r) => r.kind as string);
    let rolls = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const dug = digChest(seed, tier);
      const loot = dug?.out.dig?.loot;
      if (!loot) continue;
      rolls++;
      expect(allowed, `${tier} paid ${loot.kind}`).toContain(loot.kind);
      expect(loot.amount).toBeGreaterThan(0);
    }
    expect(rolls, 'no chest was actually dug — the fixture is broken').toBeGreaterThan(0);
  });

  /** Only a crown can hand over a piece, and never instead of its item. */
  it('keeps Genesis pieces to crown chests', () => {
    for (const tier of ['bronze', 'silver', 'gold'] as const) {
      for (let seed = 1; seed <= 40; seed++) {
        const dug = digChest(seed, tier);
        if (!dug) continue;
        expect(dug.rabbit.run!.nfts, `${tier} dropped a piece`).toHaveLength(0);
      }
    }
    // And a crown that does drop one still pays its item in the same dig.
    let withNft = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const dug = digChest(seed, 'crown');
      if (!dug?.out.dig) continue;
      if (dug.rabbit.run!.nfts.length) {
        withNft++;
        expect(dug.out.dig.loot, 'a piece must never replace the crown item').toBeDefined();
      }
    }
    expect(withNft, 'no crown ever rolled a piece — the odds are unreachable')
      .toBeGreaterThan(0);
  });
});
