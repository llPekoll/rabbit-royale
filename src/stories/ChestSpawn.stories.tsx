/**
 * WHERE THE CHESTS LAND, on the island the game actually deals.
 *
 * The chests are the win condition: take them all and the island erupts
 * (`chestProgress`). So where they sit is not decoration, it is the level's
 * shape — and the rule they are dealt by (`rimTiles`) is a claim about a
 * SHAPE that no assertion states well. "Far from the spawn" and "spread around
 * the coast" are two sentences; one look at the board is both of them at once.
 *
 * `test/island.test.ts` pins the invariants — every chest past 35 % of the
 * island's radius, and landing in more than two screen quadrants. That is what
 * stops a regression. It is not what tells you the lap is any good: a deal can
 * pass both and still bunch four chests in one bay, or strand one behind a
 * cliff on a headland nobody walks to. Those are eye problems, and this is the
 * eye.
 *
 * ## What is real here
 *
 * Everything. `generateIsland` is the server's own content generator, dealing
 * bombs, carrots and chests from the same two seeds it uses in production; the
 * ground is `createTerrainBackground`, the exact call the game makes; the
 * chests are drawn by `Tile.setChest`, the same entity with the same atlas and
 * the same tier flair. Nothing here is mocked, so what the story shows is what
 * the island deals.
 *
 * The one thing that is NOT the game is the fog: every chest is shown, dug or
 * not. In a run you only see them because `publicView` leaks their tile and
 * tier on purpose (the walk to a chest is the trade the feature is about) —
 * here the point is the whole layout at once, which no player ever gets.
 *
 * ## Two traps, already paid for
 *
 * The terrain MUST come from `terrainFor`'s options, which is why this story
 * has no width or tier sliders like `IslandBoard` does. The content generator
 * places chests on `farmableTiles(seed)` — the real 32x32 board — so a story
 * that drew a 24-wide island would put its chests on land the picture does not
 * contain, and the bug would look like the placement rule failing.
 *
 * And `loadAllAssets()` is not optional: it registers the bitmap fonts, and
 * without them `pixelText` renders nothing, so the tier labels vanish and the
 * chests look unfinished rather than unlabelled.
 */
import { useCallback, useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Graphics } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { createTerrainBackground } from '@/game/services/TerrainBackground';
import { CHEST_TIER_COLOR, isChestTier } from '@/config/chestConfig';
import { generateIsland } from '@/lib/game/island';
import { spawnTile, tileScreenPos } from '@/lib/game/terrainBoard';
import { toColRow, COLS } from '@/config/gridConfig';

const WIDTH = 900;
const HEIGHT = 620;
/** The sea, as the scene paints it (`BG_COLOR`). */
const SEA = '#1eaac4';

interface Args {
  /** The island's id. Cuts the coastline AND, here, what is buried. */
  seed: string;
  /** Ring the spawn, so "far from the middle" has a middle to be far from. */
  showSpawn: boolean;
  /** Draw a line from the spawn to each chest — the lap, made literal. */
  showSpokes: boolean;
}

/**
 * The island, its chests, and the walk between them.
 *
 * ONE seed drives everything: the same string cuts the coastline, raises the
 * plateaus and deals the contents, exactly as a live island does. The content
 * seed is deliberately left to fall back to `seed` (see `GenerateOptions`) so
 * the story is reproducible — a `randomUUID` would redeal the chests on every
 * re-render and make the seed field useless for comparing two layouts.
 */
