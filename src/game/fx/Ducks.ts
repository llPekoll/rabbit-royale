/**
 * Ducks paddling about on the open water.
 *
 * The island's other scenery is STAMPED: a tree, a bush, a sea rock each take
 * a cell, and `IsoIslandView` places them once from the seed's own rolls. A
 * duck cannot work that way. Something that swims has to cross the cells
 * rather than occupy one, so it keeps its position in pixels and is never
 * registered on the board at all — nothing can walk on water, so there is
 * nothing for it to block or be blocked by.
 *
 * ## Where a duck is allowed to be
 *
 * The caller answers one question — `isWater(x, y)` in MAP space — and this
 * knows nothing else about the island. A duck picks a target, swims to it, and
 * on arrival picks another; a target is only accepted if its cell is water, so
 * the flock stays in the sea without anyone computing a coastline.
 *
 * The check is done on the DESTINATION before setting off, not per frame on
 * the way. Testing every frame and turning back at the shore makes a duck
 * jitter along the coast, because the cell it is leaving and the cell it is
 * entering disagree for as long as it straddles them.
 *
 * ## Facing
 *
 * The art is drawn facing RIGHT, with its wake trailing left. Swimming left is
 * therefore a horizontal flip — `scale.x` negative — and not a second sheet.
 * The flip follows the sign of the horizontal travel only: a duck heading
 * almost straight "up" the diamond would otherwise flip back and forth on the
 * noise in its own heading.
 */
import { Assets, Container, Rectangle, Sprite, Texture } from 'pixi.js';

/** Where the duck sheet lives. */
const DUCK_URL = '/assets/deco/duck.webp';

/** The sheet is three 32x32 frames of one duck bobbing. */
const FRAME = 32;
const FRAMES = 3;

export interface DucksOptions {
  /** How many ducks to put on the water. */
  count?: number;
  /** CELLS per second — the duck moves in map space, not on screen. */
  speed?: number;
  /** Milliseconds per bob frame. */
  frameMs?: number;
  /** Sprite scale. */
  scale?: number;
  /**
   * How many cells away a duck looks for its next spot.
   *
   * Short hops read as a duck pottering about; long ones read as a duck with
   * somewhere to be, which is not what a duck is.
   */
  range?: number;
  /** Seconds a duck rests on arrival, before choosing again. */
  restMs?: number;
}

export interface Ducks {
  /** Add this to the water layer, under the island. */
  readonly view: Container;
  /** Advance the flock. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void;
  destroy(): void;
}

/** Load the duck sheet and slice its three frames. Cached by Pixi. */
export async function loadDucks(): Promise<Texture[]> {
  const sheet = await Assets.load<Texture>(DUCK_URL);
  return Array.from({ length: FRAMES }, (_, i) => new Texture({
    source: sheet.source,
    frame: new Rectangle(i * FRAME, 0, FRAME, FRAME),
  }));
}

interface Duck {
  sprite: Sprite;
  /** Where it is now, in MAP space — fractional, because it swims. */
  x: number;
  y: number;
  /** Where it is heading, in map space. */
  tx: number;
  ty: number;
  /** Its own offset into the bob, so the flock never bobs in unison. */
  phase: number;
  /** Milliseconds left of its rest, or 0 when swimming. */
  resting: number;
}

/**
 * Put ducks on the water.
 *
 * `isWater` and `at` are asked in MAP space; `at` turns a (fractional) cell
 * into the screen position of that point. The caller owns both, so this knows
 * nothing about the island's generator, its tiers or its projection — the same
 * arrangement `PackWater` uses.
 *
 * `rng` is passed in rather than `Math.random` so an island with a given seed
 * always puts its ducks in the same places, which is what makes a screenshot
 * comparable.
 */
export function createDucks(
  frames: Texture[],
  width: number,
  height: number,
  isWater: (x: number, y: number) => boolean,
  at: (x: number, y: number) => { x: number; y: number },
  rng: () => number = Math.random,
  options: DucksOptions = {},
): Ducks {
  const o = {
    count: 3, speed: 2, frameMs: 220, scale: 1.6, range: 4, restMs: 1400, ...options,
  };

  const view = new Container();
  // Ducks sort among THEMSELVES by zIndex; without this the container keeps
  // insertion order and one duck swims through another.
  view.sortableChildren = true;
  const ducks: Duck[] = [];

  /** A water cell picked at random, or null if the sea is too small to find one. */
  const openWater = (): { x: number; y: number } | null => {
    // Bounded rather than "until it finds one": an island that somehow filled
    // its own map would spin here forever.
    for (let tries = 0; tries < 200; tries++) {
      const x = rng() * width;
      const y = rng() * height;
      if (isWater(Math.floor(x), Math.floor(y))) return { x, y };
    }
    return null;
  };

  for (let i = 0; i < o.count; i++) {
    const spot = openWater();
    if (!spot) break;
    const sprite = new Sprite(frames[0]);
    sprite.anchor.set(0.5);
    sprite.scale.set(o.scale);
    const p = at(spot.x, spot.y);
    sprite.position.set(p.x, p.y);
    view.addChild(sprite);
    ducks.push({
      sprite, x: spot.x, y: spot.y, tx: spot.x, ty: spot.y,
      phase: rng() * FRAMES, resting: rng() * o.restMs,
    });
  }

  let elapsed = 0;
  return {
    view,
    update(deltaMs) {
      if (!ducks.length) return;
      elapsed += deltaMs;
      const step = (o.speed * deltaMs) / 1000;
      const t = elapsed / o.frameMs;

      for (const d of ducks) {
        if (d.resting > 0) {
          d.resting -= deltaMs;
        } else {
          const dx = d.tx - d.x;
          const dy = d.ty - d.y;
          const dist = Math.hypot(dx, dy);

          if (dist < 0.05) {
            // Arrived: rest, then choose somewhere new nearby.
            d.resting = o.restMs * (0.5 + rng());
            for (let tries = 0; tries < 12; tries++) {
              const nx = d.x + (rng() * 2 - 1) * o.range;
              const ny = d.y + (rng() * 2 - 1) * o.range;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              // The DESTINATION is what gets tested — see the header for why
              // checking every frame makes a duck jitter along the shore.
              if (!isWater(Math.floor(nx), Math.floor(ny))) continue;
              d.tx = nx;
              d.ty = ny;
              break;
            }
          } else {
            d.x += (dx / dist) * step;
            d.y += (dy / dist) * step;
            // Face the way it travels. Horizontal sign only: on this lattice a
            // duck heading up the diamond has a tiny dx that would flip it
            // back and forth every frame.
            const screenDx = dx - dy;
            if (Math.abs(screenDx) > 0.01) d.sprite.scale.x = screenDx < 0 ? -o.scale : o.scale;
          }
        }

        const p = at(d.x, d.y);
        d.sprite.position.set(p.x, p.y);
        // Depth, so a duck swimming south passes IN FRONT of one to the north
        // rather than through it. The water layer sorts on the same axis the
        // island does.
        d.sprite.zIndex = d.x + d.y;
        const n = frames.length;
        d.sprite.texture = frames[((Math.floor(t + d.phase) % n) + n) % n];
      }
    },
    destroy() {
      view.destroy({ children: true });
      ducks.length = 0;
    },
  };
}
