/**
 * Des oiseaux qui remontent le ciel, loin au-dessus de l'ile.
 *
 * Le pendant aerien de `Ducks` : comme eux ils se deplacent en PIXELS et ne
 * sont jamais inscrits sur le damier — rien ne peut marcher dans le ciel,
 * donc il n'y a rien a bloquer ni a contourner. Et comme eux ils sont
 * RETOURNES, jamais pivotes : la feuille est dessinee de profil strict, et une
 * rotation la reduit a un trait puis, passe le quart de tour, met l'oiseau
 * tete en bas.
 *
 * ## Ils vont tous du meme cote
 *
 * Une seule diagonale, vers le fond-gauche. La projection etant 2:1, la
 * direction `(-2, -1)` longe une arete que le joueur voit deja sur le sol ; un
 * vol horizontal ou vertical couperait ce quadrillage et se lirait comme colle
 * sur l'image. Des oiseaux qui se croiseraient en sens inverse se liraient
 * comme deux groupes qui s'ignorent — un vol qui part tout entier du meme cote
 * est un vol qui VA quelque part.
 *
 * ## Le vol n'est pas une ligne droite
 *
 * Chaque oiseau garde une LIGNE DE VOL qui avance seule, et l'ondulation n'est
 * qu'un decalage applique par-dessus. Ajouter le balancement a la position
 * reelle le cumulerait frame apres frame et l'oiseau derivera pour de bon hors
 * de sa trajectoire. L'ondulation est perpendiculaire a la course et
 * sinusoidale : un bruit tire a chaque frame ferait gresiller le sprite au
 * lieu de lui donner la derive de quelque chose qui se laisse porter.
 *
 * ## Sous la lumiere
 *
 * Le calque se pose SOUS les god rays (`fx/GodRays.ts`, zIndex 7500), qui sont
 * en blend additif : l'oiseau baigne donc dans la lumiere au lieu de se poser
 * par-dessus. Un oiseau qui passerait devant des rais serait un oiseau
 * au-dessus du soleil.
 */
import { AnimatedSprite, Assets, Container, type FrameObject, Spritesheet, type Texture } from 'pixi.js';

const SHEET = '/assets/fx/bird.png';
const DATA = '/assets/fx/bird.json';

/**
 * Juste SOUS les god rays, qui sont a 7500.
 *
 * Au-dessus du terrain (un oiseau en vol que le sol masquerait casserait
 * l'illusion) et au-dessous de la lumiere.
 */
const Z = 7_490;

/** La diagonale iso que suit le vol : vers le fond-gauche. */
const DIR = [-2, -1] as const;

/**
 * Vitesse de croisiere, en px/s du plan.
 *
 * Bien plus rapide que les nuages (4 a 11 px/s), et c'est le point : un nuage
 * est de la meteo, un oiseau VOLE. Le premier jet tournait a 3.4-6.8 px/s,
 * soit plus d'une minute pour traverser le cadre — a l'oeil l'oiseau faisait
 * du surplace. A cette allure-ci il met une dizaine de secondes : il file
 * franchement, tout en gardant son plane long entre deux battements.
 */
const SPEED_RANGE = [45, 70] as const;

/** Amplitude de l'ondulation, en pixels. */
const SWAY = 6;

/** Periode de l'ondulation, en Hz. */
const SWAY_HZ = [0.18, 0.34] as const;

export interface BirdFlockOptions {
  /** L'etendue que les oiseaux traversent, en px du plan. */
  width: number;
  height: number;
  /** Combien en vol. Un ciel habite, pas une voliere. */
  count?: number;
  /** Grossissement du sprite. La feuille est a 32 px. */
  scale?: number;
}

interface Bird {
  sprite: AnimatedSprite;
  /** La vitesse le long de la diagonale, en px/s. */
  vx: number;
  vy: number;
  /** La ligne de vol : la position SANS l'ondulation. */
  baseX: number;
  baseY: number;
  /** La normale a la trajectoire, sur laquelle porte l'ondulation. */
  nx: number;
  ny: number;
  phase: number;
  swayAmp: number;
  swayHz: number;
}

