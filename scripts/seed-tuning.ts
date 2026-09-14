/**
 * Fill the `tuning` table from `config/tuning.ts`, in one pass.
 *
 * The point of the table is to change numbers without a deploy, but an empty
 * table is unusable as a control panel: you cannot lower a price you cannot
 * see. This writes every overridable key with the value the build already
 * uses, so the table becomes the full picture — every knob, at its current
 * setting — and changing one is editing a row rather than remembering a path.
 *
 *   DATABASE_URL=... bun run scripts/seed-tuning.ts            # écrit ce qui manque
 *   DATABASE_URL=... bun run scripts/seed-tuning.ts --reset    # remet TOUT au fichier
 *   DATABASE_URL=... bun run scripts/seed-tuning.ts --dry-run  # montre sans écrire
 *   DATABASE_URL=... bun run scripts/seed-tuning.ts --prune    # retire les clés mortes
 *
 * WITHOUT `--reset` IT NEVER TOUCHES A HAND-EDITED ROW. That is the whole
 * design of this script: it is meant to be re-run after every deploy that adds
 * a knob, and a seed that clobbered a live price every time it ran would be a
 * foot-gun rather than a convenience. Rows it wrote itself are marked
 * `seeded`, so a later run may refresh those while leaving anything a human
 * touched exactly where they put it.
 */
import postgres from 'postgres';
import * as FILE from '../config/tuning';
import { OVERRIDABLE, rejectReason } from '../config/overridable';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL must be set');
  process.exit(2);
}

const args = new Set(process.argv.slice(2));
const RESET = args.has('--reset');
const DRY = args.has('--dry-run');
const PRUNE = args.has('--prune');

/** Read one dotted path out of the shipped module. */
function fromFile(path: string): unknown {
  let node: unknown = FILE as unknown as Record<string, unknown>;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const sql = postgres(url, { max: 1 });

try {
  /**
   * The registry is checked against the FILE before anything is written.
   *
   * A path that no longer resolves means a constant was renamed and the
   * registry was not, which would otherwise surface much later as an override
   * that silently does nothing. Better to refuse the whole seed and say which
   * key is wrong.
   */
  const rows: { key: string; value: number; note: string }[] = [];
  const broken: string[] = [];
  for (const spec of OVERRIDABLE) {
    const value = fromFile(spec.path);
    if (typeof value !== 'number') { broken.push(`${spec.path} — introuvable dans config/tuning.ts`); continue; }
    const bad = rejectReason(spec, value);
    if (bad) { broken.push(`${spec.path} = ${value} — ${bad} (les bornes du registre contredisent le fichier)`); continue; }
    rows.push({ key: spec.path, value, note: spec.note });
  }

  if (broken.length) {
    console.error('Le registre et le fichier ne concordent pas :\n' + broken.map((b) => '  - ' + b).join('\n'));
    console.error('\nCorrigez config/overridable.ts (ou tuning.ts) avant de semer.');
    process.exit(1);
  }

  const existing = await sql<{ key: string; value: number; seeded: boolean }[]>`
    select key, value, seeded from tuning
  `;
  const byKey = new Map(existing.map((r) => [r.key, r]));

  const toInsert = rows.filter((r) => !byKey.has(r.key));
  // Refreshed only when the row is still the seed's own and the file moved
  // under it — a deploy that retunes a number should not leave the table
  // quoting the old one back at you.
  const toRefresh = RESET
    ? rows.filter((r) => byKey.has(r.key) && byKey.get(r.key)!.value !== r.value)
    : rows.filter((r) => {
        const cur = byKey.get(r.key);
        return cur && cur.seeded && cur.value !== r.value;
      });
  const handEdited = rows.filter((r) => {
    const cur = byKey.get(r.key);
    return cur && !cur.seeded && cur.value !== r.value;
  });
  const dead = existing.filter((r) => !rows.some((x) => x.key === r.key));

  console.log(`Registre : ${rows.length} clés surchargeables.`);
  console.log(`En base  : ${existing.length} lignes.\n`);

  if (toInsert.length) {
    console.log(`À créer (${toInsert.length}) :`);
    for (const r of toInsert) console.log(`  + ${r.key} = ${r.value}`);
  }
  if (toRefresh.length) {
    console.log(`\nÀ remettre à la valeur du fichier (${toRefresh.length}) :`);
    for (const r of toRefresh) console.log(`  ~ ${r.key} : ${byKey.get(r.key)!.value} -> ${r.value}`);
  }
  if (handEdited.length && !RESET) {
    console.log(`\nModifiées à la main, laissées telles quelles (${handEdited.length}) :`);
    for (const r of handEdited) console.log(`  = ${r.key} : ${byKey.get(r.key)!.value} (fichier : ${r.value})`);
    console.log('  (--reset pour les écraser)');
  }
  if (dead.length) {
    console.log(`\nClés en base qui ne sont plus surchargeables (${dead.length}) :`);
    for (const r of dead) console.log(`  ? ${r.key} = ${r.value}`);
    if (!PRUNE) console.log('  (--prune pour les supprimer ; sans ça elles sont simplement ignorées au chargement)');
  }

  if (!toInsert.length && !toRefresh.length && !(PRUNE && dead.length)) {
    console.log('\nRien à faire.');
    await sql.end();
    process.exit(0);
  }

  if (DRY) {
    console.log('\n--dry-run : rien n\'a été écrit.');
    await sql.end();
    process.exit(0);
  }

  // One transaction: a half-seeded table is a table nobody can reason about.
  await sql.begin(async (tx) => {
    for (const r of toInsert) {
      await tx`
        insert into tuning (key, value, note, seeded)
        values (${r.key}, ${r.value}, ${r.note}, true)
      `;
    }
    for (const r of toRefresh) {
      await tx`
        update tuning
        set value = ${r.value}, note = ${r.note}, seeded = true, updated_at = now()
        where key = ${r.key}
      `;
    }
    if (PRUNE) {
      for (const r of dead) await tx`delete from tuning where key = ${r.key}`;
    }
  });

  console.log(`\nFait : ${toInsert.length} créées, ${toRefresh.length} remises à jour${PRUNE ? `, ${dead.length} supprimées` : ''}.`);
  await sql.end();
} catch (e) {
  console.error('Échec du seed :', e);
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
}
