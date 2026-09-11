/**
 * Making something see-through the way pixel art does it: by REMOVING PIXELS.
 *
 * The island already fades whatever the rabbit is standing behind — a pine is
 * three cells tall and the player ends up inside the trunk, so the trunk goes
 * to `fadeTo` and you can see who is back there (`blocking.ts`). That works,
 * and it looks like a PNG with its opacity slider pulled down: every pixel of
 * the tree goes equally milky, the grass behind shows through everywhere at
 * once, and nothing about it belongs to a game drawn at 64px with a fixed
 * palette. A pixel has no half — the medium's whole grammar is that a pixel is
 * either there or it is not.
 *
 * So this filter does not lower alpha. It KEEPS OR DROPS each pixel, and
 * decides which with an ordered dither: the classic Bayer matrix, the same one
 * that let four-colour machines paint gradients. Pixels vanish in the matrix's
 * fixed order, so at 40% dissolved the same 40% of the pattern is always the
 * part that went — a stable stipple, never noise crawling over the sprite.
 *
 * ## Why the threshold is compared in SCREEN space
 *
 * The matrix is sampled at `gl_FragCoord`, not at the texture coordinate, and
 * that is the load-bearing decision. Sampled in texture space the pattern is
 * glued to the sprite: it scales with it, and a tree drawn at `decoScale` 0.7
 * carries a squashed 3-pixel checker that reads as a JPEG artefact. Sampled in
 * screen space the stipple is the SCREEN's own grid — the dots stay square and
 * one device-pixel-block wide no matter how the sprite is scaled, which is what
 * makes it read as the picture being made of pixels rather than as a texture
 * painted onto the tree.
 *
 * `uPixelSize` is how many device pixels one dither dot spans. The canvas is
 * rendered at up to 2x (see `Application.ts`) and `image-rendering: pixelated`
 * blows that up again, so a dot of 1 comes out finer than any art pixel on
 * screen and shimmers. Matching it to the on-screen size of an art pixel is
 * what makes the holes look punched out of the sprite itself.
 *
 * ## The edge
 *
 * Dissolving to a flat 40% leaves a tree that is uniformly moth-eaten, which
 * reads as damage rather than as transparency. Real dissolve shaders (the ones
 * the reference footage shows eating a hole through a wall) drive the
 * threshold from a MASK, so the hole opens where you want it and the rest of
 * the wall stays solid. `uHole` is that mask, in screen pixels: a disc centred
 * on `uHoleCenter` with radius `uHoleRadius`, soft over `uHoleFeather`, inside
 * which the sprite dissolves and outside which it is untouched.
 *
 * Set `holeRadius` to 0 and the whole sprite dissolves evenly, which is the
 * simple mode and what a bush wants. Point the hole at the rabbit and the tree
 * opens a window exactly where the player is standing, which is what the eye
 * actually wants from occlusion: see the player, keep the tree.
 */
import { Filter, GlProgram } from 'pixi.js';

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

/**
 * The 4x4 ordered Bayer matrix, computed rather than looked up.
 *
 * The obvious way to write this is the sixteen numbers every dithering
 * reference prints, as a `const float[16]` indexed by the cell. That does not
 * compile here: Pixi 8 hands WebGL1 contexts a GLSL ES 1.00 shader, where
 * array constructors do not exist AND an array may only be indexed by a
 * constant or a loop counter — so the table is rejected twice over, and the
 * failure is a black sprite with the error only in the console.
 *
 * The bit-twiddling identity below is the standard way out, and it is the
 * matrix, not an approximation of it: the Bayer value at (x, y) is the bits of
 * `y XOR x` and the bits of `y` interleaved. Written with mod and floor
 * because GLSL ES 1.00 has no integer bit operators either.
 *
 * 4x4 rather than 8x8 on purpose: 8x8 resolves finer gradients, but its cell
 * is 8 screen dots across and at this art's scale that is wider than a tree
 * trunk — the pattern stops reading as texture and starts reading as stripes.
 */
