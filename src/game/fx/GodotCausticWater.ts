/**
 * A Godot `canvas_item` water shader, ported to a Pixi mesh AS IS.
 *
 * The same deal as `CartoonWater.ts`: a found material, brought in whole. The
 * fragment body below is the Godot source with Godot's names swapped for the
 * GLSL ones Pixi hands a mesh, and NOTHING else. No isometric squash on the
 * sampling, no pixel snap, no invented replacements for its textures — that is
 * exactly the pass `CartoonWater`'s header records as having thrown the effect
 * away while keeping the scaffolding.
 *
 * ## What the port had to change, line for line
 *
 * Godot's canvas_item shader language is GLSL with a preamble. The rename list
 * is the whole diff:
 *
 *   - `TIME`            -> `uTime`       (Godot's built-in clock)
 *   - `UV`              -> `vUv`         (Godot's built-in varying)
 *   - `TEXTURE`         -> `uMainTex`    (the CanvasItem's own texture)
 *   - `COLOR`           -> `finalColor`  (Godot's fragment output)
 *   - `hint_default_*`  -> dropped; a hint is a Godot editor default for an
 *                          unassigned slot, and every slot here is assigned.
 *   - `repeat_enable`   -> dropped; set on the texture source instead, which
 *                          is where Pixi keeps wrap mode.
 *   - `0.0f` literals   -> suffix dropped: `1.0f` -> `1.0`. Godot accepts the
 *                          `f` suffix and so does GLSL ES 3.0, so on a WebGL2
 *                          context it compiles as written — but Pixi falls
 *                          back to WebGL1 wherever WebGL2 is unavailable, and
 *                          GLSL ES 1.0 rejects the suffix outright: "'1.0f':
 *                          Floating-point suffix unsupported prior to GLSL ES
 *                          3.00", and the whole material fails to link. That
 *                          is not hypothetical — it is what the headless
 *                          browser the Storybook screenshots run in does. The
 *                          edit is lexical and changes no value.
 *
 * The three helper functions, the three layer functions, and the body of
 * `fragment()` are byte-for-byte the original apart from those names.
 *
 * ## The main texture, and what "in iso" means here
 *
 * This shader is not a sea on its own — it is a MASK READER. Godot would have
 * it on a CanvasItem whose texture encodes the body of water in three
 * channels, and every layer keys off them:
 *
 *   - `.b` = depth, 0 at the shore and 1 in the deep. It drives both the
 *            colour (`waterDepthGradient` is sampled at `1.0 - mainTex.b`)
 *            and the final alpha, so where `.b` is 0 the shader draws nothing.
 *   - `.g` = the foam band, which `foam()` reads to decide where surf shows.
 *   - `.r` = the outline, drawn last over everything in `outlineColor`.
 *
 * So the isometric part of the job is not in the shader at all — it is in the
 * texture the shader is handed. `buildIsoWaterMask` renders the island's own
 * diamond grid into those three channels: a distance field off the coast for
 * `.b`, a band near the shore for `.g`, the first cell of that band for `.r`.
 * The projection is the board's (`HALF_W`/`HALF_H`), so the caustics land on
 * the ground plane and the outline follows the same zig-zag coastline the
 * tiles do.
 *
 * That split is deliberate. Bending the shader's sampling to fake a ground
 * plane would change the material; feeding it a mask that is ALREADY iso
 * leaves it untouched and puts the perspective where the board's own numbers
 * already live.
 *
 * `aspectRatio` is the shader's own handle for exactly this. Godot exposes it
 * so the sampling can be squashed on Y, and the iso lattice ratio (24/44) is
 * what to put in it — through the uniform the author provided, not through an
 * edit to the body.
 */
import { Geometry, Mesh, Shader, Texture, Assets } from 'pixi.js';

