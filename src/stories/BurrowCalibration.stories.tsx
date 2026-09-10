/**
 * Does the burrow's BOARD land on the ground the art draws?
 *
 * The layout is written as a picture (see burrowConfig's LAYOUT) and calibrated
 * against the backdrop BY EYE — the field's tiles have to sit on the fenced
 * patch, the entrance on the stone path. Nothing enforces that: the numbers are
 * `BURROW_ORIGIN_X/Y` and `BURROW_ZOOM`, and if the art is redrawn they go on
 * pointing confidently at the wrong grass. The game still runs. It just stops
 * meaning what it says.
 *
 * That is exactly what a new backdrop did: the hand-drawn `burrow.webp` frames the homestead
 * about 1.3x larger than `burrow_generated.webp`, which walks the whole board
 * off its landmarks — every one of the nine FIELD cells lands on grass instead
 * of on the carrot patch, so the raid's win condition is somewhere the art does
 * not draw a field. Prose in a commit message does not make that visible; this
 * does.
 *
 * So the story is a measuring instrument, not a picture: it draws the board's
 * cells over either backdrop, colour-coded by what the cell CLAIMS to be, plus
 * the canvas edge. A cell whose colour disagrees with the pixels under it is
 * the bug, and you can see it without playing a round.
 */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import {
  BURROW_COLS, BURROW_ROWS, BURROW_HALF_W, BURROW_HALF_H,
  BURROW_ORIGIN_X, BURROW_ORIGIN_Y, BURROW_ZOOM,
  burrowCell, type BurrowCell,
} from '@/config/burrowConfig';
import { GAME_W, GAME_H } from '@/game/Application';

/**
 * Every backdrop that exists.
 *
 * The four `level_*` entries are the ones the game ships — one per burrow
 * level, picked by config/burrowArt. They are the same painting redrawn with a
 * bigger enclosure each time, and the artist drew the tilled field at a
 * different size in each, so tools/align_burrow_levels.py rescales them onto
 * level 1's field. That is precisely what this story is for: switch between
 * the four and the orange FIELD cells must stay on the dirt in all of them. If
 * one level's cells wander onto its fence or its castle wall, the alignment
 * step was missed for that file.
 */
const ART = {
  level_1: '/assets/island/burrow.webp',
  level_2: '/assets/island/burrow_lvl2.webp',
  level_3: '/assets/island/burrow_lvl3.webp',
  level_4: '/assets/island/burrow_lvl4.webp',
  generated: '/assets/island/burrow_generated.webp',
} as const;

/** What each kind of cell claims about the ground beneath it. */
const INK: Record<Exclude<BurrowCell, 'blocked'>, string> = {
  ground: '#ffffff',
  field: '#ff8c00',
  entrance: '#1e90ff',
};

interface Args {
  /** Which backdrop to measure the board against. */
  art: keyof typeof ART;
  /** Overrides for the two numbers that do the calibrating. */
  originX: number;
  originY: number;
  zoom: number;
  /** Draw the canvas edge, so an off-screen cell is obvious as off-screen. */
  showViewport: boolean;
}

/**
 * Draw the board over the art, in the ART's OWN pixel space.
 *
 * The scene does the reverse (it scales the art up to cover a fixed canvas),
 * but for judging alignment the art's own resolution is the honest frame: it
 * is what the pixels were drawn at, so nothing is resampled before you look at
 * it, and the viewport becomes a rectangle ON the art rather than the edge of
 * the window.
 */
