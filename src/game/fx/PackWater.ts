/**
 * The pack's own shadow and surf, laid on the island's cells.
 *
 * Steps 2 to 4 of the water breakdown — the cast shadow, its ripple, and the
 * foam line — were each being RECONSTRUCTED: the shadow as the island's
 * rendered silhouette blurred and pushed down, the foam as sixteen offset
 * copies of that silhouette union'd into a ring. Both fought the same problem,
 * which is that a shape derived from the board inherits the board's diamond
 * staircase, and neither ever produced the irregular, hand-stippled edge the
 * reference has. The foam ring could not even be made hollow: `erase` blending
 * and an inverse mask were both tried and measured, and neither cut a hole.
 *
 * Tiny Swords ships the surf drawn by hand, with that edge already in it —
 * a sixteen-frame `Water Foam.png`. `gen_iso_sheets.py` shears it onto the
 * diamond, and this places one per shore cell. The ripple is then the pack's
 * own animation rather than a displacement map, and there is no silhouette,
 * no blur, no union and no mask.
 *
 * The pack's `Shadow.png` went the same way and came back out: it is a small
 * round blob meant to sit under a unit, and one per land cell tiled into a
 * dark quilt under the island rather than a cast shadow. Step 2 stays with
 * `IslandShadow`, which takes the island's actual silhouette.
 */
import { Assets, Container, Sprite, Texture, Rectangle } from 'pixi.js';

/** Where the baked sheets live once `gen_iso_sheets.py --install` has run. */
const SHEETS = '/assets/terrain-iso';

/**
 * One baked frame, in pixels.
 *
 * Twice the island's cell on purpose: the surf is sheared at its own size and
 * spills past the 44x24 diamond it sits on, and a cell-sized frame would clip
 * that spill straight back off — which is exactly the overhang that makes
 * neighbouring cells join into a coastline.
 */
const FRAME = 128;

/** Frames in the pack's surf strip. */
const FOAM_FRAMES = 16;

export interface PackWaterOptions {
  /** Milliseconds per surf frame. */
  frameMs?: number;
  /**
   * How far neighbouring cells are pushed out of step, 0 to 1.
   *
   * At 0 every sprite shows the same frame at the same instant and the whole
   * coast pulses as one object, which reads as a flicker rather than as water.
   * A per-cell offset breaks that up: the surf then travels along the shore
   * instead of blinking.
   */
  phase?: number;
  /** How opaque the surf is. */
  foamAlpha?: number;
  /** Tint for the surf. */
  foamColor?: number;
  /**
   * Extra scale on each sprite. 1 keeps the size the bake gave it.
   *
   * The overhang is baked in now, so this is a tuning dial rather than the
   * thing that makes the coastline join up. Below 1 the surf tucks further
   * under the land and less of it shows in the water.
   */
  overlap?: number;
}

export interface PackWater {
  /** Add this under the island. */
  readonly view: Container;
  /** Advance the surf. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void;
  destroy(): void;
}

/** Load the two baked sheets. Cached by Pixi, so call it freely. */
export async function loadPackWater(): Promise<{ foam: Texture[] }> {
  const strip = await Assets.load<Texture>(`${SHEETS}/pack-foam.webp`);
  const foam = Array.from({ length: FOAM_FRAMES }, (_, i) => new Texture({
    source: strip.source,
    frame: new Rectangle(i * FRAME, 0, FRAME, FRAME),
  }));
  return { foam };
}

/**
 * Place surf on every sea cell that touches land.
 *
 * `isLand` and `touchesLand` are asked in MAP space; `at` turns a cell into
 * the screen position of its centre. The caller owns all three, so this knows
 * nothing about the island's generator, its tiers or its projection.
 */
export function createPackWater(
  textures: { foam: Texture[] },
  width: number,
  height: number,
  isLand: (x: number, y: number) => boolean,
  at: (x: number, y: number) => { x: number; y: number },
  options: PackWaterOptions = {},
): PackWater {
  const o = {
    frameMs: 140, phase: 1, foamAlpha: 1, foamColor: 0xc6f0db, overlap: 1, ...options,
  };

  const view = new Container();
  const foams = new Container();
  view.addChild(foams);

  /** Each sprite with its own starting frame, so the coast never pulses. */
  const animated: Array<{ sprite: Sprite; offset: number }> = [];

  /** True when any of the eight neighbours is sea — i.e. this is a coast cell. */
  const touchesSea = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (!isLand(x + dx, y + dy)) return true;
      }
    }
    return false;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // The LAND cells at the water's edge, not the sea cells beside them.
      //
      // Placing a sprite on each shore-adjacent sea cell put the surf a full
      // tile out from the island, so it read as a chain of lozenges floating
      // offshore rather than a line breaking on the coast. Moving it one cell
      // in — onto the outermost land — lets the sprite's own overhang do the
      // work: it covers the cell it sits on and spills into the water past it.
      if (!isLand(x, y) || !touchesSea(x, y)) continue;
      {
        const p = at(x, y);
        const f = new Sprite(textures.foam[0]);
        f.anchor.set(0.5);
        f.position.set(p.x, p.y);
        f.scale.set(o.overlap);
        f.tint = o.foamColor;
        f.alpha = o.foamAlpha;
        foams.addChild(f);
        // Hashed from the cell, not random: the same island always animates
        // the same way, which is what makes a screenshot comparable.
        const hash = Math.abs(Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
        animated.push({ sprite: f, offset: Math.floor(hash * FOAM_FRAMES * o.phase) });
      }
    }
  }

  let elapsed = 0;
  return {
    view,
    update(deltaMs) {
      if (!animated.length) return;
      elapsed += deltaMs;
      const base = Math.floor(elapsed / o.frameMs);
      for (const a of animated) {
        a.sprite.texture = textures.foam[(base + a.offset) % FOAM_FRAMES];
      }
    },
    destroy() {
      view.destroy({ children: true });
      animated.length = 0;
    },
  };
}
