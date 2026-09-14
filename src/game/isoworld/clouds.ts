/**
 * The game's puffy clouds, drifting over the smooth island, with shadows.
 *
 * The eight sprites under `public/assets/clouds/` are the ones the island
 * and burrow scenes fly (`fx/Clouds.ts`). Each is painted with its own
 * shadow baked in beneath the puff — a dark blot for a top-down sky. Over
 * an isometric island the shadow has to lie on the GROUND, offset from the
 * cloud by its height and squashed to the ground's foreshortening, so the
 * baked one is stripped here (by colour: the puff is near-white, the blot
 * dark) and the puff's own silhouette is cast again as the shadow —
 * flattened, displaced, and multiplied into whatever it falls on.
 *
 * Screen space, like the game's field: clouds are nearer than the island
 * and do not zoom with it. They cross the whole frame — the island is not
 * being read for numbers here — and wrap round.
 */
import { Assets, Container, Sprite, Texture } from 'pixi.js';

const CLOUD_COUNT = 8;
const cloudUrl = (n: number) => `/assets/clouds/Clouds_0${n}.webp`;

/** Below this luminance a pixel is the baked shadow, not the puff. */
const PUFF_LUMA = 150;

/** How many cross the frame, and how they vary. */
const COUNT = 7;
const SCALE_RANGE = [0.55, 1.15] as const;
const SPEED_RANGE = [6, 16] as const;
/** Off-frame room, enough to hide the widest cloud. */
const MARGIN = 700;

/** The shadow: where it falls relative to its cloud, how flat, how dark. */
const SHADOW_DX = 30;
const SHADOW_DY = 190;
const SHADOW_FLATTEN = 0.55;
const SHADOW_TINT = 0x9cb39c;
const SHADOW_ALPHA = 0.65;

let puffs: Promise<Texture[]> | null = null;

/** The eight clouds with their baked shadows stripped. Cached. */
export function loadCloudPuffs(): Promise<Texture[]> {
  puffs ??= Promise.all(Array.from({ length: CLOUD_COUNT }, (_, i) => Assets.load<Texture>(cloudUrl(i + 1)).then(strip))).catch(
    (err) => {
      puffs = null;
      throw err;
    },
  );
  return puffs;
}

/** Keep the light pixels: the puff. The dark blot below it goes transparent. */
function strip(texture: Texture): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = texture.width;
  canvas.height = texture.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return texture;
  ctx.drawImage(texture.source.resource as CanvasImageSource, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = image.data;
  for (let i = 0; i < px.length; i += 4) {
    const luma = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (luma < PUFF_LUMA) px[i + 3] = 0;
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
  rightwards: boolean;
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
      sprite.scale.set(Math.random() < 0.5 ? -scale : scale, scale);
      this.layer.addChild(sprite);

      const shadow = new Sprite(texture);
      shadow.anchor.set(0.5);
      shadow.scale.set(sprite.scale.x, scale * SHADOW_FLATTEN);
      shadow.tint = SHADOW_TINT;
      shadow.alpha = SHADOW_ALPHA;
      shadow.blendMode = 'multiply';
      this.shadows.addChild(shadow);

      const cloud: Cloud = { sprite, shadow, speed: rand(SPEED_RANGE), rightwards: i % 2 === 0 };
      // Staggered across the crossing, so the sky starts settled.
      this.place(cloud, Math.random(), Math.random());
      this.clouds.push(cloud);
    }
  }

  private place(cloud: Cloud, t: number, band: number): void {
    const span = this.width + 2 * MARGIN;
    cloud.sprite.x = cloud.rightwards ? -MARGIN + t * span : this.width + MARGIN - t * span;
    cloud.sprite.y = band * this.height;
    this.follow(cloud);
  }

  private follow(cloud: Cloud): void {
    cloud.shadow.position.set(cloud.sprite.x + SHADOW_DX, cloud.sprite.y + SHADOW_DY);
  }

  update(dt: number): void {
    for (const cloud of this.clouds) {
      const d = cloud.speed * dt;
      const s = cloud.sprite;
      if (cloud.rightwards) {
        s.x += d;
        if (s.x > this.width + MARGIN) this.place(cloud, 0, Math.random());
      } else {
        s.x -= d;
        if (s.x < -MARGIN) this.place(cloud, 0, Math.random());
      }
      this.follow(cloud);
    }
  }

  resize(width: number, height: number): void {
    const ky = height / this.height;
    this.width = width;
    this.height = height;
    for (const cloud of this.clouds) {
      cloud.sprite.y *= ky;
      this.follow(cloud);
    }
  }

  destroy(): void {
    this.layer.destroy({ children: true });
    this.shadows.destroy({ children: true });
    this.clouds = [];
  }
}

const rand = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
