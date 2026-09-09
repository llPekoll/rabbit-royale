/**
 * The database handle — connected LAZILY, on first query.
 *
 * The connection cannot be opened at module load: Next evaluates every route
 * module during `next build` to collect page data, so a top-level `postgres(url)`
 * makes the build itself require a reachable database (and a throw on a missing
 * DATABASE_URL fails the build outright). A Proxy defers both the env check and
 * the connection to the first real query, which is when a database is genuinely
 * needed.
 *
 * `max` is deliberately modest: the WS server is the hot path and it holds
 * island state in memory, so Postgres sees writes at run boundaries, not per
 * move. A larger pool would just queue behind the same few vCPUs.
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

type Db = PostgresJsDatabase<typeof schema>;

let _sql: Sql | null = null;
let _db: Db | null = null;

function connect() {
  if (_db && _sql) return { sql: _sql, db: _db };
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be set');
  _sql = postgres(url, { max: Number(process.env.PG_POOL_MAX ?? 10) });
  _db = drizzle(_sql, { schema });
  return { sql: _sql, db: _db };
}

/** The Drizzle handle. Every property access connects on demand. */
export const db = new Proxy({} as Db, {
  get: (_t, prop) => Reflect.get(connect().db, prop),
});

/** The raw postgres-js client, for the rare query Drizzle cannot express. */
export const sql = new Proxy({} as Sql, {
  get: (_t, prop) => Reflect.get(connect().sql, prop),
  apply: (_t, _this, args: Parameters<Sql>) => connect().sql(...args),
});

export { schema };