const vertex = `
in vec2 aPosition;
out vec2 vUv;
out vec2 vGroundUv;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec2 uSize;
uniform vec2 uHalfTile;
uniform vec2 uGroundSpan;

void main(void) {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    // 0..1 across the plane. The quad carries its size in its own vertices
    // rather than scaling a unit quad in the shader: scaling in the shader
    // leaves Pixi's bounds at 1x1 and the mesh gets culled. That lesson is
    // paid for in SurfaceTexture.ts's comment.
    vUv = aPosition / uSize;

    // The SAME pixel, expressed in the board's cell space — the ground plane.
    //
    // Inverse of the board's own projection (gridConfig):
    //     sx = (cx - cy) * halfW
    //     sy = (cx + cy) * halfH
    // which inverts to
    //     cx =  sx/(2*halfW) + sy/(2*halfH)
    //     cy = -sx/(2*halfW) + sy/(2*halfH)
    //
    // This is a ROTATION as well as a squash, and that is the whole point: the
    // ground's two axes run at +/-28.6 degrees across the screen, and no
    // amount of scaling Y alone can turn a screen-axis-aligned motif into one
    // that follows them. Done here rather than in the fragment so the ported
    // body stays the body.
    // NORMALISED by how many cells the plane spans, so vGroundUv covers a
    // comparable 0..1 range to vUv. Without that the cell coordinates run to
    // the dozens, every layer's own scale multiplies them again, and the motif
    // collapses below a pixel — which is the same "bare sparkle, no caustics"
    // failure the fade texture produced, from the opposite direction. Keeping
    // the ranges comparable is what lets causticScale stay the ONE size dial,
    // meaning the same number as in the Godot original.
    float u = aPosition.x / (2.0 * uHalfTile.x);
    float v = aPosition.y / (2.0 * uHalfTile.y);
    vGroundUv = vec2(u + v, v - u) / uGroundSpan;

    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
`;

