/**
 * THE RECORD PER ISLAND (Paul, 21 September 2026): the best haul in one run
 * on a tier, from the player's own finished runs. Beaten, the run's socket is
 * told as the run banks; the recap says it, or the burrow does in a toast
 * when the run ended by walking home; the island list shows the best on
 * each tier's row. Asserted against the sources.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SERVER = read('../server/index.ts');
const PAGE = read('../src/app/page.tsx');

describe('the record per island', () => {
  it('is decided as the run banks, against the player\'s other runs on the tier', () => {
    const bank = SERVER.slice(SERVER.indexOf('async function bankRun('));
    expect(bank).toMatch(/where: and\(eq\(runs\.playerId, playerId\), eq\(runs\.islandTier, row\.islandTier\), ne\(runs\.id, runId\)\)/);
    expect(bank).toMatch(/if \(carrots > previous\) socketOf\(playerId\)\?\.emit\('run_record', \{ tier: row\.islandTier, carrots, previous \}\);/);
    // After the row is written, never before.
    expect(bank.indexOf('await db.update(runs)')).toBeLessThan(bank.indexOf("emit('run_record'"));
  });

  it('is said once: on the recap when there is one, in a toast when the run walked home', () => {
    expect(PAGE).toMatch(/record=\{game\.record && game\.record\.at > \(game\.recap \? 0 : Infinity\) \? game\.record : null\}/);
    expect(PAGE).toMatch(/spentRecord\.current = r\.at;\s*if \(game\.recap\) return;\s*setNote\(t\.recap\.record\(/);
  });

  it('rides the island list, on each tier\'s row', () => {
    expect(SERVER).toMatch(/for \(const r of finished\) bests\[r\.islandTier\] = Math\.max\(bests\[r\.islandTier\] \?\? 0, r\.carrots\);/);
    expect(read('../src/components/island-picker.tsx')).toMatch(/listing\.bests\[tier\.name\]/);
  });
});
