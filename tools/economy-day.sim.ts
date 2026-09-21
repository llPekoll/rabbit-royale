/**
 * A PLAYER'S DAY, against the targets the economy was designed to — with run
 * income MEASURED by the robot players (sim-dig-core.ts) rather than modelled.
 *
 *   ECON_OUT=/tmp/day.txt npx vitest run -c tools/vitest.sim.config.ts tools/economy-day.sim.ts
 *   ECON_SETS='[{"name":"try","RUN.CARROT_VALUE":5}]'   dotted tuning paths to override
 *
 * The targets are Peko's, lifted from docs/economy-tuning.html so the two
 * cannot drift: runs 20-70 % of income, raids 10-50 %, a shield within 4 days
 * of income, burrow level 5 within 14, the three island doors on days 3, 8 and
 * 14, and a carrot-bought refill that does not print money.
 *
 * Three players: CASUAL (one visit a day, never places an X, no raid),
 * REGULAR (three visits — the player the page models — halfway between no X
 * and a reader, one raid), ENGAGED (four visits, reads and probes, three
 * raids). ONE TANK (21 September 2026): a visit finds what the regen put back
 * since the last one, a raid takes its toll and walk out of it first, and a
 * run spends the rest — a run ends at zero, so the day's energy is the day's
 * runs. What differs from the page is only the run: there it is a rabbit
 * digging blind (21 tiles, 120 carrots); here it is played.
 */
import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as T from '../config/tuning';
import { mulberry32 } from '../src/lib/game/rng';
import { mut, play, type Policy } from './sim-dig-core';

const N = Number(process.env.ECON_N ?? 8);

function setPath(path: string, value: number) {
  const keys = path.split('.');
  let o: Record<string, unknown> = T as unknown as Record<string, unknown>;
  for (const k of keys.slice(0, -1)) o = o[k] as Record<string, unknown>;
  (mut(o) as Record<string, unknown>)[keys[keys.length - 1]] = value;
}

function runIncome(): Record<string, Record<Policy, number>> {
  const out: Record<string, Record<Policy, number>> = {};
  for (const tier of T.ISLAND_TIERS) {
    out[tier.name] = {} as Record<Policy, number>;
    for (const policy of ['walker', 'reader', 'prober'] as const) {
      const rand = mulberry32(11);
      let sum = 0;
      for (let k = 0; k < N; k++) sum += play(`day-${tier.name}-${k}`, tier.minLifetime, policy, rand).carrots;
      out[tier.name][policy] = sum / N;
    }
  }
  return out;
}