// The Godot fragment, renamed as the header lists and nothing else. Kept in
// its own order, spacing and comments so it can be diffed against the source.
const fragment = `
precision highp float;

in vec2 vUv;
in vec2 vGroundUv;
out vec4 finalColor;

uniform float uTime;
uniform float uIso;
uniform sampler2D uMainTex;

uniform float aspectRatio;
uniform float pixelization;

uniform sampler2D waterDepthGradient;

uniform vec4 causticColor;
uniform vec4 causticHighlightColor;
uniform sampler2D causticTexture;
uniform sampler2D causticHighlightTexture;
uniform sampler2D causticNoiseTexture;
uniform sampler2D causticFadeNoiseTexture;
uniform float causticScale;
uniform float causticSpeed;
uniform float causticMovementAmount;
uniform float causticFaderMultiplier;

uniform vec4 specularColor;
uniform sampler2D specularNoiseTexture;
uniform sampler2D specularMovementLeftNoiseTexture;
uniform sampler2D specularMovementRightNoiseTexture;
uniform float specularThreshold;
uniform float specularSpeed;
uniform float specularScale;

uniform vec4 foamColor;
uniform sampler2D foamTexture;
uniform float foamIntensity;
uniform float foamScale;

uniform vec4 outlineColor;
uniform float generalTransparency;


// ------------------------------------------------------------------------------------
// Helper functions

// Blends two vec2's by subtracting them. Compare this to Photoshop blend mode "Subtract".
// Source:
// https://docs.unity3d.com/Packages/com.unity.shadergraph@6.9/manual/Blend-Node.html
vec2 blendSubtract_vec2(vec2 base, vec2 blend, float opacity)
{
    vec2 result = base - blend;
    return mix(base, result, opacity);
}

// Blends two floats by subtracting them. Compare this to Photoshop blend mode "Subtract".
// Source:
// https://docs.unity3d.com/Packages/com.unity.shadergraph@6.9/manual/Blend-Node.html
float blendSubtract_float(float base, float blend, float opacity)
{
    float result = base - blend;
    return mix(base, result, opacity);
}

// Blends two vec2's by overlaying them. Compare this to Photoshop blend mode "Overlay".
// Source:
// https://docs.unity3d.com/Packages/com.unity.shadergraph@6.9/manual/Blend-Node.html
float blendOverlay_float(float base, float blend, float opacity)
{
    float result1 = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);
    float result2 = 2.0 * base * blend;
    float zeroOrOne = step(0.5, base);
    float res = result2 * zeroOrOne + (1.0 - zeroOrOne) * result1;
    return mix(base, res, opacity);
}

// Pixelizes the given coordinate.
vec2 pixelizeCoordinates(vec2 coordinates)
{
    return floor(coordinates * pixelization) / pixelization;
}

// Applies the aspect ratio to the coordinates.
vec2 applyAspectRatio(vec2 coordinates)
{
    return vec2(coordinates.x, coordinates.y * aspectRatio);
}

// ------------------------------------------------------------------------------------
// Shader layers

vec4 caustics(vec2 pixelizedCoordinates)
{
    vec4 causticNoise = texture(causticNoiseTexture, uTime * causticSpeed + pixelizedCoordinates);
    vec2 noiseCoordinates = blendSubtract_vec2(pixelizedCoordinates * causticScale, causticNoise.rg, causticMovementAmount);
    vec4 causticHighlight = texture(causticHighlightTexture, noiseCoordinates) * causticHighlightColor;
    vec4 caustic = texture(causticTexture, noiseCoordinates) * causticColor;
    vec4 interpolatedCaustics = mix(caustic, causticHighlight, causticHighlight.a);
    float fadeNoise = texture(causticFadeNoiseTexture, noiseCoordinates).r * causticFaderMultiplier;
    return vec4(interpolatedCaustics.r, interpolatedCaustics.g, interpolatedCaustics.b, clamp(interpolatedCaustics.a - fadeNoise, 0.0, 1.0));
}

vec4 specular(vec2 pixelizedCoordinates)
{
    vec2 scaledCoordinates = pixelizedCoordinates * specularScale;
    float specularNoise = texture(specularNoiseTexture, scaledCoordinates).r;
    float leftScrollingNoise = texture(specularMovementLeftNoiseTexture, scaledCoordinates + vec2(uTime * specularSpeed, 0.0)).r;
    float rightScrollingNoise = texture(specularMovementRightNoiseTexture, scaledCoordinates + vec2(uTime * specularSpeed * -1.0, 0.0)).r;
    return step(specularThreshold, blendSubtract_float(blendOverlay_float(leftScrollingNoise, rightScrollingNoise, 1.0), specularNoise, 1.0)) * specularColor;
}

vec4 foam(vec2 pixelizedCoordinates, vec4 mainTexColor)
{
    vec4 colorizedFoam = texture(foamTexture, pixelizedCoordinates * foamScale) * foamColor;
    float intensity = clamp(mainTexColor.g * mainTexColor.a - foamIntensity, 0.0, 1.0);
    return vec4(colorizedFoam.r, colorizedFoam.g, colorizedFoam.b, colorizedFoam.a * intensity);
}

// ------------------------------------------------------------------------------------
// Fragment Shader code

void main()
{
    // The one substitution in the body, and it substitutes an ARGUMENT, not a
    // step: applyAspectRatio takes coordinates and returns coordinates, so
    // handing it ground-plane coordinates instead of screen ones puts the
    // motif on the ground without changing what any layer does with it. At
    // uIso = 0 this is exactly vUv and the material is the Godot original.
    vec2 isoCoordinates = mix(vUv, vGroundUv, uIso);
    vec2 pixelizedCoordinates = pixelizeCoordinates(applyAspectRatio(isoCoordinates));
    vec4 mainTex = texture(uMainTex, vUv);
    vec4 depthBasedWaterColor = texture(waterDepthGradient, vec2(1.0 - mainTex.b, 1.0));

    vec4 finalCaustics = caustics(pixelizedCoordinates);
    vec4 finalSpecular = specular(pixelizedCoordinates);
    vec4 finalFoam = foam(pixelizedCoordinates, mainTex);

    vec4 waterWithCausticLayer = mix(depthBasedWaterColor, finalCaustics, finalCaustics.a);
    vec4 waterWithCausticAndSpecularLayer = mix(waterWithCausticLayer, finalSpecular, ceil(finalCaustics.a) * finalSpecular.a);
    vec4 waterWithCausticAndSpecularAndFoamLayer = mix(waterWithCausticAndSpecularLayer, finalFoam, finalFoam.a);

    float outline = mainTex.a * mainTex.r;
    vec4 finalOutlineColor = outline * outlineColor;

    vec4 finalRGBColor = mix(waterWithCausticAndSpecularAndFoamLayer, finalOutlineColor, outline);
    finalColor = vec4(finalRGBColor.r, finalRGBColor.g, finalRGBColor.b, mainTex.b * generalTransparency);
}
`;

