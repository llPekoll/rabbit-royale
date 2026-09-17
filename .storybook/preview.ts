import type { Preview } from '@storybook/react-vite';
import { loadPixelWebFont, PIXEL_FONT_FAMILY } from '@domin8/arcade-kit';

// RR is a Next app: modules read `process.env.*` at import time. Next inlines
// those; in Storybook's browser bundle `process` is undefined and the read
// throws. Stub it before any story module is imported (same fix as the hub's
// Storybook), so config modules resolve to their fallbacks.
const g = globalThis as {
  process?: { env: Record<string, string | undefined> };
  Buffer?: unknown;
};
if (!g.process) g.process = { env: {} };

// ...and `Buffer`, for the same reason one step further down the import graph.
// `use-shop` types its rails against `lib/pay/tokens`, which imports
// `@solana/web3.js` for a `PublicKey` — and web3.js touches `Buffer` at import
// time. Node has it, Next polyfills it, and Storybook's browser bundle has
// neither: every story that reached the shop (its own, and now the placement
// ones) rendered "Buffer is not defined" instead of a panel. A story that
// cannot mount is not evidence of anything, which is the whole point of them.
if (!g.Buffer) {
  const { Buffer } = await import('buffer');
  g.Buffer = Buffer;
}

// The kit's pixel face. The app loads it in its root layout; Storybook has no
// layout, so without this every story renders the chrome in the fallback
// monospace and stops being evidence of what ships.
void loadPixelWebFont().then(() => {
  document.documentElement.style.setProperty('--font-pixel', `"${PIXEL_FONT_FAMILY}"`);
});

/**
 * The phones this game is actually held in.
 *
 * The Seeker is the target device (globals.css says so, and the layout is
 * written phone-first: everything under 720px IS the layout, with tighter
 * steps at 620, 560 and 420). A story reviewed at desktop width is reviewed
 * somewhere the game will rarely be — the burrow column gets room it does not
 * have, and the panels that have to fold never fold.
 *
 * LANDSCAPE FIRST, which the stock presets do not offer: this is a game with a
 * board in the middle, and it is played sideways. The portrait entry is kept
 * because the burrow column and the codex both have a portrait fold to check.
 *
 * Sizes are the Seeker's own logical viewport. The device is 2670x1200
 * physical at ~460 PPI, which Android serves at DPR 3 => 890x400 logical. An
 * earlier version of this file assumed a 2400x1080 panel and listed 800x360;
 * that is 90x40 short, and a preset a few dozen px off lands on the wrong side
 * of a breakpoint and quietly reviews the wrong layout. Not a generic
 * "mobile1" for the same reason.
 */
const VIEWPORTS = {
  seeker: {
    name: 'Seeker (landscape)',
    type: 'mobile' as const,
    styles: { width: '890px', height: '400px' },
  },
  seekerPortrait: {
    name: 'Seeker (portrait)',
    type: 'mobile' as const,
    styles: { width: '400px', height: '890px' },
  },
  // A roomier phone, to catch what only breaks between the two.
  phoneWide: {
    name: 'Phone wide (landscape)',
    type: 'mobile' as const,
    styles: { width: '932px', height: '430px' },
  },
  desktop: {
    name: 'Desktop',
    type: 'desktop' as const,
    styles: { width: '1280px', height: '800px' },
  },
};

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // RR's ocean, so canvas stories sit on the palette they ship against.
    backgrounds: {
      default: 'rr-ocean',
      values: [
        { name: 'rr-ocean', value: '#081120' },
        { name: 'rr-sky', value: '#55adc8' },
      ],
    },
    viewport: {
      options: VIEWPORTS,
      // The default is the DEVICE, not the desk. A story that only ever gets
      // looked at on a desktop is a story that has not been looked at.
      defaultViewport: 'seeker',
    },
  },
  // Storybook 10 keeps the SELECTED viewport in globals, so the default above
  // needs its matching global or the toolbar opens on "reset".
  initialGlobals: {
    viewport: { value: 'seeker', isRotated: false },
  },
};

export default preview;
