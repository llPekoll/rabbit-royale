/**
 * L'oiseau du ciel : une feuille Aseprite de quatre frames.
 *
 * ## Ce que porte la feuille
 *
 * Un seul angle, un seul tag (`fly`), quatre frames sur une toile de 32x29.
 * Le cycle n'est pas un battement regulier : la frame 0 tient 1000 ms et les
 * trois autres 100 ms chacune, soit un PLANE long coupe d'un battement bref.
 * Il faut donc respecter les durees individuelles du JSON — un
 * `animationSpeed` unique ferait defiler le plane aussi vite qu'un battement
 * et l'oiseau moulinerait.
 *
 * Pixi sait le faire : un `AnimatedSprite` accepte des `FrameObject`, chacun
 * avec son `time`.
 *
 * ## Les frames sont ROGNEES, et c'est ce qui les aligne
 *
 * Aseprite a empaquete les quatre frames au plus serre (17x9, 7x14, 14x7,
 * 7x12) et note pour chacune son decalage dans `spriteSourceSize`. Pixi lit ce
 * decalage et rend chaque texture a sa taille d'origine, 32x29 : les frames se
 * superposent donc toutes seules, sans que rien ici n'ait a refaire le calcul
 * de l'empaquetage. C'est pour ca que la vue feuille pose simplement une
 * grille de cellules 32x29.
 *
 * ## L'oiseau est presque blanc
 *
 * Les 30 couleurs de la feuille sont des blancs teintes de cyan, sans un seul
 * pixel semi-transparent. Sur un ciel clair il disparait, sur la mer il
 * ressort : c'est la scene qui tranche, d'ou le fond reglable.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatedSprite, Assets, Container, type FrameObject, Graphics, Sprite, Spritesheet, Texture } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { CloudField } from '@/game/fx/Clouds';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { generateIsland, IsoIslandView, loadIslandTileset, type IslandTileset } from '@/game/island';
import { createGodRays, type GodRays } from '@/game/fx/GodRays';

const WIDTH = 960;
const HEIGHT = 540;

const SHEET = '/assets/fx/bird.png';
const DATA = '/assets/fx/bird.json';

/** La toile d'origine des frames, celle que Pixi restitue via le trim. */
const CELL = 32;

/**
 * Charge la feuille et la decoupe.
 *
 * Le JSON est au format Aseprite en mode TABLEAU : `frames` est une liste, pas
 * un objet. Pixi la parse quand meme — il prend `Object.keys`, donc les
 * textures sont nommees `'0'`..`'3'` et le champ `filename` est ignore.
 */
async function loadBird(): Promise<Spritesheet> {
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
}

/**
 * Les frames du tag, avec la duree de chacune.
 *
 * Pixi ne lit PAS `frameTags` (il ne connait que `animations`), donc le tag se
 * decoupe ici, a l'index. Les textures etant nommees par leur index, `from` et
 * `to` s'y appliquent directement.
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

interface Args {
  /** Grossissement du sprite. La toile est a 32 px. */
  scale: number;
  /**
   * Multiplie les durees du JSON. 1 = le rythme d'origine, plane long
   * compris ; au-dela le battement s'etire.
   */
  speedFactor: number;
  /** Vitesse de traversee, en pixels par seconde. 0 = immobile au centre. */
  speed: number;
  /** Retourne le sprite, pour qu'il regarde dans le sens ou il va. */
  flip: boolean;
  /** Le ciel derriere : c'est lui qui dit si un oiseau blanc se voit. */
  background: string;
}

