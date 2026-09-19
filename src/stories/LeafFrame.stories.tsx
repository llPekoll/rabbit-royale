/**
 * THE LEAF FRAME — a true 9-slice, judged before anything is moved onto it.
 *
 * WHAT TO JUDGE HERE, in the order it matters:
 *
 *  1. DO THE FOUR CORNERS STAY IDENTICAL AND WHOLE? This is the whole bet of a
 *     9-slice. `Shapes` puts a wide bar, a large panel and a tall column side
 *     by side — the reference's own three examples — so the corners can be
 *     compared across aspect ratios. A leaf that is fatter in the tall column
 *     than in the wide bar means a slice is cut wrong.
 *  2. ARE THE EDGES SEAMLESS? The bark between the corners stretches. Look
 *     along the middle of each long edge for a bright or dark band: that is
 *     the slice line showing, and it means the inset crossed into art that is
 *     not flat.
 *  3. IS THE CENTRE FILLED? The parchment must be the frame's own, not the
 *     page showing through. `OnBusyGround` puts it over a loud background —
 *     if the middle is a hole, that background shows in it.
 *  4. DOES IT SURVIVE SMALL? `TooSmall` is the failure on purpose: a 90px
 *     corner needs a 180x195 box, and under that the corners overlap.
 *     `Corners` is the honest fix — smaller leaves, not a squeezed box.
 *
 * `AgainstTheKit` is the reason this exists — the new frame beside the codex
 * panel it is meant to stand apart from, so "pas le design system actuel" can
 * be judged rather than imagined.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeafFrame, leafFrameMin, leafFramePadding } from '@/components/leaf-frame';
import { PxPanel } from '@/components/px';
import '@/app/globals.css';

const meta: Meta = {
  title: 'Chrome/LeafFrame',
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
type Story = StoryObj;

/** The island's sky and water — the ground the chrome is actually read on. */
const sky: CSSProperties = {
  minHeight: '100vh',
  padding: 28,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 22,
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
 * The parchment's text. Ink brown on cream — the frame supplies its own
 * ground, so unlike the plank this needs no dark seat under the figure.
 */
const ink: CSSProperties = {
  fontFamily: 'var(--font-pixel), ui-monospace, monospace',
  fontSize: 13,
  lineHeight: 1.6,
  color: '#4a3524',
  margin: 0,
};

function Note({ children }: { children: ReactNode }) {
  return <div style={label}>{children}</div>;
}

/**
 * THE THREE SHAPES FROM THE REFERENCE, from one asset. If the slice is right
 * these read as the same frame at three sizes; if it is wrong they read as
 * three different frames.
 */
export const Shapes: Story = {
  render: () => (
    <>
      <Note>HORIZONTAL BAR — 720x150</Note>
      <LeafFrame corner={62} style={{ width: 720, height: 150, padding: leafFramePadding(62) }}>
        <p style={ink}>The burrow is quiet. The neighbours are not.</p>
      </LeafFrame>

      <Note>LARGE PANEL — 560x300</Note>
      <LeafFrame corner={90} style={{ width: 560, height: 300, padding: leafFramePadding(90) }}>
        <p style={ink}>
          Dig, grow your burrow, raid the neighbours.
          <br />
          <br />
          Every chest you open pushes the island closer to the eruption. The last one ends it.
        </p>
      </LeafFrame>

      <Note>VERTICAL PANEL — 260x420</Note>
      <LeafFrame corner={62} style={{ width: 260, height: 420, padding: leafFramePadding(62) }}>
        <p style={ink}>
          CARROTS 128
          <br />
          <br />
          DEPTH 7
          <br />
          <br />
          RAIDS 3
        </p>
      </LeafFrame>
    </>
  ),
};

/**
 * THE SAME BOX, FOUR CORNER SIZES. The corner is an absolute size, not a
 * fraction of the box — this is the knob callers actually turn. 90 is what the
 * reference was drawn at; 40 is the smallest the leaves stay readable at.
 * Check that the bark thickness tracks the leaves at every step: bark and
 * leaves are one painted object, so a corner that grows while the bark stays
 * put means the derivation is wrong.
 */
export const Corners: Story = {
  render: () => (
    <>
      {([40, 62, 90, 120] as const).map((s) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ ...label, width: 78 }}>corner {s}</div>
          <LeafFrame corner={s} style={{ width: 460, height: 160, padding: leafFramePadding(s) }}>
            <p style={ink}>The same board, {s}px corners.</p>
          </LeafFrame>
        </div>
      ))}
    </>
  ),
};

/**
 * THE CENTRE MUST BE OPAQUE. Over a loud, high-contrast ground, any pixel of
 * background visible inside the frame means `fill` is off or the middle slice
 * is empty — the bug the plank hit on its first cut.
 */
export const OnBusyGround: Story = {
  render: () => (
    <div
      style={{
        padding: 26,
        background:
          'repeating-linear-gradient(45deg, #ff2d95 0 18px, #14e0ff 18px 36px)',
      }}
    >
      <LeafFrame corner={90} style={{ width: 520, height: 260, padding: leafFramePadding(90) }}>
        <p style={ink}>
          If any magenta or cyan shows inside this frame, the centre slice is a hole.
        </p>
      </LeafFrame>
    </div>
  ),
};

/**
 * THE NEW MATERIAL BESIDE THE OLD ONE. The codex panel is the game's current
 * chrome; the leaf frame is meant to be a second, warmer material standing
 * clearly apart from it — not a near-miss of it.
 */
export const AgainstTheKit: Story = {
  render: () => (
    <>
      <Note>THE KIT&apos;S PANEL — what the chrome wears today</Note>
      <PxPanel color="#6b4b2f" style={{ width: 520, padding: 16 }}>
        <p style={{ ...ink, color: '#f6e3c4' }}>The codex frame: hard pixel line, flat fill.</p>
      </PxPanel>

      <Note>THE LEAF FRAME — the direction</Note>
      <LeafFrame corner={90} style={{ width: 520, height: 200, padding: leafFramePadding(90) }}>
        <p style={ink}>Painted bark, leaf corners, parchment ground.</p>
      </LeafFrame>
    </>
  ),
};

/**
 * THE FLOOR, ON PURPOSE. A 90px corner needs a 180x195 box; this one is
 * smaller, so opposite corners overlap and the leaves collide into a knot. The
 * fix is never a squeezed box — it is a smaller `corner`, which the second
 * frame shows at the same 150x150.
 */
export const TooSmall: Story = {
  render: () => (
    <>
      <Note>
        BROKEN — 150x150 with 90px corners, under the {leafFrameMin(90).width}x{leafFrameMin(90).height} floor
      </Note>
      <LeafFrame corner={90} style={{ width: 150, height: 150 }} />

      <Note>THE FIX — same box, 34px corners</Note>
      <LeafFrame corner={34} style={{ width: 150, height: 150, padding: leafFramePadding(34) }}>
        <p style={{ ...ink, fontSize: 11 }}>OK</p>
      </LeafFrame>
    </>
  ),
};
