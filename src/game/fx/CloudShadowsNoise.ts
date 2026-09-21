/**
 * Cloud shadows, cast on the ground — the procedural one.
 *
 * Same job as `fx/CloudShadows.ts` (a plane over the scene that darkens what
 * a cloud would shade, sampled on the isometric ground plane), but the cloud
 * field is NOISE computed in the fragment rather than a texture scrolled
 * across it. The texture version was tried first and looked like mould on
 * the water, for three reasons this one is built to avoid:
 *
 * - **Grain.** A satellite map has ragged fringes and speckle; thresholded,
 *   that is a mottle of small bites, not clouds. fBm at two or three octaves
 *   gives round, soft blobs with nothing smaller than the finest octave.
 * - **A frozen shape.** A fixed motif sliding over the picture reads as a
 *   decal, however it is projected. Here time is the noise's THIRD axis, so
 *   the plaques deform, split and merge as they drift — which is the one cue
 *   that says "there is weather above this" rather than "someone moved a
 *   stencil".
 * - **Scale.** Over an island this size a cloud shadow is two or three big
 *   soft plaques, not a scatter. `scale` is in noise cells across the plane,
 *   so 1.5 means a blob is about two-thirds of the frame.
 *
 * The noise is Ashima's 3D simplex (public domain, the standard one), with a
 * light domain warp so the blobs are not obviously the noise's own hexagonal
 * lumps. `coverage` and `edge` cut the field into shade: coverage is where in
 * the noise the shadow begins, edge how soft that line is.
 */
import { Container, Geometry, Mesh, Shader } from 'pixi.js';

const vertex = `
in vec2 aPosition;
out vec2 vScreen;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main(void) {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    // Size in the vertices, not a scaled unit quad (see SurfaceTexture.ts:
    // scaling in the shader leaves Pixi's bounds at 1x1 and the mesh culls).
    vScreen = aPosition;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
`;