function Scene({ seed, showSpawn, showSpokes }: Args) {
  return (
    <PixiStage
      // Remount on every arg change: the terrain is built once in `setup`, so
      // a re-used stage would keep the previous seed's island under the new
      // seed's chests — the one failure that would make this story lie.
      key={`${seed}-${showSpawn}-${showSpokes}`}
      width={WIDTH}
      height={HEIGHT}
      background={SEA}
      prepare={loadAllAssets}
      setup={(stage, app) => {
        initTileTextures(app.renderer);

        const world = new Container();
        world.sortableChildren = true;
        stage.addChild(world);

        // The game's own ground, built by the game's own call — terrain,
        // ramps, scenery and the alignment that puts tile (0,0) where
        // `tilePos` says it is. Async, and deliberately not awaited: the
        // chests are positioned from the seed, not from the backdrop, so they
        // land correctly whether the tileset has decoded yet or not.
        void createTerrainBackground(world, seed);

        const island = generateIsland({ seed });
        const spawn = spawnTile(seed);

        // Fit the whole island in frame, MEASURED rather than guessed.
        //
        // The layout is only judgeable whole: the claim is about the board's
        // shape, and a cropped board cannot show a bay with no chest in it —
        // a chest clipped by the frame edge reads as a chest that was never
        // dealt. So the bounds come from the land the generator actually
        // returned, walked through the same `tileScreenPos` that places the
        // chests. A hardcoded fit drifts the moment the grid or TIER_LIFT
        // moves, and drifts silently.
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const index of island.tiles.keys()) {
          const { x, y } = tileScreenPos(seed, index);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        // Pad for what a tile draws BEYOND its anchor: half a diamond each way,
        // plus headroom for a chest's label and beam, which stand well above
        // the cell they sit on.
        const PAD_X = 40;
        const PAD_TOP = 70;
        const PAD_BOTTOM = 30;
        const w = maxX - minX + PAD_X * 2;
        const h = maxY - minY + PAD_TOP + PAD_BOTTOM;
        const scale = Math.min(WIDTH / w, HEIGHT / h);
        world.scale.set(scale);
        world.position.set(
          (WIDTH - w * scale) / 2 - (minX - PAD_X) * scale,
          (HEIGHT - h * scale) / 2 - (minY - PAD_TOP) * scale,
        );

        // The marks go in their own container ON TOP of the world, not into it.
        //
        // `createTerrainBackground` deports its trees, rocks and sheep into the
        // container it is handed as LOOSE siblings, each sorting on its own
        // `isoDepth` — that is what lets a rabbit walk behind a pine. A spoke
        // added to the same container competes on that ruler and loses to
        // every tree it passes under, which is exactly how the first cut of
        // this story drew a spawn ring nobody could see. These are annotation,
        // not scenery: they belong outside the depth system altogether.
        const marks = new Container();
        marks.scale = world.scale;
        marks.position = world.position;
        stage.addChild(marks);

        const spawnAt = tileScreenPos(seed, spawn);

        if (showSpokes) {
          for (const [index, tile] of island.tiles) {
            if (tile.content !== 'chest') continue;
            const at = tileScreenPos(seed, index);
            const g = new Graphics();
            g.moveTo(spawnAt.x, spawnAt.y).lineTo(at.x, at.y)
              .stroke({ color: 0xfff0a0, width: 2, alpha: 0.75 });
            marks.addChild(g);
          }
        }

        if (showSpawn) {
          // Two rings and a dot: one stroke alone disappeared into the grass
          // it is drawn over, and the point it marks has to be unmistakable —
          // every distance in this story is measured from it.
          const g = new Graphics();
          g.circle(spawnAt.x, spawnAt.y, 11)
            .stroke({ color: 0x000000, width: 5, alpha: 0.55 });
          g.circle(spawnAt.x, spawnAt.y, 11)
            .stroke({ color: 0xffffff, width: 2.5, alpha: 1 });
          g.circle(spawnAt.x, spawnAt.y, 2.5).fill({ color: 0xffffff });
          marks.addChild(g);
        }

        // The chests, drawn by the game's own Tile so the flair, the label and
        // the drop are the ones that ship.
        for (const [index, tile] of island.tiles) {
          if (tile.content !== 'chest' || !isChestTier(tile.chestTier)) continue;
          const t = new Tile(index);
          const at = tileScreenPos(seed, index);
          t.container.position.set(at.x, at.y);
          // Above the ground and above each other by depth, so a chest in front
          // never has its glow covered by one behind it.
          const { col, row } = toColRow(index);
          t.container.zIndex = 600 + col + row;
          world.addChild(t.container);
          t.setChest(CHEST_TIER_COLOR[tile.chestTier], false, tile.chestTier);
        }
      }}
    />
  );
}

