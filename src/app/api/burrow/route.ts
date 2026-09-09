/**
 * The burrow: read it, upgrade it, harvest the garden.
 *
 * Every number here is DERIVED at read time from timestamps (see lib/game/regen)
 * — there is no job ticking players forward, which is what lets this hold a lot
 * of them.
 */
import { eq, sql as raw } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { applyRegen, currentHp, gardenYield } from '@/lib/game/regen';
import { burrowView, upgradeBlocker } from '@/lib/game/burrow';
import { upgradeCost } from '@config/tuning';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  return Response.json({ burrow: burrowView(player), player: applyRegen(player) });
}

/** `{ action: 'upgrade' | 'harvest' }`. */
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
    }).where(eq(players.id, session.sub));

    const after = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
    return Response.json({ harvested: ready, burrow: burrowView(after!) });
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

    // Settle the HP the burrow regenerated up to NOW before raising the level:
    // max HP is a function of level, so raising it without stamping the clock
    // would silently backdate the new, larger cap to the old timestamp.
    await db.update(players).set({
      stock: raw`${players.stock} - ${cost}`,
      burrowLevel: raw`${players.burrowLevel} + 1`,
      burrowHp: currentHp(player, now.getTime()),
      hpUpdatedAt: now,
    }).where(eq(players.id, session.sub));

    const after = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
    return Response.json({ spent: cost, burrow: burrowView(after!) });
  }

  return Response.json({ error: 'unknown action' }, { status: 400 });
}
