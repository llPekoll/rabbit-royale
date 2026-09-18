/**
 * Le bloom — la lumiere qui deborde de ce qui est DEJA clair.
 *
 * Un ecran ne sait pas monter plus haut que blanc. Un oeil, si : devant une
 * source vive il diffuse la lumiere dans l'humeur vitree, et la source parait
 * plus grande que sa surface reelle. Le bloom est l'imitation de cette
 * diffusion — on prend les pixels les plus clairs de l'image, on les etale, on
 * les rajoute par-dessus. C'est la seule facon qu'a un ecran de dire "ca, c'est
 * plus lumineux que blanc".
 *
 * ## Pourquoi un SEUIL, et pas un flou additionne
 *
 * Le bloom rate se reconnait a une chose : toute l'image est laiteuse. Ca
 * arrive quand on floute l'image entiere et qu'on la rajoute a elle-meme —
 * l'herbe verte a 60% de luminance participe autant que le soleil, donc tout
 * se voile uniformement et on a juste baisse le contraste.
 *
 * `uThreshold` est ce qui separe "source de lumiere" de "objet clair". Seul ce
 * qui depasse le seuil entre dans le flou ; en dessous, le pixel ne contribue
 * PAS. Le sable clair de l'ile reste du sable, et seuls l'eclair, la lanterne
 * ou un reflet d'eau debordent. Le `uKnee` adoucit cette bascule : sans lui, un
 * degrade qui traverse le seuil montre un contour net au moment ou il le
 * franchit — un cerne autour du halo, exactement l'artefact qu'on essayait
 * d'eviter.
 *
 * ## Un seul passage, et pourquoi c'est suffisant ici
 *
 * Un bloom de moteur 3D fait une pyramide : on reduit l'image plusieurs fois,
 * on floute a chaque niveau, on recombine. C'est ce qu'il faut pour un halo qui
 * porte sur un quart de l'ecran. Le brief ici dit LEGER — un debord de quelques
 * pixels autour de ce qui brille — et a ce rayon-la un seul kernel suffit.
 *
 * Les echantillons sont pris en spirale dorée plutot qu'en grille : une grille
 * de 4x4 laisse voir sa trame en croix sur un halo un peu fort, et il faudrait
 * 64 echantillons pour la cacher. La spirale repartit les memes 16 points sans
 * direction privilegiee, donc le halo est rond a bien moindre cout.
 *
 * ## Le rayon est en pixels CSS, pas en pixels de texture
 *
 * Meme piege que `DissolveFilter`, et il ne se voit pas plus ici : le canvas
 * rend jusqu'a 2x (`Application.ts`), donc un rayon exprime en pixels de
 * texture sort deux fois trop petit sur un ecran retine. Le filtre convertit
 * lui-meme via `setResolution()`, et l'oubli se lit comme "le bloom est trop
 * discret" — on part alors regler le rayon au lieu des unites.
 *
 * ## Le padding
 *
 * Un filtre Pixi rend dans la boite de son conteneur. Une lueur qui deborde de
 * cette boite est COUPEE AU COUTEAU, et le halo se retrouve avec un bord droit
 * la ou le sprite finissait. `padding` agrandit la boite du rayon ; il est
 * recalcule a chaque changement de rayon, jamais fixe a la main.
 *
 * ```ts
 * const bloom = new BloomFilter({ threshold: 0.75, radius: 4, strength: 0.6 });
 * bloom.setResolution(app.renderer.resolution);
 * island.filters = [bloom];
 * ```
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
 * Seize echantillons sur une spirale de Vogel.
 *
 * L'angle d'or (~137.5 degres) entre deux points consecutifs est ce qui fait
 * qu'aucun rayon ne se reforme : c'est la meme construction que les graines de
 * tournesol, et elle a la meme propriete — les points ne s'alignent jamais.
 * Le rayon croit en sqrt(i) pour que la DENSITE soit constante sur le disque ;
 * en i lineaire les points s'entassent au centre et le halo a un noyau dur.
 *
 * Deroule dans une boucle a borne constante parce que GLSL ES 1.00 (ce que Pixi
 * donne a un contexte WebGL1) exige une borne connue a la compilation.
 */
const SAMPLES = 16;

