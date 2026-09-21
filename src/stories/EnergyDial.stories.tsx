/**
 * THE ENERGY DIAL — the DIG board's ring, draining like a fuel gauge.
 *
 * WHAT TO JUDGE HERE, in the order it matters:
 *
 *  1. DOES IT READ AS A GAUGE AT A GLANCE? `Steps` lays the whole range out
 *     at once. A ring that has to be compared to a neighbour to be understood
 *     has failed; each one should say "about half" on its own.
 *  2. IS THE SWEEP ANCHORED AT 12 O'CLOCK? The art puts a gold stud there and
 *     it is the full mark. The colour should leave from it, anticlockwise —
 *     a car's needle falling back, not a progress ring filling up.
 *  3. THE TWO ENDS, which are the ones a player actually sees and the ones a
 *     masked gauge gets wrong: FULL must show no seam at 12, and EMPTY must
 *     show NO colour at all (a `conic-gradient` from 0 can paint its first
 *     stop across the whole sweep, which flashes a full ring at zero).
 *  4. THE GREY RING UNDER IT. What drains is the colour; the grey ring is
 *     always there, so the dial never looks broken — only low.
 *
 * `Live` is the one to actually watch: it drains in real time, which is the
 * only way to catch a sweep that jumps or runs backwards.
 *
 * THE NUMBERS ARE THE GAME'S. `OUT_OF_RUN_ENERGY.MAX` is 300 — the one tank
 * the medallion shows — and a crossing asks for `ENERGY.MIN_TO_CROSS` (40).
 */
import { useEffect, useState, type CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { EnergyDial, dialInset, plankRows, DIAL_SIZE } from '@/components/energy-dial';
import { ENERGY, OUT_OF_RUN_ENERGY } from '@config/tuning';
import '@/app/globals.css';

/* Widened from the config's literal type: this is a live reading that counts
   down, not the constant itself. */
const MAX: number = OUT_OF_RUN_ENERGY.MAX;

const meta: Meta = {
  title: 'Chrome/EnergyDial',
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  decorators: [(Story) => <div style={sky}><Story /></div>],
};
export default meta;

const sky: CSSProperties = {
  minHeight: '100vh',
  padding: 28,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 18,
  background: 'linear-gradient(180deg, #2a7d9e 0%, #3f9ab4 55%, #6fbf8f 100%)',
};

const label: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 10,
  color: '#eaf6ff',
  textShadow: '0 1px 0 #0b3b52',
  letterSpacing: '0.06em',
};

/**
 * The board's text end — DIG's own two lines, clear of the dial.
 *
 * Centred on the PLANK, not on the art's box: the dial is taller than the
 * board, so the box's middle is ~7px above the wood's (see `plankRows`).
 */
function Face({ height, value }: { height: number; value: number }) {
  const rows = plankRows(height);
  return (
    <span style={{
      position: 'absolute',
      /* The dial's room, measured by the component rather than typed here. */
      left: dialInset(height),
      right: Math.round(height * 0.12),
      top: rows.top,
      bottom: rows.bottom,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 3,
      fontFamily: 'var(--font-pixel), ui-monospace, monospace',
      color: '#fde7bd',
      textShadow: '0 2px 0 #3a2415',
      lineHeight: 1,
    }}>
      <span style={{ fontSize: height > 60 ? 15 : 12, letterSpacing: '0.08em' }}>DIG</span>
      <span style={{ fontSize: height > 60 ? 10 : 8, color: '#d8c3ab' }}>
        {value}/{MAX} energy · crossing costs {ENERGY.CROSSING_COST}
      </span>
    </span>
  );
}

/** The whole range at once — the reading has to work without a neighbour. */
export const Steps: StoryObj = {
  render: () => (
    <>
      <span style={label}>STEPS — full to empty, at the slab's own height</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {[60, 50, 40, 30, 20, 10, 0].map((v) => (
          <div key={v} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <EnergyDial value={v} max={MAX} height={80}>
              <Face height={80} value={v} />
            </EnergyDial>
            <span style={{ ...label, fontSize: 9 }}>{v}/{MAX}</span>
          </div>
        ))}
      </div>
    </>
  ),
};

/**
 * THE TWO ENDS, alone and large. These are the readings a masked gauge gets
 * wrong, and the ones a player sees most.
 */
