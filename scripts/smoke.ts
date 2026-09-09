/**
 * End-to-end smoke test: sign a session, connect a real socket, walk a rabbit
 * around a real island, and check the server pushed back what it should.
 *
 * This is the "5 runs without a bug" check from BUILD-PLAN phase 1, automated
 * enough to run before a deploy. It talks to a real Postgres and a real WS
 * server — nothing here is mocked, which is the point.
 *
 *   DATABASE_URL=... JWT_SIGNING_SECRET=... bun run scripts/smoke.ts
 */
import { io } from 'socket.io-client';
import { eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { players } from '../src/lib/db/schema';
import { signSession } from '../src/lib/auth/jwt';
import type { Direction } from '../src/lib/game/types';

const WS = process.env.WS_URL ?? 'http://localhost:3010';
const ADDRESS = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const ID = `sol:${ADDRESS}`;

const fail = (msg: string) => { console.error('✗', msg); process.exit(1); };
const pass = (msg: string) => console.log('✓', msg);

// The smoke player is inserted directly: this exercises the GAME loop, and the
// signature path has its own unit tests.
await db.insert(players).values({ id: ID, wallet: ADDRESS, name: 'SmokeRabbit' }).onConflictDoNothing();
const token = await signSession({ sub: ID, wallet: ADDRESS, name: 'SmokeRabbit' });

const socket = io(WS, { auth: { token }, transports: ['websocket'] });
const timeout = setTimeout(() => fail('timed out — is the ws server running?'), 15_000);

let reveals = 0;
let walkTimer: ReturnType<typeof setInterval> | undefined;

socket.on('connect_error', (e) => fail(`connect_error: ${e.message}`));

socket.on('connect', () => {
  pass('connected');
  socket.emit('join');
});

socket.on('island', async (snap: { island: { width: number; height: number; tiles: unknown[] }; rabbits: unknown[] }) => {
  pass(`island ${snap.island.width}x${snap.island.height}, ${snap.rabbits.length} rabbit(s)`);

  // The server must NEVER ship the content of an unrevealed tile.
  const leaked = (snap.island.tiles as Array<Record<string, unknown>>)
    .filter((t) => !t.revealed && Object.keys(t).length > 1);
  if (leaked.length) fail(`${leaked.length} unrevealed tiles leaked their content`);
  pass('unrevealed tiles carry no content');

  // Walk a RANDOM walk, not a cycle: a four-direction loop returns to tiles it
  // already revealed, which are free to walk, so energy would never drain and
  // the run would never end. The point is to spend energy on fresh dirt.
  const dirs: Direction[] = ['up', 'down', 'left', 'right'];
  const walk = setInterval(() => {
    socket.emit('move', { dir: dirs[Math.floor(Math.random() * 4)] });
  }, 110);
  walkTimer = walk;
});

socket.on('tile_revealed', () => { reveals++; });

socket.on('move_rejected', ({ reason }: { reason: string }) => {
  // 'stunned' and 'too-fast' are the server correctly refusing; anything else
  // means the client and the server disagree about the rules.
  if (reason !== 'stunned' && reason !== 'too-fast' && reason !== 'out-of-bounds') {
    fail(`unexpected rejection: ${reason}`);
  }
});

socket.on('run_over', (recap: { carrots: number; tilesDug: number; bombsHit: number }) => {
  clearTimeout(timeout);
  clearInterval(walkTimer);
  if (reveals === 0) fail('no tiles were ever revealed');
  pass(`ran a full run: ${recap.tilesDug} dug, ${recap.carrots} carrots, ${recap.bombsHit} bombs`);
  pass(`${reveals} tile_revealed events received`);
  socket.disconnect();
  // The server banks the run asynchronously; give it a moment, then VERIFY the
  // three counters actually moved. A recap event alone proves nothing was
  // persisted — this check is what makes the smoke test worth running.
  setTimeout(async () => {
    const [row] = await db.select().from(players).where(eq(players.id, ID));
    if (!row) fail('player row vanished');
    if (row.lifetimeCarrots !== row.seasonScore || row.seasonScore !== row.stock) {
      fail(`counters drifted: stock=${row.stock} season=${row.seasonScore} lifetime=${row.lifetimeCarrots}`);
    }
    if (row.runsPlayed !== 1) fail(`runs_played=${row.runsPlayed}, expected 1`);
    if (row.tilesDug !== recap.tilesDug) fail(`tiles_dug=${row.tilesDug}, expected ${recap.tilesDug}`);
    pass(`banked: stock=${row.stock} season=${row.seasonScore} lifetime=${row.lifetimeCarrots} runs=${row.runsPlayed}`);
    console.log('\nSMOKE OK');
    process.exit(0);
  }, 1500);
});
