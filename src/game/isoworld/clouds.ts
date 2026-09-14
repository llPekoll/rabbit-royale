/**
 * Clouds drifting over the smooth island, with shadows on the ground.
 *
 * Two isometric clouds drawn for this island, in its sand and its ink. Each
 * one's silhouette is cast as its own shadow: flattened to the ground's
 * foreshortening, displaced by the cloud's height, and multiplied into
 * whatever it falls on — between the island and the cloud.
 *
 * Screen space, like the game's cloud field: clouds are nearer than the
 * island and do not zoom with it. They cross the whole frame — the island
 * is not being read for numbers here — and wrap round.
 */
import { Assets, Container, Sprite, Texture } from 'pixi.js';

const CLOUD_URLS = ['/assets/world/iso-cloud-01.png', '/assets/world/iso-cloud-02.png'];

/** How many cross the frame, and how they vary. */
const COUNT = 7;
const SCALE_RANGE = [0.8, 1.6] as const;
const SPEED_RANGE = [6, 16] as const;
/** Off-frame room, enough to hide the widest cloud. */
const MARGIN = 450;

/** The shadow: where it falls relative to its cloud, how flat, how dark. */
const SHADOW_DX = 24;
const SHADOW_DY = 150;
const SHADOW_FLATTEN = 0.55;
const SHADOW_TINT = 0x9cb39c;
const SHADOW_ALPHA = 0.65;

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
