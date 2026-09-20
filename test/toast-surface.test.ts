/**
 * WHAT THE GAME'S NOTIFICATIONS ARE WEARING.
 *
 * The burrow's toasts used to arrive on the painted notice boards — gold for
 * the placing instruction, red for a refusal — while the island said its lines
 * on a dark translucent pill. Paul, 2026-09-20: use the pill everywhere, in
 * defence, on a dig and on a raid.
 *
 * All three screens render those lines through the same `.rr-toasts` column
 * (page.tsx), so ONE branch of the surface picker decides it. This reads that
 * picker straight out of runtime.tsx and runs it over the classnames the app
 * really passes, rather than asserting on a copy of the regex that would go
 * stale the moment the component moved on.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../src/components/woodland/runtime.tsx', import.meta.url));

/** The picker itself, lifted from the component and made callable. */
function surfaceFor(className: string): string {
  const src = readFileSync(SRC, 'utf8');
  const body = src.slice(src.indexOf('const kind = surface ?? ('), src.indexOf('const danger ='));
  const expr = body.slice(body.indexOf('(') + 1, body.lastIndexOf(')'));
  return new Function('className', 'style', `return (${expr});`)(className, {});
}

describe('every line the game says takes the caption pill', () => {
  // The burrow in defence, and the same column on a dig or a raid.
  it.each([
    ['rr-toast rr-toast-hint', 'the placing instruction'],
    ['rr-toast', 'a plain note'],
    ['rr-toast refused', 'a refusal'],
    ['rr-reconnecting', 'the dropped socket'],
  ])('%s — %s', (className) => {
    expect(surfaceFor(className)).toBe('caption');
  });

  // The island's own narration, which the rest were made to match.
  it('the island caption is unchanged', () => {
    expect(surfaceFor('rr-caption')).toBe('caption');
    expect(surfaceFor('rr-caption rr-caption-cost')).toBe('caption');
  });

  // The painted boards still exist — the buttons wear them.
  it('a panel still gets its parchment', () => {
    expect(surfaceFor('rr-profile')).toBe('parchment');
  });
});
