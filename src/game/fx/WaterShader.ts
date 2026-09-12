/**
 * The sea, as a shader rather than as tiles.
 *
 * Ported from Fred Ström's step-by-step water breakdown, which builds a
 * stylised ocean in seventeen passes. The reason to follow it rather than
 * invent one: each step is a separate visual idea, so the result can be tuned
 * one dial at a time instead of being a single opaque noise function.
 *
 * ## Why a shader and not tiles
 *
 * The island's coastline is a lattice of diamonds, and anything drawn PER CELL
 * inherits that lattice — which is exactly how the sprite foam failed: eight
 * 192px frames drawn for a top-down grid, laid on diamonds, came out as a ring
 * of detached squares around the island. A shader has no cells. It knows only
 * where the land is, as a distance, so the surf it draws follows the actual
 * shore instead of the grid the shore happens to be built from.
 *
 * ## The land mask
 *
 * Everything that makes this read as water meeting a coast — the shadow the
 * land casts, the lip of surf, the darkened edge — needs to know how far the
 * current pixel is from land. That cannot come from the scene texture: the
 * island is drawn over the sea, so by the time the filter runs, "is this land"
 * and "is this a green tile" are the same question, and a dark cliff reads as
 * deep water.
 *
 * So the distance is supplied as its own texture, built once per island from
 * the map (`landDistanceTexture`). Red channel is 0 at the shore and rises to
 * 1 out at sea, which is the one number every coastal step below wants. (The
 * cast shadow does NOT use it — see `fx/IslandShadow.ts` for why a shape
 * taken from the renderer beat one computed from the map.)
 *
 * ## The isometric adjustment
 *
 * The reference is top-down: its caustics are a square field scrolling under a
 * square camera. Here the camera looks along the diamond, so the same field
 * sampled straight would read as a vertical curtain hanging behind the island
 * rather than as a surface lying under it. `uIsoSquash` flattens the sampling
 * on Y by the lattice's own ratio (24/44), which is what puts the texture back
 * on the ground plane.
 */
import { Filter, GlProgram, Texture } from 'pixi.js';

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

