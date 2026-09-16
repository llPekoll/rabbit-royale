/**
 * Les rais de lumiere — des colonnes de soleil qui tombent entre les nuages.
 *
 * La reference est le fond d'ecran Diablo II : une nef sombre, deux ou trois
 * faisceaux obliques, des poussieres dedans. Ce que le brief demande est la
 * MEME lecture en beaucoup moins appuye — l'ile n'est pas une crypte, elle est
 * en plein jour, donc les rais sont un voile pas un projecteur.
 *
 * ## Pourquoi le meme bruit que les ombres de nuages
 *
 * Un rai de lumiere est un TROU dans la couverture nuageuse, vu de cote. Une
 * ombre au sol est le meme trou, vu d'en dessous. Les deux effets decrivent le
 * meme ciel, et c'est le point de toute ce fichier : `fbm` ici est la copie
 * conforme de celui de `CloudShadowsNoise.ts` (meme simplex Ashima, meme
 * repliement d'octaves), et les uniformes `uScale`, `uDrift`, `uMorph`,
 * `uOctaves`, `uWarp`, `uCoverage`, `uEdge` sont les memes dials.
 *
 * Passe les memes valeurs aux deux et un rai tombe la ou le sol est clair,
 * parce que les deux lisent la meme valeur de bruit au meme instant. Passe-en
 * de differentes et tu obtiens deux ciels superposes — ce qui se voit tout de
 * suite, et c'est pour ca que `matchCloudShadows()` existe plus bas : elle
 * fabrique les options du rai A PARTIR des options de l'ombre, pour qu'on ne
 * puisse pas les desynchroniser par etourderie.
 *
 * ## Ce que le fragment echantillonne
 *
 * Pas l'ecran. Le rai part d'un point (`uSource`, hors-champ en general) et
 * balaie vers le bas ; ce qui compte pour un pixel est l'ANGLE sous lequel on
 * le voit depuis cette source, pas sa position. Donc le bruit est lu en
 * (angle, distance) :
 *
 *   - l'angle donne le decoupage en faisceaux. Un seul axe de bruit, donc les
 *     bandes sont nettes et paralleles a la lumiere, jamais des taches.
 *   - la distance ne sert qu'a faire respirer la bande et a l'eteindre. Elle
 *     est divisee par `uSoftness` pour que le bruit varie LENTEMENT le long du
 *     rai : un bruit isotrope en (x,y) donnait des chapelets de bulles dans le
 *     faisceau au lieu d'une colonne.
 *
 * C'est aussi pour ca que les rais s'ecartent en descendant sans qu'on ait a
 * le coder : a angle constant, deux bords s'eloignent avec la distance.
 *
 * ## Le rendu est additif
 *
 * `blendMode: 'add'`. De la lumiere s'AJOUTE a ce qu'elle traverse ; un
 * blanc en alpha-blend a la place delave l'ile en gris et lui prend ses
 * couleurs. L'additif garde l'herbe verte sous le rai, juste plus claire —
 * c'est la difference entre "eclaire" et "voile".
 */
import { Container, Geometry, Mesh, Shader } from 'pixi.js';
import {
  CLOUD_SHADOW_NOISE_DEFAULTS, mountCloudShadows, type CloudShadowNoiseOptions,
} from './CloudShadowsNoise';

const vertex = `
in vec2 aPosition;
out vec2 vScreen;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main(void) {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    // La taille est dans les sommets, pas dans un quad unite qu'on scale :
    // scaler dans le shader laisse les bounds Pixi a 1x1 et le mesh se fait
    // culler (voir SurfaceTexture.ts, CloudShadowsNoise.ts).
    vScreen = aPosition;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
}
`;

