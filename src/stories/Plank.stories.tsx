/**
 * THE WOOD PLANK — the chrome's new ground, before anything is moved onto it.
 *
 * WHAT TO JUDGE HERE, in the order it matters:
 *
 *  1. DO THE LEAVES SURVIVE THE STRETCH? The board is a nine-slice: the leafy
 *     caps are fixed and only the wood between them grows. `Widths` puts five
 *     sizes in a column so the caps can be compared to each other directly —
 *     if a leaf is fatter at 320px than at 180px, the slice is cut wrong.
 *  2. IS THE GRAIN STILL PIXEL ART? It is drawn at 2x. Any width is allowed
 *     (only the middle stretches), but the bark edge must stay a hard line —
 *     a soft or shimmering edge means something resampled it.
 *  3. DOES THE TEXT CLEAR THE BARK? The board's usable width is its box minus
 *     two 60px caps. `TooNarrow` is the failure on purpose: below ~150px the
 *     caps meet and there is no flat wood left to write on.
 *  4. AGAINST THE SKY, which is where it hangs. Brown on blue is the contrast
 *     that has to work; a grey canvas would flatter it.
 *
 * `AsCarrotPill` is the reason this exists — the real pill's content on the
 * new ground, beside the slab it replaces, so the swap can be judged rather
 * than imagined.
 */
import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plank, PLANK_SIZE, PLANK_CAP } from '@/components/plank';
import { CarrotPill } from '@/components/carrot-pill';
import { LocaleProvider } from '@/i18n/provider';
import { PxPanel } from '@/components/px';
import { CARROT_URL, CARROT_SIZE } from '@domin8/arcade-kit/game';
import { ENERGY } from '@config/tuning';
import '@/app/globals.css';

const meta: Meta = {
  title: 'Chrome/Plank',
  parameters: { layout: 'fullscreen', backgrounds: { disable: true } },
  decorators: [
    (Story) => (
      <div style={sky}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

/** The island's sky and water — the ground the chrome is actually read on. */
const sky: CSSProperties = {
  minHeight: '100vh',
  padding: 28,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 20,
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
 * The board's text. It CENTRES OVER THE WHOLE BOARD, caps included — the
 * plank is one object, and text centred only in the wood between the leaves
 * reads as pushed off-centre. The board's height is fixed, so the row is
 * centred vertically rather than padded.
 */
const boardText: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 14,
  color: '#fde7bd',
  /* The grain is busy and mid-brown; the figure needs a dark seat under it or
     it dissolves into the wood at small sizes. */
  textShadow: '0 2px 0 #2a180e',
  lineHeight: 1,
  textAlign: 'center',
  /* Out past the border box the slice reserves, so the text uses the board's
     full length rather than only the wood between the caps. */
  margin: `0 -${PLANK_CAP}px`,
};

/** Centres a row on the board, over its full length. */
const centre: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
};

/** The plank drawn at exactly the size it was painted, x2 — the reference. */
export const Native: StoryObj = {
  render: () => (
    <>
      <span style={label}>NATIVE — {PLANK_SIZE.width}x{PLANK_SIZE.height} at 2x</span>
      <Plank style={{ width: PLANK_SIZE.width * 2 }}>
        <div style={centre}><div style={boardText}>RABBIT ROYALE</div></div>
      </Plank>
    </>
  ),
};

/**
 * The same board at five widths. The caps must be identical in all five; only
 * the wood between them may change.
 */
export const Widths: StoryObj = {
  render: () => (
    <>
      <span style={label}>WIDTHS — the caps must not change size</span>
      {[160, 200, 260, 334, 480].map((w) => (
        <Plank key={w} style={{ width: w }}>
          <div style={centre}><div style={boardText}>{w}px</div></div>
        </Plank>
      ))}
    </>
  ),
};

/**
 * THE FAILURE, on purpose. Two 60px caps leave nothing to write on much below
 * 150px — the leaves overlap and the text sits on bark. This marks where the
 * board stops being usable, so a future panel is not designed under it.
 */
export const TooNarrow: StoryObj = {
  render: () => (
    <>
      <span style={label}>TOO NARROW — the caps meet, the wood runs out</span>
      {[150, 130, 110].map((w) => (
        <Plank key={w} style={{ width: w }}>
          <div style={centre}><div style={{ ...boardText, fontSize: 10 }}>{w}px</div></div>
        </Plank>
      ))}
    </>
  ),
};

function Carrot({ height }: { height: number }) {
  const width = Math.round((CARROT_SIZE.width / CARROT_SIZE.height) * height);
  return (
    <img className="rr-carrot-px" src={CARROT_URL} alt="" aria-hidden
      draggable={false} width={width} height={height} />
  );
}

/** The pill's row: the carrot, the figure, the gold rank chip. */
function PillRow() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ display: 'flex', transform: 'rotate(45deg)', width: 34, height: 34,
        alignItems: 'center', justifyContent: 'center', lineHeight: 0, flexShrink: 0 }} aria-hidden>
        <Carrot height={44} />
      </span>
      <span style={{ fontFamily: 'var(--font-pixel), ui-monospace, monospace', fontSize: 22,
        color: '#fde7bd', textShadow: '0 2px 0 #2a180e', lineHeight: 1 }}>153</span>
      <span style={{ padding: '2px 6px', fontFamily: 'var(--font-pixel), ui-monospace, monospace',
        background: '#ffd138', boxShadow: '0 0 0 1px #2a180e', color: '#2a180e',
        fontSize: 10, lineHeight: 1 }}>#27</span>
    </span>
  );
}

