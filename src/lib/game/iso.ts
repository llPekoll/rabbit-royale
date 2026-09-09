/**
 * The isometric projection, and its inverse.
 *
 * Both live here, together, because a tap that lands on the wrong tile reads to
 * a player as "the controls are broken" — and that is exactly what happens when
 * the renderer's projection and the hit-test drift apart. One module, one pair,
 * covered by a round-trip test.
 */
export const TILE_W = 56;
export const TILE_H = 28;

export interface IsoOrigin {
  originX: number;
  originY: number;
}

/** The origin depends on the island's height (the leftmost column is x=0,y=max). */
export const isoOrigin = (islandHeight: number): IsoOrigin => ({
  originX: islandHeight * (TILE_W / 2),
  originY: TILE_H * 3,
});

/** Tile → the screen point at the centre of its diamond. */
export function toScreen(o: IsoOrigin, x: number, y: number) {
  return {
    sx: o.originX + (x - y) * (TILE_W / 2),
    sy: o.originY + (x + y) * (TILE_H / 2),
  };
}

/** Screen point → tile. Solves the two projection equations for x and y. */
export function toTile(o: IsoOrigin, sx: number, sy: number) {
  const a = (sx - o.originX) / (TILE_W / 2);
  const b = (sy - o.originY) / (TILE_H / 2);
  return { x: Math.round((a + b) / 2), y: Math.round((b - a) / 2) };
}