const fragment = `
precision highp float;

in vec2 vScreen;
out vec4 finalColor;

uniform vec2  uSize;
uniform vec2  uSource;
uniform float uTime;
uniform float uScale;
uniform vec2  uDrift;
uniform float uMorph;
uniform float uOctaves;
uniform float uWarp;
uniform float uCoverage;
uniform float uEdge;
uniform float uSoftness;
uniform float uSpread;
uniform float uReach;
uniform float uNear;
uniform float uFalloff;
uniform float uDust;
uniform float uMotes;
uniform float uMoteCell;
uniform float uMoteSize;
uniform float uMoteDensity;
uniform float uMoteRise;
uniform float uMoteBlink;
uniform float uPixel;
uniform vec3  uColor;
uniform float uAlpha;

// --- Ashima simplex 3D (Ian McEwan / Stefan Gustavson), verbatim ---------
// Le meme que CloudShadowsNoise.ts, recopie plutot qu'importe : les deux
// fichiers sont des sources GLSL, il n'y a pas de #include a l'execution.
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

// Somme fractale, identique a celle des ombres de nuages : chaque octave deux
// fois plus fine et deux fois moins forte, la derniere fondue pour que le dial
// soit continu.
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

/**
 * Un hash 2D vers 0..1 : le tirage d'une cellule, independant de ses voisines.
 * Pas un bruit — un bruit interpole, et des positions correlees alignent les
 * grains en chapelets.
 */
float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

/**
 * Les POUSSIERES : des grains distincts qui flottent dans la lumiere.
 *
 * A distinguer de uDust plus bas, qui est un fbm fin module sur le faisceau.
 * Ce fbm ne peut PAS faire des particules : c'est un champ continu, donc
 * monter son dial epaissit une fumee au lieu de detacher des points — pousse
 * au maximum il fait des trainees striees (assez justes pour une mer, c'est
 * devenu SeaGradient, mais pas de la poussiere). Il fallait l'autre famille
 * de bruit : des cellules hachees, un point par cellule.
 *
 * ## En espace ECRAN, pas en (bande, distance)
 *
 * Le faisceau est lu depuis la source, en angle et distance, et c'est ce
 * qu'il faut pour des colonnes. Pas pour des grains : une grille posee dans
 * cet espace s'evase avec la distance et les points du bas sortent trois fois
 * plus gros que ceux du haut. Une poussiere est un point de deux pixels quel
 * que soit l'endroit ou elle flotte — donc la grille est en pixels, et c'est
 * le masque shaft * fade, applique apres, qui la confine dans la lumiere.
 *
 * ## Ce qui les rend vivantes
 *
 * Trois choses, et chacune s'est verifiee necessaire :
 *  - une DUREE DE VIE : chaque grain nait, brille, s'eteint (le sinus sur
 *    fract du temps). Des grains permanents qui ne font que deriver se
 *    lisent comme une texture de bruit qui glisse ;
 *  - une MONTEE lente avec un leger balancement lateral — l'air chaud d'un
 *    rai porte la poussiere vers le haut, elle ne file pas le long du rai ;
 *  - une DENSITE basse : la plupart des cellules sont vides. Une grille
 *    pleine laisse voir sa trame en une seconde.
 *
 * Deux couches, de pas et de vitesse differents, pour casser l'alignement de
 * la grille sans en ajouter une troisieme.
 */
float motes(vec2 p) {
    if (uMotes <= 0.0) return 0.0;

    float sum = 0.0;
    for (int i = 0; i < 2; i++) {
        float L = float(i);
        float cellPx = uMoteCell * (1.0 + 0.6 * L);

        vec2 q = p;
        // La grille descend, donc les points montent. La seconde couche plus
        // lentement : c'est elle qui donne la profondeur.
        q.y += uTime * uMoteRise * (1.0 - 0.4 * L);
        // Un balancement lateral lie a la hauteur, pour que les grains ne
        // montent pas en rang comme des bulles dans un verre.
        q.x += sin(uTime * 0.35 + L * 2.1 + p.y * 0.012) * cellPx * 0.18;

        vec2 g = q / cellPx + L * 0.37;
        vec2 cell = floor(g);
        vec2 f = fract(g);

        float h1 = hash21(cell + L * 17.0);
        float h2 = hash21(cell.yx + L * 53.0);
        float h3 = hash21(cell * 1.3 + L * 29.0);
        // La plupart des cellules n'ont pas de grain.
        if (h3 > uMoteDensity) continue;

        // Le point, tenu a l'ecart des bords de la cellule pour qu'un grain ne
        // soit jamais coupe en deux par la frontiere.
        vec2 pt = vec2(h1, h2) * 0.7 + 0.15;
        float r = uMoteSize / cellPx;
        float d = length(f - pt);
        float grain = 1.0 - smoothstep(r * 0.4, r, d);

        // Naitre, briller, s'eteindre — chacun a son rythme et sa phase.
        float life = fract(uTime * uMoteBlink * (0.6 + 0.8 * h1) + h2 * 7.0);
        float bright = sin(life * 3.14159);

        sum += grain * bright * (1.0 - 0.35 * L);
    }
    return sum * uMotes;
}

void main(void) {
    vec2 p = vScreen;
    if (uPixel > 0.0) p = floor(p / uPixel) * uPixel + uPixel * 0.5;

    // Le pixel vu depuis la source. 'uSize.y' normalise pour que les dials ne
    // dependent pas de la resolution du plan.
    vec2  d    = p - uSource;
    float dist = length(d) / uSize.y;
    // L'angle est mesure en TANGENTE plutot qu'en atan2 : sur un eventail
    // etroit les deux sont equivalents, mais la tangente garde des bandes de
    // largeur constante loin de la source au lieu de les pincer, et 'uSpread'
    // devient une largeur d'eventail lisible plutot qu'un angle en radians.
    float fan  = d.x / max(abs(d.y), 1.0);
    float band = fan / max(uSpread, 1e-3);

    // Le bruit lu en (bande, distance). La distance est ecrasee par
    // 'uSoftness' pour que la valeur bouge lentement LE LONG du rai : sans ca
    // le faisceau se casse en chapelet de bulles au lieu de tenir en colonne.
    float t = uTime * uMorph;
    vec2  q = vec2(band, dist / max(uSoftness, 1e-3)) * uScale + uTime * uDrift;

    // Meme deformation de domaine que les ombres, pour que les bords des
    // faisceaux ondulent au lieu d'etre des traits droits.
    vec2 w = vec2(
        snoise(vec3(q * 0.5 + 3.1, t * 0.7)),
        snoise(vec3(q * 0.5 - 5.7, t * 0.7 + 9.0))
    );
    q += w * uWarp;

    float n = fbm(vec3(q, t)) * 0.5 + 0.5;
    // Le seuil est le MEME que celui des ombres, mais pris a l'envers : la ou
    // le nuage est plein (n au-dessus de uCoverage) l'ombre tombe et le rai
    // s'eteint. Un pixel clair au sol et un rai au-dessus sont la meme valeur
    // de bruit lue deux fois.
    float shaft = 1.0 - smoothstep(uCoverage - uEdge, uCoverage + uEdge, n);

    // L'extinction le long du rai. 'uNear' mange le tout premier bout pres de
    // la source (sinon le point d'ou tout part est une tache blanche), 'uReach'
    // dit jusqu'ou la lumiere porte, 'uFalloff' la courbe.
    float near = smoothstep(0.0, max(uNear, 1e-3), dist);
    float far  = 1.0 - smoothstep(uReach * 0.35, uReach, dist);
    float fade = near * pow(max(far, 0.0), uFalloff);

    // Les poussieres : un grain fin qui ne vit QUE dans le faisceau, multiplie
    // par lui. Hors du rai il n'y a rien a eclairer, et un grain qui deborde
    // se lit comme du bruit de compression sur toute l'image.
    float dust = 1.0;
    if (uDust > 0.0) {
        float g = fbm(vec3(q * 7.0 + vec2(0.0, uTime * 0.25), t * 2.0)) * 0.5 + 0.5;
        dust = mix(1.0, g * 1.6, uDust);
    }

    // Les poussieres, AJOUTEES au faisceau et confinees dedans par le meme
    // masque. Ajoutees et non multipliees : un grain est un point PLUS CLAIR
    // que la lumiere qui le porte, c'est la seule facon de lire une particule
    // eclairee ; multiplie il ne ferait qu'un trou sombre. Hors de la lumiere
    // il n'y a rien a eclairer, d'ou shaft * fade.
    //
    // Pas ponderees par uAlpha : le faisceau est volontairement un voile a
    // 0.22, et une poussiere qui n'aurait droit qu'a 22 pour cent ne se
    // detacherait jamais de lui. uMotes est sa propre intensite.
    float a = shaft * fade * (dust * uAlpha + motes(p));
    // Premultiplie : le mesh est en blend additif, donc c'est la couleur
    // ponderee qui compte et l'alpha ne sert qu'a ne rien ajouter a zero.
    finalColor = vec4(uColor * a, a);
}
`;

