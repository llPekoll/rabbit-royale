/**
 * The island's cast shadow, taken from the island itself.
 *
 * A cast shadow is the shape of the thing that casts it, softened and moved.
 * The obvious way to get that shape is to COMPUTE it from the map, and that is
 * what the water shader did for a whole afternoon: rasterise the land through
 * the inverse isometric projection, per tier, with the block sides, from the
 * stage origin, at a chosen resolution. Every one of those clauses was a bug
 * at some point — a shadow offset by a plateau's height, a gap under the
 * shore where a phantom side sat, a dark staircase under every cliff where
 * the sides had been left out — because each is a place where a hand-built
 * mask can disagree with the art.
 *
 * So this does not compute anything. It RENDERS the island's ground into a
 * texture, and that texture is the silhouette: same pixels, same coordinates,
 * same tiers and sides, by construction. Blurring it rounds the diamond
 * staircase; tinting it makes it dark; moving it down makes it a shadow.
 * Three standard Pixi operations and no shader of our own.
 *
 * Only the ground is rendered — trees, sheep and props are kept out of the
 * source by the caller (`decoLayer`), since a pine's canopy does not throw a
 * shadow on the sea twelve pixels below its roots.
 *
 * ## The same machine draws the land edge
 *
 * Step 4 of the reference is a dark line hugging the coast, rippling with the
 * water. That is this object with three dials moved: no offset, almost no
 * blur, and `grow` a pixel or two so the silhouette pokes out from under the
 * island instead of hiding beneath it. Making it a second shadow rather than
 * a new effect keeps one alignment story for both — and alignment is where
 * every earlier attempt at either of them died.
 */
import {
  BlurFilter, ColorMatrixFilter, Container, DisplacementFilter, RenderTexture,
  Sprite, Texture, type Renderer,
} from 'pixi.js';

export interface IslandShadowOptions {
  /** Where the shadow lands, in pixels. +y is down the screen. */
  dx?: number;
  dy?: number;
  /**
   * How far the silhouette is softened — Pixi's BlurFilter `strength`, which
   * is NOT a pixel radius: at quality 4 a strength of 4 already spreads an
   * edge over roughly 12px, and 12 smeared the whole shadow into a 40px haze
   * that read as nothing at all over dark water. The isometric staircase has
   * 12px steps, so 4 is where the teeth round off and the band still holds.
   */
  blur?: number;
  /** How dark the shadow is, 0 to 1. */
  alpha?: number;
  /** The shadow's colour. Multiplied into the silhouette, so black is black. */
  color?: number;
  /**
   * Draw only the silhouette's RIM, this many pixels thick. 0 draws the fill.
   *
   * This is how the land edge is made, and it is drawn rather than composited
   * on purpose. The obvious construction — grow the shape, punch the original
   * out of it — needs the hole to actually appear, and neither
   * `blendMode: 'erase'` nor `setMask({ inverse: true })` cut one here:
   * measured, both left a solid slab whose centre was still opaque. Stamping
   * the silhouette in a ring of directions and keeping the union is dumber,
   * has no composition mode to go wrong, and gives an outline whose thickness
   * is exactly this number.
   */
  outline?: number;
  /**
   * AMPLITUDE: how far the shadow's edge ripples, in pixels. 0 is still.
   *
   * Water does not hold a crisp outline: the same swell that moves the surface
   * moves what is projected on it. Without this the shadow is a decal — the
   * right shape, but visibly pasted on.
   */
  wobble?: number;
  /**
   * FREQUENCY: how long one ripple is, in pixels of shadow — the wavelength.
   *
   * Amplitude and frequency are separate dials because they are separate
   * mistakes. The first version baked the wavelength into the noise texture
   * (sines at 2 and 3 periods across 64px), so the only control was amplitude
   * and every ripple came out short and busy however it was tuned — "trop
   * rapprochées". Here the texture stays one period and this stretches it, so
   * a long ocean swell and a choppy ripple are both reachable.
   */
  wobbleLength?: number;
  /**
   * How fast the ripple travels, in cycles per second.
   *
   * Very low on purpose: the default 0.02 is one crossing every fifty seconds,
   * which reads as the sea breathing rather than as the shadow shimmering.
   * Anything above ~0.2 starts to look like a glitch on a shape this large.
   */
  wobbleSpeed?: number;
}

