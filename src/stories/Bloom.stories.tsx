/**
 * Le bloom sur l'ile — la lumiere qui deborde de ce qui brille deja.
 *
 * Le brief est "leger", et c'est le mot qui rend cette story necessaire :
 * personne ne sait dire a l'avance ou est la limite entre "l'ile a l'air
 * ensoleillee" et "l'ile a l'air d'avoir de la buee sur l'objectif". Ca se
 * juge, et ca se juge sur la SCENE REELLE.
 *
 * ## Pourquoi cette scene-la
 *
 * C'est celle de `Island/Palette 2 (PNG)`, reprise telle quelle : l'ile
 * generee, ses terrasses, sa deco, et surtout son ECUME ANIMEE — le vrai
 * surf du pack, pas le losange plat de `foam.webp`.
 *
 * C'est le banc d'essai SEVERE pour un bloom, et c'est pour ca qu'elle est la
 * bonne. Il n'y a ici ni nuages ni rais de lumiere, donc aucune source
 * franchement blanche pour absorber l'effet : ce qu'il y a de plus clair a
 * l'image, ce sont l'ecume et les verts les plus lumineux des terrasses. Un
 * bloom mal seuille n'a donc nulle part ou se cacher — il va se poser sur
 * l'HERBE, ce qui est exactement le ratage qu'on veut pouvoir voir.
 *
 * Dit autrement : sur un ciel charge n'importe quel reglage passe pour bon,
 * ici non.
 *
 * ## Ce qu'il faut regarder
 *
 * Une seule chose : est-ce que le CONTRASTE de l'ile a survecu. L'ecume doit
 * deborder un peu sur la mer, et le reste ne doit pas bouger. Des que les
 * terrasses se mettent a luire, on a perdu la matiere du pixel art et gagne un
 * voile. `05 · Sans seuil` montre precisement ce ratage.
 *
 * ## Attention a ce que cette story ne doit PAS casser
 *
 * La scene d'origine sert a juger une PALETTE, c'est-a-dire des verts les uns
 * contre les autres. Un bloom pose par-dessus modifie ces verts : c'est
 * pourquoi `01` est la story sans bloom et pas l'inverse, et pourquoi le
 * toggle existe. Si un jour il faut rejuger la palette, c'est
 * `Island/Palette 2 (PNG)` qu'on ouvre, pas celle-ci.
 *
 * ## Il faut la regarder BOUGER
 *
 * L'ecume s'anime sur seize frames : des pixels passent le seuil puis
 * repassent dessous. C'est la que le bloom se gagne ou se perd — sur une
 * capture fixe un reglage trop fort passe pour une jolie lumiere, en mouvement
 * le surf clignote quand il traverse le seuil. Si ca papillote, le `knee` est
 * le dial qui adoucit la bascule sans toucher au seuil.
 *
 * ## Le bloom est sur le STAGE, pas sur l'ile
 *
 * `stage.filters = [bloom]` : l'effet est un post-traitement de l'image finie,
 * donc l'ecume peut deborder SUR la mer. Pose sur le seul conteneur de l'ile
 * il s'arreterait au trait de cote, ce qui se lit comme un detourage.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Assets, Rectangle, Texture } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { BloomFilter, BLOOM_DEFAULTS } from '@/game/fx/BloomFilter';
import { BLOOM_LOOK } from '@/config/bloomLook';
import {
  generateIsland,
  IsoIslandView,
  loadIslandTileset,
  TILE,
  type IslandTileset,
} from '@/game/island';

const WIDTH = 960;
const HEIGHT = 540;

/** Le fond, qui tient lieu de shader d'eau — comme dans la story palette. */
const SEA = '#0d8296';

/** Le tier que la story palette repeint, garde pour que la scene soit la meme. */
const TIER = 2;

/**
 * Les deux coupes de la meme feuille, reprises de `Island/Palette 2 (PNG)`.
 *
 * Le PNG est le fichier en cours de retouche, le webp celui qui ship. Garde
 * ici parce qu'un bloom se regle sur les pixels qu'on est en train de peindre,
 * pas sur ceux d'il y a trois versions.
 */
const SOURCES = {
  png: '/assets/terrain/palette-2.png',
  webp: '/assets/terrain/palette-2.webp?v=2',
} as const;
type Source = keyof typeof SOURCES;

