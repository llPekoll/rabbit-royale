/**
 * THE CASCADE: a zero opens the numbers around it, and digs nothing.
 *
 * Minesweeper's open-a-zone rule, kept without its "dig everything" half —
 * because here a tile holds a carrot, and the first digger takes it. The
 * cascade shows what the ground SAYS and leaves what the ground HOLDS, so
 * the island stays the clock and the race stays physical. These are the
 * properties that keep it honest.
 */
import { describe, expect, it } from 'vitest';
import { boardNeighbors, cascadeHints, generateIsland, islandProgress, publicView } from '../src/lib/game/island';
import { resolveMove, spawnRabbit } from '../src/lib/game/run';
import { makeShape } from '../src/config/gridConfig';
import { spawnTile, terrainNeighbors } from '../src/lib/game/terrainBoard';
import { mulberry32 } from '../src/lib/game/rng';
import { readFileSync } from 'node:fs';

const SEED = 'cascade';

/** An island with a hand-laid zero zone: no bombs at all, then one far bomb. */
function quietIsland(seed = SEED) {
  const island = generateIsland({ seed, contentSeed: 'quiet' });
  // Wipe what generation did — the ring it revealed and the zone it opened —
  // so each test starts from a fully covered board.
  for (const t of island.tiles.values()) {
    t.content = 'empty'; t.adjacent = 0; t.hinted = false; t.revealed = false;
  }
  island.dugCount = 0;
  return island;
}

describe('cascadeHints', () => {
  it('opens the numbers around a zero, out to the first real number', () => {
    const island = quietIsland();
    const spawn = spawnTile(SEED);
    // Bury one bomb three steps out and recount by hand.
    const far = [...island.tiles.keys()].find((i) => {
      const d1 = new Set(boardNeighbors(island, spawn));
      const d2 = new Set([...d1].flatMap((n) => boardNeighbors(island, n)));
      return !d1.has(i) && !d2.has(i) && i !== spawn;
    })!;
    island.tiles.get(far)!.content = 'bomb';
    for (const [i, t] of island.tiles) {
      t.adjacent = boardNeighbors(island, i).filter((n) => island.tiles.get(n)!.content === 'bomb').length;
      t.revealed = false;
      t.hinted = false;
    }
    island.tiles.get(spawn)!.revealed = true;

    const opened = cascadeHints(island, [spawn]);
    expect(opened.length).toBeGreaterThan(0);
    // Everything opened is undug, and everything opened is NOT the bomb.
    for (const h of opened) {
      const t = island.tiles.get(h.tile)!;
      expect(t.revealed).toBe(false);
      expect(t.hinted).toBe(true);
      expect(t.content).not.toBe('bomb');
      expect(h.adjacent).toBe(t.adjacent);
    }
    // It stopped at the numbers: no hinted tile with a count > 0 has a
    // hinted-and-zero neighbour it was reached THROUGH that is itself unhinted.
    // Simpler statement of the same thing: every neighbour of a hinted zero is
    // hinted or revealed.
    for (const [i, t] of island.tiles) {
      if (!t.hinted || t.adjacent !== 0) continue;
      for (const nb of boardNeighbors(island, i)) {
        const n = island.tiles.get(nb)!;
        expect(n.hinted || n.revealed).toBe(true);
      }
    }
  });

  it('never digs — hinted ground still counts as ground left', () => {
    const island = quietIsland();
    const before = islandProgress(island);
    island.tiles.get(spawnTile(SEED))!.revealed = true;
    const opened = cascadeHints(island, [spawnTile(SEED)]);
    expect(opened.length).toBeGreaterThan(0);
    const after = islandProgress(island);
    // One tile was revealed by hand; the cascade moved nothing else.
    expect(after.safeLeft).toBe(before.safeLeft - 1);
  });

  it('ignores a start that is not an open zero', () => {
    const island = quietIsland();
    const spawn = spawnTile(SEED);
    // Not revealed, not hinted: nothing to cascade from.
    expect(cascadeHints(island, [spawn])).toEqual([]);
    // Revealed but a bomb: a bomb's own zero says nothing about its sides.
    island.tiles.get(spawn)!.revealed = true;
    island.tiles.get(spawn)!.content = 'bomb';
    expect(cascadeHints(island, [spawn])).toEqual([]);
  });

  it('runs at generation from the spawn ring', () => {
    const island = generateIsland({ seed: 'born', contentSeed: 'born' });
    const spawn = spawnTile('born');
    const ring = terrainNeighbors('born', spawn);
    const zeros = ring.filter((i) => island.tiles.get(i)!.adjacent === 0);
    if (zeros.length === 0) return; // a ring of numbers has nothing to open
    for (const z of zeros) {
      for (const nb of boardNeighbors(island, z)) {
        const t = island.tiles.get(nb)!;
        expect(t.revealed || t.hinted).toBe(true);
      }
    }
  });
});

