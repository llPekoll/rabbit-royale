/**
 * The ladder's own rule, held by a test rather than by a comment.
 *
 * "Richer AND more dangerous, never one without the other" is the line in
 * tuning.ts, and it was silently false for a day: Meadow was raised to 30 %
 * carrots while the tiers above it sat at 13-22 %, so crossing a threshold
 * made the game poorer. A comment did not catch that; this does.
 */
import { describe, expect, it } from 'vitest';
import { ENERGY, ISLAND, ISLAND_TIERS, RUN, SEASON, tierFor } from '../config/tuning';

/** What one run pays on a tier, and how much board it covers. Hearts decide
 *  the length: a run ends on its last heart, so more bombs means FEWER tiles. */
function runOn(tier: typeof ISLAND_TIERS[number]) {
  const hearts = ENERGY.START / ENERGY.BOMB_LOSS;
  const digs = hearts / tier.bombDensity;
  const golden = tier.carrotDensity * tier.goldenShare;
  const plain = tier.carrotDensity - golden;
  return { digs, carrots: digs * (plain * RUN.CARROT_VALUE + golden * RUN.GOLDEN_VALUE) };
}

describe('the island ladder', () => {
  it('climbs in danger and in reward together, tier by tier', () => {
    for (let i = 1; i < ISLAND_TIERS.length; i++) {
      const prev = ISLAND_TIERS[i - 1];
      const tier = ISLAND_TIERS[i];
      expect(tier.minLifetime).toBeGreaterThan(prev.minLifetime);
      expect(tier.bombDensity).toBeGreaterThan(prev.bombDensity);
      // Richer, or the threshold is a punishment.
      expect(tier.carrotDensity).toBeGreaterThan(prev.carrotDensity);
      expect(tier.goldenShare).toBeGreaterThanOrEqual(prev.goldenShare);
      // And richer PER RUN, which is what the player actually feels: with
      // hearts, a tier that adds bombs shortens the run, so its carrot density
      // has to climb faster than its bombs just to break even.
      expect(runOn(tier).carrots).toBeGreaterThan(runOn(prev).carrots);
      // ...while the board shrinks. The tension rises, the yield barely does.
      expect(runOn(tier).digs).toBeLessThan(runOn(prev).digs);
    }
  });

  it('starts where the base island does, so a first run is the base game', () => {
    const first = ISLAND_TIERS[0];
    expect(first.minLifetime).toBe(0);
    expect(first.bombDensity).toBe(ISLAND.BOMB_DENSITY);
    expect(first.carrotDensity).toBe(ISLAND.CARROT_DENSITY);
    expect(tierFor(0)).toBe(first);
  });

  it('is fully walked well inside a season', () => {
    // A day of play is worth roughly 700 lifetime carrots (four runs plus a
    // garden). The last tier must land inside the season, with room to play it
    // — the crown is decided between players who know the hardest board, not
    // between players still unlocking it.
    const perDay = 700;
    const last = ISLAND_TIERS[ISLAND_TIERS.length - 1];
    const daysToLast = last.minLifetime / perDay;
    const seasonDays = SEASON.DURATION_MS / 86_400_000;
    expect(daysToLast).toBeLessThan(seasonDays * 0.6);
  });

  it('hands every lifetime total exactly one tier, the highest unlocked', () => {
    for (const t of ISLAND_TIERS) {
      expect(tierFor(t.minLifetime)).toBe(t);
      if (t.minLifetime > 0) expect(tierFor(t.minLifetime - 1)).not.toBe(t);
    }
    expect(tierFor(Number.MAX_SAFE_INTEGER)).toBe(ISLAND_TIERS[ISLAND_TIERS.length - 1]);
  });
});
