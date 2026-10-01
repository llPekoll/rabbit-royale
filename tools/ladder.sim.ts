/**
 * THE LADDER, MEASURED — robot players on the islands the server deals today
 * (`playLevel`: the level's size, densities and chest count, seats filled),
 * on the one tank, ending the way a run ends now: on the last chest (the island
 * erupts, the fuel left comes home, the rabbit goes up a level) or at zero.
 *
 *   LADDER_OUT=/tmp/ladder.txt npx vitest run -c tools/vitest.sim.config.ts tools/ladder.sim.ts
 *   LADDER_N=12 (islands per cell)  LADDER_PLAYERS=8  LADDER_DAYS=21
 *
 * Two tables:
 *
 *   1. One course per level, landing on a full tank less the crossing. What a
 *      run is on each rung: does it end on the chests or on the bar, what
 *      comes home, what it pays.
 *   2. The climb. A player visits N times a day, finds what the regen put
 *      back since the last visit, and runs courses while the tank holds the
 *      crossing floor (three at most a visit). A clear is a level; a death is
 *      the same level again. Raids are left out (tools/raid-matrix.sim.ts),
 *      so is the shop: this is what the tank alone buys.
 *
 * The pace it is held to is ISLAND_TIERS' (Thicket on day 3, Ashland on day 8,
 * Caldera on day 14): the ladder's levels 4, 6 and 8 carry those islands.
 *
 * The robots head for the chests (`chase`). On a shared level the other seats
 * are robots of the same kind — a full island, the case the server aims for.
 */
import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as T from '../config/tuning';
import { mulberry32 } from '../src/lib/game/rng';
import { playLevel, type Policy } from './sim-dig-core';

const N = Number(process.env.LADDER_N ?? 12);
const PLAYERS = Number(process.env.LADDER_PLAYERS ?? 8);
const DAYS = Number(process.env.LADDER_DAYS ?? 21);
const LAND = T.ENERGY.MAX - T.ENERGY.CROSSING_COST;

