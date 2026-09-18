/**
 * Which tile a press names, read off what Pixi's hit test hit.
 *
 * Only a VEIL names a tile. Everything else a press can land on — a number,
 * a name plate, a chest, a cliff's wall, the tile's own floating container —
 * names none, and the scene then resolves the point geometrically.
 */
import { describe, expect, it } from 'vitest';
import { pressedTileOf } from '../src/game/input/pressedTile';
import { TILE_CONTAINER_LABEL } from '../src/game/entities/Tile';

describe('pressedTileOf', () => {
  it('reads the index off a veil', () => {
    expect(pressedTileOf('tile-0')).toBe(0);
    expect(pressedTileOf('tile-137')).toBe(137);
  });

  it('names no tile for anything that is not a veil', () => {
    expect(pressedTileOf(undefined)).toBeNull();
    expect(pressedTileOf(null)).toBeNull();
    expect(pressedTileOf('')).toBeNull();
    expect(pressedTileOf('wall')).toBeNull();
    expect(pressedTileOf('burrow-hint-3')).toBeNull();
  });

  it('does not mistake the floating container for the veil', () => {
    // `tile-container-N` shares the prefix. It is passive and never a target,
    // but a prefix match would have named a tile the moment it became one.
    expect(TILE_CONTAINER_LABEL.startsWith('tile-')).toBe(true);
    expect(pressedTileOf(`${TILE_CONTAINER_LABEL}12`)).toBeNull();
  });
});