const fragment = `
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;      // the scene, island included
uniform sampler2D uLand;         // r = distance from shore, 0 at the coast

uniform float uTime;
uniform vec2  uSize;             // filter area, in pixels
uniform vec4  uInputSize;        // Pixi: xy = filter texture size, zw = 1/xy
uniform vec4  uOutputFrame;      // Pixi: xy = where that texture sits on screen
uniform vec2  uLandOrigin;       // stage-space point the land field starts at
uniform float uIsoSquash;        // lattice h/w, to lay the field on the ground

uniform vec3  uDeep;             // step 1: the flat colour, edge to edge
uniform vec3  uShallow;          // shallows, mixed in by step 16 only
uniform float uWobble;           // step 3 (coast) + 7 (surface)
uniform vec3  uEdgeColor;        // step 4's foam colour; step 5 shares it
uniform float uEdgeWidth;
uniform float uRings;            // step 5: brightness of the rings
uniform vec2  uTile;             // the board's half-diamond, in px
uniform float uRingRadius;       // how wide a ring grows, in px
uniform float uRingSpeed;        // how fast one opens and fades
uniform float uRingReach;        // birth window from the shore, as a share of
                                 // the distance field's own reach: at the
                                 // story's 140px that makes 0.10 about 14px,
                                 // which is close enough to read as ripples
                                 // breaking against the coast rather than as
                                 // weather out at sea
uniform float uRingChance;       // seed cutoff: HIGHER means fewer rings
                                 // (the lattice is the board's own 44x24 cell
                                 // now, so nearly every cell qualifying makes
                                 // a thicket of overlapping circles — this is
                                 // what thins it back to a few)
uniform float uRingSize;         // max radius, as a share of the cell
uniform float uRingSouth;        // 0 = all round the coast, 1 = below only
uniform float uRingFade;         // how fast a ring fades with distance
uniform float uRingFloor;        // how much a distant ring keeps, 0 to 1
uniform float uRingJitter;       // px a ring strays from its cell's centre
uniform float uRingHold;         // share of its life at full strength
uniform float uSurface;          // steps 6 + 10 + 11
uniform float uHighlights;       // step 8
uniform float uLowlights;        // step 9
uniform float uWaves;            // step 14
uniform float uGlimmer;          // step 15
uniform float uDarkenEdges;      // step 16
uniform float uPixel;            // quantisation, to keep it pixel art
uniform float uRingsOnly;        // 1 = emit only the rings, for an overlay pass

// --- helpers -------------------------------------------------------------

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

/** Two octaves is enough: this is a stylised surface, not a simulation. */
float fbm(vec2 p) {
    return noise(p) * 0.62 + noise(p * 2.17 + 3.1) * 0.38;
}

/**
 * The cell-like caustic web the reference builds in step 6 and remakes in 11.
 *
 * Worley/cellular noise: the distance to the nearest of a scattered set of
 * points. Its RIDGES are what read as light bent through a moving surface,
 * which is why the result is inverted — the web is the space between cells,
 * not the cells.
 */
float cells(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float best = 1.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 o = vec2(hash(i + g), hash(i + g + 17.3));
            o = 0.5 + 0.45 * sin(uTime * 0.35 + 6.2831 * o);
            best = min(best, length(g + o - f));
        }
    }
    return best;
}

void main(void) {
    vec4 scene = texture(uTexture, vTextureCoord);

    // The land field is rasterised in SCREEN space, so it has to be sampled
    // there too.
    //
    // "vTextureCoord" addresses the filter's own framebuffer, which Pixi sizes
    // and offsets to whatever region it decided to filter — padded, clipped to
    // the renderer, and not generally the screen. Sampling "uLand" with it
    // lined the coastline up with that buffer instead of with the island, and
    // the surf came out hanging off one corner. Converting back through
    // "uOutputFrame" puts both in the same space, whatever Pixi chose.
    // Stage space, which is the space the land field was rasterised in.
    //
    // "uOutputFrame.xy" says where the filter's framebuffer sits, but that is
    // measured against whatever region Pixi chose to filter — and the stage
    // here has content above y=0 (a tree overhangs the top), so its bounds
    // start at a negative y and everything shifted by that amount. Subtracting
    // the field's own origin puts both back in the same coordinates whatever
    // the scene's bounds happen to be.
    vec2 screen = vTextureCoord * uInputSize.xy + uOutputFrame.xy - uLandOrigin;

    // --- step 3: wave wobble ---------------------------------------------
    // Applied to the LAND LOOKUP, before anything is drawn from it.
    //
    // Wobbling only the surface texture (which is what the first pass did)
    // moves the caustics and leaves the coastline a clean vector edge, so at
    // this step — with the surface still switched off — it did nothing at all.
    // Displacing the sample point instead makes every coastal feature inherit
    // the ripple: the shadow, the surf lip and the shallows all breathe with
    // the same wave, because they are all reading the same displaced field.
    //
    // Two frequencies at different speeds, so the coast never visibly repeats.
    vec2 ripple = vec2(
        sin(screen.y * 0.055 + uTime * 1.15) + sin(screen.y * 0.021 - uTime * 0.62) * 0.6,
        sin(screen.x * 0.048 - uTime * 0.95) + sin(screen.x * 0.019 + uTime * 0.55) * 0.6
    ) * uWobble * uSize.y * 0.02;

    vec2 landUV = (screen + ripple) / uSize;
    float dist = texture(uLand, landUV).r;

    // Land and anything standing on it passes through untouched: this filter
    // paints the SEA, and the island is already drawn over it.
    if (dist <= 0.0) { finalColor = scene; return; }

    // Pixel-snapped sampling space, so every step below lands on the art's own
    // grid instead of on screen pixels — the one thing that would betray this
    // as a post-process laid over pixel art.
    vec2 px = floor(screen / uPixel) * uPixel;
    // Isometric: flatten Y so the field lies on the ground plane.
    vec2 uv = vec2(px.x, px.y / uIsoSquash) * 0.02;

    // --- step 7: wobbly wobble -------------------------------------------
    // The surface's own share of the ripple, on top of the one the coastline
    // already got above. Smaller and slower: this one is the sheet of water
    // flexing, not the wave running along the shore.
    vec2 suv = uv + vec2(
        sin(uv.y * 3.1 + uTime * 0.9),
        cos(uv.x * 2.7 - uTime * 0.7)
    ) * uWobble * 0.5;

    // --- step 1: flat colour ---------------------------------------------
    // ONE colour, edge to edge. Not a gradient from the shore: the first
    // attempt mixed toward a lighter shade near land, which drew a stepped
    // turquoise halo the shape of the island's bounding diamond — a tint map
    // masquerading as water. Depth belongs to step 16 (darken edges), which
    // works outward from the island rather than hugging it.
    vec3 col = uDeep;

    // --- step 6 + 10 + 11: surface texture, two layers --------------------
    // The second layer is slower and larger: one layer alone slides like a
    // printed sheet, two at different rates read as a surface with depth.
    float c1 = 1.0 - cells(suv * 1.9 + vec2(uTime * 0.06, 0.0));
    float c2 = 1.0 - cells(suv * 0.9 - vec2(0.0, uTime * 0.04));
    float web = pow(max(c1, 0.0), 2.2) * 0.65 + pow(max(c2, 0.0), 2.6) * 0.35;
    col += web * uSurface;

    // --- step 8: highlights ----------------------------------------------
    float hi = smoothstep(0.62, 0.95, web);
    col += hi * uHighlights;

    // --- step 9: lowlights -----------------------------------------------
    float lo = smoothstep(0.55, 0.05, web);
    col -= lo * uLowlights;

    // --- step 14: wave particles -----------------------------------------
    // Short dashes drifting parallel to the shore, denser near it.
    float lane = floor(suv.y * 7.0);
    float phase = hash(vec2(lane, 3.7));
    float run = fract(suv.x * 0.6 + uTime * (0.05 + phase * 0.05) + phase);
    float dash = smoothstep(0.02, 0.0, abs(run - 0.5) - 0.012);
    float nearShore = 1.0 - smoothstep(0.06, 0.55, dist);
    col += dash * nearShore * uWaves;

    // --- step 5: ring particles ------------------------------------------
    // Pale rings that open and fade in the water, like a drop landing.
    //
    // Drawn in SCREEN space with the isometric squash applied to the radius,
    // not in the wobbled "suv" used by the surface. Two reasons: a ring in
    // "suv" inherits the wave wobble and comes out as a wandering blob rather
    // than a circle, and it inherits the iso flattening twice over. Here the
    // circle is honest and the squash is applied once, so it lies on the water
    // the way a real ripple would.
    //
    // Its EDGE is a hard line, not a gradient. The reference draws a one-pixel
    // circle that thins as it grows; a soft ring reads as a smudge, which is
    // what a smoothstep over a wide band gave.
    // One ring per ISOMETRIC CELL, jittered off its centre.
    //
    // The first version scattered rings on a square grid of its own, which is
    // a lattice the game does not have: rings landed between tiles, in rows
    // that did not follow the coast, and the only way to keep them near land
    // was a distance window that also let them cover the open sea.
    //
    // The board's own lattice is the right one. Inverting the isometric
    // projection turns a screen pixel into a cell, that cell's centre is the
    // ring's anchor, and "uRingJitter" pushes it off-centre by a seeded amount
    // so the result is not a visible grid. A ring is then born on an actual
    // edge tile — which is what "prend le centre des tiles aux extrémités"
    // asks for, and it needs no window to stay at the shore.
    float rings = 0.0;
    // THE BOARD'S OWN CELL, not one of the shader's making.
    //
    // This was derived from "uRingCell" before, which is the ring's radius —
    // so the lattice came out 1.64x the board's and every centre landed
    // between tiles instead of on one. "uTile" is the real half-diamond
    // (22 x 12 for this board), and the radius is now a separate number that
    // has no say in where a ring is born.
    vec2 halfCell = uTile;
    for (int g = 0; g < 2; g++) {
        // Two passes offset by half a cell along the lattice, so neighbouring
        // rings can overlap instead of sitting in a strict one-per-cell grid.
        vec2 shift = g == 0 ? vec2(0.0) : vec2(0.5, 0.5);
        // Screen -> cell, the same inverse the tile picker uses.
        vec2 cell = vec2(
            (px.x / halfCell.x + px.y / halfCell.y) * 0.5,
            (px.y / halfCell.y - px.x / halfCell.x) * 0.5
        ) - shift;
        vec2 cid = floor(cell);
        float rseed = hash(cid + float(g) * 31.7);
        // Cell -> screen, back to the centre of that diamond.
        vec2 base = cid + shift + 0.5;
        vec2 centre = vec2((base.x - base.y) * halfCell.x, (base.x + base.y) * halfCell.y);
        // Jitter, seeded so a cell always offsets the same way.
        centre += (vec2(hash(cid + 5.3), hash(cid + 11.7)) - 0.5) * uRingJitter;

        float cd = texture(uLand, (centre + uLandOrigin) / uSize).r;
        // Edge tiles only: in the water, and close to the land it touches.
        float inWindow = step(0.02, cd) * (1.0 - step(uRingReach, cd));
        float falloff = pow(1.0 - clamp(cd / uRingReach, 0.0, 1.0), uRingFade);
        float born = inWindow * mix(uRingFloor, 1.0, falloff);
        // Below the island first: that is where this camera shows water.
        float southness = clamp((centre.y - uSize.y * 0.40) / (uSize.y * 0.30), 0.0, 1.0);
        born *= mix(1.0, southness, uRingSouth);

        // Each ring waits its own turn, or the whole coast would pulse at once.
        float life = fract(uTime * uRingSpeed + rseed * 7.13);
        vec2 rlocal = px - centre;
        // Un-squash before measuring, so the circle is a circle.
        float rdist = length(vec2(rlocal.x, rlocal.y / uIsoSquash));
        float rad = life * uRingRadius * uRingSize;
        // Thins as it expands, the way a spreading ripple loses definition.
        float thick = mix(1.8, 0.7, life) * uPixel;
        // Hold, then fade — not a fade that starts the moment it opens.
        //
        // "(1.0 - life)" dimmed the ring in step with its own growth, so the
        // bigger it got the fainter it was: raising the radius produced
        // nothing but wider invisibility. A real ripple keeps its brightness
        // while it spreads and only gives out at the end, so the fade is held
        // off until "uRingHold" of the way through.
        // "max(..., 0.001)" rather than the dial raw: smoothstep with equal
        // bounds is undefined in GLSL and this driver answers 1.0, so a hold
        // of exactly 0 would leave every ring at full strength forever.
        float fade = 1.0 - smoothstep(max(uRingHold, 0.001), 1.0, life);
        rings += step(abs(rdist - rad), thick) * fade
               * step(uRingChance, rseed) * born;
    }

    float ringsOut = min(rings, 1.0) * uRings;
    col = mix(col, uEdgeColor, ringsOut);

    // --- step 15: glimmer particles --------------------------------------
    // Single bright pixels, briefly. The only step deliberately NOT smoothed:
    // a glimmer that fades in reads as a bloom, one that blinks reads as light
    // catching a facet.
    vec2 gg = floor(suv * 6.0);
    float gseed = hash(gg + 41.0);
    float blink = step(0.985, fract(gseed + uTime * 0.22));
    col += blink * uGlimmer;

    // (step 2, the land shadow, is not a shader step any more: it is the
    // island's own rendered silhouette, blurred and moved — see
    // fx/IslandShadow.ts, and the header for why a computed mask lost.)

    // --- step 4: land edge ------------------------------------------------
    // The lip of surf. Wobbled by the same field as the surface so it breathes
    // with the water rather than sitting on it as a clean outline.
    //
    // Guarded on uEdgeWidth > 0, because smoothstep with EQUAL bounds is
    // undefined in GLSL and this driver answers 1.0 — so a step switched off
    // painted its lip at full strength over the whole sea, which looked like
    // the shadow had turned white. Every step here has to be genuinely off
    // when its dial is zero, or the per-step stories show the wrong thing.
    if (uEdgeWidth > 0.0) {
        float edgeNoise = fbm(suv * 3.0 + uTime * 0.25) - 0.5;
        float e = dist + edgeNoise * 0.05;
        float edge = smoothstep(uEdgeWidth, 0.0, e);
        col = mix(col, uEdgeColor, edge);
    }

    // --- step 16: darken edges --------------------------------------------
    // The only step that varies colour with distance, and it works OUTWARD:
    // the open sea deepens far from the island, rather than the shore being
    // painted lighter. Same information, but it reads as depth instead of as
    // a halo stuck to the coastline.
    float open = smoothstep(0.30, 1.0, dist);
    col = mix(col, uShallow, (1.0 - open) * uDarkenEdges * 0.35);
    col *= 1.0 - open * uDarkenEdges;

    // --- step 12: size adjustment / quantise ------------------------------
    // Pixel art has a fixed palette; a shader has infinite colours. Snapping
    // the result to steps is what keeps it in the same medium as the tiles.
    col = floor(col * 22.0 + 0.5) / 22.0;

    // "uRingsOnly" turns this into an OVERLAY pass.
    //
    // The ring layer runs the whole shader over a full-screen plane above the
    // cast shadow, and even with a transparent plane it repainted the sea —
    // so the shadow underneath was simply covered up and none of its dials
    // appeared to do anything. In overlay mode only what the rings added is
    // emitted, premultiplied, so the pass contributes light and nothing else.
    if (uRingsOnly > 0.5) {
        float a = clamp(ringsOut, 0.0, 1.0);
        finalColor = vec4(uEdgeColor * a, a);
        return;
    }
    finalColor = vec4(col, 1.0);
}
`;

