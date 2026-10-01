/**
 * A chest's loot is rolled from the PRIVATE content seed, never from the
 * public one the snapshot carries — otherwise a modified client knows which
 * crown holds the Genesis piece before walking to it. See `chestRng`.
 */
import { describe, expect, it } from 'vitest';
import { firstIslandSeed } from '@/lib/game/first-island';
import { chestRng, generateIsland, lootSeedFor, publicView } from '@/lib/game/island';
import { mulberry32, seedFrom } from '@/lib/game/rng';

const SEED = 'island:7';
const draws = (rng: () => number) => [rng(), rng(), rng()];

describe('chestRng', () => {
  it('is not derivable from the public seed', () => {
    const a = generateIsland({ seed: SEED, contentSeed: 'secret-a' });
    const b = generateIsland({ seed: SEED, contentSeed: 'secret-b' });
    const tiles = [...a.tiles.keys()];
    // Same public seed, same tile, different content seed → different roll.
    expect(tiles.some((t) => draws(chestRng(a, t))[0] !== draws(chestRng(b, t))[0])).toBe(true);
    // And never the old public roll `<seed>:<tile>` the client could rebuild.
    for (const t of tiles.slice(0, 50)) {
      expect(draws(chestRng(a, t))).not.toEqual(draws(mulberry32(seedFrom(`${SEED}:${t}`))));
    }
  });

  it('is fixed per island and tile — a reconnect cannot re-roll', () => {
    const a = generateIsland({ seed: SEED, contentSeed: 'secret-a' });
    expect(draws(chestRng(a, 42))).toEqual(draws(chestRng(a, 42)));
    expect(draws(chestRng(a, 42))).not.toEqual(draws(chestRng(a, 43)));
  });

  it('never travels in the public view', () => {
    const a = generateIsland({ seed: SEED, contentSeed: 'secret-a' });
    const wire = JSON.stringify(publicView(a));
    expect(wire).not.toContain('secret-a');
    expect(wire).not.toContain(a.lootSeed);
  });

  it('keeps the public roll on the first island only (bronze, carrots, no NFT)', () => {
    const first = firstIslandSeed('p1');
    expect(lootSeedFor(first, 'anything')).toBe(first);
    expect(generateIsland({ seed: first, contentSeed: 'x' }).lootSeed).toBe(first);
    expect(lootSeedFor(SEED, 'secret-a')).toBe('loot:secret-a');
  });
});