function Scene({ scale, speedFactor, speed, flip, background }: Args) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={background}
      setup={(stage, app) => {
        let bird: AnimatedSprite | null = null;
        let ticker: ((t: { deltaTime: number }) => void) | null = null;

        void loadBird().then((sheet) => {
          if (!stage.parent) return;

          bird = new AnimatedSprite(framesFor(sheet));
          bird.anchor.set(0.5);
          bird.scale.set(scale * (flip ? -1 : 1), scale);
          // Les durees viennent du JSON ; `animationSpeed` ne fait que les
          // dilater en bloc, ce qui preserve le rapport plane / battement.
          bird.animationSpeed = 1 / speedFactor;
          bird.x = WIDTH / 2;
          bird.y = HEIGHT / 2;
          bird.play();
          stage.addChild(bird);

          if (speed !== 0) {
            // Traverse et reboucle : c'est en mouvement que se voit un defaut
            // de boucle ou un scintillement de bord, pas sur une pose fixe.
            const span = WIDTH + bird.width;
            ticker = (t) => {
              if (!bird) return;
              bird.x += (speed * t.deltaTime) / 60;
              if (bird.x > WIDTH + bird.width / 2) bird.x -= span;
              if (bird.x < -bird.width / 2) bird.x += span;
            };
            app.ticker.add(ticker);
          }
        });

        return () => {
          if (ticker) app.ticker.remove(ticker);
          bird?.destroy();
        };
      }}
    />
  );
}

/**
 * Les quatre frames a plat.
 *
 * C'est la vue qui rend les defauts visibles : un bord rogne, une pose
 * cassee, un decalage de trim. L'animation seule les fait passer trop vite.
 */
function Sheet({ zoom }: { zoom: number }) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background="#2a3340"
      setup={(stage) => {
        void loadBird().then((sheet) => {
          if (!stage.parent) return;

          const keys = Object.keys(sheet.textures);
          const cell = CELL * zoom;
          const grid = new Container();

          // Un damier sous les sprites : sans lui l'alpha et le fond sombre
          // se confondent, et on ne voit pas ou s'arrete la silhouette. Il
          // montre aussi la toile de 32x29, donc le trim de chaque frame.
          const board = new Graphics();
          keys.forEach((_, col) => {
            board.rect(col * cell, 0, cell, cell)
              .fill({ color: col % 2 ? 0x3a4350 : 0x323b48 });
          });
          grid.addChild(board);

          keys.forEach((key, i) => {
            const s = new Sprite(sheet.textures[key]);
            s.scale.set(zoom);
            s.x = i * cell;
            grid.addChild(s);
          });

          grid.x = (WIDTH - keys.length * cell) / 2;
          grid.y = (HEIGHT - cell) / 2;
          stage.addChild(grid);
        });
      }}
    />
  );
}

/**
 * Les oiseaux dans la vraie scene : l'ile isometrique, sa mer, ses nuages.
 *
 * C'est la seule vue qui permette de juger la TAILLE et la COULEUR. Sur fond
 * uni un sprite parait toujours correct ; c'est contre la mer, a cote d'une
 * ile dont l'echelle est deja acquise, qu'on voit s'il est trop gros ou — le
 * risque propre a cet oiseau-ci, qui est quasi blanc — qu'il se confond avec
 * les nuages.
 *
 * L'ile ISOMETRIQUE et pas un fond de terrain plein cadre : il faut de la mer
 * autour pour qu'un oiseau ait quelque chose a survoler, sinon il se lit comme
 * une bestiole dans l'herbe plutot que comme du vol.
 */
const SEA = '#0d8296';

/** Les nuages sont a `zIndex` 10000 (voir `fx/Clouds.ts`). */
const CLOUD_Z = 10_000;

/**
 * Les god rays sont a `zIndex` 7500 (voir `fx/GodRays.ts`), en `blendMode`
 * additif : la lumiere s'AJOUTE a ce qu'elle traverse. Passer l'oiseau
 * au-dessous, c'est donc le faire baigner dedans plutot que le poser par
 * devant — un oiseau qui volerait par-dessus des rais serait un oiseau
 * au-dessus du soleil.
 */
const RAYS_Z = 7_500;

/**
 * La diagonale que suit le vol : vers le FOND-GAUCHE.
 *
 * La projection est 2:1, donc une diagonale du damier monte d'une unite ecran
 * pour deux en largeur — `[-2, -1]` longe exactement une arete que le joueur
 * voit deja sur le sol. Un vol strictement vertical, ou horizontal, couperait
 * ce quadrillage et se lirait comme colle sur l'image.
 *
 * UNE SEULE direction, pas deux : des oiseaux qui se croisent en sens inverse
 * se lisent comme deux groupes qui s'ignorent. Un vol qui part tout entier du
 * meme cote est un vol qui VA quelque part.
 */
const ISO_UP = [-2, -1] as const;

