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
 * The WHOLE PATH is checked before setting off, not just the destination.
 * Testing only the endpoint let a duck take the straight line between two
 * patches of open sea and swim clean under the island on the way — which is
 * exactly what put one on top of a rock. Testing per frame instead is no good
 * either: the cell a duck is leaving and the cell it is entering disagree for
 * as long as it straddles them, so it jitters along the shore. Sampling the
 * candidate path in advance settles both — a route that clips land is simply
 * never chosen.
 *
 * ## It swims the way the art faces, and nowhere else
 *
 * The duck is drawn in three-quarter view: beak toward the bottom-LEFT of the
 * frame, wake trailing to the top-right. That is a bird coming TOWARD the
 * viewer along one of the lattice's diagonals — map step `(0, 1)`, which the
 * board projects to screen down-left. Mirrored, the same art swims down-right,
 * map step `(1, 0)`. Those are the only two directions in which this picture
 * is a duck swimming forward; along anything else it slides sideways, and an
 * attempt at six directions (the four axes plus the screen's horizontal) was
 * exactly that — a duck crabbing across the water with its beak pointing at
 * the shore.
 *
 * So a leg is a whole number of cells down-left or down-right, chosen and
 * checked in advance like before, and the sprite is flipped — never rotated —
 * to match. A duck that keeps swimming toward the viewer eventually runs out
 * of water in front of it: it can never turn round, because the art has no
 * back. When no leg is possible it DIVES — fades out where it is, and fades
 * back in on a fresh patch of open sea. A duck disappearing under the surface
 * and popping up somewhere else is what ducks do anyway.
 *
 * The first version steered a continuous heading toward its target and drew a
 * spline, then rotated the sprite to it. Neither survived: the curve was the
 * one thing in frame not on the lattice, and tilting art that is drawn from
 * above tipped the bird over instead of turning it.
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
  /** Milliseconds a duck rests on arrival, before choosing again. */
  restMs?: number;
  /** Milliseconds a dive takes each way — under, and back up elsewhere. */
  diveMs?: number;
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
  /** Where the current leg ends, in map space. */
  tx: number;
  ty: number;
  /** The leg's direction, one of the eight lattice steps, as a unit vector. */
  dirX: number;
  dirY: number;
  /** The sprite's x-scale sign: 1 is the art as drawn (down-left), -1 mirrored (down-right). */
  facing: 1 | -1;
  /** Its own offset into the bob, so the flock never bobs in unison. */
  phase: number;
  /** Milliseconds left of its rest, or 0 when swimming. */
  resting: number;
  /**
   * The dive in progress: how far through it, 0..2 x `diveMs`. The first
   * half fades out in place, the second fades in at the new spot. 0 when
   * afloat.
   */
  diving: number;
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
    count: 3, speed: 2, frameMs: 220, scale: 0.8, range: 4, restMs: 1400, diveMs: 600,
    ...options,
  };

  const view = new Container();
  // Ducks sort among THEMSELVES by zIndex; without this the container keeps
  // insertion order and one duck swims through another.
  view.sortableChildren = true;
  const ducks: Duck[] = [];

  /**
   * How far from land a route has to stay, in cells.
   *
   * A duck is a sprite with width: a centre line that clears the coast by a
   * hair still drags the bird's body over the sand.
   */
  const CLEARANCE = 0.45;

  /**
   * The two steps a leg may take: down-left on screen as the art is drawn,
   * and down-right as its mirror. Nothing else — see the note at the top.
   */
  const STEPS: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0]];
  /** The sprite flip for a step: the art faces down-left, so `(1, 0)` mirrors. */
  const facingFor = ([sx, sy]: readonly [number, number]): 1 | -1 => (sx - sy > 0 ? -1 : 1);

  /** True when every point along a->b is open water, margin included. */
  const clearPath = (ax: number, ay: number, bx: number, by: number): boolean => {
    const dist = Math.hypot(bx - ax, by - ay);
    // Twice per cell, so no sample can step over a one-cell spit of land.
    const steps = Math.max(2, Math.ceil(dist * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      // The four corners of the margin, not just the centre: a duck is a
      // sprite with width, and a centre line can thread a gap its body cannot.
      for (const [ox, oy] of [[0, 0], [CLEARANCE, 0], [-CLEARANCE, 0], [0, CLEARANCE], [0, -CLEARANCE]]) {
        if (!isWater(Math.floor(px + ox), Math.floor(py + oy))) return false;
      }
    }
    return true;
  };

  /** A water cell picked at random, or null if the sea is too small to find one. */
  const openWater = (): { x: number; y: number } | null => {
    // Bounded rather than "until it finds one": an island that somehow filled
    // its own map would spin here forever.
    for (let tries = 0; tries < 200; tries++) {
      const x = rng() * width;
      const y = rng() * height;
      // Zero-length path: reuses the same margin test, so a duck never starts
      // tucked against the shore where it has nowhere to turn.
      if (clearPath(x, y, x, y)) return { x, y };
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
    const facing = rng() < 0.5 ? -1 : 1;
    sprite.scale.set(facing * o.scale, o.scale);
    ducks.push({
      sprite, x: spot.x, y: spot.y, tx: spot.x, ty: spot.y, dirX: 0, dirY: 0, facing,
      phase: rng() * FRAMES, resting: rng() * o.restMs, diving: 0,
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
        if (d.diving > 0) {
          // Under: fade out where it is, surface somewhere new, fade in.
          const before = d.diving;
          d.diving += deltaMs;
          if (before <= o.diveMs && d.diving > o.diveMs) {
            const spot = openWater();
            if (spot) {
              d.x = spot.x;
              d.y = spot.y;
            }
            d.tx = d.x;
            d.ty = d.y;
          }
          if (d.diving >= 2 * o.diveMs) {
            d.diving = 0;
            d.resting = o.restMs * (0.5 + rng());
          }
        } else if (d.resting > 0) {
          d.resting -= deltaMs;
        } else {
          const dx = d.tx - d.x;
          const dy = d.ty - d.y;
          const dist = Math.hypot(dx, dy);

          if (dist < 1e-6) {
            // Arrived: choose a new leg along the lattice it can actually
            // swim — a whole number of cells down-left or down-right, the
            // WHOLE route checked rather than just where it ends. Rest first
            // either way; if no leg is possible, dive instead.
            d.resting = o.restMs * (0.5 + rng());
            let found = false;
            for (let tries = 0; tries < 16 && !found; tries++) {
              const step = STEPS[Math.floor(rng() * STEPS.length)];
              const [sx, sy] = step;
              const len = 1 + Math.floor(rng() * o.range);
              const nx = d.x + sx * len;
              const ny = d.y + sy * len;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              if (!clearPath(d.x, d.y, nx, ny)) continue;
              const norm = Math.hypot(sx, sy);
              d.tx = nx;
              d.ty = ny;
              d.dirX = sx / norm;
              d.dirY = sy / norm;
              d.facing = facingFor(step);
              found = true;
            }
            if (!found) {
              d.resting = 0;
              d.diving = 1e-3;
            }
          } else {
            // Along the leg, and never past its end: the last step lands
            // exactly on the target, so the next leg starts on the lattice.
            const travel = Math.min(step, dist);
            const nx = d.x + d.dirX * travel;
            const ny = d.y + d.dirY * travel;
            // Last guard: however it drifted, it never enters a land cell.
            if (isWater(Math.floor(nx), Math.floor(ny))) {
              d.x = nx;
              d.y = ny;
            } else {
              // Nose against the shore — give up on this leg and pick again.
              d.tx = d.x;
              d.ty = d.y;
            }
          }
        }

        const p = at(d.x, d.y);
        d.sprite.position.set(p.x, p.y);
        // Never rotated — see the note at the top. Flipped to face the way
        // the leg runs, and that is all.
        d.sprite.scale.set(d.facing * o.scale, o.scale);
        // A diving duck fades under, then fades back up at its new spot.
        d.sprite.alpha = d.diving === 0
          ? 1
          : d.diving <= o.diveMs
            ? 1 - d.diving / o.diveMs
            : (d.diving - o.diveMs) / o.diveMs;
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
