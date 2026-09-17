/**
 * A dithered window through everything drawn IN FRONT of the player.
 *
 * The island used to handle cover by kind: a tree the rabbit stood behind
 * went to 45% alpha, a bush to 40%, a rock stayed solid (`fadeTo` in
 * `blocking.ts`). Two things were wrong with it. It only looked one row
 * ahead, so a pine two cells nearer the camera — which is still three cells
 * tall and still over the rabbit — stayed opaque and swallowed the player.
 * And it faded, which is not what pixel art does: every pixel of the tree
 * went equally milky, like a PNG with its opacity slider pulled down.
 *
 * This does neither. It is a DEPTH TEST and a DISC:
 *
 *   - depth: every sibling of the rabbit that sorts after it — `zIndex`
 *     greater than the rabbit's, which on the island's ruler means "drawn on
 *     top of it" — is a candidate. Not "a tree", not "one row ahead":
 *     whatever the painter's order puts between the camera and the player.
 *   - disc: of those, the ones whose picture actually reaches a circle around
 *     the rabbit get the filter, and the filter drops every one of their
 *     pixels inside the circle. Around the rim the drop is graded — fully
 *     open at `radius`, untouched at `radius + feather` — and the grade is
 *     an ordered dither: a pixel is kept whole or removed whole, and the
 *     Bayer matrix decides which in a fixed order, so the ring is a stable
 *     stipple rather than a soft blur or crawling noise.
 *
 * ## Where the circle is measured
 *
 * In the SCREEN's space, and that is the load-bearing decision, twice over.
 *
 * The dither cell is `floor(devicePixel / dot)`: sampled in screen space the
 * dots are square and the same size on every sprite, whatever scale each is
 * drawn at. Sampled per texture the pattern would be glued to the sprite and
 * scale with it — a 0.4x tree carrying a smeared checker that reads as a
 * compression artefact.
 *
 * And the fragment's screen position is rebuilt from Pixi's own filter
 * globals rather than read off `gl_FragCoord`. A filter renders into a
 * temporary texture cut to the sprite's bounds, so `gl_FragCoord` counts from
 * that texture's corner; worse, it counts from the BOTTOM when the target is
 * the canvas and from the TOP when it is another texture — and in the game
 * every one of these passes runs inside the bloom on the root, i.e. into a
 * texture, while in a story it runs straight onto the canvas. One formula
 * that holds in both: the frame's origin (`uOutputFrame.xy`, relative to the
 * surface being drawn on) plus that surface's own origin (`uGlobalFrame.xy`,
 * in device pixels) plus the fragment's offset inside the frame.
 *
 * ## Cost
 *
 * One filter pass per punched sprite, each cut to that sprite's bounds. The
 * driver keeps the set small: a depth window (`depthWindow`) throws out
 * everything more than a few rows ahead — which also excludes the sky and
 * cloud layers by construction, since they sort at 5000 and up — and a
 * bounds-against-circle test throws out the rest. On a busy cell that is a
 * handful of sprites; on open grass it is none, and a sprite that stops
 * qualifying has its filter REMOVED, not left on at zero.
 */
import { Bounds, Container, Filter, GlProgram, Point, type PointData, type Renderer } from 'pixi.js';

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
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;

// Pixi's own filter globals, redeclared here with an EXPLICIT precision.
//
// The vertex shader declares them at its default (highp) and a fragment
// shader defaults to mediump, and a uniform declared at two precisions fails
// to LINK — the sprite goes black with the reason only in a console warning.
// Spelling the precision out is what lets the fragment read them at all.
//
//   uInputSize.xy    the input texture's size, in frame (CSS) pixels
//   uOutputFrame.xy  where this pass's frame sits on the surface it draws to
//   uGlobalFrame.xy  where that surface sits on the canvas, in DEVICE pixels
uniform highp vec4 uInputSize;
uniform highp vec4 uOutputFrame;
uniform highp vec4 uGlobalFrame;