const fragment = `
/**
 * highp explicite, et ce n'est pas cosmetique : sans cette ligne le filtre
 * ne LINKE PAS.
 *
 * Pixi declare uInputSize lui-meme dans le vertex, ou la precision par
 * defaut est highp. Le fragment, lui, a mediump par defaut, donc redeclarer le
 * meme uniform ici en fait deux uniformes de precisions differentes et le
 * programme est rejete : "Precisions of uniform 'uInputSize' differ between
 * VERTEX and FRAGMENT shaders". Le filtre rend alors entierement noir, avec la
 * raison uniquement dans un warning de la console.
 *
 * DissolveFilter a rencontre le meme mur et l'a contourne en n'utilisant pas
 * uInputSize du tout (il se fait passer la taille depuis TypeScript) ;
 * WaterShader (supprime le 2026-09-19) faisait ce qu'on fait ici. Le bloom a
 * besoin de la vraie taille de
 * la texture pour convertir son rayon en UV, donc c'est cette voie-la.
 */
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;

uniform float uThreshold;
uniform float uKnee;
uniform float uRadius;
uniform float uStrength;
uniform vec3 uTint;
uniform float uSaturation;

const int SAMPLES = ${SAMPLES};
const float GOLDEN_ANGLE = 2.39996323;

/**
 * Ce qui, dans un pixel, compte comme "lumiere".
 *
 * Luminance ponderee (Rec. 601) et pas la moyenne des canaux : l'oeil est
 * beaucoup plus sensible au vert qu'au bleu, donc a moyenne egale un bleu franc
 * est percu sombre. Avec une moyenne plate, la mer bleue passait le seuil avant
 * le sable clair — le bloom s'allumait sur l'eau et pas sur la plage.
 */
float luma(vec3 c) {
    return dot(c, vec3(0.299, 0.587, 0.114));
}

/**
 * Le poids d'un pixel dans le halo, entre 0 sous le seuil et 1 bien au-dessus.
 *
 * La courbe est la "soft knee" des bloom de moteur : une parabole sur la
 * largeur du genou, lineaire au-dela. Une simple marche (step) donne un
 * contour net la ou un degrade franchit le seuil, et ce contour se lit comme un
 * defaut de compression, pas comme de la lumiere.
 */
float bloomWeight(vec3 c) {
    float l = luma(c);
    float knee = max(uKnee, 0.0001);
    // Combien le pixel depasse le seuil. Negatif = sous le seuil.
    float over = l - uThreshold;
    // Sur la largeur du genou, la reponse est une parabole qui part de 0 avec
    // une pente nulle et rejoint la droite y=over avec la meme pente qu'elle :
    // c'est la soft knee classique des bloom de moteur. Au-dela du genou on
    // reprend la droite telle quelle.
    float soft = clamp(over + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee);
    float contribution = max(soft, over);
    // Normalise par la plage restante au-dessus du seuil, pour qu'un seuil
    // haut ne rende pas mecaniquement le halo plus faible.
    return clamp(contribution / max(1.0 - uThreshold, 0.0001), 0.0, 1.0);
}

void main() {
    vec4 base = texture(uTexture, vTextureCoord);

    // Le pas d'un pixel de texture, pour convertir un rayon en pixels vers des
    // coordonnees UV. uInputSize.zw est deja 1/largeur, 1/hauteur.
    vec2 texel = uInputSize.zw;

    vec3 glow = vec3(0.0);
    float total = 0.0;

    for (int i = 0; i < SAMPLES; i++) {
        float fi = float(i) + 0.5;
        float angle = fi * GOLDEN_ANGLE;
        // sqrt pour une densite constante sur le disque — voir l'en-tete.
        float dist = sqrt(fi / float(SAMPLES));
        vec2 offset = vec2(cos(angle), sin(angle)) * dist * uRadius * texel;

        vec4 s = texture(uTexture, vTextureCoord + offset);
        // Un pixel transparent ne porte pas de lumiere. Sans ce facteur alpha,
        // le noir transparent autour d'un sprite compte comme une couleur et
        // dilue le halo vers le centre du sprite.
        vec3 lit = s.rgb * s.a;

        // Ponderation gaussienne le long du rayon : au bord du disque un
        // echantillon compte peu, donc le halo s'eteint au lieu de finir sur un
        // cercle net.
        float falloff = exp(-2.0 * dist * dist);
        glow += lit * bloomWeight(lit) * falloff;
        total += falloff;
    }

    glow /= max(total, 0.0001);

    // Desaturer le halo vers sa propre luminance, puis le teinter.
    //
    // A saturation 1 la lueur garde la couleur exacte de sa source, ce qui sur
    // une carotte orange donne une auréole orange franche — joli mais ca lit
    // comme un calque colore. Les vraies diffusions oculaires tirent vers le
    // blanc chaud, d'ou le defaut a mi-chemin.
    float gl = luma(glow);
    glow = mix(vec3(gl), glow, uSaturation) * uTint;

    // Additif : la lumiere s'AJOUTE. En mix() a la place, le halo REMPLACE ce
    // qu'il couvre et un fond sombre pres d'une source devient gris — c'est la
    // difference entre "ca brille" et "c'est voile".
    //
    // L'alpha du pixel de base est conserve tel quel : un bloom qui pousse
    // l'alpha fait deborder le sprite sur un fond transparent et laisse une
    // frange autour de lui dans le compositing.
    finalColor = vec4(base.rgb + glow * uStrength, base.a);
}
`;

