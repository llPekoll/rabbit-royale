/**
 * Are the repo's migrations all applied to the database it points at?
 *
 * Drift here is SILENT and expensive: the ws server booted fine, logged
 * "listening", passed every health probe — and then threw `column "avatar" does
 * not exist` on the first `join`, so the game was unplayable while looking
 * healthy from the outside. Nothing surfaced it but reading the container logs.
 *
 *   DATABASE_URL=... bun run scripts/check-migrations.ts
 *
 * Exits non-zero when the database is behind, so it can gate a deploy.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL must be set');
  process.exit(2);
}

const journal = JSON.parse(
  readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'),
) as { entries: Array<{ tag: string; when: number }> };

const sql = postgres(url, { max: 1 });

try {
  const applied = await sql<Array<{ hash: string }>>`
    SELECT hash FROM drizzle.__drizzle_migrations
  `.catch(() => []);
  const have = new Set(applied.map((r) => r.hash));

  const missing = journal.entries.filter((e) => {
    const file = new URL(`../drizzle/${e.tag}.sql`, import.meta.url);
    const hash = createHash('sha256').update(readFileSync(file)).digest('hex');
    return !have.has(hash);
  });

  if (missing.length === 0) {
    console.log(`OK: all ${journal.entries.length} migrations applied.`);
  } else {
    console.error(`BEHIND: ${missing.length} migration(s) not applied:`);
    for (const m of missing) console.error(`  - ${m.tag}.sql`);
    console.error('\nRun `bun db:migrate` against this database before deploying.');
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