const fragment = `
precision highp float;

in vec2 vScreen;
out vec4 finalColor;

uniform vec2  uSize;
uniform vec2  uHalfTile;
uniform vec2  uGroundSpan;
uniform float uIso;
uniform float uTime;
uniform float uScale;
uniform vec2  uDrift;
uniform float uMorph;
uniform float uOctaves;
uniform float uWarp;
uniform float uCoverage;
uniform float uEdge;
uniform float uPixel;
uniform vec3  uColor;
uniform float uAlpha;
uniform float uLit;
uniform float uRim;
uniform vec3  uColorB;
uniform float uGradient;
uniform float uBreath;

// --- Ashima simplex 3D (Ian McEwan / Stefan Gustavson), verbatim ---------
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
// -------------------------------------------------------------------------

// Fractal sum. Each octave twice as fine and half as loud; uOctaves may be
// fractional, and the last one fades in so the dial is continuous.
float fbm(vec3 p) {
    float sum = 0.0, amp = 0.5, norm = 0.0;
    for (int i = 0; i < 4; i++) {
        float w = clamp(uOctaves - float(i), 0.0, 1.0);
        sum += amp * w * snoise(p);
        norm += amp * w;
        p = p * 2.03 + vec3(17.0, 31.0, 7.0);
        amp *= 0.5;
    }
    return sum / max(norm, 1e-4);
}

// The plane pixel in the board's cell space — the ground plane. Inverse of
// gridConfig's projection, normalised by the span (see CloudShadows.ts).
vec2 groundUv(vec2 p) {
    float u = p.x / (2.0 * uHalfTile.x);
    float v = p.y / (2.0 * uHalfTile.y);
    return vec2(u + v, v - u) / uGroundSpan;
}

void main(void) {
    vec2 p = vScreen;
    if (uPixel > 0.0) p = floor(p / uPixel) * uPixel + uPixel * 0.5;

    vec2 uv = mix(p / uSize, groundUv(p), uIso);
    vec2 q = uv * uScale + uTime * uDrift;
    float t = uTime * uMorph;

    // Domain warp: bend the lookup by a coarser noise so the blobs stop
    // looking like the lattice they come from.
    vec2 w = vec2(
        snoise(vec3(q * 0.5 + 3.1, t * 0.7)),
        snoise(vec3(q * 0.5 - 5.7, t * 0.7 + 9.0))
    );
    q += w * uWarp;

    float n = fbm(vec3(q, t)) * 0.5 + 0.5;
    float m = smoothstep(uCoverage - uEdge, uCoverage + uEdge, n);

    // uLit = 0 : l'ombre elle-meme. uLit = 1 : ce que le nuage ne couvre pas.
    // Le second plan se monte en 'overlay' et rechauffe au lieu d'assombrir.
    //
    // uRim resserre la couche claire sur la FRANGE du nuage plutot que sur
    // tout le champ degage : le pic est juste apres le bord, et retombe sur
    // uRim largeurs d'edge. A 0 la frange s'ouvre au champ entier, donc le
    // dial est continu entre les deux lectures.
    //
    // Le sens du seuil : n MONTE vers le clair, donc m vaut 1 sous le nuage
    // et l'ourlet vit SOUS uCoverage - uEdge, du cote degage du bord.
    float lit = 1.0 - m;
    if (uRim > 0.0) {
        float far = uCoverage - uEdge * (1.0 + 2.0 * uRim);
        lit = (1.0 - m) * smoothstep(far, uCoverage - uEdge, n);
    }

    float a = mix(m, clamp(lit, 0.0, 1.0), uLit) * uAlpha;

    // Le degrade vertical, en espace PLAN et pas en espace sol : le soleil
    // est haut dans le ciel, sa chaleur descend tout droit, elle ne suit pas
    // la projection iso. Passer par groundUv ici inclinerait la bande et on
    // lirait une diagonale posee sur l'ile au lieu d'une lumiere venue d'en
    // haut. p.y est deja en pixels du plan monte, donc la division suffit.
    //
    // uGradient dose le melange : 0 garde uColor seule (le comportement
    // d'avant), 1 va franchement de uColor en haut a uColorB en bas.
    vec3 tint = mix(uColor, uColorB, clamp(p.y / uSize.y, 0.0, 1.0) * uGradient);

    // L'opacite respire avec la COUVERTURE, et les deux couches respirent en
    // SENS CONTRAIRE — c'est tout l'interet, et se tromper de signe donne un
    // ciel qui ne veut rien dire :
    //
    //   - beaucoup de nuages -> l'ombre pese PLUS, le soleil pese MOINS.
    //     Un ciel couvert n'a pas de percee ; la chaleur doit s'eteindre.
    //   - ciel degage -> l'ombre s'efface, le soleil tape franc.
    //
    // uCoverage est un SEUIL et il descend quand le ciel se charge (plus il
    // est bas, plus de bruit passe en ombre). Donc (0.55 - uCoverage) monte
    // avec les nuages : c'est le sens de l'ombre, et la lumiere prend
    // l'oppose via uLit.
    //
    // Reference 0.55, le milieu de la plage min/max habituelle : a cette
    // couverture le facteur vaut 1 et le reglage d'alpha est celui qu'on a
    // sous les yeux dans les sliders.
    float weather = (0.55 - uCoverage) / 0.25;
    float sign = mix(1.0, -1.0, uLit);
    a *= clamp(1.0 + uBreath * weather * sign, 0.0, 2.0);

    finalColor = vec4(tint * clamp(a, 0.0, 1.0), clamp(a, 0.0, 1.0));
}
`;