export interface GodRaysOptions {
  /**
   * D'ou vient la lumiere, en pixels du plan. En general hors-champ et
   * au-dessus : c'est le soleil, pas une lampe posee sur l'ile.
   */
  sourceX?: number;
  sourceY?: number;
  /**
   * Largeur de l'eventail. C'est une TANGENTE (dx par dy), pas un angle :
   * 0.9 ouvre a peu pres 42 degres de chaque cote.
   */
  spread?: number;
  /** Combien de faisceaux se decoupent dans l'eventail. */
  scale?: number;
  /** Vitesse de derive, dans les memes unites que les ombres de nuages. */
  speed?: number;
  /** Cap de la derive en degres. */
  angle?: number;
  /** Vitesse a laquelle les faisceaux se deforment sur place. */
  morph?: number;
  /** Octaves de detail, 1 a 4. Fractionnaire fond la derniere. */
  octaves?: number;
  /** Deformation de domaine ; 0 laisse des bords droits. */
  warp?: number;
  /** Ou le nuage commence, donc ou le rai s'arrete. Le meme que l'ombre. */
  coverage?: number;
  /** Demi-largeur du fondu de bord, en valeur de bruit. */
  edge?: number;
  /**
   * Combien le bruit est etire LE LONG du rai. Grand = des colonnes franches,
   * petit = des paquets de lumiere.
   */
  softness?: number;
  /** Jusqu'ou la lumiere porte, en hauteurs de plan. */
  reach?: number;
  /** Quelle part du debut du rai est mangee, en hauteurs de plan. */
  near?: number;
  /** Courbure de l'extinction. Au-dessus de 1 la lumiere meurt plus tot. */
  falloff?: number;
  /** Grain dans le faisceau, 0 a 1. De la fumee ; pour des particules, `motes`. */
  dust?: number;
  /**
   * Les poussieres : des grains distincts qui flottent dans la lumiere.
   * C'est leur intensite (0 les eteint) ; voir `motes()` dans le fragment.
   */
  motes?: number;
  /** Le pas de la grille des grains, en pixels. Grand = plus epars. */
  moteCell?: number;
  /** Rayon d'un grain, en pixels — avant le snap de `pixel`. */
  moteSize?: number;
  /** Part des cellules qui portent un grain, 0 a 1. Bas, ou la trame se voit. */
  moteDensity?: number;
  /** Vitesse de montee, en pixels par seconde. Lente. */
  moteRise?: number;
  /** Cycles de vie par seconde : 0.12 = un grain vit environ huit secondes. */
  moteBlink?: number;
  /** Pas de quantification en pixels, 0 pour aucun. */
  pixel?: number;
  color?: number;
  alpha?: number;
}

