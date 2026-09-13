/**
 * The drifting sky.
 *
 * Clouds cross the sea on every side of the island — above it, below it, and
 * along both edges — at a speed you notice only if you look. The point is to
 * stop the water reading as a flat blue fill: the island already moves (the
 * video's surf, the volcano's smoke), and a dead border around it makes the
 * whole frame look like a screenshot.
 *
 * They pass OVER everything, the board included — weather is the one thing in
 * the frame that is nearer than the island.
 *
 * They used to be pinned under the tiles, on the grounds that a cloud drifting
 * across the board would hide the numbers the game is read from. That trade is
 * paid for differently now: the bands still avoid the playable middle, so what
 * a cloud crosses is the sea and the island's edges rather than the tiles a
 * player is reading. See `BANDS` for where each one sits.
 */
import { Assets, Container, Sprite, type Texture } from 'pixi.js';
import * as Keys from '@/config/assetKeys';

/**
 * Where a cloud is allowed to be. Never over the island's playable middle.
 *
 * All four bands drift HORIZONTALLY: weather moves across a sky, and clouds
 * that slid up and down the sides read as a lift rather than as wind. The bands
 * differ in the height they sit at, not in the direction they travel.
 */
export type CloudBand = 'top' | 'upper' | 'lower' | 'bottom';

export interface CloudFieldOptions {
  /** Design-space extent the clouds drift across. */
  width: number;
  height: number;
  /** Clouds per band. Four is enough to keep a band occupied without clutter. */
  perBand?: number;
}

/** Drift speed in design px per second. Slow: weather, not traffic. */
const SPEED_RANGE = [4, 11] as const;
/**
 * Big, and deliberately bigger than the frame can hold.
 *
 * The first cut drew them small and faint, which read as haze rather than as
 * weather. A cloud that OVERFLOWS the screen sells scale: you see part of it,
 * it drifts, and the rest is somewhere off-frame — which is what a real cloud
 * bank looks like from underneath.
 */
const SCALE_RANGE = [1.1, 2.2] as const;
/** Solid. They are objects passing over the sea, not a tint on it. */
const ALPHA_RANGE = [0.92, 1] as const;
/**
 * The HIGHEST row of the 256px cloud frame that has paint in it.
 *
 * The eight textures start painting between row 42 and row 115; the lowest of
 * those starts is the safe one to measure from, so that every texture in the
 * set has real paint at the frame edge rather than only the tall ones. Only the
 * bottom bands need this — see `showBelow`.
 */
const PAINTED_TOP = 115;
/**
 * In FRONT of the whole island.
 *
 * Tiles sort on `tileDepth(i) * 16 + tier`, and on a 16x16 grid `tileDepth`
 * reaches 30 — so the board alone climbs past 480, and the scene's own effects
 * (the blast at 55, a bolt at 60, labels at 62) ride on top of their tile.
 * A cloud has to clear ALL of that, hence a number with room above the highest
 * thing the board can produce rather than a tidy one just past the effects.
 */
const Z = 10_000;

/** Off-frame room, big enough to hide a whole oversized cloud. */
const MARGIN = 900;

interface Cloud {
  sprite: Sprite;
  speed: number;
  band: CloudBand;
}

export class CloudField {
  private clouds: Cloud[] = [];
  private layer = new Container();

  constructor(parent: Container, private opts: CloudFieldOptions) {
    this.layer.zIndex = Z;
    parent.addChild(this.layer);

    const perBand = opts.perBand ?? 4;
    const bands: CloudBand[] = ['top', 'upper', 'lower', 'bottom'];
    for (const band of bands) {
      for (let i = 0; i < perBand; i++) {
        const cloud = this.spawn(band);
        if (!cloud) continue;
        // Stagger the first frame across the whole crossing, so the field
        // starts LOOKING settled instead of marching in from one edge.
        this.place(cloud, Math.random());
        this.clouds.push(cloud);
      }
    }
  }

  private spawn(band: CloudBand): Cloud | null {
    const n = 1 + Math.floor(Math.random() * Keys.CLOUD_COUNT);
    const texture = Assets.get<Texture>(Keys.cloudKey(n));
    if (!texture) return null;

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.alpha = rand(ALPHA_RANGE);
    sprite.scale.set(rand(SCALE_RANGE));
    // Half the clouds face the other way, so eight sprites read as sixteen.
    if (Math.random() < 0.5) sprite.scale.x *= -1;
    this.layer.addChild(sprite);

    return { sprite, speed: rand(SPEED_RANGE), band };
  }