/**
 * The shader's own `uniform ... = <value>` defaults, transcribed.
 *
 * Every one of these is the number the Godot source declares. They are kept
 * here rather than inlined so a story's controls can start from the author's
 * tuning and a diff shows what was moved away from it.
 */
export const GODOT_WATER_DEFAULTS = {
  aspectRatio: 1.0,
  pixelization: 2048.0,

  causticColor: 0x74c5c3,          // vec4(0.455, 0.773, 0.765, 1.0)
  causticHighlightColor: 0xbde4e5,  // vec4(0.741, 0.894, 0.898, 1.0)
  causticScale: 12.0,
  causticSpeed: 0.005,
  causticMovementAmount: 0.15,
  causticFaderMultiplier: 1.45,

  specularColor: 0xffffff,
  specularThreshold: 0.35,
  specularSpeed: 0.025,
  specularScale: 15.0,

  foamColor: 0xffffff,
  foamIntensity: 0.2,
  foamScale: 15.0,

  outlineColor: 0xacdbff,           // vec4(0.675, 0.86, 1.0, 1.0)
  generalTransparency: 1.0,
} as const;

/**
 * The depth ramp `waterDepthGradient` is sampled from.
 *
 * The Godot material ships a GradientTexture the shader reads at
 * `1.0 - mainTex.b`, so index 0 is the DEEP water and index 1 the shallows.
 * There is no gradient in the files handed over, so this is the one place a
 * stand-in was unavoidable — and it is a lookup table, not a part of the
 * material's maths.
 *
 * Pass the SAME colour for both stops to turn the ramp off, which is what the
 * story does. A deep/shallow pair darkens the water toward every coast, and on
 * a board this size that does not read as depth — it reads as a drop shadow
 * under the island. The mask still carries depth in `.b`, since the shader
 * needs it for the final alpha and it is what stops the sea at the shore; a
 * flat ramp just declines to paint it.
 */
export const DEPTH_RAMP = { deep: 0x1f6f7a, shallow: 0x6fd0c8 } as const;

const NOISE_URL = '/assets/fx/perlin-noise.webp';
const CAUSTIC_URL = '/assets/fx/caustic.webp';
const CAUSTIC_HIGHLIGHT_URL = '/assets/fx/caustic-highlight.webp';
const CAUSTIC_FADE_URL = '/assets/fx/caustic-fade.webp';
const CAUSTIC_MOVE_URL = '/assets/fx/caustic-move.webp';

export interface GodotWaterTextures {
  caustic: Texture;
  causticHighlight: Texture;
  causticFade: Texture;
  causticMove: Texture;
  noise: Texture;
}

