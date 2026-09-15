/**
 * L'oiseau du ciel : une feuille rendue hors ligne, pas de la 3D en jeu.
 *
 * Le modele de depart est un glTF anime (120 verts, un skin, un cycle de
 * battement). Le jeu tourne sur Pixi seul : l'afficher en 3D demanderait un
 * second moteur pour un oiseau de 140 triangles, et le pixeliser en direct
 * ferait baver le quadrillage de pixels sur un objet qui se deplace — le
 * pixel crawl du faux pixel art temps reel.
 *
 * Il est donc rendu par `scripts/render-bird.sh` (Blender headless, rejouable
 * et versionne) en une feuille de 4 angles x 10 frames, que ce fichier joue
 * comme n'importe quel `AnimatedSprite`.
 *
 * ## Ce que la feuille garantit, et pourquoi
 *
 * La camera est ORTHOGRAPHIQUE et calee sur la projection du jeu : les nuages
 * de `isoworld/clouds.ts` courent sur les axes [2, 1] et [2, -1], donc une iso
 * 2:1, donc une elevation de atan(1/2) = 26.57 degres. Un 30 degres generique
 * — la valeur qu'on ecrit par reflexe — mettrait l'oiseau dans une autre
 * perspective que le ciel qu'il traverse.
 *
 * Le rendu sort DIRECTEMENT a 48 px avec le filtre Box a zero, au lieu d'etre
 * reduit depuis une grande image : c'est ce qui donne 0 pixel semi-transparent
 * sur toute la feuille, la ou une reduction laisserait une frange laveuse qui
 * se verrait sur le ciel.
 *
 * Le materiau est en EMISSION PURE, sans aucune lampe. Baisser le speculaire
 * d'un Principled ne suffisait pas : il restait un BSDF eclaire par deux
 * soleils, donc une arete claire sur le dessus des ailes, qui a 12 paliers de
 * quantification devenait un lisere franc. Sans calcul de lumiere il n'y a
 * plus de reflet possible.
 *
 * ## Les tags d'angle ont ete verifies sur le rendu
 *
 * Le glTF pose l'oiseau face a la camera a 0 degre, pas de profil : le premier
 * jet taguait donc les quatre rangees a 90 degres de ce qu'elles montrent. La
 * mesure qui tranche est la LARGEUR de la silhouette au fil du cycle — de
 * profil l'envergure apparente ne bouge pas (variation 2 px), de face elle
 * s'ouvre et se referme (variation 20 px). C'est ce qui fixe `ANGLES` dans le
 * script.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatedSprite, Assets, Container, type FrameObject, Graphics, Sprite, Spritesheet, Texture } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { CloudField } from '@/game/fx/Clouds';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { generateIsland, IsoIslandView, loadIslandTileset, type IslandTileset } from '@/game/island';

const WIDTH = 960;
const HEIGHT = 540;

const SHEET = '/assets/fx/bird.png';
const DATA = '/assets/fx/bird.json';

/** Les rangees de la feuille, dans l'ordre ou le script les rend. */
const ANGLES = ['side', 'front34', 'back34', 'front'] as const;
type Angle = (typeof ANGLES)[number];

/**
 * Charge la feuille et la decoupe.
 *
 * Le JSON est au format Aseprite — celui que produisent deja les autres
 * feuilles du jeu — donc Pixi le parse sans adaptateur, et les `frameTags`
 * donnent les quatre animations d'un coup.
 */
async function loadBird(): Promise<Spritesheet> {
  const [texture, data] = await Promise.all([
    Assets.load<Texture>(SHEET),
    fetch(DATA).then((r) => r.json()),
  ]);
  // Voisin le plus proche : la feuille est du pixel art, l'interpoler
  // reintroduirait exactement les bords laveux que le rendu evite.
  texture.source.scaleMode = 'nearest';
  const sheet = new Spritesheet(texture, data);
  await sheet.parse();
  return sheet;
}

/**
 * Les frames d'un angle, avec la duree de chacune.
 *
 * La feuille compose un battement d'ailes suivi d'une pose de PLANE tenue :
 * dix frames a 80 ms puis une a 1120 ms, soit 58% du cycle passe a planer.
 * Il faut donc respecter les durees individuelles — un `animationSpeed`
 * unique ferait defiler le plane aussi vite qu'un battement et l'oiseau
 * moulinerait a nouveau.
 *
 * Pixi sait le faire : un `AnimatedSprite` accepte des `FrameObject`, chacun
 * avec son `time`.
 */