/**
 * THE SWAP, side by side: the slab the pill wears today, and the same content
 * on the board. This is the comparison the change has to win.
 */
export const AsCarrotPill: StoryObj = {
  render: () => (
    <>
      <span style={label}>TODAY — the dark slab</span>
      <PxPanel color="#3a2415" style={{ display: 'flex', alignItems: 'center', gap: 10,
        padding: '6px 10px', width: 200, boxSizing: 'border-box' }}>
        <PillRow />
      </PxPanel>

      <span style={{ ...label, marginTop: 16 }}>PROPOSED — the board</span>
      <Plank style={{ width: 240 }}>
        <div style={{ ...centre, margin: `0 -${PLANK_CAP}px` }}><PillRow /></div>
      </Plank>
    </>
  ),
};


/**
 * THE REAL PILL ON THE BOARD — the states a guest never reaches.
 *
 * The runtime check (tools/verify-plank.mjs) drives a fresh guest, and a
 * guest is UNRANKED: no chip, no caret, and the pill is not even a button, so
 * the climb row it unfolds has no coverage there at all. That row is also the
 * one thing the board's FIXED HEIGHT could break — the plank does not grow to
 * fit its contents, so a second line either sits on the wood or runs off it.
 *
 * `position: fixed` centres the real pill on the viewport, so these stand in
 * the middle of the frame rather than in the flow. That is the pill as it
 * ships; the story is not fighting it.
 */
export const RealPill: StoryObj = {
  parameters: { viewport: { defaultViewport: 'seeker' } },
  render: () => (
    <LocaleProvider>
      <span style={label}>THE SHIPPING PILL — ranked, with a climb to unfold</span>
      <CarrotPill stock={1263} fireKey={0} gain={0} rank={27} toPass={340} />
    </LocaleProvider>
  ),
};

/**
 * THE BOARD IN A RUN — the bank and the tank on one plank.
 *
 * This is the arrangement Paul asked for on 2026-09-20 ("la barre comme avant
 * mais dans la planche de bois avec les carottes car ya de la place"), and the
 * three things to judge are:
 *
 *  1. DOES THE WOOD COVER IT? The board grows by the bar's 200px and the caps
 *     do not move, so the leaves must be identical to `RealPill` above and the
 *     grain between them must stay a hard-edged stretch.
 *  2. DOES THE GROOVE READ AS CARVED? It separates two different readings — a
 *     pile that persists, a tank that empties — and it has to look cut into
 *     the board rather than drawn over it.
 *  3. IS THE BAR STILL THE BAR? Same bolt, same track, same notch at one
 *     bomb's worth, same outlined figure. Nothing about it changed but where
 *     it hangs.
 *
 * At three energies, because the bar's own colour ladder has to survive the
 * move onto wood: the amber and the red were picked against the sky, and the
 * plank is the first thing that has ever been BEHIND them.
 */
export const RealPillInRun: StoryObj = {
  parameters: { viewport: { defaultViewport: 'seeker' } },
  render: () => (
    <LocaleProvider>
      <span style={label}>IN A RUN — the carrots, the groove, the energy</span>
      {/* ONE pill, not a column of them: the real one is `position: fixed` and
          centres itself on the viewport, so three copies would stack on the
          same spot. The colour ladder is checked by dragging `energy` in the
          controls, and by the bar's own story. */}
      <CarrotPill
        stock={1263}
        fireKey={0}
        gain={0}
        rank={27}
        toPass={340}
        carrying={12}
        energy={ENERGY.BOMB_LOSS * 2}
        chests={{ taken: 0, total: 12, warnStage: 0 }}
      />
    </LocaleProvider>
  ),
};

/** A seven-figure pile beside a four-figure rank: the widest the row ever is. */
export const RealPillFull: StoryObj = {
  parameters: { viewport: { defaultViewport: 'seeker' } },
  render: () => (
    <LocaleProvider>
      <span style={label}>THE WIDEST ROW — the figure steps down, the board does not grow</span>
      <CarrotPill stock={1234567} fireKey={0} gain={0} rank={1234} toPass={12000} carrying={240} />
    </LocaleProvider>
  ),
};
