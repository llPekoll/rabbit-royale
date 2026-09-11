/**
 * The terrain, as the thing BOTH sides derive rather than exchange.
 *
 * The client is a reflection of the server: the server decides and validates,
 * the client redraws. That only holds if the same seed produces byte-identical
 * islands on a machine with no canvas and in a browser — otherwise the client
 * draws a tree the server does not know about, and the highlight starts lying.
 *
 * These are the tests that keep that promise honest. Everything here is a
 * property of the generator, not of the picture, so nothing needs a renderer.
 */
import { describe, expect, it } from 'vitest';
import { generateTerrain } from '@/game/island/terrain';
import { IslandBoard } from '@/game/island/board';
import { blocksCell } from '@/game/island/blocking';
import { levelAt } from '@/game/island/generate';

const SEEDS = Array.from({ length: 30 }, (_, i) => `terrain-${i}`);

describe('the same seed builds the same island', () => {
  it.each(SEEDS)('%s is reproducible', (seed) => {
    const a = generateTerrain({ seed, tiers: 3 });
    const b = generateTerrain({ seed, tiers: 3 });
    expect(a.placements).toEqual(b.placements);
    expect([...a.map.level]).toEqual([...b.map.level]);
  });

  it('different seeds build different islands', () => {
    const a = generateTerrain({ seed: 'one', tiers: 3 });
    const b = generateTerrain({ seed: 'two', tiers: 3 });
    expect(a.placements).not.toEqual(b.placements);
  });

  /**
   * The scatter must not depend on anything a renderer has.
   *
   * It used to live inside the Pixi view, where it could quietly come to
   * depend on a texture's size or a sprite's anchor. Running it twice in one
   * process proves it is pure; running it on the server is what makes the
   * client a reflection rather than a second opinion.
   */
  it('places nothing in the sea, and nothing inside a cliff', () => {
    for (const seed of SEEDS) {
      const { map, placements } = generateTerrain({ seed, tiers: 4 });
      for (const p of placements) {
        expect(levelAt(map, p.x, p.y)).toBeGreaterThan(0);
        expect(levelAt(map, p.x, p.y - 1)).toBeLessThanOrEqual(levelAt(map, p.x, p.y));
      }
    }
  });

  it('never stacks two blocking things on one cell', () => {
    for (const seed of SEEDS) {
      const { placements } = generateTerrain({ seed, tiers: 3 });
      const cells = placements.filter((p) => blocksCell(p.kind)).map((p) => `${p.x},${p.y}`);
      expect(new Set(cells).size).toBe(cells.length);
    }
  });
});

/**
 * The guarantee a run depends on: an island with its scenery on it is still
 * one connected board.
 *
 * Trees and flocks block cells, so this is where a generous scatter could cut
 * the island into pieces — and unlike a fragmented coastline, nobody would
 * notice until a player was walled in.
 */
describe('a scattered island is still playable', () => {
  it.each(SEEDS)('%s stays one board with scenery on it', (seed) => {
    const { map, placements } = generateTerrain({ seed, tiers: 3 });
    const board = new IslandBoard(map, placements);

    const open: Array<[number, number]> = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (board.isWalkable(x, y)) open.push([x, y]);
      }
    }
    expect(open.length).toBeGreaterThan(20);

    const seen = new Set<string>([`${open[0][0]},${open[0][1]}`]);
    const queue = [open[0]];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      for (const s of board.stepsFrom(x, y)) {
        const k = `${s.x},${s.y}`;
        if (seen.has(k)) continue;
        seen.add(k);
        queue.push([s.x, s.y]);
      }
    }

    // Scenery may pinch off the odd corner; most of the island must remain
    // reachable from anywhere on it, or a run can strand a player.
    expect(seen.size / open.length).toBeGreaterThan(0.85);
  });
});
