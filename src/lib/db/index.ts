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
 * `max` is sized for the BOUNDARIES, not the hot path. The WS server holds
 * island state in memory, so Postgres never sees a move — it sees joins,
 * deaths and banked runs. Those arrive in bursts (an eruption ends four runs
 * at once) and each one is a short write, so the pool has to absorb a spike
 * rather than sustain a rate.
 *
 * 10 was too tight for that: a burst queued behind the pool long before the
 * CPU was troubled. 25 is still well inside the server's 100 `max_connections`
 * with every process on the box counted in, which is the ceiling that actually
 * matters — overshooting it turns a slow join into a refused connection.
 * Each process now holds 25 + 5 (the transactions' pool, below): count 30.
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';
import { count, TRACING } from './trace';

type Db = PostgresJsDatabase<typeof schema>;

/**
 * ONE ROUND TRIP PER QUERY, NOT TWO.
 *
 * Drizzle sends every statement through `client.unsafe(text, params)`, and
 * postgres-js does not prepare an `unsafe` query unless told to: it sends the
 * text, WAITS for Postgres to describe the parameter types, then sends the
 * values. Two trips for every select. Invisible next to the database, and
 * 340 ms instead of 170 per query once it sits on another continent
 * (measured 2026-10-23, `tools/db-latency-bench.ts`).
 *
 * Prepared, the description is cached per connection and every later run of
 * the same statement is one trip. A migration that changes a table the cache
 * planned against is retried by the driver itself (`RevalidateCachedQuery`).
 * Transactions and savepoints hand Drizzle a new client, wrapped the same way.
 */
function preparing<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (prop === 'unsafe') {
        return (text: string, params?: unknown[], options?: object) =>
          (value as Function).call(target, text, params, { prepare: true, ...options });
      }
      if (prop === 'begin' || prop === 'savepoint') {
        return (...args: unknown[]) => {
          const work = args.pop() as (tx: object) => unknown;
          return (value as Function).call(target, ...args, (tx: object) => work(preparing(tx)));
        };
      }
      return value;
    },
  });
}

let _sql: Sql | null = null;
let _db: Db | null = null;
let _txDb: Db | null = null;

/**
 * TRANSACTIONS HAVE THEIR OWN SMALL POOL (2026-10-23).
 *
 * A prepared statement lives on ONE connection (`preparing` above), and the
 * pool hands its 25 out in turn: a statement run once per raid's end, once
 * per bomb buried, was cold on almost every connection it landed on — and
 * a cold statement inside a transaction costs a trip of its own, one after
 * another. The last step of a raid paid 15 trips to a far database where 4
 * were needed. Five connections for every transaction in the game: their
 * statements are warm after a few uses, and stay warm (`max_lifetime`).
 * Plain reads and writes keep the big pool.
 */
function connect() {
  if (_db && _sql && _txDb) return { sql: _sql, db: _db, txDb: _txDb };
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be set');
  const options = {
    // A connection kept for hours rather than the driver's 30-60 minutes: its
    // prepared statements (see `preparing`) die with it, and a fresh one pays
    // two trips per statement again — plus the TLS handshake — until it warms.
    // Next to the database that was free; from another continent it is not.
    max_lifetime: Number(process.env.PG_MAX_LIFETIME_S ?? 6 * 3600),
    // Every statement the connection sends, begin and commit included.
    ...(TRACING ? { debug: (_c: number, query: string) => count(query) } : {}),
  };
  _sql = postgres(url, { ...options, max: Number(process.env.PG_POOL_MAX ?? 25) });
  _db = drizzle(preparing(_sql), { schema });
  _txDb = drizzle(preparing(postgres(url, { ...options, max: Number(process.env.PG_TX_POOL_MAX ?? 5) })), { schema });
  return { sql: _sql, db: _db, txDb: _txDb };
}

/** The Drizzle handle. Every property access connects on demand; a
 *  transaction is opened on the transactions' own pool (see `connect`). */
export const db = new Proxy({} as Db, {
  get: (_t, prop) => {
    const { db: plain, txDb } = connect();
    if (prop === 'transaction') return txDb.transaction.bind(txDb);
    return Reflect.get(plain, prop);
  },
});

/** The raw postgres-js client, for the rare query Drizzle cannot express. */
export const sql = new Proxy({} as Sql, {
  get: (_t, prop) => Reflect.get(connect().sql, prop),
  apply: (_t, _this, args: Parameters<Sql>) => connect().sql(...args),
});

export { schema };
