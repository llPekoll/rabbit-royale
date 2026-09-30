/**
 * THE RAID MATRIX — how much defence stops a raider, on today's numbers.
 *
 *   bun run tools/raid-matrix.sim.ts [--n 200]
 *
 * Offline, on the real burrow generator and the real raid rules (the steps a
 * fence allows, the clue a bomb writes, the drain, the stake, the loot by
 * depth). For each count of bombs and planks, N burrows are raided by a
 * raider who reads the clues, and the table says how often the field is
 * reached, how far the raid got, what it cost the raider's tank and what
 * share of the maximum haul it took.
 *
 * Two defenders: SMART buries on the crossing's chokepoints and stands planks
 * where they lengthen the shortest way in; RANDOM buries anywhere past the
 * doorstep, the way a new player does. Two raiders: READER deduces from the
 * numbers, BLIND walks the shortest way. Report: tools/raid-matrix.md
 */
import { writeFileSync } from 'node:fs';
import { RAID_RUN, TRAPS, FENCES } from '../config/tuning';
import { mulberry32 } from '../src/lib/game/rng';
import { crossing, standPlanks, buryBombs, raid, setLootAtField } from './raid-matrix-core';

const N = Number(process.argv[process.argv.indexOf('--n') + 1]) || 200;
const PLANKS = [0, 3, 6, 10];
/** Loot paid only on the field (variant C): a raid that dies pays 15 % + 25 % of its depth. */

/**
 * The variants tested against today's numbers. Each is a set, moved together.
 *   A — bombs that bite: a bomb drains 15, so two on the way end a 30 walk.
 *   B — more bombs: 12 standing (enough to wall most burrows) at 12 each.
 *   C — loot on the field: 12 a bomb, and a raid that dies short takes 15-40 %.
 */
type Variant = { name: string; drain: number; maxPlaced: number; lootAtField: boolean; walk?: number };
/** VARIANTS='[{"name":"D","drain":12,"maxPlaced":8,"lootAtField":false,"walk":20}]' replaces the list; `walk` sets the stake as toll + walk. */
const VARIANTS: Variant[] = process.env.VARIANTS ? JSON.parse(process.env.VARIANTS) : [
  { name: 'ACTUEL', drain: 8, maxPlaced: 8, lootAtField: false },
  { name: 'A · bombe à 15', drain: 15, maxPlaced: 8, lootAtField: false },
  { name: 'B · 12 bombes à 12', drain: 12, maxPlaced: 12, lootAtField: false },
  { name: 'C · bombe à 12 + butin au champ', drain: 12, maxPlaced: 8, lootAtField: true },
];

const rand = mulberry32(7);
const seeds = Array.from({ length: N }, (_, i) => `matrix-${i}-${Math.floor(rand() * 1e9).toString(36)}`);
const base = seeds.map((s) => crossing(s, []));
const lines: string[] = [];
lines.push(`# Raid matrix — ${N} burrows, ${new Date().toISOString().slice(0, 10)}`);
lines.push('');
lines.push(`Walk ${RAID_RUN.STAKE - RAID_RUN.TOLL} (stake ${RAID_RUN.STAKE} − toll ${RAID_RUN.TOLL}), step ${RAID_RUN.STEP_COST}. Crossing without planks: ${Math.min(...base)}–${Math.max(...base)} steps, mean ${(base.reduce((a, b) => a + b, 0) / N).toFixed(1)}.`);
lines.push('Cell: field reached · share of the max haul · energy the raid cost the tank.');
const results: any[] = [];

function cell(k: number, m: number, smart: boolean, reader: boolean) {
  let reached = 0, loot = 0, spent = 0;
  for (const s of seeds) {
    const r2 = mulberry32(s.length * 31 + k * 7 + m);
    const fenced = standPlanks(s, m, smart, r2);
    const mined = buryBombs(s, k, fenced, smart, r2);
    const o = raid(s, fenced, mined, reader, r2);
    if (o.reached) reached++; loot += o.lootShare; spent += o.spent;
  }
  return { reached: reached / N, loot: loot / N, spent: spent / N };
}
const fmt = (c: { reached: number; loot: number; spent: number }) => `${Math.round(c.reached * 100)}% · ${Math.round(c.loot * 100)}% · ${Math.round(c.spent)}⚡`;

for (const v of VARIANTS) {
  (TRAPS as any).DRAIN = v.drain; (TRAPS as any).MAX_PLACED = v.maxPlaced; setLootAtField(v.lootAtField);
  (RAID_RUN as any).STAKE = RAID_RUN.TOLL + (v.walk ?? 30);
  const bombs = [0, 3, 5, 8, ...(v.maxPlaced > 8 ? [v.maxPlaced] : [])];
  lines.push('', `## ${v.name} — walk ${RAID_RUN.STAKE - RAID_RUN.TOLL}, drain ${v.drain}, ${v.maxPlaced} bombs max${v.lootAtField ? ', loot on the field' : ''}`);
  // The three burrows a player actually has: the starting kit, a week in, all in.
  const kits = [
    { name: 'kit de départ (3 bombes, 3 planches)', k: 3, m: 3 },
    { name: 'une semaine (5 bombes, 6 planches)', k: 5, m: 6 },
    { name: `tout (${v.maxPlaced} bombes, 10 planches)`, k: v.maxPlaced, m: 10 },
  ];
  lines.push('', '| terrier | défenseur malin, pillard lecteur | défenseur malin, pillard à l’aveugle | défenseur au hasard, pillard lecteur |', '| --- | --- | --- | --- |');
  for (const kit of kits) {
    const a = cell(kit.k, kit.m, true, true), b = cell(kit.k, kit.m, true, false), c = cell(kit.k, kit.m, false, true);
    results.push({ variant: v.name, kit: kit.name, smartReader: a, smartBlind: b, randomReader: c });
    lines.push(`| ${kit.name} | ${fmt(a)} | ${fmt(b)} | ${fmt(c)} |`);
  }
  lines.push('', '| bombes \\ planches (malin, lecteur) | ' + PLANKS.join(' | ') + ' |', '| --- |' + PLANKS.map(() => ' --- |').join(''));
  for (const k of bombs) lines.push(`| ${k} | ${PLANKS.map((m) => fmt(cell(k, m, true, true))).join(' | ')} |`);
  console.log(lines.slice(-bombs.length - 8).join('\n'));
}
const OUT_NAME = process.env.MATRIX_OUT ?? 'raid-matrix';
writeFileSync(new URL(`./${OUT_NAME}.md`, import.meta.url).pathname, lines.join('\n') + '\n');
writeFileSync(new URL(`./${OUT_NAME}.json`, import.meta.url).pathname, JSON.stringify(results, null, 1));
void FENCES;
