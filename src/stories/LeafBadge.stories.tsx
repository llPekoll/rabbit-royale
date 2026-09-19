/**
 * THE BADGE AND THE CLOSE BUTTON — the leaf frame's two small companions.
 *
 * WHAT TO JUDGE HERE, in the order it matters:
 *
 *  1. DOES THE BADGE STRETCH WITHOUT A SEAM? `Counts` runs 1 -> 99+ in one
 *     row. The art has a glossy highlight across its top, and the first cut
 *     printed a visible notch where the stretched band met the corners. Look
 *     along the TOP of each pill: the gloss must read as one continuous band,
 *     with no step where the ends meet the middle.
 *  2. ARE THE ENDS THE SAME AT EVERY WIDTH? The rounded caps are fixed art. A
 *     cap that is fatter on "99+" than on "1" means the slice is cut wrong.
 *  3. IS THE FIGURE LEGIBLE ON THE GLOSS? White on red at 11px, over a
 *     specular highlight, is the hard case — `OnChrome` puts the badge where
 *     it actually lives, on a dark button in the corner.
 *  4. THE CLOSE BUTTON IS NOT A NINE-SLICE, and `CloseStates` is the evidence
 *     it does not need to be: it is one fixed sprite in three states. Hover
 *     and press it — the art swaps, and it must not stretch or shift.
 *
 * `Sizes` is the honest check on both: they are illustrations, so they scale
 * whole rather than stretching, and the X must stay round at every size.
 */
import type { CSSProperties, ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { LeafBadge, LeafClose } from '@/components/leaf-badge';
import { LeafFrame, leafFramePadding } from '@/components/leaf-frame';
import '@/app/globals.css';

const meta: Meta = {
  title: 'Chrome/LeafBadge',
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

function Note({ children }: { children: ReactNode }) {
  return <div style={label}>{children}</div>;
}

const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14 };

/**
 * ONE DIGIT TO THREE, which is the whole range the badge has to cover:
 * `hub-icon-button.tsx` caps the count at "99+". The first is a circle and the
 * last is a capsule, out of one asset.
 */
export const Counts: Story = {
  render: () => (
    <>
      <Note>THE RANGE — 1 to 99+, the cap hub-icon-button.tsx sets</Note>
      <div style={row}>
        {['1', '3', '8', '12', '99+', 'NEW', '!'].map((s) => (
          <LeafBadge key={s}>{s}</LeafBadge>
        ))}
      </div>

      <Note>BIGGER, so the seam has nowhere to hide</Note>
      <div style={row}>
        {['1', '12', '99+'].map((s) => (
          <LeafBadge key={s} height={44}>
            {s}
          </LeafBadge>
        ))}
      </div>
    </>
  ),
};

/**
 * THE SIZES BOTH ARE ASKED FOR. They are illustrations, so they scale whole;
 * the badge's caps and the button's X must keep their shape at every step.
 */
export const Sizes: Story = {
  render: () => (
    <>
      <Note>BADGE</Note>
      <div style={row}>
        {[16, 22, 30, 44, 60].map((h) => (
          <LeafBadge key={h} height={h}>
            12
          </LeafBadge>
        ))}
      </div>

      <Note>CLOSE</Note>
      <div style={row}>
        {[28, 36, 44, 56, 72].map((s) => (
          <LeafClose key={s} size={s} />
        ))}
      </div>
    </>
  ),
};

/**
 * THE THREE STATES, which is why the close button is three files. Hover and
 * press them: the art swaps and the box does not move — the pressed sprite is
 * already drawn darker and sunken, so it carries the press on its own.
 */
export const CloseStates: Story = {
  render: () => (
    <>
      <Note>DEFAULT / HOVER / PRESSED — hover and hold to compare</Note>
      <div style={row}>
        <LeafClose size={56} />
        <LeafClose size={56} />
        <LeafClose size={56} />
      </div>
      <Note>The same three as the sheet draws them, for reference</Note>
      <div style={row}>
        {(['default', 'hover', 'pressed'] as const).map((s) => (
          <img
            key={s}
            src={`/assets/ui/close-${s}.webp`}
            alt={s}
            style={{ width: 56, imageRendering: 'auto' }}
          />
        ))}
      </div>
    </>
  ),
};

/**
 * WHERE THEY ACTUALLY LIVE: the badge on a dark corner button, the [x] on the
 * parchment it closes. This is the pairing that has to work — the badge's red
 * against the chrome, and the button's brown against the board.
 */
export const OnChrome: Story = {
  render: () => (
    <>
      <Note>THE BADGE ON A CORNER BUTTON</Note>
      <div style={row}>
        {['3', '12', '99+'].map((s) => (
          <div
            key={s}
            style={{
              position: 'relative',
              width: 56,
              height: 56,
              background: '#1b2026',
              border: '2px solid #ddccbc',
              borderRadius: 10,
            }}
          >
            <LeafBadge style={{ position: 'absolute', right: -10, top: -8 }}>{s}</LeafBadge>
          </div>
        ))}
      </div>

      <Note>THE [X] ON THE BOARD IT CLOSES</Note>
      <LeafFrame corner={62} style={{ width: 460, height: 190, padding: leafFramePadding(62) }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <p
            style={{
              flex: 1,
              margin: 0,
              fontFamily: 'var(--font-pixel), ui-monospace, monospace',
              fontSize: 13,
              lineHeight: 1.6,
              color: '#4a3524',
            }}
          >
            The shed is open. The [x] sits on the parchment, not on a dark bar.
          </p>
          <LeafClose size={40} />
        </div>
      </LeafFrame>
    </>
  ),
};
