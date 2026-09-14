/**
 * The chest on the board, and the word above it.
 *
 * A chest has to be priced from across the island — the walk to it is the trade
 * the feature is about, and a player deciding "four steps, do I dare" needs to
 * know what is in it before they set off. So the tier is ANNOUNCED: a ground
 * glow, a ring, a shaft of light, and the tier spelled out in words.
 *
 * The word is the part that carries. Colour alone is a code the player has to
 * learn, and half of them never will; CROWN written over the box needs no key.
 * The flair says "valuable", the label says exactly how much.
 *
 * ## Why this is a story and not a screenshot
 *
 * Everything here is drawn by the game's own `Tile` — same `setChest`, same
 * atlas, same tweens. A story that mocked the chest would prove nothing about
 * the chest that ships. The four tiers sit side by side because the ladder is
 * only meaningful as a COMPARISON: each accent has to be tellable from its
 * neighbours at board distance, which is impossible to judge one at a time.
 *
 * ## The two traps, already paid for
 *
 * `loadAllAssets()` is not optional. It registers the bitmap fonts, and without
 * them `pixelText` renders NOTHING — the label silently disappears and the
 * chest looks finished. It also parses the loot-box atlas, without which the
 * chest falls back to a static PNG.
 *
 * And `Tile` draws only fog and contents, never ground. Without the floor drawn
 * here the board is a black square with chests floating on it, which reads as a
 * broken asset rather than as a missing backdrop.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Graphics } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { Tile } from '@/game/entities/Tile';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures } from '@/game/services/TileTextures';
import { tilePos, toIndex } from '@/config/gridConfig';
import {
  CHEST_TIER_COLOR, CHEST_TIER_ORDER, CHEST_TIER_PROMISE, chestTierCss, isChestTier,
  type ChestTier,
} from '@/config/chestConfig';
import { generateIsland, publicView } from '@/lib/game/island';

/** Grass, so the accents are judged against the colour they ship against. */
const GRASS = 0x3f7d3a;
const GRASS_EDGE = 0x2d5c2a;

/**
 * One isometric diamond of ground under `index`.
 *
 * Half-sizes are hard-coded to the grid's (22x12) rather than imported so the
 * floor cannot drift from `tilePos` — if the grid ever changes, this story
 * should break loudly rather than draw a floor that no longer lines up.
 */
function floorDiamond(g: Graphics, index: number, lift = 0): void {
  const { x, y: flatY } = tilePos(index);
  const y = flatY - lift;
  g.poly([x, y - 12, x + 22, y, x, y + 12, x - 22, y])
    .fill({ color: GRASS })
    .stroke({ color: GRASS_EDGE, width: 1 });
}

interface BoardProps {
  /** Play the drop-in animation rather than starting settled. */
  drop: boolean;
  /** Reveal the ground under the chests (fog off), as a dug board looks. */
  revealed: boolean;
}

/**
 * The four tiers in a row, on real ground.
 *
 * Laid out on one grid row so nothing but the accent differs between them:
 * same lift, same neighbours, same distance from the eye. A ladder judged with
 * the tiers on different terraces is judging the terraces.
 */
function Board({ drop, revealed }: BoardProps) {
  return (
    <PixiStage
      // Remount on every arg change — the drop animation has to replay from
      // the top, and a re-used scene would show it already landed.
      key={`${drop}-${revealed}`}
      width={960}
      height={360}
      background="#0d1b12"
      prepare={loadAllAssets}
      setup={(stage, app) => {
        initTileTextures(app.renderer);

        const world = new Container();
        world.sortableChildren = true;
        stage.addChild(world);

        // The floor goes in one Graphics under everything: it is scenery, and
        // a diamond per tile would fight the tiles' own depth sorting.
        const floor = new Graphics();
        floor.zIndex = -1000;
        world.addChild(floor);

        const tiles: Tile[] = [];
        // Four chests on ONE SCREEN ROW, not one grid row.
        //
        // `tilePos` puts y at `(col + row) * HALF_H`, so stepping col alone
        // walks the chests down the screen in a diagonal — and since the label
        // sits higher the richer the tier, GOLD's word ran straight into
        // CROWN's. Stepping col up and row down by the same amount keeps
        // `col + row` constant: the chests move sideways only, and the four
        // labels sit on a level line where they can be compared.
        const base = 6;
        CHEST_TIER_ORDER.forEach((tier, i) => {
          const col = base + i * 2;
          const row = base - i * 2;
          const index = toIndex(col, row);

          // A ring of plain ground around each chest, so every accent is read
          // against grass rather than against the void.
          for (let dc = -1; dc <= 1; dc++) {
            for (let dr = -1; dr <= 1; dr++) floorDiamond(floor, toIndex(col + dc, row + dr));
          }

          const tile = new Tile(index);
          if (revealed) tile.markSpawn();
          // Above the floor and above its neighbours' flair: a chest whose glow
          // is covered by the next tile's fog reads as a duller tier than it is.
          tile.container.zIndex = 95 + i;
          world.addChild(tile.container);
          tile.setChest(CHEST_TIER_COLOR[tier], drop, tier);
          tiles.push(tile);
        });

        // Centre on the TILES, not on `getLocalBounds()`.
        //
        // The bounds of the world include the beams, the labels and the motes,
        // and every one of those is mid-tween when this runs — so the measured
        // box is whatever the animation happened to be doing on frame one, and
        // the row lands somewhere different each run. The tile positions are
        // fixed and knowable, so the midpoint between the first and last chest
        // is the honest centre. The nudge up leaves room for the labels, which
        // stand above the tiles rather than on them.
        const first = tilePos(toIndex(base, base));
        const last = tilePos(toIndex(base + 6, base - 6));
        world.position.set(
          app.screen.width / 2 - (first.x + last.x) / 2,
          app.screen.height / 2 - (first.y + last.y) / 2 + 40,
        );

        return () => { for (const t of tiles) t.destroy(); };
      }}
    />
  );
}

