/**
 * THE FIRST RUN'S CAPTIONS, in the order a player earns them.
 *
 * The arc is numbers → red X → chest, and each beat is the ground the next
 * stands on (see config/first-run.ts). `firstRunBeat` shows the LAST beat
 * whose condition holds, so the order in the list IS the order on screen —
 * which makes it worth pinning, because a condition that accidentally holds
 * too early silently skips the lesson before it.
 */
import { describe, expect, it } from 'vitest';
import { FIRST_RUN_BEATS, firstRunBeat, type FirstRunState } from '@/config/first-run';
import { DICTIONARIES } from '@/i18n/dictionaries';

const base: FirstRunState = { tiles: 0, bombs: 0, goldens: 0, chests: 0, flags: 0, warnStage: 0 };

describe('the first run teaches in order', () => {
  it('opens on "tap a tile" and holds there', () => {
    expect(firstRunBeat(base)?.id).toBe('tap');
    expect(firstRunBeat(base)?.sticky).toBe(true);
  });

  it('explains the NUMBER before it asks for anything, and holds', () => {
    const beat = firstRunBeat({ ...base, tiles: 1 });
    expect(beat?.id).toBe('numbers');
    // Sticky: the glyph is what every later beat points at, so it must not
    // fade before the player has looked at it.
    expect(beat?.sticky).toBe(true);
  });

  it('names the deduction, then the button, before the X is armed', () => {
    expect(firstRunBeat({ ...base, tiles: 2 })?.id).toBe('counts');
    expect(firstRunBeat({ ...base, tiles: 3 })?.id).toBe('mark');
  });

  it('hands over to the TILE the moment X mode is armed', () => {
    // The one beat that is about a mode rather than a tally: it is what makes
    // the caption stop pointing at the corner of the screen and start
    // pointing at the board.
    expect(firstRunBeat({ ...base, tiles: 3, armed: true })?.id).toBe('aim');
  });

  it('answers a right X, then sends the player to the chest', () => {
    expect(firstRunBeat({ ...base, tiles: 3, flags: 1, chests: 1 })?.id).toBe('chest');
    // With the X paid and no chest opened yet, the run's next ask is the box.
    expect(firstRunBeat({ ...base, tiles: 3, flags: 1 })?.id).toBe('fetch');
  });

  it('lets the clock have the last word', () => {
    expect(firstRunBeat({ ...base, tiles: 3, flags: 1, warnStage: 1 })?.id).toBe('clock');
  });

  it('has words for every beat, in every language', () => {
    for (const [locale, dict] of Object.entries(DICTIONARIES)) {
      for (const beat of FIRST_RUN_BEATS) {
        const line = dict.firstRun[beat.id];
        expect(line, `${locale} is missing ${beat.id}`).toBeTruthy();
        // The strip holds ONE line over a board the player is tapping; the
        // config's own rule is that nothing here asks to be read for long.
        expect(line.length, `${locale}/${beat.id} is too long to glance at`).toBeLessThan(90);
      }
    }
  });
});