/**
 * Le reglage "plein jour", pas la crypte de la reference.
 *
 * `alpha` a 0.18 et non 0.6 : sur l'ile le rai doit se lire comme une
 * eclaircie qui passe, pas comme un projecteur de theatre — c'est le "moins
 * hardcore" du brief. `coverage` et `edge` reprennent exactement les valeurs
 * des ombres de nuages pour que les deux decrivent le meme ciel.
 */
export const GOD_RAYS_DEFAULTS = {
  // Le soleil est haut A DROITE, hors-champ.
  //
  // Une source centree donne des rais verticaux, et des rais verticaux se
  // lisent comme une trame sur l'image : la reference les a obliques, et
  // l'obliquite est ce qui dit qu'il y a un ciel au-dessus plutot qu'un
  // calque devant. Poser le soleil hors du cadre suffit — la divergence
  // depuis un point fait le reste.
  //
  // A DROITE et non a gauche : regle a l'oeil dans Storybook le 2026-09-15,
  // parce que c'est le sens qui va avec la lumiere que l'art porte deja. Les
  // tuiles sont dessinees avec leur face claire tournee vers la droite, et un
  // rai qui descend a contre-sens fait deux soleils dans la meme image.
  sourceX: 1.54,
  sourceY: -1.06,
  spread: 0.79,
  scale: 2.5,
  speed: CLOUD_SHADOW_NOISE_DEFAULTS.speed,
  angle: CLOUD_SHADOW_NOISE_DEFAULTS.angle,
  morph: CLOUD_SHADOW_NOISE_DEFAULTS.morph,
  octaves: 2.5,
  warp: CLOUD_SHADOW_NOISE_DEFAULTS.warp,
  coverage: CLOUD_SHADOW_NOISE_DEFAULTS.coverage,
  edge: 0.14,
  softness: 3.7,
  // `reach` porte jusqu'en bas de la frame, PAS jusqu'au premier tiers.
  //
  // Regle a 1.9 au depart, ce qui eteignait les faisceaux avant qu'ils
  // touchent l'ile : tout l'effet vivait dans le ciel et le sol ne recevait
  // rien — l'inverse de ce qu'on cherche, puisque le sujet est justement
  // l'accord entre le rai et l'ombre AU SOL. La source etant a -1.2 hauteurs
  // au-dessus du cadre, il faut porter au-dela de 2.2 pour eclairer le bas.
  reach: 2.65,
  // `near` et `sourceY` se paient l'un l'autre, et c'est le piege du reglage.
  //
  // Le fondu proche est mesure DEPUIS la source : poser le soleil tres haut
  // (-1.2) pour avoir de belles obliques mettait le cadre entier dans le bout
  // de rai que `near` doit manger, et il ne restait presque rien sur l'ile.
  // Rapprocher la source a -0.55 garde l'obliquite (elle vient de sourceX,
  // pas de la hauteur) et rend sa lumiere au sol.
  near: 0.42,
  falloff: 1.3,
  // Presque pas de poussiere.
  //
  // Le grain etait a 0.25 et la reference en met beaucoup — mais la reference
  // est une crypte ou la poussiere est le seul relief. Sur un pixel art en
  // plein jour elle se lit comme du bruit de compression : reglee a l'oeil a
  // 0.04, soit juste assez pour que le faisceau ne soit pas un aplat.
  dust: 0.18,
  /**
   * Les poussieres, discretes mais presentes.
   *
   * Le fbm de `dust` a du redescendre a 0.04 parce qu'un grain CONTINU en
   * plein jour se lit comme du bruit de compression. Un grain DISCRET n'a pas
   * ce probleme — il se lit comme un flocon dans un rayon — donc celui-ci peut
   * etre franchement visible sans salir l'image. Le dial est `motes` ;
   * `moteDensity` est le second, et il doit rester bas.
   */
  motes: 0.3,
  moteCell: 26,
  moteSize: 2.2,
  moteDensity: 0.25,
  moteRise: 6,
  moteBlink: 0.12,
  pixel: 4,
  color: 0xfff2cf,
  alpha: 0.22,
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

/**
 * Les options de rais qui decrivent LE MEME ciel que des ombres donnees.
 *
 * A utiliser plutot que de recopier les dials a la main : c'est la seule
 * facon de ne pas se retrouver avec un rai qui tombe sur une plaque d'ombre.
 * Ce qui est repris est ce que les deux shaders lisent pareil — le champ de
 * bruit et son seuil ; ce qui reste au rai est sa geometrie, que les ombres
 * n'ont pas.
 */
export function matchCloudShadows(
  shadows: CloudShadowNoiseOptions,
  extra: GodRaysOptions = {},
): GodRaysOptions {
  const s = { ...CLOUD_SHADOW_NOISE_DEFAULTS, ...shadows };
  return {
    scale: s.scale,
    speed: s.speed,
    angle: s.angle,
    morph: s.morph,
    octaves: s.octaves,
    warp: s.warp,
    coverage: s.coverage,
    edge: s.edge,
    pixel: s.pixel,
    ...extra,
  };
}

export interface GodRays {
  readonly view: Mesh<Geometry, Shader>;
  update(deltaMs: number): void;
  set(name: keyof GodRaysOptions, value: number): void;
  /**
   * Bouger le soleil, en FRACTIONS du plan (0..1 sur sa largeur/hauteur) —
   * les memes unites que `sourceX`/`sourceY`, pour qu'un reglage trouve sur
   * une frame tienne sur un plan de taille differente.
   */
  setSource(fx: number, fy: number): void;
  destroy(): void;
}

export function createGodRays(
  width: number,
  height: number,
  options: GodRaysOptions = {},
): GodRays {
  const o = { ...GOD_RAYS_DEFAULTS, ...options };

  const quad = (w: number, h: number) => new Float32Array([0, 0, w, 0, w, h, 0, h]);
  const geometry = new Geometry({
    attributes: { aPosition: quad(width, height) },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  });

  const shader = Shader.from({
    gl: { vertex, fragment },
    resources: {
      rayUniforms: {
        uSize: { value: new Float32Array([width, height]), type: 'vec2<f32>' },
        uSource: {
          value: new Float32Array([o.sourceX * width, o.sourceY * height]),
          type: 'vec2<f32>',
        },
        uTime: { value: 0, type: 'f32' },
        uScale: { value: o.scale, type: 'f32' },
        uDrift: { value: heading(o.speed, o.angle), type: 'vec2<f32>' },
        uMorph: { value: o.morph, type: 'f32' },
        uOctaves: { value: o.octaves, type: 'f32' },
        uWarp: { value: o.warp, type: 'f32' },
        uCoverage: { value: o.coverage, type: 'f32' },
        uEdge: { value: o.edge, type: 'f32' },
        uSoftness: { value: o.softness, type: 'f32' },
        uSpread: { value: o.spread, type: 'f32' },
        uReach: { value: o.reach, type: 'f32' },
        uNear: { value: o.near, type: 'f32' },
        uFalloff: { value: o.falloff, type: 'f32' },
        uDust: { value: o.dust, type: 'f32' },
        uMotes: { value: o.motes, type: 'f32' },
        uMoteCell: { value: o.moteCell, type: 'f32' },
        uMoteSize: { value: o.moteSize, type: 'f32' },
        uMoteDensity: { value: o.moteDensity, type: 'f32' },
        uMoteRise: { value: o.moteRise, type: 'f32' },
        uMoteBlink: { value: o.moteBlink, type: 'f32' },
        uPixel: { value: o.pixel, type: 'f32' },
        uColor: { value: new Float32Array(rgb(o.color)), type: 'vec3<f32>' },
        uAlpha: { value: o.alpha, type: 'f32' },
      },
    },
  });

  const view = new Mesh({ geometry, shader });
  // De la lumiere s'ajoute. Voir l'en-tete : en alpha-blend le meme blanc
  // delave l'ile au lieu de l'eclairer.
  view.blendMode = 'add';

  const uniforms = shader.resources.rayUniforms.uniforms as Record<string, unknown>;

  const scalar: Partial<Record<keyof GodRaysOptions, string>> = {
    scale: 'uScale', morph: 'uMorph', octaves: 'uOctaves', warp: 'uWarp',
    coverage: 'uCoverage', edge: 'uEdge', softness: 'uSoftness', spread: 'uSpread',
    reach: 'uReach', near: 'uNear', falloff: 'uFalloff', dust: 'uDust',
    motes: 'uMotes', moteCell: 'uMoteCell', moteSize: 'uMoteSize',
    moteDensity: 'uMoteDensity', moteRise: 'uMoteRise', moteBlink: 'uMoteBlink',
    pixel: 'uPixel', alpha: 'uAlpha',
  };

  const setSource = (fx: number, fy: number) => {
    o.sourceX = fx;
    o.sourceY = fy;
    uniforms.uSource = new Float32Array([fx * width, fy * height]);
  };

  let elapsed = 0;

  return {
    view,
    update(deltaMs) {
      elapsed += deltaMs / 1000;
      uniforms.uTime = elapsed;
    },
    setSource,
    set(name, value) {
      const u = scalar[name];
      if (u) { uniforms[u] = value; return; }
      switch (name) {
        case 'speed': o.speed = value; uniforms.uDrift = heading(o.speed, o.angle); break;
        case 'angle': o.angle = value; uniforms.uDrift = heading(o.speed, o.angle); break;
        case 'sourceX': setSource(value, o.sourceY); break;
        case 'sourceY': setSource(o.sourceX, value); break;
        case 'color': uniforms.uColor = new Float32Array(rgb(value)); break;
      }
    },
    destroy() {
      view.destroy();
      geometry.destroy();
      shader.destroy();
    },
  };
}

/** La frame de design contre laquelle les defauts ont ete regles. */
const TUNED_W = 960;
const TUNED_H = 540;
const REACH = 4;

/**
 * DEVANT tout, y compris les ombres de nuages.
 *
 * Les tuiles montent vers 500, les ombres de nuages sont a 5_000, les nuages
 * eux-memes a 10_000 (`fx/Clouds.ts`). Un rai passe entre l'oeil et tout ce
 * qu'il traverse — ile, lapins, arbres, et la plaque d'ombre voisine — donc
 * il passe au-dessus des ombres ; il reste sous les nuages, qui sont la
 * matiere d'ou il sort.
 */
const Z = 7_500;

/**
 * Poser un plan de rais sur une scene, centre sur un point de son espace.
 *
 * Comme les ombres de nuages, le plan va DANS le conteneur que la camera
 * bouge : une lumiere qui resterait fixe pendant que le sol glisse dessous
 * serait une salissure sur l'objectif. Il fait quatre frames de design de
 * cote, ce qui depasse les limites de pan de la camera au plus large.
 *
 * `scale` est multiplie par REACH pour la meme raison que dans les ombres :
 * il compte des cellules de bruit en travers de CETTE largeur, donc un plan
 * quatre fois plus large doit en porter quatre fois plus pour que les
 * faisceaux gardent la taille a laquelle ils ont ete regles.
 */
/**
 * Le ciel complet : les plaques d'ombre au sol ET les rais qui passent entre
 * elles, montes ensemble et tenus accordes.
 *
 * C'est ce qu'il faut appeler depuis un terrain, pas les deux montages l'un
 * apres l'autre. Deux raisons, et la seconde ne se voit qu'apres coup :
 *
 * 1. `matchCloudShadows` passe le champ de bruit des ombres aux rais, donc il
 *    n'y a qu'un ciel a decrire au lieu de deux jeux de dials a garder
 *    synchrones a la main.
 * 2. La couverture DERIVE. Les ombres la font bouger entre `coverageMin` et
 *    `coverageMax` a chaque frame ; un rai qui garderait la valeur de depart
 *    finirait par tomber en plein milieu d'une plaque des que le temps
 *    change. Le `update` ci-dessous recopie la couverture vivante des ombres
 *    dans les rais a chaque frame — c'est la seule ligne qui tient l'accord
 *    dans la duree, et elle n'existe pas dans la story (ou le ciel est fige
 *    expres pour qu'on puisse juger l'accord sans que la meteo s'en mele).
 */
export function mountSkyLight(
  parent: Container,
  centerX: number,
  centerY: number,
  shadowOptions: CloudShadowNoiseOptions = {},
  rayOptions: GodRaysOptions = {},
): { update(deltaMs: number): void; destroy(): void } {
  const shadows = mountCloudShadows(parent, centerX, centerY, shadowOptions);
  const rays = mountGodRays(
    parent, centerX, centerY,
    matchCloudShadows(shadowOptions, rayOptions),
  );

  return {
    update(deltaMs) {
      shadows.update(deltaMs);
      rays.update(deltaMs);
      // La couverture vivante, pas celle des options : voir le point 2.
      rays.set('coverage', shadows.coverage);
    },
    destroy() {
      shadows.destroy();
      rays.destroy();
    },
  };
}

export function mountGodRays(
  parent: Container,
  centerX: number,
  centerY: number,
  options: GodRaysOptions = {},
): GodRays {
  const w = TUNED_W * REACH;
  const h = TUNED_H * REACH;
  const o = { ...GOD_RAYS_DEFAULTS, ...options };

  // Tous les dials regles A L'ECRAN doivent etre ramenes a l'echelle du plan,
  // qui fait REACH frames de cote. C'est le piege de ce montage, et il ne se
  // voit pas : le plan rend sans erreur, simplement plus AUCUN rai n'arrive
  // sur l'ile.
  //
  // - `scale` reste TEL QUEL, contrairement aux ombres de nuages. Chez elles
  //   il compte des cellules de bruit en travers du plan, donc un plan quatre
  //   fois plus large en demande quatre fois plus ; ici l'axe qui decoupe les
  //   faisceaux est un ANGLE vu depuis la source, et un angle ne s'agrandit
  //   pas avec le plan. Le multiplier par REACH donnait quatre fois trop de
  //   rais, quatre fois trop fins.
  // - `sourceX`/`sourceY` sont des FRACTIONS du plan. Une source a 1.54 frame
  //   du bord se retrouvait a 1.54 PLAN, soit quatre fois trop loin : l'ile
  //   tombait entierement dans le fondu `near` et ne recevait plus rien.
  // - `reach` et `near` sont des distances en HAUTEURS DE PLAN : le fragment
  //   divise deja par `uSize.y`, qui est la hauteur du plan monte et non
  //   celle de la frame. Il faut donc les multiplier par REACH pour couvrir
  //   la meme distance a l'ecran. Les diviser (l'erreur d'avant) donnait des
  //   rais qui mouraient sur la mer avant d'avoir atteint la terre.
  const rays = createGodRays(w, h, {
    ...o,
    sourceX: 0.5 + (o.sourceX - 0.5) / REACH,
    sourceY: 0.5 + (o.sourceY - 0.5) / REACH,
    reach: o.reach * REACH,
    near: o.near * REACH,
  });
  rays.view.position.set(centerX - w / 2, centerY - h / 2);
  rays.view.zIndex = Z;
  rays.view.eventMode = 'none';
  rays.view.interactiveChildren = false;
  parent.addChild(rays.view);
  return rays;
}
