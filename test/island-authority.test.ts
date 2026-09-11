import { describe, expect, it } from 'vitest';
import { generateIsland } from '@/lib/game/island';
import { resolveMove, spawnRabbit } from '@/lib/game/run';
import { reachableTiles } from '@/lib/game/reachable';
import { terrainNeighbors, farmableTiles, spawnTile } from '@/lib/game/terrainBoard';
import { mulberry32 } from '@/lib/game/rng';
import { makeShape } from '@/config/gridConfig';

/**
 * The promise the whole redesign rests on: the ring the client lights is
 * exactly the set of moves the server accepts. Checked end to end, over many
 * seeds, through the REAL functions both sides call.
 */
describe('client ring mirrors server authority', () => {
  it.each(Array.from({ length: 25 }, (_, i) => `live-${i}`))('%s', (seed) => {
    const island = generateIsland({ seed });
    const rabbit = spawnRabbit('p1', 'Test', 10, seed);
    const shape = makeShape(seed);

    const lit = reachableTiles({
      tile: rabbit.tile,
      energy: rabbit.energy,
      alive: true,
      stunnedUntil: 0,
      isRevealed: (i) => island.tiles.get(i)?.revealed ?? false,
    }, seed, 1_000_000);

    // Every lit tile is accepted by the server.
    for (const to of lit) {
      const fresh = spawnRabbit('p2', 'T', 10, seed);
      fresh.lastMoveAt = 0;
      const out = resolveMove(island, fresh, to, shape, mulberry32(1), 1_000_000);
      expect(out.ok, `server refused a lit tile ${to}: ${out.rejection}`).toBe(true);
    }

    // And every tile NOT offered by the terrain is refused.
    const offered = new Set(terrainNeighbors(seed, rabbit.tile));
    for (let i = 0; i < 256; i++) {
      if (offered.has(i) || i === rabbit.tile) continue;
      const fresh = spawnRabbit('p3', 'T', 10, seed);
      fresh.lastMoveAt = 0;
      const out = resolveMove(island, fresh, i, shape, mulberry32(1), 1_000_000);
      expect(out.ok, `server allowed an unlit tile ${i}`).toBe(false);
    }
  });

  it('buries nothing a player cannot reach', () => {
    for (let i = 0; i < 20; i++) {
      const seed = `buried-${i}`;
      const island = generateIsland({ seed });
      const playable = new Set(farmableTiles(seed));
      for (const tile of island.tiles.keys()) expect(playable.has(tile)).toBe(true);
    }
  });

  it('spawns every rabbit on ground it can stand on', () => {
    for (let i = 0; i < 30; i++) {
      const seed = `spawn-${i}`;
      const rabbit = spawnRabbit('p', 'T', 10, seed);
      expect(rabbit.tile).toBe(spawnTile(seed));
      expect(farmableTiles(seed)).toContain(rabbit.tile);
    }
  });
});