/**
 * The island, plus the counts the eye cannot do: how many chests, and how far
 * out the nearest one sits as a share of the island's reach.
 *
 * The nearest is the number that matters. `CHEST_MIN_DEPTH` is a floor, and a
 * floor is only ever tested by its worst case — an average would hide the one
 * chest dealt next to the spawn, which is the exact failure the rule exists to
 * prevent.
 */
function chestStats(seed: string) {
  const island = generateIsland({ seed });
  const origin = toColRow(spawnTile(seed));
  const reach = (i: number) => {
    const { col, row } = toColRow(i);
    return Math.hypot(col - origin.col, row - origin.row);
  };
  const far = Math.max(...[...island.tiles.keys()].map(reach));
  const chests = [...island.tiles].filter(([, t]) => t.content === 'chest').map(([i]) => i);
  return {
    count: chests.length,
    land: island.tiles.size,
    nearest: chests.length ? Math.min(...chests.map(reach)) / far : 0,
  };
}

function Panel(args: Args) {
  const stats = useMemo(() => chestStats(args.seed), [args.seed]);

  return (
    <div style={{ padding: 16, background: '#0d1420' }}>
      <Scene {...args} />
      <div style={{
        marginTop: 10, color: '#c9d3dd', fontFamily: 'ui-monospace, monospace', fontSize: 13,
      }}>
        <strong>{stats.count}</strong> chests over <strong>{stats.land}</strong> land tiles
        {' · nearest sits at '}
        <strong style={{ color: stats.nearest < 0.35 ? '#ff6b6b' : '#7ee787' }}>
          {Math.round(stats.nearest * 100)}%
        </strong>
        {' of the island’s reach'}
      </div>
    </div>
  );
}

/**
 * ONE island as a flat plan: land in grey, spawn white, chests gold.
 *
 * ## Why this is not the Pixi board
 *
 * Because eight Pixi boards do not fit in a browser. Each `PixiStage` is its
 * own `Application` with its own WebGL context and its own copy of the tileset,
 * and at eight the context runs out of texture units: the first board drew and
 * the other seven came up as empty sea, with `addressModeU` errors in the
 * console. A grid of blank squares is worse evidence than no grid at all — it
 * looks like the generator dealt nothing.
 *
 * So the survey is drawn in 2D canvas, which costs no context. What it gives
 * up is everything about how the island LOOKS — terrain, tiers, the chest art,
 * the tier labels — and what it keeps is the only thing a survey is for:
 * WHERE the chests are, over enough islands to spot a pattern. `OneIsland` and
 * `TheLap` are where the real renderer answers for itself.
 */
