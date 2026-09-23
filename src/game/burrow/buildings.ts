/**
 * The burrow itself: the building that stands on the generated ground.
 *
 * Upgrading is otherwise invisible. The GDD gives the burrow one level, and
 * everything that level buys — garden yield, HP, defence budget — is a number
 * on a panel. So the BUILDING is the upgrade: a raider arriving at your door
 * sees a hut, a house or a castle and knows what they are walking into before
 * they read a single stat.
 *
 * This replaces the four hand-painted backdrops (`config/burrowArt.ts`). Those
 * were whole-canvas paintings that had to be pre-aligned with each other so
 * the tilled field landed on the same pixels in every one — a constraint the
 * art could silently break (see the calibration test that existed to catch
 * it). A building is a SPRITE standing on a cell, so an upgrade swaps one
 * texture on one tile and nothing else in the scene has to agree about
 * anything.
 *
 * ## Where it stands
 *
 * On the ground the burrow is defending: next to the field, on the far side of
 * it from the entrance. That is the fiction (the door you are protecting is by
 * the garden) and it is also what makes the board readable — the raider walks
 * towards the building, so the thing they are heading for is a landmark rather
 * than a patch of dirt.
 *
 * The cell it takes is BLOCKED for the raid, like any other solid thing. It is
 * chosen from tiles that are already off the crossing's critical path, so a
 * burrow whose building happened to plug the only route is not a burrow that
 * can be generated — `generate.ts` measures the crossing after everything is
 * placed.
 */
import { burrowFor, burrowColRow, BURROW_COLS, BURROW_ROWS } from './board';
import { levelAt } from '@/game/island/generate';
import { seaDistance, houseFootprint } from './generate';

const BUILDINGS = '/assets/buildings';

/**
 * The ladder, by tier. Index 0 is level 1.
 *
 * A hut, two better houses, then the castle. Levels run to `BURROW.MAX_LEVEL`
 * (20) but there are four buildings, so everything from 4 up shows the castle
 * — the top of the visual ladder is reached well before the top of the numeric
 * one, deliberately: the first upgrades are the ones a new player makes, and
 * they are the ones worth making feel like something.
 *
 * `foot` is how far down the art reaches inside its box, in pixels, measured
 * off the sprite's alpha bounds rather than guessed — the same rule the
 * island's `UNIT_GEOMETRY` follows. A building anchored at its box's bottom
 * floats above the cell; anchored at its foot it stands on it.
 */
const LADDER = [
  { url: `${BUILDINGS}/house-1.webp`, w: 128, h: 192, foot: 173 },
  { url: `${BUILDINGS}/house-2.webp`, w: 128, h: 192, foot: 178 },
  { url: `${BUILDINGS}/house-3.webp`, w: 128, h: 192, foot: 172 },
  { url: `${BUILDINGS}/castle.webp`, w: 320, h: 256, foot: 249 },
] as const;

export interface BurrowBuilding {
  url: string;
  /** The sprite's own pixel size. */
  w: number;
  h: number;
  /** Anchor Y that stands it on the ground, as a fraction of its height. */
  anchorY: number;
  /** The cell it stands on. */
  x: number;
  y: number;
  /** That cell's terrain tier, so the view can lift it onto its shelf. */
  tier: number;
}

/** How many distinct buildings there are. Levels above this reuse the last. */
export const BURROW_BUILDING_TIERS = LADDER.length;

/**
 * The building for a level.
 *
 * Clamped at both ends rather than trusted: the level reaches here from a
 * database row and from the wire (a raider is shown the DEFENDER's level), so
 * a missing, zero or absurd value has to degrade to a building rather than to
 * `undefined` and a burrow with no door.
 */
function tierFor(level: number | null | undefined) {
  if (!Number.isFinite(level ?? NaN)) return LADDER[0];
  const tier = Math.min(Math.max(Math.floor(level as number), 1), BURROW_BUILDING_TIERS);
  return LADDER[tier - 1];
}

/**
 * The building's ART for a level, with no board involved.
 *
 * `burrowBuilding` below needs a SEED, because it also answers where the thing
 * stands. The burrow card only has to draw the same house the player can see
 * on their island, and asking it to invent a seed for that would be asking the
 * wrong question. Same ladder, same clamping — one source for "what does a
 * level look like", so the card and the board can never disagree.
 */
export function burrowBuildingArt(level: number | null | undefined) {
  return tierFor(level);
}

/**
 * Where this seed's burrow stands, and what it looks like at `level`.
 *
 * The cell is a property of the SEED, not of the level: upgrading swaps the
 * picture and must not move the door, or a player's home would walk across
 * their garden every time they paid for it.
 */
