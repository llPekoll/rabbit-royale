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
import { and, eq, inArray, isNotNull, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players, traps } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import {
  armedTraps, availableTraps, isArmed, placementBlocker, refundTrap, refundTraps, rearmingTraps,
  spendTrap,
} from '@/lib/game/traps';
import { burrowCell, isDoorstep, isTrappable } from '@/game/burrow/board';
import { houseTiles } from '@/game/burrow/buildings';
import { loadBurrowEdits } from '@/lib/game/burrowEdits';
import { groundChanged } from '@/lib/game/raid-live';
import { TRAPS } from '@/lib/tuning/tables';

type Player = typeof players.$inferSelect;
type Trap = typeof traps.$inferSelect;

/** The owner's row and their board, read together — one round trip. */
async function boardOf(playerId: string): Promise<{ player: Player | undefined; placed: Trap[] }> {
  const [player, placed] = await Promise.all([
    db.query.players.findFirst({ where: eq(players.id, playerId) }),
    db.query.traps.findMany({ where: eq(traps.ownerId, playerId) }),
  ]);
  return { player, placed };
}

/**
 * What the owner's board shows. From the rows the caller holds — a write
 * that just changed them hands over the rows as they now stand, rather than
 * reading back what it wrote (a round trip each, from a region whose database
 * may be on another continent) — or read here.
 */
async function trapState(playerId: string, known?: { player: Player | undefined; placed: Trap[] }) {
  const { player, placed } = known ?? await boardOf(playerId);
  if (!player) return null;
  const armed = new Set(armedTraps(placed).map((t) => t.tile));
  return {
    /** Tiles the owner has mined. Owner-only — never sent to a raider. */
    placed: placed.map((t) => t.tile),
    /**
     * Which of those are STANDING, and when the rest come back.
     *
     * The owner is shown the difference because a burrow reporting only "5
     * traps" after a raid reads as loss, where "5 up, 3 rearming, next in
     * 40 min" reads as a recovery already under way — which is what it is.
     * Never sent to a raider: `placed` is owner-only to begin with.
     */
    armed: [...armed],
    rearming: rearmingTraps(placed).map(({ trap, readyAt }) => ({
      tile: trap.tile,
      readyAt: new Date(readyAt).toISOString(),
    })),
    held: availableTraps(player),
    maxPlaced: TRAPS.MAX_PLACED,
    maxHeld: TRAPS.MAX_HELD,
    drain: TRAPS.DRAIN,
  };
}

/**
 * Lift the traps the RULES moved out from under, and hand them back.
 *
 * A bomb buried on the entrance was legal until the doorstep existed
 * (`TRAPS.DOORSTEP`); its row is still in the table. The raid endpoint already
 * refuses to spring it (`standingTraps`), so what is left is the owner's side:
 * a marker on a cell the grid now paints orange, for a trap that defends
 * nothing. Lifted the first time the owner looks, in one transaction, and
 * refunded as stock whether or not it was mid-rearm — the lift-refund rule
 * (`DELETE`) exists to stop a player buying an instant rearm, and a player
 * whose ground changed under them is not doing that.
 *
 * Runs on every GET rather than once, because it costs one read on a board
 * with nothing to evict, and a rule that keeps a list of "already migrated"
 * players would be a second source of truth for what the seed already says.
 */
/** Lifts what may not stand where it is; true when something was lifted. */
async function evictDoorstep(playerId: string, player: Player, placed: Trap[]): Promise<boolean> {
  // …and the house: nothing is buried under it (2026-09-23). Covers the
  // bombs that were there before the rule, and a house the owner moved.
  const house = new Set(houseTiles(playerId));
  const evicted = placed
    .filter((t) => !isTrappable(playerId, t.tile) || house.has(t.tile))
    .map((t) => t.tile);
  if (!evicted.length) return false;
  await db.transaction(async (tx) => {
    // The DELETE's `returning` says how many were actually there, so two GETs
    // racing on the same board cannot refund the same trap twice.
    const rows = await tx.delete(traps)
      .where(and(eq(traps.ownerId, playerId), inArray(traps.tile, evicted)))
      .returning({ tile: traps.tile });
    if (!rows.length) return;
    await tx.update(players)
      .set(refundTraps(player, rows.length))
      .where(eq(players.id, playerId));
  });
  return true;
}

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const [, board] = await Promise.all([loadBurrowEdits(session.sub), boardOf(session.sub)]);
  if (!board.player) return Response.json({ error: 'unknown player' }, { status: 404 });
  // The rare board with a bomb where it may no longer stand is read again
  // after the eviction; every other one answers from the rows in hand.
  const evicted = await evictDoorstep(session.sub, board.player, board.placed);
  // A GET that lifted bombs changed the ground under any raid on it.
  if (evicted) groundChanged(session.sub);
  const state = await trapState(session.sub, evicted ? undefined : board);
  if (!state) return Response.json({ error: 'unknown player' }, { status: 404 });
  return Response.json(state);
}

