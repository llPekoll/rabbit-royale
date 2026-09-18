/**
 * The live tuning surcharge: what it lets through, and what it refuses.
 *
 * The value of a database-backed number is that it changes without a deploy;
 * the DANGER is the same sentence. A constant in `config/tuning.ts` is typed
 * and the compiler checks every use, while a row in the `tuning` table is
 * whatever somebody typed into it at 3am. So the part worth testing is not
 * that an override applies — it is everything that must happen when the row is
 * wrong, because that is what stands between a typo and a broken economy.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as FILE from '../config/tuning';
import { OVERRIDABLE, OVERRIDABLE_BY_PATH, rejectReason } from '../config/overridable';
import { buildSnapshot, tuned, resetTuningCache } from '../src/lib/tuning/live';

/** Read a dotted path out of the shipped module, the way the loader does. */
function fromFile(path: string): unknown {
  let node: unknown = FILE as unknown as Record<string, unknown>;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

describe('the registry agrees with the file', () => {
  /**
   * The failure this catches is quiet and nasty: a constant gets renamed, the
   * registry keeps the old path, and the override for it silently stops
   * applying. Nothing errors — the number just never changes, and whoever is
   * editing the table concludes the feature is broken.
   */
  it('every declared path resolves to a number in tuning.ts', () => {
    const missing = OVERRIDABLE.filter((s) => typeof fromFile(s.path) !== 'number');
    expect(missing.map((s) => s.path)).toEqual([]);
  });

  it('every shipped value is inside its own declared bounds', () => {
    // Bounds that exclude the value the game ships with are bounds that would
    // refuse the file's own number the moment it were seeded back.
    const bad = OVERRIDABLE
      .map((s) => ({ path: s.path, why: rejectReason(s, fromFile(s.path)) }))
      .filter((r) => r.why !== null);
    expect(bad).toEqual([]);
  });

  it('declares no key twice', () => {
    expect(OVERRIDABLE_BY_PATH.size).toBe(OVERRIDABLE.length);
  });
});

describe('what may NOT be overridden', () => {
  /**
   * The line this defends is the one that makes the whole feature safe.
   *
   * Tile contents are fixed once, at generation (`generateIsland` reads the
   * densities and writes the board), and a run's energy rules are read while
   * somebody is standing on that board. Making either changeable at runtime
   * would mean two players on two islands playing different games, or a board
   * whose rules moved under a player mid-run — with nothing on screen to say
   * why. Those numbers cost a deploy, and that is the honest price.
   */
  it('keeps island generation and in-run rules out of the database', () => {
    const frozen = [
      'ISLAND.CARROT_DENSITY',
      'ISLAND.BOMB_DENSITY',
      'ISLAND.GOLDEN_SHARE',
      'ISLAND.CHEST_DENSITY',
      // Where the chests sit is cut at generation like the densities, and the
      // island now ENDS on them — a live change would move the finish line of
      // a board somebody is standing on.
      'ISLAND.CHEST_MIN_DEPTH',
      'ENERGY.START',
      'ENERGY.CARROT_GAIN',
      'ENERGY.GOLDEN_GAIN',
      'ENERGY.BOMB_LOSS',
      'ENERGY.DIG_COST',
    ];
    for (const path of frozen) {
      expect(OVERRIDABLE_BY_PATH.has(path), `${path} ne doit pas être surchargeable`).toBe(false);
    }
  });

  it('states the reason in the file, so the next person does not just add one', () => {
    const src = readFileSync(new URL('../config/overridable.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/generateIsland/);
    expect(src).toMatch(/ENERGY\.START/);
  });
});

describe('a row that is wrong never reaches the game', () => {
  const warnsFor = (rows: { key: string; value: number }[]) => {
    const warns: string[] = [];
    const snap = buildSnapshot(rows, (m) => warns.push(m));
    return { snap, warns };
  };

  it('takes a legal value', () => {
    const { snap } = warnsFor([{ key: 'SHOP.PRICES.bomb', value: 250 }]);
    expect(snap.get('SHOP.PRICES.bomb')).toBe(250);
  });

  it('refuses a value outside the declared bounds', () => {
    const { snap, warns } = warnsFor([{ key: 'SHOP.PRICES.bomb', value: -50 }]);
    expect(snap.has('SHOP.PRICES.bomb')).toBe(false);
    expect(warns[0]).toMatch(/hors bornes/);
  });

  it('refuses a fraction where a whole number is required', () => {
    // A price of 12.5 carrots is not a balance decision, it is a typo — and
    // one that would round somewhere unpredictable downstream.
    const { snap, warns } = warnsFor([{ key: 'GARDEN.CAP_HOURS', value: 2.5 }]);
    expect(snap.has('GARDEN.CAP_HOURS')).toBe(false);
    expect(warns[0]).toMatch(/entier/);
  });

  it('refuses a share above 1', () => {
    const { snap } = warnsFor([{ key: 'RAID_RUN.LOOT_SHARE', value: 3 }]);
    expect(snap.has('RAID_RUN.LOOT_SHARE')).toBe(false);
  });

  it('refuses NaN and Infinity rather than letting them through arithmetic', () => {
    const { snap } = warnsFor([
      { key: 'SHOP.PRICES.bomb', value: Number.NaN },
      { key: 'SHOP.PRICES.trap', value: Number.POSITIVE_INFINITY },
    ]);
    expect(snap.size).toBe(0);
  });

  it('ignores a key the registry does not declare', () => {
    // Exactly how a frozen number stays frozen even if somebody inserts a row
    // for it by hand.
    const { snap, warns } = warnsFor([{ key: 'ISLAND.CARROT_DENSITY', value: 0.9 }]);
    expect(snap.size).toBe(0);
    expect(warns[0]).toMatch(/non surchargeable/);
  });

  it('drops only the bad row, keeping the good ones', () => {
    // One typo must not cost every other override — a table is edited one line
    // at a time and the rest of it was fine a second ago.
    const { snap } = warnsFor([
      { key: 'SHOP.PRICES.bomb', value: 250 },
      { key: 'SHOP.PRICES.trap', value: -1 },
      { key: 'SHOP.PRICES.shield', value: 700 },
    ]);
    expect([...snap.keys()].sort()).toEqual(['SHOP.PRICES.bomb', 'SHOP.PRICES.shield']);
  });
});

describe('with no database at all', () => {
  it('answers with the file, which is never wrong — only potentially stale', () => {
    resetTuningCache();
    expect(tuned('SHOP.PRICES.bomb')).toBe(FILE.SHOP.PRICES.bomb);
    expect(tuned('GARDEN.YIELD_PER_HOUR_BASE')).toBe(FILE.GARDEN.YIELD_PER_HOUR_BASE);
  });

  it('throws on a path that does not exist, rather than quietly returning zero', () => {
    // A zero here would make something free. Loud is the only safe answer.
    expect(() => tuned('SHOP.PRICES.unicorn')).toThrow(/chemin inconnu/);
  });
});