const BAYER_4X4 = `
/** The ordered-dither threshold for a cell, in 0..1. */
float bayer4(vec2 cell) {
    // Bit 0 and bit 1 of each coordinate, as floats.
    float x = mod(cell.x, 4.0);
    float y = mod(cell.y, 4.0);
    float x0 = mod(x, 2.0);
    float x1 = floor(x / 2.0);
    float y0 = mod(y, 2.0);
    float y1 = floor(y / 2.0);
    // XOR of two bits, without an integer XOR: a + b - 2ab.
    float a1 = y1 + x1 - 2.0 * y1 * x1;
    float a0 = y0 + x0 - 2.0 * y0 * x0;
    // Interleaved LOW bit first, which is the half that is easy to get
    // backwards: the most significant bit of a Bayer value comes from the
    // LEAST significant bit of the coordinates. Reversing the two produces a
    // matrix holding the same sixteen numbers in the wrong places — still a
    // plausible-looking stipple, so the eye does not catch it; it just
    // dissolves the wrong pixels first.
    float v = a0 * 8.0 + y0 * 4.0 + a1 * 2.0 + y1;
    return (v + 0.5) / 16.0;
}
`;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;

/** 0 = untouched, 1 = every pixel gone. */
uniform float uAmount;
/** How many device pixels one dither dot spans. */
uniform float uPixelSize;
/** Where the hole is centred, in device pixels from the canvas top-left. */
uniform vec2 uHoleCenter;
/** Radius of full dissolve, in device pixels. 0 dissolves the whole sprite. */
uniform float uHoleRadius;
/** How far past the radius the dissolve falls back to nothing. */
uniform float uHoleFeather;
/** Tint applied to the pixels that SURVIVE at the hole's rim. */
uniform vec3 uEdgeColor;
/** How strongly the rim is tinted, 0 for none. */
uniform float uEdgeStrength;
/** 1 samples the matrix in TEXTURE space — the bug, kept switchable. */
uniform float uSticky;
// A nominal sprite size in pixels, used ONLY by the sticky (texture-space)
// mode to turn a 0..1 texture coordinate back into something pixel-shaped.
//
// Pixi publishes the real figure as the uInputSize global, and reading it here
// is the obvious move — but redeclaring it in the fragment shader gives it a
// different default precision from Pixi's own declaration in the vertex
// shader, and the program then fails to LINK: "Precisions of uniform
// 'uInputSize' differ". The whole filter goes black, with the reason only in a
// console warning. The sticky path is a debug control, so an approximate size
// handed in from TypeScript buys exactness nothing and avoids the clash.
uniform vec2 uSpriteSize;
// Pixi's own global: xy is where THIS filter pass sits inside the canvas, in
// device pixels, and zw is the canvas size.
//
// This is the uniform that makes the hole land on the sprite at all. A filter
// does not render to the canvas — it renders into a temporary texture cut to
// the sprite's bounds — so gl_FragCoord counts from the corner of THAT, not
// from the corner of the screen. Comparing a canvas-space hole centre against
// it directly put the hole wherever the sprite happened to be in the atlas,
// which read as "the whole tree dissolves" rather than as a window: the
// mismatch is usually large enough that the disc misses the sprite entirely
// and every pixel takes the full amount.
//
// Adding the pass offset back is what returns gl_FragCoord to canvas space.
uniform vec4 uGlobalFrame;

${BAYER_4X4}