export const Ends: StoryObj = {
  render: () => (
    <>
      <span style={label}>FULL — no seam at 12 o&apos;clock</span>
      <EnergyDial value={MAX} max={MAX} height={120}><Face height={120} value={MAX} /></EnergyDial>
      <span style={label}>EMPTY — no colour at all, and the grey ring still whole</span>
      <EnergyDial value={0} max={MAX} height={120}><Face height={120} value={0} /></EnergyDial>
      <span style={label}>ONE RUN LEFT — {ENERGY.MIN_TO_CROSS}/{MAX}</span>
      <EnergyDial value={ENERGY.MIN_TO_CROSS} max={MAX} height={120}>
        <Face height={120} value={ENERGY.MIN_TO_CROSS} />
      </EnergyDial>
    </>
  ),
};

/** Draining in real time: the only way to see a sweep jump or reverse. */
export const Live: StoryObj = {
  render: function Render() {
    const [v, setV] = useState(MAX);
    useEffect(() => {
      const id = setInterval(() => setV((x) => (x <= 0 ? MAX : x - 1)), 140);
      return () => clearInterval(id);
    }, []);
    return (
      <>
        <span style={label}>LIVE — drains to zero, then refills. Watch 12 o&apos;clock.</span>
        <EnergyDial value={v} max={MAX} height={120}><Face height={120} value={v} /></EnergyDial>
      </>
    );
  },
};

/**
 * THE SWEEP — a BOMB, not a dig, because only a jump shows the travel.
 *
 * The `Live` story above steps one point every 140ms, which the ring can only
 * draw as a crawl however it is animated. This one takes a bomb's worth at a
 * time: the ring should visibly TRAVEL to the new reading over about a third
 * of a second rather than cutting to it. That is the whole of what the sweep
 * buys (see `useSweep` in energy-dial.tsx — the mask cannot be transitioned in
 * CSS, so the number is tweened instead).
 *
 * Press the button rather than watching a timer: the thing being judged is one
 * transition, and an interval hides a stutter inside the next step.
 */
export const Sweep: StoryObj = {
  render: function Render() {
    const [v, setV] = useState(MAX);
    return (
      <>
        <span style={label}>
          SWEEP — one bomb per press. The ring should travel, not cut.
        </span>
        <EnergyDial value={v} max={MAX} height={120}><Face height={120} value={v} /></EnergyDial>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={() => setV((x) => Math.max(0, x - ENERGY.BOMB_LOSS))}>
            -1 bomb
          </button>
          <button type="button" onClick={() => setV((x) => Math.min(MAX, x + ENERGY.BOMB_LOSS))}>
            +1 bomb
          </button>
          <button type="button" onClick={() => setV(MAX)}>full</button>
          <button type="button" onClick={() => setV(0)}>empty</button>
        </div>
      </>
    );
  },
};

/**
 * THE SIZES — and the one thing this board does that the others do not.
 *
 * IT KEEPS ITS ASPECT. The scroll and the skull boards are 3-slices: their
 * ends are fixed and the middle stretches, so they take whatever width a slab
 * gives them. This one is a whole picture with a round dial in it — a circle
 * cannot be stretched without becoming an ellipse — so width FOLLOWS height,
 * at the art's own 2.6:1.
 *
 * That is fine at 80px (209px wide, room for two lines) and NOT fine at 48,
 * where the board is only 126px across and DIG's own line wraps to three and
 * runs off the plank. The Seeker case below is left in deliberately, showing
 * the failure rather than a tidied-up version of it: either the dial needs a
 * 3-slice plank of its own to the right of the circle, or DIG keeps the kit's
 * flat face on short screens. Not a decision to bury in a story.
 */
export const Sizes: StoryObj = {
  render: () => (
    <>
      <span style={label}>NATIVE — {DIAL_SIZE.width}x{DIAL_SIZE.height}</span>
      <EnergyDial value={40} max={MAX} height={DIAL_SIZE.height}>
        <Face height={DIAL_SIZE.height} value={40} />
      </EnergyDial>
      <span style={label}>DESKTOP SLAB — 80px tall, 209 wide. Fits.</span>
      <EnergyDial value={40} max={MAX} height={80}><Face height={80} value={40} /></EnergyDial>
      <span style={label}>SEEKER SLAB — 48px tall is only 126 wide: THE LINE OVERRUNS.</span>
      <EnergyDial value={40} max={MAX} height={48}><Face height={48} value={40} /></EnergyDial>
    </>
  ),
};
