/**
 * NUMBERS, DURATIONS AND PLURALS — the shapes that are not prose but still
 * change with the language.
 *
 * Six copies of the same duration helper had grown across the codebase
 * (`wait` in next-action, `formatWait` in loop-bar, page.tsx and energy-popup,
 * `shortWait` in kit-row, `formatRunTime` in run-recap), each hard-coding "m",
 * "h" and "d". Six copies is six translations and five chances to miss one, so
 * they collapse here: the SHAPE of a duration is one decision, and the LETTERS
 * in it come from the dictionary.
 *
 * The unit letters are passed in rather than imported, so this module stays
 * free of the dictionary and the dictionary stays the only place words live.
 * Every caller has `t` already.
 */
import { intlTag, type Locale } from './locales';

/** The unit letters, as each language writes them. See `Dict['units']`. */
export interface Units {
  /** Seconds, as in "47s". */
  s: string;
  /** Minutes, as in "45m". */
  m: string;
  /** Hours, as in "3h". */
  h: string;
  /** Days, as in "2d". */
  d: string;
}

/**
 * Group a number with thin separators, the SAME WAY on the server and in the
 * browser.
 *
 * Moved here from hub-card.tsx, whose comment is worth keeping verbatim:
 * `toLocaleString()` was used first and caused a hydration mismatch — with no
 * locale argument it takes the environment's, and Node's default is not
 * necessarily the browser's, so "1,940" rendered on the server could arrive as
 * "1 940" on the client and React threw the whole tree away. Formatting by
 * hand is deterministic, which is the only property that matters here.
 *
 * A thin space, not a comma, and that choice now pays twice: the pixel face
 * draws it, and it is the one grouping that is not WRONG in any of the four
 * languages. A comma groups thousands in English and marks the decimal in
 * French and Portuguese; Chinese groups in fours as often as in threes. A
 * space says "these digits go together" everywhere.
 */
export function groupDigits(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const digits = Math.abs(Math.round(n)).toString();
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ' ';
    out += digits[i];
  }
  return sign + out;
}

/**
 * A wait, in the shortest form that is still true: "45m", "3h 20m", "2h".
 *
 * Rounds UP, because this is always an answer to "how long until I can play"
 * and a bar that says 0m while still refusing is a bug the player can see.
 */
export function formatWait(ms: number, u: Units): string {
  const mins = Math.ceil(Math.max(0, ms) / 60_000);
  if (mins < 60) return `${mins}${u.m}`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${h}${u.h} ${rest}${u.m}` : `${h}${u.h}`;
}

/**
 * The same wait, one unit only: "45m", "3h", "2d".
 *
 * For the places that have room for a number and a letter and nothing else —
 * the kit row's tooltips, an item's remaining cover.
 */
export function shortWait(ms: number, u: Units): string {
  const mins = Math.max(1, Math.round(Math.max(0, ms) / 60_000));
  if (mins < 60) return `${mins}${u.m}`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}${u.h}`;
  return `${Math.round(hrs / 24)}${u.d}`;
}

/**
 * How long a run lasted: "47s", "3m 20s".
 *
 * Raw seconds are fine for a stopwatch and wrong for a result — "214s" makes
 * the reader do the division, and session length is the thing this game asks
 * players to get better at, so it is stated in the unit they think in.
 */
export function formatRunTime(ms: number, u: Units): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}${u.s}`;
  return `${Math.floor(total / 60)}${u.m} ${total % 60}${u.s}`;
}

/**
 * A season gap, short enough to always fit the pill's rank line: whole with
 * separators below 10,000, then "12.3k", "123k", "1.2M".
 *
 * The k/M suffixes stay Latin in every language — they are read as symbols
 * rather than as words, and Chinese players meet them constantly in games.
 * A language that wanted 万 would override this, not translate the letters.
 */
export function shortGap(n: number): string {
  const v = Math.max(0, Math.ceil(n));
  if (v < 10_000) return groupDigits(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 100_000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/**
 * WHICH PLURAL FORM a count takes, for a language that has more than one.
 *
 * Every plural in the game was an inline English ternary — `${n} trap${n === 1
 * ? '' : 's'}` — which is three separate wrong answers at once: Chinese has no
 * plural marking at all, and French puts the boundary in a different place
 * from English (0 and 1 are both singular in French, only 1 in English).
 *
 * The dictionary supplies the FORMS and this picks between them, so a language
 * never has to know the rules of the others. `Intl.PluralRules` is the
 * authority rather than a hand-written table: it is in every runtime the game
 * targets, and it already knows what French does with zero.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export function plural(locale: Locale, n: number, forms: PluralForms): string {
  const rule = new Intl.PluralRules(intlTag(locale)).select(n);
  return forms[rule] ?? forms.other;
}