test('a day', () => {
  const sets = JSON.parse(process.env.ECON_SETS ?? '[{"name":"live"}]') as Array<Record<string, number | string>>;
  const lines: string[] = [];
  const f = (n: number, d = 0) => n.toLocaleString('en-US', { maximumFractionDigits: d });
  for (const set of sets) {
    const restore: Array<[string, number]> = [];
    for (const [k, v] of Object.entries(set)) if (k !== 'name') {
      const keys = k.split('.'); let o: any = T; for (const p of keys.slice(0, -1)) o = o[p];
      restore.push([k, o[keys[keys.length - 1]]]); setPath(k, v as number);
    }
    const income = runIncome();
    const gardenHour = (level: number) => T.GARDEN.YIELD_PER_HOUR_BASE + T.GARDEN.YIELD_PER_LEVEL * (level - 1);
    const levelOn: Record<string, number> = { Meadow: 1, Thicket: 3, Ashland: 5, Caldera: 8 };
    lines.push(`\n## ${set.name}   carrot ${T.RUN.CARROT_VALUE}, golden ${T.RUN.GOLDEN_VALUE}, refill ${T.SHOP.PRICES.energy}, upgrade base ${T.BURROW.UPGRADE_BASE_COST}`);
    lines.push('run income (no X / reads / reads+probes):');
    for (const t of T.ISLAND_TIERS) lines.push(`  ${t.name.padEnd(8)} ${f(income[t.name].walker).padStart(6)} ${f(income[t.name].reader).padStart(6)} ${f(income[t.name].prober).padStart(6)}`);

    const day = (tier: string, kind: 'casual' | 'regular' | 'engaged') => {
      const i = income[tier];
      const perRun = kind === 'casual' ? i.walker : kind === 'regular' ? (i.walker + i.reader) / 2 : i.prober;
      // ONE TANK. Visits find at most a full tank, and the day's regen is the
      // ceiling on all of them; a raid (toll, a ten-step walk, one trap) is
      // paid out of it first and the runs are what is left, in tanks — a run
      // is a whole tank because it ends at zero. `perRun` is measured on a
      // full tank, so a part-tank run pays pro rata.
      const visits = kind === 'casual' ? 1 : kind === 'regular' ? 3 : 4;
      const raidCount = kind === 'casual' ? 0 : kind === 'regular' ? 1 : 3;
      const raidEnergy = Math.min(T.RAID_RUN.STAKE, T.RAID_RUN.TOLL + 10 * T.RAID_RUN.STEP_COST + T.TRAPS.DRAIN);
      const energyDay = Math.min(visits * T.ENERGY.MAX, T.OUT_OF_RUN_ENERGY.REGEN_PER_HOUR * 24);
      const runs = Math.max(0, energyDay - raidCount * raidEnergy) / T.ENERGY.MAX;
      const gardenHours = kind === 'casual' ? T.GARDEN.CAP_HOURS : 24;
      const garden = gardenHour(levelOn[tier]) * gardenHours;
      // A raid on a REGULAR of the same tier: a day and a half in stock, half a garden.
      const victimDay = 4 * (i.walker + i.reader) / 2 + gardenHour(levelOn[tier]) * 24;
      const depth = (T.RAID_RUN.MIN_LOOT_FRACTION + 1) / 2 + 0.2;
      const share = (T.RAID_RUN.LOOT_SHARE + T.RAID_RUN.LOOT_SHARE_MIN) / 2;
      const haul = Math.min(T.RAID.LOOT_CAP,
        Math.max(0, victimDay * 1.5 - T.RAID.SAFE_FLOOR) * share * depth
        + gardenHour(levelOn[tier]) * T.GARDEN.CAP_HOURS * 0.5 * T.RAID.GARDEN_LOOT_SHARE * depth);
      const raids = raidCount * haul;
      const total = runs * perRun + garden + raids;
      return { runs: runs * perRun, garden, raids, total, perRun, haul };
    };

    lines.push(`a day at ${T.OUT_OF_RUN_ENERGY.REGEN_PER_HOUR}/h, ${T.OUT_OF_RUN_ENERGY.REGEN_PER_HOUR * 24} energy (runs / garden / raids = total; share of runs, garden, raids):`);
    for (const kind of ['casual', 'regular', 'engaged'] as const) for (const t of ['Meadow', 'Caldera']) {
      const d = day(t, kind);
      lines.push(`  ${kind.padEnd(8)} ${t.padEnd(8)} ${f(d.runs).padStart(6)} / ${f(d.garden).padStart(5)} / ${f(d.raids).padStart(5)} = ${f(d.total).padStart(6)}   ${f(100 * d.runs / d.total)} % · ${f(100 * d.garden / d.total)} % · ${f(100 * d.raids / d.total)} %`);
    }

    const reg = day('Meadow', 'regular');
    const check = (ok: boolean, text: string) => lines.push(`  ${ok ? 'OK ' : '!! '} ${text}`);
    lines.push('targets, for the REGULAR on Meadow:');
    const rs = reg.runs / reg.total, ra = reg.raids / reg.total;
    check(rs >= 0.2 && rs <= 0.7, `runs are ${f(100 * rs)} % of income (20-70)`);
    check(ra >= 0.1 && ra <= 0.5, `raids are ${f(100 * ra)} % of income (10-50)`);
    check(reg.perRun >= reg.haul * 0.4 && reg.perRun <= reg.haul * 2.5, `a run (${f(reg.perRun)}) against a raid (${f(reg.haul)}) and a garden visit (${f(gardenHour(1) * T.GARDEN.CAP_HOURS)}): similar weight`);
    check(T.SHOP.PRICES.shield / reg.total <= 4, `a shield is ${f(T.SHOP.PRICES.shield / reg.total, 1)} days of income (4 at most)`);
    // ONE TANK: a refill is a full tank, and a run ends at zero (no robot ever
    // finishes with fuel left — the table at the top of tuning.ts), so a run
    // spends the whole tank whatever the X gives back along the way.
    const RUN_SPEND = T.ENERGY.MAX;
    const runsBought = T.ENERGY_PACK.AMOUNT / RUN_SPEND;
    const ratio = T.SHOP.PRICES.energy / (runsBought * reg.perRun);
    check(ratio >= 0.9, `a carrot refill costs ${f(T.SHOP.PRICES.energy)} and buys ${f(runsBought)} runs worth ${f(runsBought * reg.perRun)}: ${f(ratio, 2)}x (0.9 at least, or it prints carrots)`);
    // Two raids get through in a day (SHIELD_AFTER_RAID_MS), each at full depth
    // and the top of the share band, on a day and a half of stock and a full garden.
    const worstRaid = Math.min(T.RAID.LOOT_CAP,
      Math.max(0, reg.total * 1.5 - T.RAID.SAFE_FLOOR) * T.RAID_RUN.LOOT_SHARE
      + gardenHour(1) * T.GARDEN.CAP_HOURS * T.RAID.GARDEN_LOOT_SHARE);
    check(2 * worstRaid <= reg.total * 0.5, `worst day as a victim: ${f(2 * worstRaid)} lost of ${f(reg.total)} earned (half at most)`);
    let cum = 0; const toLevel: Record<number, number> = {};
    for (let l = 1; l < T.BURROW.MAX_LEVEL; l++) { cum += T.upgradeCost(l); toLevel[l + 1] = cum; }
    check(toLevel[5] / reg.total <= 14 && toLevel[5] / reg.total >= 1.5, `burrow level 5 costs ${f(toLevel[5])} in all: ${f(toLevel[5] / reg.total, 1)} days (1.5-14); level 10: ${f(toLevel[10] / reg.total)} days`);

    // The doors: walk the ladder a day at a time as the regular.
    let life = 0, dayN = 0; const opened: string[] = [];
    const want: Record<string, number> = { Thicket: 3, Ashland: 8, Caldera: 14 };
    while (dayN < 60 && opened.length < 3) {
      dayN++; life += day(T.tierFor(life).name, 'regular').total;
      const now = T.tierFor(life).name;
      if (now !== 'Meadow' && !opened.includes(now)) { opened.push(now); check(Math.abs(dayN - want[now]) <= Math.max(1, want[now] * 0.25), `${now} opens on day ${dayN} (wanted ${want[now]})`); }
    }
    // Where the doors WOULD have to be for days 3, 8 and 14, walking the same ladder
    // but crossing on the wanted day rather than at the configured threshold.
    {
      let l = 0; const doors: number[] = []; const order = ['Meadow', 'Thicket', 'Ashland', 'Caldera'];
      for (let d = 1; d <= 14; d++) {
        const tier = d <= 3 ? 0 : d <= 8 ? 1 : 2;
        l += day(order[tier], 'regular').total;
        if (d === 3 || d === 8 || d === 14) doors.push(l);
      }
      lines.push(`  ->  doors for days 3 / 8 / 14: ${doors.map((x) => f(Math.round(x / 500) * 500)).join(' / ')}  (configured: ${T.ISLAND_TIERS.slice(1).map((t) => f(t.minLifetime)).join(' / ')})`);
    }
    for (const [k, v] of restore) setPath(k, v);
  }
  writeFileSync(process.env.ECON_OUT ?? 'economy-day.txt', lines.join('\n'));
});
