/**
 * The database handle. One postgres-js pool per process.
 *
 * `max` is deliberately modest: the WS server is the hot path and it holds
 * island state in memory, so Postgres sees writes at run boundaries, not per
 * move. A large pool here would just queue behind the same 4 vCPUs.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL must be set');

export const sql = postgres(url, { max: Number(process.env.PG_POOL_MAX ?? 10) });
export const db = drizzle(sql, { schema });
export { schema };