/** `{ tile }` — place a trap on one of your own walkable tiles. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { tile?: unknown };
  const tile = Number(body.tile);
  const [, { player, placed }] = await Promise.all([loadBurrowEdits(session.sub), boardOf(session.sub)]);
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

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
    Date.now(),
    // The doorstep is walkable ground the board shows the owner: refused by
    // name, so the answer is "too near the door" and not "nothing there".
    isDoorstep(session.sub, tile),
  );
  // THE GARDEN AND THE HOUSE: walkable, and refused BY NAME like the
  // doorstep — the player sees them, "nothing to mine" would be a lie.
  if (burrowCell(session.sub, tile) === 'field') {
    return Response.json({ error: 'tile_field' }, { status: 400 });
  }
  if (houseTiles(session.sub).includes(tile)) {
    return Response.json({ error: 'tile_house' }, { status: 400 });
  }
  if (blocker) return Response.json({ error: blocker }, { status: 400 });

  const spend = spendTrap(player);
  if (!spend) return Response.json({ error: 'no_traps' }, { status: 400 });

  // One transaction: the trap appearing and the allowance being drawn down are
  // the same event. The insert goes FIRST so the unique index on (owner, tile)
  // rejects a double-tap before any allowance is spent.
  // Both statements pipelined (one trip): they still run in this order, and a
  // refused insert aborts the transaction under the update.
  let planted: Trap;
  try {
    planted = await db.transaction(async (tx) => {
      const [row] = await Promise.all([
        tx.insert(traps).values({ ownerId: session.sub, tile }).returning().then((r) => r[0]),
        // `trapsPlaced` is a LIFETIME count for the quest board — a trap lifted
        // later was still placed, and the lesson was still learned.
        tx.update(players)
          .set({ ...spend, trapsPlaced: raw`${players.trapsPlaced} + 1` })
          .where(eq(players.id, session.sub)),
      ]);
      return row;
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
  return Response.json({
    tile,
    ...(await trapState(session.sub, { player: { ...player, ...spend }, placed: [...placed, planted] })),
  });
}

/**
 * `{ tile }` — REARM NOW (2026-10-22): a bomb a raider sprang stands again at
 * once, for one bomb from the bag (the free allowance first, `spendTrap`).
 *
 * The clock (TRAPS.REARM_MS) left the gate it guarded open to the next raider
 * for three hours, and nothing told its owner so: one raider sacrificed a run
 * on the bomb, a second walked through four minutes later (GrimClover93,
 * Discord 2026-10-21). An owner who is there can now close it. This is the
 * instant rearm the lift rule below refuses for FREE — here it is paid with a
 * whole bomb, which is what lifting and re-burying already cost, said out
 * loud. An empty bag is the client's to fill first (`shop` buys a trap).
 */
