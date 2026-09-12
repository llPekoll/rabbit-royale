/**
 * Which tile a click actually lands on, on terraced ground.
 *
 * Written after a bomb refused to go where it was aimed. Two faults, and the
 * screenshot could only show the second one:
 *
 * 1. Every placement hint is its OWN click target — a Sprite at a fixed
 *    position, hit-tested by Pixi. A sprite's hit area is its BOUNDING BOX,
 *    not the diamond drawn inside it, so each cell claims a rectangle that
 *    overlaps its four diagonal neighbours. Which one answers a click in the
 *    overlap is decided by z-order, not by where the pointer is.
 *
 * 2. On raised ground it gets worse rather than merely imprecise. A shelf tile
 *    is lifted BURROW_TIER_LIFT (18px) up the screen while a tile is only
 *    ~19px tall, so a lifted diamond sits almost exactly on top of the one
 *    behind it. Tap the grass at the foot of a shelf and the shelf takes it.
 *
 * `burrowTileAt` was written to solve exactly this — it tries the tiers from
 * the top down and answers with the one the eye would pick. It was never
 * wired to anything: the scene hit-tests sprites, so the function sat unused
 * and the bug stayed.
 *
 * ## Why this story rather than a unit test
 *
 * There IS a unit test's worth of truth here (`burrowTileAt` against known
 * coordinates), and it belongs in a test. What a test cannot do is tell you
 * that the answer matches what the player was LOOKING at — the whole failure
 * is a disagreement between the picture and the arithmetic, and you need both
 * on screen at once to see it. So this story draws, for every click:
 *
 *   - where you clicked (a crosshair)
 *   - the tile Pixi's sprite hit-testing would give you (red)
 *   - the tile `burrowTileAt` gives you (green)
 *
 * When they disagree, the two outlines sit on different cells and the disagree
 * count goes up. The fix is done when clicking anywhere — especially along a
 * cliff — leaves them on the same cell.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Graphics, Sprite } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { initTileTextures, getDiamondOutline, diamondScaleFor } from '@/game/services/TileTextures';
import {
  BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H, BURROW_TIER_LIFT,
  setBurrowTileSize, setBurrowTierLift,
} from '@/config/burrowConfig';
import { burrowCell, burrowTier, isTrappable } from '@/game/burrow/board';
import { burrowTileScreen, burrowDepth, burrowTileAt } from '@/game/burrow/screen';
import { createBurrowTerrain, type BurrowTerrainView } from '@/game/burrow/BurrowTerrain';
import { GAME_W, GAME_H } from '@/game/Application';

interface Args {
  /** Whose burrow. The terraces come from the seed, so this is the knob that
   *  changes how much raised ground there is to get wrong. */
  seed: string;
  /** Draw the terrain under the grid, or leave the grid on its own.
   *
   *  Off is the honest view of the geometry — with the art on, a diamond that
   *  sits one tier too low still looks plausible, which is exactly how this
   *  shipped. */
  terrain: boolean;
  /** Tint each cell by its tier, so the shelves are unmistakable. */
  showTiers: boolean;
  /** The cell size the burrow is drawn at. */
  tile: number;
  /**
   * How far one tier lifts a tile, in board pixels.
   *
   * THE knob for the overlap. The shipped 18 is the island's `TIER_LIFT`
   * verbatim, against a tile 24px tall — so a shelf rises only three quarters
   * of a tile and does not clear the one behind it, which is the overlap you
   * see along every cliff. The isometric workbench (`iso.ts` ISO_TILE) uses
   * z = h exactly.
   *
   * Whatever is found here has to go into `gridConfig.TIER_LIFT` as well: the
   * two boards share their cliff art, and a lift they disagreed on would give
   * the same sprite a gap on one screen and an overhang on the other.
   */
  lift: number;
  /**
   * How far in to zoom on the board.
   *
   * The whole 19x19 homestead at 1x is about 40px per cell on a laptop panel,
   * which is too small to see a 3px overlap — and 3px is the entire fault. The
   * default frames a corner rather than the board: judging a seam needs pixels,
   * not context.
   */
  zoom: number;
}

/** One diamond sprite, sized for this board — the same helper the scene uses. */
function diamond(): Sprite {
  const s = new Sprite(getDiamondOutline());
  s.anchor.set(0.5);
  const k = diamondScaleFor(BURROW_HALF_W, BURROW_HALF_H);
  s.scale.set(k.x, k.y);
  return s;
}

/**
 * A cell on raised ground, with raised neighbours — the middle of a shelf
 * rather than its edge, so the frame holds several lifted diamonds at once and
 * the overlap between them is what you are looking at.
 */
function raisedCell(seed: string): number {
  let fallback = 0;
  for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
    if (burrowCell(seed, i) === 'blocked') continue;
    if (burrowTier(seed, i) <= 1) continue;
    if (!fallback) fallback = i;
    // A cell whose neighbour BELOW is lower is a lip: that is where a lifted
    // diamond meets an unlifted one, which is the seam worth framing.
    const below = i + BURROW_COLS;
    if (burrowTier(seed, below) > 0 && burrowTier(seed, below) < burrowTier(seed, i)) return i;
  }
  return fallback;
}