/** The ladder as a table — what each word above a chest actually promises. */
function Promises() {
  return (
    <div style={{ font: '13px ui-monospace, monospace', color: '#c8d6c8', padding: 16 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: 640 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #2d5c2a' }}>
            <th style={{ padding: '6px 10px' }}>Tier</th>
            <th style={{ padding: '6px 10px' }}>What it holds</th>
          </tr>
        </thead>
        <tbody>
          {CHEST_TIER_ORDER.map((tier) => (
            <tr key={tier} style={{ borderBottom: '1px solid #1b3a1b' }}>
              <td style={{ padding: '6px 10px', color: chestTierCss(tier), fontWeight: 700 }}>
                {tier.toUpperCase()}
              </td>
              <td style={{ padding: '6px 10px' }}>{CHEST_TIER_PROMISE[tier]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const meta = {
  title: 'Chests/Tier on the board',
  component: Board,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    drop: { control: 'boolean', description: 'Play the drop-in animation' },
    revealed: { control: 'boolean', description: 'Ground dug (fog off)' },
  },
  args: { drop: false, revealed: true },
} satisfies Meta<typeof Board>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The ladder, settled. The comparison the accents exist to survive: copper,
 * silver, gold, violet — told apart at a glance across a board.
 *
 * The two warm metals are the pair to watch here. Bronze and gold sit close in
 * hue by nature, so bronze is pushed dark and coppery against a bright yellow
 * gold; if those two ever read as one colour, the ladder has lost its bottom
 * half. CROWN breaks the metals on purpose — violet is the one hue nothing
 * else on the board uses, so the best chest in the game is never "gold,
 * slightly more".
 */
export const TheLadder: Story = {};

/**
 * How a chest ARRIVES — it falls in with the board rather than being found
 * already there, so the player sees it land. The glow, ring, beam and label all
 * fade in on impact: showing the rarity mid-air would give the outcome away
 * before the box has touched the ground.
 */
export const DropIn: Story = { args: { drop: true } };

/**
 * The tile's own fog diamond left on, rather than dug.
 *
 * Deliberately a SMALL difference, and worth knowing it is small: the board's
 * real veil lives in the terrain block (`mountVeil`), which this story does not
 * mount, and the tile's own fog is a 32%-alpha diamond that the chest's 92%
 * glow simply sits on top of. So this is evidence that the accent survives the
 * tile fog — not that it survives the veil. Judging "can I see a chest through
 * unexplored ground" needs the island scene, not this bench.
 */
export const TileFogOn: Story = { args: { revealed: false } };

/**
 * The REAL path, end to end: a generated island, through `publicView`, into the
 * same `showChests` the game calls.
 *
 * The ladder stories above hand `setChest` its arguments directly, which proves
 * the drawing but not the plumbing. This one proves the part that actually
 * shipped — that the server advertises undug chests at all, that the tier
 * survives the wire as a string, and that what comes out the other end is a box
 * on the right tile in the right colour. Nothing here is hand-placed: the seed
 * decides how many chests there are and what they are.
 */
function FromSnapshot({ seed }: { seed: string }) {
  const island = generateIsland({ seed, contentSeed: `private-${seed}` });
  const snapshot = publicView(island);

  return (
    <div>
      <PixiStage
        key={seed}
        width={960}
        height={420}
        background="#0d1b12"
        prepare={loadAllAssets}
        setup={(stage, app) => {
          initTileTextures(app.renderer);
          const world = new Container();
          world.sortableChildren = true;
          stage.addChild(world);

          const floor = new Graphics();
          floor.zIndex = -1000;
          world.addChild(floor);

          // Ground under every tile the island actually has, so the chests are
          // read against the board's own shape rather than a tidy strip.
          const tiles = new Map<number, Tile>();
          for (const index of island.tiles.keys()) {
            floorDiamond(floor, index);
            const tile = new Tile(index);
            tile.markSpawn();
            world.addChild(tile.container);
            tiles.set(index, tile);
          }

          // The wire format, applied the way the scene applies it.
          for (const c of snapshot.chests) {
            const tile = tiles.get(c.tile);
            if (!tile) continue;
            const tier = isChestTier(c.tier) ? c.tier : 'bronze';
            tile.container.zIndex = 95;
            tile.setChest(CHEST_TIER_COLOR[tier], true, tier);
          }

          const b = world.getLocalBounds();
          world.position.set(
            app.screen.width / 2 - (b.x + b.width / 2),
            app.screen.height / 2 - (b.y + b.height / 2),
          );

          return () => { for (const t of tiles.values()) t.destroy(); };
        }}
      />
      <p style={{ font: '12px ui-monospace, monospace', color: '#8aa', padding: '8px 16px' }}>
        seed <b>{seed}</b> — {snapshot.chests.length} chest(s):{' '}
        {snapshot.chests.map((c) => c.tier).join(', ') || 'none'}
      </p>
    </div>
  );
}

/** What each word promises, in plain text. */
export const WhatTheyHold: StoryObj = { render: () => <Promises /> };

/**
 * A real island's chests, placed by the seed and delivered through the same
 * snapshot the client receives. Change the seed to deal a different board.
 */
export const OnARealIsland: StoryObj<{ seed: string }> = {
  args: { seed: 'chest-wire' },
  argTypes: { seed: { control: 'text' } },
  render: ({ seed }) => <FromSnapshot seed={seed} />,
};
