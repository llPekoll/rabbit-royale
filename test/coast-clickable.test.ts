/**
 * Every tile you can stand on, you can click.
 *
 * `terrainTileAt` inverts the projection to name the tile under a press. It
 * asked `screenToTile` for that inversion and, passing no shape, got the
 * DEFAULT one — the coastline of `makeShape('default')`, an island nobody is
 * playing. A cell that is land on the seed in play but sea on that default
 * came back null, and the null returned before the next two lines could ask
 * the real board. Those presses named no tile and nothing answered them:
 * stretches of coast that simply did not respond, worst along the eastern
 * shore where the two coastlines disagree most.
 *
 * The check is the round trip, which is the property that actually matters:
 * take a tile a rabbit may stand on, ask where it is drawn, click exactly
 * there, and get the same tile back. Run over many seeds because the bug was
 * invisible on any seed whose coast happened to sit inside the default's.
 */
import { describe, expect, it } from 'vitest';
import { isPlayable, terrainTileAt, tileScreenPos } from '../src/lib/game/terrainBoard';
import { COLS, ROWS } from '../src/config/gridConfig';

/** Tiles that are playable but do not answer a click at their own centre. */
function deadTiles(seed: string): number[] {
  const dead: number[] = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    if (!isPlayable(seed, i)) continue;
    const p = tileScreenPos(seed, i);
    if (terrainTileAt(seed, p.x, p.y) !== i) dead.push(i);
  }
  return dead;
}

describe('a playable tile answers a click at its centre', () => {
  // The seeds the bug was first measured on; kept by name so a regression
  // reports a number that can be compared with the one in the commit.
  it.each(['a', 'b', 'c', 'xyz', 'seed-1'])('seed %s has no dead tiles', (seed) => {
    expect(deadTiles(seed)).toEqual([]);
  });

  it('holds across sixty islands', () => {
    // The default coastline is one island among many: a seed whose land sits
    // inside it never showed the fault. Sixty is enough that several do not.
    const offenders = Array.from({ length: 60 }, (_, s) => `island-${s}`)
      .map((seed) => ({ seed, dead: deadTiles(seed).length }))
      .filter((r) => r.dead > 0);
    expect(offenders).toEqual([]);
  });

  it('still refuses a click on open sea', () => {
    // The mask came off the inversion, so the guard that keeps the sea
    // unclickable is now `boardFor(seed).isOnBoard` alone. If that ever stops
    // being consulted, this is what notices: a point far outside the island
    // must name no tile rather than the nearest diamond.
    expect(terrainTileAt('a', -5000, -5000)).toBeNull();
    expect(terrainTileAt('a', 99999, 99999)).toBeNull();
  });
});