/** Per-tier tint, so a shelf is legible without reading numbers. */
const TIER_TINT = [0x6f8fb0, 0x7fd6a0, 0xffd45c, 0xff9d5c, 0xff6b6b];

export default {
  title: 'Burrow/Picking',
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Click anywhere on the board. RED is the tile Pixi\'s sprite hit-testing '
          + 'answers with; GREEN is the tile `burrowTileAt` answers with. They must '
          + 'agree, and along a cliff edge they currently do not.',
      },
    },
  },
  args: { seed: 'player-1', terrain: true, showTiers: false, tile: 44, lift: 18, zoom: 3 },
  argTypes: {
    seed: {
      control: 'select',
      options: ['player-1', 'player-2', 'player-3', 'guest:3f2a1c9e-5b4d-4e6f-8a7b-2c1d0e9f8a7b'],
    },
    tile: { control: { type: 'range', min: 20, max: 56, step: 2 } },
    lift: { control: { type: 'range', min: 8, max: 40, step: 1 } },
    zoom: { control: { type: 'range', min: 1, max: 6, step: 0.25 } },
  },
} satisfies Meta<Args>;

type Story = StoryObj<Args>;

export const Picking: Story = {
  render: (args) => <PickingBoard {...args} />,
};

function PickingBoard({ seed, terrain, showTiers, tile, lift, zoom }: Args) {
  /** What the last click resolved to, both ways round. */
  const [hit, setHit] = useState<{ sprite: number | null; geometry: number | null } | null>(null);
  /** How many clicks so far, and how many the two methods disagreed on. */
  const [tally, setTally] = useState({ clicks: 0, disagree: 0 });

  // Read inside the Pixi callbacks, which outlive a render.
  const setHitRef = useRef(setHit);
  const setTallyRef = useRef(setTally);
  setHitRef.current = setHit;
  setTallyRef.current = setTally;

  const record = useCallback((sprite: number | null, geometry: number | null) => {
    setHitRef.current({ sprite, geometry });
    setTallyRef.current((t) => ({
      clicks: t.clicks + 1,
      disagree: t.disagree + (sprite === geometry ? 0 : 1),
    }));
  }, []);

  const reset = () => { setTally({ clicks: 0, disagree: 0 }); setHit(null); };
  // A new board is a new experiment: a disagree count carried over from the
  // previous seed says nothing about this one.
  useEffect(reset, [seed, tile, lift, zoom]);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <PixiStage
        key={`${seed}:${terrain}:${showTiers}:${tile}:${lift}:${zoom}`}
        width={GAME_W}
        height={GAME_H}
        background="#0d1b12"
        prepare={loadAllAssets}
        setup={(stage, app) => {
          setBurrowTileSize(tile);
          // Before anything reads a position: every tile, every marker and the
          // terrain itself are placed against this.
          setBurrowTierLift(lift);
          initTileTextures(app.renderer);

          const board = new Container();
          board.sortableChildren = true;
          stage.addChild(board);

          // Frame a SHELF rather than the whole homestead. The fault is a few
          // pixels of one diamond lapping over another, and at board scale a
          // cell is ~40px on a laptop panel — the overlap is smaller than the
          // outline that draws it. So: find raised ground, centre it, zoom.
          const focus = raisedCell(seed);
          const f = burrowTileScreen(seed, focus);
          board.scale.set(zoom);
          board.position.set(GAME_W / 2 - f.x * zoom, GAME_H / 2 - f.y * zoom);

          let ground: BurrowTerrainView | null = null;
          if (terrain) {
            void createBurrowTerrain(board, seed, null).then((t) => { ground = t; });
          }

          // The grid, built exactly as BurrowScene builds it — one sprite per
          // cell, each its own click target. Reproducing the scene's shape is
          // the point: a story that hit-tested differently would prove nothing
          // about the bug.
          const hints: Sprite[] = [];
          const tileOfHint: number[] = [];
          for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
            if (burrowCell(seed, i) === 'blocked') continue;
            const { x, y } = burrowTileScreen(seed, i);
            const hint = diamond();
            hint.position.set(x, y);
            hint.zIndex = burrowDepth(seed, i);
            hint.tint = showTiers
              ? TIER_TINT[Math.min(burrowTier(seed, i), TIER_TINT.length) - 1] ?? 0xffffff
              : 0x8fd6ff;
            hint.alpha = isTrappable(seed, i) ? 0.42 : 0.12;
            hint.eventMode = 'static';
            hint.on('pointertap', () => { lastSprite = i; });
            board.addChild(hint);
            hints.push(hint);
            tileOfHint.push(i);
          }

          // Which tile the SPRITE hit-testing claimed, filled by the handler
          // above just before the stage-level one runs. Pixi bubbles, so the
          // sprite always answers first — which is exactly the mechanism that
          // decides the placement in the real scene.
          let lastSprite: number | null = null;

          // The markers: where the pointer went, and the two answers.
          const cross = new Graphics();
          cross.zIndex = 10_000;
          board.addChild(cross);

          const spriteMark = diamond();
          spriteMark.tint = 0xff4d4d;
          spriteMark.alpha = 0;
          spriteMark.zIndex = 10_001;
          board.addChild(spriteMark);

          const geomMark = diamond();
          geomMark.tint = 0x4dff88;
          geomMark.alpha = 0;
          geomMark.zIndex = 10_002;
          board.addChild(geomMark);

          // The stage takes every click, including the ones that land on no
          // sprite at all — "nothing answered" is a real outcome and has to be
          // visible rather than silently dropped.
          stage.eventMode = 'static';
          stage.hitArea = app.screen;
          stage.on('pointertap', (e) => {
            const p = board.toLocal(e.global);
            const geometry = burrowTileAt(seed, p.x, p.y);

            cross.clear()
              .moveTo(p.x - 7, p.y).lineTo(p.x + 7, p.y)
              .moveTo(p.x, p.y - 7).lineTo(p.x, p.y + 7)
              .stroke({ color: 0xffffff, width: 1 });

            if (lastSprite !== null) {
              const s = burrowTileScreen(seed, lastSprite);
              spriteMark.position.set(s.x, s.y);
              spriteMark.alpha = 0.85;
            } else spriteMark.alpha = 0;

            if (geometry !== null) {
              const g = burrowTileScreen(seed, geometry);
              geomMark.position.set(g.x, g.y);
              geomMark.alpha = 0.85;
            } else geomMark.alpha = 0;

            record(lastSprite, geometry);
            lastSprite = null;
          });

          return () => { ground?.destroy(); };
        }}
      />

      <Report seed={seed} hit={hit} tally={tally} onReset={reset} lift={lift} tileW={tile} />
    </div>
  );
}

