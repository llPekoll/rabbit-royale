/**
 * Which painting of the burrow a level shows.
 *
 * Upgrading is otherwise invisible. The GDD gives the burrow one building and
 * one level, and everything that level buys — garden yield, HP, defence budget
 * — is a number on a panel. So the art IS the upgrade: the enclosure around
 * your field goes from wooden rails to iron railings to a castle wall, and a
 * raider arriving at your door can see what they are walking into before they
 * read a single stat.
 *
 * All four backdrops are the same painting redrawn, and — crucially — they are
 * pre-aligned so the tilled field lands in exactly the same place in every one
 * (see tools/align_burrow_levels.py). That is what lets the whole game keep ONE
 * board: one origin, one zoom, one LAYOUT, one carrot plot list, checked by
 * test/burrow-calibration.test.ts. Changing level changes the picture and
 * nothing else, so a raid plays identically whoever's burrow it is.
 */

/**
 * The art, by tier. Index 0 is level 1.
 *
 * Levels run to BURROW.MAX_LEVEL (20) but there are four paintings, so
 * everything from 4 up shows the castle — the top of the visual ladder is
 * reached well before the top of the numeric one. Deliberate for now: the
 * first upgrades are the ones a new player makes, and they are the ones worth
 * making feel like something.
 */
const ART = [
  '/assets/island/burrow.webp',
  '/assets/island/burrow_lvl2.webp',
  '/assets/island/burrow_lvl3.webp',
  '/assets/island/burrow_lvl4.webp',
] as const;

/** How many distinct paintings there are. Levels above this reuse the last. */
export const BURROW_ART_TIERS = ART.length;

/**
 * The backdrop for a burrow level.
 *
 * Clamped at both ends rather than trusted: the level reaches here from a
 * database row and from the wire (a raider is shown the DEFENDER's level), so
 * a missing, zero or absurd value has to degrade to a picture rather than to
 * `undefined` and a burrow with no ground.
 */
export function burrowArt(level: number | null | undefined): string {
  if (!Number.isFinite(level ?? NaN)) return ART[0];
  const tier = Math.min(Math.max(Math.floor(level as number), 1), BURROW_ART_TIERS);
  return ART[tier - 1];
}
