/**
 * The projection must round-trip. If it does not, taps land on the wrong tile
 * — which a player experiences as broken controls, not as a maths bug, and so
 * would take a long time to diagnose from a bug report.
 */
import { describe, expect, it } from 'vitest';
import { isoOrigin, toScreen, toTile, TILE_H, TILE_W } from '../src/lib/game/iso';

describe('isometric projection', () => {
  it('round-trips every tile of a full island', () => {
    const o = isoOrigin(20);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const { sx, sy } = toScreen(o, x, y);
        expect(toTile(o, sx, sy)).toEqual({ x, y });
      }
    }
  });

  it('maps a point near a tile centre back to that tile', () => {
    const o = isoOrigin(16);
    const { sx, sy } = toScreen(o, 7, 9);
    // A finger never lands dead centre; a quarter-tile off must still resolve.
    expect(toTile(o, sx + TILE_W / 5, sy)).toEqual({ x: 7, y: 9 });
    expect(toTile(o, sx, sy + TILE_H / 5)).toEqual({ x: 7, y: 9 });
  });

  it('separates neighbouring tiles', () => {
    const o = isoOrigin(16);
    expect(toTile(o, ...Object.values(toScreen(o, 3, 3)) as [number, number])).toEqual({ x: 3, y: 3 });
    const right = toScreen(o, 4, 3);
    expect(toTile(o, right.sx, right.sy)).toEqual({ x: 4, y: 3 });
  });
});