/** Where the hole is centred, in CSS pixels from the canvas top-left. */
uniform vec2 uCenter;
/** Radius of the fully open disc, in CSS pixels. */
uniform float uRadius;
/** Width of the dithered ring past the radius, in CSS pixels. */
uniform float uFeather;
/** How many DEVICE pixels one dither dot spans. */
uniform float uDot;
/** Bayer order as a bit count: 1 = 2x2, 2 = 4x4, 3 = 8x8. */
uniform float uBits;
/** What is left of a removed pixel, as an alpha multiplier. */
uniform float uGhost;
/** Device pixels per CSS pixel, to undo uGlobalFrame's scaling. */
uniform float uResolution;

/**
 * The ordered-dither threshold of a cell, in 0..1, for a 2^bits square
 * Bayer matrix.
 *
 * Built bit by bit rather than looked up: GLSL ES 1.00 has neither array
 * constructors nor dynamic array indexing, so a table is rejected twice
 * over. The recurrence is the matrix itself — M(2n) = [[4M, 4M+2], [4M+3,
 * 4M+1]] — read off the coordinates' bits: the LEAST significant bit of
 * (x, y) decides the MOST significant base-4 digit, and each digit is
 * (x xor y) * 2 + y. Written with mod/floor because there are no integer
 * bit operators either.
 */
float bayer(vec2 cell, float bits) {
    float size = pow(2.0, bits);
    float x = mod(cell.x, size);
    float y = mod(cell.y, size);
    float v = 0.0;
    float weight = size * size / 4.0;
    for (int i = 0; i < 3; i++) {
        if (float(i) >= bits) break;
        float xb = mod(x, 2.0);
        float yb = mod(y, 2.0);
        // XOR of two bits, without an integer XOR: a + b - 2ab.
        float xr = xb + yb - 2.0 * xb * yb;
        v += (xr * 2.0 + yb) * weight;
        weight /= 4.0;
        x = floor(x / 2.0);
        y = floor(y / 2.0);
    }
    return (v + 0.5) / (size * size);
}

