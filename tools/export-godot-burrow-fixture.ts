/**
 * A FEW BURROWS, AS THE SERVER GROWS THEM — for Godot.
 *
 *   bun tools/export-godot-burrow-fixture.ts
 *
 * Writes godot/tools/burrow_fixture.json, which `godot/tools/verify_burrow_layout.gd`
 * compares cell by cell against the GDScript port of `burrowTerrain`
 * (burrow_layout.gd). A trap is a tile INDEX the server checks against its own
 * burrow, so the Godot board has to be that burrow to the cell.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { burrowFor, setBurrowEdits } from '../src/game/burrow/board';
import { editBurrow, burrowIndex, givesWay, type BurrowEdits } from '../src/game/burrow/generate';
import { levelAt } from '../src/game/island/generate';
import { burrowBuilding, houseTile } from '../src/game/burrow/buildings';

const SEEDS = [
  'b3f1c2a4-0000-4000-8000-000000000001',
  '7d2e9c10-5a3b-4c7e-9f11-2b8d6e4a9c03',
  'guest-42',
  'burrow',
  'e0a1f2b3-c4d5-4e6f-8a9b-0c1d2e3f4a5b',
  'paul',
];
const LETTER = { ground: 'g', blocked: '.', entrance: 'E', field: 'F', doorstep: 'd' } as const;

const out = SEEDS.map((seed) => {
  const b = burrowFor(seed);
  let levels = '';
  for (let r = 0; r < b.map.height; r++) for (let c = 0; c < b.map.width; c++) levels += levelAt(b.map, c, r);
  return {
    seed,
    levels,
    cells: b.cells.map((k) => LETTER[k]).join(''),
    entrance: b.entrance,
    field: b.field,
    doorstep: b.doorstep,
    crossing: b.crossing,
    placements: b.placements.map((p) => `${p.kind}:${p.x},${p.y}:${p.variant}`),
    building: (({ x, y }) => ({ x, y }))(burrowBuilding(seed, 1)),
    edits: editCases(seed),
  };
});

/**
 * REARRANGEMENTS, judged by the server's `editBurrow`: a spread of field
 * shifts and thing moves, each with the refusal it gets or the ground it
 * yields. The editor in Godot lights cells from its own port of the rule, so
 * the two have to agree on every one of these — including on WHICH refusal.
 */
function editCases(seed: string) {
  const base = burrowFor(seed);
  const tries: BurrowEdits[] = [{}];
  for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, -1], [-2, 2], [3, 0], [0, -3], [9, 9]]) {
    tries.push({ field: [d[0], d[1]] });
  }
  const things = base.placements.slice(0, 4).map((p) => burrowIndex(p.x, p.y));
  for (const [i, from] of things.entries()) {
    for (const to of [base.entrance, base.field[0], (from + 1) % 361, (from + 19 * (i + 2)) % 361, base.doorstep.at(-1) ?? 0]) {
      tries.push({ moves: [[from, to]] });
    }
  }
  // The house, on four cells: where it stands, a step aside, on the door,
  // on the field, and across the rim.
  const home = burrowBuilding(seed, 1);
  const at = burrowIndex(home.x, home.y);
  for (const house of [at, at + 1, at - 19, base.entrance, base.field[0], 18]) tries.push({ house });
  tries.push({ field: [1, 0], moves: things.slice(0, 2).map((from, i) => [from, (from + 20 + i) % 361] as [number, number]) });
  // GROUND CLUTTER GIVES WAY: solid things, the house and the field set down
  // on bushes and props — and a bush the owner moved, which does not.
  const solid = base.placements.filter((p) => !givesWay(p.kind)).map((p) => burrowIndex(p.x, p.y));
  const clutter = base.placements.filter((p) => givesWay(p.kind)).map((p) => burrowIndex(p.x, p.y));
  for (const [i, from] of solid.slice(0, 3).entries()) {
    for (const to of clutter.slice(i * 3, i * 3 + 3)) tries.push({ moves: [[from, to]] });
  }
  for (const house of clutter.slice(0, 4)) tries.push({ house });
  if (solid.length && clutter.length >= 2) {
    tries.push({ moves: [[clutter[0], solid[0]]] });
    tries.push({ moves: [[solid[0], clutter[1]], [clutter[0], clutter[1]]] });
    tries.push({ moves: [[clutter[0], clutter[1]]] });
  }
  return tries.map((edits) => {
    const out = editBurrow(base, edits);
    if (typeof out === 'string') return { edits, refused: out };
    // Where the house ends up — the server buries nothing under it.
    setBurrowEdits(seed, edits);
    const house = houseTile(seed);
    setBurrowEdits(seed, null);
    return {
      edits, cells: out.cells.map((k) => LETTER[k]).join(''), crossing: out.crossing, house,
      // What still stands, and where: the clutter that gave way is gone.
      placements: out.placements.map((p) => `${p.id}:${p.x},${p.y}`),
    };
  });
}

const file = join(import.meta.dir, '..', 'godot', 'tools', 'burrow_fixture.json');
writeFileSync(file, JSON.stringify(out) + '\n');
console.log(`wrote ${out.length} burrows -> ${file}`);
