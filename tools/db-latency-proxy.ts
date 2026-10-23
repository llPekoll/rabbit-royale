/**
 * The ocean, on the desk: a TCP proxy that holds every packet between rr-ws and
 * a LOCAL Postgres for half a round trip each way.
 *
 *   bun run tools/db-latency-proxy.ts [--rtt 170] [--port 5433] [--to localhost:5432]
 *   DATABASE_URL=postgres://peko@localhost:5433/rr_crown PG_TRACE=1 PG_TRACE_RTT=170 bun ws
 *
 * 170 ms ≈ Singapore → Helsinki, 90 ms ≈ Virginia → Helsinki. With the
 * server on the proxy, every route takes what it would take in a region whose
 * database is in Europe, and `[db]` lines say how many serial round trips that
 * was (`src/lib/db/trace.ts`).
 */
import { createConnection, createServer } from 'node:net';

const opt = (k: string, d: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const RTT = Number(opt('--rtt', '170'));
const PORT = Number(opt('--port', '5433'));
const [HOST, TO_PORT] = opt('--to', 'localhost:5432').split(':');

createServer((client) => {
  const upstream = createConnection({ host: HOST, port: Number(TO_PORT) });
  // Same delay for every chunk, so timers fire in arrival order: the stream
  // stays a stream.
  const late = (to: typeof client) => (chunk: Buffer) => setTimeout(() => to.writable && to.write(chunk), RTT / 2);
  client.on('data', late(upstream));
  upstream.on('data', late(client));
  const close = () => setTimeout(() => { client.destroy(); upstream.destroy(); }, RTT / 2);
  client.on('close', close).on('error', close);
  upstream.on('close', close).on('error', close);
}).listen(PORT, () => console.log(`[proxy] :${PORT} → ${HOST}:${TO_PORT}, ${RTT} ms round trip`));
