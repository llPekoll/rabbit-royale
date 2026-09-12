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
import { availableTraps, placementBlocker, refundTrap, spendTrap } from '@/lib/game/traps';
import { isTrappable } from '@/game/burrow/board';
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
    // The owner's own id is their burrow's seed — they may only mine their
    // own ground, and `isTrappable` is asked about exactly that ground.
    isTrappable(session.sub, tile),
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
 * `{ tile }` — lift a trap you placed. Tapping a mined tile again is what calls
 * this, so putting one down and taking it back up is one gesture.
 *
 * The trap RETURNS to the bag. It used to be destroyed, on the grounds that a
 * free lift lets a defender re-mine their burrow between every raid and so
 * empties the placement of its commitment — but the commitment that matters is
 * the one a RAIDER walks into, and it is made the moment a raid starts, not
 * the moment a tile is tapped. What destroying it actually punished was
 * misclicking: the board is 19x19 of small diamonds, and the only way to
 * correct a slip was to pay 180 carrots for it.
 *
 * The re-mining loop is still closed, by the two limits that were always doing
 * that job: MAX_PLACED caps the board however often it is rearranged, and the
 * refund is stock returned rather than allowance rewound (`refundTrap`), so no
 * amount of lifting makes a trap that was not already bought or waited for.
 */
export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  // The tile comes in the QUERY STRING, with the body kept as a fallback.
  //
  // A DELETE that carries a body is legal and works in dev, but it is the one
  // request shape intermediaries feel free to drop: proxies and CDNs strip the
  // body from a DELETE often enough that the spec warns against relying on it.
  // In front of this app there is one (Traefik, via Coolify) — so lifting a
  // bomb worked on localhost and in Storybook, and did nothing in production,
  // the route reading an empty body and answering `bad_tile`.
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get('tile');
  const body = fromQuery === null
    ? ((await req.json().catch(() => ({}))) as { tile?: unknown })
    : { tile: fromQuery };
  const tile = Number(body.tile);
  if (!Number.isInteger(tile)) return Response.json({ error: 'bad_tile' }, { status: 400 });

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  // One transaction, and the DELETE goes first: its `returning` is what says
  // whether there was a trap there at all, so a refund can never be paid for a
  // tile that held nothing — two taps racing on the same tile hand back one
  // trap, not two.
  const removed = await db.transaction(async (tx) => {
    const [row] = await tx.delete(traps)
      .where(and(eq(traps.ownerId, session.sub), eq(traps.tile, tile)))
      .returning({ tile: traps.tile });
    if (!row) return null;
    await tx.update(players).set(refundTrap(player)).where(eq(players.id, session.sub));
    return row;
  });
  if (!removed) return Response.json({ error: 'no_trap_there' }, { status: 404 });

  return Response.json({ removed: tile, ...(await trapState(session.sub)) });
}