function framesFor(sheet: Spritesheet, angle: Angle): FrameObject[] {
  const meta = sheet.data.meta as {
    frameTags?: { name: string; from: number; to: number }[];
  };
  const tag = meta.frameTags?.find((t) => t.name === angle);
  const names = Object.keys(sheet.textures);
  const slice = tag ? names.slice(tag.from, tag.to + 1) : names;

  const durations = sheet.data.frames as Record<string, { duration?: number }>;
  return slice.map((n) => ({
    texture: sheet.textures[n],
    time: durations[n]?.duration ?? 80,
  }));
}

interface Args {
  /** Quelle rangee de la feuille jouer. */
  angle: Angle;
  /** Grossissement du sprite. La feuille est a 48 px. */
  scale: number;
  /** Millisecondes par frame. Le script ecrit 80 dans le JSON. */
  frameMs: number;
  /** Vitesse de traversee, en pixels par seconde. 0 = immobile au centre. */
  speed: number;
  /**
   * Retourne le sprite. La feuille ne contient qu'un sens, et elle regarde a
   * GAUCHE : `flip` le fait donc regarder a droite.
   */
  flip: boolean;
}

function Scene({ angle, scale, frameMs, speed, flip }: Args) {
  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background="#8fc7e8"
      setup={(stage, app) => {
        let bird: AnimatedSprite | null = null;
        let ticker: ((t: { deltaTime: number }) => void) | null = null;

        void loadBird().then((sheet) => {
          if (!stage.parent) return;

          bird = new AnimatedSprite(framesFor(sheet, angle));
          bird.anchor.set(0.5);
          bird.scale.set(scale * (flip ? -1 : 1), scale);
          // Le JSON porte la duree de CHAQUE frame (le plane est tenu bien
          // plus longtemps qu'un battement) ; `frameMs` ne fait donc que
          // ralentir ou accelerer l'ensemble, 80 laissant le rythme d'origine.
          bird.animationSpeed = 80 / frameMs;
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
 * Toutes les frames a plat, une rangee par angle.
 *
 * C'est la vue qui rend les defauts visibles : un bord rogne, une pose
 * cassee, un angle mal tague. L'animation seule les fait passer trop vite.
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

          const names = Object.keys(sheet.textures);
          const cols = names.length / ANGLES.length;
          const cell = 48 * zoom;
          const grid = new Container();

          // Un damier sous les sprites : sans lui l'alpha et le fond sombre
          // se confondent, et on ne voit pas ou s'arrete la silhouette.
          const board = new Graphics();
          for (let row = 0; row < ANGLES.length; row++) {
            for (let col = 0; col < cols; col++) {
              board.rect(col * cell, row * cell, cell, cell)
                .fill({ color: (row + col) % 2 ? 0x3a4350 : 0x323b48 });
            }
          }
          grid.addChild(board);

          names.forEach((name, i) => {
            const s = new Sprite(sheet.textures[name]);
            s.scale.set(zoom);
            s.x = (i % cols) * cell;
            s.y = Math.floor(i / cols) * cell;
            grid.addChild(s);
          });

          grid.x = (WIDTH - cols * cell) / 2;
          grid.y = (HEIGHT - ANGLES.length * cell) / 2;
          stage.addChild(grid);
        });
      }}
    />
  );
}

/**
 * Les oiseaux dans la vraie scene : l'ile isometrique, sa mer, ses nuages.
 *
 * C'est la seule vue qui permette de juger la taille et la couleur. Sur fond
 * uni un sprite parait toujours correct ; c'est contre la mer, a cote d'une
 * ile dont l'echelle est deja acquise, qu'on voit s'il est trop gros, trop
 * clair ou trop lent.
 *
 * L'ile ISOMETRIQUE et pas `createIslandBackground` : ce dernier remplit tout
 * le cadre de terrain, il n'y reste aucun ciel, et des oiseaux poses dessus se
 * lisent comme des bestioles dans l'herbe plutot que comme du vol. Il faut de
 * la mer autour de l'ile pour qu'un oiseau ait quelque chose a survoler.
 *
 * Les nuages sont a `zIndex` 10000 (voir `fx/Clouds.ts`). Les oiseaux se
 * placent par rapport a ca : au-dessous ils passent DERRIERE les nuages,
 * au-dessus ils leur passent devant. La bonne reponse depend de la hauteur
 * qu'on veut leur donner, d'ou le controle plutot qu'une constante.
 */