function Calibration({ art, originX, originY, zoom, showViewport }: Args) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancelled = false;

    const img = new Image();
    img.src = ART[art];
    void img.decode().then(() => {
      if (cancelled) return;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      canvas.width = iw;
      canvas.height = ih;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);

      // The scene's transform, inverted. It covers the canvas with the art and
      // then zooms past it, so a canvas point maps back onto the art like this.
      const cover = Math.max(GAME_W / iw, GAME_H / ih);
      const w = iw * cover * zoom;
      const h = ih * cover * zoom;
      const left = GAME_W / 2 - w / 2;
      const top = GAME_H / 2 - h / 2;
      const toArt = (cx: number, cy: number) => ({
        x: (cx - left) * (iw / w),
        y: (cy - top) * (ih / h),
      });

      for (let i = 0; i < BURROW_COLS * BURROW_ROWS; i++) {
        const cell = burrowCell(i);
        if (cell === 'blocked') continue;
        const col = i % BURROW_COLS;
        const row = Math.floor(i / BURROW_COLS);
        const { x, y } = toArt(
          originX + (col - row) * BURROW_HALF_W,
          originY + (col + row) * BURROW_HALF_H,
        );
        // Ground is a small dot, the two MEANINGFUL cells are big: those are
        // the ones with a landmark to agree with, so they are what you check.
        const r = cell === 'ground' ? 3 : 7;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = INK[cell];
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000';
        ctx.stroke();
      }

      if (showViewport) {
        const a = toArt(0, 0);
        const b = toArt(GAME_W, GAME_H);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ff0000';
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      }
    });

    return () => { cancelled = true; };
  }, [art, originX, originY, zoom, showViewport]);

  return (
    <div>
      <canvas ref={ref} style={{ width: '100%', imageRendering: 'pixelated' }} />
      <p style={{ color: '#8b949e', font: '12px ui-monospace, monospace', marginTop: 8 }}>
        <span style={{ color: INK.field }}>&#9679;</span> field &middot;{' '}
        <span style={{ color: INK.entrance }}>&#9679;</span> entrance &middot;{' '}
        <span style={{ color: INK.ground }}>&#9679;</span> ground &middot;{' '}
        <span style={{ color: '#ff0000' }}>&#9646;</span> what the canvas shows
      </p>
    </div>
  );
}

const meta: Meta<Args> = {
  title: 'Burrow/Calibration',
  render: (args) => <Calibration {...args} />,
  args: {
    art: 'level_1',
    originX: BURROW_ORIGIN_X,
    originY: BURROW_ORIGIN_Y,
    zoom: BURROW_ZOOM,
    showViewport: true,
  },
  argTypes: {
    art: { control: 'inline-radio', options: Object.keys(ART) },
    originX: { control: { type: 'range', min: 300, max: 700, step: 1 } },
    originY: { control: { type: 'range', min: 150, max: 500, step: 1 } },
    zoom: { control: { type: 'range', min: 0.8, max: 2, step: 0.005 } },
  },
};
export default meta;

type Story = StoryObj<Args>;

/**
 * The shipping art with the shipping numbers — calibrated.
 *
 * Orange on the tilled soil, blue on the stone path, everything inside the red
 * rectangle. That is what "calibrated" means here, and anything else on this
 * story is a regression. `test/burrow-calibration.test.ts` asserts the same
 * three facts, so this is the picture and that is the alarm.
 */
export const Current: Story = {};

/**
 * The previous art, for comparison — a smaller painting of the same homestead.
 *
 * The numbers no longer suit it, which is the point: they are solved against
 * ONE image. Swapping the backdrop without re-solving them is what put the
 * whole board on a lawn last time, silently.
 */
export const PreviousArt: Story = { args: { art: 'generated' } };

/**
 * The upgrade art, at the same numbers.
 *
 * A burrow is re-painted as it is levelled — wooden rails, iron railings, a
 * castle wall — and each of those is a separate painting. They share ONE
 * calibration only because tools/align_burrow_levels.py rescaled each of them
 * onto level 1's field first. Step through these three and the orange cells
 * must stay on the soil exactly as they do on Current; if a level's field has
 * drifted onto its fence, that file was shipped without the alignment step.
 */
export const Level2: Story = { args: { art: 'level_2' } };
export const Level3: Story = { args: { art: 'level_3' } };
export const Level4: Story = { args: { art: 'level_4' } };

/**
 * What the old numbers did to the current art — the bug this story was built to
 * catch, kept as a fixture.
 *
 * Every orange cell sits ABOVE the fence, on grass and mushrooms. Nothing
 * crashes and nothing looks obviously broken; the raid simply has its win
 * condition somewhere the art draws no field. Only the dots show it.
 */
export const OldNumbersOnCurrentArt: Story = {
  args: { originX: 455, originY: 235, zoom: 1.45 },
};
