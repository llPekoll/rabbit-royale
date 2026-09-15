/**
 * Depth under the island, as a gradient rather than as a flat sea.
 *
 * The canvas background used to BE the water: `BG_COLOR`, one colour edge to
 * edge. On a wide screen that reads as a blue sheet of paper with an island
 * glued to it — nothing says the island is sitting IN something. What a
 * painter would do is light the shallow shelf the land stands on and let the
 * water deepen away from it. That is one shape, so it is one plane in the
 * display list, mounted on the STAGE (see `Application.ts`) so the pool of
 * light stays put while the camera pans the island through it.
 *
 * The direction matters and it is the opposite of this file's first draft:
 * `sea` is the colour out at the EDGES and it is the dark one; `deep` is the
 * pale shallow under the island. The names are read as "where the plane ends
 * up" and "what it pools toward", not as depths.
 *
 * ## Radial, and why it is not concentric
 *
 * A round radial gradient centred on the island reads as a spotlight: the
 * lattice is 44x24, so the island is far wider than it is tall, and a circle
 * round it leaves the water pale above and below the coast and dark at the
 * tips. `uAspect` stretches the falloff on X, and `uAngle` tilts the result
 * onto the island's own diagonal, so the pool is the shape of the thing it
 * is lighting rather than square to the screen.
 *
 * ## Linear, kept alongside
 *
 * The other reading of the same idea: the water simply deepens toward the
 * bottom of the frame, the way a horizon does. It costs one branch and the
 * two are genuinely hard to choose between before you have seen both on the
 * real island, so both ship and `mode` picks. The story exists to make that
 * choice.
 *
 * ## Why a mesh and not a filter
 *
 * The same reason `SurfaceTexture` is one: a filter is padded and clipped to
 * whatever region Pixi decided to filter, which is what put a halo round the
 * seventeen-step water shader this replaced. A mesh is a child — "under
 * everything" is just the order it was added in.
 *
 * Both gradients are QUANTISED to a handful of steps before they are drawn.
 * A smooth ramp is the one thing that betrays a post-process laid over pixel
 * art: the tiles have a fixed palette and a 256-step gradient does not.
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
    // The quad carries its size in its own vertices, so this is a pass
    // through: "vUv" is already in pixels and Pixi can measure the mesh.
    vUv = aPosition;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
`;

const fragment = `
precision highp float;

in vec2 vUv;
out vec4 finalColor;

uniform vec2  uSize;      // the plane, in pixels
uniform vec3  uSea;       // the far water — the flat colour this starts from
uniform vec3  uDeep;      // the colour under the island
uniform vec2  uCenter;    // where the deep sits, 0..1 of the plane
uniform float uRadius;    // how far the deep reaches, as a share of the plane
uniform float uAspect;    // x stretch of the falloff, for the iso lattice
uniform float uSoftness;  // how gradual the ramp from deep to sea is
uniform float uStrength;  // how much of uDeep is allowed in at the centre
uniform float uAngle;     // radial: tilt of the ellipse's long axis.
                          // linear: 0 = deep at the bottom. Radians, both.
uniform float uMode;      // 0 = radial, 1 = linear
uniform float uSteps;     // palette steps; 0 leaves the ramp smooth

void main(void) {
    vec2 uv = vUv / uSize;

    float t;
    if (uMode < 0.5) {
        // Radial. The offset is measured from the centre, ROTATED onto the
        // ellipse's own axes, and only then stretched on X — so the pool of
        // dark is an ellipse of the board's proportions, lying along whatever
        // direction "uAngle" points.
        //
        // Measured in PIXELS, not in the 0..1 uv. The frame is 960x540, so a
        // rotation applied to normalised coordinates comes out sheared: the
        // ellipse's long axis bends as it turns and the shape stops being an
        // ellipse at all except at 0 and 90 degrees. Multiplying back by
        // "uSize" turns the plane square again, the rotation is honest there,
        // and dividing by uSize.y at the end puts the radius back on the same
        // scale it had before — a share of the frame's HEIGHT, so the dial
        // keeps the meaning it was tuned with.
        vec2 d = (uv - uCenter) * uSize;
        float ca = cos(uAngle);
        float sa = sin(uAngle);
        d = vec2(d.x * ca + d.y * sa, -d.x * sa + d.y * ca);
        d.x /= max(uAspect, 0.0001);
        float r = length(d) / uSize.y / max(uRadius, 0.0001);
        // 1 at the centre, 0 out at sea. "uSoftness" widens the band the ramp
        // happens over; at 0 it is a hard disc, which is a legitimate look on
        // pixel art and worth being reachable.
        t = 1.0 - smoothstep(1.0 - clamp(uSoftness, 0.0, 1.0), 1.0, r);
    } else {
        // Linear. Projected onto the axis "uAngle" points along, with 0
        // meaning the deep is at the BOTTOM of the frame — the reading that
        // matches a camera looking out to a horizon.
        vec2 axis = vec2(sin(uAngle), cos(uAngle));
        float p = dot(uv - uCenter, axis) + 0.5;
        t = smoothstep(0.5 - clamp(uSoftness, 0.0, 1.0) * 0.5,
                       0.5 + clamp(uSoftness, 0.0, 1.0) * 0.5,
                       p);
    }

    t *= uStrength;

    // Quantise the RAMP, not the colour: stepping the mix keeps the result on
    // the line between the two chosen colours, so no step can drift into a
    // hue neither of them has. Stepping the final rgb (which is what the old
    // shader did) is what gave banding a slight colour of its own.
    if (uSteps > 0.5) t = floor(t * uSteps + 0.5) / uSteps;

    finalColor = vec4(mix(uSea, uDeep, clamp(t, 0.0, 1.0)), 1.0);
}
`;

export interface SeaGradientOptions {
  /** 'radial' pools the deep under the island; 'linear' sinks it downward. */
  mode?: 'radial' | 'linear';
  /** The water at the EDGES. Match the canvas background, or the plane shows
   *  as a box. In the shipped look this is the DARK open sea. */
  sea?: number;
  /** What the plane pools toward at its centre — the pale shallow the island
   *  stands in. */
  deep?: number;
  /** Where the deep sits, as a share of the plane. */
  center?: readonly [number, number];
  /** How far the deep reaches, as a share of the plane. Radial only. */
  radius?: number;
  /** X stretch of the falloff, so the pool matches the lattice. Radial only. */
  aspect?: number;
  /** How gradual the ramp is, 0 (hard edge) to 1. */
  softness?: number;
  /** How much of `deep` is allowed in at its strongest, 0 to 1. */
  strength?: number;
  /**
   * Radians.
   *
   * Radial: the tilt of the ellipse's long axis, which is what lays the pool
   * along the island's own diagonal instead of square to the screen. Positive
   * turns it clockwise, the direction the board's x axis runs.
   *
   * Linear: 0 puts the deep at the bottom of the frame.
   */
  angle?: number;
  /** Palette steps in the ramp. 0 leaves it smooth. */
  steps?: number;
}

