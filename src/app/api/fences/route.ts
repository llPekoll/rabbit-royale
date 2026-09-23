/**
 * Your fences: which edges of the potager carry a plank, and putting one up.
 *
 * NOT OWNER-ONLY, unlike the traps next door. A trap's whole value is that a
 * raider cannot see it; a plank's whole value is that they can — it is a
 * refusal, and a refusal nobody can see is just a raid that ends for no
 * visible reason. So these ride in the raid payload too, and this route is
 * only about the OWNER's side of it: what they hold, and putting one up or
 * taking one down, ONE PLANK AT A TIME.
 *
 * A plank is not spent by being respected, so there is no rearm clock and no
 * allowance here. Placing one takes it out of the bag, lifting it puts it
 * back, and the only rule that is not arithmetic is the gate: the last way
 * into the field cannot be closed (`fencePlacementBlocker`).
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fences, inventory, players } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import {
  fencePlacementBlocker, fencedSpans, fenceRemovalBlocker,
} from '@/lib/game/fences';
import { fenceSpans, type FenceSeg } from '@/game/burrow/fence';
import { FENCES } from '@config/tuning';
import { loadBurrowEdits } from '@/lib/game/burrowEdits';

/** How many planks are in the bag. Plain inventory — no allowance to fold in. */
async function heldFences(playerId: string): Promise<number> {
  const row = await db.query.inventory.findFirst({
    where: and(eq(inventory.playerId, playerId), eq(inventory.kind, 'fence')),
  });
  return row?.qty ?? 0;
}

const asSeg = ({ tile, side }: FenceSeg): FenceSeg => ({ tile, side });

async function fenceState(playerId: string) {
  await loadBurrowEdits(playerId);
  const player = await db.query.players.findFirst({ where: eq(players.id, playerId) });
  if (!player) return null;
  const rows = await db.query.fences.findMany({ where: eq(fences.ownerId, playerId) });
  const placed = fencedSpans(rows);
  const spans = fenceSpans(playerId).map(asSeg);
  return {
    /** The planks standing right now. */
    placed,
    /**
     * Every edge this burrow's field exposes — the places a plank can be.
     *
     * Sent rather than derived on the client from a seed it also has, because
     * it is the server's answer that a placement is checked against — and a
     * board offering a span the server would refuse is a board that lies.
     */
    spans,
    /**
     * The spans a plank could go up on RIGHT NOW: `spans`, less the ones
     * already fenced and less any that would seal the burrow. Computed here so
     * the gate rule has exactly one implementation. The bag is deliberately
     * NOT part of it: a player holding nothing still sees where a plank could
     * go, and the refusal names the empty bag.
     */
    offers: spans.filter((s) => !fencePlacementBlocker(playerId, 1, placed, s.tile, s.side)),
    held: await heldFences(playerId),
    maxHeld: FENCES.MAX_HELD,
  };
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const state = await fenceState(session.sub);
  if (!state) return Response.json({ error: 'unknown player' }, { status: 404 });
  return Response.json(state);
}

/** `{ tile, side }` — put one plank on one edge of your own potager. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { tile?: unknown; side?: unknown };
  const tile = Number(body.tile);
  const side = String(body.side ?? '');

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  const standing = fencedSpans(
    await db.query.fences.findMany({ where: eq(fences.ownerId, session.sub) }),
  );
  const held = await heldFences(session.sub);
  await loadBurrowEdits(session.sub);

  // The owner's own id is their burrow's seed — they may only wall their own
  // field, and the geometry is asked about exactly that field. `tile` is a
  // number off the wire, and the blocker refuses anything that is not a span.
  const blocker = fencePlacementBlocker(session.sub, held, standing, tile, side);
  if (blocker) return Response.json({ error: blocker }, { status: 400 });

  // One transaction, insert FIRST: the unique index on (owner, tile, side) is
  // what rejects a double-tap, so it has to fire before the bag is charged.
  try {
    await db.transaction(async (tx) => {
      await tx.insert(fences).values({ ownerId: session.sub, tile, side });
      await tx.update(inventory)
        .set({ qty: held - 1 })
        .where(and(eq(inventory.playerId, session.sub), eq(inventory.kind, 'fence')));
    });
  } catch (err) {
    if (String(err).includes('fences_owner_span_idx')) {
      return Response.json({ error: 'span_already_fenced' }, { status: 409 });
    }
    throw err;
  }

  return Response.json({ tile, side, ...(await fenceState(session.sub)) });
}

/**
 * `?tile=N&side=NE` — lift one plank. It goes back in the bag whole.
 *
 * In the QUERY STRING for the reason the trap route documents at length:
 * Traefik (via Coolify) strips bodies from DELETE requests, so a route that
 * read one worked in dev and did nothing in production. The body is kept only
 * as a fallback.
 *
 * Returned whole, with no clock on it, because nothing was consumed: a plank
 * that turned a raider away is in exactly the state it was built in.
 */
export async function DELETE(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams;
  const body = q.get('side') === null
    ? ((await req.json().catch(() => ({}))) as { tile?: unknown; side?: unknown })
    : { tile: q.get('tile'), side: q.get('side') };
  const tile = Number(body.tile);
  const side = String(body.side ?? '');

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  const standing = fencedSpans(
    await db.query.fences.findMany({ where: eq(fences.ownerId, session.sub) }),
  );
  const held = await heldFences(session.sub);

  const blocker = fenceRemovalBlocker(standing, held, tile, side);
  if (blocker) return Response.json({ error: blocker }, { status: 400 });

  // DELETE first, and its `returning` is what pays the refund: two taps racing
  // on the same plank hand back one, not two.
  const removed = await db.transaction(async (tx) => {
    const [row] = await tx.delete(fences)
      .where(and(eq(fences.ownerId, session.sub), eq(fences.tile, tile), eq(fences.side, side)))
      .returning({ tile: fences.tile, side: fences.side });
    if (!row) return null;
    // An upsert rather than an update: a player who placed their starting
    // planks and never bought one has no `inventory` row to bump.
    await tx.insert(inventory)
      .values({ playerId: session.sub, kind: 'fence', qty: held + 1 })
      .onConflictDoUpdate({
        target: [inventory.playerId, inventory.kind],
        set: { qty: held + 1 },
      });
    return row;
  });
  if (!removed) return Response.json({ error: 'span_not_fenced' }, { status: 404 });

  return Response.json({ removed: { tile, side }, ...(await fenceState(session.sub)) });
}