void main() {
    vec4 color = texture(uTexture, vTextureCoord);
    // Nothing to remove where the sprite is already empty.
    if (color.a <= 0.001) {
        finalColor = color;
        return;
    }

    // This fragment's position on the CANVAS, in CSS pixels — see the note at
    // the top of the file on why this is not gl_FragCoord.
    vec2 canvasPos = uOutputFrame.xy
        + uGlobalFrame.xy / uResolution
        + vTextureCoord * uInputSize.xy;

    // How much of this pixel's neighbourhood is asked to go: 1 inside the
    // radius, sliding to 0 at the far edge of the feather. Linear on purpose;
    // the dither already softens it, and an eased curve on top reads as a blur.
    float d = distance(canvasPos, uCenter);
    float cut = 1.0 - clamp((d - uRadius) / max(uFeather, 0.001), 0.0, 1.0);
    if (cut <= 0.0) {
        finalColor = color;
        return;
    }

    // The dither cell this pixel falls in, on the screen's own grid of dots.
    vec2 cell = floor(canvasPos * uResolution / max(uDot, 1.0));
    if (cut > bayer(cell, uBits)) {
        // Premultiplied, so the whole vector scales: a faint ghost of the
        // pixel rather than a hole, when uGhost is above zero.
        finalColor = color * uGhost;
        return;
    }
    finalColor = color;
}
`;

export interface DepthHoleOptions {
  /** Radius of the fully open disc, in the LAYER's pixels. */
  radius: number;
  /** Width of the dithered ring past the radius, in the layer's pixels. */
  feather: number;
  /**
   * Size of one dither dot, in the layer's pixels.
   *
   * 1 makes a dot exactly one art pixel at whatever the camera's zoom is,
   * which is what makes the stipple look punched out of the sprite rather
   * than laid over it. Rounded to whole device pixels at apply time.
   */
  dot: number;
  /** Bayer matrix size: 2, 4 or 8. */
  matrix: 2 | 4 | 8;
  /**
   * Alpha left on a removed pixel, 0..1.
   *
   * 0 punches a clean hole. A little above it — 0.1 — keeps a ghost of the
   * cover in the window, so the eye still knows what the rabbit is behind
   * without that thing being in the way.
   */
  ghost: number;
  /**
   * How far ahead of the subject to look, in `zIndex` units.
   *
   * Anything sorting further ahead than this is skipped without measuring
   * it. On the island's ruler a diagonal of cells is 16, so 12 rows is far
   * more than the tallest pine can reach back — and the sky, cloud and bird
   * layers, which sort in the thousands, never even get their bounds read.
   */
  depthWindow: number;
  /**
   * Things to leave alone even when they are in front and in the disc.
   *
   * For UI drawn INTO the sorted layer: the keyboard arrows sit half a step
   * above the tile they mark, so the one on the cell south of the rabbit is
   * "in front" by the ruler and would be dithered away just when it is
   * pointing at the obvious move.
   */
  exempt?: (child: Container) => boolean;
}

/** Bayer order as the bit count the shader loops over. */
const BITS: Record<2 | 4 | 8, number> = { 2: 1, 4: 2, 8: 3 };

/**
 * The window itself, as a Pixi filter. Geometry is in CANVAS CSS pixels; the
 * driver below converts from the layer's space and is the intended caller.
 */
export class DepthHoleFilter extends Filter {
  constructor(matrix: 2 | 4 | 8 = 4, ghost = 0) {
    super({
      glProgram: GlProgram.from({ vertex, fragment }),
      resources: {
        depthHoleUniforms: {
          uCenter: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
          uRadius: { value: 0, type: 'f32' },
          uFeather: { value: 1, type: 'f32' },
          uDot: { value: 1, type: 'f32' },
          uBits: { value: BITS[matrix], type: 'f32' },
          uGhost: { value: ghost, type: 'f32' },
          uResolution: { value: 1, type: 'f32' },
        },
      },
      // Nothing is sampled outside the pixel, so the frame needs no margin.
      padding: 0,
    });
  }

  private get u() {
    return this.resources.depthHoleUniforms.uniforms as {
      uCenter: Float32Array;
      uRadius: number;
      uFeather: number;
      uDot: number;
      uBits: number;
      uGhost: number;
      uResolution: number;
    };
  }

  set matrix(m: 2 | 4 | 8) { this.u.uBits = BITS[m]; }
  set ghost(a: number) { this.u.uGhost = Math.min(1, Math.max(0, a)); }

  /**
   * Put the hole at a canvas point. Everything in CSS pixels except `dot`,
   * which is device pixels — the dither grid is the screen's, not the page's.
   */
  set(centreX: number, centreY: number, radius: number, feather: number, dot: number, resolution: number): void {
    const u = this.u;
    u.uCenter[0] = centreX;
    u.uCenter[1] = centreY;
    u.uRadius = Math.max(0, radius);
    u.uFeather = Math.max(0.001, feather);
    u.uDot = Math.max(1, dot);
    u.uResolution = Math.max(0.01, resolution);
  }
}

/** The one thing the driver needs to know about the rabbit. */
export interface HoleSubject {
  /** In the sorted layer; its `zIndex` is the depth and its position the feet. */
  container: Container;
  /** The body, so the disc can be centred on it rather than on the feet. */
  sprite: { height: number };
}

/**
 * Drives one `DepthHoleFilter` over a sorted layer, frame by frame.
 *
 * ```ts
 * const hole = new DepthHole(DEPTH_HOLE_LOOK);
 * // every frame, after the rabbit has moved:
 * hole.update(scene, rabbit.container.zIndex, DepthHole.centreOf(rabbit), app.renderer);
 * // when the rabbit is gone:
 * hole.clear();
 * ```
 *
 * `layer` is the container that sorts the rabbit against what can cover it —
 * the scene's own container on the island, where the trees are deported to
 * sit as siblings of the tiles and the rabbits. The ground under it is one
 * child at -10 and is never a candidate, which is right: the ground is behind
 * the rabbit by construction.
 */
export class DepthHole {
  readonly filter: DepthHoleFilter;
  private readonly options: DepthHoleOptions;
  /** The children carrying the filter right now, to take it off again. */
  private holed = new Set<Container>();
  private readonly scratchPoint = new Point();
  private readonly scratchBounds = new Bounds();

  constructor(options: DepthHoleOptions) {
    this.options = { ...options };
    this.filter = new DepthHoleFilter(options.matrix, options.ghost);
  }

  /** The middle of a rabbit's body, in its layer's space. */
  static centreOf(subject: HoleSubject): PointData {
    // MEASURED, not read off the anchor. The bunny frame is 32px tall with
    // the body in its bottom half — opaque rows 17 to 31 on the idle frame —
    // and anchored at 0.9, so the body's middle is 0.15 of the sprite's
    // height above the feet. The obvious 0.4 (the frame's middle) put the
    // disc a third of a cell too high, which a 17px radius makes visible.
    return { x: subject.container.x, y: subject.container.y - subject.sprite.height * 0.15 };
  }

  /** Change the geometry; takes effect on the next `update`. */
  configure(patch: Partial<DepthHoleOptions>): void {
    Object.assign(this.options, patch);
    if (patch.matrix) this.filter.matrix = patch.matrix;
    if (patch.ghost !== undefined) this.filter.ghost = patch.ghost;
  }

  /**
   * Punch the hole for this frame.
   *
   * `subjectDepth` is the rabbit's `zIndex` in `layer`; `centre` is where
   * the disc goes, in `layer`'s own space. The subject itself is never
   * punched: it sorts at its own depth, and only STRICTLY greater qualifies.
   */
  update(layer: Container, subjectDepth: number, centre: PointData, renderer: Renderer): void {
    const { radius, feather, dot, depthWindow, exempt } = this.options;

    // The layer's scale on screen, so a radius given in board pixels comes
    // out the same size on the board whatever the camera is doing.
    const wt = layer.worldTransform;
    const scale = Math.sqrt(Math.abs(wt.a * wt.d - wt.b * wt.c)) || 1;
    const g = layer.toGlobal(centre, this.scratchPoint);
    const res = renderer.resolution;
    const reach = (radius + feather) * scale;
    this.filter.set(g.x, g.y, radius * scale, feather * scale, Math.round(dot * scale * res), res);

    const next = new Set<Container>();
    const ceiling = subjectDepth + depthWindow;
    for (const child of layer.children) {
      const z = child.zIndex;
      if (z <= subjectDepth || z > ceiling) continue;
      if (!child.visible || !child.renderable || child.destroyed) continue;
      if (exempt?.(child)) continue;
      // Does its picture reach the disc? Measured on the canvas, where the
      // disc is: the nearest point of the box to the centre, against the reach.
      const b = child.getBounds(false, this.scratchBounds);
      const nx = Math.min(Math.max(g.x, b.minX), b.maxX);
      const ny = Math.min(Math.max(g.y, b.minY), b.maxY);
      const dx = nx - g.x;
      const dy = ny - g.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      this.attach(child);
      next.add(child);
    }
    for (const child of this.holed) if (!next.has(child)) this.detach(child);
    this.holed = next;
  }

  /** Take the filter off everything — the rabbit left, or the scene did. */
  clear(): void {
    for (const child of this.holed) this.detach(child);
    this.holed.clear();
  }

  destroy(): void {
    this.clear();
    this.filter.destroy();
  }

  private attach(child: Container): void {
    const current = child.filters;
    if (current?.includes(this.filter)) return;
    // Alongside whatever it already carries (a drain, a flash), not instead.
    child.filters = current ? [...current, this.filter] : [this.filter];
  }

  private detach(child: Container): void {
    if (child.destroyed) return;
    const current = child.filters;
    if (!current?.includes(this.filter)) return;
    const rest = current.filter((f) => f !== this.filter);
    child.filters = rest.length ? rest : null;
  }
}
