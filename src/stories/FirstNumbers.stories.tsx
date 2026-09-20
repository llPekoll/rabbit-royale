/**
 * PHASE 1 — WHAT A NUMBER MEANS.
 *
 * The first of the two lessons the first island has to teach. Phase 2 is the
 * red X (`FirstFlag.stories`), and it is built on this one: "mark the bomb"
 * means nothing to a player who cannot read the clue that proves where it is.
 *
 * ## Why this is a phase of its own
 *
 * The shipped tutorial says "The number counts the bombs touching that tile"
 * once, on the second dig, as a line that fades after four and a half seconds
 * — and then the next caption asks the player to bet energy on having
 * understood it. Paul, 2026-09-20, judging the X lesson: "il faudrait juste
 * expliquer les chiffres avant et on est bon."
 *
 * A number is not a mode, so it does not need to be provoked the way the X
 * does. It needs the one thing a fading line cannot give: the eight cells it
 * counts over, LIT, while the sentence is on screen. That is the whole idea
 * under test here.
 *
 * ## What is real and what is staged
 *
 * Real: `Tile` (its hint, its highlight, its reveal), the grid, the island
 * art, HINT_TINTS. Staged: the server, and the board — dealt by hand in
 * `first-lesson/board.ts` so the teaching shape is pinned and both phases
 * stand on the same ground.
 */
import { useCallback, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Container, Graphics } from 'pixi.js';
import { PixiStage } from './PixiStage';
import { HINT_TINTS } from '@/game/entities/Tile';
import { outlinedPixelText } from '@/game/ui/PixelText';
import { loadAllAssets } from '@/game/services/AssetLoader';
import { tilePos } from '@/config/gridConfig';
import { ENERGY } from '@config/tuning';
import { CLUE, CLUE_RING, STAGE } from './first-lesson/board';
import { buildLessonBoard, hintLayerOf } from './first-lesson/stage';
import { LessonCaption, LessonFrame, LessonReadout } from './first-lesson/chrome';

/**
 * The phase's two beats.
 *
 * `read` is the lesson; `done` is the board afterwards, so the story can be
 * left running without the explanation stuck on screen forever.
 */
type Beat = 'read' | 'done';

interface Args {
  /** Draw the island art under the board. Off to judge contrast alone. */
  background: boolean;
  /**
   * Light the eight cells the number counts over, while it is explained.
   *
   * THE IDEA UNDER TEST. Off, the lesson is the shipped one: a sentence about
   * a glyph, with nothing on the board to tie it to. On, "one bomb hides in
   * the 8 tiles around it" has a visible "it" — eight cells the player can
   * literally count.
   */
  showRing: boolean;
  /**
   * Draw the hint at double size on a dark plate.
   *
   * NOT A PROPOSED FIX — a control. `Tile.addHint` multiplies the number into
   * the ground with a near-white outline, so on the first island's bright
   * meadow the glyph this whole phase points at is very quiet (measured at
   * this zoom: 41x22px, blend `multiply`). Flip it to answer the only
   * question that blocks the tutorial: is the shipped number readable enough
   * to build a lesson on? If it is not, the fix belongs in `Tile.addHint`, on
   * every island — not here.
   */
  loudHint: boolean;
  /** What the clue reads. 1 is the taught board; higher values check the tints. */
  clueNumber: number;
}

