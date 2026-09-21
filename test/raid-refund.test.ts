/**
 * Reading the burrow pays back (RAID_RUN.STEP_REFUND_AT_FIELD): a raid that
 * reaches the field gets its steps' energy back into the one tank, a trap's
 * drain never, and a raid that dies short of the field gets nothing. And the
 * one tank's "keep a raid's worth" play is SAID where the decision is made:
 * the coach line on the island, the recap line at home, the RAID slab's pop.
 *
 * Asserted against the sources: these are rendering conditions and a
 * settlement order, not values.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RAID_RUN } from '../config/tuning';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const ROUTE = read('../src/app/api/raid/route.ts');

describe('the walk comes back at the field', () => {
  it('refunds the steps only when the field is reached, never a trap', () => {
    expect(RAID_RUN.STEP_REFUND_AT_FIELD).toBeGreaterThan(0);
    expect(ROUTE).toMatch(/const refunded = reachedField\s*\?\s*Math\.round\(\(visited\.length - 1\) \* RAID_RUN\.STEP_COST \* RAID_RUN\.STEP_REFUND_AT_FIELD\)\s*:\s*0;/);
    expect(ROUTE).not.toMatch(/refunded[^;]*TRAPS\.DRAIN/);
    expect(ROUTE).toMatch(/if \(refunded > 0\) await payEnergy\(session\.sub, \{ cost: -refunded, need: 0, floor: true \}\);/);
  });

  it('pays the refund before the view that carries the tank home', () => {
    const paid = ROUTE.indexOf('if (refunded > 0) await payEnergy');
    const view = ROUTE.indexOf('raid: await raidView(run.id', paid);
    expect(paid).toBeGreaterThan(-1);
    expect(view).toBeGreaterThan(paid);
    expect(ROUTE).toMatch(/outcome: \{\s*reachedField,\s*refunded,/);
  });
});

describe('a raid in what came home is said', () => {
  it('on the island, once, when the bar crosses the raid line on the way down', () => {
    const COACH = read('../src/components/energy-coach.tsx');
    expect(COACH).toMatch(/const RAID_FLOOR = RAID_RUN\.TOLL \+ RAID_RUN\.WALK_FLOOR \* RAID_RUN\.STEP_COST;/);
    expect(COACH).toMatch(/was > RAID_FLOOR && energy <= RAID_FLOOR && energy > ENERGY\.BOMB_LOSS \? 'raid'/);
    expect(COACH).toMatch(/low === 'raid' \? t\.run\.energyRaidLeft : t\.run\.energyLow/);
  });

  it('on the recap, beside the bar at home, and the RAID slab pops on landing', () => {
    expect(read('../src/components/run-recap.tsx')).toMatch(/bank\.energy >= RAID_RUN\.TOLL \+ RAID_RUN\.WALK_FLOOR \* RAID_RUN\.STEP_COST && \([\s\S]{0,200}t\.recap\.raidLeft\(bank\.energy\)/);
    const BAR = read('../src/components/loop-bar.tsx');
    expect(BAR).toMatch(/const canRaid = dig\.energy >= RAID_RUN\.TOLL \+ RAID_RUN\.WALK_FLOOR \* RAID_RUN\.STEP_COST && raid\.open > 0;/);
    expect(BAR).toMatch(/readyKey\.raid/);
    // The bar mounts on the burrow only, so the landing itself is the trigger: what came home, keyed per run.
    expect(BAR).toMatch(/if \(!broughtHome \|\| !canRaid\) return;\s*setReadyKey\(\(k\) => \(\{ \.\.\.k, raid: k\.raid \+ 1 \}\)\);/);
  });
});