export function burrowBuilding(seed: string, level: number | null | undefined): BurrowBuilding {
  const art = tierFor(level);
  const { x, y, tier } = buildingCell(seed);
  return { ...art, anchorY: art.foot / art.h, x, y, tier };
}

/** Ground the building keeps between itself and the water, in cells. */
const BUILDING_INLAND = 2;

/** Cached per seed — the search below walks the board. */
const cells = new Map<string, { x: number; y: number; tier: number }>();

/**
 * The cell the building stands on: beside the field, away from the entrance.
 *
 * Scored rather than searched for exactly, because on generated terrain there
 * is rarely a cell that satisfies every wish. The score wants a tile that is
 * adjacent to the garden, far from the door, and on ground the raid does not
 * need — and the best-scoring one wins even when it is nobody's ideal.
 */
function buildingCell(seed: string): { x: number; y: number; tier: number } {
  // Moved by its owner (`BurrowEdits.house`): theirs, not the score's.
  const { house, map: ground } = burrowFor(seed);
  if (house !== undefined) {
    const { col, row } = burrowColRow(house);
    return { x: col, y: row, tier: levelAt(ground, col, row) };
  }
  const hit = cells.get(seed);
  if (hit) return hit;

  const { map, cells: kinds, field, entrance, placements } = burrowFor(seed);
  const standing = new Set(placements.map((p) => p.y * BURROW_COLS + p.x));
  // FOUR CELLS of open ground, nothing standing on them: the house is painted
  // on a 2x2 footprint. The last two passes drop the square for the single
  // cell, so a cramped homestead still gets a house.
  const roomy = (tile: number) => {
    const square = houseFootprint(tile);
    if (!square) return false;
    const tier = (t: number) => levelAt(map, t % BURROW_COLS, Math.floor(t / BURROW_COLS));
    return square.every((t) => kinds[t] === 'ground' && !standing.has(t) && tier(t) === tier(square[0]));
  };
  const door = burrowColRow(entrance);
  const fieldCells = field.map(burrowColRow);

  let best: { x: number; y: number; tier: number } | null = null;
  let bestScore = -Infinity;

  // Two passes: the strict wish first, then the same search with the sea
  // allowed one cell closer, so a thin homestead still gets a house rather
  // than the fallback below.
  for (const [inland, square] of [
    [BUILDING_INLAND, true], [BUILDING_INLAND - 1, true],
    [BUILDING_INLAND, false], [BUILDING_INLAND - 1, false],
  ] as const) {
    for (let tile = 0; tile < BURROW_COLS * BURROW_ROWS; tile++) {
      // It stands on ground the raid does not use: never the field (it would
      // bury the objective) and never the entrance.
      if (kinds[tile] !== 'ground') continue;
      if (square && !roomy(tile)) continue;
      const { col, row } = burrowColRow(tile);

      // Room for the sprite. A building on the shore is drawn with its
      // footprint hanging over the sea, and one on the board's rim is drawn
      // half off the board — so it keeps `inland` cells of ground on every
      // side, which covers the rim too.
      const toSea = seaDistance(map, col, row);
      if (toSea < inland) continue;

      const toField = Math.min(
        ...fieldCells.map((f) => Math.max(Math.abs(f.col - col), Math.abs(f.row - row))),
      );
      // Beside the garden: touching it, or at worst one cell off it.
      if (toField < 1 || toField > 2) continue;

      const toDoor = Math.max(Math.abs(door.col - col), Math.abs(door.row - row));
      // Touching the field first, then inland, then away from the door: the
      // building marks the garden, it must never look like it is about to
      // fall in the water, and the raider should be walking towards it.
      const score = -toField * 8 + Math.min(toSea, 3) * 2 + toDoor * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = { x: col, y: row, tier: levelAt(map, col, row) };
      }
    }
    if (best) break;
  }

  // Every burrow has a field with ground beside it — `generate.ts` grows the
  // patch inside the main body — so this is only ever a floor, not a case the
  // game plays. Falling back to the first field cell's neighbour keeps a
  // pathological seed drawable rather than throwing on the render path.
  const chosen = best ?? { ...fallback(seed), tier: 1 };
  cells.set(seed, chosen);
  return chosen;
}

function fallback(seed: string): { x: number; y: number } {
  const { field } = burrowFor(seed);
  const { col, row } = burrowColRow(field[0] ?? 0);
  return { x: col, y: row };
}

/** Every building URL, for the loader to warm before the scene builds. */
export const BURROW_BUILDING_URLS = LADDER.map((b) => b.url);
