/**
 * Clouds drifting over the smooth island, with shadows on the ground.
 *
 * Two isometric clouds drawn for this island, in its sand and its ink. Each
 * one's silhouette is cast as its own shadow, straight below it by its
 * height and multiplied into whatever it falls on — between the island and
 * the cloud.
 *
 * They are drawn extruded along one isometric axis — the long side runs
 * from lower left to upper right — so that is the way they travel: along
 * that axis, up-right or down-left, and the mirrored ones along the other.
 * A cloud crossing at any other angle would slide sideways through its own
 * perspective.
 *
 * Screen space, like the game's cloud field: clouds are nearer than the
 * island and do not zoom with it. They cross the whole frame — the island
 * is not being read for numbers here — and wrap round.
 */
import { Assets, Container, Sprite, Texture } from 'pixi.js';

const CLOUD_URLS = ['/assets/world/iso-cloud-01.png', '/assets/world/iso-cloud-02.png'];

/** How many cross the frame, and how they vary. */
const COUNT = 9;
const SCALE_RANGE = [0.8, 1.6] as const;
const SPEED_RANGE = [6, 16] as const;
/** Off-frame room, enough to hide the widest cloud. */
const MARGIN = 450;
/** Normal blending, near opaque: a touch of sky shows through them. */
const CLOUD_BLEND = 'normal' as const;
const CLOUD_ALPHA = 0.9;

/**
 * The shadow: the cloud's own silhouette, straight below it — the sun is
 * overhead, and the cloud is drawn in the ground's projection already, so
 * its outline IS its outline on the ground — by the cloud's height, and
 * lighter than the cloud so it never leads.
 */
const SHADOW_DX = 0;
const SHADOW_DY = 170;
const SHADOW_TINT = 0xa8bfa8;
const SHADOW_ALPHA = 0.45;

let puffs: Promise<Texture[]> | null = null;

/** The cloud textures. Cached. */
export function loadCloudPuffs(): Promise<Texture[]> {
  puffs ??= Promise.all(
    CLOUD_URLS.map(async (url) => {
      const texture = await Assets.load<Texture>(url);
      texture.source.scaleMode = 'linear';
      return texture;
    }),
  ).catch((err) => {
    puffs = null;
    throw err;
  });
  return puffs;
}

interface Cloud {
  sprite: Sprite;
  shadow: Sprite;
  speed: number;
  /** Unit direction of travel on screen, along the cloud's own axis. */
  dx: number;
  dy: number;
  /** Where along its line it is, and the line's offset from the frame's centre. */
  s: number;
  p: number;
}

export class SmoothClouds {
  /** Add `shadows` over the island and `layer` over that. */
  readonly layer = new Container();
  readonly shadows = new Container();
  private clouds: Cloud[] = [];

  constructor(
    textures: readonly Texture[],
    private width: number,
    private height: number,
  ) {
    for (let i = 0; i < COUNT; i++) {
      const texture = textures[Math.floor(Math.random() * textures.length)];
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      const scale = rand(SCALE_RANGE);
      const mirrored = Math.random() < 0.5;
      sprite.scale.set(mirrored ? -scale : scale, scale);
      sprite.blendMode = CLOUD_BLEND;
      sprite.alpha = CLOUD_ALPHA;
      this.layer.addChild(sprite);

      const shadow = new Sprite(texture);
      shadow.anchor.set(0.5);
      shadow.scale.set(sprite.scale.x, scale);
      shadow.tint = SHADOW_TINT;
      shadow.alpha = SHADOW_ALPHA;
      shadow.blendMode = 'multiply';
      this.shadows.addChild(shadow);

      // The axis: up-right for the cloud as drawn, up-left mirrored; half
      // of each go the other way along it.
      const n = Math.hypot(2, 1);
      const forward = i % 2 === 0 ? 1 : -1;
      const cloud: Cloud = {
        sprite,
        shadow,
        speed: rand(SPEED_RANGE),
        dx: ((mirrored ? -2 : 2) / n) * forward,
        dy: (-1 / n) * forward,
        s: 0,
        p: 0,
      };
      // Staggered along the crossing, so the sky starts settled.
      this.place(cloud, Math.random());
      this.clouds.push(cloud);
    }
  }

  /** Half the frame's diagonal plus the margin: how far a crossing runs either side of the centre. */
  private reach(): number {
    return Math.hypot(this.width, this.height) / 2 + MARGIN;
  }

  /** Put a cloud `t` (0..1) of the way along a fresh line across the frame. */
  private place(cloud: Cloud, t: number): void {
    const reach = this.reach();
    // Lines that clip only a corner of the frame show almost nothing, so
    // the offsets stay well inside the half-diagonal.
    cloud.p = (Math.random() * 2 - 1) * (Math.hypot(this.width, this.height) * 0.3);
    cloud.s = -reach + t * 2 * reach;
    this.follow(cloud);
  }

  /** Screen position from the line: centre, across by `p`, along by `s`. */
  private follow(cloud: Cloud): void {
    const cx = this.width / 2;
    const cy = this.height / 2;
    // Perpendicular to the direction of travel.
    const px = -cloud.dy;
    const py = cloud.dx;
    cloud.sprite.position.set(cx + px * cloud.p + cloud.dx * cloud.s, cy + py * cloud.p + cloud.dy * cloud.s);
    cloud.shadow.position.set(cloud.sprite.x + SHADOW_DX, cloud.sprite.y + SHADOW_DY);
  }

  update(dt: number): void {
    const reach = this.reach();
    for (const cloud of this.clouds) {
      cloud.s += cloud.speed * dt;
      if (cloud.s > reach) this.place(cloud, 0);
      else this.follow(cloud);
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    for (const cloud of this.clouds) this.follow(cloud);
  }

  destroy(): void {
    this.layer.destroy({ children: true });
    this.shadows.destroy({ children: true });
    this.clouds = [];
  }
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
