/**
 * The NEXT strip's rules, once the quest arc is claimed.
 *
 * One line, in priority order: risk (a full garden), then a lapse (the
 * shield), then a temptation (a rich open burrow), then the island. Pinned
 * because the order IS the design: the line is the one place the game says
 * "now do this", and a garden that empties into a raider's bag while the
 * strip says "Dig" is the strip lying.
 */
import { describe, expect, it } from 'vitest';
import { nextAction, type NextActionInput } from '../src/config/next-action';
import { NEXT_ACTION } from '../config/tuning';
import { DICTIONARIES } from '../src/i18n/dictionaries';
import { LOCALES } from '../src/i18n/locales';

/**
 * English, for the text assertions below.
 *
 * The DOOR each branch picks is the design being pinned here, and it is the
 * same in every language; the wording is English's, so that is what the
 * `toMatch` calls read. The last test walks all four.
 */
const en = DICTIONARIES.en;

const base = (over: Partial<NextActionInput> = {}): NextActionInput => ({
  energy: 60,
  runCost: 25,
  nextRunInMs: null,
  gardenReady: 0,
  gardenCapacity: 864,
  shieldMs: null,
  trapsLive: 5,
  trapsPlaced: 5,
  targets: [],
  ...over,
});

describe('nextAction', () => {
  it('sends a full bank to the island', () => {
    const a = nextAction(en, base());
    expect(a.door).toBe('farm');
    expect(a.text).toMatch(/Dig\./);
  });

  it('names the wait when the bank is short', () => {
    const a = nextAction(en, base({ energy: 10, nextRunInMs: 30 * 60_000 }));
    expect(a.door).toBe('farm');
    expect(a.text).toMatch(/A run in 30m/);
  });

  it('puts a nearly full garden before everything', () => {
    const a = nextAction(en, base({
      gardenReady: 864 * NEXT_ACTION.GARDEN_FULL_SHARE,
      shieldMs: 10 * 60_000, trapsLive: 0,
      targets: [{ name: 'Thistle', garden: 900, shielded: false }],
    }));
    expect(a.door).toBe('garden');
    expect(a.text).toMatch(/before a raider does/);
  });

  it('warns of a lifting shield only when the floor is not standing', () => {
    const soon = NEXT_ACTION.SHIELD_WARNING_MS - 1;
    expect(nextAction(en, base({ shieldMs: soon, trapsLive: 0 })).door).toBe('base');
    expect(nextAction(en, base({ shieldMs: soon, trapsLive: NEXT_ACTION.TRAPS_WANTED })).door).toBe('farm');
    // A shield with hours left is not news yet.
    expect(nextAction(en, base({ shieldMs: NEXT_ACTION.SHIELD_WARNING_MS * 5, trapsLive: 0 })).door).toBe('farm');
  });

  it('names the richest open burrow, and ignores shielded or poor ones', () => {
    const a = nextAction(en, base({
      targets: [
        { name: 'Thistle', garden: 900, shielded: true },
        { name: 'Ironwood', garden: 400, shielded: false },
        { name: 'Bramble', garden: 650, shielded: false },
        { name: 'Sly', garden: NEXT_ACTION.RAID_WORTH_GARDEN - 1, shielded: false },
      ],
    }));
    expect(a.door).toBe('raid');
    expect(a.text).toMatch(/^Bramble left 650/);
    expect(nextAction(en, base({ targets: [{ name: 'Sly', garden: 10, shielded: false }] })).door).toBe('farm');
  });

  it('keeps every line short enough to read at a glance', () => {
    const cases = [
      base(),
      base({ energy: 0, nextRunInMs: 5 * 3_600_000 + 60_000 }),
      base({ gardenReady: 864 }),
      base({ shieldMs: 1000, trapsLive: 0 }),
      base({ targets: [{ name: 'Ironwood', garden: 400, shielded: false }] }),
    ];
    // In EVERY language: the strip is one line over a board, and a
    // translation is exactly where a twelve-word budget quietly becomes
    // fifteen. Chinese is counted in characters — it puts no spaces between
    // words, so its word count is always 1 and the check would never bite.
    for (const locale of LOCALES) {
      const dict = DICTIONARIES[locale];
      for (const c of cases) {
        const { text } = nextAction(dict, c);
        if (locale === 'zh') {
          expect([...text].length, `${locale}: ${text}`).toBeLessThanOrEqual(24);
        } else {
          expect(text.split(/\s+/).length, `${locale}: ${text}`).toBeLessThanOrEqual(12);
        }
      }
    }
  });
});