export interface IslandShadow {
  /** Add this UNDER the island, in the same parent, at the same origin. */
  readonly sprite: Sprite;
  /** Advance the ripple. `deltaMs` is real milliseconds. A no-op at wobble 0. */
  update(deltaMs: number): void;
  /** Re-set the ripple's amplitude, in pixels. */
  setWobble(px: number): void;
  /** Re-set the ripple's wavelength, in pixels. */
  setWobbleLength(px: number): void;

  /** Move the shadow. */
  setOffset(dx: number, dy: number): void;
  /** Re-soften. */
  setBlur(px: number): void;
  /** Re-darken. */
  setAlpha(alpha: number): void;
  /** Free the texture. The caller owns the sprite's parent. */
  destroy(): void;
}

/**
 * Render `ground` into a silhouette and dress it as a shadow.
 *
 * `ground` is rendered as it stands — its own position is honoured, so hand
 * over a container whose (0,0) is where the sprite's (0,0) should be. The
 * texture is padded by the blur radius on every side so the softened edge has
 * room and is not clipped flat at the island's bounding box.
 */
export function createIslandShadow(
  renderer: Renderer,
  ground: Container,
  width: number,
  height: number,
  options: IslandShadowOptions = {},
): IslandShadow {
  const o = {
    // Tuned against the reference on 2026-09-12 and kept here, not in the
    // story: the game gets the same shadow the story showed, and the story is
    // then only overriding what a story is for — one dial at a time.
    dx: 11, dy: 21, blur: 5.5, alpha: 0.45, color: 0x1d6376, outline: 0,
    wobble: 9.5, wobbleLength: 296, wobbleSpeed: 0.02, ...options,
  };

  // Padding is sized for the LARGEST blur the sprite may be asked for, not
  // the initial one: the texture is rendered once, and a later `setBlur`
  // beyond the padding would clip the softened edge against the texture's
  // border and put a hard line back exactly where the softness matters.
  const pad = Math.ceil(MAX_BLUR * 2);

  const rt = RenderTexture.create({ width: width + pad * 2, height: height + pad * 2 });
  // Render through a wrapper so the ground's own transform is untouched: it
  // is going back into the scene afterwards, at whatever position it had.
  const wrap = new Container();
  const parent = ground.parent;
  const index = parent ? parent.getChildIndex(ground) : -1;
  wrap.addChild(ground);
  // FLATTEN TO WHITE before rendering, keeping alpha.
  //
  // `tint` multiplies, and the silhouette is the island's real pixels — grass,
  // rock, everything. Tinting that mint gave `green x mint = olive`, which is
  // exactly the "why is my foam khaki" this produced. A colour matrix that
  // sends every channel to 1 leaves a pure white stencil, and a multiply
  // against white is the tint itself.
  const whiten = new ColorMatrixFilter();
  whiten.matrix = [
    0, 0, 0, 0, 1,
    0, 0, 0, 0, 1,
    0, 0, 0, 0, 1,
    0, 0, 0, 1, 0,
  ];
  wrap.filters = [whiten];
  if (o.outline > 0) {
    // Sixteen offset copies of the silhouette, drawn opaque, union'd.
    //
    // Deliberately not the obvious construction (grow the shape, punch the
    // original out of it): neither `blendMode: 'erase'` nor
    // `setMask({ inverse: true })` cuts a hole here — both were tried and
    // measured, and both left a solid slab with an opaque centre. A union of
    // offset copies has no composition mode that can fail silently.
    //
    // They are drawn at FULL alpha on purpose. Fading each to 1/steps so the
    // overlaps would average was the next thing tried, and it erased the ring
    // altogether: the copies do not recombine, they just each contribute a
    // sixteenth. The visible cost of full alpha is that the ring is a hard
    // white union rather than a soft band — which is what `blur` is for.
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      wrap.position.set(
        pad + Math.cos(a) * o.outline,
        pad + Math.sin(a) * o.outline,
      );
      renderer.render({ container: wrap, target: rt, clear: i === 0 });
    }
  } else {
    wrap.position.set(pad, pad);
    renderer.render({ container: wrap, target: rt });
  }
  wrap.filters = [];
  wrap.removeChild(ground);
  if (parent) parent.addChildAt(ground, index);

  const sprite = new Sprite(rt);
  sprite.tint = o.color;
  sprite.alpha = o.alpha;

  // Displacement BEFORE blur, so the ripple is softened along with the edge it
  // moves. The other order ripples an already-soft edge, which reads as the
  // whole shadow sliding rather than as its outline breathing.
  // ONE period in the texture; the wavelength comes from scaling the sprite.
  const noise = rippleTexture();
  const ripple = new Sprite(noise);
  ripple.texture.source.addressMode = 'repeat';
  const setLength = (px: number) => {
    const k = Math.max(1, px) / noise.width;
    ripple.scale.set(k, k);
  };
  setLength(o.wobbleLength);
  const displace = new DisplacementFilter({ sprite: ripple, scale: o.wobble });
  const blur = new BlurFilter({ strength: o.blur, quality: 4 });
  sprite.filters = [displace, blur];
  // The displacement map is read through this sprite, so it has to be in the
  // scene to have a transform — but it must never be drawn. Parented to the
  // shadow and made invisible: Pixi still evaluates its transform.
  ripple.visible = false;
  sprite.addChild(ripple);

  let elapsed = 0;

  const place = (dx: number, dy: number) => sprite.position.set(dx - pad, dy - pad);
  place(o.dx, o.dy);

  return {
    sprite,
    setOffset: place,
    setBlur: (px) => { blur.strength = Math.min(px, MAX_BLUR); },
    setAlpha: (alpha) => { sprite.alpha = alpha; },
    setWobble: (px) => { displace.scale.set(px, px); },
    setWobbleLength: setLength,
    update: (deltaMs) => {
      if (displace.scale.x === 0) return;
      elapsed += deltaMs / 1000;
      // The map SCROLLS rather than being redrawn: one small repeating texture
      // dragged across the shadow is a moving swell, and it costs a transform
      // per frame instead of a texture upload.
      // Scrolled by one WAVELENGTH, not one texel width: the map is scaled
      // now, so travelling its unscaled size would jump mid-swell.
      const span = noise.width * ripple.scale.x;
      ripple.x = Math.sin(elapsed * o.wobbleSpeed * TAU) * span;
      ripple.y = Math.cos(elapsed * o.wobbleSpeed * 0.73 * TAU) * span;
    },
    destroy: () => {
      sprite.destroy({ children: true });
      noise.destroy(true);
      rt.destroy(true);
    },
  };
}

const TAU = Math.PI * 2;

/**
 * The displacement map: smooth, tiling, two-channel noise.
 *
 * Red displaces on X and green on Y, and the two are given different PHASES —
 * identical ones make every point travel the same diagonal and the shadow
 * shears instead of rippling. Sines rather than value noise because this has
 * to TILE seamlessly (it is scrolled forever), and a sine over exactly one
 * period does that for free.
 *
 * Exactly ONE period, so the caller owns the wavelength: the sprite is scaled
 * to stretch this to whatever `wobbleLength` asks for.
 */
function rippleTexture(size = 64): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Texture.WHITE;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * TAU;
      const v = (y / size) * TAU;
      const dx = Math.sin(u + v * 0.5) * 0.7 + Math.sin(v) * 0.3;
      const dy = Math.cos(v - u * 0.5) * 0.7 + Math.cos(u) * 0.3;
      const i = (y * size + x) * 4;
      // 128 is "no displacement"; the filter reads the offset from mid-grey.
      img.data[i] = 128 + dx * 127;
      img.data[i + 1] = 128 + dy * 127;
      img.data[i + 2] = 0;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return Texture.from(canvas);
}

/** The most blur `setBlur` will honour; see the padding note above. */
const MAX_BLUR = 40;
