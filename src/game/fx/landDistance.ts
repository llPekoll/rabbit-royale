/**
 * How far every point of the sea is from the island, as a texture.
 *
 * The water shader's coastal steps — the land's shadow, the lip of surf, the
 * darkened open sea — all answer the same question: how far is this pixel from
 * the shore? That cannot be read back out of the rendered scene, because by
 * the time a filter runs the island is already drawn over the water and "is
 * this land" collapses into "is this a green pixel", which makes a dark cliff
 * face read as deep ocean.
 *
 * So the answer is computed from the MAP, before anything is drawn, and handed
 * to the shader as its own texture. Red is 0 on land and at the waterline,
 * rising to 1 out at sea.
 *
 * Green is the island's SILHOUETTE, blurred: 1 on land, 0 at sea, softened
 * over `blur` pixels. It exists for the cast shadow, which is not a distance
 * question at all — a shadow is the shape of the thing that casts it, moved.
 * Derived from the distance field the shadow copied every tooth of the
 * diamond staircase; thresholding a blurred coverage at 0.5 keeps the edge
 * where the coast is and rounds the teeth off, which is what "smooth" means.
 *
 * ## Why a chamfer pass rather than a true distance transform
 *
 * An exact euclidean distance field needs a proper algorithm (Felzenszwalb, or
 * jump flooding on the GPU). Two chamfer sweeps — one down-right, one up-left,
 * propagating each pixel's best-known distance to its neighbours — get within
 * a few percent of it for the cost of reading the image twice. At the scale
 * this is sampled (a soft falloff over a handful of tiles) that error is
 * invisible, and the whole texture is built once per island.
 */
import { Texture, ImageSource } from 'pixi.js';

/** Diagonal step cost, for the chamfer sweep. 1.41 is the usual approximation. */
const DIAG = 1.41421356;

export interface LandDistanceOptions {
  /**
   * Texels of the output per unit of the INPUT space.
   *
   * The input space is whatever `width`/`height` are given in — map cells when
   * the caller works in map space, screen pixels when it rasterises through
   * the projection. 0.25 means one texel per four input units.
   */
  resolution?: number;
  /**
   * How far the silhouette (green channel) is softened, in input units.
   *
   * Wide enough to round the isometric staircase — its steps are 12px tall —
   * and no wider, or the island's real corners start to melt too.
   */
  blur?: number;
  /**
   * How far the falloff reaches, in the SAME units as `width`/`height`.
   *
   * Stated in input units rather than in texels on purpose: it used to be
   * multiplied by `resolution`, which silently meant "map cells" and made a
   * caller working in screen pixels get a falloff a few pixels wide — the
   * whole sea then sat at 1.0 and every coastal step drew nothing.
   */
  reach?: number;
}

/**
 * Separable box blur, `passes` times over.
 *
 * Two passes of a box are close enough to a gaussian for a mask this small,
 * and the whole thing runs once per island on a texture a few hundred texels
 * across. Edges clamp, so the sea at the border stays sea.
 */
function boxBlur(src: Float32Array, w: number, h: number, r: number, passes: number): Float32Array {
  let a = Float32Array.from(src);
  let b = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const at = (x: number) => a[row + Math.min(w - 1, Math.max(0, x))];
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += at(x);
      for (let x = 0; x < w; x++) {
        b[row + x] = sum / n;
        sum += at(x + r + 1) - at(x - r);
      }
    }
    for (let x = 0; x < w; x++) {
      const at = (y: number) => b[Math.min(h - 1, Math.max(0, y)) * w + x];
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += at(y);
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / n;
        sum += at(y + r + 1) - at(y - r);
      }
    }
  }
  return a;
}

/**
 * Build the distance texture for a map.
 *
 * `isLand` is asked in MAP space, so the caller decides what counts as land —
 * the island passes `levelAt(map, x, y) > 0`, and a burrow could pass its own
 * walkable test without this needing to know either.
 */
export function landDistanceTexture(
  width: number,
  height: number,
  isLand: (x: number, y: number) => boolean,
  options: LandDistanceOptions = {},
): Texture {
  const res = options.resolution ?? 4;
  const reach = options.reach ?? 6;
  const blur = options.blur ?? 0;
  const w = Math.max(1, Math.ceil(width * res));
  const h = Math.max(1, Math.ceil(height * res));

  // Seed: 0 on land, "very far" everywhere else. `cov` is the same test as a
  // plain 0/1 coverage, kept separately because it gets blurred below and the
  // distance sweep needs the crisp version.
  const far = w + h;
  const d = new Float32Array(w * h).fill(far);
  const cov = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (isLand(Math.floor(x / res), Math.floor(y / res))) {
        d[y * w + x] = 0;
        cov[y * w + x] = 1;
      }
    }
  }

  // Forward sweep: every pixel takes the best of the neighbours already seen.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let best = d[i];
      if (x > 0) best = Math.min(best, d[i - 1] + 1);
      if (y > 0) best = Math.min(best, d[i - w] + 1);
      if (x > 0 && y > 0) best = Math.min(best, d[i - w - 1] + DIAG);
      if (x < w - 1 && y > 0) best = Math.min(best, d[i - w + 1] + DIAG);
      d[i] = best;
    }
  }
  // Backward sweep: the other half of the neighbourhood.
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let best = d[i];
      if (x < w - 1) best = Math.min(best, d[i + 1] + 1);
      if (y < h - 1) best = Math.min(best, d[i + w] + 1);
      if (x < w - 1 && y < h - 1) best = Math.min(best, d[i + w + 1] + DIAG);
      if (x > 0 && y < h - 1) best = Math.min(best, d[i + w - 1] + DIAG);
      d[i] = best;
    }
  }

  // To bytes. Normalised by `reach` so the shader's thresholds are in units of
  // "share of the falloff" rather than in pixels of whatever resolution this
  // happened to be built at. `reach` is in INPUT units, and the chamfer
  // counted texels, so it converts through `res` — the direction that
  // conversion goes is exactly what was wrong before.
  const span = Math.max(1, reach * res);
  const soft = blur > 0 ? boxBlur(cov, w, h, Math.max(1, Math.round(blur * res)), 2) : cov;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.min(1, d[i] / span);
    data[i * 4] = Math.round(v * 255);
    data[i * 4 + 1] = Math.round(soft[i] * 255);
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context for the land distance texture');
  ctx.putImageData(new ImageData(data, w, h), 0, 0);

  // Linear, not nearest: this is a FIELD, not art. Sampled nearest the falloff
  // comes out in visible steps and the surf lip turns back into a staircase —
  // the exact artefact the shader exists to avoid.
  return new Texture({
    source: new ImageSource({ resource: canvas, scaleMode: 'linear' }),
  });
}
