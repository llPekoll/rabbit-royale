/**
 * The drifting sky.
 *
 * Clouds cross the sea on every side of the island — above it, below it, and
 * along both edges — at a speed you notice only if you look. The point is to
 * stop the water reading as a flat blue fill: the island already moves (the
 * video's surf, the volcano's smoke), and a dead border around it makes the
 * whole frame look like a screenshot.
 *
 * They live BEHIND the board (`zIndex` under the tiles) and never over it —
 * a cloud drifting across the tiles would hide the numbers the game is read
 * from, which is the one thing the art may not do.
 */
import { Assets, Container, Sprite, type Texture } from 'pixi.js';
import * as Keys from '@/config/assetKeys';

/** Where a cloud is allowed to be. Never over the island's playable middle. */
export type CloudBand = 'top' | 'bottom' | 'left' | 'right';

export interface CloudFieldOptions {
  /** Design-space extent the clouds drift across. */
  width: number;
  height: number;
  /** Clouds per band. Four is enough to keep a band occupied without clutter. */
  perBand?: number;
}

/** Drift speed in design px per second. Slow: weather, not traffic. */
const SPEED_RANGE = [4, 11] as const;
/** Clouds are drawn small — they are distance, not subject. */
const SCALE_RANGE = [0.30, 0.62] as const;
/** Faint enough to sit under the island's own colour without competing. */
const ALPHA_RANGE = [0.30, 0.60] as const;
/**
 * Between the island art and the board.
 *
 * The video sits at -10 and the crisp island overlay at -9.5, and the backdrop
 * is zoomed past the canvas edges — so anything BEHIND it is simply never seen.
 * Tiles start at 0. Clouds therefore go in the gap: over the painted sea, under
 * every tile, so they can never drift across the numbers.
 */
const Z = -9;

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
    const bands: CloudBand[] = ['top', 'bottom', 'left', 'right'];
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
   * Top and bottom drift horizontally; the sides drift vertically. Vertical on
   * the sides rather than horizontal because a side cloud moving sideways would
   * cross the island — and the whole rule here is that they stay off it.
   */
  private place(cloud: Cloud, t: number): void {
    const { width: w, height: h } = this.opts;
    const s = cloud.sprite;
    // A margin wide enough that a cloud is fully off-frame before it wraps,
    // so nothing ever pops in or out mid-air.
    const m = 160;

    switch (cloud.band) {
      case 'top':
        s.x = -m + t * (w + m * 2);
        s.y = rand([10, h * 0.16]);
        break;
      case 'bottom':
        s.x = w + m - t * (w + m * 2);   // the other way, so the sky is not a conveyor
        s.y = rand([h * 0.86, h - 10]);
        break;
      case 'left':
        s.x = rand([10, w * 0.13]);
        s.y = -m + t * (h + m * 2);
        break;
      case 'right':
        s.x = rand([w * 0.87, w - 10]);
        s.y = h + m - t * (h + m * 2);
        break;
    }
  }

  /** Advance the field. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void {
    const { width: w, height: h } = this.opts;
    const m = 160;
    const dt = deltaMs / 1000;

    for (const cloud of this.clouds) {
      const s = cloud.sprite;
      const d = cloud.speed * dt;
      switch (cloud.band) {
        case 'top':    s.x += d; if (s.x > w + m) this.place(cloud, 0); break;
        case 'bottom': s.x -= d; if (s.x < -m)    this.place(cloud, 0); break;
        case 'left':   s.y += d; if (s.y > h + m) this.place(cloud, 0); break;
        case 'right':  s.y -= d; if (s.y < -m)    this.place(cloud, 0); break;
      }
    }
  }

  destroy(): void {
    for (const c of this.clouds) c.sprite.destroy();
    this.clouds = [];
    this.layer.destroy({ children: true });
  }
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