test('ladder', () => {
  const lines: string[] = [];
  const f = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d });
  const pc = (n: number) => `${f(100 * n)}%`.padStart(4);

  // 1. One course per level, on a full tank.
  lines.push(`## one course, landing on ${LAND} (bar ${T.ENERGY.MAX} less the crossing ${T.ENERGY.CROSSING_COST}), ${N} islands a cell`);
  lines.push('level tier     seats tiles chests | policy   cleared died  digs  home  carrots');
  const perCourse: Record<number, Record<Policy, number>> = {};
  for (const row of T.RABBIT_LEVELS.LADDER) {
    perCourse[row.level] = {} as Record<Policy, number>;
    for (const policy of ['walker', 'reader', 'prober'] as Policy[]) {
      const rand = mulberry32(7);
      const runs = Array.from({ length: N }, (_, k) =>
        playLevel(row.level, `course-${row.level}-${k}`, Array(row.seats).fill(policy), rand, { start: LAND, chase: true }));
      const me = runs.map((r) => r.rabbits[0]);
      const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
      const cleared = avg(runs.map((r) => +(r.endedByChests && !r.rabbits[0].died)));
      const home = avg(me.map((r) => (r.died ? 0 : r.energy)));
      perCourse[row.level][policy] = avg(me.map((r) => r.carrots));
      lines.push(`${String(row.level).padStart(5)} ${row.tier.padEnd(8)} ${String(row.seats).padStart(5)} ${f(avg(runs.map((r) => r.tiles))).padStart(5)} ${String(row.chests).padStart(6)} | ${policy.padEnd(8)} ${pc(cleared).padStart(7)} ${pc(avg(me.map((r) => +r.died))).padStart(4)} ${f(avg(me.map((r) => r.digs))).padStart(5)} ${f(home).padStart(5)} ${f(perCourse[row.level][policy]).padStart(8)}`);
    }
  }

  // 2. The climb.
  const profiles = [
    { name: 'casual', visits: 1, policy: 'walker' as Policy },
    { name: 'regular', visits: 3, policy: 'reader' as Policy },
    { name: 'engaged', visits: 4, policy: 'prober' as Policy },
  ];
  lines.push(`\n## the climb: ${PLAYERS} players a profile, ${DAYS} days, regen ${T.OUT_OF_RUN_ENERGY.REGEN_PER_HOUR}/h (burrow level 1), floor ${T.ENERGY.MIN_TO_CROSS}, 3 courses a visit at most, no raid, no shop`);
  lines.push('profile  visits policy  | level on day 1 / 3 / 7 / 14 / 21 | day reached: L3 raids  L4 Thicket (3)  L6 Ashland (8)  L8 Caldera (14)  L10 | courses/day  died  carrots/day');
  for (const p of profiles) {
    const levelOn: number[][] = [], reached: Record<number, number[]> = { 3: [], 4: [], 6: [], 8: [], 10: [] };
    let courses = 0, deaths = 0, carrots = 0;
    for (let k = 0; k < PLAYERS; k++) {
      const rand = mulberry32(100 + k);
      let level = 1, tank: number = T.ENERGY.MAX, n = 0;
      const days: number[] = [];
      const gap = 24 / p.visits;
      for (let day = 1; day <= DAYS; day++) {
        for (let v = 0; v < p.visits; v++) {
          if (day > 1 || v > 0) tank = Math.min(T.ENERGY.MAX, tank + T.regenPerHour(1) * gap);
          for (let c = 0; c < 3 && tank >= T.ENERGY.MIN_TO_CROSS; c++) {
            const row = T.levelRow(level);
            const run = playLevel(level, `climb-${p.name}-${k}-${n++}`, Array(row.seats).fill(p.policy), rand,
              { start: tank - T.ENERGY.CROSSING_COST, chase: true });
            const me = run.rabbits[0];
            courses++; carrots += me.carrots;
            if (me.died) { deaths++; tank = 0; continue; }
            tank = me.energy;
            if (run.endedByChests) {
              level = Math.min(T.RABBIT_LEVELS.MAX, level + 1);
              for (const l of [3, 4, 6, 8, 10]) if (level === l && reached[l].length <= k) reached[l][k] = day;
            }
          }
        }
        days.push(level);
      }
      levelOn.push(days);
    }
    const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
    const at = (d: number) => f(mean(levelOn.map((ds) => ds[Math.min(d, DAYS) - 1])), 1);
    const when = (l: number) => {
      const got = reached[l].filter((x) => x !== undefined);
      return got.length ? `${f(mean(got), 1)}${got.length < PLAYERS ? ` (${got.length}/${PLAYERS})` : ''}` : 'never';
    };
    lines.push(`${p.name.padEnd(8)} ${String(p.visits).padStart(6)} ${p.policy.padEnd(7)} | ${[1, 3, 7, 14, 21].map(at).join(' / ').padEnd(32)} | ${when(3).padEnd(8)} ${when(4).padEnd(16)} ${when(6).padEnd(16)} ${when(8).padEnd(17)} ${when(10).padEnd(5)} | ${f(courses / PLAYERS / DAYS, 1).padStart(11)} ${pc(deaths / Math.max(1, courses))} ${f(carrots / PLAYERS / DAYS).padStart(12)}`);
  }

  // 3. The refill against what a course pays.
  lines.push(`\n## the refill: ${f(T.SHOP.PRICES.energy)} carrots for ${f(T.ENERGY_PACK.AMOUNT)} energy`);
  for (const l of [1, 3, 5, 7, 10]) {
    const c = perCourse[l];
    lines.push(`  level ${String(l).padStart(2)}: a full course pays ${f(c.walker)} / ${f(c.reader)} / ${f(c.prober)} (walker / reader / prober) -> refill = ${f(T.SHOP.PRICES.energy / Math.max(1, (c.walker + c.reader) / 2), 2)}x the middle player's course`);
  }
  writeFileSync(process.env.LADDER_OUT ?? 'ladder.txt', lines.join('\n'));
});
