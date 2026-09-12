/**
 * Step 6 of the water breakdown: surface texture, as pale contour lines.
 *
 * The thing on the reference's water is not a noise wash and not a caustic
 * web — it is a set of THIN CLOSED CURVES, the way a contour map draws a hill.
 * That distinction is the whole effect. A noise field painted straight on the
 * sea reads as dirt on the lens; the same field drawn only where it CROSSES a
 * threshold reads as the surface of water, because the curves close on
 * themselves and drift as a body.
 *
 * So this takes an animated fbm and keeps a band around a few chosen levels:
 *
 *     band = 1 - smoothstep(0, width, abs(fract(field * levels) - 0.5))
 *
 * `fract(field * levels)` repeats the field into `levels` sawtooths, so one
 * expression draws every contour at once rather than one per level. Where the
 * sawtooth passes its midpoint the band lights up, and everywhere else it is
 * black. Tightening `width` thins every line together.
 *
 * ## Why its own layer and not the old shader's step 6
 *
 * `fx/WaterShader.ts` has a step 6 already (cellular/Worley), and it is part
 * of a seventeen-step filter that paints the whole sea — colour, depth, surf,
 * rings. Reviving it to get the lines back would bring all of that with it,
 * and the commit before this one removed that filter ON PURPOSE: three
 * mechanisms fighting over the same pixels is what produced the halo, the
 * unresponsive shadow and the un-hollowable ring.
 *
 * This is one mechanism doing one thing. It is a MESH, not a filter: a plane
 * that sits in the display list under the surf and over the background, so its
 * draw order is the display list's business and not a filter's padding.
 *
 * ## The isometric adjustment
 *
 * The reference is top-down. Here the camera looks along the diamond, so the
 * field is flattened on Y by the lattice's ratio (24/44) before it is sampled,
 * which is what lays the curves on the ground plane instead of hanging them
 * behind the island like a curtain.
 */
import { Geometry, Mesh, Shader } from 'pixi.js';

const vertex = `
in vec2 aPosition;
out vec2 vUv;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main(void) {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    // The quad carries its size in its own vertices, so this is just a pass
    // through: "vUv" is already in pixels and Pixi can measure the mesh.
    vUv = aPosition;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
`;