/**
 * The numbers, beside the picture.
 *
 * The disagreement is the measurement this story exists for: "it feels off" is
 * not something you can fix against, and two tiles that differ by one row look
 * almost identical on a busy pixel-art board.
 */
function Report({
  seed, hit, tally, onReset, lift, tileW,
}: {
  seed: string;
  hit: { sprite: number | null; geometry: number | null } | null;
  tally: { clicks: number; disagree: number };
  onReset(): void;
  lift: number;
  tileW: number;
}) {
  const name = (t: number | null) =>
    t === null ? 'nothing' : `#${t} (tier ${burrowTier(seed, t)}, ${burrowCell(seed, t)})`;
  const agrees = hit && hit.sprite === hit.geometry;

  return (
    <div style={{
      font: '12px ui-monospace, monospace', color: '#cfe6d8',
      background: '#0d1b12', border: '1px solid #1f3a29', borderRadius: 6, padding: 10,
      display: 'grid', gap: 6, minWidth: 420,
    }}>
      <div style={{ color: '#8fa89a' }}>
        Click the board. Aim at the grass right under a cliff — that is where they part ways.
      </div>
      <div>
        <span style={{ color: '#ff4d4d' }}>sprite hit-test</span>{'  '}{hit ? name(hit.sprite) : '—'}
      </div>
      <div>
        <span style={{ color: '#4dff88' }}>burrowTileAt  </span>{'  '}{hit ? name(hit.geometry) : '—'}
      </div>
      <div style={{ color: agrees === null ? '#8fa89a' : agrees ? '#4dff88' : '#ff4d4d' }}>
        {hit === null ? 'no click yet' : agrees ? 'agree' : 'DISAGREE — the click lands on the wrong tile'}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ color: tally.disagree ? '#ff4d4d' : '#4dff88' }}>
          {tally.disagree}/{tally.clicks} clicks disagreed
        </span>
        <button onClick={onReset} style={{ font: 'inherit' }}>reset</button>
        <Overlap lift={lift} tileW={tileW} />
      </div>
    </div>
  );
}

/**
 * The overlap, as a ratio rather than as a feeling.
 *
 * A tier has to lift a tile by its own HEIGHT to clear the one behind it —
 * that is what the isometric workbench does (`iso.ts`: w 64, h 32, z 32). The
 * burrow ships 18 against a 24px tile, a ratio of 0.75, so every shelf sits a
 * quarter of a tile too low and laps over its neighbour. That is the overlap
 * along the cliffs, and it is invisible in a still because a diamond drawn
 * slightly too low still looks like a diamond.
 */
function Overlap({ lift, tileW }: { lift: number; tileW: number }) {
  // Computed from the ARGS, not read from the config module. The setter runs
  // inside the Pixi setup, which happens after React renders this line — read
  // from the module, the readout is always one change behind and says 18 while
  // the picture shows 24. A number that lies is worse than no number.
  const h = tileW * 24 / 44;
  const ratio = lift / h;
  const clean = Math.abs(ratio - 1) < 0.02;
  return (
    <span style={{ color: clean ? '#4dff88' : '#ffd45c' }}>
      lift {lift}px / tile {h.toFixed(1)}px = {ratio.toFixed(2)}
      {clean ? ' (a shelf clears the tile behind it)' : ` — ${((1 - ratio) * 100).toFixed(0)}% overlap`}
    </span>
  );
}
