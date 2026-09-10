/**
 * Your traps: where they are, and putting one down.
 *
 * The OWNER sees their own trap positions — they have to, or they cannot tell a
 * covered approach from an open one. A raider is sent none of this, ever: the
 * raid endpoints never put trap positions in an attacker's payload, which is
 * the whole reason placing one is worth doing (a visible trap is a wall, and a
 * wall gets routed around rather than feared).
 *
 * Spending a trap is deliberately not a simple decrement. The free daily
 * allowance is derived from a timestamp rather than granted by a job, so
 * `spendTrap` decides whether this placement eats a free one (pushing the claim
 * stamp forward by exactly one trap's worth) or a bought one.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, traps } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { availableTraps, placementBlocker, spendTrap } from '@/lib/game/traps';
import { isTrappable } from '@/config/burrowConfig';
import { TRAPS } from '@config/tuning';

async function trapState(playerId: string) {
  const player = await db.query.players.findFirst({ where: eq(players.id, playerId) });
  if (!player) return null;
  const placed = await db.query.traps.findMany({ where: eq(traps.ownerId, playerId) });
  return {
    /** Tiles the owner has mined. Owner-only — never sent to a raider. */
    placed: placed.map((t) => t.tile),
    held: availableTraps(player),
    maxPlaced: TRAPS.MAX_PLACED,
    maxHeld: TRAPS.MAX_HELD,
    drain: TRAPS.DRAIN,
  };
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const state = await trapState(session.sub);
  if (!state) return Response.json({ error: 'unknown player' }, { status: 404 });
  return Response.json(state);
}

/** `{ tile }` — place a trap on one of your own walkable tiles. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { tile?: unknown };
  const tile = Number(body.tile);

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  const placed = await db.query.traps.findMany({ where: eq(traps.ownerId, session.sub) });

  // `isTrappable` guards the tile index itself — it is a number off the wire,
  // so a non-integer, a negative or an out-of-range value has to be refused
  // here rather than reaching a query.
  const blocker = placementBlocker(
    player,
    placed.length,
    isTrappable(tile),
    placed.some((t) => t.tile === tile),
  );
  if (blocker) return Response.json({ error: blocker }, { status: 400 });

  const spend = spendTrap(player);
  if (!spend) return Response.json({ error: 'no_traps' }, { status: 400 });

  // One transaction: the trap appearing and the allowance being drawn down are
  // the same event. The insert goes FIRST so the unique index on (owner, tile)
  // rejects a double-tap before any allowance is spent.
  try {
    await db.transaction(async (tx) => {
      await tx.insert(traps).values({ ownerId: session.sub, tile });
      await tx.update(players).set(spend).where(eq(players.id, session.sub));
    });
  } catch (err) {
    if (String(err).includes('traps_owner_tile_idx')) {
      return Response.json({ error: 'tile_already_trapped' }, { status: 409 });
    }
    throw err;
  }

  // `tile`, not `placed`: the state below carries a `placed` ARRAY, and a key
  // whose meaning depends on spread order is a bug waiting for whoever reads
  // it next.
  return Response.json({ tile, ...(await trapState(session.sub)) });
}

/**
 * `{ tile }` — lift a trap you placed.
 *
 * The trap is DESTROYED, not returned to the bag. Otherwise a defender could
 * re-mine their burrow between every raid at no cost, and the choice of where
 * to defend — which is the entire mechanic — would stop being a commitment.
 */
export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { tile?: unknown };
  const tile = Number(body.tile);
  if (!Number.isInteger(tile)) return Response.json({ error: 'bad_tile' }, { status: 400 });

  const [removed] = await db.delete(traps)
    .where(and(eq(traps.ownerId, session.sub), eq(traps.tile, tile)))
    .returning({ tile: traps.tile });
  if (!removed) return Response.json({ error: 'no_trap_there' }, { status: 404 });

  return Response.json({ removed: tile, ...(await trapState(session.sub)) });
}