export interface WaterOptions {
  /**
   * The sea. One flat colour, edge to edge — step 1 of the reference.
   *
   * A turquoise rather than a navy: the island's own palette is warm green,
   * and a blue sea under it read as two unrelated pictures. This is also the
   * colour the story's canvas background and its base plane are set to, and
   * all three have to agree — a mismatch shows as a rim in the old colour
   * wherever the filter's area stops.
   */
  deep?: number;
  /** Colour close in to the shore. */
  shallow?: number;
  /** The surf lip against the land. */
  edgeColor?: number;
  /** How wide that lip is, as a share of the distance field. */
  edgeWidth?: number;
  /** Lattice height / width, so the surface lies on the ground plane. */
  isoSquash?: number;
  /**
   * The board's half-diamond in pixels, `[w/2, h/2]`.
   *
   * Step 5 anchors its rings on the board's own cells, so it needs the real
   * lattice rather than something derived from an effect's own numbers.
   */
  tile?: readonly [number, number];
  /** How many screen pixels one shader pixel spans. */
  pixelSize?: number;
}

const rgb = (hex: number) => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

/**
 * The sea, from step 1 to step 17.
 *
 * Every step is its own uniform rather than being folded into a single
 * "intensity": the whole point of following a step-by-step breakdown is that
 * each idea can be turned off on its own and looked at, which is what the
 * `Water` story does.
 */
