/**
 * Which tile a press landed on, read off what Pixi's hit test hit.
 *
 * A tile's veil is labelled `tile-N` (see `Tile`'s constructor); nothing else
 * on the board is. Everything else a press can land on — a number, a name
 * plate, a chest, a bird, a cliff's wall, the board itself between two
 * diamonds — answers "no tile", and the scene then resolves the point
 * geometrically instead.
 *
 * Exact, not a prefix: the tile's CONTAINER is `tile-container-N`, and it
 * floats above the ground with the hints. It never catches a pointer (it is
 * `passive`), but a prefix match would have named a tile the moment it did.
 */
export function pressedTileOf(label: string | null | undefined): number | null {
  if (!label) return null;
  const m = /^tile-(\d+)$/.exec(label);
  return m ? Number(m[1]) : null;
}
