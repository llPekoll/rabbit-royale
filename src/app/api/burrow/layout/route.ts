/**
 * Rearranging the burrow: trees, house and potager (`BurrowEdits`).
 *
 * GET answers the owner's edits and whether they may change them now; PUT
 * replaces them WHOLE — the client lays things out locally, checking with the
 * same rule (`editBurrow`, mirrored in Godot), and saves the final state.
 *
 * Refused while a raid is on the burrow: the raider is reading the ground as
 * it was when they came in.
 *
 * What stood on the old layout follows it:
 * - the planks move WITH the potager (same shape, same sides); if the new
 *   surroundings would leave them sealing the field, they all go back in the
 *   bag instead;
 * - a bomb left on a cell that can no longer hold one (under a tree, on the
 *   new doorstep) is lifted and refunded, as `evictDoorstep` does.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { fences, inventory, players, traps } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import {
  baseBurrowFor, burrowColRow, burrowIndex, isTrappable, setBurrowEdits,
} from '@/game/burrow/board';
import { editBurrow, hasEdits } from '@/game/burrow/generate';
import { fieldReachable, isSpan } from '@/game/burrow/fence';
import { fencedSpans } from '@/lib/game/fences';
import { refundTraps } from '@/lib/game/traps';
import { burrowUnderRaid, loadBurrowEdits, parseBurrowEdits } from '@/lib/game/burrowEdits';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const edits = await loadBurrowEdits(session.sub);
  return Response.json({ edits: edits ?? {}, locked: await burrowUnderRaid(session.sub) });
}

/** `{ edits }` — the whole rearrangement, `{}` to go back to the generated burrow. */
export async function PUT(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  const id = session.sub;

  const body = (await req.json().catch(() => ({}))) as { edits?: unknown };
  const edits = parseBurrowEdits(body.edits ?? {});
  if (!edits) return Response.json({ error: 'bad_edits' }, { status: 400 });

  const player = await db.query.players.findFirst({ where: eq(players.id, id) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });
  if (await burrowUnderRaid(id)) return Response.json({ error: 'under_raid' }, { status: 409 });

  const base = baseBurrowFor(id);
  if (hasEdits(edits)) {
    const out = editBurrow(base, edits);
    if (typeof out === 'string') return Response.json({ error: out }, { status: 400 });
  }

  // The planks, carried over by the field's shift.
  const was = (player.burrowEdits?.field ?? [0, 0]) as [number, number];
  const now = edits.field ?? [0, 0];
  const shift = (tile: number) => {
    const { col, row } = burrowColRow(tile);
    return burrowIndex(col + now[0] - was[0], row + now[1] - was[1]);
  };
  const standing = fencedSpans(await db.query.fences.findMany({ where: eq(fences.ownerId, id) }));
  setBurrowEdits(id, edits);
  const carried = standing.map((s) => ({ tile: shift(s.tile), side: s.side }));
  const keep = carried.every((s) => isSpan(id, s.tile, s.side)) && fieldReachable(id, carried);

  const placed = await db.query.traps.findMany({ where: eq(traps.ownerId, id) });
  const evicted = placed.filter((t) => !isTrappable(id, t.tile)).map((t) => t.tile);

  let planksBack = 0;
  let bombsBack = 0;
  try {
    await db.transaction(async (tx) => {
      await tx.update(players)
        .set({ burrowEdits: hasEdits(edits) ? edits : null })
        .where(eq(players.id, id));

      const moved = now[0] !== was[0] || now[1] !== was[1];
      if (standing.length && (moved || !keep)) {
        await tx.delete(fences).where(eq(fences.ownerId, id));
        if (keep) {
          await tx.insert(fences).values(carried.map((s) => ({ ownerId: id, ...s })));
        } else {
          planksBack = standing.length;
          const bag = await tx.query.inventory.findFirst({
            where: and(eq(inventory.playerId, id), eq(inventory.kind, 'fence')),
          });
          const qty = (bag?.qty ?? 0) + planksBack;
          await tx.insert(inventory)
            .values({ playerId: id, kind: 'fence', qty })
            .onConflictDoUpdate({ target: [inventory.playerId, inventory.kind], set: { qty } });
        }
      }

      if (evicted.length) {
        const rows = await tx.delete(traps)
          .where(and(eq(traps.ownerId, id), inArray(traps.tile, evicted)))
          .returning({ tile: traps.tile });
        bombsBack = rows.length;
        if (bombsBack) {
          await tx.update(players).set(refundTraps(player, bombsBack)).where(eq(players.id, id));
        }
      }
    });
  } catch (err) {
    // Nothing was written: the rules go back to answering with the old edits.
    setBurrowEdits(id, player.burrowEdits);
    throw err;
  }

  return Response.json({ edits, locked: false, planksBack, bombsBack });
}
