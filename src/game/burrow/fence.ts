/**
 * THE GARDEN FENCE, as geometry — where a side of the potager is, and what it
 * costs a raider to be on the wrong end of one.
 *
 * WHY THIS IS NOT IN THE STORY ANY MORE. `Burrow/Garden fence` worked out the
 * whole thing — the exposed-edge walk, the two post feet, the mirror that
 * never rotates the bitmap — as a visual prototype with, in its own words,
 * "aucun achat ni collision ajoutés". Now there is both. A second copy of this
 * maths would have drifted on the first retint of the sprite, and the two
 * copies that must never drift are the one the OWNER is shown while placing
 * and the one the SERVER refuses a raider's step with. So the walk lives here,
 * once, and the story imports it like everything else does.
 *
 * A FENCE IS ONE PLANK. The shop sells one `fence` and one fence closes ONE
 * exposed edge of one field cell — a span. Placed one at a time, taken back
 * one at a time (tap a standing plank to lift it). It shipped first as "one
 * fence closes a whole side" and Paul watched a single press wall fifteen
 * segments at once: "ca en met plein d'un coup, c'est une a une, et on doit
 * pouvoir les enlever une a une aussi" (2026-09-21). A plank is the unit the
 * player sees and points at, so it is the unit they buy.
 *
 * A span is named by (tile, side): the FIELD cell it hangs off and the face.
 * Not by the outer cell, which can be the neighbour of two field cells at a
 * notch and would name two spans at once.
 *
 * WHY THE SIDES ARE THE ISO DIAGONALS. The field is an arbitrary connected
 * blob on one terrace (`pickField` in generate.ts), not a rectangle, so
 * "parallel to the potager" cannot mean a rectangle's edge. It means aligned
 * to the cell grid — one of the four cell faces — which is exactly what the
 * sprite's 2:1 slope is drawn for, and why a placed fence never needs rotating.
 */
import {
  burrowColRow, burrowTier, burrowFor, fieldTiles, burrowNeighbors, burrowIndex,
  BURROW_COLS, BURROW_ROWS,
} from './board';

/**
 * The four ways a cell face can point, named for the compass the burrow's
 * camera fixes them to. `NE` is the face towards lower `row`, and they run
 * clockwise from there — the same order the story's panels read in.
 */
export const FENCE_SIDES = ['NE', 'SE', 'SW', 'NW'] as const;
export type FenceSide = (typeof FENCE_SIDES)[number];

/** One plank's name: the field cell it hangs off, and which face. */
export interface FenceSeg { tile: number; side: FenceSide }
/** The set key for a segment, so a list of them can be asked "has?" in O(1). */
export const segKey = (seg: { tile: number; side: string }) => `${seg.tile}:${seg.side}`;
export const isFenceSide = (v: unknown): v is FenceSide =>
  typeof v === 'string' && (FENCE_SIDES as readonly string[]).includes(v);

/** A point on the cell lattice, in half-cell units (corners land on .5). */
export interface FencePoint { x: number; y: number }

/**
 * One span of fence: the two posts' feet, which cell it belongs to, and which
 * way it faces.
 *
 * The CELL is carried because a span has to be anchored to real ground: the
 * field sits on one terrace, and the sprite's feet must land on that terrace's
 * lifted surface rather than on the flat lattice. `tile` is what
 * `burrowTileScreen` needs to work that out.
 */
export interface FenceSpan {
  a: FencePoint;
  b: FencePoint;
  side: FenceSide;
  /** The field cell this span is the edge of. */
  tile: number;
  /** That cell's terrace, for depth sorting against the terrain. */
  tier: number;
}

/** Which neighbour each side looks at, in col/row steps. */
const STEP: Record<FenceSide, { dc: number; dr: number }> = {
  NE: { dc: 0, dr: -1 },
  SE: { dc: 1, dr: 0 },
  SW: { dc: 0, dr: 1 },
  NW: { dc: -1, dr: 0 },
};

/**
 * Every exposed edge of the potager, as spans.
 *
 * The walk is the story's `perimeter`: for each field cell, a side is exposed
 * when the neighbour that way is NOT also field. That is what makes it handle
 * the generated blob — a rectangle walk would emit edges through the middle of
 * a concave field and miss the ones around its notch.
 *
 * Corner points are half-cell offsets from the cell's own centre, so a span is
 * positioned relative to the tile it belongs to and needs no global origin.
 */