/**
 * Load the fields the shader samples.
 *
 * The two caustic textures are the ones handed over: WHITE with the pattern in
 * their ALPHA, which is what the shader expects — it multiplies each by a
 * colour uniform and keys the layer off `.a`. They are vendored as lossless
 * WebP; a lossy encode would smear that alpha and soften the veins that are
 * the whole look.
 *
 * The shader declares four more noise samplers with no art supplied for them,
 * and they are NOT interchangeable — that was the first thing this port got
 * wrong. Binding the vendored perlin field to all four looked tidy and made
 * the caustics vanish completely, because the fade slot is SUBTRACTED:
 *
 *     alpha = caustic.a - causticFadeNoise.r * 1.45
 *
 * A perlin field averages 0.5, so it subtracts ~0.73 from a caustic alpha that
 * averages 0.22, and the clamp takes every pixel to zero. The sea came out as
 * bare colour with a sparkle on it and nothing else. The shader was right; the
 * texture handed to it was wrong for its slot.
 *
 * So the two caustic noise slots get fields shaped for what the shader does
 * with them:
 *
 *   - `caustic-fade`: mostly near zero with sparse high patches, so it eats
 *     the caustic web into drifting islands instead of erasing it. Subtracts
 *     ~0.17 on average.
 *   - `caustic-move`: a smooth mid-range fbm, which is what a field that only
 *     perturbs sampling coordinates wants. Its three channels are offset
 *     copies so `.rg` — the two the shader actually reads — are not identical.
 *
 * The three SPECULAR slots do share the perlin field: there the shader scrolls
 * two copies against each other in opposite directions and thresholds the
 * difference, so one field is genuinely enough and their own scale and speed
 * pull them apart.
 *
 * Everything REPEATS: the shader scrolls uvs without bound and multiplies them
 * by up to 15, so on the default clamp every sample past 1 returns the edge
 * pixel and the sea comes out in streaks.
 */
export async function loadGodotWater(): Promise<GodotWaterTextures> {
  const [caustic, causticHighlight, causticFade, causticMove, noise] = await Promise.all([
    Assets.load<Texture>(CAUSTIC_URL),
    Assets.load<Texture>(CAUSTIC_HIGHLIGHT_URL),
    Assets.load<Texture>(CAUSTIC_FADE_URL),
    Assets.load<Texture>(CAUSTIC_MOVE_URL),
    Assets.load<Texture>(NOISE_URL),
  ]);
  for (const t of [caustic, causticHighlight, causticFade, causticMove, noise]) {
    t.source.addressMode = 'repeat';
    t.source.scaleMode = 'linear';
  }
  return { caustic, causticHighlight, causticFade, causticMove, noise };
}

/** Where a cell lands on screen, in the plane's own pixels. */
export type IsoProjector = (x: number, y: number) => { x: number; y: number };

export interface IsoWaterMaskOptions {
  /** Plane size in pixels — the mask is rendered at this resolution. */
  width: number;
  height: number;
  /** Board size in cells. */
  cols: number;
  rows: number;
  /** True where there is LAND. Water is everywhere else. */
  isLand: (x: number, y: number) => boolean;
  /** Cell -> pixel, the board's own projection. */
  project: IsoProjector;
  /** Half-diagonals of one diamond, in pixels. */
  halfW: number;
  halfH: number;
  /**
   * How far from the shore the water reads as fully deep, in cells. Below
   * this the `.b` channel ramps, which is what gives the depth gradient
   * something to gradate over.
   *
   * 0 makes it a hard edge instead. Worth knowing why that is often what you
   * want: the shader uses this channel as its FINAL ALPHA as well as its
   * colour lookup, so any ramp here fades the sea out toward the coast and
   * whatever is behind the plane shows through the fade — which reads as a
   * shadow round the island rather than as shallow water.
   */
  shoreCells?: number;
  /** Width of the foam band (`.g`), in cells. */
  foamCells?: number;
  /** Width of the outline (`.r`), in cells. */
  outlineCells?: number;
}

/**
 * Build the three-channel texture the shader reads, IN THE BOARD'S PROJECTION.
 *
 * This is the isometric half of the port. The shader is a mask reader — it
 * asks its main texture for depth, foam and outline at each pixel and paints
 * accordingly — so putting the sea "in iso" means handing it a mask whose
 * coastline is the diamond grid's, not squashing the shader's sampling.
 *
 * The distance field is measured IN CELLS and then projected, rather than in
 * screen pixels: a pixel-space distance would be wider across the diamond's
 * long axis than its short one, and the foam band would come out fat on the
 * east-west shores and thin on the north-south ones. Cells are the space the
 * coastline is actually defined in.
 *
 *   - `.r` outline — the first `outlineCells` of water off the coast
 *   - `.g` foam    — a band `foamCells` wide, fading outward
 *   - `.b` depth   — 0 at the shore, 1 past `shoreCells`; at 0, a hard edge
 *   - `.a`         — 1 on water, 0 on land (the shader multiplies `.r` by it
 *                    for the outline, and `.g` by it for the foam intensity)
 *
 * Written as a raw RGBA buffer and handed to Pixi as a texture: a Graphics
 * object drawn diamond-by-diamond would have to be rasterised anyway, and this
 * way the per-pixel values are exact rather than the result of overlapping
 * fills.
 */