  /**
   * Put a cloud at `t` (0..1) along its band's crossing.
   *
   * Every band runs left-to-right or right-to-left; only the height differs.
   * Alternating the direction between bands keeps the sky from reading as one
   * conveyor belt.
   */
  private place(cloud: Cloud, t: number): void {
    const { width: w, height: h } = this.opts;
    const s = cloud.sprite;
    // Wide enough that a cloud this size is FULLY off-frame before it wraps —
    // it is now bigger than the canvas, so the old 160px margin would have
    // popped half a cloud into existence mid-air.
    const m = MARGIN;

    switch (cloud.band) {
      // The bands sit mostly OFF the frame, top and bottom: a cloud shows its
      // inner edge and hangs the rest into the margin. These sprites are larger
      // than the canvas, so a band centred on the frame would sit squarely over
      // the board — and the one rule here is that nothing covers the tiles the
      // game is read from.
      case 'top':
        s.x = -m + t * (w + m * 2);
        s.y = rand([-h * 0.34, -h * 0.18]);
        break;
      case 'upper':
        s.x = w + m - t * (w + m * 2);   // the other way, so the sky is not a conveyor
        s.y = rand([-h * 0.16, -h * 0.04]);
        break;
      // The bottom pair is anchored to the sprite's OWN size, not to a fraction
      // of the canvas — `showBelow` parks a cloud so that a fixed number of
      // pixels of it pokes back up over the frame's bottom edge.
      //
      // They used to sit at `h * 1.04..1.34`, a fraction of the height like the
      // top pair. The top pair gets away with it because a cloud hanging off the
      // TOP edge is still 18-34% of the height up there for any h. Downwards the
      // same arithmetic scales the gap with the canvas while the sprite stays
      // 256px tall: on the 860-tall portrait space the burrow uses, `h * 1.34`
      // parks the `bottom` band 1152px down, and at the small end of
      // SCALE_RANGE its 141px half-height reaches nowhere near the frame — that
      // band contributed literally zero visible pixels, and `lower` could fall
      // to 3. The bottom of a portrait burrow was left bare.
      //
      // Anchoring to the sprite means both bands show the same sliver of cloud
      // at every scale and on either orientation.
      case 'lower':
        s.x = -m + t * (w + m * 2);
        s.y = this.showBelow(s, [26, 62]);
        break;
      case 'bottom':
        s.x = w + m - t * (w + m * 2);
        s.y = this.showBelow(s, [4, 26]);
        break;
    }
  }

  /**
   * The `y` that leaves `visible` px of PAINTED cloud poking up over the
   * frame's bottom edge, with the body of the puff hanging off below it.
   *
   * Measured against the art, not the frame. Every cloud texture is a 576x256
   * box with the puff floating inside it and fully transparent rows above and
   * below — 57 to 92px of nothing at the bottom, 42 to 115 at the top, which at
   * SCALE_RANGE becomes a couple of hundred px either way. Parking the sprite's
   * BOUNDING BOX 40px into frame showed 40px of that padding and not one pixel
   * of cloud: a probe counted eight sprites overlapping the bottom of the
   * canvas while the render counted zero cloud pixels there.
   *
   * It is the puff's TOP edge that is anchored, not its bottom. Anchoring the
   * bottom is the same instruction as "put the whole cloud on screen" — the
   * body is 105-335px tall once scaled, so it lands squarely over the board,
   * which is the one thing this module must never do. Anchored by the top, the
   * puff shows `visible` px at the edge and runs off the bottom of the frame.
   *
   * The ranges are kept small on purpose. The board is fitted to the frame with
   * only a 0.82 margin, so its bottom corner comes within ~60px of the edge —
   * a band reaching 110px up puts a puff over the tiles, which is the whole
   * thing this module exists to avoid. Tuned by counting cloud pixels in the
   * bottom rows against cloud pixels over the board.
   */
  private showBelow(s: Sprite, visible: readonly [number, number]): number {
    // `scale.x` is negated on the flipped half of the field (see `spawn`), so
    // the height comes off `scale.y`, which is never mirrored.
    const sy = Math.abs(s.scale.y);
    // Centre -> highest painted row, in design px (negative: it is above).
    const toPaintedTop = (PAINTED_TOP - s.texture.height / 2) * sy;
    return this.opts.height - toPaintedTop - rand(visible);
  }

  /** Advance the field. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void {
    const { width: w } = this.opts;
    const m = MARGIN;
    const dt = deltaMs / 1000;

    for (const cloud of this.clouds) {
      const s = cloud.sprite;
      const d = cloud.speed * dt;
      // Horizontal, always: `top` and `lower` drift right, the other two left.
      const rightwards = cloud.band === 'top' || cloud.band === 'lower';
      if (rightwards) {
        s.x += d;
        if (s.x > w + m) this.place(cloud, 0);
      } else {
        s.x -= d;
        if (s.x < -m) this.place(cloud, 0);
      }
    }
  }

  /**
   * Re-solve the field against a new design space.
   *
   * `GAME_W`/`GAME_H` are swapped on rotation (see Application.resize), and the
   * bands are positioned as fractions of that space — so a field built in
   * landscape and then turned to portrait keeps parking its bottom bands at the
   * OLD height, hundreds of px from the edge they were meant to hug. The scenes
   * already re-solve their camera on resize; the sky has to be re-solved with
   * it.
   *
   * Existing clouds are re-placed rather than respawned: a cloud that jumped to
   * a new texture and scale on rotation would read as a cut, and `t` is
   * randomised per cloud so the field stays staggered instead of lining up.
   */
  resize(width: number, height: number): void {
    this.opts = { ...this.opts, width, height };
    for (const cloud of this.clouds) this.place(cloud, Math.random());
  }

  /**
   * Undo a camera transform applied to the parent, so the sky stays pinned to
   * the FRAME rather than to the scene.
   *
   * The bands are deliberately parked just off the canvas edges (see `place`) —
   * a cloud shows its inner edge and hangs the rest into the margin. That is a
   * statement about the frame, so when the burrow's camera pulls back it drags
   * the whole parked bank into view and the sky suddenly reads as fog rolling
   * over the garden. Counter-scaling keeps the clouds where they were composed
   * to be, at any camera position.
   */
  counterCamera(scale: number, x: number, y: number): void {
    const inv = 1 / scale;
    this.layer.scale.set(inv);
    this.layer.position.set(-x * inv, -y * inv);
  }

  destroy(): void {
    for (const c of this.clouds) c.sprite.destroy();
    this.clouds = [];
    this.layer.destroy({ children: true });
  }
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