const fragment = `
precision highp float;

in vec2 vUv;
out vec4 finalColor;

uniform float uTime;
uniform vec3  uSea;        // the water under the lines
uniform vec3  uLineColor;  // the lines themselves
uniform float uOpacity;    // how strongly they show
uniform float uScale;      // size of one blob of the field, in px
uniform float uRadius;     // size of a patch, as a share of one cell
uniform float uLevels;     // strength of the fainter second outline, 0 to 1
uniform float uWobble;     // how irregular a patch's outline is
uniform float uDensity;    // share of cells that carry a patch at all
uniform float uWidth;      // line thickness, in field units
uniform float uDrift;      // how fast the whole field slides
uniform float uMorph;      // how fast it changes shape in place
uniform float uIsoSquash;  // lattice h/w, to lay the field on the ground
uniform float uPixel;      // quantisation, to keep it pixel art

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/**
 * Three octaves, not two.
 *
 * Two octaves give smooth ovals — contours of a blurry field are blurry
 * shapes, and they came out as concentric rings that read as ripples from a
 * dropped stone. The third octave is what puts the WOBBLE in the curve, so a
 * line meanders and pinches the way the reference's do.
 */
float fbm(vec2 p) {
    float v = noise(p) * 0.55;
    v += noise(p * 2.13 + 5.2) * 0.30;
    v += noise(p * 4.37 + 11.7) * 0.15;
    return v;
}

/**
 * Distance to the nearest of a scattered set of points, one per cell.
 *
 * This is what makes the patches SMALL and SEPARATE. Contouring an fbm gives
 * long open curves that wander off the screen — which is what the first pass
 * drew, and it read as marbling rather than as water. A cellular field is
 * bounded by construction: each point owns a patch, so a contour taken around
 * it closes on itself and stays the size of one cell.
 *
 * The points drift on their own little orbits, so a patch wanders and breathes
 * instead of sitting where the lattice put it.
 */
vec2 cellDist(vec2 p, float t) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float best = 8.0;
    float seed = 0.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 o = vec2(hash(i + g), hash(i + g + 17.3));
            o = 0.5 + 0.42 * sin(t + 6.2831 * o);
            float dd = length(g + o - f);
            if (dd < best) { best = dd; seed = hash(i + g + 3.1); }
        }
    }
    // y carries the winning cell's seed, so the patch can size itself and
    // decide whether to exist at all. Without it every patch is the same
    // circle and the field tiles visibly, like a net thrown over the sea.
    return vec2(best, seed);
}

void main(void) {
    // Pixel-snapped FIRST, so the curves land on the art's own grid. Snapping
    // after the contour is taken thickens some lines and drops others, because
    // it quantises the result instead of the place it was measured from.
    vec2 px = floor(vUv / uPixel) * uPixel;

    // Isometric: DIVIDE x, not y.
    //
    // The first pass divided Y by the squash (0.545), which stretches the
    // field vertically — the opposite of lying down. On this camera a circle
    // on the ground is WIDER than it is tall, so the sampling space has to be
    // wider too: dividing x by the ratio makes one unit of x cover more
    // pixels, and a round patch in field space comes out as the flattened
    // lozenge the perspective asks for.
    vec2 p = vec2(px.x * uIsoSquash, px.y) / uScale;

    // Two motions, deliberately different in kind.
    //
    // "uDrift" slides the whole field, which is the current carrying the
    // surface along. "uMorph" moves the points on their own orbits, so a patch
    // changes shape where it stands. Drift alone reads as a printed sheet
    // being pulled past the island.
    p += vec2(uTime * uDrift, uTime * uDrift * 0.35);

    // The patch: distance to the nearest scattered point, warped by a little
    // fbm so its outline is IRREGULAR rather than a clean ellipse. The warp is
    // small on purpose — enough to dent the circle, not enough to open it.
    float warp = (fbm(p * 2.6) - 0.5) * uWobble;
    vec2 cd = cellDist(p, uTime * uMorph);
    float d = cd.x + warp;
    float seed = cd.y;

    // Each patch its own size, and some cells left EMPTY.
    //
    // A constant radius made every patch identical and every cell occupied,
    // which reads as a mesh rather than as texture on water. Scaling the
    // radius by the cell's own seed varies them, and dropping the cells below
    // uDensity opens the gaps the reference has between its clusters.
    float rad = uRadius * mix(0.55, 1.45, seed);
    float present = step(1.0 - uDensity, hash(vec2(seed * 91.7, 4.2)));

    // The outline, as a HARD edge.
    //
    // A smoothstep band gave a soft ramp, and quantising it afterwards into
    // three steps made a fuzzy grey line with a stair in it — which is what
    // read as blurry. Pixel art has no half-lit pixels: "step" on each side of
    // the radius lights a pixel or it does not, and the ring is exactly
    // uWidth wide.
    //
    // Guarded on uWidth, because a thickness of zero must draw NOTHING; the
    // subtraction alone would still light the pixels sitting exactly on the
    // radius.
    float line = 0.0;
    if (uWidth > 0.0) {
        float ring = abs(d - rad);
        line = step(ring, uWidth);
        // A second, fainter outline further out on SOME patches, which is what
        // gives the reference its double-ringed look rather than a field of
        // identical circles.
        float ring2 = abs(d - rad * 1.9);
        line = max(line, step(ring2, uWidth * 0.7) * uLevels * step(0.5, seed));
        line *= present;
    }

    vec3 col = mix(uSea, uLineColor, line * uOpacity);
    finalColor = vec4(col, 1.0);
}
`;

