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

import { burrowFor } from '../src/game/burrow/board';
import { levelAt } from '../src/game/island/generate';
import { burrowBuilding } from '../src/game/burrow/buildings';

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
  };
});

const file = join(import.meta.dir, '..', 'godot', 'tools', 'burrow_fixture.json');
writeFileSync(file, JSON.stringify(out) + '\n');
console.log(`wrote ${out.length} burrows -> ${file}`);
