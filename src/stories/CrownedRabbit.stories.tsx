/**
 * The crown, where a player actually sees it.
 *
 * `crowned` already exists end to end — the route stamps it on rank 1
 * (api/leaderboard/route.ts), the socket carries it per player
 * (use-game-socket.ts) — and the only place it is DRAWN is one 👑 glyph in the
 * board's rank column. So the season's leader is a typographic detail in a
 * panel that is closed by default, and invisible on the island, which is the
 * screen the player is actually looking at.
 *
 * Two halves here because the crown is two different problems:
 *
 *   - ON THE BOARD it is a LIST problem. The top three carry their rabbit so
 *     the podium reads as three faces rather than three lines of type, and the
 *     rest of the list stays text — a face on every row is a face on no row.
 *     Still frames: a list of twelve looping sprites is a list that flickers.
 *
 *   - ON THE ISLAND it is a DEPTH problem. The crown is a sprite over a sprite
 *     that hops, flips, gets thrown by bombs and tumbles — so it has to ride
 *     the rabbit's own container (not the board) or it will sort behind the
 *     tiles the rabbit walks toward, and it has to survive `playKnockback`
 *     moving the anchor to the body's centre mid-flight.
 *
 * Neither half can be checked without the other: a crown tuned against a still
 * avatar sits wrong on a hopping one, and vice versa.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { createTerrainBackground } from '@/game/services/TerrainBackground';
import * as Keys from '@/config/assetKeys';
import {
  COLS, ROWS, SPAWN_INDEX, makeShape, isForbidden, neighbors, RABBIT_SCALE,
} from '@/config/gridConfig';
import { mulberry32, seedFrom } from '@/lib/game/rng';
import { AVATARS, AVATAR_FRAME } from '@/lib/game/avatars';
import {
  ART, CROWN_TILT, CROWN_URL, FACE_COL, HEAD_DX, LEAD_SIZE, PODIUM, PODIUM_SIZE, crownBox,
} from '@/lib/game/podium';
import { PodiumRabbit } from '@/components/podium-rabbit';
import '@/app/globals.css';

/* ────────────────────────────────────────────────────────────────────────────
   THE BOARD HALF
   ──────────────────────────────────────────────────────────────────────── */

interface Row {
  rank: number;
  name: string;
  score: number;
  /** Which rabbit this player wears — the avatar KEY, as the server sends it. */
  avatar: string;
  digging?: boolean;
  me?: boolean;
}

/**
 * The rabbits are picked from the NAME.
 *
 * The real board takes `avatar` off the player row; a story has no players, so
 * the key is hashed from the name instead. Stable, so a given row keeps its
 * rabbit between reloads while the art is being judged.
 */
function avatarFor(name: string): string {
  const rng = mulberry32(seedFrom(name));
  return AVATARS[Math.floor(rng() * AVATARS.length)].key;
}

const ROWS_DATA: Row[] = [
  { rank: 1, name: 'Thistle', score: 25000, avatar: avatarFor('Thistle') },
  { rank: 2, name: 'Bramble', score: 6480, avatar: avatarFor('Bramble'), digging: true },
  { rank: 3, name: 'Clementine', score: 3140, avatar: avatarFor('Clementine') },
  { rank: 4, name: 'mamadou', score: 1172, avatar: avatarFor('mamadou'), digging: true },
  { rank: 5, name: 'undefinedBuck15', score: 57, avatar: avatarFor('undefinedBuck15'), me: true },
  { rank: 6, name: 'GoldenEars49', score: 40, avatar: avatarFor('GoldenEars49') },
  { rank: 7, name: 'IronDigger92', score: 12, avatar: avatarFor('IronDigger92') },
];

/**
 * The podium's geometry is SHARED with what ships.
 *
 * Every number below was settled in this story and then moved into
 * `lib/game/podium.ts`, which `components/podium-rabbit.tsx` draws from. The
 * story imports it rather than keeping a copy, so re-judging the art here is
 * re-judging the art the player sees — a mock with its own constants stops
 * being evidence the moment either side is retuned.
 */

