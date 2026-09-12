/**
 * The burrow's ground, DRAWN rather than painted.
 *
 * The burrow used to be one full-canvas painting with an invisible grid laid
 * over it. That grid was calibrated by eye against the art, which made the two
 * a matched pair nothing could keep matched, and it made every burrow in the
 * game the same place.
 *
 * This draws the terrain the owner's seed actually grew, on the same tiles and
 * through the same renderer as the island (`IsoIslandView`) — so a burrow and
 * an island are visibly one world, the cliffs have real volume, and a trap sits
 * on a tile rather than on a picture of one.
 *
 * It is the exact counterpart of `services/TerrainBackground.ts`, and it is
 * separate from it for one reason: that one is pinned to the island's 16x16
 * board with the island's metrics and its own lift, and a burrow is a
 * different grid at a different scale. Everything else — deporting the standing
 * art so it interleaves with the board, aligning the terrain's origin with the
 * board's — is the same idea, and the comments there are the long version.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { IsoIslandView, loadIslandTileset, isoProject } from '@/game/island';
import {
  BURROW_HALF_W, BURROW_HALF_H, BURROW_TIER_LIFT,
  BURROW_ORIGIN_X, BURROW_ORIGIN_Y,
} from '@/config/burrowConfig';
import { burrowFor, burrowColRow, burrowIndex } from './board';
import { burrowBuilding } from './buildings';
import { burrowDepth } from './screen';

/**
 * Scenery is cut for 64px tiles; the burrow's are 40x22.
 *
 * Slightly larger than the island's 0.4, because this board is a homestead
 * rather than a wilderness: fewer things stand on it, so each one can afford
 * to read.
 */
const DECO_SCALE = 0.44;