let sheetPromise: Promise<Spritesheet> | null = null;

/**
 * Charge la feuille une seule fois pour toute l'appli.
 *
 * Les deux ecrans montent chacun leur vol ; sans ce cache le second reparserait
 * la meme feuille. Le JSON est au format Aseprite en mode TABLEAU, que Pixi
 * accepte : il prend `Object.keys`, donc les textures sont nommees `'0'`..`'3'`.
 */
function loadSheet(): Promise<Spritesheet> {
  sheetPromise ??= (async () => {
    const [texture, data] = await Promise.all([
      Assets.load<Texture>(SHEET),
      fetch(DATA).then((r) => r.json()),
    ]);
    // Voisin le plus proche : la feuille est du pixel art, l'interpoler
    // ferait baver ses bords francs.
    texture.source.scaleMode = 'nearest';
    const sheet = new Spritesheet(texture, data);
    await sheet.parse();
    return sheet;
  })();
  return sheetPromise;
}

/**
 * Les frames du tag `fly`, avec la duree de chacune.
 *
 * Le cycle n'est pas un battement regulier : la frame 0 tient 1000 ms et les
 * trois autres 100 ms, soit un plane long coupe d'un battement bref. Il faut
 * donc respecter les durees INDIVIDUELLES — un `animationSpeed` unique ferait
 * defiler le plane aussi vite qu'un battement et l'oiseau moulinerait.
 *
 * Pixi ne lit pas `frameTags` (il ne connait que `animations`), donc le tag se
 * decoupe ici, a l'index.
 */
function framesFor(sheet: Spritesheet): FrameObject[] {
  const meta = sheet.data.meta as {
    frameTags?: { name: string; from: number; to: number }[];
  };
  const tag = meta.frameTags?.find((t) => t.name === 'fly');
  const keys = Object.keys(sheet.textures);
  const slice = tag ? keys.slice(tag.from, tag.to + 1) : keys;

  const frames = sheet.data.frames as unknown as { duration?: number }[];
  return slice.map((k) => ({
    texture: sheet.textures[k],
    time: frames[Number(k)]?.duration ?? 100,
  }));
}

export class BirdFlock {
  private layer = new Container();
  private birds: Bird[] = [];
  /**
   * Une horloge partagee plutot qu'un compteur par oiseau : les phases sont
   * deja decalees a la construction, et un temps commun garde les ondulations
   * stables les unes par rapport aux autres.
   */
  private elapsed = 0;
  private disposed = false;

  constructor(parent: Container, private opts: BirdFlockOptions) {
    this.layer.zIndex = Z;
    // Le ciel ne se clique pas : sans ca le calque intercepte les tuiles qu'il
    // survole, et le joueur ne peut plus creuser sous un oiseau.
    this.layer.eventMode = 'none';
    this.layer.interactiveChildren = false;
    parent.addChild(this.layer);

    void loadSheet().then((sheet) => {
      // La scene peut avoir ete detruite pendant le chargement — c'est le cas
      // au moindre changement d'ecran rapide.
      if (this.disposed) return;
      this.spawn(sheet);
    });
  }