export interface CloudShadowNoiseOptions {
  halfW?: number;
  halfH?: number;
  /** 0 = screen space, 1 = ground plane. */
  iso?: number;
  /** Noise cells across the plane. Smaller = bigger clouds. */
  scale?: number;
  /** Drift speed in noise cells per second. */
  speed?: number;
  /** Drift heading in degrees, in ground space. */
  angle?: number;
  /** How fast the shapes themselves change, in noise units per second. */
  morph?: number;
  /** Octaves of detail, 1 to 4. Fractional fades the last one in. */
  octaves?: number;
  /** Domain warp strength. 0 leaves the raw noise. */
  warp?: number;
  /**
   * Where in the noise (0..1) shade begins. Lower = more cloud.
   *
   * This is the STARTING value; when `coverageMin`/`coverageMax` differ the
   * weather wanders between them and this is only where it wakes up.
   */
  coverage?: number;
  /**
   * The weather. Coverage drifts between these two over `weatherPeriod`
   * seconds — a clear spell, then a broken sky, then clear again — so the
   * island is not under the same amount of cloud all session. Set both to
   * `coverage` for a fixed sky.
   */
  coverageMin?: number;
  coverageMax?: number;
  /** Seconds for one clear-to-overcast-to-clear swing. */
  weatherPeriod?: number;
  /** Half-width of the soft edge, in noise value. */
  edge?: number;
  /** Pixel-snap size on the plane, 0 for none. */
  pixel?: number;
  color?: number;
  alpha?: number;
  /**
   * 0 = the shadow (what ships). 1 = the LIGHT, what the cloud leaves clear.
   *
   * A lit plane is the same noise read the other way round, and it is meant
   * to be mounted in `overlay` on TOP of the shadow one — see `mountSunWarm`.
   * Overlay multiplies the darks and screens the lights, so a pale yellow
   * warms the island instead of ADDING photons the way the god rays do; an
   * additive pass on the same pixels as `fx/GodRays.ts` blows out.
   */
  lit?: number;
  /**
   * With `lit`, how tightly the light hugs the cloud's edge.
   *
   * 0 lights the whole clear field — weather: the island breathes warm when
   * the sky opens. Above 0 it keeps only a band of that many `edge` widths
   * just outside the plaque — a gold seam running along the shadow, which
   * reads more as deliberate pixel art. Ignored when `lit` is 0.
   */
  rim?: number;
  /**
   * The colour the tint reaches at the BOTTOM of the plane, with `gradient`.
   *
   * On the lit layer this is what makes the warmth read as a sun rather than
   * a filter: yellow high on the island, orange as it comes down. `color`
   * stays the top.
   */
  colorB?: number;
  /**
   * How far the tint travels from `color` to `colorB`, top to bottom.
   *
   * 0 keeps `color` flat over the whole plane — the old behaviour. 1 is the
   * full sweep. The ramp runs down the PLANE, not the ground projection: the
   * sun is overhead, so its warmth falls straight down the picture.
   */
  gradient?: number;
  /**
   * How much the layer's opacity follows the weather, 0 to about 1.
   *
   * At 0 the alpha is the one in the slider whatever the sky. Above it, the
   * two layers swing OPPOSITE ways around that value, which is the point:
   * clouds and sun cannot both be strong at once.
   *
   *   - the SHADOW layer weighs more under a covered sky, less under a clear
   *     one;
   *   - the LIT layer does the reverse, and a thick enough sky puts it out
   *     entirely — an overcast island gets no sunbeam.
   *
   * It reads the live coverage, so it only moves when `coverageMin` and
   * `coverageMax` differ.
   */
  breath?: number;
}

/**
 * The look as tuned by eye in `Island/Cloud Shadows (noise)` on 2026-09-14.
 *
 * `iso` at 0.4 rather than 1: the full ground projection squashed the
 * plaques into thin diagonal streaks, and screen space made them stains on
 * the picture. Part way between reads as shade lying on a slope. `octaves`
 * near 4 and `pixel` 3 give the edge the same stepped grain as the tiles.
 */
