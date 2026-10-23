/**
 * Round trips per request — the number that decides whether a central database
 * is playable from another continent.
 *
 * A region server talking to a database 170 ms away pays 170 ms per SERIAL
 * query, so a route is as slow as its longest chain of awaits. Queries sent
 * together (Promise.all) cost one trip; a transaction adds two (begin, commit).
 *
 * Off unless `PG_TRACE` is set: then every /api call and every socket handler
 * logs one line, `[db] PATCH /api/raid 9q 812ms ≈7rt`, and with
 * `PG_TRACE=sql` the statements too. The `≈rt` (serial round trips) is the
 * time divided by `PG_TRACE_RTT`, the delay `tools/db-latency-proxy.ts` puts
 * between the server and a local Postgres — the ocean, put back on the desk.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

interface Trace {
  queries: number;
  sql: string[];
}

const store = new AsyncLocalStorage<Trace>();

export const TRACING = !!process.env.PG_TRACE;
const WITH_SQL = process.env.PG_TRACE === 'sql';
const RTT = Number(process.env.PG_TRACE_RTT ?? 0);

/** Run `work` as one traced unit. A plain call when tracing is off. */
export async function traced<T>(label: string, work: () => T | Promise<T>): Promise<T> {
  if (!TRACING) return work();
  const t: Trace = { queries: 0, sql: [] };
  const started = performance.now();
  try {
    return await store.run(t, work);
  } finally {
    if (t.queries > 0) {
      const ms = Math.round(performance.now() - started);
      console.log(`[db] ${label} ${t.queries}q ${ms}ms${RTT ? ` ≈${(ms / RTT).toFixed(1)}rt` : ''}`);
      if (WITH_SQL) for (const s of t.sql) console.log(`[db]   ${s}`);
    }
  }
}

/** One statement sent inside the current traced unit, if any. */
export function count(text: string): void {
  const t = store.getStore();
  if (!t) return;
  t.queries++;
  if (WITH_SQL) t.sql.push(text.replace(/\s+/g, ' ').slice(0, 180));
}