/**
 * Le vrai surf anime du pack, et c'est LA source lumineuse de cette scene.
 *
 * Pas `/assets/terrain/foam.webp`, qui est un aplat d'une seule couleur : il
 * ne bougerait pas, donc il ne dirait rien du scintillement — qui est
 * precisement le defaut qu'un bloom peut introduire ici.
 */
const PACK_FOAM = '/assets/terrain-iso/pack-foam.webp';
const PACK_FOAM_FRAMES = 16;
const PACK_FOAM_FRAME = 128;

/** La grille de la feuille palette, comme dans la story d'origine. */
const PALETTE_COLS = 9;
const PALETTE_ROWS = 6;
const PALETTE_GRASS_ORIGIN = 5;

function sliceGrid(base: Texture, cols: number, rows: number): Texture[][] {
  return Array.from({ length: rows }, (_, row) =>
    Array.from(
      { length: cols },
      (_, col) =>
        new Texture({
          source: base.source,
          frame: new Rectangle(col * TILE, row * TILE, TILE, TILE),
        }),
    ),
  );
}

async function loadBlobSet(url: string): Promise<Texture[][]> {
  // `unload` d'abord : Pixi cache par URL, et sur un fichier en cours de
  // retouche la story montrerait la feuille telle qu'elle etait au demarrage
  // de Storybook — ce qui se lit comme "mon edit n'a rien fait".
  await Assets.unload(url).catch(() => {});
  const sheet = await Assets.load<Texture>(url);
  return sliceGrid(sheet, PALETTE_COLS, PALETTE_ROWS)
    .slice(0, 4)
    .map((line) => line.slice(PALETTE_GRASS_ORIGIN, PALETTE_GRASS_ORIGIN + 4));
}

async function loadPackFoam(): Promise<Texture[]> {
  const sheet = await Assets.load<Texture>(PACK_FOAM);
  return Array.from(
    { length: PACK_FOAM_FRAMES },
    (_, i) =>
      new Texture({
        source: sheet.source,
        frame: new Rectangle(i * PACK_FOAM_FRAME, 0, PACK_FOAM_FRAME, PACK_FOAM_FRAME),
      }),
  );
}

interface Args {
  /** Le bloom, pour pouvoir juger la scene sans lui. */
  enabled: boolean;
  threshold: number;
  knee: number;
  radius: number;
  strength: number;
  tint: string;
  saturation: number;

  /**
   * La scene, reprise de la story palette.
   *
   * Moins de dials que la-bas : ceux qui restent sont ceux qui changent ce que
   * le bloom a a accrocher (l'ecume, la deco, le relief). Les autres reglaient
   * la palette, pas la lumiere.
   */
  source: Source;
  seed: string;
  land: number;
  raggedness: number;
  deco: boolean;
  grass: boolean;
  foam: boolean;
  foamScale: number;
  tileZ: number;
}

const hex = (s: string) => Number(s.replace('#', '0x'));

/** Les valeurs figees de la story palette, celles du look arrete. */
const GROUND_SCALE = 1.52;
const CELLS = 24;
const TIERS = 3;
const RISE = 0.55;

function Scene(args: Args) {
  let tileset: IslandTileset | null = null;

  return (
    <PixiStage
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={async () => {
        const base = await loadIslandTileset();
        const blobs = await loadBlobSet(SOURCES[args.source]);
        const tierGrass = base.tierGrass.map((set, i) => (i === TIER - 1 ? blobs : set));
        tileset = { ...base, tierGrass, foam: await loadPackFoam() };
      }}
      setup={(stage, app) => {
        if (!tileset) return;
        const map = generateIsland({
          seed: args.seed,
          width: CELLS,
          height: CELLS,
          tiers: TIERS,
          land: args.land,
          rise: RISE,
          raggedness: args.raggedness,
        });
        const island = new IsoIslandView({
          map,
          tileset,
          ground: 'tiered',
          deco: args.deco,
          grass: args.grass,
          sea: false,
          foam: args.foam,
          groundScale: GROUND_SCALE,
          foamScale: args.foamScale,
          metrics: { w: 64, h: 32, z: args.tileZ },
        });
        stage.addChild(island.view);

        const scale = Math.min(WIDTH / island.width, HEIGHT / island.height);
        island.view.scale.set(scale);
        island.view.position.set(
          (WIDTH - island.width * scale) / 2,
          (HEIGHT - island.height * scale) / 2,
        );

        if (args.enabled) {
          const bloom = new BloomFilter({
            threshold: args.threshold,
            knee: args.knee,
            radius: args.radius,
            strength: args.strength,
            tint: hex(args.tint),
            saturation: args.saturation,
          });
          // Le rayon est en pixels CSS ; sans cette ligne il sort deux fois
          // trop petit sur un ecran 2x. Voir `BloomFilter.setResolution`.
          bloom.setResolution(app.renderer.resolution);
          stage.filters = [bloom];
        }

        const ticker = (t: { deltaMS: number }) => island.update(t.deltaMS);
        app.ticker.add(ticker);
        return () => {
          app.ticker.remove(ticker);
          // Le filtre vit sur le stage, que `PixiStage` ne detruit pas
          // lui-meme : sans cette ligne il survit au remontage de la story et
          // se cumule avec le suivant.
          stage.filters = [];
          island.destroy();
        };
      }}
    />
  );
}

