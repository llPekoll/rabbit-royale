/**
 * The default defence (lib/game/default-defence), for the burrows that were
 * made before it — written as SQL, because the prod bases are only reached
 * through `psql` over SSH (no published port, no bun in the ws image).
 *
 *   ... psql -tA -c "$CANDIDATES" | bun run scripts/default-defence-backfill.ts > out.sql
 *
 * Reads one JSON object per line, `{"id": "...", "edits": {...} | null}` —
 * the players with no bomb and no plank standing, and their arrangement
 * (`burrow_edits`): the layout is grown on the ground the owner laid out, as
 * a bomb they buried themselves would be. Writes one transaction that places
 * the defence only where there is STILL nothing standing when it runs, so a
 * player who buried a bomb between the export and the import keeps theirs,
 * and running it twice places nothing the second time.
 *
 * `--redo` (2026-10-09) lays the CURRENT default again over the burrows still
 * holding an untouched earlier one — the first backfill bunched every bomb
 * against the potager. Untouched means exactly DEFAULT_DEFENCE.BOMBS bombs and
 * PLANKS planks, all placed in the one instant (the backfill's transaction):
 * a bomb lifted, moved or added by the owner breaks that, and their burrow
 * is theirs.
 *
 *   bun run scripts/default-defence-backfill.ts --query [--redo]   # the candidates' SELECT
 *
 * Driven by scripts/default-defence-backfill.sh, one region at a time.
 */
import { readFileSync } from 'node:fs';
import { setBurrowEdits } from '../src/game/burrow/board';
import { DEFAULT_DEFENCE, defaultDefence } from '../src/lib/game/default-defence';

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const redo = process.argv.includes('--redo');

/** Which burrows, as a SQL condition on player `p` — the export and the apply ask the same. */
const target = (p: string) => redo
  ? `(SELECT count(*) FROM traps t WHERE t.owner_id = ${p}) = ${DEFAULT_DEFENCE.BOMBS}
     AND (SELECT count(*) FROM fences f WHERE f.owner_id = ${p}) = ${DEFAULT_DEFENCE.PLANKS}
     AND (SELECT count(DISTINCT x.placed_at) FROM (
           SELECT placed_at FROM traps WHERE owner_id = ${p}
           UNION ALL SELECT placed_at FROM fences WHERE owner_id = ${p}) x) = 1`
  : `NOT EXISTS (SELECT 1 FROM traps t WHERE t.owner_id = ${p})
     AND NOT EXISTS (SELECT 1 FROM fences f WHERE f.owner_id = ${p})`;

if (process.argv.includes('--query')) {
  console.log(`SELECT json_build_object('id', p.id, 'edits', p.burrow_edits) FROM players p WHERE ${target('p.id')};`);
  process.exit(0);
}

const lines = readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
const out: string[] = [
  'BEGIN;',
  'CREATE TEMP TABLE dd_plan (owner_id text, kind text, tile int, side text) ON COMMIT DROP;',
];
let players = 0, bombs = 0, planks = 0;
for (const line of lines) {
  const { id, edits } = JSON.parse(line) as { id: string; edits: unknown };
  setBurrowEdits(id, (edits ?? null) as never);
  const d = defaultDefence(id);
  setBurrowEdits(id, null);
  const rows = [
    ...d.bombs.map((t) => `(${q(id)}, 'bomb', ${t}, NULL)`),
    ...d.planks.map((p) => `(${q(id)}, 'plank', ${p.tile}, ${q(p.side)})`),
  ];
  if (!rows.length) continue;
  out.push(`INSERT INTO dd_plan VALUES ${rows.join(', ')};`);
  players++; bombs += d.bombs.length; planks += d.planks.length;
}
out.push(
  // Only the burrows still bare NOW, and not one being walked by a raider:
  // the raider is reading clues measured on the floor as it was.
  `CREATE TEMP TABLE dd_bare ON COMMIT DROP AS
     SELECT DISTINCT owner_id FROM dd_plan p
     WHERE ${target('p.owner_id')}
       AND NOT EXISTS (SELECT 1 FROM raid_runs r WHERE r.defender_id = p.owner_id AND r.ended_at IS NULL);`,
  ...(redo ? [
    'DELETE FROM traps WHERE owner_id IN (SELECT owner_id FROM dd_bare);',
    'DELETE FROM fences WHERE owner_id IN (SELECT owner_id FROM dd_bare);',
  ] : []),
  `INSERT INTO traps (owner_id, tile)
     SELECT p.owner_id, p.tile FROM dd_plan p JOIN dd_bare b USING (owner_id) WHERE p.kind = 'bomb'
     ON CONFLICT DO NOTHING;`,
  `INSERT INTO fences (owner_id, tile, side)
     SELECT p.owner_id, p.tile, p.side FROM dd_plan p JOIN dd_bare b USING (owner_id) WHERE p.kind = 'plank'
     ON CONFLICT DO NOTHING;`,
  `SELECT count(*) AS burrows_defended FROM dd_bare;`,
  'COMMIT;',
);
console.log(out.join('\n'));
console.error(`plan: ${players} burrows, ${bombs} bombs, ${planks} planks`);