function Plan({ seed, size = 210 }: { seed: string; size?: number }) {
  const canvas = useCallback((el: HTMLCanvasElement | null) => {
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const island = generateIsland({ seed });
    const spawn = spawnTile(seed);
    const cell = size / COLS;

    ctx.clearRect(0, 0, size, size);
    // Land first, as a plain field — the coastline is the frame everything
    // else is read against.
    ctx.fillStyle = '#2f4a37';
    for (const index of island.tiles.keys()) {
      const { col, row } = toColRow(index);
      ctx.fillRect(col * cell, row * cell, Math.ceil(cell), Math.ceil(cell));
    }
    // Then the chests, drawn LAST and oversized: they are the subject, and at
    // one cell each on a 32-wide plan they are three pixels nobody can count.
    for (const [index, tile] of island.tiles) {
      if (tile.content !== 'chest') continue;
      const { col, row } = toColRow(index);
      ctx.fillStyle = '#ffd54f';
      ctx.beginPath();
      ctx.arc((col + 0.5) * cell, (row + 0.5) * cell, cell * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const sp = toColRow(spawn);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc((sp.col + 0.5) * cell, (sp.row + 0.5) * cell, cell * 1.6, 0, Math.PI * 2);
    ctx.stroke();
  }, [seed, size]);

  return <canvas ref={canvas} width={size} height={size} style={{ display: 'block' }} />;
}

/**
 * Several seeds at once — the only honest way to read a GENERATOR.
 *
 * One island proves nothing: every rule here passes on some coastline. What
 * the rule has to survive is the awkward ones — a long peninsula, a bay that
 * eats half the north, an island the noise cut nearly in two — and those only
 * turn up by looking at a handful in a row.
 *
 * Read the plans for SHAPE (is there a stretch of coast with nothing on it?)
 * and the figure under each for the floor: it goes red below 35 %, which is
 * what `test/island.test.ts` enforces, so a red number here is a test about to
 * fail rather than a matter of taste.
 */
function Grid({ count, seed }: { count: number; seed: string }) {
  const [page, setPage] = useState(0);
  const seeds = Array.from({ length: count }, (_, i) => `${seed}-${page * count + i}`);
  return (
    <div style={{ padding: 16, background: '#0d1420' }}>
      <button
        onClick={() => setPage((p) => p + 1)}
        style={{
          marginBottom: 12, padding: '6px 14px', cursor: 'pointer',
          background: '#1c2b3a', color: '#c9d3dd', border: '1px solid #3a4b5c', borderRadius: 4,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        Deal {count} more
      </button>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16,
      }}>
        {seeds.map((s) => <PlanCard key={s} seed={s} />)}
      </div>
    </div>
  );
}

/** One plan, with the two numbers that say whether it passes. */
function PlanCard({ seed }: { seed: string }) {
  const stats = useMemo(() => chestStats(seed), [seed]);
  return (
    <div>
      <div style={{
        color: '#8b9aa8', fontFamily: 'ui-monospace, monospace', fontSize: 11, marginBottom: 4,
      }}>{seed}</div>
      <Plan seed={seed} />
      <div style={{
        color: '#c9d3dd', fontFamily: 'ui-monospace, monospace', fontSize: 11, marginTop: 4,
      }}>
        {stats.count} chests · nearest{' '}
        <strong style={{ color: stats.nearest < 0.35 ? '#ff6b6b' : '#7ee787' }}>
          {Math.round(stats.nearest * 100)}%
        </strong>
      </div>
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'Island/Chest spawn',
  render: (args) => <Panel {...args} />,
  args: { seed: 'harbour', showSpawn: true, showSpokes: false },
  argTypes: {
    seed: { control: 'text' },
    showSpawn: { control: 'boolean' },
    showSpokes: { control: 'boolean' },
  },
};
export default meta;

type Story = StoryObj<Args>;

/** One island, read closely: is every chest out on the coast, and is there a
 *  stretch of shore with nothing on it? */
export const OneIsland: Story = {};

/**
 * The lap, drawn.
 *
 * A spoke per chest from the spawn. What it shows in one look is whether the
 * chests are DIRECTIONS or just distances: an even fan is a lap of the island,
 * and a bundle of spokes pointing the same way is the failure `rimTiles`'
 * angular slices exist to prevent — every chest far away, all of them on the
 * same headland, the "lap" a walk up one corridor and back.
 */
export const TheLap: Story = { args: { showSpokes: true } };

/**
 * Eight islands as flat plans, and a button for eight more.
 *
 * THE story to open when the placement rule changes. A tweak to
 * `CHEST_MIN_DEPTH` or to the slice count looks fine on a friendly coastline
 * and falls apart on a lumpy one; this is where that shows up, because the
 * lumpy one is always in the next eight.
 *
 * Plans rather than boards, for a reason worth keeping: eight Pixi stages
 * exhaust the WebGL context and seven of them come up blank (see `Plan`). This
 * trades the art for the sample size, which is the right trade for a survey
 * and the wrong one for everything else — hence the two stories above.
 */
export const ManySeeds: Story = {
  render: (args) => <Grid seed={args.seed} count={8} />,
};
