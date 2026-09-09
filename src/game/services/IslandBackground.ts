/**
 * The island backdrop: an animated video loop with a crisp PNG painted over it.
 *
 * Ported from the original Rabbit Royale's GameScene, extracted into its own
 * module because the scene there was 2200 lines and this part is reusable
 * verbatim. Two sprites, always transformed together:
 *
 *  - the VIDEO carries the motion (sea, volcano smoke) and nothing else;
 *  - the PNG overlay carries the sharpness. The loop is a compressed video and
 *    its codec artefacts smear exactly the pixel edges this game is drawn in,
 *    so the island itself is painted once, properly, with the moving parts left
 *    transparent for the video to show through.
 *
 * Anything that moves one and forgets the other tears the island off its own
 * water, which is why `layout()` sets both from one computation.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import gsap from 'gsap';

const VIDEO_WEBM = '/assets/island/Island Loop.webm';
const VIDEO_MP4 = '/assets/island/Island Loop.mp4';
const OVERLAY_URL = '/assets/island/Island_over_video.png';

/**
 * How much of the design space the island fills.
 *
 * The original drew the island at exactly the design size (960×540) around a
 * small 8×8 board. This grid is 16×16 — more than twice the span — so the
 * backdrop is ZOOMED past the canvas edges: the playable island grows to fill
 * the screen and the surrounding sea, which is only framing, is cropped away.
 * Bigger than ~1.9 and the volcano starts leaving the top of the frame.
 */
export const ISLAND_ZOOM = 1.75;

/** Width of the soft edge that hides the seam between video sea and background. */
const FADE_PX = 100;

export interface IslandBackground {
  /** Video and overlay, plus their masks. Added to the container given. */
  layout(centerX: number, centerY: number, zoom?: number): void;
  destroy(): void;
}

/**
 * Build the backdrop into `container`.
 *
 * Resolves once the first video frame has decoded — waiting only for metadata
 * leaves a race where Pixi uploads an empty black frame. A 2s timeout keeps a
 * hard network failure from hanging the boot; the overlay PNG alone still
 * renders a perfectly playable island.
 */
export async function createIslandBackground(
  container: Container,
  centerX: number,
  centerY: number,
): Promise<IslandBackground> {
  const video = document.createElement('video');
  // Prefer WebM (VP9): universally supported by modern browsers and free of the
  // proprietary H.264 decoder, which open-source Chromium builds lack.
  video.src = video.canPlayType('video/webm; codecs="vp9"') ? VIDEO_WEBM : VIDEO_MP4;
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.preload = 'auto';
  video.playbackRate = 0.667;

  await new Promise<void>((resolve) => {
    if (video.readyState >= 2 /* HAVE_CURRENT_DATA */) return resolve();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      video.removeEventListener('loadeddata', onLoad);
      video.removeEventListener('error', onErr);
    };
    const onLoad = () => { cleanup(); resolve(); };
    const onErr = () => {
      cleanup();
      console.warn('[island] video failed to load', video.error);
      resolve(); // proceed: the overlay PNG still draws the island
    };
    video.addEventListener('loadeddata', onLoad);
    video.addEventListener('error', onErr);
    timer = setTimeout(onLoad, 2000);
    video.load();
  });

  // Start playback BEFORE building the texture so Pixi's VideoSource sees an
  // already-playing element and wires its frame callbacks up from the start.
  video.play().catch(() => {
    const start = () => { void video.play(); document.removeEventListener('pointerdown', start); };
    document.addEventListener('pointerdown', start);
  });

  const nativeW = video.videoWidth || 960;
  const nativeH = video.videoHeight || 540;

  const videoTex = Texture.from({ resource: video, scaleMode: 'nearest' });
  videoTex.source.scaleMode = 'nearest';
  videoTex.source.autoGenerateMipmaps = false;

  const bg = new Sprite(videoTex);
  bg.anchor.set(0.5);
  bg.zIndex = -10;
  container.addChild(bg);

  // Feather all four edges so the video's ocean melts into the background
  // colour. An exact hex match between video sample and Graphics fill is
  // unreliable (video/WebGL colour transforms), so a soft fade is the robust
  // way to hide the seam.
  const maskTex = buildFadeMask(nativeW, nativeH);
  const bgMask = new Sprite(maskTex);
  bgMask.anchor.set(0.5);
  container.addChild(bgMask);
  bg.mask = bgMask;

  // The crisp island, over the video.
  let overlay: Sprite | null = null;
  let overlayMask: Sprite | null = null;
  const img = new Image();
  img.src = OVERLAY_URL;
  try {
    await img.decode();
  } catch {
    console.warn('[island] overlay failed to load; the video plays bare');
  }
  if (img.naturalWidth > 0) {
    const tex = Texture.from(img);
    tex.source.scaleMode = 'nearest';
    tex.source.autoGenerateMipmaps = false;
    overlay = new Sprite(tex);
    overlay.anchor.set(0.5);
    overlay.zIndex = -9.5;
    container.addChild(overlay);
    // A Pixi mask belongs to one object, so the overlay needs its own copy.
    overlayMask = new Sprite(maskTex);
    overlayMask.anchor.set(0.5);
    container.addChild(overlayMask);
    overlay.mask = overlayMask;
  }

  const sprites = () => [bg, bgMask, overlay, overlayMask].filter(Boolean) as Sprite[];

  const api: IslandBackground = {
    layout(cx, cy, zoom = ISLAND_ZOOM) {
      for (const s of sprites()) {
        s.position.set(cx, cy);
        s.width = nativeW * zoom;
        s.height = nativeH * zoom;
      }
    },
    destroy() {
      video.pause();
      video.src = '';
      for (const s of sprites()) s.destroy();
    },
  };

  api.layout(centerX, centerY);

  // Ease in rather than snapping: the video and its overlay fade together,
  // because fading them separately shows the blurry video alone for a moment.
  const fading = overlay ? [bg, overlay] : [bg];
  for (const s of fading) s.alpha = 0;
  gsap.to(fading, { alpha: 1, duration: 0.9, ease: 'power2.out' });

  return api;
}

/** An opaque centre with feathered edges, as a texture usable as a Pixi mask. */
function buildFadeMask(w: number, h: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, w, h);

  const addFade = (orientation: 'v' | 'h', span: number) => {
    const g = orientation === 'v'
      ? ctx.createLinearGradient(0, 0, 0, h)
      : ctx.createLinearGradient(0, 0, w, 0);
    const start = FADE_PX / span;
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(start, 'rgba(255,255,255,1)');
    g.addColorStop(1 - start, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  // destination-in keeps the INTERSECTION of both gradients: opaque centre,
  // feathered on all four sides.
  ctx.globalCompositeOperation = 'destination-in';
  addFade('v', h);
  addFade('h', w);
  ctx.globalCompositeOperation = 'source-over';

  return Texture.from(canvas);
}
