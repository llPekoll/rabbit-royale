/**
 * PICK THE BURROW GROUND — the candidates for `BURROW_GROUND`, measured.
 *
 *   bun run tools/burrow-ground-pick.ts [--grounds 300] [--decor 10] [--keep 4]
 *
 * Every burrow is cut from one ground since 2026-09-30, so the ground is a
 * design choice: this finds the ones worth showing. Three passes, cheapest
 * first:
 *   1. every ground `burrow-g<N>`: does it build, how long is the crossing
 *      bare, how much of it is the upper shelf;
 *   2. the survivors, under ten owners' scenery: crossing with and without
 *      ten planks, and how many bombs it takes to wall the field off;
 *   3. the best, raided on the game's own rules (tools/raid-matrix-core.ts)
 *      with the three burrows a player has — the starting kit, a week in,
 *      everything — by a defender who places well and a raider who reads.
 *
 * Targets are the ones the raid tuning of 2026-09-30 was measured against on
 * random grounds (kit ~90 % reached, a week ~75 %, everything ~53 %; crossing
 * ~11; 9-13 bombs to wall), so the settings stay true on the chosen ground.
 * Report: tools/burrow-ground-pick.md, and tools/burrow-ground-pick.json for
 * the preview.
 */
import { writeFileSync } from 'node:fs';
import { buildGround, burrowTerrain, BURROW_COLS, BURROW_ROWS } from '../src/game/burrow/generate';
import {
  primeBurrow, entranceTile, fieldTiles, walkableTiles, isTrappable, isDoorstep,
} from '../src/game/burrow/board';
import { raiderSteps, type FenceSeg } from '../src/game/burrow/fence';
import { levelAt } from '../src/game/island/generate';
import { mulberry32 } from '../src/lib/game/rng';
import { crossing, standPlanks, buryBombs, raid } from './raid-matrix-core';

const arg = (name: string, d: number) => Number(process.argv[process.argv.indexOf(`--${name}`) + 1]) || d;
const GROUNDS = arg('grounds', 300);
const DECOR = arg('decor', 10);
const KEEP = arg('keep', 4);

