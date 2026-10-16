/**
 * The back office's OWN connection to its region's database — not the game's
 * pool (src/lib/db), and READ-ONLY by Postgres itself: every session opens
 * with `default_transaction_read_only`, so a mistake in a query here can
 * read the game, never write it.
 *
 * Three connections at most: one page asks a dozen aggregate queries at once,
 * and the game keeps the rest of `max_connections`.
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

let _db: PostgresJsDatabase | null = null;

export function db(): PostgresJsDatabase {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be set');
  const client = postgres(url, {
    max: 3,
    idle_timeout: 60,
    connection: { application_name: 'rr-admin', default_transaction_read_only: true },
  });
  _db = drizzle(client);
  return _db;
}