export function fenceSpans(seed: string): FenceSpan[] {
  const field = fieldTiles(seed);
  const occupied = new Set<string>();
  for (const tile of field) {
    const { col, row } = burrowColRow(tile);
    occupied.add(`${col},${row}`);
  }
  const spans: FenceSpan[] = [];
  for (const tile of field) {
    const { col, row } = burrowColRow(tile);
    const tier = burrowTier(seed, tile);
    for (const side of FENCE_SIDES) {
      const { dc, dr } = STEP[side];
      if (occupied.has(`${col + dc},${row + dr}`)) continue;
      spans.push({ ...corners(side), side, tile, tier });
    }
  }
  return spans;
}

/**
 * The two feet of a span, as offsets from its cell's centre in cell units.
 *
 * Always emitted in the same winding, so the sprite's mirror is decided by the
 * SIDE and not by which cell happened to be walked first — two adjacent cells
 * sharing a side must produce two identically-lit sprites, and a span whose
 * endpoints swapped would flip one of them.
 */
function corners(side: FenceSide): { a: FencePoint; b: FencePoint } {
  switch (side) {
    case 'NE': return { a: { x: -0.5, y: -0.5 }, b: { x: 0.5, y: -0.5 } };
    case 'SE': return { a: { x: 0.5, y: -0.5 }, b: { x: 0.5, y: 0.5 } };
    case 'SW': return { a: { x: -0.5, y: 0.5 }, b: { x: 0.5, y: 0.5 } };
    case 'NW': return { a: { x: -0.5, y: -0.5 }, b: { x: -0.5, y: 0.5 } };
  }
}

/**
 * The cell on the OTHER side of a span — the one just outside the potager.
 *
 * This is where the board puts a fence's TARGET. A target on the field cell
 * itself cannot say which side it means: a corner cell of the garden exposes
 * two or three faces, and three diamonds stacked on one cell are one diamond
 * that answers to whichever side was walked first. The cell across the edge
 * belongs to exactly one face of exactly one field cell, so a ring of them
 * round the garden is a ring where every diamond names one side — which is
 * also, literally, what was asked for: "des trucs bleus juste autour du
 * potager". Null when the neighbour is off the board.
 */
export function outerTile(span: FenceSpan): number | null {
  const { col, row } = burrowColRow(span.tile);
  const { dc, dr } = STEP[span.side];
  const c = col + dc;
  const r = row + dr;
  if (c < 0 || c >= BURROW_COLS || r < 0 || r >= BURROW_ROWS) return null;
  return burrowIndex(c, r);
}

/** Is (tile, side) an exposed edge of this burrow's field — a place for a plank? */
export function isSpan(seed: string, tile: number, side: string): boolean {
  if (!isFenceSide(side) || !Number.isInteger(tile)) return false;
  return fenceSpans(seed).some((span) => span.tile === tile && span.side === side);
}

/**
 * WHAT A FENCE ACTUALLY DOES: it refuses the step through it.
 *
 * A raider crossing from `from` to `to` crosses a fenced side when `to` is a
 * field cell, the face between them is fenced, and that face is one the fence
 * was bought for. The check is on the FIELD side of the pair on purpose —
 * a fence belongs to the potager's edge, so walking out of the field through
 * its own fence is refused exactly as walking in is. A raider who somehow
 * started inside is not handed a free exit.
 *
 * It does NOT block the owner, and it does not block anything that is not a
 * step — a bomb still lands where it is thrown. A fence is a wall, not a roof.
 */
