/**
 * A zone opening as a WAVE instead of all at once.
 *
 * Digging a zero opens a whole region of numbers (`cascadeHints`), and the
 * client writes every one of them on the same frame — a hundred tiles thin
 * their lids together and the board changes state with a blink. Paul, looking
 * at it: "la c'est instant ca serait bien que ca fasse comme comme une wave qd
 * ca se decouvre".
 *
 * Nothing about WHAT opens changes here — the region is the server's, computed
 * by the real `cascadeAround` over a real `generateIsland`. Only the order and
 * the timing of the drawing: each tile waits on its distance from the dig, so
 * the reading travels outward from the spade.
 *
 * `Instant` is the game as it ships, side by side with the same dig as a wave.
 * The two stories are the comparison; the sliders are for picking the numbers
 * that would go into the scene.
 *
 * SCALE, because it decides every timing here. A zone is the whole connected
 * region of zeros — 35 tiles on average, and the largest measured was 193 — so
 * the front has real distance to cross and `maxDelay` is what keeps a wide one
 * from outliving the player's attention.
 *
 * This story still opens the zone `cascadeAround` gives it, so it shows
 * whatever the rules currently deal.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container } from 'pixi.js';
import gsap from 'gsap';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { PlayerRabbit } from '@/game/entities/PlayerRabbit';
import { generateIsland, cascadeAround, revealTile } from '@/lib/game/island';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { createTerrainBackground } from '@/game/services/TerrainBackground';
import * as Keys from '@/config/assetKeys';
import { COLS, ROWS, isForbidden, makeShape, toColRow } from '@/config/gridConfig';

/** How the wave measures "how far out is this tile". */
type Metric = 'ring' | 'euclidean';

interface Args {
  /** The island. Changing it deals different bombs, so different zones. */
  seed: string;
  /** Off to judge the wave against flat colour rather than the painted art. */
  background: boolean;
  /**
   * Seconds of delay added per step away from the dig. 0 is today's behaviour:
   * every tile starts on the same frame.
   *
   * Scaled down by `maxDelay` on a zone wide enough that the full spread would
   * outrun the cap.
   *
   * Read against the lid's OWN fade, which `revealHint` fixes at 0.25s and
   * this story deliberately does not touch: below about a third of that the
   * rings overlap into a single bloom, and the wave stops being a wave. That
   * fade is the reason the useful range here starts around 0.1 rather than at
   * the few-frames stagger a bigger region would want.
   */
  perStep: number;
  /**
   * How distance is measured. `ring` is the cascade's own metric (Chebyshev —
   * square rings, the shape `CASCADE_RADIUS` bounds), so the front matches the
   * region's edge. `euclidean` rounds the front off, which on a diamond
   * lattice reads closer to a ripple on water.
   */
  metric: Metric;
  /**
   * How far a tile rises as the front passes over it, in px. 0 is the flat
   * wave — the lid thins in order and nothing moves.
   *
   * Small: the board is drawn at HALF_H = 12px per cell, so a tile lifting 6px
   * has already travelled half a cell and starts to read as leaving the
   * ground rather than as swelling under it.
   */
  bob: number;
  /**
   * Seconds of the up-and-down itself, per tile. The tile goes up and comes
   * back in this, so it is the ripple's "thickness" — how long the crest
   * sits on any one cell.
   */
  bobTime: number;
  /** Cap on total spread, so a wide zone cannot take all day to finish. */
  maxDelay: number;
}

/** Distance from the dig to a tile, in whichever metric the story is showing. */
function distance(from: number, to: number, metric: Metric): number {
  const a = toColRow(from);
  const b = toColRow(to);
  const dc = Math.abs(a.col - b.col);
  const dr = Math.abs(a.row - b.row);
  return metric === 'ring' ? Math.max(dc, dr) : Math.hypot(dc, dr);
}

