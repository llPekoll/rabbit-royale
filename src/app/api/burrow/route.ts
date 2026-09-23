/**
 * The burrow: read it, upgrade it, harvest the garden.
 *
 * Every number here is DERIVED at read time from timestamps (see lib/game/regen)
 * — there is no job ticking players forward, which is what lets this hold a lot
 * of them.
 */
import { and, eq, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { inventory, players } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { applyRegen, gardenYield } from '@/lib/game/regen';
import { burrowView, upgradeBlocker } from '@/lib/game/burrow';
import { questBoardOf } from '@/lib/game/quests';
import {
  extendGardenBoost, gardenBoostBlocker, holdings, shieldBlocker, type GardenKind,
} from '@/lib/game/inventory';
import { RAID, upgradeCost } from '@config/tuning';

/**
 * The player's row and their bag, which the burrow view needs both of.
 *
 * One helper because every response on this route reports the same thing, and
 * the boosts are the part that lives in the OTHER table — a response built
 * from the player row alone would show a full garden card with both bottles
 * greyed out.
 *
 * It hands back the player ROW as well as the view, because the quest board is
 * built from the row and every response that carries one also re-reads it —
 * one query rather than two.
 */
async function ownerView(playerId: string) {
  const player = await db.query.players.findFirst({ where: eq(players.id, playerId) });
  if (!player) return null;
  const rows = await db.query.inventory.findMany({ where: eq(inventory.playerId, playerId) });
  return { player, view: burrowView(player, Date.now(), holdings(rows, player)) };
}

/** The action names the client sends, and the column each one opens. */
const BOOST_ACTION: Record<string, GardenKind> = { water: 'water', fertilise: 'fertiliser' };

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const owner = await ownerView(session.sub);
  if (!owner) return Response.json({ error: 'unknown player' }, { status: 404 });

  // The quest board rides on the same read as the burrow: every moment the
  // client re-reads its carrots is also a moment a quest may have moved, and
  // one fetch that answers both is one fewer wire to forget.
  return Response.json({
    burrow: owner.view,
    player: applyRegen(owner.player),
    quest: questBoardOf(owner.player),
    /** The owner's rearrangement (`BurrowEdits`), laid on the generated
     *  burrow by the client — see /api/burrow/layout. */
    edits: owner.player.burrowEdits ?? {},
  });
}

/**
 * Spend one `kind` out of the bag, atomically.
 *
 * The decrement carries its own `qty >= 1` guard rather than trusting the
 * caller's check: two taps that race (a double tap, two tabs) would both read a
 * bag holding one and both pass their blocker, and a bare `qty - 1` would leave
 * the player at -1 having got two windows. The guard makes the second UPDATE
 * match no row, and a zero row count rolls the whole thing back.
 *
 * `apply` writes whatever the item DOES, in the same transaction — a spend that
 * commits without its effect is the item destroyed.
 */
async function spendOne(
  playerId: string,
  kind: string,
  apply: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<void>,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const taken = await tx.update(inventory)
      .set({ qty: raw`${inventory.qty} - 1` })
      .where(and(
        eq(inventory.playerId, playerId),
        eq(inventory.kind, kind as 'shield'),
        raw`${inventory.qty} >= 1`,
      ))
      .returning({ qty: inventory.qty });
    if (taken.length === 0) return false;
    await apply(tx);
    return true;
  });
}

/** `{ action: 'upgrade' | 'harvest' | 'water' | 'fertilise' | 'shield' }`. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const now = new Date();

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  if (action === 'harvest') {
    const ready = gardenYield(player, now.getTime());
    if (ready <= 0) return Response.json({ error: 'nothing_to_harvest' }, { status: 400 });

    // The garden feeds all three counters, exactly like a carrot dug on the
    // island — one event, three columns, in a single statement so they cannot
    // drift apart.
    await db.update(players).set({
      stock: raw`${players.stock} + ${ready}`,
      seasonScore: raw`${players.seasonScore} + ${ready}`,
      lifetimeCarrots: raw`${players.lifetimeCarrots} + ${ready}`,
      gardenCollectedAt: now,
      // Counted in the same statement as the carrots: the quest board reads
      // this, and a harvest the board did not see is a bug report.
      harvests: raw`${players.harvests} + 1`,
    }).where(eq(players.id, session.sub));

    // Re-read through `ownerView` so the burrow it reports carries the bag —
    // a harvest response built from the player row alone came back with both
    // bottles greyed out on a garden that still held them.
    const after = (await ownerView(session.sub))!;
    return Response.json({
      harvested: ready,
      burrow: after.view,
      quest: questBoardOf(after.player),
    });
  }

  if (action === 'upgrade') {
    const blocker = upgradeBlocker(player);
    if (blocker) {
      return Response.json(
        { error: blocker, need: upgradeCost(player.burrowLevel), have: player.stock },
        { status: 400 },
      );
    }
    const cost = upgradeCost(player.burrowLevel);

    await db.update(players).set({
      stock: raw`${players.stock} - ${cost}`,
      burrowLevel: raw`${players.burrowLevel} + 1`,
    }).where(eq(players.id, session.sub));

    const after = (await ownerView(session.sub))!;
    return Response.json({
      spent: cost,
      burrow: after.view,
      quest: questBoardOf(after.player),
    });
  }

  /**
   * RAISING A SHIELD — one out of the bag, one window over the burrow.
   *
   * The only item in the bag that is spent from THIS screen. The other carried
   * kinds (bomb, lightning, mirage) act on somebody else's island mid-run, so
   * they belong to the raid routes; traps are placed from `api/traps`.
   */
  if (action === 'shield') {
    const rows = await db.query.inventory.findMany({
      where: eq(inventory.playerId, session.sub),
    });
    const bag = holdings(rows, player);

    const blocker = shieldBlocker(bag, player.shieldedUntil, now.getTime());
    if (blocker) {
      return Response.json({ error: blocker, held: bag.shield }, { status: 400 });
    }

    const until = new Date(now.getTime() + RAID.ITEM_SHIELD_MS);
    const spent = await spendOne(session.sub, 'shield', async (tx) => {
      await tx.update(players)
        .set({ shieldedUntil: until })
        .where(eq(players.id, session.sub));
    });
    if (!spent) return Response.json({ error: 'none_held', held: 0 }, { status: 400 });

    return Response.json({
      raised: 'shield',
      until: until.toISOString(),
      burrow: (await ownerView(session.sub))!.view,
    });
  }

  /** POURING A BOOST — one bottle out of the bag, one window onto the garden. */
  if (action && action in BOOST_ACTION) {
    const kind = BOOST_ACTION[action];
    const rows = await db.query.inventory.findMany({
      where: eq(inventory.playerId, session.sub),
    });
    const bag = holdings(rows, player);

    const blocker = gardenBoostBlocker(kind, bag, player, now.getTime());
    if (blocker) {
      return Response.json({ error: blocker, held: bag[kind] }, { status: 400 });
    }

    const until = extendGardenBoost(
      kind,
      kind === 'water' ? player.wateredUntil : player.fertilisedUntil,
      1,
      now.getTime(),
    );

    const spent = await spendOne(session.sub, kind, async (tx) => {
      await tx.update(players)
        .set(kind === 'water' ? { wateredUntil: until } : { fertilisedUntil: until })
        .where(eq(players.id, session.sub));
    });

    if (!spent) return Response.json({ error: 'none_held', held: 0 }, { status: 400 });

    return Response.json({
      poured: kind,
      until: until.toISOString(),
      burrow: (await ownerView(session.sub))!.view,
    });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