interface FlockArgs {
  /** Combien traversent le ciel. */
  count: number;
  /** Grossissement. La toile est a 32 px. */
  scale: number;
  /** Devant les nuages, ou derriere. */
  aboveClouds: boolean;
  /** Les rais de lumiere, sous lesquels l'oiseau passe. */
  rays: boolean;
  /** Densite du ciel, comme dans la story Clouds. */
  perBand: number;
  /**
   * Amplitude de l'ondulation, en pixels. 0 = trajectoire parfaitement
   * rectiligne, et c'est la comparaison qui montre ce que le jitter apporte.
   */
  jitter: number;
  /**
   * Multiplie la vitesse de croisiere (26 a 52 px/s selon l'oiseau). 1 = le
   * rythme d'origine, 0.5 = deux fois plus lent.
   */
  speed: number;
}

function Flock({ count, scale, aboveClouds, perBand, jitter, speed, rays }: FlockArgs) {
  let tileset: IslandTileset | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        // `loadAllAssets` en plus du tileset : les nuages vont chercher leurs
        // textures par `Assets.get`, et sans elles `CloudField` ne spawn rien
        // — un ciel vide, sans erreur, donc un defaut difficile a voir.
        [tileset] = await Promise.all([loadIslandTileset(), loadAllAssets()]);
      }}
      setup={(stage, app) => {
        interface Bird {
          sprite: AnimatedSprite;
          /** La vitesse le long de la diagonale, en px/s. */
          vx: number; vy: number;
          /** La ligne de vol : la position SANS l'ondulation. */
          baseX: number; baseY: number;
          /** La normale a la trajectoire, sur laquelle porte l'ondulation. */
          nx: number; ny: number;
          phase: number; swayAmp: number; swayHz: number;
        }
        const birds: Bird[] = [];
        let ticker: ((t: { deltaTime: number }) => void) | null = null;
        // Une horloge partagee plutot qu'un compteur par oiseau : les phases
        // sont deja decalees a la construction, et un temps commun garde les
        // ondulations stables les unes par rapport aux autres.
        let elapsed = 0;
        let island: IsoIslandView | null = null;

        if (tileset) {
          const map = generateIsland({ seed: 'harbour-9', width: 18, height: 18, tiers: 3 });
          island = new IsoIslandView({ map, tileset, ground: 'tiered', deco: true, sea: true });
          stage.addChild(island.view);
          // Ajustee au cadre, comme la story IsoIsland : ce qu'on juge est une
          // echelle relative, elle n'a de sens que si l'ile est entiere.
          const fit = Math.min(WIDTH / island.width, HEIGHT / island.height);
          island.view.scale.set(fit);
          island.view.position.set(
            (WIDTH - island.width * fit) / 2,
            (HEIGHT - island.height * fit) / 2,
          );
        }

        const sky = new CloudField(stage, { width: WIDTH, height: HEIGHT, perBand });

        let beams: GodRays | null = null;
        if (rays) {
          beams = createGodRays(WIDTH, HEIGHT);
          beams.view.zIndex = RAYS_Z;
          stage.addChild(beams.view);
        }

        // L'ile est a zIndex 0, les oiseaux juste SOUS les rais : ils passent
        // devant le sol — un oiseau en vol que le terrain masquerait casserait
        // l'illusion — mais la lumiere leur passe dessus. Les nuages sont plus
        // haut encore (10000), d'ou le choix qui reste ouvert quand les rais
        // sont eteints.
        const layer = new Container();
        layer.zIndex = rays
          ? RAYS_Z - 10
          : aboveClouds ? CLOUD_Z + 10 : CLOUD_Z - 10;
        stage.addChild(layer);

        void loadBird().then((sheet) => {
          if (!stage.parent) return;

          const frames = framesFor(sheet);
          for (let i = 0; i < count; i++) {
            const sprite = new AnimatedSprite(frames);
            sprite.anchor.set(0.5);

            // Chacun sa taille, pour que quelques sprites ne se lisent pas
            // comme le meme sprite copie n fois. L'orientation vient plus bas,
            // une fois la direction connue.
            const size = scale * (0.75 + Math.random() * 0.5);

            // animationSpeed 1 = les durees du JSON telles quelles, ce qui
            // preserve le plane long. On ne varie donc pas la vitesse par
            // oiseau ; le decalage de phase ci-dessous suffit a ce qu'ils ne
            // battent pas tous ensemble — sans quoi le vol se lit comme une
            // frise mecanique.
            sprite.animationSpeed = 1;
            sprite.currentFrame = Math.floor(Math.random() * sprite.totalFrames);
            sprite.play();

            sprite.x = Math.random() * WIDTH;
            // Sur toute la hauteur, pas seulement en haut : groupes dans le
            // tiers superieur ils se lisent comme une frise posee sur le bord
            // du cadre plutot que comme un ciel habite.
            sprite.y = 30 + Math.random() * (HEIGHT - 90);

            // La direction : la diagonale qui remonte. Normalisee, sinon un
            // oiseau suivant une diagonale parcourrait plus de chemin par
            // seconde qu'un autre a vitesse egale.
            const cruise = (26 + Math.random() * 26) * speed;
            const [ax, ay] = ISO_UP;
            const norm = Math.hypot(ax, ay);
            const vx = (cruise * ax) / norm;
            const vy = (cruise * ay) / norm;

            // Le jitter : une ondulation PERPENDICULAIRE a la trajectoire.
            //
            // Un bruit tire au hasard a chaque frame ferait vibrer le sprite —
            // du gresillement, pas du vol. Une sinusoide lente donne au
            // contraire la derive d'un oiseau qui se laisse porter : il monte,
            // redescend, et revient toujours sur sa ligne.
            //
            // Perpendiculaire et pas verticale : sur une diagonale iso, une
            // oscillation verticale se lirait comme un rebond contre le sol.
            // La normale a (vx, vy) est (-vy, vx), normalisee ici pour que
            // l'amplitude soit bien en pixels.
            const nx = -vy / cruise;
            const ny = vx / cruise;
            // Chacun sa phase, son amplitude et sa periode : sans ca les deux
            // oiseaux ondulent a l'unisson et redeviennent une frise.
            const phase = Math.random() * Math.PI * 2;
            const swayAmp = jitter * (0.6 + Math.random() * 0.8);
            const swayHz = 0.18 + Math.random() * 0.16;
            // La ligne de vol, que l'ondulation vient decorer : c'est ELLE qui
            // avance, le sway n'etant qu'un decalage applique par-dessus. Sans
            // cette ligne de reference, ajouter le sway a la position reelle
            // le cumulerait frame apres frame et l'oiseau derivera pour de bon
            // hors de sa trajectoire.
            const baseX = sprite.x;
            const baseY = sprite.y;

            // Le sprite est pose TEL QUEL : ni rotation, ni retournement.
            //
            // La feuille est dessinee de PROFIL STRICT. Pivotee pour pointer le
            // long de la diagonale, la silhouette se reduit a un trait, et
            // au-dela d'un quart de tour l'oiseau se retrouve tete en bas —
            // c'est ce que faisait `rotation = atan2(vy, vx)`, qui vaut ici
            // -2.68 rad, soit -153 degres. A plat, il garde sa lecture
            // d'oiseau et le deplacement suffit a dire la trajectoire.
            //
            // Il regarde donc a droite tout en derivant vers le fond-gauche.
            // C'est voulu : a cette taille la silhouette compte plus que la
            // coherence du cap, et un sprite retourne se lisait moins bien.
            sprite.scale.set(size, size);

            layer.addChild(sprite);
            birds.push({ sprite, vx, vy, baseX, baseY, nx, ny, phase, swayAmp, swayHz });
          }

          ticker = (t) => {
            const dt = t.deltaTime / 60;
            elapsed += dt;
            for (const b of birds) {
              // La ligne de vol avance, puis l'ondulation s'y ajoute. Deux
              // temps distincts : c'est ce qui empeche le sway de se cumuler.
              b.baseX += b.vx * dt;
              b.baseY += b.vy * dt;
              const sway = Math.sin(elapsed * b.swayHz * Math.PI * 2 + b.phase) * b.swayAmp;
              const sprite = b.sprite;
              sprite.x = b.baseX + b.nx * sway;
              sprite.y = b.baseY + b.ny * sway;

              const w = Math.abs(sprite.width);
              const h = Math.abs(sprite.height);
              // Reboucle sur les DEUX axes : en diagonale un oiseau sort par le
              // haut ET par un cote, et ne traiter que l'un des deux le ferait
              // disparaitre pour de bon. Ils montent tous, donc celui qui sort
              // par le haut revient par le BAS. Le rebouclage porte sur la
              // LIGNE, pas sur le sprite : c'est elle qui fait foi.
              if (b.baseY < -h) {
                b.baseY = HEIGHT + h;
                // Reparti a une abscisse neuve : sans ca les oiseaux repassent
                // eternellement sur la meme trace et le vol se lit comme une
                // boucle, pas comme un ciel.
                b.baseX = Math.random() * WIDTH;
              }
              if (b.baseX > WIDTH + w) b.baseX = -w;
              if (b.baseX < -w) b.baseX = WIDTH + w;
            }
          };
          app.ticker.add(ticker);
        });

        const clouds = (t: { deltaTime: number; deltaMS: number }) => {
          sky.update(t.deltaTime * (1000 / 60));
          island?.update(t.deltaMS);
          beams?.update(t.deltaMS);
        };
        app.ticker.add(clouds);

        return () => {
          app.ticker.remove(clouds);
          if (ticker) app.ticker.remove(ticker);
          for (const { sprite } of birds) sprite.destroy();
          sky.destroy();
          island?.destroy();
          beams?.destroy();
        };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'FX/Bird',
  parameters: { layout: 'centered' },
  argTypes: {
    scale: { control: { type: 'range', min: 1, max: 12, step: 1 } },
    speedFactor: { control: { type: 'range', min: 0.25, max: 4, step: 0.25 } },
    speed: { control: { type: 'range', min: -300, max: 300, step: 10 } },
    flip: { control: 'boolean' },
    background: { control: 'color' },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** Le vol qui traverse : ce a quoi l'oiseau sert dans le ciel. */
export const Vol: Story = {
  args: { scale: 4, speedFactor: 1, speed: 90, flip: false, background: '#8fc7e8' },
  render: (args) => <Scene {...args} />,
};

/**
 * Immobile et grossi : pour juger la palette et les bords.
 *
 * Fond sombre a dessein — l'oiseau etant quasi blanc, c'est la seule facon de
 * voir sa silhouette entiere et de verifier qu'aucun pixel ne bave.
 */
export const Pose: Story = {
  args: { scale: 12, speedFactor: 2, speed: 0, flip: false, background: '#2a3340' },
  render: (args) => <Scene {...args} />,
};

/** La feuille entiere, frame par frame. */
export const Feuille: StoryObj<{ zoom: number }> = {
  args: { zoom: 6 },
  argTypes: { zoom: { control: { type: 'range', min: 2, max: 12, step: 1 } } },
  render: (args) => <Sheet {...args} />,
};

/**
 * Dans la scene : l'ile, la mer, les nuages, et les oiseaux qui la traversent.
 *
 * La vue qui permet de decider de la taille et de la couleur. Le reglage se
 * fait ICI, pas sur la feuille : `scale` contre une ile dont l'echelle est
 * deja acquise, et `aboveClouds` pour la hauteur qu'on leur donne. L'oiseau
 * etant quasi blanc, c'est aussi la seule vue qui dise s'il se detache encore
 * quand il passe devant un nuage.
 */
export const DansLaScene: StoryObj<FlockArgs> = {
  args: { count: 1, scale: 2, aboveClouds: false, perBand: 4, jitter: 6, speed: 1.7, rays: true },
  argTypes: {
    count: { control: { type: 'range', min: 1, max: 14, step: 1 } },
    scale: { control: { type: 'range', min: 0.5, max: 6, step: 0.5 } },
    perBand: { control: { type: 'range', min: 0, max: 9, step: 1 } },
    jitter: { control: { type: 'range', min: 0, max: 40, step: 2 } },
    speed: { control: { type: 'range', min: 0.1, max: 3, step: 0.1 } },
    aboveClouds: { control: 'boolean' },
    rays: { control: 'boolean' },
  },
  render: (args) => <Flock key={JSON.stringify(args)} {...args} />,
};
