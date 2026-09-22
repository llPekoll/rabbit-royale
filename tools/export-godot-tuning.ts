/**
 * THE DESIGN NUMBERS, EXPORTED FOR GODOT.
 *
 *   bun tools/export-godot-tuning.ts
 *
 * Writes godot/assets/tuning.json: every `export const` table of
 * config/tuning.ts that JSON can carry, under its own name. The chrome reads
 * a lot of them — the energy cap on the pill, the raid floor on the loop bar,
 * the island tiers on the picker — and the README's rule is that nothing is
 * hardcoded elsewhere. This keeps the Godot client inside that rule: the
 * numbers live in one file on the web, and this is a build artefact of it,
 * committed so a fresh Godot checkout needs no bun.
 *
 * Functions (`upgradeCost`, `regenPerHour`) are not data; the two the chrome
 * needs are ported by hand in godot/scripts/tuning.gd, next to the loader.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as tuning from '../config/tuning';

const OUT = join((import.meta as ImportMeta & { dir: string }).dir, '..', 'godot', 'assets', 'tuning.json');

function plain(value: unknown): unknown {
  if (typeof value === 'function') return undefined;
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const p = plain(v);
      if (p !== undefined) out[k] = p;
    }
    return out;
  }
  return value;
}

const tables: Record<string, unknown> = {};
for (const [name, value] of Object.entries(tuning)) {
  if (typeof value === 'function') continue;
  tables[name] = plain(value);
}

mkdirSync(join(OUT, '..'), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(tables, null, 1)}\n`);
console.log(`${Object.keys(tables).length} tables written to ${OUT}`);