export interface BloomOptions {
  /**
   * A partir de quelle luminance un pixel deborde, 0..1.
   *
   * C'est LE dial du bloom. Trop bas, toute l'image est laiteuse ; trop haut,
   * plus rien ne brille. Sur cette ile (pixel art plein jour, sable clair) le
   * sable tourne autour de 0.72 de luminance, donc le defaut est juste
   * au-dessus pour qu'il ne s'allume pas.
   */
  threshold: number;
  /** Largeur de la bascule autour du seuil — evite le cerne. */
  knee: number;
  /** Rayon du halo, en PIXELS CSS. Voir `setResolution`. */
  radius: number;
  /** Combien de halo on rajoute par-dessus. 1 = a pleine force. */
  strength: number;
  /** Couleur du halo, multipliee. Blanc = la couleur de la source. */
  tint: number;
  /** 0 = halo blanc, 1 = halo de la couleur exacte de la source. */
  saturation: number;
}

/**
 * Le reglage LEGER, celui du brief.
 *
 * Trouve dans `FX/Bloom` sur l'ile reelle : les reflets d'eau et le sable le
 * plus clair debordent d'environ trois pixels, et une capture avant/apres se
 * distingue sans que l'image ait perdu son contraste. Toute valeur plus haute
 * commence a se voir comme un effet plutot que comme de la lumiere.
 */
export const BLOOM_DEFAULTS: BloomOptions = {
  threshold: 0.78,
  knee: 0.12,
  radius: 4,
  strength: 0.55,
  tint: 0xfff4de,
  saturation: 0.5,
};

export class BloomFilter extends Filter {
  /** Rayon demande en pixels CSS, garde pour reappliquer un changement de ratio. */
  private cssRadius: number;
  private pixelRatio = 1;

  constructor(options: Partial<BloomOptions> = {}) {
    const o = { ...BLOOM_DEFAULTS, ...options };
    super({
      glProgram: GlProgram.from({ vertex, fragment }),
      resources: {
        bloomUniforms: {
          uThreshold: { value: o.threshold, type: 'f32' },
          uKnee: { value: o.knee, type: 'f32' },
          uRadius: { value: o.radius, type: 'f32' },
          uStrength: { value: o.strength, type: 'f32' },
          uTint: { value: new Float32Array(rgb(o.tint)), type: 'vec3<f32>' },
          uSaturation: { value: o.saturation, type: 'f32' },
        },
      },
    });
    this.cssRadius = o.radius;
    this.applyGeometry();
  }

  private get u() {
    return this.resources.bloomUniforms.uniforms as {
      uThreshold: number;
      uKnee: number;
      uRadius: number;
      uStrength: number;
      uTint: Float32Array;
      uSaturation: number;
    };
  }

  /** Luminance a partir de laquelle un pixel deborde, 0..1. */
  get threshold(): number { return this.u.uThreshold; }
  set threshold(v: number) { this.u.uThreshold = clamp01(v); }

  /** Largeur de la bascule autour du seuil. */
  get knee(): number { return this.u.uKnee; }
  set knee(v: number) { this.u.uKnee = Math.max(0, v); }

  /** Rayon du halo, en pixels CSS. */
  get radius(): number { return this.cssRadius; }
  set radius(v: number) { this.cssRadius = Math.max(0, v); this.applyGeometry(); }

  /** Force du halo ajoute. */
  get strength(): number { return this.u.uStrength; }
  set strength(v: number) { this.u.uStrength = Math.max(0, v); }

  /** Teinte du halo. */
  get tint(): number { return this.tintHex; }
  set tint(hex: number) { this.tintHex = hex; this.u.uTint.set(rgb(hex)); }
  private tintHex = BLOOM_DEFAULTS.tint;

  /** 0 = halo blanc, 1 = couleur de la source. */
  get saturation(): number { return this.u.uSaturation; }
  set saturation(v: number) { this.u.uSaturation = clamp01(v); }

  /**
   * Le ratio de pixels du canvas, pour qu'un rayon en pixels CSS sorte juste.
   *
   * A appeler une fois avec `app.renderer.resolution`. Laisse a 1 sur un ecran
   * 2x, le halo fait la moitie de la taille demandee — ce qui se lit comme "le
   * bloom est trop discret" et envoie regler la force au lieu des unites.
   */
  setResolution(resolution: number): void {
    this.pixelRatio = Math.max(0.01, resolution);
    this.applyGeometry();
  }

  private applyGeometry(): void {
    const device = this.cssRadius * this.pixelRatio;
    this.u.uRadius = device;
    // La boite du filtre doit contenir la lueur, sinon elle est coupee net au
    // bord du conteneur. `padding` est en pixels CSS (Pixi le met a l'echelle
    // lui-meme), donc on passe le rayon CSS et pas le rayon en pixels device.
    // +1 pour l'echantillon qui tombe pile sur le bord.
    this.padding = Math.ceil(this.cssRadius) + 1;
  }
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const rgb = (hex: number): [number, number, number] => [
  ((hex >> 16) & 0xff) / 255,
  ((hex >> 8) & 0xff) / 255,
  (hex & 0xff) / 255,
];