const B = BLOOM_DEFAULTS;

const meta: Meta<Args> = {
  title: 'FX/Bloom',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  argTypes: {
    threshold: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    knee: { control: { type: 'range', min: 0, max: 0.5, step: 0.01 } },
    radius: { control: { type: 'range', min: 0, max: 24, step: 0.5 } },
    strength: { control: { type: 'range', min: 0, max: 2, step: 0.05 } },
    tint: { control: 'color' },
    saturation: { control: { type: 'range', min: 0, max: 1, step: 0.05 } },
    source: {
      control: 'inline-radio',
      options: ['png', 'webp'],
      description: 'png = la feuille en cours de retouche, webp = ce qui ship.',
    },
    seed: { control: 'text' },
    land: { control: { type: 'range', min: 0.15, max: 0.85, step: 0.01 } },
    raggedness: { control: { type: 'range', min: 0, max: 1, step: 0.02 } },
    foamScale: { control: { type: 'range', min: 0.5, max: 2.5, step: 0.01 } },
    tileZ: { control: { type: 'range', min: 0, max: 64, step: 2 } },
  },
  args: {
    enabled: true,
    threshold: B.threshold,
    knee: B.knee,
    radius: B.radius,
    strength: B.strength,
    tint: '#fff4de',
    saturation: B.saturation,
    source: 'png',
    seed: 'harbour-9',
    land: 0.46,
    raggedness: 0.4,
    deco: true,
    grass: true,
    foam: true,
    foamScale: 1.8,
    tileZ: 26,
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * La scene sans bloom : la reference.
 *
 * En premier, et pas en second, parce que c'est l'image que tout le monde a
 * deja en tete — celle de `Island/Palette 2 (PNG)`. Tout ce que les stories
 * suivantes ajoutent se juge par rapport a elle.
 */
export const Sans: Story = {
  name: '01 · Sans bloom (reference)',
  args: { enabled: false },
};

/**
 * Le reglage leger, celui du brief : `BLOOM_DEFAULTS` tel qu'il shipperait.
 *
 * L'ecume deborde de trois ou quatre pixels sur la mer, et le reste ne bouge
 * pas — les terrasses gardent leurs verts, le relief garde son contraste.
 * C'est volontairement juste au-dessus du seuil de perception : a comparer
 * avec `01` en basculant entre les deux stories.
 */
export const Leger: Story = {
  name: '02 · Leger (defaut)',
  args: {},
};

/**
 * Le bloom pousse assez fort pour qu'il ne fasse aucun doute.
 *
 * Ce n'est PAS un reglage propose : il repond a "est-ce que l'effet fait bien
 * ce que je crois". Une fois qu'on a vu OU la lumiere se depose a cette force
 * — sur l'ecume, et sur les verts les plus clairs seulement — on reconnait la
 * meme chose en discret dans la story 02.
 */
export const Appuye: Story = {
  name: '03 · Appuye (pour voir ou ca se depose)',
  args: { strength: 1.4, radius: 8 },
};

/**
 * Un halo large et doux : le bloom "atmosphere" plutot que "reflet".
 *
 * Rayon triple a force egale. C'est ce que le mot bloom evoque en general — et
 * a ce rayon, sur du pixel art nearest-neighbour, la lueur cesse d'avoir des
 * bords en escalier alors que tout le reste de l'image en a. Defendable, mais
 * c'est un autre jeu.
 */
export const Large: Story = {
  name: '04 · Halo large',
  args: { radius: 14, strength: 0.7 },
};

/**
 * Seuil a zero pousse fort : le contre-exemple.
 *
 * C'est le bloom rate classique, et c'est exactement ce qu'on obtient en
 * floutant l'image entiere pour la rajouter a elle-meme. L'herbe, la roche et
 * la mer participent autant que l'ecume ; l'image ne brille pas, elle
 * blanchit, et les terrasses que la palette separe avec peine se rapprochent
 * d'un cran.
 *
 * A regarder A COTE de `10 · Ce qui ship`, qui est le MEME seuil nul a un
 * tiers de la force : la comparaison est tout l'interet des deux stories.
 * Elle montre que ce n'est pas l'absence de seuil qui delave, c'est
 * l'absence de seuil A FORTE INTENSITE.
 */
export const SansSeuil: Story = {
  name: '05 · Sans seuil, fort (contre-exemple)',
  args: { threshold: 0, knee: 0, strength: 1.4, radius: 8 },
};

/**
 * La longue cote dechiquetee : un maximum d'ecume a l'image.
 *
 * C'est le pire cas du reglage par defaut. Le meme seuil qui tient sur une ile
 * compacte peut transformer une cote decoupee en guirlande lumineuse,
 * simplement parce que la part de surf a l'ecran a triple. La scene est celle
 * de `Shoreline` dans la story palette, pour que la comparaison soit directe.
 */
export const Cote: Story = {
  name: '06 · Cote dechiquetee (pire cas)',
  args: { seed: 'reef-3', land: 0.34, raggedness: 0.72, deco: false },
};

/**
 * Sans ecume : il ne reste que l'herbe et la roche.
 *
 * Le test le plus severe du seuil, parce qu'il n'y a plus AUCUNE source
 * legitime a l'image. Un bloom correctement regle doit ici etre quasiment
 * invisible ; s'il se voit, c'est qu'il accroche des verts, et il accrochera
 * les memes verts dans toutes les autres stories — simplement masque par
 * l'ecume.
 */
export const SansEcume: Story = {
  name: '07 · Sans ecume (le seuil seul)',
  args: { foam: false, deco: false },
};

/**
 * L'ile a plat : `tileZ` a 0, donc plus de falaises ni de volume.
 *
 * C'est la story `Flat` de la palette, et elle garde ici son interet d'origine
 * retourne : sans relief, les terrasses ne sont plus separees que par leur
 * couleur, et un bloom qui bave les rapproche. Si la lecture des paliers tient
 * ici avec le bloom allume, elle tient partout.
 */
export const Plat: Story = {
  name: '08 · A plat (le bloom contre la palette)',
  args: { tileZ: 0, deco: false, grass: false },
};

/**
 * Sans genou : `knee` a 0, seuil inchange.
 *
 * La bascule devient une marche. Sur un degrade qui traverse le seuil — le
 * bord flou du surf — un contour net apparait a l'endroit exact du
 * franchissement, et il se lit comme un defaut de compression plutot que comme
 * de la lumiere. A comparer avec la story 02, ou le meme bord passe sans
 * couture.
 */
export const SansGenou: Story = {
  name: '09 · Sans genou (contre-exemple)',
  args: { knee: 0, strength: 1.0, radius: 8 },
};

/**
 * CE QUI SHIP — le reglage branche dans le jeu.
 *
 * Pas de valeurs en dur ici : les args viennent de `BLOOM_LOOK`, la meme
 * constante que lit `Application.ts`. C'est ce qui empeche la story et le jeu
 * de diverger — un changement de reglage se fait dans le fichier de config et
 * les deux le suivent.
 *
 * Le reglage est un seuil NUL a un tiers de force, ce que `BloomFilter`
 * documente pourtant comme son contre-exemple. Choisi a l'oeil, et defendable :
 * a cette intensite l'absence de seuil ne delave pas, elle pose une brume
 * lumineuse uniforme. `05` est le meme seuil nul pousse a 1.4, et la
 * comparaison des deux est ce qui justifie le choix.
 *
 * Le revers est note dans `bloomLook.ts` : l'herbe participe au halo comme le
 * reste, donc les verts des terrasses se rapprochent d'un cheveu. `08 · A
 * plat` est la story ou ca se verrait en premier.
 */
export const Jeu: Story = {
  name: '10 · Ce qui ship (jeu)',
  args: {
    threshold: BLOOM_LOOK.threshold,
    knee: BLOOM_LOOK.knee,
    radius: BLOOM_LOOK.radius,
    strength: BLOOM_LOOK.strength,
    tint: `#${BLOOM_LOOK.tint.toString(16).padStart(6, '0')}`,
    saturation: BLOOM_LOOK.saturation,
  },
};