const CLOUD_Z = 10_000;
const SEA = '#0d8296';

/**
 * Les axes isometriques de l'ile, en direction ecran.
 *
 * Les memes que ceux des nuages (`isoworld/clouds.ts`) : la projection est
 * 2:1, donc les deux diagonales du damier descendent ou montent d'une unite
 * ecran pour deux en largeur. Un oiseau qui traverse a l'horizontale coupe ce
 * quadrillage en biais et se lit comme colle sur l'image ; suivre un axe le
 * fait voler DANS la perspective, le long des aretes que le joueur voit deja.
 */
const ISO_AXES = [
  [2, 1],
  [2, -1],
] as const;

interface FlockArgs {
  /** Combien traversent le ciel. */
  count: number;
  /** Grossissement. La feuille est a 48 px. */
  scale: number;
  /** Devant les nuages, ou derriere. */
  aboveClouds: boolean;
  /** Densite du ciel, comme dans la story Clouds. */
  perBand: number;
  /** Suivre les diagonales de l'ile, ou traverser a plat. */
  followIso: boolean;
}

function Flock({ count, scale, aboveClouds, perBand, followIso }: FlockArgs) {
  let tileset: IslandTileset | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        [tileset] = await Promise.all([loadIslandTileset(), loadAllAssets()]);
      }}
      setup={(stage, app) => {
        const birds: { sprite: AnimatedSprite; vx: number; vy: number }[] = [];
        let ticker: ((t: { deltaTime: number }) => void) | null = null;
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

        // L'ile est a zIndex 0, les oiseaux vers 10000 : ils lui passent
        // toujours devant, ce qui est voulu — un oiseau en vol que le sol
        // masquerait casserait l'illusion. Le choix ne porte que sur les
        // nuages, qui eux sont a la meme altitude.
        const layer = new Container();
        layer.zIndex = aboveClouds ? CLOUD_Z + 10 : CLOUD_Z - 10;
        stage.addChild(layer);

        void loadBird().then((sheet) => {
          if (!stage.parent) return;

          for (let i = 0; i < count; i++) {
            // Un peu de 3/4 parmi les profils : un vol ou tous les oiseaux
            // sont exactement de profil se lit comme une frise.
            const angle: Angle = i % 3 === 2 ? 'front34' : 'side';
            const sprite = new AnimatedSprite(framesFor(sheet, angle));
            sprite.anchor.set(0.5);

            // Chacun sa taille et son sens, pour que quelques sprites ne se
            // lisent pas comme le meme sprite copie n fois.
            //
            // LA FEUILLE REGARDE A GAUCHE : sur les frames rendues la masse
            // du corps est du cote gauche et la queue s'effile vers la
            // droite. Un scale.x positif fait donc voler l'oiseau vers la
            // GAUCHE, et il faut le retourner pour aller a droite — l'inverse
            // de la convention habituelle, et la raison pour laquelle les
            // oiseaux volaient queue en avant.
            const size = scale * (0.75 + Math.random() * 0.5);
            const rightwards = Math.random() < 0.5;
            sprite.scale.set(size * (rightwards ? -1 : 1), size);

            // animationSpeed 1 = les durees du JSON sont respectees telles
            // quelles, ce qui preserve le plane long. On ne varie donc plus
            // la vitesse par oiseau ; le decalage de phase ci-dessous suffit
            // a ce qu'ils ne battent pas tous ensemble.
            sprite.animationSpeed = 1;
            sprite.currentFrame = Math.floor(Math.random() * sprite.totalFrames);
            sprite.play();

            sprite.x = Math.random() * WIDTH;
            // Sur toute la hauteur, pas seulement en haut : groupes dans le
            // tiers superieur ils se lisent comme une frise posee sur le bord
            // du cadre plutot que comme un ciel habite.
            sprite.y = 30 + Math.random() * (HEIGHT - 90);

            // La direction : une des deux diagonales de l'ile, prise dans le
            // sens ou regarde le sprite. Normalisee, sinon un oiseau suivant
            // une diagonale parcourrait plus de chemin par seconde qu'un autre
            // a vitesse egale.
            const speed = 26 + Math.random() * 26;
            const [ax, ay] = ISO_AXES[i % ISO_AXES.length];
            const norm = Math.hypot(ax, ay);
            const dir = rightwards ? 1 : -1;
            const vx = followIso ? (dir * speed * ax) / norm : dir * speed;
            const vy = followIso ? (dir * speed * ay) / norm : 0;

            // Penche le sprite le long de sa trajectoire, sinon il descend
            // la diagonale a plat et se lit comme glissant en crabe. Le signe
            // suit le sens : le sprite est retourne pour aller a droite, et
            // sans ca l'inclinaison partirait du mauvais cote.
            if (followIso) sprite.rotation = Math.atan2(vy, vx * dir) * dir;

            layer.addChild(sprite);
            birds.push({ sprite, vx, vy });
          }

          ticker = (t) => {
            const dt = t.deltaTime / 60;
            for (const { sprite, vx, vy } of birds) {
              sprite.x += vx * dt;
              sprite.y += vy * dt;
              const w = Math.abs(sprite.width);
              const h = Math.abs(sprite.height);
              // Reboucle sur les deux axes : en diagonale un oiseau sort
              // aussi par le haut ou par le bas, et le seul rebouclage
              // horizontal le faisait disparaitre pour de bon.
              if (sprite.x > WIDTH + w) sprite.x = -w;
              if (sprite.x < -w) sprite.x = WIDTH + w;
              if (sprite.y > HEIGHT + h) sprite.y = -h;
              if (sprite.y < -h) sprite.y = HEIGHT + h;
            }
          };
          app.ticker.add(ticker);
        });

        const clouds = (t: { deltaTime: number; deltaMS: number }) => {
          sky.update(t.deltaTime * (1000 / 60));
          island?.update(t.deltaMS);
        };
        app.ticker.add(clouds);

        return () => {
          app.ticker.remove(clouds);
          if (ticker) app.ticker.remove(ticker);
          for (const { sprite } of birds) sprite.destroy();
          sky.destroy();
          island?.destroy();
        };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'FX/Bird',
  parameters: { layout: 'centered' },
  argTypes: {
    angle: { control: 'inline-radio', options: ANGLES },
    scale: { control: { type: 'range', min: 1, max: 8, step: 1 } },
    frameMs: { control: { type: 'range', min: 30, max: 300, step: 10 } },
    speed: { control: { type: 'range', min: -300, max: 300, step: 10 } },
    flip: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** Le profil qui traverse : ce a quoi l'oiseau sert dans le ciel. */
export const Vol: Story = {
  // Vitesse positive donc vers la droite, et `flip` pour que le bec y soit
  // aussi : sans lui l'oiseau traverse queue en avant.
  args: { angle: 'side', scale: 4, frameMs: 80, speed: 90, flip: true },
  render: (args) => <Scene {...args} />,
};

/**
 * Immobile et grossi : pour juger la palette et les bords.
 *
 * 12 paliers de quantification donnent une dizaine de bruns — assez pour le
 * modele, assez peu pour que les aplats restent francs.
 */
export const Pose: Story = {
  args: { angle: 'side', scale: 8, frameMs: 200, speed: 0, flip: false },
  render: (args) => <Scene {...args} />,
};

/**
 * La feuille entiere.
 *
 * La rangee `front` porte le defaut connu : ailes completement repliees, la
 * silhouette se disloque en fragments (frames 5 et 7). A 48 px un oiseau vu de
 * face ailes fermees n'a presque plus de forme — c'est une limite du modele a
 * cette taille, pas du pipeline, et elle ne gene que s'il vole droit vers la
 * camera.
 */
export const Feuille: StoryObj<{ zoom: number }> = {
  args: { zoom: 2 },
  argTypes: { zoom: { control: { type: 'range', min: 1, max: 4, step: 1 } } },
  render: (args) => <Sheet {...args} />,
};

/**
 * Dans la scene : l'ile, les nuages, les oiseaux.
 *
 * La vue qui permet de decider de la taille et de la couleur. Le reglage se
 * fait ici, pas sur la feuille : `scale` contre des nuages dont l'echelle est
 * deja acquise, et `aboveClouds` pour la hauteur qu'on leur donne.
 */
export const DansLaScene: StoryObj<FlockArgs> = {
  args: { count: 5, scale: 2, aboveClouds: false, perBand: 4, followIso: true },
  argTypes: {
    count: { control: { type: 'range', min: 1, max: 14, step: 1 } },
    scale: { control: { type: 'range', min: 1, max: 6, step: 0.5 } },
    perBand: { control: { type: 'range', min: 0, max: 9, step: 1 } },
    aboveClouds: { control: 'boolean' },
    followIso: { control: 'boolean' },
  },
  render: (args) => <Flock key={JSON.stringify(args)} {...args} />,
};