export async function PATCH(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { tile?: unknown };
  const tile = Number(body.tile);
  if (!Number.isInteger(tile)) return Response.json({ error: 'bad_tile' }, { status: 400 });

  const { player, placed } = await boardOf(session.sub);
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  const row = placed.find((t) => t.tile === tile);
  if (!row) return Response.json({ error: 'no_trap_there' }, { status: 404 });
  // Standing already, by the same queue the raid reads (`armedTraps`).
  if (!row.sprungAt || armedTraps(placed).includes(row)) {
    return Response.json({ error: 'trap_armed' }, { status: 409 });
  }

  const spend = spendTrap(player);
  if (!spend) return Response.json({ error: 'no_traps' }, { status: 400 });

  // The claim is the trap's own `sprungAt` going null: two taps racing rearm
  // it once and spend one bomb. Tested as NOT NULL, not equal to the value
  // read — Postgres keeps microseconds a JS Date drops, so that never matched.
  const rearmed = await db.transaction(async (tx) => {
    const [done] = await tx.update(traps)
      .set({ sprungAt: null })
      .where(and(eq(traps.id, row.id), isNotNull(traps.sprungAt)))
      .returning({ id: traps.id });
    if (!done) return false;
    await tx.update(players).set(spend).where(eq(players.id, session.sub));
    return true;
  });
  if (!rearmed) return Response.json({ error: 'trap_armed' }, { status: 409 });

  return Response.json({
    rearmed: tile,
    ...(await trapState(session.sub, {
      player: { ...player, ...spend },
      placed: placed.map((t) => (t.id === row.id ? { ...t, sprungAt: null } : t)),
    })),
  });
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
 *
 * A trap still REARMING is lifted like any other, but comes back EMPTY-HANDED:
 * the row goes, the bag does not grow. Refunding it would sell the arming
 * clock for one tap — lift the sprung trap, get a whole one in the bag, place
 * it on the next tile, and the burrow is back to full the moment its owner
 * logs in. That is the instant rearm the design rejects, reached by a detour.
 * Lifting it is still allowed, because the tile has to be freeable: what the
 * owner gets back is the GROUND, not the trap.
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

  // `?all=1` clears the WHOLE board in one gesture.
  //
  // Rearranging a defence means lifting several bombs, and one tap per tile on
  // a 19x19 grid is a chore the player does before every change of plan. Same
  // rules as lifting one, applied to everything at once: one transaction, and
  // the refund is stock returned rather than allowance rewound, so clearing
  // and re-mining creates nothing.
  if (url.searchParams.get('all') !== null) {
    const { player } = await boardOf(session.sub);
    if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

    const cleared = await db.transaction(async (tx) => {
      // The DELETE's `returning` is what says how many were actually there, so
      // the refund can never be paid for traps a concurrent request already
      // lifted — the same reason the single-tile path deletes first.
      const rows = await tx.delete(traps)
        .where(eq(traps.ownerId, session.sub))
        .returning({ tile: traps.tile, sprungAt: traps.sprungAt });
      if (!rows.length) return { count: 0, refundable: 0 };
      // Only the STANDING traps are paid back — a board cleared mid-rearm
      // hands back what was actually on it, not what was on its way. Counted
      // through `armedTraps` rather than by testing `sprungAt` here, so the
      // stagger is applied the same way the raid endpoint applies it.
      const refundable = armedTraps(rows).length;
      if (refundable > 0) {
        await tx.update(players)
          .set(refundTraps(player, refundable))
          .where(eq(players.id, session.sub));
      }
      return { count: rows.length, refundable };
    });

    // The board is empty now, and the bag holds what the refund put in it.
    const after = cleared.refundable > 0 ? { ...player, ...refundTraps(player, cleared.refundable) } : player;
    return Response.json({ cleared: cleared.count, ...(await trapState(session.sub, { player: after, placed: [] })) });
  }

  const fromQuery = url.searchParams.get('tile');
  const body = fromQuery === null
    ? ((await req.json().catch(() => ({}))) as { tile?: unknown })
    : { tile: fromQuery };
  const tile = Number(body.tile);
  if (!Number.isInteger(tile)) return Response.json({ error: 'bad_tile' }, { status: 400 });

  const { player, placed } = await boardOf(session.sub);
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  // One transaction, and the DELETE goes first: its `returning` is what says
  // whether there was a trap there at all, so a refund can never be paid for a
  // tile that held nothing — two taps racing on the same tile hand back one
  // trap, not two.
  const removed = await db.transaction(async (tx) => {
    const [row] = await tx.delete(traps)
      .where(and(eq(traps.ownerId, session.sub), eq(traps.tile, tile)))
      .returning({ tile: traps.tile, sprungAt: traps.sprungAt });
    if (!row) return null;
    // A trap that was still rearming frees its tile without paying anything
    // back — see the note above: refunding it would buy an instant rearm.
    if (isArmed(row)) {
      await tx.update(players).set(refundTrap(player)).where(eq(players.id, session.sub));
    }
    return row;
  });
  if (!removed) return Response.json({ error: 'no_trap_there' }, { status: 404 });

  return Response.json({
    removed: tile,
    ...(await trapState(session.sub, {
      player: isArmed(removed) ? { ...player, ...refundTrap(player) } : player,
      placed: placed.filter((t) => t.tile !== tile),
    })),
  });
}
