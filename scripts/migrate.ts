/**
 * APPLY THE MIGRATIONS of `drizzle/` — the regional servers' `bun db:migrate`.
 *
 * The regions (deploy/region) have no toolchain: the image carries one
 * compiled binary, not drizzle-kit and its node_modules. So Dockerfile.ws
 * compiles this file into a second binary, `./migrate`, and copies `drizzle/`
 * beside it; the compose runs it once before the server starts.
 *
 * Same journal, same `drizzle.__drizzle_migrations` table as drizzle-kit, so
 * a database migrated by one is up to date for the other. Never a push.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL must be set');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(sql), { migrationsFolder: process.env.MIGRATIONS_DIR ?? './drizzle' });
  console.log('[migrate] up to date');
} catch (e) {
  console.error('[migrate] failed:', e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