/**
 * The board, with the podium drawn.
 *
 * The three sizes are deliberately unequal — 3x, 2x, 2x — so rank 1 is bigger
 * than the players it beat rather than merely first in a list. Below the
 * podium the rows are exactly the board's own markup, untouched.
 */
function Board({ podium, crownAlways, rows = ROWS_DATA }: {
  podium: number;
  crownAlways: boolean;
  /** Overridable so a story can ask "what if the leader is me" without
   *  mutating the shared table out from under every other story. */
  rows?: Row[];
}) {
  return (
    <div
      className="rr-lb-list"
      style={{
        background: '#161b1f',
        // Fixed, and it does not shrink. In the side-by-side story the canvas
        // is the greedy one; letting the board flex meant the score column
        // slid off the right edge and every row ended mid-number, which reads
        // as a broken board rather than as a narrow frame.
        width: 340,
        flex: '0 0 340px',
        alignSelf: 'start',
        border: '1px solid #30363d',
      }}
    >
      {rows.map((e) => {
        const onPodium = e.rank <= podium;
        // Rank 1 is TWICE the size of the other two — the same ratio the
        // island uses for the leader (`leadScale`), so the board and the map
        // make the same claim about first place rather than two different
        // ones. It was 3 against 2, and half again was not enough of a jump to
        // read as a podium at a glance.
        const size = e.rank === 1 ? LEAD_SIZE : PODIUM_SIZE;
        return (
          <div
            key={e.name}
            className={
              `rr-lb-row${e.rank === 1 ? ' crown' : ''}`
              + `${e.me ? ' me' : ''}`
              + `${e.digging ? ' digging' : ''}`
            }
            // The face needs a column of its own, otherwise it grows the rank
            // slot and the numbers below stop lining up with each other.
            style={onPodium
              ? {
                gridTemplateColumns: `clamp(18px, 2.6svh, 30px) ${FACE_COL}px 1fr auto`,
                // Room for the tallest thing in the row, COMPUTED from it.
                // Rank 1 is a 3x rabbit wearing a crown that rises above it,
                // and the board's own padding was measured for a line of text
                // — so the leader's crown was cropped by the panel edge, on
                // the one row that must not look broken. +4 for air, so the
                // points do not sit flush against the frame.
                paddingTop: e.rank === 1 && crownAlways
                  ? crownBox(size).rise + 4
                  : 8,
                paddingBottom: 8,
              }
              : undefined}
          >
            {/* The rank column keeps the NUMBER even for #1. The crown moves
                onto the rabbit's head below, where it is worn rather than
                filed — and "1" in the column keeps the ranks a readable run of
                digits instead of a glyph followed by 2, 3, 4. */}
            <span className="rr-lb-rank">{e.rank}</span>
            {/* The SHIPPING component, not a copy of it: this story is only
                evidence if what it draws is what the drawer draws. */}
            {onPodium && (
              <PodiumRabbit avatar={e.avatar} size={size} crowned={e.rank === 1 && crownAlways} />
            )}
            <span className="rr-lb-name">
              {e.name}
              {e.digging && <i className="rr-live" aria-hidden />}
              {e.digging && <small>digging now &middot; tap to watch</small>}
            </span>
            <span style={{ color: 'var(--carrot)' }}>{e.score}</span>
          </div>
        );
      })}
      {/* The claim under test, spelled out — a story is evidence only if it
          says what it is evidence OF. */}
      <p style={{ color: '#8b949e', font: '11px ui-monospace, monospace', padding: 10, margin: 0 }}>
        {podium === 0
          ? 'No faces: the board as it ships today.'
          : `Top ${podium} carry a rabbit${crownAlways ? '; #1 wears the crown' : ''}.`}
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   THE ISLAND HALF
   ──────────────────────────────────────────────────────────────────────── */

/**
 * The crown, borrowed from arena.
 *
 * `arena/public/sprites/arena-crown.png` — 29x22 of finished pixel art, already
 * used there to mark the winner of a round. Copied to
 * `public/assets/ui/crown.png` rather than drawn from `Graphics` primitives,
 * because a hand-rolled band of rectangles is a placeholder that never gets
 * replaced, and this is the same house style by the same hand.
 *
 * Arena shows it at scale 4 with a 15-degree tilt; the tilt is kept (a crown
 * square to the pixel grid reads as a hat) and the scale is not, because arena
 * draws characters many times the size of a 32px bunny.
 */

/**
 * Crown pixels per rabbit pixel.
 *
 * The art is 29 wide and the rabbit is 14 (see `ART`), so at 1:1 the crown is
 * twice as wide as the body it sits on.
 *
 * 0.32 puts the band at ~9 units. 0.5 matched the rabbit's full WIDTH, which
 * sounds right and is not: a crown as wide as the whole body swallowed the
 * head and the ears vanished under it. The head is the narrow part, and the
 * crown has to fit THAT.
 */
const CROWN_SCALE = 0.32;

/**
 * A crown that rides a rabbit.
 *
 * Parented to the rabbit's CONTAINER, not to its sprite: the sprite's scale.x
 * is flipped on every direction change (`moveTo`) and its anchor is moved to
 * the body's centre mid-flight (`playKnockback`), so a child of it would flip
 * its own crown left-right and swing about the wrong pivot when a bomb throws
 * the rabbit. The container only ever moves and sorts, which is exactly what
 * the crown wants to inherit.
 */
function makeCrown(texture: Texture): Container {
  const c = new Container();
  const crown = new Sprite(texture);
  // Anchored at the BOTTOM centre, as arena anchors it: the band's underside is
  // what sits on the head, so that is the point to position by.
  crown.anchor.set(0.5, 1);
  crown.scale.set(RABBIT_SCALE * CROWN_SCALE);
  // Same correction as the board's `HEAD_DX`, in the island's units: the
  // rabbit's anchor is 0.5 of the whole 32px frame, which centres on the BODY,
  // and the head sits a pixel to the right of that.
  crown.x = HEAD_DX * RABBIT_SCALE;
  crown.angle = CROWN_TILT;
  c.addChild(crown);
  return c;
}

/**
 * How far above the rabbit's feet the crown sits.
 *
 * The art stands ~16 units tall from the anchor (idle frame top at y18 of 32,
 * times RABBIT_SCALE 1.5), so the ears top out around -16 from the feet.
 *
 * The crown is anchored at its BASE (0.5, 1), so this is where the band's
 * underside lands. -12.5 puts it a few units inside the ears rather than level
 * with their tips: the band sinks into the skull the way the board's
 * `CROWN_BITE_RATIO` sinks it there, and the two views agree.
 *
 * Tuned at zoom — -20, then -15, both looked plausible at the size the game
 * draws a rabbit and both had daylight under the band once magnified, which is
 * the moment a crown stops being worn and becomes a marker hovering over a
 * rabbit. This is why `CrownFit` has a camera.
 */
const CROWN_Y = -12.5;

interface IslandArgs {
  seed: string;
  rabbits: number;
  stepMs: number;
  crowned: boolean;
  bob: boolean;
  /**
   * How much bigger the crowned rabbit is drawn than everyone else.
   *
   * The leader is not just marked, they are LARGER — the same claim the board's
   * podium makes, carried onto the island so the two read as one idea. 1 turns
   * it off, which is the control: it says whether the crown alone was ever
   * enough to pick the leader out of a crowd.
   */
  leadScale: number;
  /**
   * Camera zoom on the crowned rabbit.
   *
   * 1 is the game's own scale, which is what the island ships at — and at that
   * size the rabbit is about twenty pixels tall in a 640px frame, so the crown
   * is a smudge and there is nothing to judge. Anything above 1 keeps the
   * crowned rabbit centred and magnified, which is the only way to actually
   * look at a 10px sprite.
   */
  zoom: number;
}

/**
 * The crowned rabbit among uncrowned ones.
 *
 * More than one rabbit on purpose: a crown is a COMPARISON. Alone on a board
 * it always reads; the question is whether it still picks its wearer out when
 * four identical sprites are hopping around each other, which is the only
 * situation the island ever actually puts it in.
 */
function IslandScene({ seed, rabbits, stepMs, crowned, bob, zoom, leadScale }: IslandArgs) {
  return (
    <PixiStage
      width={640}
      height={540}
      background="#1eaac4"
      // The crown is not in `loadAllAssets` (it is a story asset until the
      // island itself wears one), so it is loaded alongside rather than
      // fetched inside `setup` — which cannot await.
      assets={{ crown: CROWN_URL }}
      prepare={() => loadAllAssets()}
      setup={(stage, app) => {
        initTileTextures(app.renderer);
        const crownTexture = Assets.get<Texture>('crown');

        let bg: { destroy(): void } | null = null;
        void createTerrainBackground(stage, seed).then((b) => {
          bg = b;
          b.layout(640 / 2, 540 / 2, 1.75);
        });

        const shape = makeShape(seed);
        const board = new Container();
        board.sortableChildren = true;
        stage.addChild(board);

        for (let i = 0; i < COLS * ROWS; i++) {
          if (isForbidden(i, shape)) continue;
          board.addChild(new Tile(i).container);
        }

        /**
         * The plates' own layer, as `IslandScene` gives it.
         *
         * Parented to the rabbit, a plate sorts at the rabbit's own depth and
         * whatever draws after it covers the name mid-letter. The scene puts
         * them on a layer over the board — over the counts too, so the leader
         * line is not cut wherever it crosses a dug tile. A story that skipped
         * it would be showing an arrangement the game does not use.
         */
        const nameLayer = new Container();
        nameLayer.zIndex = 1_100_000;
        nameLayer.sortableChildren = false;
        board.addChild(nameLayer);

        const SHEETS = [
          Keys.BUNNY_WHITE, Keys.BUNNY_BROWN, Keys.BUNNY_GRAY,
          Keys.BUNNY_ORANGE, Keys.BUNNY_YELLOW,
        ];

        // Walker 0 is the leader. Same entity as everyone else — the crown is
        // added to it, nothing about the rabbit itself changes, which is what
        // makes this cheap to ship.
        const walkers = Array.from({ length: rabbits }, (_, n) => {
          const rabbit = new PlayerRabbit(SPAWN_INDEX, SHEETS[n % SHEETS.length]);
          // Before `setName`, exactly as the scene does it.
          rabbit.setNameLayer(nameLayer);
          board.addChild(rabbit.container);
          // NO spawn drop under the camera.
          //
          // `playSpawnDrop` starts the rabbit 120px above its tile and tweens
          // it down — but it animates `sprite.y`, not the container's, while
          // the camera follows the CONTAINER. So for the length of the drop the
          // rabbit is off the top of a magnified frame and its crown (a child
          // of the container) sits alone in the middle of the screen, which
          // looks exactly like a crown with no rabbit under it.
          //
          // The drop is a nice touch on a full-island view and pure confusion
          // here, so it is kept only where the camera is not following.
          if (zoom === 1) rabbit.playSpawnDrop();

          // The leader is drawn BIGGER, crown and all.
          //
          // Scaled on the CONTAINER, so the crown (its child) grows with the
          // rabbit and their fit is preserved — scaling the sprite instead
          // would leave a small crown on a big head, and it would fight the
          // `scale.x` flip `moveTo` uses to face the rabbit.
          //
          // The container's own anchor is the rabbit's FEET (the sprite is
          // anchored 0.5/0.9), so growing it keeps the rabbit standing on its
          // tile instead of sinking into it or floating off.
          if (n === 0 && crowned && leadScale !== 1) {
            rabbit.container.scale.set(leadScale);
          }

          // The name plate, exactly as `IslandScene.addRabbit` gives it: cut to
          // four characters, under the feet, on the layer. Walker 0 is "me", so
          // the gold ink and the white are both on screen to compare — and the
          // leader's plate proves it does NOT grow with the rabbit.
          rabbit.setName(ROWS_DATA[n]?.name ?? `rabbit ${n}`, n === 0);

          if (n === 0 && crowned && crownTexture) {
            const crown = makeCrown(crownTexture);
            crown.y = CROWN_Y;
            rabbit.container.addChild(crown);
            if (bob) {
              // A slow, SHALLOW float. A crown perfectly still on a sprite that
              // breathes reads as painted onto the background behind it — but
              // the amplitude has to stay under the overlap, or the float
              // lifts the band clear of the head on every cycle and undoes
              // exactly what CROWN_Y is for. 0.6 of a unit: felt, not seen.
              let t = 0;
              const float = (tick: { deltaMS: number }) => {
                t += tick.deltaMS;
                crown.y = CROWN_Y + Math.sin(t / 520) * 0.6;
              };
              app.ticker.add(float);
            }
          }
          return { rabbit, at: SPAWN_INDEX, rng: mulberry32(seedFrom(`${seed}:${n}`)) };
        });

        /**
         * Walk the deported plates back under their rabbits, as the scene's
         * `update` does. Unconditional, unlike the camera below: the plates
         * need it at every zoom, and a walker moves by tween.
         */
        const names = () => { for (const w of walkers) w.rabbit.syncName(); };
        app.ticker.add(names);

        /* THE CAMERA.

           At zoom 1 the rabbit is ~20px tall in a 640px frame and the crown is
           a smudge — which is no use at all for judging a 10px sprite. So the
           board is scaled up and kept centred on the crowned walker.

           The BOARD is scaled, not the stage: the backdrop is parented to the
           stage and lays itself out against the canvas size, so scaling that
           too would zoom the island art away from the tiles it sits under.

           Follows every frame rather than on each step, because the rabbit
           moves by tween — sampling only when a hop is ORDERED would leave the
           camera behind for the length of the hop, which is exactly when the
           crown is worth watching. */
        let camera: ((t: { deltaMS: number }) => void) | null = null;
        if (zoom !== 1) {
          board.scale.set(zoom);
          const lead = walkers[0]?.rabbit.container;
          camera = () => {
            if (!lead || lead.destroyed) return;
            board.position.set(
              640 / 2 - lead.x * zoom,
              540 / 2 - lead.y * zoom,
            );
          };
          app.ticker.add(camera);
        }

        const timer = setInterval(() => {
          for (const w of walkers) {
            const options = neighbors(w.at, shape);
            if (options.length === 0) continue;
            const to = options[Math.floor(w.rng() * options.length)];
            w.rabbit.moveTo(to);
            w.at = to;
          }
        }, stepMs);

        return () => {
          clearInterval(timer);
          app.ticker.remove(names);
          if (camera) app.ticker.remove(camera);
          bg?.destroy();
        };
      }}
    />
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   THE TWO, SIDE BY SIDE
   ──────────────────────────────────────────────────────────────────────── */

interface Args extends IslandArgs {
  podium: number;
}

function Both({ podium, ...island }: Args) {
  return (
    <div style={{
      display: 'flex',
      gap: 16,
      padding: 16,
      background: '#0d1117',
      minHeight: '100vh',
      alignItems: 'flex-start',
      flexWrap: 'wrap',
    }}>
      {/* The canvas is the one that gives way. `minWidth: 0` because a flex
          item defaults to `min-width: auto` and will not shrink below its
          content — which for a 640px canvas means pushing the board off the
          screen rather than narrowing itself. */}
      <div style={{ flex: '1 1 420px', minWidth: 0 }}>
        <IslandScene {...island} />
      </div>
      <Board podium={podium} crownAlways={island.crowned} />
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'Island/Crowned rabbit',
  render: (args) => <Both key={JSON.stringify(args)} {...args} />,
  parameters: { layout: 'fullscreen' },
  args: {
    seed: 'storybook',
    rabbits: 4,
    stepMs: 320,
    crowned: true,
    bob: true,
    // Above 1 by default. The game's own scale is the honest one, but it is
    // not the LEGIBLE one: at 1 the crown is a few pixels of orange and there
    // is nothing here to look at. `OnTheIsland` keeps 1 for the honest view.
    zoom: 3,
    // The leader is twice the size of everyone else.
    leadScale: 2,
    podium: PODIUM,
  },
  argTypes: {
    seed: { control: 'text' },
    rabbits: { control: { type: 'range', min: 1, max: 5, step: 1 } },
    stepMs: { control: { type: 'range', min: 120, max: 800, step: 20 } },
    crowned: { control: 'boolean', description: 'The crown on the island leader.' },
    bob: { control: 'boolean', description: 'The crown floats rather than sitting still.' },
    zoom: {
      control: { type: 'range', min: 1, max: 8, step: 0.5 },
      description: 'Camera on the crowned rabbit. 1 is the size the game ships at.',
    },
    leadScale: {
      control: { type: 'range', min: 1, max: 3, step: 0.25 },
      description: 'How much bigger the crowned rabbit is drawn. 1 is the control.',
    },
    podium: {
      control: { type: 'range', min: 0, max: 5, step: 1 },
      description: 'How many top rows carry a rabbit. 0 is the board as it ships.',
    },
  },
};
export default meta;
type Story = StoryObj<Args>;

/**
 * The proposal, whole: a crowned leader hopping among three commoners, beside
 * a board whose top three have faces.
 *
 * What to look for — can you find the crowned rabbit without waiting for it to
 * stop moving, and does the #1 row read as first place from the corner of your
 * eye.
 */
export const Both_: Story = { name: 'Board and island', args: {} };

/**
 * The island at the size the game ACTUALLY renders it — zoom 1, no camera.
 *
 * Deliberately the unflattering view, and the one that settles the real
 * question: at the scale a player meets it, is the crown a crown or is it four
 * orange pixels? Every other island story here is magnified, which is useful
 * for tuning and misleading about legibility.
 */
export const OnTheIsland: Story = {
  render: (args) => <IslandScene key={JSON.stringify(args)} {...args} />,
  args: { rabbits: 4, zoom: 1 },
};

/**
 * One rabbit, slow steps, camera right up against it — the tuning view for
 * `CROWN_Y`, `CROWN_SCALE` and `CROWN_TILT`.
 *
 * Everything else is noise when the question is whether the band sits ON the
 * ears or floats above them, and none of it is answerable at the size the game
 * draws a rabbit.
 */
export const CrownFit: Story = {
  render: (args) => <IslandScene key={JSON.stringify(args)} {...args} />,
  args: { rabbits: 1, stepMs: 700, zoom: 6 },
};

/**
 * The crown off, same seed, same walkers.
 *
 * The control. If the leader is just as easy to pick out here, the crown is
 * decoration and not information.
 */
export const NoCrown: Story = {
  render: (args) => <IslandScene key={JSON.stringify(args)} {...args} />,
  args: { crowned: false, rabbits: 4 },
};

/**
 * The board alone, with a slider for how deep the faces go.
 *
 * Worth dragging to 5 and 0: at 5 the podium stops being a podium (a face on
 * every row is a face on no row), and at 0 you get the board as it ships, which
 * is the thing this is supposed to beat.
 */
export const BoardOnly: Story = {
  render: (args) => <Board podium={args.podium} crownAlways={args.crowned} />,
  args: {},
};

/**
 * A board where the leader is YOU.
 *
 * The one case the other stories miss: your row is already warm-tinted, and the
 * crown plus a big rabbit on top of that is three treatments stacked on one
 * line. Checks they do not fight.
 */
export const LeaderIsMe: Story = {
  render: () => (
    <Board
      podium={PODIUM}
      crownAlways
      // A copy, not a mutation: the shared table stays as every other story
      // expects to find it.
      rows={ROWS_DATA.map((r) => ({ ...r, me: r.rank === 1 }))}
    />
  ),
};
