/**
 * The island's painted ground.
 *
 * One sprite, chosen by SEED from the three paintings in public/assets/island.
 * Three rather than one so two islands in a session do not look like the same
 * place with the tiles moved, and chosen from the seed rather than at random so
 * the server and the client land on the same picture without it crossing the
 * wire — the same trick the coastline uses.
 *
 * There WAS a video loop under this (drifting sea, volcano smoke) inherited
 * from the original Rabbit Royale. It is gone: the paintings carry their own
 * water, so the video was a second full-screen layer drawn under one that
 * already covered it — pure overdraw, plus a decoded frame uploaded to the GPU
 * every frame, on a phone. The sky's motion now comes from the clouds.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';
import { seedFrom } from '@/lib/game/rng';

/** The ground each island is drawn on, picked by seed. */
const LANDS = [
  '/assets/island/land1.webp',
  '/assets/island/land2.webp',
  '/assets/island/land3.webp',
] as const;

/** The design canvas the ground has to cover. */
const DESIGN_W = 960;
const DESIGN_H = 540;

/** Guarded: this runs before the first resize, and a zero collapses the sprite. */
const defaultViewport = () => ({
  width: (typeof window === 'undefined' ? 0 : window.innerWidth) || DESIGN_W,
  height: (typeof window === 'undefined' ? 0 : window.innerHeight) || DESIGN_H,
});

/**
 * How far the ground is zoomed past the frame.
 *
 * The paintings are small crops (~300px wide), so they are already upscaled to
 * cover the canvas; this is on top of that. Kept at 1 — the board is drawn to
 * fit the canvas, and enlarging the ground further only pushes its features
 * out of view.
 */
export const ISLAND_ZOOM = 1;

export interface IslandBackground {
  layout(centerX: number, centerY: number, zoom?: number): void;
  destroy(): void;
}

/** Which painting a seed lands on. Exported so a story can label itself. */
export const landForSeed = (seed: string) => LANDS[seedFrom(seed) % LANDS.length];

/**
 * Paint the ground into `container`.
 *
 * Resolves once the image has decoded, so the board is never built over an
 * empty frame. A failure is survivable: the tiles and the sky still draw, and
 * the scene is playable on the flat background colour.
 */
export async function createIslandBackground(
  container: Container,
  centerX: number,
  centerY: number,
  /** The island's seed. Decides which of the three grounds is painted. */
  seed?: string,
  /** The renderer's live size in CSS pixels. Defaults to the window, which is
   *  right when nothing else shares the screen. */
  viewport: () => { width: number; height: number } = defaultViewport,
): Promise<IslandBackground> {
  const img = new Image();
  img.src = seed ? landForSeed(seed) : LANDS[0];
  try {
    await img.decode();
  } catch {
    console.warn('[island] ground failed to load; playing on the flat sea colour');
  }

  const tex = Texture.from(img);
  tex.source.scaleMode = 'nearest';
  tex.source.autoGenerateMipmaps = false;

  const ground = new Sprite(tex);
  ground.anchor.set(0.5);
  // Under every tile (tile depth starts at 0) and under the clouds at -9.
  ground.zIndex = -10;
  container.addChild(ground);

  const nativeW = img.naturalWidth || DESIGN_W;
  const nativeH = img.naturalHeight || DESIGN_H;

  const api: IslandBackground = {
    layout(cx, cy, zoom = ISLAND_ZOOM) {
      // Cover the CANVAS, not the design box and not the window.
      //
      // The design space is 960x540 and the root scales it to FIT, so on any
      // canvas that is not 16:9 there is bare space left over — it showed as a
      // flat blue band under the island. The window is the wrong thing to
      // measure too: the season board takes 330px of it on a wide screen, so
      // the renderer is narrower than `innerWidth` and the ground came out
      // sized for a box it does not occupy.
      //
      // `viewport()` is injected so this stays testable and so it can be told
      // the truth by whoever owns the renderer.
      const { width: vw, height: vh } = viewport();
      const rootScale = Math.min(vw / DESIGN_W, vh / DESIGN_H);
      // What the canvas measures in DESIGN units after that scale.
      const needW = vw / rootScale;
      const needH = vh / rootScale;

      const cover = Math.max(needW / nativeW, needH / nativeH) * zoom;
      ground.position.set(cx, cy);
      ground.width = nativeW * cover;
      ground.height = nativeH * cover;
    },
    destroy() {
      ground.destroy();
    },
  };

  api.layout(centerX, centerY);

  // Ease in rather than snapping: the board drops onto it a moment later.
  ground.alpha = 0;
  gsap.to(ground, { alpha: 1, duration: 0.9, ease: 'power2.out' });

  return api;
}
