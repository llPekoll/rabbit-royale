/**
 * The mirage: numbers that lie, and stay catchable.
 *
 * The whole item rests on one property that nothing throws about — a lie has
 * to be BELIEVABLE and FINDABLE at once. Corrupt too much, or corrupt wildly,
 * and the victim stops reading the board instead of checking it, which is the
 * failure this item is supposed to avoid.
 */
import { describe, expect, it } from 'vitest';
import { MIRAGE } from '../config/tuning';
import { generateIsland, revealTile } from '../src/lib/game/island';
import {
  planMirage, mirageActive, shownAdjacent, mirageTiles,
} from '../src/lib/game/mirage';

const NOW = 1_000_000;

/** An island with `n` tiles dug, so there are hints to corrupt. */
function dugIsland(seed: string, n = 60) {
  const island = generateIsland({ seed });
  let i = 0;
  for (const tile of island.tiles.keys()) {
    if (i++ >= n) break;
    revealTile(island, tile, 'victim');
  }
  return island;
}

describe('choosing what lies', () => {
  it('corrupts at most MIRAGE.TILES', () => {
    const m = planMirage(dugIsland('a'), 'attacker', NOW);
    expect(m.hints.length).toBeLessThanOrEqual(MIRAGE.TILES);
  });

  it('only ever touches REVEALED tiles carrying a hint', () => {
    const island = dugIsland('b');
    const m = planMirage(island, 'attacker', NOW);
    for (const h of m.hints) {
      const tile = island.tiles.get(h.tile)!;
      expect(tile.revealed).toBe(true);
      expect(tile.adjacent).toBeGreaterThan(0);
    }
  });

  it('has almost nothing to bend on a board nobody has read', () => {
    // A fresh island reveals the spawn and its ring, so a hint or two can
    // exist from the first second — but a mirage thrown before anyone has read
    // anything is close to wasted, which is the fair outcome: the item attacks
    // deduction, and there is barely any happening yet.
    const island = generateIsland({ seed: 'untouched' });
    const hinted = [...island.tiles.values()].filter((t) => t.revealed && t.adjacent > 0);
    const m = planMirage(island, 'attacker', NOW);
    expect(m.hints.length).toBe(Math.min(hinted.length, MIRAGE.TILES));
  });

  it('does nothing at all when not one tile carries a hint', () => {
    const island = generateIsland({ seed: 'blank' });
    for (const tile of island.tiles.values()) { tile.revealed = false; tile.adjacent = 0; }
    expect(planMirage(island, 'attacker', NOW).hints).toEqual([]);
  });

  it('is seeded: the same throw lies the same way twice', () => {
    const island = dugIsland('c');
    const a = planMirage(island, 'attacker', NOW, 'fixed');
    const b = planMirage(island, 'attacker', NOW, 'fixed');
    expect(a.hints).toEqual(b.hints);
  });
});

describe('the lie stays believable', () => {
  it('never drifts more than MIRAGE.DRIFT from the truth', () => {
    for (let i = 0; i < 30; i++) {
      const m = planMirage(dugIsland(`drift-${i}`), 'attacker', NOW);
      for (const h of m.hints) {
        expect(Math.abs(h.shown - h.truth)).toBe(MIRAGE.DRIFT);
      }
    }
  });

  /**
   * A hint of zero is drawn as NO hint. A "1" that drifted down would read as
   * a blank tile — a different claim, and an obvious glitch rather than a
   * plausible count.
   */
  it('never shows a number the board cannot draw', () => {
    for (let i = 0; i < 30; i++) {
      const m = planMirage(dugIsland(`bounds-${i}`), 'attacker', NOW);
      for (const h of m.hints) {
        expect(h.shown).toBeGreaterThanOrEqual(1);
        expect(h.shown).toBeLessThanOrEqual(8);
      }
    }
  });

  it('always actually changes the number', () => {
    for (let i = 0; i < 20; i++) {
      const m = planMirage(dugIsland(`change-${i}`), 'attacker', NOW);
      for (const h of m.hints) expect(h.shown).not.toBe(h.truth);
    }
  });
});

describe('the truth is never lost', () => {
  it('leaves the island untouched', () => {
    const island = dugIsland('pure');
    const before = [...island.tiles].map(([i, t]) => [i, t.adjacent]);
    planMirage(island, 'attacker', NOW);
    expect([...island.tiles].map(([i, t]) => [i, t.adjacent])).toEqual(before);
  });

  it('shows the lie while it holds and the truth after', () => {
    const island = dugIsland('expiry');
    const m = planMirage(island, 'attacker', NOW);
    const h = m.hints[0];

    expect(mirageActive(m, NOW)).toBe(true);
    expect(shownAdjacent(m, h.tile, h.truth, NOW)).toBe(h.shown);

    const later = NOW + MIRAGE.DURATION_MS + 1;
    expect(mirageActive(m, later)).toBe(false);
    expect(shownAdjacent(m, h.tile, h.truth, later)).toBe(h.truth);
  });

  /**
   * Ground dug DURING the mirage is bent at `freshRate` too — otherwise the
   * item lasts one puzzle: the victim checks the three planned tiles, finds
   * them, and everything afterwards is honest. What has to hold is that MOST
   * of it stays true, so the lies are still catchable against it.
   */
  it('leaves most of the fresh ground honest', () => {
    const island = dugIsland('honest');
    const m = planMirage(island, 'attacker', NOW);
    const lying = new Set(mirageTiles(m));

    let checked = 0;
    let bent = 0;
    for (const [index, tile] of island.tiles) {
      if (lying.has(index) || tile.adjacent <= 0) continue;
      checked++;
      if (shownAdjacent(m, index, tile.adjacent, NOW) !== tile.adjacent) bent++;
    }
    expect(checked).toBeGreaterThan(20);
    expect(bent / checked).toBeLessThan(0.4);
  });

  it('bends a given tile the same way every time it is asked', () => {
    // A number that flickered between two values as the client redrew would
    // give the item away instantly, and read as a bug rather than sabotage.
    const island = dugIsland('stable');
    const m = planMirage(island, 'attacker', NOW);
    for (const [index, tile] of island.tiles) {
      if (tile.adjacent <= 0) continue;
      const a = shownAdjacent(m, index, tile.adjacent, NOW);
      const b = shownAdjacent(m, index, tile.adjacent, NOW + 1_000);
      expect(a).toBe(b);
    }
  });
});

describe('the victim can catch it', () => {
  /**
   * The property the whole item depends on: most of the board stays honest, so
   * a corrupted hint contradicts its neighbours and a player who is reading
   * can re-derive the real count.
   */
  it('leaves the overwhelming majority of hints truthful', () => {
    const island = dugIsland('catchable', 120);
    const m = planMirage(island, 'attacker', NOW);
    const hinted = [...island.tiles.values()].filter((t) => t.revealed && t.adjacent > 0).length;
    expect(m.hints.length / hinted).toBeLessThan(0.15);
  });

  it('names who threw it', () => {
    const m = planMirage(dugIsland('blame'), 'rival-7', NOW);
    expect(m.castBy).toBe('rival-7');
  });
});