function Scene({ seed, background, perStep, metric, maxDelay, bob, bobTime }: Args) {
  return (
    <PixiStage
      width={960}
      height={540}
      background="#1eaac4"
      prepare={() => loadAllAssets()}
      setup={(stage, app) => {
        initTileTextures(app.renderer);
        const shape = makeShape(seed);

        let bg: { destroy(): void } | null = null;
        if (background) {
          void createTerrainBackground(stage, seed).then((b) => { bg = b; });
        }

        const board = new Container();
        board.sortableChildren = true;
        stage.addChild(board);

        // The numbers' own layer, above every tile and the rabbit: the same
        // split the scene makes, and the reason a hint is never covered by a
        // sprite standing one cell south of it.
        const hints = new Container();
        hints.sortableChildren = true;
        hints.zIndex = 1000;
        board.addChild(hints);

        const tiles = new Map<number, Tile>();
        for (let i = 0; i < COLS * ROWS; i++) {
          if (isForbidden(i, shape)) continue;
          const tile = new Tile(i, undefined, 0, 0, hints);
          tiles.set(i, tile);
          board.addChild(tile.container);
        }

        // The REAL island, dealt by the server's own generator — bombs, counts
        // and all. A story that scattered its own zeros could show a beautiful
        // wave over a region the game would never open.
        const island = generateIsland({ seed, contentSeed: `${seed}-wave` });

        const rabbit = new PlayerRabbit(0, Keys.BUNNY_WHITE);
        board.addChild(rabbit.container);

        /** Everything gsap is holding, so a re-render cannot leave a half-run wave behind. */
        let pending: gsap.core.Tween[] = [];
        const stopWave = () => { for (const t of pending) t.kill(); pending = []; };

        /**
         * Lift a tile and set it back down as the front passes over it.
         *
         * The tile's `y` carries its place on the lattice; its `zIndex` does
         * not (that is `col + row`, fixed at construction). So a tile can rise
         * and fall without ever changing what draws in front of what — which
         * is the only reason a ripple can be done by moving tiles at all.
         *
         * The NUMBER has to ride along. On the shared hint layer a count holds
         * the tile's world position in its own coordinates (`hintBaseY`), so
         * moving the tile alone slides the ground out from under its number
         * and the two visibly come apart at the crest.
         *
         * Nothing here is killed on re-entry: a tile is lifted once per wave,
         * by construction, and a yoyo tween that is interrupted halfway would
         * leave the tile parked above the board.
         *
         * WHAT THIS COSTS TO PORT, and it is not nothing. This story keeps the
         * veil inside the tile's container, so moving the container moves the
         * visible diamond. The SCENE does not: `IslandScene` calls
         * `Tile.mountVeil`, which hands the veil (and the highlight, and the
         * blink) to the cell's terrain block, where `IsoIslandView.mountVeil`
         * gives it a position of its own. Lift the container there and the
         * numbers rise off a surface that stays put.
         *
         * So the scene version has to move the BLOCK, or move the veil beside
         * the container. That is the real work behind this effect, and the
         * reason to decide it is worth having before starting it — which is
         * what these stories are for.
         */
        const lift = (tile: Tile, delay: number) => {
          if (bob <= 0) return;
          const from = tile.container.y;
          /**
           * The number is read every frame, not captured once.
           *
           * A tile's count is created the moment it opens — which, during a
           * wave, is in the middle of its own lift. Grabbing `hintGroup` when
           * the tween is scheduled gets `null` for exactly the tiles the
           * cascade is about to write on, and their numbers then pop in at
           * the resting height while the ground under them is still up.
           *
           * `restY` is the number's own resting position, latched the first
           * frame it exists, so the offset is applied to where it wants to be
           * rather than accumulating on where it already is.
           */
          let restY: number | null = null;
          pending.push(gsap.to(tile.container, {
            y: from - bob,
            duration: bobTime / 2,
            delay,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: 1,
            onUpdate: () => {
              const group = (tile as unknown as { hintGroup: Container | null }).hintGroup;
              if (!group || group.destroyed) return;
              if (restY === null) restY = group.y;
              group.y = restY + (tile.container.y - from);
            },
            onComplete: () => {
              // Land exactly, not near-enough: a tile that ends a few
              // hundredths off its lattice position is a tile that has left
              // the grid, and the error would compound over repeated waves.
              tile.container.y = from;
              const group = (tile as unknown as { hintGroup: Container | null }).hintGroup;
              if (group && !group.destroyed && restY !== null) group.y = restY;
            },
          }) as gsap.core.Tween);
        };

        /**
         * Play one dig as a wave.
         *
         * The dug tile opens immediately — it is what the player touched, and
         * delaying it would read as lag rather than as an effect. Everything
         * the cascade opened is then sorted by distance and scheduled.
         *
         * `gsap.delayedCall` rather than a per-tile timeline: the tile's own
         * fade is `revealHint`'s, and the only thing being added here is WHEN
         * it starts. That is deliberately the smallest possible change to make
         * in the scene later — one delay, no new animation.
         */
        const dig = (index: number) => {
          const tile = tiles.get(index);
          if (!tile || tile.revealed) return;

          revealTile(island, index);
          const t = island.tiles.get(index);
          if (!t) return;

          rabbit.moveTo(index);
          tile.revealContent(t.content, t.adjacent, true);

          const opened = cascadeAround(island, index);
          if (opened.length === 0) return;

          // Farthest tile first, so the cap scales the whole spread rather
          // than clipping the outer ring into a simultaneous flash.
          const far = Math.max(...opened.map((h) => distance(index, h.tile, metric)));
          const scale = far * perStep > maxDelay ? maxDelay / (far * perStep) : 1;
          const delayFor = (i: number) => distance(index, i, metric) * perStep * scale;

          for (const h of opened) {
            const delay = delayFor(h.tile);
            const target = tiles.get(h.tile);
            if (!target) continue;
            if (delay <= 0) { target.revealHint(h.adjacent); continue; }
            pending.push(gsap.delayedCall(delay, () => target.revealHint(h.adjacent)));
          }

          /**
           * The ripple lifts THE TILES THAT OPENED, and nothing else.
           *
           * It first ran over every tile within the front's reach, on the
           * theory that a wave does not ask which part of the pond is new —
           * true of water, false of this board. In the game that made the
           * whole island heave around every dig, and claimed something had
           * happened to ground that had not changed. The lift follows the
           * reveal exactly: one tile, one lid coming off.
           */
          for (const h of opened) {
            const target = tiles.get(h.tile);
            if (target) lift(target, delayFor(h.tile));
          }
        };

        for (const [index, tile] of tiles) {
          tile.container.on('pointertap', () => dig(index));
        }

        // How many lids are open right now, for the Playwright probe that
        // checks the wave actually staggers. `hinted` is the tile's own flag,
        // so this counts zeros too — and a zone is mostly zeros, which is
        // precisely why counting the drawn numbers instead reads a wave as
        // instant. Test seam, not game state.
        (window as unknown as { __waveOpened?: () => number }).__waveOpened =
          () => [...tiles.values()].filter((t) => t.hinted || t.revealed).length;

        // Every tile's offset from where the lattice says it should be. Zero
        // everywhere means the board is at rest; the probe watches this go
        // non-zero as the swell passes and come back to exactly zero after,
        // which is the one thing a ripple must not get wrong.
        const restY = new Map([...tiles].map(([i, t]) => [i, t.container.y] as const));
        (window as unknown as { __waveOffsets?: () => number[] }).__waveOffsets =
          () => [...tiles].map(([i, t]) => Number((t.container.y - restY.get(i)!).toFixed(3)));

        // Open on a zone already spreading, so the story says what it is about
        // before anything is clicked.
        //
        // The WIDEST zero on the board, not the first one: a zero in a corner
        // opens eight tiles, and eight tiles arriving in any order look the
        // same. The effect only becomes judgeable on a region big enough to
        // have an inside and an outside, and picking the biggest is how the
        // story guarantees one on every seed. Measured by dry-running the real
        // cascade on a throwaway copy of the island, so the count is the
        // server's answer rather than a guess about it.
        let widest: number | undefined;
        let widestSize = -1;
        for (const [i, t] of island.tiles) {
          if (t.revealed || t.hinted || t.content === 'bomb' || t.adjacent !== 0) continue;
          const probe = generateIsland({ seed, contentSeed: `${seed}-wave` });
          revealTile(probe, i);
          const size = cascadeAround(probe, i).length;
          if (size > widestSize) { widestSize = size; widest = i; }
        }
        if (widest !== undefined) gsap.delayedCall(0.4, () => dig(widest));

        return () => {
          delete (window as unknown as { __waveOpened?: () => number }).__waveOpened;
          delete (window as unknown as { __waveOffsets?: () => number[] }).__waveOffsets;
          stopWave();
          for (const tile of tiles.values()) tile.destroy();
          bg?.destroy();
        };
      }}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Island/Cascade wave',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  args: {
    seed: 'cascade-wave',
    background: true,
    perStep: 0.12,
    metric: 'ring',
    maxDelay: 0.6,
    bob: 0,
    bobTime: 0.45,
  },
  argTypes: {
    seed: { control: 'text' },
    perStep: { control: { type: 'range', min: 0, max: 0.3, step: 0.01 } },
    maxDelay: { control: { type: 'range', min: 0.2, max: 3, step: 0.1 } },
    bob: { control: { type: 'range', min: 0, max: 12, step: 0.5 } },
    bobTime: { control: { type: 'range', min: 0.15, max: 1.2, step: 0.05 } },
    metric: { control: 'inline-radio', options: ['ring', 'euclidean'] },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * The wave. Click any tile to dig it — land on a zero and the zone opens
 * outward from the spade.
 */
export const Wave: Story = {};

/**
 * The game as it ships: `perStep` at zero, so every tile in the zone opens on
 * the same frame.
 *
 * Open this beside `Wave` — the comparison is the whole point of the pair. The
 * region is identical in both; only the order it arrives in differs.
 */
export const Instant: Story = { args: { perStep: 0 } };

/**
 * A slow front: the delay per step raised until the wave is unmistakably a
 * travelling edge rather than a bloom.
 *
 * Too slow to ship — a player is already moving again before the far numbers
 * land — but it is the setting that shows what the effect IS, and so the one
 * to judge the metric on.
 */
export const SlowFront: Story = { args: { perStep: 0.18, maxDelay: 2.5 } };

/**
 * THE ripple: round distance, and the ground rises and falls under the front.
 *
 * Two things together, and it needs both. `euclidean` makes the front a circle
 * rather than a square ring, so it spreads the way something dropped in water
 * spreads. `bob` makes the tiles it passes over lift and come back down, which
 * is what turns a change of colour travelling outward into a swell travelling
 * outward.
 *
 * The lift runs over every tile in reach, not only the ones whose number this
 * dig wrote — see `dig`. On a board where half the region was already dug, a
 * swell that skipped the dug half would break into patches.
 */
export const Ripple: Story = { args: { metric: 'euclidean', bob: 5, bobTime: 0.45 } };

/**
 * The ripple's two halves, apart: the circular front with no lift.
 *
 * Worth a look beside `Ripple` to see how much of the effect is the movement
 * and how much is just the ordering — on a small zone the answer is "mostly
 * the movement", which is the argument for paying for it.
 */
export const RippleFlat: Story = { args: { metric: 'euclidean' } };

/**
 * A deep, slow swell — the lift pushed past what should ship.
 *
 * At this height the tiles visibly leave the lattice and the board reads as
 * cloth rather than ground. It is here to find the ceiling: the usable value
 * is the one just below where you start seeing tiles come apart at the seams,
 * and you cannot find that without crossing it.
 */
export const DeepSwell: Story = { args: { metric: 'euclidean', bob: 10, bobTime: 0.7, perStep: 0.16 } };