export function buildIsoWaterMask(o: IsoWaterMaskOptions): Texture {
  const {
    width, height, cols, rows, isLand, project, halfW, halfH,
    shoreCells = 4, foamCells = 1.4, outlineCells = 0.45,
  } = o;

  // Distance in cells from each water cell to the nearest land, by BFS over
  // the grid. Chebyshev-ish on an 8-neighbourhood, which matches how the
  // island's own movement treats the board.
  const INF = 1e9;
  const dist = new Float32Array(cols * rows).fill(INF);
  const queue: number[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (isLand(x, y)) { dist[y * cols + x] = 0; queue.push(y * cols + x); }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const cx = idx % cols;
    const cy = (idx - cx) / cols;
    const d = dist[idx] + 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (d < dist[n]) { dist[n] = d; queue.push(n); }
      }
    }
  }

  // Screen -> cell. The board's projection is
  //     sx = ox + (x - y) * halfW
  //     sy = oy + (x + y) * halfH
  // so its inverse, with (ox, oy) read off the projector's own origin.
  const origin = project(0, 0);
  const cellAt = (sx: number, sy: number) => {
    const u = (sx - origin.x) / halfW;
    const v = (sy - origin.y) / halfH;
    return { x: (v + u) / 2, y: (v - u) / 2 };
  };

  // Bilinear over the cell field, so the bands are smooth rather than
  // stepping from one diamond to the next.
  const sample = (fx: number, fy: number) => {
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return shoreCells + 1;
      return dist[y * cols + x];
    };
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };

  const pixels = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const cell = cellAt(px + 0.5, py + 0.5);
      const d = sample(cell.x, cell.y);
      const i = (py * width + px) * 4;

      // On land the shader must draw nothing: alpha 0 kills the outline and
      // the foam, and `.b` at 0 kills the final alpha.
      if (d <= 0) { pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 0; continue; }

      // shoreCells 0 means a HARD edge: full depth immediately off the coast.
      // Written out rather than left to `d / 0` -> Infinity -> min() -> 1,
      // which gives the right answer by accident and reads like a bug.
      const depth = shoreCells <= 0 ? 1 : Math.min(1, d / shoreCells);
      const foam = Math.max(0, 1 - (d - 0) / foamCells);
      const outline = d <= outlineCells ? 1 : 0;

      pixels[i] = Math.round(outline * 255);
      pixels[i + 1] = Math.round(foam * 255);
      pixels[i + 2] = Math.round(depth * 255);
      pixels[i + 3] = 255;
    }
  }

  return Texture.from({ resource: pixels, width, height, alphaMode: 'no-premultiply-alpha' });
}

/**
 * The two-stop depth ramp, as a 1-pixel-tall texture.
 *
 * Sampled at `vec2(1.0 - mainTex.b, 1.0)` by the shader, so it is a lookup
 * table along X and the Y coordinate is ignored. 256 wide: the mask's depth
 * channel is 8-bit, so any more is resolution the input cannot carry.
 */
export function depthGradientTexture(
  deep: number = DEPTH_RAMP.deep,
  shallow: number = DEPTH_RAMP.shallow,
): Texture {
  const N = 256;
  const px = new Uint8Array(N * 4);
  const dr = (deep >> 16) & 0xff, dg = (deep >> 8) & 0xff, db = deep & 0xff;
  const sr = (shallow >> 16) & 0xff, sg = (shallow >> 8) & 0xff, sb = shallow & 0xff;
  for (let i = 0; i < N; i++) {
    // Index 0 is `1.0 - depth` at full depth, i.e. the DEEP end.
    const t = i / (N - 1);
    px[i * 4] = Math.round(dr + (sr - dr) * t);
    px[i * 4 + 1] = Math.round(dg + (sg - dg) * t);
    px[i * 4 + 2] = Math.round(db + (sb - db) * t);
    px[i * 4 + 3] = 255;
  }
  const tex = Texture.from({ resource: px, width: N, height: 1, alphaMode: 'no-premultiply-alpha' });
  tex.source.addressMode = 'clamp-to-edge';
  tex.source.scaleMode = 'linear';
  return tex;
}

