import type { Preview } from '@storybook/react-vite';
import { loadPixelWebFont, PIXEL_FONT_FAMILY } from '@domin8/arcade-kit';

// RR is a Next app: modules read `process.env.*` at import time. Next inlines
// those; in Storybook's browser bundle `process` is undefined and the read
// throws. Stub it before any story module is imported (same fix as the hub's
// Storybook), so config modules resolve to their fallbacks.
const g = globalThis as { process?: { env: Record<string, string | undefined> } };
if (!g.process) g.process = { env: {} };

// The kit's pixel face. The app loads it in its root layout; Storybook has no
// layout, so without this every story renders the chrome in the fallback
// monospace and stops being evidence of what ships.
void loadPixelWebFont().then(() => {
  document.documentElement.style.setProperty('--font-pixel', `"${PIXEL_FONT_FAMILY}"`);
});

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
  },
};

export default preview;