function Scene({ background, showRing, loudHint, clueNumber }: Args) {
  const [beat, setBeat] = useState<Beat>('read');
  const read = useCallback(() => setBeat('done'), []);

  return (
    <LessonFrame>
      <PixiStage
        width={STAGE.width}
        height={STAGE.height}
        background="#1eaac4"
        prepare={() => loadAllAssets()}
        setup={(stage, app) => {
          const scene = buildLessonBoard(stage, app, { background, hintOnClue: clueNumber });

          /**
           * A LOUDER COPY OF THE HINT, over the shipped one.
           *
           * See `loudHint` above: this exists to be compared against, not to
           * ship. The plate is deliberately plain — it is an instrument, and
           * dressing it up would invite judging the plate instead of the
           * legibility question it asks.
           */
          if (loudHint) {
            const layer = hintLayerOf(scene.board);
            if (layer) {
              const g = new Container();
              const plate = new Graphics()
                .roundRect(-15, -11, 30, 22, 4)
                .fill({ color: 0x0d1117, alpha: 0.72 });
              const face = outlinedPixelText(0, 0, String(clueNumber));
              face.face.tint = HINT_TINTS[Math.min(clueNumber, HINT_TINTS.length - 1)];
              face.group.scale.set(1.15);
              g.addChild(plate, face.group);
              const pos = tilePos(CLUE);
              g.position.set(pos.x, pos.y);
              g.zIndex = 2_000_000;
              layer.addChild(g);
            }
          }

          /**
           * THE EIGHT CELLS, lit in GOLD.
           *
           * Gold and not red on purpose: nothing here is a bet yet. Red is the
           * X's colour — every red tile in this game means "this could cost
           * you" — and spending it on a lesson where nothing can be lost would
           * make the X's own red mean less when phase 2 arrives.
           */
          const lit = (on: boolean) => {
            if (!showRing) return;
            for (const index of CLUE_RING) scene.tiles.get(index)?.setHighlight(on, false);
          };
          lit(true);

          // The lesson is READ, not answered: any tap acknowledges it. Nothing
          // is dug and nothing is spent — a player tapping around while they
          // read cannot blow themselves up on the tile phase 2 is about.
          for (const [, tile] of scene.tiles) {
            tile.onPress(() => { lit(false); readRef.current(); });
          }

          return () => scene.destroy();
        }}
      />

      <LessonCaption
        text={beat === 'read'
          ? `This ${clueNumber} means: ${clueNumber === 1 ? 'one bomb hides' : `${clueNumber} bombs hide`} in the 8 tiles around it. Tap to go on.`
          : 'Every dug tile counts the bombs it touches. That is the whole game.'}
      />

      <LessonReadout energy={ENERGY.START} carrots={0} beat={beat} />
      <Bridge read={read} />
    </LessonFrame>
  );
}

/**
 * The Pixi scene is built ONCE, so its tap handler would close over the first
 * render's callback forever. This ref is what it reads instead.
 */
const readRef = { current: (() => {}) as () => void };

function Bridge({ read }: { read: () => void }) {
  readRef.current = read;
  return null;
}

const meta: Meta<Args> = {
  title: 'First run/1 Numbers',
  render: (args) => <Scene key={JSON.stringify(args)} {...args} />,
  parameters: { layout: 'fullscreen' },
  args: {
    background: true,
    showRing: true,
    loudHint: false,
    clueNumber: 1,
  },
  argTypes: {
    clueNumber: { control: { type: 'range', min: 1, max: 8, step: 1 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * THE PROPOSAL. The clue is explained with the eight cells it counts over lit
 * underneath it.
 *
 * What to judge:
 *  · Can you find the "1" on the tile at all? (That is the blocker — see
 *    `QuietNumber` below.)
 *  · Do the eight gold cells read as "these are what it counts", or just as
 *    "these are clickable"?
 *  · Is one sentence enough, or does the phase need a second beat?
 */
export const Taught: Story = {};

/**
 * THE SHIPPED LESSON: the sentence alone, nothing lit.
 *
 * This is what a player gets today — one line that fades after 4.5 seconds,
 * naming a glyph with nothing to point at. The baseline the proposal has to
 * beat.
 */
export const Shipped: Story = { args: { showRing: false } };

/**
 * THE BLOCKER, made visible: the shipped hint beside a legible one.
 *
 * Flip `loudHint` off and on. The number is the one thing this entire phase —
 * and all of phase 2 — is built on, and `Tile.addHint` multiplies it into the
 * grass with a near-white ring.
 *
 * If the shipped glyph does not read here, no tutorial copy will save it, and
 * the fix is in `Tile.addHint` on every island rather than in either story.
 */
export const QuietNumber: Story = { args: { loudHint: false } };

/** The same board with the loud copy drawn over it — the comparison. */
export const LoudNumber: Story = { args: { loudHint: true } };

/**
 * A "3" instead of a "1", for the colour ladder.
 *
 * HINT_TINTS keeps minesweeper's classic mapping, and the GDD's reason is that
 * a player reads "3 = danger" from the COLOUR before the glyph. Drag
 * `clueNumber` through the range to check that the tints still separate at the
 * tutorial's zoom — and that the lesson's sentence still parses in the plural.
 */
export const HigherCount: Story = { args: { clueNumber: 3 } };