export const CLOUD_SHADOW_NOISE_DEFAULTS = {
  halfW: 22,
  halfH: 12,
  iso: 0.4,
  scale: 2.9,
  speed: 0.05,
  angle: 40,
  morph: 0.05,
  octaves: 3.9,
  warp: 0.1,
  coverage: 0.57,
  coverageMin: 0.3,
  coverageMax: 0.8,
  weatherPeriod: 240,
  edge: 0.08,
  pixel: 3,
  color: 0x10203a,
  alpha: 0.32,
  lit: 0,
  rim: 0,
  colorB: 0x10203a,
  gradient: 0,
  breath: 0,
} as const;

/**
 * La couche CLAIRE, a poser par-dessus l'ombre (voir `mountSunWarm`).
 *
 * Le jaune est pale et l'alpha bas exprès : en `overlay` la couleur n'est pas
 * peinte, elle module. Un jaune sature a alpha fort vire l'ile au citron ;
 * ces valeurs-la se lisent comme du soleil sur le gazon et laissent la mer
 * bleue. `rim` a 0 ouvre la lumiere a tout le champ degage — mets-le a 2 ou 3
 * pour la version liseré.
 *
 * Le degrade va du jaune en haut a l'orange en bas (`colorB`), parce qu'une
 * teinte unique posee sur toute la hauteur se lit comme un filtre colle a
 * l'objectif ; la rampe donne une direction a la lumiere. Les deux teintes
 * sont TRES lavees et l'alpha bas : regle plus franc (0xffe9a8 a 0.18, le
 * premier jet), le jaune se voyait comme une couleur posee sur l'ile au lieu
 * de passer pour de la lumiere. On veut le sentir, pas le nommer.
 *
 * `breath` a 0.5 fait peser la couche selon la couverture du moment, pour
 * qu'un ciel charge ne se distingue pas d'un ciel clair par le seul dessin
 * des plaques.
 */
export const CLOUD_LIGHT_DEFAULTS = {
  lit: 1,
  rim: 0,
  color: 0xfff2cf,
  colorB: 0xffb277,
  gradient: 1,
  breath: 0.5,
  alpha: 0.11,
} as const;

const rgb = (hex: number) => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];

const heading = (speed: number, angleDeg: number) => {
  const a = (angleDeg * Math.PI) / 180;
  return new Float32Array([Math.cos(a) * speed, Math.sin(a) * speed]);
};

export interface CloudShadowsNoise {
  readonly view: Mesh<Geometry, Shader>;
  update(deltaMs: number): void;
  set(name: keyof CloudShadowNoiseOptions, value: number): void;
  /**
   * La couverture EFFECTIVE de cette frame, pas celle passee aux options.
   *
   * La meteo la fait deriver entre `coverageMin` et `coverageMax` a chaque
   * `update`, donc la valeur de depart ne dit plus ou est le seuil au bout de
   * quelques secondes. Les rais de lumiere lisent ce meme seuil pour savoir
   * ou s'eteindre (voir `fx/GodRays.ts`) : sans ce getter ils resteraient sur
   * la couverture initiale et les deux effets decriraient deux ciels
   * differents des que le temps change.
   */
  readonly coverage: number;
  destroy(): void;
}