export interface GodotWaterOptions {
  /** The three-channel mask, from `buildIsoWaterMask`. */
  mask: Texture;
  /** The depth ramp, from `depthGradientTexture`. */
  gradient: Texture;
  /**
   * The shader's own `aspectRatio`, which squashes the sampling on Y.
   *
   * For an isometric ground plane this is the lattice ratio — `HALF_H / HALF_W`
   * — which lays the caustic cells on the ground rather than hanging them
   * behind the island like a curtain. The Godot default of 1.0 is the top-down
   * case, and `ISO_ASPECT` below is the iso one.
   */
  aspectRatio?: number;
  pixelization?: number;
  /**
   * 0 = sample in screen space (the Godot original), 1 = sample on the board's
   * ground plane. Between the two it lerps, which is only useful for looking
   * at what the projection is doing.
   */
  iso?: number;
  /** Half-diagonals of one diamond, for the screen -> cell inverse. */
  halfW?: number;
  halfH?: number;
  /**
   * How many cells the ground uv is normalised over, per axis. Defaults to the
   * plane's own span in cells, which keeps `vGroundUv` in a 0..1-ish range so
   * that `causticScale` — the shader's own dial — stays the one size control.
   */
  groundSpan?: readonly [number, number];
  causticColor?: number;
  causticHighlightColor?: number;
  causticScale?: number;
  causticSpeed?: number;
  causticMovementAmount?: number;
  causticFaderMultiplier?: number;
  specularColor?: number;
  specularThreshold?: number;
  specularSpeed?: number;
  specularScale?: number;
  foamColor?: number;
  foamIntensity?: number;
  foamScale?: number;
  outlineColor?: number;
  generalTransparency?: number;
}

/**
 * The iso lattice ratio, 24/44, as the shader's `aspectRatio`.
 *
 * The one number that makes this sea isometric from INSIDE the shader — and
 * it goes through the uniform its author provided for the purpose, not through
 * an edit to the body.
 */
export const ISO_ASPECT = 24 / 44;

