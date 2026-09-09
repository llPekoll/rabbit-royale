/**
 * What counts as a name a player may take.
 *
 * A display name sits above a rabbit's head mid-run and in the season board, so
 * the limits here are about LEGIBILITY at that size, not about taste: something
 * that fits the pixel face, has no runs of whitespace to fake indentation with,
 * and cannot be blank or impersonate the empty string.
 *
 * Kept beside the schema rather than inside the route, because the picker in
 * the profile menu has to refuse the same names the server would.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 16;

/** Letters, digits, and single interior spaces, dashes or underscores. */
const ALLOWED = /^[\p{L}\p{N}]([\p{L}\p{N} _-]*[\p{L}\p{N}])?$/u;

export type NameProblem = 'too_short' | 'too_long' | 'bad_chars';

/**
 * Collapse whitespace and trim. Applied before validating AND before storing, so
 * "  Bun   Bun " and "Bun Bun" are the same name rather than two.
 */
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Null when the name is fine — otherwise why it is not. */
export function nameProblem(raw: string): NameProblem | null {
  const name = normalizeName(raw);
  if (name.length < NAME_MIN) return 'too_short';
  if (name.length > NAME_MAX) return 'too_long';
  if (!ALLOWED.test(name)) return 'bad_chars';
  return null;
}

/** For the form: a sentence the player can act on. */
export function nameProblemMessage(problem: NameProblem): string {
  switch (problem) {
    case 'too_short':
      return `At least ${NAME_MIN} characters.`;
    case 'too_long':
      return `At most ${NAME_MAX} characters.`;
    case 'bad_chars':
      return 'Letters and numbers, with spaces, - or _ inside.';
  }
}