export interface SurfaceTextureOptions {
  /** The water under the lines. Match the canvas background. */
  sea?: number;
  /** The lines themselves. */
  lineColor?: number;
  /** How strongly they show, 0 to 1. */
  opacity?: number;
  /** Size of one blob of the field, in pixels. */
  scale?: number;
  /** Size of a patch, as a share of one cell. */
  radius?: number;
  /** Strength of the fainter second outline, 0 to 1. */
  levels?: number;
  /** How irregular a patch's outline is. */
  wobble?: number;
  /** Share of cells that carry a patch at all, 0 to 1. */
  density?: number;
  /** Line thickness, in field units. */
  width?: number;
  /** How fast the whole field slides. */
  drift?: number;
  /** How fast it changes shape in place. */
  morph?: number;
  /** Lattice height / width, so the curves lie on the ground plane. */
  isoSquash?: number;
  /** How many screen pixels one shader pixel spans. */
  pixelSize?: number;
}

const rgb = (hex: number) => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

export interface SurfaceTexture {
  /** Add this UNDER the surf and over the background. */
  readonly view: Mesh<Geometry, Shader>;
  /** Advance the surface. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void;
  /** Resize the plane. */
  resize(width: number, height: number): void;
  /** Set one dial by uniform name, for the story's controls. */
  set(name: string, value: number): void;
  destroy(): void;
}

/**
 * A plane of moving contour lines, to lie under everything on the sea.
 *
 * Sized in pixels and positioned by the caller like any other display object.
 */
export function createSurfaceTexture(
  width: number,
  height: number,
  options: SurfaceTextureOptions = {},
): SurfaceTexture {
  const o = {
    sea: 0x47aba9,
    lineColor: 0x9fd9cf,
    opacity: 0.55,
    scale: 58,
    radius: 0.34,
    levels: 0.55,
    wobble: 0.22,
    density: 0.62,
    width: 0.035,
    drift: 0.06,
    morph: 0.35,
    isoSquash: 24 / 44,
    pixelSize: 2,
    ...options,
  };

  // A quad sized in PIXELS, not a unit quad scaled in the vertex shader.
  //
  // Scaling in the shader leaves Pixi's own bounds at 1x1: it measures the
  // geometry on the CPU and never sees the multiply. The mesh then reports a
  // single pixel, which is enough for it to be culled or drawn as a dot — the
  // lines were running, animating and invisible. The size belongs in the
  // buffer, where both the GPU and Pixi can see it.
  const quad = (w: number, h: number) => new Float32Array([0, 0, w, 0, w, h, 0, h]);
  const geometry = new Geometry({
    attributes: { aPosition: quad(width, height) },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  });

  const shader = Shader.from({
    gl: { vertex, fragment },
    resources: {
      surfaceUniforms: {
        uTime: { value: 0, type: 'f32' },
        uSea: { value: new Float32Array(rgb(o.sea)), type: 'vec3<f32>' },
        uLineColor: { value: new Float32Array(rgb(o.lineColor)), type: 'vec3<f32>' },
        uOpacity: { value: o.opacity, type: 'f32' },
        uScale: { value: o.scale, type: 'f32' },
        uRadius: { value: o.radius, type: 'f32' },
        uLevels: { value: o.levels, type: 'f32' },
        uWobble: { value: o.wobble, type: 'f32' },
        uDensity: { value: o.density, type: 'f32' },
        uWidth: { value: o.width, type: 'f32' },
        uDrift: { value: o.drift, type: 'f32' },
        uMorph: { value: o.morph, type: 'f32' },
        uIsoSquash: { value: o.isoSquash, type: 'f32' },
        uPixel: { value: o.pixelSize, type: 'f32' },
      },
    },
  });

  const view = new Mesh({ geometry, shader });
  const uniforms = shader.resources.surfaceUniforms.uniforms as Record<string, unknown>;

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
    },
    set(name, value) {
      if (name in uniforms) uniforms[name] = value;
    },
    destroy() {
      view.destroy();
      geometry.destroy();
      shader.destroy();
    },
  };
}
