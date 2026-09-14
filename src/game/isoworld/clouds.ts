/**
 * Clouds drifting over the smooth island, with shadows on the ground.
 *
 * Two isometric clouds drawn for this island, in its sand and its ink. Each
 * one casts a shadow: a flat silhouette baked from its alpha, with none of
 * the drawing's inner lines, projected onto the ground — a cloud is a lump
 * with height, and an overhead sun sees its FOOTPRINT, so the silhouette is
 * squashed vertically to the footprint's depth and laid straight below the
 * cloud by its height, multiplied into whatever it falls on. It sits
 * between the island and the clouds.
 *
 * Each is drawn extruded along one isometric axis, so that is the way it
 * travels: along its own axis, either way, and along the other diagonal
 * when mirrored. A cloud crossing at any other angle would slide sideways
 * through its own perspective.
 *
 * Screen space, like the game's cloud field: clouds are nearer than the
 * island and do not zoom with it. They cross the whole frame — the island
 * is not being read for numbers here — and wrap round.
 */
import { Assets, Container, Sprite, Texture } from 'pixi.js';

/**
 * Each cloud with the isometric axis its long side runs along, as the unit
 * screen direction of that axis going right. Measured off the bottom edge
 * of each drawing: 01 runs down-right, 02 up-right.
 */
const CLOUDS: readonly { url: string; axis: readonly [number, number] }[] = [
  { url: '/assets/world/iso-cloud-01.png', axis: [2, 1] },
  { url: '/assets/world/iso-cloud-02.png', axis: [2, -1] },
];

/** How many cross the frame, and how they vary. */
const COUNT = 9;
const SCALE_RANGE = [0.6, 1.2] as const;
const SPEED_RANGE = [6, 16] as const;
/** Off-frame room, enough to hide the widest cloud. */
const MARGIN = 450;
/** Normal blending, near opaque: a touch of sky shows through them. */
const CLOUD_BLEND = 'normal' as const;
const CLOUD_ALPHA = 0.9;

/**
 * The shadow: how far below the cloud it lies, how much the silhouette is
 * squashed to the footprint, its colour, and how dark.
 */
const SHADOW_DY = 110;
const SHADOW_FLATTEN = 0.5;
const SHADOW_COLOR = [110, 140, 110] as const;
const SHADOW_ALPHA = 0.4;

export interface CloudPuff {
  texture: Texture;
  /** The flat silhouette, in the shadow colour: alpha only, no drawing. */
  shadow: Texture;
  /** Unit screen direction of the cloud's long axis, going right. */
  axis: readonly [number, number];
}

let puffs: Promise<CloudPuff[]> | null = null;

/** The cloud textures with their baked silhouettes. Cached. */
export function loadCloudPuffs(): Promise<CloudPuff[]> {
  puffs ??= Promise.all(
    CLOUDS.map(async ({ url, axis }) => {
      const texture = await Assets.load<Texture>(url);
      texture.source.scaleMode = 'linear';
      const n = Math.hypot(axis[0], axis[1]);
      return { texture, shadow: silhouette(texture), axis: [axis[0] / n, axis[1] / n] as const };
    }),
  ).catch((err) => {
    puffs = null;
    throw err;
  });
  return puffs;
}

/** One flat colour wherever the cloud has paint: its outline and nothing inside. */
function silhouette(texture: Texture): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = texture.width;
  canvas.height = texture.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return texture;
  ctx.drawImage(texture.source.resource as CanvasImageSource, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  const [r, g, b] = SHADOW_COLOR;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    // Solid inside; the edge keeps its anti-aliasing.
    px[i + 3] = px[i + 3] > 40 ? 255 : px[i + 3] * 6;
  }
  ctx.putImageData(image, 0, 0);
  const out = Texture.from(canvas);
  out.source.scaleMode = 'linear';
  return out;
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
    puffs: readonly CloudPuff[],
    private width: number,
    private height: number,
  ) {
    for (let i = 0; i < COUNT; i++) {
      const puff = puffs[Math.floor(Math.random() * puffs.length)];
      const sprite = new Sprite(puff.texture);
      sprite.anchor.set(0.5);
      const scale = rand(SCALE_RANGE);
      const mirrored = Math.random() < 0.5;
      sprite.scale.set(mirrored ? -scale : scale, scale);
      sprite.blendMode = CLOUD_BLEND;
      sprite.alpha = CLOUD_ALPHA;
      this.layer.addChild(sprite);

      const shadow = new Sprite(puff.shadow);
      shadow.anchor.set(0.5);
      shadow.scale.set(sprite.scale.x, scale * SHADOW_FLATTEN);
      shadow.alpha = SHADOW_ALPHA;
      shadow.blendMode = 'multiply';
      this.shadows.addChild(shadow);

      // Along the cloud's own axis; mirroring flips its x. Half of them go
      // the other way along it.
      const forward = i % 2 === 0 ? 1 : -1;
      const cloud: Cloud = {
        sprite,
        shadow,
        speed: rand(SPEED_RANGE),
        dx: (mirrored ? -puff.axis[0] : puff.axis[0]) * forward,
        dy: puff.axis[1] * forward,
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
    cloud.shadow.position.set(cloud.sprite.x, cloud.sprite.y + SHADOW_DY);
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