/** Bombs to cut every route from the door to the field (min vertex cut, unit on minable cells). */
function wallCut(seed: string, fenced: FenceSeg[]): number {
  const field = new Set(fieldTiles(seed));
  const s0 = entranceTile(seed);
  const INF = 1e9;
  const cap = new Map<string, number>();
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string, c: number) => {
    cap.set(`${a}>${b}`, (cap.get(`${a}>${b}`) ?? 0) + c);
    if (!cap.has(`${b}>${a}`)) cap.set(`${b}>${a}`, 0);
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (const t of walkableTiles(seed)) {
    const cuttable = isTrappable(seed, t) && !isDoorstep(seed, t) && !field.has(t) && t !== s0;
    add(`${t}i`, `${t}o`, cuttable ? 1 : INF);
    for (const n of raiderSteps(seed, fenced, t)) add(`${t}o`, `${n}i`, INF);
    if (field.has(t)) add(`${t}o`, 'T', INF);
  }
  const S = `${s0}o`;
  let flow = 0;
  while (flow < 40) {
    const prev = new Map<string, string>([[S, '']]);
    const q = [S];
    while (q.length && !prev.has('T')) {
      const u = q.shift()!;
      for (const v of adj.get(u) ?? []) if (!prev.has(v) && (cap.get(`${u}>${v}`) ?? 0) > 0) { prev.set(v, u); q.push(v); }
    }
    if (!prev.has('T')) break;
    for (let v = 'T'; v !== S;) { const u = prev.get(v)!; cap.set(`${u}>${v}`, cap.get(`${u}>${v}`)! - 1); cap.set(`${v}>${u}`, cap.get(`${v}>${u}`)! + 1); v = u; }
    flow++;
  }
  return flow;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

// ── 1. every ground ──────────────────────────────────────────────────────────
type Cand = { ground: string; bareCrossing: number; shelf: number; land: number; fieldHigh: boolean; side: string; [k: string]: any };
const pass1: Cand[] = [];
for (let g = 1; g <= GROUNDS; g++) {
  const ground = `burrow-g${g}`;
  const built = buildGround(ground);
  if (typeof built === 'string') continue;
  let land = 0, high = 0;
  for (let r = 0; r < BURROW_ROWS; r++) for (let c = 0; c < BURROW_COLS; c++) {
    const l = levelAt(built.map, c, r);
    if (l > 0) land++;
    if (l > 1) high++;
  }
  const e = built.entrance, ec = e % BURROW_COLS, er = Math.floor(e / BURROW_COLS);
  const side = [['N', er], ['S', BURROW_ROWS - 1 - er], ['W', ec], ['E', BURROW_COLS - 1 - ec]].sort((a, b) => (a[1] as number) - (b[1] as number))[0][0] as string;
  const f0 = built.field[0];
  pass1.push({
    ground, bareCrossing: built.crossing, shelf: high / land, land,
    fieldHigh: levelAt(built.map, f0 % BURROW_COLS, Math.floor(f0 / BURROW_COLS)) > 1, side,
  });
}
// A shelf is what gives a route somewhere to hide; a crossing of 10-12 is what the raid was tuned on.
const kept1 = pass1.filter((c) => c.bareCrossing >= 10 && c.bareCrossing <= 12 && c.shelf >= 0.1 && c.shelf <= 0.4);
console.log(`pass 1: ${pass1.length}/${GROUNDS} build, ${kept1.length} with a 10-12 crossing and a shelf`);

// ── 2. under the owners' scenery ─────────────────────────────────────────────
const seedsOf = (ground: string, n: number) => Array.from({ length: n }, (_, i) => {
  const seed = `${ground}#owner-${i}`;
  primeBurrow(seed, burrowTerrain(`owner-${i}`, ground));
  return seed;
});
for (const c of kept1) {
  const seeds = seedsOf(c.ground, DECOR);
  const rand = mulberry32(3);
  c.crossing = mean(seeds.map((s) => crossing(s, [])));
  c.crossingPlanks = mean(seeds.map((s) => crossing(s, standPlanks(s, 10, true, rand))));
  c.cut = mean(seeds.map((s) => wallCut(s, [])));
  c.cutPlanks = mean(seeds.map((s) => wallCut(s, standPlanks(s, 6, true, rand))));
}
const kept2 = kept1
  .filter((c) => c.cut >= 8 && c.cut <= 13)
  .sort((a, b) => Math.abs(a.cut - 10.5) + Math.abs(a.crossing - 11) - (Math.abs(b.cut - 10.5) + Math.abs(b.crossing - 11)))
  .slice(0, 16);
console.log(`pass 2: ${kept2.length} kept for the raids`);

// ── 3. raided ────────────────────────────────────────────────────────────────
const KITS = [{ key: 'kit', k: 3, m: 3, target: 0.9 }, { key: 'week', k: 5, m: 6, target: 0.75 }, { key: 'all', k: 8, m: 10, target: 0.53 }];
for (const c of kept2) {
  const seeds = seedsOf(c.ground, DECOR * 2);
  c.score = 0;
  for (const kit of KITS) {
    let reached = 0, loot = 0;
    for (const s of seeds) {
      const r = mulberry32(s.length * 31 + kit.k * 7 + kit.m);
      const fenced = standPlanks(s, kit.m, true, r);
      const o = raid(s, fenced, buryBombs(s, kit.k, fenced, true, r), true, r);
      if (o.reached) reached++;
      loot += o.lootShare;
    }
    c[kit.key] = { reached: reached / seeds.length, loot: loot / seeds.length };
    c.score += Math.abs(reached / seeds.length - kit.target);
  }
  // Tie-breaks toward a shelf worth looking at.
  c.score += Math.abs(c.shelf - 0.22) * 0.5;
  console.log(`${c.ground}: crossing ${c.crossing.toFixed(1)} cut ${c.cut.toFixed(1)} · kit ${Math.round(c.kit.reached * 100)}% week ${Math.round(c.week.reached * 100)}% all ${Math.round(c.all.reached * 100)}% · score ${c.score.toFixed(2)}`);
}

// Four that are also different from each other: not two with the door on the same side, while that can be helped.
const ranked = [...kept2].sort((a, b) => a.score - b.score);
const picks: Cand[] = [];
for (const c of ranked) if (picks.length < KEEP && !picks.some((p) => p.side === c.side)) picks.push(c);
for (const c of ranked) if (picks.length < KEEP && !picks.includes(c)) picks.push(c);

const pct = (x: number) => `${Math.round(x * 100)} %`;
const md = [
  `# Burrow ground candidates — ${new Date().toISOString().slice(0, 10)}`,
  '',
  `${pass1.length} of ${GROUNDS} grounds build; ${kept1.length} have a bare crossing of 10-12 and a shelf; ${kept2.length} were raided (${DECOR * 2} owners each, placed well, raider reads).`,
  '',
  '| ground | door | crossing | + 10 planks | bombs to wall | shelf | kit reached · loot | week | all |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...picks.map((c) => `| ${c.ground} | ${c.side} | ${c.crossing.toFixed(1)} | ${c.crossingPlanks.toFixed(1)} | ${c.cut.toFixed(1)} | ${pct(c.shelf)} | ${pct(c.kit.reached)} · ${pct(c.kit.loot)} | ${pct(c.week.reached)} · ${pct(c.week.loot)} | ${pct(c.all.reached)} · ${pct(c.all.loot)} |`),
];
writeFileSync(new URL('./burrow-ground-pick.md', import.meta.url).pathname, md.join('\n') + '\n');
writeFileSync(new URL('./burrow-ground-pick.json', import.meta.url).pathname, JSON.stringify({ picks, raided: ranked }, null, 1));
console.log(md.join('\n'));