describe('a dig on a zero', () => {
  it('reports what it opened, and the wire carries numbers only', () => {
    const island = generateIsland({ seed: 'dig-zero', contentSeed: 'dig-zero' });
    const spawn = spawnTile('dig-zero');
    const rabbit = spawnRabbit('p1', 'P', 24, 'dig-zero');
    // Step onto a ring tile — already revealed, so no dig; then onto an undug
    // neighbour of it that reads zero, if there is one.
    const ring = terrainNeighbors('dig-zero', spawn);
    let found = false;
    for (const r of ring) {
      const target = terrainNeighbors('dig-zero', r).find((n) => {
        const t = island.tiles.get(n);
        return t && !t.revealed && t.content !== 'bomb' && t.adjacent === 0;
      });
      if (target === undefined) continue;
      rabbit.tile = r;
      rabbit.lastMoveAt = 0;
      const out = resolveMove(island, rabbit, target, makeShape('dig-zero'), mulberry32(1), 10_000);
      expect(out.ok).toBe(true);
      // The cascade at birth may already have opened this zero's surroundings;
      // either way, nothing opened is a bomb and nothing opened is dug.
      for (const h of out.dig?.hinted ?? []) {
        expect(island.tiles.get(h.tile)!.revealed).toBe(false);
        expect(island.tiles.get(h.tile)!.content).not.toBe('bomb');
      }
      found = true;
      break;
    }
    expect(found).toBe(true);

    const view = publicView(island);
    for (const h of view.hinted) {
      expect(Object.keys(h).sort()).toEqual(['adjacent', 'tile']);
      expect(island.tiles.get(h.tile)!.revealed).toBe(false);
    }
  });
});

describe('the client draws the number on every dug tile', () => {
  it('no longer hides the hint under a carrot', () => {
    // A dug carrot beside two bombs showed the carrot lifting away and then a
    // blank — read as "0" on the one tile the player had just paid attention
    // to. The number is drawn for every non-bomb content now.
    const TILE = readFileSync(new URL('../src/game/entities/Tile.ts', import.meta.url), 'utf8');
    expect(TILE).not.toMatch(/content === 'empty' && adjacent > 0/);
    expect(TILE).toMatch(/content !== 'bomb' && adjacent > 0 && !this\.hintGroup/);
    expect(TILE).toMatch(/revealHint\(adjacent: number\)/);
  });

  it('is told about the cascade on join, on the event, and on a resync', () => {
    const HOOK = readFileSync(new URL('../src/components/use-game-socket.ts', import.meta.url), 'utf8');
    // The two SNAPSHOT paths — a join and a resync — write the numbers one
    // tile at a time: that ground was opened before the player got here, and
    // replaying it as an event would announce old news.
    expect(HOOK.match(/s(cene)?\.hintTile\(h\.tile, h\.adjacent\)/g)?.length).toBe(2);
    // The LIVE path hands the zone over whole, so the scene can play it as a
    // ripple spreading from where it was opened (`IslandScene.openZone`).
    expect(HOOK).toMatch(/s\.openZone\(p\.tiles, p\.from\)/);
    expect(HOOK).toMatch(/socket\.on\('hints_revealed'/);
    const SERVER = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
    expect(SERVER.match(/emit\('hints_revealed'/g)?.length).toBe(5); // dig, shove, strike, walk, wrong X
    // Every one of them says WHERE the zone opened. The ripple spreads from
    // that tile; without it the client has a region and no centre, and opens
    // it flat.
    expect(SERVER.match(/emit\('hints_revealed', \{ tiles: [^}]*from:/g)?.length).toBe(5);
    expect(SERVER).toMatch(/hinted: view\.hinted/);
  });
});