  private spawn(sheet: Spritesheet): void {
    const { width, height, count = 2, scale = 2 } = this.opts;
    const frames = framesFor(sheet);

    for (let i = 0; i < count; i++) {
      const sprite = new AnimatedSprite(frames);
      sprite.anchor.set(0.5);

      // Chacun sa taille, pour que quelques sprites ne se lisent pas comme le
      // meme sprite copie n fois. Ni rotation ni retournement : le sprite est
      // pose tel qu'il est dessine.
      const size = scale * (0.75 + Math.random() * 0.5);
      sprite.scale.set(size);

      // Les durees du JSON telles quelles ; c'est le decalage de phase qui
      // evite qu'ils battent tous ensemble, sans quoi le vol se lit comme une
      // frise mecanique.
      sprite.animationSpeed = 1;
      sprite.currentFrame = Math.floor(Math.random() * sprite.totalFrames);
      sprite.play();

      const baseX = Math.random() * width;
      // Sur toute la hauteur, pas seulement en haut : groupes dans le tiers
      // superieur ils se lisent comme une frise posee sur le bord du cadre
      // plutot que comme un ciel habite.
      const baseY = 30 + Math.random() * Math.max(1, height - 90);
      sprite.position.set(baseX, baseY);

      // Normalisee, sinon un oiseau suivant la diagonale parcourrait plus de
      // chemin par seconde qu'un autre a vitesse egale.
      const cruise = SPEED_RANGE[0] + Math.random() * (SPEED_RANGE[1] - SPEED_RANGE[0]);
      const [ax, ay] = DIR;
      const norm = Math.hypot(ax, ay);
      const vx = (cruise * ax) / norm;
      const vy = (cruise * ay) / norm;

      // La normale a (vx, vy) est (-vy, vx), normalisee pour que l'amplitude
      // soit bien en pixels.
      this.birds.push({
        sprite,
        vx,
        vy,
        baseX,
        baseY,
        nx: -vy / cruise,
        ny: vx / cruise,
        phase: Math.random() * Math.PI * 2,
        swayAmp: SWAY * (0.6 + Math.random() * 0.8),
        swayHz: SWAY_HZ[0] + Math.random() * (SWAY_HZ[1] - SWAY_HZ[0]),
      });
      this.layer.addChild(sprite);
    }
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.elapsed += dt;
    const { width, height } = this.opts;

    for (const b of this.birds) {
      // La ligne de vol avance, puis l'ondulation s'y ajoute. Deux temps
      // distincts : c'est ce qui empeche le balancement de se cumuler.
      b.baseX += b.vx * dt;
      b.baseY += b.vy * dt;

      const sway = Math.sin(this.elapsed * b.swayHz * Math.PI * 2 + b.phase) * b.swayAmp;
      b.sprite.x = b.baseX + b.nx * sway;
      b.sprite.y = b.baseY + b.ny * sway;

      const w = Math.abs(b.sprite.width);
      const h = Math.abs(b.sprite.height);
      // Ils montent tous, donc celui qui sort par le haut revient par le BAS,
      // a une abscisse neuve — sans ca ils repassent eternellement sur la meme
      // trace et le vol se lit comme une boucle, pas comme un ciel. Le
      // rebouclage porte sur la LIGNE, pas sur le sprite : c'est elle qui fait
      // foi.
      if (b.baseY < -h) {
        b.baseY = height + h;
        b.baseX = Math.random() * width;
      }
      // En diagonale un oiseau sort aussi par un cote ; ne traiter que la
      // verticale le ferait disparaitre pour de bon.
      if (b.baseX < -w) b.baseX = width + w;
      if (b.baseX > width + w) b.baseX = -w;
    }
  }

  /** Le plan a change de taille : les oiseaux traversent la nouvelle etendue. */
  resize(width: number, height: number): void {
    this.opts = { ...this.opts, width, height };
  }

  /**
   * Annule la transformation de camera appliquee au parent, pour que le vol
   * reste epingle au CADRE et non a la scene — exactement comme le ciel de
   * `CloudField`.
   *
   * Sans ca, un recul de camera dans le terrier trainerait les oiseaux avec le
   * decor : ils grossiraient et ralentiraient avec lui, ce qui les poserait a
   * hauteur de jardin au lieu du ciel.
   */
  counterCamera(scale: number, x: number, y: number): void {
    const inv = 1 / scale;
    this.layer.scale.set(inv);
    this.layer.position.set(-x * inv, -y * inv);
  }

  destroy(): void {
    this.disposed = true;
    for (const b of this.birds) b.sprite.destroy();
    this.birds = [];
    this.layer.destroy({ children: true });
  }
}
