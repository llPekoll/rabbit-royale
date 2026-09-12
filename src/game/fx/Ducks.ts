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
 * ## It swims along a curve, not a straight line
 *
 * A duck that turns instantly at each waypoint reads as a machine following
 * waypoints. Instead it carries a HEADING that turns toward the target a
 * little each frame, so the corner between two legs comes out rounded and the
 * whole track is a spline it drew itself. `uTurn` is how sharply it may turn:
 * low is a wide, lazy arc.
 *
 * Because the heading lags the target, the duck can drift wide of the line —
 * so the path check leaves a margin (`CLEARANCE`) around the route rather than
 * testing the exact segment.
 *
 * ## Facing
 *
 * The art is drawn facing RIGHT, with its wake trailing left. The sprite is
 * ROTATED to its heading so it genuinely points where it is going, and flipped
 * vertically rather than horizontally when heading left — a plain rotation
 * past 90 degrees would leave it swimming upside down.
 *
 * The angle is taken in SCREEN space, not map space: on this lattice a
 * heading of (1,1) is straight down the diamond, and rotating by the map
 * angle would point the duck off at 45 degrees to its own wake.
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
  /**
   * How much of its heading the sprite actually leans into, 0 to 1.
   *
   * The art is drawn from above and carries its own perspective, so a full
   * rotation tips the duck over instead of turning it. Around a third reads as
   * a heading without breaking the drawing.
   */
  tilt?: number;
  /**
   * How sharply a duck may turn, in radians per second.
   *
   * This is what makes the track a curve: the heading chases the target
   * instead of snapping to it, so each corner is rounded off. High values
   * straighten it back into waypoint-to-waypoint travel.
   */
  turn?: number;
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
  /** Which way it is pointing, in MAP space radians. Turns toward the target. */
  heading: number;
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
    count: 3, speed: 2, frameMs: 220, scale: 1.2, range: 4, restMs: 1400,
    turn: 1.6, tilt: 0.32, ...options,
  };

  const view = new Container();
  // Ducks sort among THEMSELVES by zIndex; without this the container keeps
  // insertion order and one duck swims through another.
  view.sortableChildren = true;
  const ducks: Duck[] = [];

  /**
   * How far from land a route has to stay, in cells.
   *
   * The duck's heading lags its target, so it swings wide of the straight
   * line between waypoints. Testing the exact segment would approve a route
   * that the duck then overshoots onto the shore.
   */
  const CLEARANCE = 0.45;

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
    ducks.push({
      sprite, x: spot.x, y: spot.y, tx: spot.x, ty: spot.y,
      heading: rng() * Math.PI * 2,
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

          if (dist < 0.15) {
            // Arrived: rest, then choose somewhere new it can actually reach.
            d.resting = o.restMs * (0.5 + rng());
            for (let tries = 0; tries < 16; tries++) {
              const nx = d.x + (rng() * 2 - 1) * o.range;
              const ny = d.y + (rng() * 2 - 1) * o.range;
              if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              // The WHOLE ROUTE, not just where it ends: a straight line
              // between two patches of open sea can pass under the island.
              if (!clearPath(d.x, d.y, nx, ny)) continue;
              d.tx = nx;
              d.ty = ny;
              break;
            }
          } else {
            // Turn TOWARD the target rather than onto it, so the corner
            // between two legs comes out as a curve. The difference is wrapped
            // into -PI..PI first, or a duck needing to turn a little anticlockwise
            // would instead swing most of the way round the other way.
            const want = Math.atan2(dy, dx);
            let turn = want - d.heading;
            turn = Math.atan2(Math.sin(turn), Math.cos(turn));
            const maxTurn = o.turn * (deltaMs / 1000);
            d.heading += Math.max(-maxTurn, Math.min(maxTurn, turn));

            const nx = d.x + Math.cos(d.heading) * step;
            const ny = d.y + Math.sin(d.heading) * step;
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

        // Point the sprite along its heading, in SCREEN space.
        //
        // A map-space angle is wrong on this lattice: (1,1) is straight down
        // the diamond, not down-right, so the duck would sit at 45 degrees to
        // its own wake. Projecting the heading through the same (x-y, x+y)
        // shear the board uses gives the angle actually seen.
        const hx = Math.cos(d.heading);
        const hy = Math.sin(d.heading);
        const sx = hx - hy;
        const sy = (hx + hy) * 0.5;
        // Facing left is a horizontal FLIP plus the mirrored angle, not a
        // rotation past 90 degrees — that would swim it upside down.
        //
        // The angle is then DAMPED by uTilt. At full strength the duck banks
        // like an aeroplane: this art is drawn from above with its own built-in
        // perspective, and tipping it 60 degrees breaks that perspective — the
        // bird reads as falling over rather than as turning. A fraction of the
        // angle keeps the hint of a heading while the duck stays upright.
        if (sx < 0) {
          d.sprite.scale.set(-o.scale, o.scale);
          d.sprite.rotation = Math.atan2(-sy, -sx) * o.tilt;
        } else {
          d.sprite.scale.set(o.scale, o.scale);
          d.sprite.rotation = Math.atan2(sy, sx) * o.tilt;
        }
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
