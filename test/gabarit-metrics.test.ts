/**
 * The drawing templates and the game agree on one diamond.
 *
 * `tools/gen_gabarits.py` writes the blank templates an artist paints inside,
 * and it cannot import TypeScript — so it mirrors the three numbers that
 * matter. A mirror drifts silently: change `TILE_W` here and the templates
 * keep being generated at the old size, the art comes back 10% wrong, and
 * nothing fails until it is on screen and already drawn.
 *
 * So the mirror is pinned. This test reads the Python's own constants and
 * asserts they equal the config's. It is the cheapest possible guard against
 * the most expensive possible mistake: re-drawing a tile set.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ISO_TILE_W, ISO_TILE_H, TIER_LIFT } from '../src/config/gridConfig';
import { BURROW_TILE_W, BURROW_TILE_H, BURROW_TIER_LIFT } from '../src/config/burrowConfig';

const TOOL = readFileSync(new URL('../tools/gen_gabarits.py', import.meta.url), 'utf8');

/** Read a bare `NAME = 123` assignment out of the generator. */
function pyConst(name: string): number {
  const m = TOOL.match(new RegExp(`^${name}\\s*=\\s*(\\d+)\\s*$`, 'm'));
  if (!m) throw new Error(`${name} not found in tools/gen_gabarits.py`);
  return Number(m[1]);
}

describe('gabarit metrics', () => {
  it('generates templates at the island tile size', () => {
    expect(pyConst('TILE_W')).toBe(ISO_TILE_W);
    expect(pyConst('TILE_H')).toBe(ISO_TILE_H);
  });

  it('generates the cliff band at the tier lift', () => {
    // The number the whole template set exists to get right: a face drawn to
    // any other height leaves a seam under every plateau in the game.
    expect(pyConst('TIER_LIFT')).toBe(TIER_LIFT);
  });

  it('serves the burrow from the same templates', () => {
    // One diamond, one set of art. If these ever split again the artist owes
    // a second set of sixteen tiles, at a 10% difference nobody can eyeball.
    expect(BURROW_TILE_W).toBe(ISO_TILE_W);
    expect(BURROW_TILE_H).toBe(ISO_TILE_H);
    expect(BURROW_TIER_LIFT).toBe(TIER_LIFT);
  });
});
