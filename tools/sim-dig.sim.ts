/**
 * DIG-LOOP SIMULATOR — three robot players on real generated islands, through
 * the real rules (`resolveMove`, `flagTile`). Not part of the suite: run it with
 *
 *   SIM_OUT=/tmp/sim.txt SIM_SETS='[{"name":"live"}]' npx vitest run -c tools/vitest.sim.config.ts
 *
 * A set names the values to try; anything it leaves out is read from tuning,
 * so `{"name":"live"}` measures the game as it ships.
 *
 * The robots read the board the way a casual player does — one number at a
 * time ("this 2 already has its two bombs", "this 1 has one tile left") — and
 * differ only in what they do with it:
 *
 *   walker   never places an X. Digs what it knows is safe, guesses the rest.
 *   reader   places an X on every bomb it can prove. Never bets an X.
 *   solver   a reader who also compares TWO numbers (the 1-2 pattern: when one
 *            number's unknown tiles all lie inside another's, the difference
 *            is known). Closer to a practised player; what it still has to
 *            guess is close to what the board truly forces.
 *   prober   a solver who, with nothing certain left, places an X on the tile
 *            MOST likely to be a bomb when that is at least a coin-flip — the
 *            X as a probe: wrong costs half a blast and reads the tile.
 *   gambler  never reads: Xs and digs at random among what it can reach.
 */
import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as T from '../config/tuning';
import { mulberry32 } from '../src/lib/game/rng';
import { mut, play, type Policy } from './sim-dig-core';

test('simulate', () => {
  type Set = { name: string; START: number; MAX: number; DIG: number; BOMB: number; GOLDEN: number; GAINS: number[]; LOSS: number; TOUCH: number; FAR: number };
  const live: Omit<Set, 'name'> = {
    START: T.ENERGY.START, MAX: T.ENERGY.MAX, DIG: T.ENERGY.DIG_COST, BOMB: T.ENERGY.BOMB_LOSS,
    GOLDEN: T.ENERGY.GOLDEN_GAIN, GAINS: T.ISLAND_TIERS.map((t) => t.xGain), LOSS: T.FLAG.LOSS,
    TOUCH: T.ISLAND.BOMB_MAX_TOUCHING, FAR: T.RISK_GRADIENT.BOMB.FAR,
  };
  const sets = (JSON.parse(process.env.SIM_SETS ?? '[{"name":"live"}]') as Array<Partial<Set> & { name: string }>)
    .map((s) => ({ ...live, ...s }));
  const N = Number(process.env.SIM_N ?? 12);
  const lines: string[] = [];
  for (const s of sets) {
    Object.assign(mut(T.ENERGY), { START: s.START, MAX: s.MAX, DIG_COST: s.DIG, BOMB_LOSS: s.BOMB, GOLDEN_GAIN: s.GOLDEN });
    Object.assign(mut(T.FLAG), { LOSS: s.LOSS });
    T.ISLAND_TIERS.forEach((t, k) => { mut(t).xGain = s.GAINS[k]; });
    mut(T.ISLAND).BOMB_MAX_TOUCHING = s.TOUCH as 1;
    mut(T.RISK_GRADIENT.BOMB).FAR = s.FAR as 1.5;
    mut(T.RISK_GRADIENT.BOMB).NEAR = (2 - s.FAR) as 0.5;
    lines.push(`\n## ${s.name}  (start ${s.START}, max ${s.MAX}, dig ${s.DIG}, bomb ${s.BOMB}, golden +${s.GOLDEN}, X +${s.GAINS.join('/')} by tier, -${s.LOSS}, touch ${s.TOUCH}, gradient ${(2 - s.FAR).toFixed(1)}-${s.FAR})`);
    for (const tier of T.ISLAND_TIERS.map((t) => t.name)) {
      const lifetime = T.ISLAND_TIERS.find((t) => t.name === tier)!.minLifetime;
      const policies = (process.env.SIM_POLICIES?.split(',') ?? ['walker', 'reader', 'gambler']) as Policy[];
      for (const policy of policies) {
        const rand = mulberry32(7);
        const runs = Array.from({ length: N }, (_, k) => play(`sim-${tier}-${k}`, lifetime, policy, rand));
        const avg = (f: (r: (typeof runs)[number]) => number) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
        lines.push(`${tier.padEnd(8)} ${policy.padEnd(8)} digs ${avg((r) => r.digs).toFixed(0).padStart(4)}  cleared ${(100 * avg((r) => r.cleared)).toFixed(0).padStart(3)}%  died ${(100 * avg((r) => +r.died)).toFixed(0).padStart(3)}%  bombs ${avg((r) => r.bombs).toFixed(1).padStart(5)}  X ok/ko ${avg((r) => r.right).toFixed(0)}/${avg((r) => r.wrong).toFixed(0)} (paid 0: ${avg((r) => r.wasted).toFixed(0)})  guesses ${avg((r) => r.guesses).toFixed(0).padStart(3)}  bar mean ${avg((r) => r.mean).toFixed(0).padStart(3)} low ${avg((r) => r.low).toFixed(0).padStart(3)} full ${(100 * avg((r) => r.atFull)).toFixed(0).padStart(3)}%  carrots ${avg((r) => r.carrots).toFixed(0)}`);
      }
    }
  }
  writeFileSync(process.env.SIM_OUT ?? 'sim-out.txt', lines.join('\n'));
});