/** The value each step takes when switched on. One source for game + stories. */
export const WATER_STEPS = {
  uWobble: 0.06,
  uEdgeWidth: 0.055,
  uRings: 0.85,
  uSurface: 0.14,
  uHighlights: 0.10,
  uLowlights: 0.07,
  uWaves: 0.20,
  uGlimmer: 0.30,
  uDarkenEdges: 0.22,
} as const;

export class WaterShader extends Filter {
  private elapsed = 0;

  /**
   * Every step starts at ZERO, including the ones with a tuned default above.
   *
   * A filter that ships its own defaults cannot be shown with a step switched
   * off: `Step 01 — flat colour` still had the edge darkening on, so the "flat
   * colour" picture came out as two tones and did not show what step 1 is. The
   * caller turns steps on; `WATER_STEPS` holds the tuned values.
   */
  constructor(land: Texture, options: WaterOptions = {}) {
    const o = {
      deep: 0x47aba9,
      shallow: 0x2fb3c9,
      edgeColor: 0xd9f5f2,
      edgeWidth: 0.055,
      isoSquash: 24 / 44,
      pixelSize: 2,
      tile: [22, 12] as const,
      ...options,
    };

    super({
      glProgram: GlProgram.from({ vertex, fragment }),
      resources: {
        uLand: land.source,
        waterUniforms: {
          uTime: { value: 0, type: 'f32' },
          uSize: { value: new Float32Array([960, 540]), type: 'vec2<f32>' },
          uIsoSquash: { value: o.isoSquash, type: 'f32' },
          uDeep: { value: new Float32Array(rgb(o.deep)), type: 'vec3<f32>' },
          uShallow: { value: new Float32Array(rgb(o.shallow)), type: 'vec3<f32>' },
          uWobble: { value: 0, type: 'f32' },
          uEdgeColor: { value: new Float32Array(rgb(o.edgeColor)), type: 'vec3<f32>' },
          uEdgeWidth: { value: 0, type: 'f32' },
          uRings: { value: 0, type: 'f32' },
          uTile: { value: new Float32Array(o.tile), type: 'vec2<f32>' },
          uRingRadius: { value: 96, type: 'f32' },
          uRingSpeed: { value: 0.16, type: 'f32' },
          uRingReach: { value: 0.16, type: 'f32' },
          uRingChance: { value: 0.62, type: 'f32' },
          uRingSize: { value: 1.0, type: 'f32' },
          uRingSouth: { value: 0.7, type: 'f32' },
          uRingFade: { value: 1.8, type: 'f32' },
          uRingFloor: { value: 0.22, type: 'f32' },
          uRingJitter: { value: 10, type: 'f32' },
          uRingHold: { value: 0.55, type: 'f32' },
          uSurface: { value: 0, type: 'f32' },
          uHighlights: { value: 0, type: 'f32' },
          uLowlights: { value: 0, type: 'f32' },
          uWaves: { value: 0, type: 'f32' },
          uGlimmer: { value: 0, type: 'f32' },
          uDarkenEdges: { value: 0, type: 'f32' },
          uPixel: { value: o.pixelSize, type: 'f32' },
          uRingsOnly: { value: 0, type: 'f32' },
          uLandOrigin: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
        },
      },
    });
  }

  /** Advance the water. `deltaMs` is real milliseconds. */
  update(deltaMs: number): void {
    this.elapsed += deltaMs / 1000;
    this.resources.waterUniforms.uniforms.uTime = this.elapsed;
  }

  /**
   * Where the land field's (0,0) sits in stage coordinates.
   *
   * Zero when the field was rasterised from the stage origin, which is the
   * normal case; non-zero when the scene's own bounds start somewhere else.
   */
  setLandOrigin(x: number, y: number): void {
    const o = this.resources.waterUniforms.uniforms.uLandOrigin as Float32Array;
    o[0] = x;
    o[1] = y;
  }

  /** Tell the shader how large the area it covers is, in pixels. */
  resize(width: number, height: number): void {
    const s = this.resources.waterUniforms.uniforms.uSize as Float32Array;
    s[0] = width;
    s[1] = height;
  }

  /** Set one step's strength by name, for the story's controls. */
  setStep(name: string, value: number): void {
    const u = this.resources.waterUniforms.uniforms as Record<string, unknown>;
    if (name in u) u[name] = value;
  }
}
