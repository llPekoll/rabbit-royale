/**
 * Stories open on the DEVICE, not on the desk.
 *
 * The Seeker is what this game is built for, and globals.css is written
 * phone-first: everything under 720px IS the layout, with tighter steps at
 * 620, 560 and 420. Storybook's own default is a full-width desktop frame, so
 * every story was being reviewed at a width the game will rarely see — the
 * burrow column got room it does not have, and the panels that have to fold
 * never folded. The Seeker default surfaced a real overflow the first time it
 * was switched on.
 *
 * Landscape, because that is how the board is held. The sizes are the device's
 * own logical viewport rather than a stock preset: a preset a few dozen px off
 * lands on the wrong side of a breakpoint and quietly reviews the wrong layout.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const PREVIEW = readFileSync(
  new URL('../.storybook/preview.ts', import.meta.url), 'utf8',
);

describe('storybook viewport', () => {
  it('defaults to the Seeker, not to a desktop frame', () => {
    expect(PREVIEW).toMatch(/defaultViewport: 'seeker'/);
    // Storybook 10 keeps the SELECTED viewport in globals: without the matching
    // initial global the toolbar opens on "reset" and the default never lands.
    expect(PREVIEW).toMatch(/initialGlobals:[\s\S]*viewport: \{ value: 'seeker'/);
  });

  it('sizes the phone to the real device, landscape', () => {
    const seeker = PREVIEW.slice(PREVIEW.indexOf('seeker: {'));
    const styles = seeker.slice(0, seeker.indexOf('},'));
    // 2400x1080 at DPR 3. Landscape: wider than it is tall.
    expect(styles).toMatch(/width: '800px'/);
    expect(styles).toMatch(/height: '360px'/);
  });

  it('keeps a portrait and a desktop to switch to', () => {
    // The burrow column and the codex both have a portrait fold worth checking,
    // and some review still belongs on a big screen.
    expect(PREVIEW).toMatch(/seekerPortrait:/);
    expect(PREVIEW).toMatch(/desktop:/);
  });
});