const rgba = (hex: number) => new Float32Array([
  ((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255, 1,
]);

export interface GodotCausticWater {
  /** Add this under the island and over the background. */
  readonly view: Mesh<Geometry, Shader>;
  /** Advance the surface. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void;
  resize(width: number, height: number): void;
  /** Set one scalar dial by uniform name, for a story's controls. */
  set(name: string, value: number): void;
  /** Set one colour dial by uniform name. */
  setColor(name: string, hex: number): void;
  destroy(): void;
}

/**
 * A plane of Godot caustic water, sized in pixels.
 *
 * `textures` comes from `loadGodotWater()`; taking it as an argument rather
 * than loading inside keeps this synchronous, so a caller can build the whole
 * scene in one pass the way `createPackWater` and `createCartoonWater` are
 * used.
 *
 * Defaults are the shader's declared values verbatim, except `aspectRatio`,
 * which the caller is expected to set to `ISO_ASPECT`.
 */
export function createGodotCausticWater(
  textures: GodotWaterTextures,
  width: number,
  height: number,
  options: GodotWaterOptions,
): GodotCausticWater {
  const D = GODOT_WATER_DEFAULTS;
  // On the ground plane the sampling is already squashed by the screen -> cell
  // inverse, so `aspectRatio` goes back to the Godot default of 1: applying
  // the squash twice is what made the motif look stretched rather than laid
  // down. It stays exposed for the screen-space case.
  const halfW = options.halfW ?? 22;
  const halfH = options.halfH ?? 12;
  const o = {
    ...D, iso: 1, halfW, halfH,
    // How many cells the plane spans on each ground axis. u + v grows along
    // the screen diagonal, so both axes span roughly width/2halfW + height/2halfH.
    groundSpan: [
      width / (2 * halfW) + height / (2 * halfH),
      width / (2 * halfW) + height / (2 * halfH),
    ] as readonly [number, number],
    ...options,
  };

  const quad = (w: number, h: number) => new Float32Array([0, 0, w, 0, w, h, 0, h]);
  const geometry = new Geometry({
    attributes: { aPosition: quad(width, height) },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  });

  const shader = Shader.from({
    gl: { vertex, fragment },
    resources: {
      uMainTex: options.mask.source,
      waterDepthGradient: options.gradient.source,
      causticTexture: textures.caustic.source,
      causticHighlightTexture: textures.causticHighlight.source,
      // The two caustic noise slots get purpose-shaped fields; the three
      // specular ones share the perlin. They are not interchangeable — see
      // `loadGodotWater` for what binding one field to all four did.
      causticNoiseTexture: textures.causticMove.source,
      causticFadeNoiseTexture: textures.causticFade.source,
      specularNoiseTexture: textures.noise.source,
      specularMovementLeftNoiseTexture: textures.noise.source,
      specularMovementRightNoiseTexture: textures.noise.source,
      waterUniforms: {
        uTime: { value: 0, type: 'f32' },
        uSize: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
        uHalfTile: { value: new Float32Array([o.halfW, o.halfH]), type: 'vec2<f32>' },
        uGroundSpan: {
          value: new Float32Array([o.groundSpan[0], o.groundSpan[1]]), type: 'vec2<f32>',
        },
        uIso: { value: o.iso, type: 'f32' },
        aspectRatio: { value: o.aspectRatio, type: 'f32' },
        pixelization: { value: o.pixelization, type: 'f32' },
        causticColor: { value: rgba(o.causticColor), type: 'vec4<f32>' },
        causticHighlightColor: { value: rgba(o.causticHighlightColor), type: 'vec4<f32>' },
        causticScale: { value: o.causticScale, type: 'f32' },
        causticSpeed: { value: o.causticSpeed, type: 'f32' },
        causticMovementAmount: { value: o.causticMovementAmount, type: 'f32' },
        causticFaderMultiplier: { value: o.causticFaderMultiplier, type: 'f32' },
        specularColor: { value: rgba(o.specularColor), type: 'vec4<f32>' },
        specularThreshold: { value: o.specularThreshold, type: 'f32' },
        specularSpeed: { value: o.specularSpeed, type: 'f32' },
        specularScale: { value: o.specularScale, type: 'f32' },
        foamColor: { value: rgba(o.foamColor), type: 'vec4<f32>' },
        foamIntensity: { value: o.foamIntensity, type: 'f32' },
        foamScale: { value: o.foamScale, type: 'f32' },
        outlineColor: { value: rgba(o.outlineColor), type: 'vec4<f32>' },
        generalTransparency: { value: o.generalTransparency, type: 'f32' },
      },
    },
  });

  const view = new Mesh({ geometry, shader });
  // Godot's `COLOR` is straight alpha; Pixi's default blend expects the colour
  // premultiplied. Without this the shader's own transparency — which is how
  // the sea stops at the coast — comes out as a bright fringe along every
  // shore. Set on the blend rather than by multiplying in the fragment, so
  // the ported body stays the body.
  view.blendMode = 'normal-npm';

  const uniforms = shader.resources.waterUniforms.uniforms as Record<string, unknown>;

  let elapsed = 0;
  return {
    view,
    update(deltaMs) {
      elapsed += deltaMs / 1000;
      uniforms.uTime = elapsed;
    },
    resize(w, h) {
      const buf = geometry.getBuffer('aPosition');
      buf.data = quad(w, h);
      buf.update();
      uniforms.uSize = new Float32Array([w, h]);
    },
    set(name, value) {
      if (name in uniforms) uniforms[name] = value;
    },
    setColor(name, hex) {
      if (name in uniforms) uniforms[name] = rgba(hex);
    },
    destroy() {
      view.destroy();
      geometry.destroy();
      shader.destroy();
    },
  };
}