export interface BurrowTerrainView {
  /** The ground container, to be added under the board. */
  view: Container;
  /** The burrow building, so the scene can swap it on an upgrade. */
  setLevel(level: number | null | undefined): void;
  /**
   * Show only these tiles of the homestead, hiding the rest entirely.
   *
   * What a RAIDER sees. On a generated burrow the shape of the ground is
   * itself the secret — where the cliffs run, which corner holds the garden,
   * where the trees force a detour — so an attacker uncovers it by walking,
   * one step of information at a time. Null puts the whole place back, which
   * is what the owner sees: your own burrow keeps no secrets from you.
   */
  reveal(tiles: Iterable<number> | null): void;
  /**
   * Put a tile's placement diamond INSIDE the terrain block of its cell.
   *
   * The farm's fix, brought over verbatim — see `IsoIslandView.mountVeil` and
   * the note on `blocks`. A diamond laid in a flat container sits straight on
   * its lower neighbour's with nothing opaque in between, so every terrace
   * edge wore a double-drawn wedge: a tier lifts a cell by 18px while the
   * diamond itself draws ~21px tall, and the 3px difference laps over the cell
   * behind. Mounted in the block, the cell's own grass is drawn between the
   * two and the overlap is covered by the ground it belongs to.
   *
   * False when the cell has no block (off-island), and the caller keeps the
   * diamond where it was.
   */
  mountVeil(tile: number, veil: Sprite): boolean;
  /** Advance the sway. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void;
  destroy(): void;
}

/**
 * Draw the terrain for `seed` into `container`.
 *
 * Resolves once the sheets have decoded, so the board is never built over an
 * empty frame — the same contract the painting honoured.
 */
export async function createBurrowTerrain(
  container: Container,
  seed: string,
  level: number | null | undefined,
): Promise<BurrowTerrainView> {
  const tileset = await loadIslandTileset();
  const { map, placements, field } = burrowFor(seed);
  const metrics = { w: BURROW_HALF_W * 2, h: BURROW_HALF_H * 2, z: BURROW_TIER_LIFT };

  // The carrot field, as TURNED SOIL rather than more meadow.
  //
  // It is the objective of every raid, so it has to be findable from across
  // the board — and while the burrow was a painting it was, because the artist
  // drew furrows. On generated ground the field is just twelve cells that
  // happen to be the goal, and a raider crossing towards a patch of grass
  // indistinguishable from the grass beside it has nothing to aim at.
  //
  // The crop grows ON this (see CarrotCrop), but only in proportion to how
  // full the garden is: an empty garden draws no plants at all, and the soil
  // is what says "this is a field" when there is nothing in it.
  const soil = new Set(field.map((t) => {
    const { col, row } = burrowColRow(t);
    return `${col},${row}`;
  }));

  const island = new IsoIslandView({
    map,
    tileset,
    metrics,
    decoScale: DECO_SCALE,
    placements,
    // The standing art joins the SCENE's container, not the terrain's, so each
    // tree sorts against each board tile individually rather than the whole
    // landscape taking one place in the order. See the long note in
    // TerrainBackground.
    decoLayer: container,
    // The burrow sits in the same sea the island does, and here the water IS
    // wanted: it is what makes the homestead read as an island of its own
    // rather than as a lawn that stops.
    sea: true,
    decoShadows: true,
    groundAt: (x, y) => (soil.has(`${x},${y}`) ? 'sand' : null),
  });

  // Line the terrain up with the BOARD's grid: project the board's origin cell
  // through the terrain's own projection and shift by the difference, so tile
  // (0,0) of each lands on the same pixel.
  const origin = isoProject(0.5, 0.5, 0, metrics);
  island.view.position.set(
    BURROW_ORIGIN_X - origin.x - island.originX,
    BURROW_ORIGIN_Y - origin.y - island.originY,
  );
  island.placeDeco(island.view.position.x, island.view.position.y);
  // Under the board, and under the clouds, which document their depth against
  // this exact number.
  island.view.zIndex = -10;
  container.addChild(island.view);

  // ── The burrow itself ──────────────────────────────────────────────────────
  // A sibling of the board's tiles rather than a child of the terrain, for the
  // same reason the trees are: a raider standing on a nearer cell has to be
  // able to draw in front of it.
  const home = new Sprite();
  home.anchor.set(0.5, 1);
  container.addChild(home);

  const place = (lvl: number | null | undefined) => {
    const b = burrowBuilding(seed, lvl);
    home.texture = Texture.from(b.url);
    home.texture.source.scaleMode = 'nearest';
    home.texture.source.autoGenerateMipmaps = false;
    // Anchored at the art's FOOT, not its box, so it stands on the cell
    // instead of floating over it — the same correction the island's units
    // make.
    home.anchor.set(0.5, b.anchorY);
    home.scale.set(DECO_SCALE);

    // Positioned through the terrain's own projection and then shifted by the
    // view's offset, exactly as the deported deco is: the cell centre is
    // (x + 0.5, y + 0.5), and the tier lifts it onto its shelf.
    const p = isoProject(b.x + 0.5, b.y + 0.5, Math.max(0, b.tier - 1), metrics);
    home.position.set(
      island.view.position.x + island.originX + p.x,
      island.view.position.y + island.originY + p.y,
    );
    home.zIndex = burrowDepth(seed, burrowIndex(b.x, b.y)) + 1;
  };
  place(level);

  return {
    view: island.view,
    setLevel: place,
    mountVeil(tile, veil) {
      const { col, row } = burrowColRow(tile);
      return island.mountVeil(col, row, veil);
    },
    reveal(tiles) {
      if (tiles === null) {
        island.revealOnly(null);
        home.visible = true;
        return;
      }
      const cells: Array<{ x: number; y: number }> = [];
      let buildingSeen = false;
      const b = burrowBuilding(seed, level);
      for (const tile of tiles) {
        const { col, row } = burrowColRow(tile);
        cells.push({ x: col, y: row });
        // The building is the loudest thing on the board and it stands BESIDE
        // the garden, so showing it early is showing the raider where they are
        // going. It appears only once they have uncovered the cell it stands
        // on — which, since that cell is walkable ground next to the field, is
        // the moment they have earned the sight of it.
        if (col === b.x && row === b.y) buildingSeen = true;
      }
      island.revealOnly(cells);
      home.visible = buildingSeen;
    },
    update: (deltaMs) => island.update(deltaMs),
    destroy() {
      home.destroy();
      island.destroy();
    },
  };
}

/** Where the building stands, in cells — for the camera and the tests. */
export function buildingCellOf(seed: string) {
  const b = burrowBuilding(seed, 1);
  return { x: b.x, y: b.y };
}

export { burrowColRow };