export function createCloudShadowsNoise(
  width: number,
  height: number,
  options: CloudShadowNoiseOptions = {},
): CloudShadowsNoise {
  const o = { ...CLOUD_SHADOW_NOISE_DEFAULTS, ...options };
  const span = width / (2 * o.halfW) + height / (2 * o.halfH);

  const quad = (w: number, h: number) => new Float32Array([0, 0, w, 0, w, h, 0, h]);
  const geometry = new Geometry({
    attributes: { aPosition: quad(width, height) },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  });

  const shader = Shader.from({
    gl: { vertex, fragment },
    resources: {
      shadowUniforms: {
        uSize: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
        uHalfTile: { value: new Float32Array([o.halfW, o.halfH]), type: 'vec2<f32>' },
        uGroundSpan: { value: new Float32Array([span, span]), type: 'vec2<f32>' },
        uIso: { value: o.iso, type: 'f32' },
        uTime: { value: 0, type: 'f32' },
        uScale: { value: o.scale, type: 'f32' },
        uDrift: { value: heading(o.speed, o.angle), type: 'vec2<f32>' },
        uMorph: { value: o.morph, type: 'f32' },
        uOctaves: { value: o.octaves, type: 'f32' },
        uWarp: { value: o.warp, type: 'f32' },
        uCoverage: { value: o.coverage, type: 'f32' },
        uEdge: { value: o.edge, type: 'f32' },
        uPixel: { value: o.pixel, type: 'f32' },
        uColor: { value: new Float32Array(rgb(o.color)), type: 'vec3<f32>' },
        uAlpha: { value: o.alpha, type: 'f32' },
        uLit: { value: o.lit, type: 'f32' },
        uRim: { value: o.rim, type: 'f32' },
        uColorB: { value: new Float32Array(rgb(o.colorB)), type: 'vec3<f32>' },
        uGradient: { value: o.gradient, type: 'f32' },
        uBreath: { value: o.breath, type: 'f32' },
      },
    },
  });

  const view = new Mesh({ geometry, shader });
  const uniforms = shader.resources.shadowUniforms.uniforms as Record<string, unknown>;

  const scalar: Partial<Record<keyof CloudShadowNoiseOptions, string>> = {
    iso: 'uIso', scale: 'uScale', morph: 'uMorph', octaves: 'uOctaves', warp: 'uWarp',
    coverage: 'uCoverage', edge: 'uEdge', pixel: 'uPixel', alpha: 'uAlpha',
    lit: 'uLit', rim: 'uRim', gradient: 'uGradient', breath: 'uBreath',
  };

  let elapsed = 0;
  /**
   * The weather's phase, started so the first frame is at `coverage`.
   *
   * Two sines at incommensurate periods, so the swing is not a metronome: a
   * short clear spell can follow a long one. Both are normalised to 0..1
   * before the lerp.
   */
  const weather = (t: number) =>
    0.5 + 0.25 * Math.sin((2 * Math.PI * t) / o.weatherPeriod)
        + 0.25 * Math.sin((2 * Math.PI * t) / (o.weatherPeriod * 0.37) + 1.3);
  const startPhase = (() => {
    const span = o.coverageMax - o.coverageMin;
    if (span <= 0) return 0;
    // Search the first period for the phase whose weather matches `coverage`.
    const want = Math.min(1, Math.max(0, (o.coverage - o.coverageMin) / span));
    let best = 0, bestErr = Infinity;
    for (let i = 0; i < 200; i++) {
      const t = (i / 200) * o.weatherPeriod;
      const err = Math.abs(weather(t) - want);
      if (err < bestErr) { bestErr = err; best = t; }
    }
    return best;
  })();

  return {
    view,
    get coverage() { return uniforms.uCoverage as number; },
    update(deltaMs) {
      elapsed += deltaMs / 1000;
      uniforms.uTime = elapsed;
      if (o.coverageMax > o.coverageMin) {
        uniforms.uCoverage =
          o.coverageMin + (o.coverageMax - o.coverageMin) * weather(elapsed + startPhase);
      }
    },
    set(name, value) {
      const u = scalar[name];
      if (u) { uniforms[u] = value; return; }
      switch (name) {
        case 'speed': o.speed = value; uniforms.uDrift = heading(o.speed, o.angle); break;
        case 'angle': o.angle = value; uniforms.uDrift = heading(o.speed, o.angle); break;
        case 'color': uniforms.uColor = new Float32Array(rgb(value)); break;
        case 'colorB': uniforms.uColorB = new Float32Array(rgb(value)); break;
        case 'coverageMin': o.coverageMin = value; break;
        case 'coverageMax': o.coverageMax = value; break;
        case 'weatherPeriod': o.weatherPeriod = value; break;
      }
    },
    destroy() {
      view.destroy();
      geometry.destroy();
      shader.destroy();
    },
  };
}

