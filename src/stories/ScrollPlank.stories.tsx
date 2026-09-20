/**
 * THE SHIELD SCROLL — the board DEFEND wears, at the sizes DEFEND is.
 *
 * WHAT TO JUDGE HERE:
 *
 *  1. IS THE SHIELD STILL A SHIELD AT 48px? The Seeker's slab is 48px tall
 *     and the art is 104 — this is the one piece of chrome that is scaled
 *     DOWN, and a red blob where a crest was is the failure. `Sizes` puts the
 *     two shipping heights side by side.
 *  2. DOES THE TEXT CLEAR THE SHIELD? The left cap is the shield's room; a
 *     line that starts under it is unreadable on parchment.
 *  3. AT THE SLAB'S OWN RATIO. 321x80 on desktop, 253x48 on the Seeker —
 *     5.3:1, where the art is drawn at 3.4:1. Only the parchment stretches,
 *     so the caps must look identical in both.
 */
import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScrollPlank, scrollInset, SCROLL_SIZE } from '@/components/scroll-plank';
import '@/app/globals.css';

const meta: Meta = {
  title: 'Chrome/ScrollPlank',
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

/** DEFEND's own two lines, on the parchment's ink. */
function Face({ height }: { height: number }) {
  const inset = scrollInset(height);
  return (
    <span style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      height: '100%', gap: 2,
      /* Clear of the shield: the art's own left cap, plus a little air. */
      paddingLeft: 6,
      fontFamily: 'var(--font-pixel), ui-monospace, monospace',
      /* Dark ink: the ground is parchment, not soil. */
      color: '#4a3524',
      lineHeight: 1,
    }}>
      <span style={{ fontSize: height > 60 ? 15 : 12, letterSpacing: '0.06em' }}>DEFEND</span>
      <span style={{ fontSize: height > 60 ? 10 : 8, color: '#6d5238' }}>
        shield 48h · 0 traps
      </span>
    </span>
  );
}

/** The two heights the loop bar actually uses. */
export const Sizes: StoryObj = {
  render: () => (
    <>
      <span style={label}>DESKTOP — the slab is 321x80</span>
      <ScrollPlank height={80} style={{ width: 321 }}><Face height={80} /></ScrollPlank>

      <span style={label}>SEEKER — the slab is 253x48, and the art is 104 tall</span>
      <ScrollPlank height={48} style={{ width: 253 }}><Face height={48} /></ScrollPlank>

      <span style={label}>NATIVE — {SCROLL_SIZE.width}x{SCROLL_SIZE.height}, for reference</span>
      <ScrollPlank height={104} style={{ width: 354 }}><Face height={104} /></ScrollPlank>
    </>
  ),
};

/** The caps must not change shape as the parchment grows. */
export const Widths: StoryObj = {
  render: () => (
    <>
      <span style={label}>WIDTHS at 80px tall — only the parchment may stretch</span>
      {[240, 321, 420, 560].map((w) => (
        <ScrollPlank key={w} height={80} style={{ width: w }}>
          <Face height={80} />
        </ScrollPlank>
      ))}
    </>
  ),
};