export function fenceBlocks(
  seed: string,
  fenced: readonly FenceSeg[],
  from: number,
  to: number,
): boolean {
  if (fenced.length === 0) return false;
  const field = new Set(fieldTiles(seed));
  // BOTH cells inside the potager means there is no perimeter between them —
  // an interior face is not an edge, and a plank is only ever on the
  // boundary. Tested first, because it is the case that made this function
  // asymmetric once: a step from one field cell to another named a face no
  // span hangs off, and the answer depended on which cell was `from`.
  if (field.has(from) && field.has(to)) return false;
  // The face is named from the FIELD cell of the pair, since that is the
  // cell its span hangs off — and exactly one of the two is field here.
  const inner = field.has(to) ? to : field.has(from) ? from : null;
  if (inner === null) return false;
  const outer = inner === to ? from : to;
  const a = burrowColRow(inner);
  const b = burrowColRow(outer);
  const dc = b.col - a.col;
  const dr = b.row - a.row;
  if (Math.abs(dc) > 1 || Math.abs(dr) > 1 || (dc === 0 && dr === 0)) return false;

  const standing = new Set(fenced.map(segKey));
  const has = (tile: number, side: FenceSide) => standing.has(segKey({ tile, side }));
  const sideDC: FenceSide | null = dc === 0 ? null : dc > 0 ? 'SE' : 'NW';
  const sideDR: FenceSide | null = dr === 0 ? null : dr > 0 ? 'SW' : 'NE';
  // An orthogonal step crosses ONE face of the field cell.
  if (sideDC === null) return has(inner, sideDR!);
  if (sideDR === null) return has(inner, sideDC);

  /**
   * A DIAGONAL STEP GOES THROUGH A VERTEX, and any plank touching it stops it.
   *
   * The burrow's steps go EIGHT ways (`BURROW_STEPS`), and a diagonal passes
   * exactly through the corner where four cells meet. Two planks meeting at
   * that corner share a post; walking through the post is not a route. It
   * first checked only the field cell's OWN two faces, and that let a raider
   * through every concave notch: there, the field cell's faces towards the
   * step are interior (no span at all), and the two planks that actually
   * frame the corner hang off its two neighbours. With the whole edge
   * fenced, `fieldReachable` still said yes.
   *
   * So all four faces meeting at the vertex are asked, on whichever of the
   * cells is field. Only exposed faces can carry a plank, so asking about an
   * interior one is a cheap miss, not a false hit.
   */
  if (has(inner, sideDC) || has(inner, sideDR)) return true;
  const across = (c: number, r: number) =>
    c < 0 || c >= BURROW_COLS || r < 0 || r >= BURROW_ROWS ? null : burrowIndex(c, r);
  const alongDC = across(a.col + dc, a.row);
  const alongDR = across(a.col, a.row + dr);
  if (alongDC !== null && field.has(alongDC) && has(alongDC, sideDR)) return true;
  if (alongDR !== null && field.has(alongDR) && has(alongDR, sideDC)) return true;
  return false;
}

/**
 * Is the potager still reachable at all with these planks standing?
 *
 * THE GATE RULE. Sealing the field would make the objective unreachable, and
 * a burrow no raid can ever resolve is not a defended burrow — it is a broken
 * one, and it would quietly break the whole PvP loop the moment a player owned
 * enough planks. So the last way in cannot be closed: the server refuses that
 * plank, and the board does not offer it.
 *
 * Asked as reachability rather than as a count, because which plank is "the
 * last" depends on the field's shape and on the eight-way steps — only a walk
 * from the entrance can say whether a raider still gets to a field cell.
 */
export function fieldReachable(seed: string, fenced: readonly FenceSeg[]): boolean {
  const { entrance } = burrowFor(seed);
  const field = new Set(fieldTiles(seed));
  const seen = new Set<number>([entrance]);
  const queue = [entrance];
  while (queue.length) {
    const tile = queue.shift()!;
    if (field.has(tile)) return true;
    for (const next of burrowNeighbors(seed, tile)) {
      if (seen.has(next)) continue;
      if (fenceBlocks(seed, fenced, tile, next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return false;
}

/**
 * The sprite's anchors, in the v2 bitmap's own pixels.
 *
 * v2 is 192x128, exactly 1/8 of the generated v1, and these are v1's numbers
 * divided by eight — which is why they are fractional and must stay so.
 * Rounding them moves the posts off the lattice, and the joins between two
 * spans open up by a pixel that is very visible at the burrow's zoom.
 *
 * `FOOT` is the pivot: the sprite is placed by where its posts stand, never by
 * its transparent image bounds. `SPAN` is the distance between the two feet,
 * which is what a span's length is divided by to get the scale.
 */
export const FENCE_FOOT = { x: 469 / 8, y: 610 / 8 } as const;
export const FENCE_SPAN = { x: 594 / 8, y: 246 / 8 } as const;
export const FENCE_TEXTURE = '/assets/deco/garden-fence/segment-v2.png';

/**
 * The neighbours a RAIDER may actually step to — `burrowNeighbors`, less the
 * steps a fence refuses.
 *
 * One function rather than the filter written twice, because it is written in
 * two places that must never disagree: the tile list the raid screen is SENT
 * (`steps` in the raid view) and the check that refuses the PATCH. The raid
 * route's own note says why — two implementations of one rule drift, and the
 * one that drifts is the client's, which then offers a tile the server
 * rejects. A fence the board does not draw a refusal for is exactly that bug,
 * wearing a wall.
 *
 * The OWNER walking their own burrow is not a raider and does not come through
 * here: their board calls `burrowNeighbors` directly.
 */
export function raiderSteps(
  seed: string,
  fenced: readonly FenceSeg[],
  from: number,
): number[] {
  const steps = burrowNeighbors(seed, from);
  if (fenced.length === 0) return steps;
  return steps.filter((to) => !fenceBlocks(seed, fenced, from, to));
}
