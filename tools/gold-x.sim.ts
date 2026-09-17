/**
 * GOLDEN X / STOCKED RED X — what-if, on the robots of sim-dig-core.ts. Neither
 * rule exists in the game; see `Stocks`. A solver carries N golden Xs into a
 * run and spends one wherever it would otherwise have to bet; a second table
 * caps the red Xs a run may place.
 *
 *   GOLD_OUT=/tmp/gold.txt npx vitest run -c tools/vitest.sim.config.ts tools/gold-x.sim.ts
 */
import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as T from '../config/tuning';
import { mulberry32 } from '../src/lib/game/rng';
import { play, type Policy, type Stocks } from './sim-dig-core';

test('golden x', () => {
  const N = Number(process.env.SIM_N ?? 24);
  const lines: string[] = [];
  const table = (title: string, rows: Array<{ name: string; stocks: Stocks }>, policy: Policy = 'solver') => {
    lines.push(`\n## ${title}`);
    for (const tier of T.ISLAND_TIERS) {
      let base: { digs: number; carrots: number } | undefined;
      for (const row of rows) {
        const rand = mulberry32(7);
        const runs = Array.from({ length: N }, (_, k) => play(`sim-${tier.name}-${k}`, tier.minLifetime, policy, rand, row.stocks));
        const avg = (f: (r: (typeof runs)[number]) => number) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
        const digs = avg((r) => r.digs), carrots = avg((r) => r.carrots), used = avg((r) => r.goldUsed);
        base ??= { digs, carrots };
        const per = used > 0 ? `  per gold: ${((digs - base.digs) / used).toFixed(1)} digs, ${((carrots - base.carrots) / used).toFixed(0)} carrots` : '';
        lines.push(`${tier.name.padEnd(8)} ${row.name.padEnd(10)} digs ${digs.toFixed(0).padStart(4)}  carrots ${carrots.toFixed(0).padStart(5)}  bombs ${avg((r) => r.bombs).toFixed(1).padStart(4)}  red ok ${avg((r) => r.right - r.goldHit).toFixed(0).padStart(3)}  bets ${avg((r) => r.guesses - r.goldUsed).toFixed(0).padStart(3)}  gold used ${used.toFixed(1).padStart(4)} (bomb ${avg((r) => r.goldHit).toFixed(1)})  cleared ${(100 * avg((r) => r.cleared)).toFixed(0).padStart(3)}%${per}`);
      }
    }
  };
  table('Golden X carried into a run (solver, spent on any bet at risk >= 0.25)',
    [0, 1, 3, 5, 10, 999].map((g) => ({ name: `gold ${g}`, stocks: { gold: g } })));
  table('Golden X carried by a one-number reader (spent on any bet at risk >= 0.25)',
    [0, 3, 10, 999].map((g) => ({ name: `gold ${g}`, stocks: { gold: g } })), 'reader');
  table('Golden X kept for coin-flips (risk >= 0.5)',
    [0, 3, 5, 10].map((g) => ({ name: `gold ${g}`, stocks: { gold: g, goldAt: 0.5 } })));
  table('Stocked red X (solver, no gold)',
    [Infinity, 40, 20, 10, 5, 0].map((c) => ({ name: `red ${c}`, stocks: { redCap: c } })));
  writeFileSync(process.env.GOLD_OUT ?? 'gold-out.txt', lines.join('\n'));
});