void main() {
    vec4 color = texture(uTexture, vTextureCoord);
    // Nothing to dissolve where the sprite is already empty. Cheap, and it
    // keeps the edge tint below from lighting up the transparent margin that
    // every sheet-cut sprite carries around its art.
    if (color.a <= 0.001) {
        finalColor = color;
        return;
    }

    // This pixel's position on the CANVAS, which is the space the hole centre
    // is given in — see the note on uGlobalFrame above.
    vec2 canvasPos = gl_FragCoord.xy + uGlobalFrame.xy;

    // How much this pixel is asked to dissolve. Outside the hole: nothing.
    float local = uAmount;
    if (uHoleRadius > 0.0) {
        float d = distance(canvasPos, uHoleCenter);
        // 1 at the centre, easing to 0 by radius + feather. smoothstep runs
        // high-to-low here because the far edge is the ZERO one.
        float inside = 1.0 - smoothstep(uHoleRadius, uHoleRadius + uHoleFeather, d);
        local = uAmount * inside;
    }

    if (local <= 0.0) {
        finalColor = color;
        return;
    }

    // The dither cell this pixel falls in, in SCREEN space — see the note at
    // the top of the file: this is what keeps the dots square and sprite-scale
    // independent. The sticky branch is the bug, on purpose: sampling in
    // texture space glues the pattern to the sprite so it scales with it.
    // Canvas space here too, not gl_FragCoord: the filter's temporary texture
    // is re-cut as the sprite's bounds change (a swaying tree changes size by
    // a pixel between frames), and a pattern anchored to that texture's corner
    // would slide by the difference every frame — a stipple that crawls, which
    // is the exact failure ordered dithering is chosen to avoid.
    vec2 pixel = mix(canvasPos, vTextureCoord * uSpriteSize, uSticky);
    vec2 cell = floor(pixel / max(uPixelSize, 1.0));
    float threshold = bayer4(cell);

    // The cut. No blending: the pixel is kept whole or dropped whole, which is
    // the entire reason this exists instead of an alpha multiply.
    if (local > threshold) {
        finalColor = vec4(0.0);
        return;
    }

    // Surviving pixels near the cut get the rim tint, so the hole has a lit
    // edge instead of just petering out. local/threshold is how close this
    // pixel came to being dropped: 1 right at the cut, falling away from it.
    if (uEdgeStrength > 0.0) {
        float proximity = smoothstep(0.55, 1.0, local / threshold);
        // Premultiplied: Pixi's filter pipeline works in premultiplied alpha,
        // so the tint has to be scaled by the pixel's own alpha or the fringe
        // of a soft-edged sprite glows brighter than its solid middle.
        color.rgb = mix(color.rgb, uEdgeColor * color.a, proximity * uEdgeStrength);
    }

    finalColor = color;
}
`;

export interface DissolveOptions {
  /** Share of pixels removed, 0..1. */
  amount?: number;
  /** Device pixels per dither dot. */
  pixelSize?: number;
  /** Radius of the dissolved disc, in CSS pixels. 0 dissolves everything. */
  holeRadius?: number;
  /** Softness past the radius, in CSS pixels. */
  holeFeather?: number;
  /** Rim colour, as `0xrrggbb`. */
  edgeColor?: number;
  /** Rim strength, 0..1. */
  edgeStrength?: number;
  /** Sample the dither in texture space — the bug, for A/B only. */
  sticky?: boolean;
}

const DEFAULTS = {
  amount: 0,
  pixelSize: 2,
  holeRadius: 0,
  holeFeather: 24,
  edgeColor: 0xfff0b0,
  edgeStrength: 0.5,
  sticky: false,
} as const;

/**
 * A dithered dissolve, as a Pixi filter.
 *
 * Put it on the thing that HIDES the player, not on the player. The sprite
 * keeps its silhouette, its animation and its place in the draw order; only
 * some of its pixels stop being drawn.
 *
 * ```ts
 * const dissolve = new DissolveFilter({ holeRadius: 40 });
 * tree.filters = [dissolve];
 * dissolve.amount = 0.7;
 * dissolve.pointAt(rabbit, app);   // every frame the rabbit moves
 * ```
 */
export class DissolveFilter extends Filter {
  /** CSS-pixel geometry, kept so `resolution` changes can be reapplied. */
  private cssHoleRadius: number;
  private cssHoleFeather: number;
  private pixelRatio = 1;

  constructor(options: DissolveOptions = {}) {
    const o = { ...DEFAULTS, ...options };
    super({
      glProgram: GlProgram.from({ vertex, fragment }),
      resources: {
        dissolveUniforms: {
          uAmount: { value: o.amount, type: 'f32' },
          uPixelSize: { value: o.pixelSize, type: 'f32' },
          uHoleCenter: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
          uHoleRadius: { value: 0, type: 'f32' },
          uHoleFeather: { value: 0, type: 'f32' },
          uEdgeColor: { value: new Float32Array(rgb(o.edgeColor)), type: 'vec3<f32>' },
          uEdgeStrength: { value: o.edgeStrength, type: 'f32' },
          uSticky: { value: o.sticky ? 1 : 0, type: 'f32' },
          uSpriteSize: { value: new Float32Array([64, 64]), type: 'vec2<f32>' },
        },
      },
    });
    this.cssHoleRadius = o.holeRadius;
    this.cssHoleFeather = o.holeFeather;
    this.applyGeometry();
  }

  private get u() {
    return this.resources.dissolveUniforms.uniforms as {
      uAmount: number;
      uPixelSize: number;
      uHoleCenter: Float32Array;
      uHoleRadius: number;
      uHoleFeather: number;
      uEdgeColor: Float32Array;
      uEdgeStrength: number;
      uSticky: number;
      uSpriteSize: Float32Array;
    };
  }

  /** Share of pixels removed, 0..1. */
  get amount(): number { return this.u.uAmount; }
  set amount(v: number) { this.u.uAmount = clamp01(v); }

  /** Device pixels per dither dot. */
  get pixelSize(): number { return this.u.uPixelSize; }
  set pixelSize(v: number) { this.u.uPixelSize = Math.max(1, v); }

  /** Radius of the dissolved disc, in CSS pixels. 0 dissolves the sprite whole. */
  get holeRadius(): number { return this.cssHoleRadius; }
  set holeRadius(v: number) { this.cssHoleRadius = Math.max(0, v); this.applyGeometry(); }

  /** Softness past the radius, in CSS pixels. */
  get holeFeather(): number { return this.cssHoleFeather; }
  set holeFeather(v: number) { this.cssHoleFeather = Math.max(0, v); this.applyGeometry(); }

  get edgeStrength(): number { return this.u.uEdgeStrength; }
  set edgeStrength(v: number) { this.u.uEdgeStrength = clamp01(v); }

  set edgeColor(hex: number) { this.u.uEdgeColor.set(rgb(hex)); }

  /** Sample the dither in texture space instead of screen space — the bug. */
  get sticky(): boolean { return this.u.uSticky > 0.5; }
  set sticky(v: boolean) { this.u.uSticky = v ? 1 : 0; }

  /**
   * The sprite's size in pixels, for the sticky mode only.
   *
   * Ignored entirely in the normal (screen-space) path, which is why it is a
   * setter nobody has to call rather than a constructor argument: getting it
   * wrong can only change what the debug comparison looks like.
   */
  setSpriteSize(width: number, height: number): void {
    this.u.uSpriteSize[0] = Math.max(1, width);
    this.u.uSpriteSize[1] = Math.max(1, height);
  }

  /**
   * Put the hole over a point given in CSS pixels from the canvas's top-left.
   *
   * Two conversions, and both are easy to get wrong:
   *
   *   - the shader reads `gl_FragCoord`, which counts DEVICE pixels, so a
   *     canvas at resolution 2 needs the point doubled. Skip it and the hole
   *     sits at half the distance from the corner, which looks like an
   *     off-by-a-bit offset rather than like a unit mistake.
   *   - `gl_FragCoord.y` counts from the BOTTOM. Skip the flip and the hole
   *     tracks the player mirrored about the canvas's middle — the further the
   *     rabbit walks down, the further up the hole goes.
   *
   * `canvasHeight` is in CSS pixels: the same number the renderer's `screen`
   * reports, not the backing store's.
   */
  pointAtCanvas(x: number, y: number, canvasHeight: number): void {
    const r = this.pixelRatio;
    this.u.uHoleCenter[0] = x * r;
    this.u.uHoleCenter[1] = (canvasHeight - y) * r;
  }

  /**
   * The pixel ratio the canvas renders at, so CSS-pixel radii come out right.
   *
   * Call it once with `app.renderer.resolution`. Left at 1 on a 2x display the
   * hole is drawn at half the size asked for — which reads as "the effect is
   * too small" and sends you tuning the radius instead of the units.
   */
  setResolution(resolution: number): void {
    this.pixelRatio = Math.max(0.01, resolution);
    this.applyGeometry();
  }

  private applyGeometry(): void {
    this.u.uHoleRadius = this.cssHoleRadius * this.pixelRatio;
    this.u.uHoleFeather = this.cssHoleFeather * this.pixelRatio;
  }
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const rgb = (hex: number): [number, number, number] => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];