const rgb = (hex: number) => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

export interface SeaGradient {
  /** Add this UNDER everything else on the sea, over the background. */
  readonly view: Mesh<Geometry, Shader>;
  /** Resize the plane. */
  resize(width: number, height: number): void;
  /** Set one dial by uniform name, for the story's controls. */
  set(name: string, value: number): void;
  /** Move the deep, as a share of the plane. */
  setCenter(x: number, y: number): void;
  /** Recolour without rebuilding. */
  setColors(sea: number, deep: number): void;
  destroy(): void;
}

/**
 * A plane of deep water, to lie under everything on the sea.
 *
 * Sized in pixels and positioned by the caller like any other display object.
 * There is no `update`: nothing here moves. The water's motion is
 * `SurfaceTexture`'s job, and this is the ground it moves over.
 */
export function createSeaGradient(
  width: number,
  height: number,
  options: SeaGradientOptions = {},
): SeaGradient {
  const o = {
    mode: 'radial' as const,
    sea: 0x0d5f8c,
    deep: 0x1eaac4,
    center: [0.5, 0.55] as const,
    radius: 0.5,
    /**
     * A TRUE ellipse ratio: the pool is 3.3x wider than it is tall.
     *
     * Not the board's 44/24 this started at. The offset is measured in pixels
     * now (see the fragment), so this is a real proportion; before the
     * rotation landed it was measured in the 0..1 uv, where the frame's own
     * 960x540 silently multiplied it by 16/9. 1.85 there was 3.29 on screen,
     * and 3.29 is what was actually tuned and liked — so that is the number,
     * written in the units it is now read in.
     */
    aspect: 3.25,
    softness: 0.56,
    strength: 1,
    /** Tilted onto the island's own diagonal, which is what puts the pool in
     *  perspective rather than square to the screen. */
    angle: (175 * Math.PI) / 180,
    steps: 40,
    ...options,
  };

  // A quad sized in PIXELS, not a unit quad scaled in the vertex shader —
  // Pixi measures geometry on the CPU and never sees a shader-side multiply,
  // so a scaled unit quad reports 1x1 bounds and gets culled. See the same
  // note in `SurfaceTexture`.
  const quad = (w: number, h: number) => new Float32Array([0, 0, w, 0, w, h, 0, h]);
  const geometry = new Geometry({
    attributes: { aPosition: quad(width, height) },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  });

  const shader = Shader.from({
    gl: { vertex, fragment },
    resources: {
      gradientUniforms: {
        uSize: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
        uSea: { value: new Float32Array(rgb(o.sea)), type: 'vec3<f32>' },
        uDeep: { value: new Float32Array(rgb(o.deep)), type: 'vec3<f32>' },
        uCenter: { value: new Float32Array(o.center), type: 'vec2<f32>' },
        uRadius: { value: o.radius, type: 'f32' },
        uAspect: { value: o.aspect, type: 'f32' },
        uSoftness: { value: o.softness, type: 'f32' },
        uStrength: { value: o.strength, type: 'f32' },
        uAngle: { value: o.angle, type: 'f32' },
        uMode: { value: o.mode === 'linear' ? 1 : 0, type: 'f32' },
        uSteps: { value: o.steps, type: 'f32' },
      },
    },
  });

  const view = new Mesh({ geometry, shader });
  const uniforms = shader.resources.gradientUniforms.uniforms as Record<string, unknown>;

  return {
    view,
    resize(w, h) {
      const buf = geometry.getBuffer('aPosition');
      buf.data = quad(w, h);
      buf.update();
      const s = uniforms.uSize as Float32Array;
      s[0] = w;
      s[1] = h;
    },
    set(name, value) {
      if (name in uniforms) uniforms[name] = value;
    },
    setCenter(x, y) {
      const c = uniforms.uCenter as Float32Array;
      c[0] = x;
      c[1] = y;
    },
    setColors(sea, deep) {
      const s = uniforms.uSea as Float32Array;
      const d = uniforms.uDeep as Float32Array;
      s.set(rgb(sea));
      d.set(rgb(deep));
    },
    destroy() {
      view.destroy();
      geometry.destroy();
      shader.destroy();
    },
  };
}