/**
 * The design frame the defaults were tuned against, and how far past it the
 * mounted plane reaches. `scale` counts noise cells across THIS width, so a
 * plane four times wider carries four times the cells and the clouds stay
 * the size they were tuned at.
 */
const TUNED_W = 960;
const TUNED_H = 540;
const REACH = 4;

/**
 * In FRONT of the board and everything on it, BEHIND the clouds.
 *
 * Tiles sort on `tileDepth(i) * 16 + tier` and top out near 500 on a 32x32
 * grid; the effects riding on a tile sit a few above it. Clouds are at
 * 10_000 (`fx/Clouds.ts`). A cloud's shadow falls on rabbits and trees as
 * much as on the ground, so it goes over all of them.
 */
const Z = 5_000;

/**
 * Put a cloud-shadow plane over a scene, centred on a point in the scene's
 * space and reaching well past any camera.
 *
 * The scene container is what the camera scales and pans, so the plane goes
 * INSIDE it: shade that stayed put while the ground slid under it would be a
 * smudge on the lens. It is sized in scene pixels, four design frames across,
 * which is further than the camera's pan limits reach at its widest.
 *
 * `eventMode` is none. The plane covers the whole board, and left
 * interactive it would swallow every tap meant for a tile.
 */
export function mountCloudShadows(
  parent: Container,
  centerX: number,
  centerY: number,
  options: CloudShadowNoiseOptions = {},
): CloudShadowsNoise {
  const w = TUNED_W * REACH;
  const h = TUNED_H * REACH;
  const scale = (options.scale ?? CLOUD_SHADOW_NOISE_DEFAULTS.scale) * REACH;
  const shadows = createCloudShadowsNoise(w, h, { ...options, scale });
  shadows.view.position.set(centerX - w / 2, centerY - h / 2);
  shadows.view.zIndex = Z;
  shadows.view.eventMode = 'none';
  shadows.view.interactiveChildren = false;
  parent.addChild(shadows.view);
  return shadows;
}

/**
 * Le soleil entre les plaques : la MEME couche, lue a l'envers, en `overlay`.
 *
 * A monter apres `mountCloudShadows` et avec exactement les memes dials de
 * bruit — c'est tout l'interet, les deux decrivent le meme ciel donc le clair
 * tombe pile ou l'ombre s'arrete. `sunOptions` ne sert qu'a la couleur, a
 * l'alpha et a `rim` ; tout ce qui decrit le champ de bruit vient de
 * `shadowOptions` et n'est pas surchargeable, pour la meme raison que
 * `matchCloudShadows` existe dans `fx/GodRays.ts`.
 *
 * `overlay` et pas `add` : l'ile porte deja des rais additifs, et deux
 * couches additives sur les memes pixels degagés crament les hautes lumieres.
 * L'overlay module au lieu d'ajouter, donc il cohabite.
 *
 * Il passe UN CRAN au-dessus de l'ombre : la frange doit mordre sur le bord
 * de la plaque, pas passer dessous.
 */
export function mountSunWarm(
  parent: Container,
  centerX: number,
  centerY: number,
  shadowOptions: CloudShadowNoiseOptions = {},
  sunOptions: Pick<
    CloudShadowNoiseOptions,
    'color' | 'colorB' | 'gradient' | 'breath' | 'alpha' | 'rim'
  > = {},
): CloudShadowsNoise {
  const w = TUNED_W * REACH;
  const h = TUNED_H * REACH;
  const scale = (shadowOptions.scale ?? CLOUD_SHADOW_NOISE_DEFAULTS.scale) * REACH;
  const sun = createCloudShadowsNoise(w, h, {
    ...shadowOptions,
    ...CLOUD_LIGHT_DEFAULTS,
    ...sunOptions,
    scale,
  });
  sun.view.position.set(centerX - w / 2, centerY - h / 2);
  sun.view.zIndex = Z + 1;
  sun.view.blendMode = 'overlay';
  sun.view.eventMode = 'none';
  sun.view.interactiveChildren = false;
  parent.addChild(sun.view);
  return sun;
}
