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
import { Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { mountMeadowLook, type MeadowLook } from './MeadowLook';
import { IsoIslandView, loadIslandTileset, isoProject, isoDepth, levelAt } from '@/game/island';
import { getDiamondPixels } from '@/game/services/TileTextures';
import {
  BURROW_HALF_W, BURROW_HALF_H, BURROW_TIER_LIFT,
  BURROW_ORIGIN_X, BURROW_ORIGIN_Y, BURROW_COLS, BURROW_ROWS,
} from '@/config/burrowConfig';
import { burrowFor, burrowColRow, burrowIndex, burrowCell } from './board';
import { mulberry32, seedFrom } from '@/lib/game/rng';
import { createPackWater, loadPackWater } from '@/game/fx/PackWater';
import { createDucks, loadDucks } from '@/game/fx/Ducks';
import { mountSkyLight } from '@/game/fx/GodRays';
import { WATER_LOOK, DUCK_LOOK } from '@/config/waterLook';
import { burrowBuilding } from './buildings';
import { burrowDepth } from './screen';
import { pixelText } from '@/game/ui/PixelText';
import type { Label } from '@/game/ui/textFace';

/**
 * Scenery is cut for 64px tiles; the burrow's are 40x22.
 *
 * Slightly larger than the island's 0.4, because this board is a homestead
 * rather than a wilderness: fewer things stand on it, so each one can afford
 * to read.
 */
const DECO_SCALE = 0.44;

/** Optional art direction preview, supplied by the Storybook harness. */
export type BurrowArtPreview = (level: number) => {
  texture: Texture;
  scale: number;
  anchorY: number;
};

/** The shield badge's crest, and how tall it is drawn on the plaque. */
const SHIELD_ICON_URL = '/assets/ui/icons/shield.webp';
/**
 * 18px against the countdown's 8px cell — roughly the width of the time string
 * beside it, which is what makes the crest read as the badge's SUBJECT and the
 * time as its caption. At 14 the two were the same visual weight and the sign
 * looked like two captions stacked.
 */
const SHIELD_CREST_H = 18;
/** The countdown's type, as a fraction of the body face's 8px cell. */
const SHIELD_TEXT_SCALE = 0.75;

export interface BurrowTerrainView {
  /** The ground container, to be added under the board. */
  view: Container;
  /** The burrow building, so the scene can swap it on an upgrade. */
  setLevel(level: number | null | undefined): void;
  /**
   * The building just GREW: pop it, flash it, throw dust off its foot. Called
   * after `setLevel` by the scene, only on an upgrade the player made.
   */
  celebrateLevel(): void;
  /**
   * The shield sign that floats over the burrow, or null to take it down.
   *
   * It lives HERE rather than in the React column because a shield is a fact
   * about the place: the card in the panel is a reading, and the player's eyes
   * are on the board. `ms` is the time left, so the sign can count down in the
   * one unit the player can act on.
   */
  /** `label` words the badge; it comes from React, which knows the language. */
  setShield(ms: number | null, label?: (ms: number) => string): void;
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
  mountVeil(tile: number, veil: Container, zIndex?: number): boolean;
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
  meadowLook?: MeadowLook,
  artPreview?: BurrowArtPreview,
): Promise<BurrowTerrainView> {
  // Issued together, awaited where each is needed — see the same hoist in
  // `createTerrainBackground`. Four independent fetches that used to run one
  // after the other, each waiting on a round trip it had no reason to.
  const tilesetLoad = loadIslandTileset();
  const shieldIconLoad = Assets.load<Texture>(SHIELD_ICON_URL);
  const packWaterLoad = loadPackWater();
  const ducksLoad = loadDucks();

  const tileset = await tilesetLoad;
  // Awaited with the tileset rather than fetched lazily: the badge's plaque is
  // sized from the crest's own height, so a texture that arrives after layout
  // would be measured at 1x1 and boxed wrong.
  const shieldIcon = await shieldIconLoad;
  // Pixel art, like everything else on this board: bilinear would soften the
  // crest's edges while the plaque and the font beside it stay hard.
  shieldIcon.source.scaleMode = 'nearest';
  shieldIcon.source.autoGenerateMipmaps = false;
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
    // The burrow sits in the same sea the island does — but it is the SCENE's
    // sea, painted edge to edge, not one tile per cell.
    //
    // `sea: true` was here to stop the homestead reading as "a lawn that
    // stops", and that goal is right; the means were wrong, and on a real
    // screen it showed. The pack's water is a flat teal of a DIFFERENT shade
    // from the scene's background, so stamped per cell it laid a lighter
    // diamond over the whole grid — the carpet of squares visible around the
    // farm. `buildFoam` then edged it with one sprite per shore cell, which is
    // what made the coast climb in steps.
    //
    // Both off, exactly as `TerrainBackground` does for the island and as the
    // `Island/Water` stories do: the ground stops at the shore, the scene's own
    // BG_COLOR is the sea, and the coastline belongs to the water work in
    // `game/fx` (PackWater) rather than to the tile grid. The sea ROCKS are
    // unaffected — `buildSeaRocks` does not read either flag — so the water
    // around the homestead keeps the thing that actually made it read as
    // occupied.
    sea: false,
    foam: false,
    // Off: every standing sprite in the kit is drawn with its own shadow, so
    // the generated ellipse only doubled it.
    decoShadows: false,
    // And no grass tufts, for the reason the island gives — the homestead is
    // the same board read the same way.
    grass: false,
    // Ramps between tiers, as on the island — see `TerrainBackground`.
    slopes: true,
    overlayPixels: getDiamondPixels,
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
  home.label = 'burrow-building';
  home.anchor.set(0.5, 1);
  container.addChild(home);

  let homeScale = DECO_SCALE;
  const place = (lvl: number | null | undefined) => {
    const b = burrowBuilding(seed, lvl);
    const preview = artPreview?.(lvl ?? 1);
    home.texture = preview?.texture ?? Texture.from(b.url);
    home.texture.source.scaleMode = 'nearest';
    home.texture.source.autoGenerateMipmaps = false;
    // Anchored at the art's FOOT, not its box, so it stands on the cell
    // instead of floating over it — the same correction the island's units
    // make.
    home.anchor.set(0.5, preview?.anchorY ?? b.anchorY);
    homeScale = preview?.scale ?? DECO_SCALE;
    home.scale.set(homeScale);

    // Positioned through the terrain's own projection and then shifted by the
    // view's offset, exactly as the deported deco is: the cell centre is
    // (x + 0.5, y + 0.5), and the tier lifts it onto its shelf.
    const p = isoProject(b.x + 0.5, b.y + 0.5, Math.max(0, b.tier - 1), metrics);
    home.position.set(
      island.view.position.x + island.originX + p.x,
      island.view.position.y + island.originY + p.y,
    );
    home.zIndex = burrowDepth(seed, burrowIndex(b.x, b.y)) + 1;
    // The sign rides the building: an upgrade moves nothing horizontally, but
    // a taller silhouette would leave a badge pinned to the old roofline.
    placeShield();
  };

  /**
   * The upgrade, on the ground. The new building rises through the old one's
   * footprint (scale from 0.8 with an overshoot), a warm flash blooms behind
   * it, and dust is thrown off its foot — so the bigger house is something
   * that HAPPENED to the place, not a texture that changed.
   */
  const celebrateLevel = () => {
    gsap.killTweensOf(home.scale);
    home.scale.set(homeScale * 0.8);
    gsap.to(home.scale, { x: homeScale, y: homeScale, duration: 0.55, ease: 'elastic.out(1, 0.5)' });

    const foot = { x: home.position.x, y: home.position.y };
    const flash = new Graphics().circle(0, 0, 60).fill({ color: 0xffe9a8, alpha: 0.7 });
    flash.position.set(foot.x, foot.y - 30);
    flash.zIndex = home.zIndex - 0.5;
    flash.scale.set(0.2);
    container.addChild(flash);
    gsap.to(flash.scale, { x: 1.6, y: 1.6, duration: 0.5, ease: 'power2.out' });
    gsap.to(flash, { alpha: 0, duration: 0.5, ease: 'power1.in', onComplete: () => flash.destroy() });

    for (let i = 0; i < 10; i++) {
      const puff = new Graphics().circle(0, 0, 3 + Math.random() * 3).fill({ color: 0xc9b48a, alpha: 0.9 });
      puff.position.set(foot.x, foot.y - 2);
      puff.zIndex = home.zIndex + 0.5;
      container.addChild(puff);
      const dx = (i / 9 - 0.5) * 90 + (Math.random() - 0.5) * 10;
      const tl = gsap.timeline({ onComplete: () => puff.destroy() });
      tl.to(puff, { x: foot.x + dx, duration: 0.6, ease: 'power1.out' }, 0);
      tl.to(puff, { y: foot.y - 18 - Math.random() * 14, duration: 0.25, ease: 'power2.out' }, 0);
      tl.to(puff, { y: foot.y + 4, duration: 0.35, ease: 'power1.in' }, 0.25);
      tl.to(puff, { alpha: 0, duration: 0.25 }, 0.35);
    }
  };

  /**
   * The shield sign over the burrow.
   *
   * Drawn as a plaque rather than text alone: a bare string over a painted
   * homestead is unreadable against grass one moment and sky the next, and
   * this has to be legible from the resting camera without being tapped.
   *
   * Built once and hidden, not created on demand — a badge that appears every
   * time the countdown ticks would rebuild a label every second.
   */
  const shield = new Container();
  shield.visible = false;
  shield.zIndex = 100_000;
  const shieldPlate = new Graphics();
  // The CREST, not the word. The badge used to spell SHIELD above the
  // countdown, which is the panel's voice on a board that does not speak: the
  // player reads the sign at a glance from the resting camera, and a glance
  // takes a shape faster than six letters. It is the same crest the shop and
  // the raid screens use, so the thing on the roof and the thing you bought
  // are recognisably one object.
  const shieldCrest = new Sprite(shieldIcon);
  shieldCrest.anchor.set(0.5, 0);
  // Drawn at a fixed HEIGHT rather than a scale: the icon is authored far
  // larger than a pixel badge, and a hardcoded scale would have to be
  // re-guessed the day the art is re-exported.
  shieldCrest.scale.set(SHIELD_CREST_H / shieldIcon.height);
  const shieldTime: Label = pixelText(0, 0, '');
  shieldTime.anchor.set(0.5, 0);
  // Smaller than the crest's voice: the word only names what the number is,
  // and at full size it out-shouted the crest above it.
  shieldTime.scale.set(SHIELD_TEXT_SCALE);
  shield.addChild(shieldPlate, shieldCrest, shieldTime);
  container.addChild(shield);

  /** Park the sign above the building's head, whatever level it is. */
  const placeShield = () => {
    // `home` is anchored at the art's foot, so its top is one full drawn
    // height above its own y — that height is what the badge clears.
    const lift = home.texture.height * homeScale * home.anchor.y + 14;
    shield.position.set(home.position.x, home.position.y - lift);
  };

  const setShield = (ms: number | null, label?: (ms: number) => string) => {
    if (ms === null || ms <= 0) {
      shield.visible = false;
      return;
    }
    // NAMED. A bare "47H 46M" over the house read as a season clock or a
    // build timer — the crest above it is small, and a player had no way to
    // tell that the number was how long raids still bounce off. The word says
    // what is running; the time keeps only its largest unit, which is all a
    // two-day window needs and what keeps the plate narrow.
    //
    // THE WORDS COME FROM REACT. This file draws on a canvas and has no
    // dictionary to read, so the caller formats the whole badge and passes it
    // down; the English below is the fallback for a caller that does not.
    const mins = Math.ceil(ms / 60_000);
    shieldTime.text = label
      ? label(ms)
      : (mins < 60 ? `SHIELD ${mins}M` : `SHIELD ${Math.floor(mins / 60)}H`);

    // Laid out AFTER the text is set, because the plate is sized to it.
    shieldCrest.y = 4;
    shieldTime.y = shieldCrest.y + shieldCrest.height + 2;
    const w = Math.max(shieldCrest.width, shieldTime.width) + 12;
    const h = shieldTime.y + shieldTime.height + 4;
    shieldPlate.clear();
    // No outline: the dark plate alone is enough of an edge against the
    // grass, and a light rim read as a selection ring around the house.
    shieldPlate.roundRect(-w / 2, 0, w, h, 3).fill({ color: 0x0d1117, alpha: 0.82 });
    shield.visible = true;
    placeShield();
  };

  place(level);

  /**
   * The sea's own layer: the surf on the shore, and the ducks on the water.
   *
   * Added to the terrain's GROUND container — the frame the land itself is
   * drawn in, offset inside `view` by `bounds.origin`. See the long version of
   * this in `TerrainBackground`: the view and the ground are one shift apart,
   * and putting the water in the wrong one of the two throws it a third of a
   * board off the coast.
   */
  const sea = new Container();
  sea.zIndex = -1000;
  // Decoration, never a target.
  //
  // A foam sprite is 128px of frame against a 44px cell, so it overhangs its
  // neighbours by design — that spill is what joins the shore into a coastline.
  // Left interactive it also swallows their TAPS: the placement diamonds are
  // mounted in these very terrain blocks, so a bomb tapped near the coast
  // answered with surf instead of its cell and the tap did nothing at all.
  // `none` takes this whole layer, ducks included, out of hit testing.
  sea.eventMode = 'none';
  sea.interactiveChildren = false;
  island.ground.addChild(sea);

  const isLand = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < BURROW_COLS && y < BURROW_ROWS
    && burrowCell(seed, burrowIndex(x, y)) !== 'blocked';
  // The TERRAIN's own projection, not the board's `burrowTilePos`.
  //
  // `sea` is inside `island.view`, and the view carries an offset of its own
  // (`bounds.origin`); `burrowTilePos` is expressed in the scene's frame with
  // that offset already worked in. Mixing the two put the island's surf a
  // constant (-352, -36) off its coast — a raft of pale tiles beside the land
  // instead of a line on it. This is the same call `IsoIslandView.stamp`
  // makes, so the surf lands on exactly the diamonds the ground was drawn on.
  //
  // Flat (tier 0): the water's plane, where the ducks swim.
  const at = (x: number, y: number) => isoProject(x + 0.5, y + 0.5, 0, metrics);
  // The surf sits on the shore cells, which are drawn a tier above their
  // footprint — placed flat it hung `BURROW_TIER_LIFT` below the grass, as a
  // detached fringe under the south and east faces. Lifted to the cell's own
  // tier it lies level with the turf it edges. Same fix as the island's.
  const foamAt = (x: number, y: number) =>
    isoProject(x + 0.5, y + 0.5, levelAt(map, x, y), metrics);

  const water = createPackWater(
    await packWaterLoad, BURROW_COLS, BURROW_ROWS, isLand, foamAt, WATER_LOOK,
  );
  sea.addChild(water.view);

  const ducks = createDucks(
    await ducksLoad, BURROW_COLS, BURROW_ROWS,
    // A full cell clear of the turf, not merely off it. The land is drawn a
    // tier up from its footprint, so it overhangs the water behind it on the
    // north and west and the surf spills over it on the south and east — a
    // duck in that ring is half a bird sticking out from under the grass.
    // Same ring the island keeps its flock outside of.
    (x, y) => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (isLand(x + dx, y + dy)) return false;
        }
      }
      return true;
    },
    at,
    // Seeded from the homestead, so a player's own pond is always the same.
    mulberry32(seedFrom(`${seed}:ducks`)),
    DUCK_LOOK,
    // In the ground with the land, not in `sea` under it — see the island's
    // own call for why, and `isoDepth` at tier 0 for the water's plane.
    { host: island.ground, depth: (x, y) => isoDepth(x, y, 0) },
  );

  // The same weather as over the island: cloud shadows crossing the
  // homestead and the light coming through between them, in the scene's
  // container so they move with the camera.
  const sky = mountSkyLight(
    container,
    BURROW_ORIGIN_X,
    BURROW_ORIGIN_Y + ((BURROW_COLS + BURROW_ROWS - 2) / 2) * BURROW_HALF_H,
    { halfW: BURROW_HALF_W, halfH: BURROW_HALF_H },
  );

  const meadow = meadowLook ? mountMeadowLook(container, seed, level, {
    mountVeil(tile, veil, zIndex) {
      const { col, row } = burrowColRow(tile);
      return island.mountVeil(col, row, veil, zIndex);
    },
  }, meadowLook) : null;

  return {
    view: island.view,
    setLevel: place,
    celebrateLevel,
    setShield,
    mountVeil(tile, veil, zIndex) {
      const { col, row } = burrowColRow(tile);
      return island.mountVeil(col, row, veil, zIndex);
    },
    reveal(tiles) {
      meadow?.setVisible(tiles === null);
      // The water goes with the ground it surrounds. A raider is meant to be
      // blind to a homestead they have not walked, and a coastline left drawn
      // is its outline: the surf traces every shore cell, so the shape of the
      // island would be readable before a single tile was uncovered.
      sea.visible = tiles === null;
      if (tiles === null) {
        island.revealOnly(null);
        home.visible = true;
        return;
      }
      // The sign goes with the building it hangs over: a badge floating in
      // unrevealed dark would mark the burrow's position for a raider who has
      // not walked there yet.
      shield.visible = false;
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
    update(deltaMs) {
      island.update(deltaMs);
      meadow?.update();
      sky.update(deltaMs);
      // Skipped while hidden: a raid keeps the sea invisible for its whole
      // length, and animating a flock nobody can see is work for nothing.
      if (!sea.visible) return;
      water.update(deltaMs);
      ducks.update(deltaMs);
    },
    destroy() {
      meadow?.destroy();
      shield.destroy({ children: true });
      home.destroy();
      water.destroy();
      ducks.destroy();
      sky.destroy();
      sea.destroy({ children: true });
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
