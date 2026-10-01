/**
 * The season pass screen: GET what it is and where the race stands, POST to
 * open today's chest.
 *
 * Buying goes through /api/shop/pay with kind `season_pass` — the same quote,
 * sign, confirm rail as every other paid item, so the pass inherits the
 * signature replay guard, the webhook and the claim sweep for free.
 *
 * GET works signed out (the offer is public); `mine` is null then.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { seasonPasses } from '@/lib/db/schema';
import { getSession } from '@/lib/auth/jwt';
import { overLimit, tooMany } from '@/lib/rate-limit';
import { grantItem, refillEnergy } from '@/lib/game/grant';
import {
  canClaimDaily, holderCount, holderRank, nextClaimAt, openSeason, passOf, passPriceUsd,
  passSaleBlocker, payoutPlan, potCents, prizePoolCents, rankedHolders,
} from '@/lib/game/season-pass';
import { PASS } from '@config/tuning';

export const dynamic = 'force-dynamic';

const dollars = (cents: number) => Math.round(cents) / 100;

/** The whole screen for `playerId` (or for nobody). */
export async function passState(playerId: string | null, now = Date.now()) {
  const season = await openSeason();
  const on = !!season?.passOn;
  const pot = on ? await potCents(db, season!.id) : 0;
  const plan = on ? payoutPlan(pot, await rankedHolders(db, season!.id)) : [];

  let mine: null | {
    holder: boolean;
    rank: number | null;
    prizeUsd: number;
    canClaim: boolean;
    nextClaimAt: string | null;
    blocker: string | null;
  } = null;
  if (playerId) {
    const held = season ? await passOf(db, season.id, playerId) : null;
    const rank = held && season ? await holderRank(db, season.id, playerId) : null;
    const seat = plan.find((p) => p.playerId === playerId);
    mine = {
      holder: held !== null,
      rank,
      prizeUsd: dollars(seat?.usdCents ?? 0),
      canClaim: !!held && on && canClaimDaily(held.lastClaimAt, now),
      nextClaimAt: held ? nextClaimAt(held.lastClaimAt, now).toISOString() : null,
      blocker: passSaleBlocker(season, held !== null, now),
    };
  }

  return {
    on,
    season: season ? { id: season.id, startedAt: season.startedAt, endsAt: season.endsAt } : null,
    priceUsd: passPriceUsd(),
    potUsd: dollars(pot),
    prizePoolUsd: dollars(prizePoolCents(pot)),
    potShare: PASS.POT_SHARE,
    holders: on ? await holderCount(db, season!.id) : 0,
    /** What the pass gives — the screen lists it from here, not from its own copy. */
    rewards: {
      daily: PASS.DAILY,
      /** Share of the prize pool per rank, 1st first. */
      shares: PASS.PAYOUT_SHARES,
    },
    /** The race for the pot: the top holders and what they would take if it ended now. */
    top: plan.map((p) => ({
      rank: p.rank, playerId: p.playerId, name: p.name, avatar: p.avatar, score: p.score,
      prizeUsd: dollars(p.usdCents),
    })),
    mine,
  };
}

export async function GET(req: Request) {
  const session = await getSession(req);
  return Response.json(await passState(session?.sub ?? null));
}

/** Open today's chest. One per UTC day, while the pass season runs. */
export async function POST(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });
  if (await overLimit('pass', session.sub, 10)) return tooMany();

  const now = Date.now();
  const outcome = await db.transaction(async (tx) => {
    const season = await openSeason(tx);
    if (!season?.passOn) return 'pass_closed' as const;
    // Locked, so two taps cannot open the same chest twice.
    const [held] = await tx.select().from(seasonPasses)
      .where(and(eq(seasonPasses.seasonId, season.id), eq(seasonPasses.playerId, session.sub)))
      .for('update');
    if (!held) return 'no_pass' as const;
    if (!canClaimDaily(held.lastClaimAt, now)) return 'already_claimed' as const;

    const { energy, trap, bloop } = PASS.DAILY;
    if (energy > 0) await refillEnergy(tx, session.sub, energy, now, false);
    if (trap > 0) await grantItem(tx, session.sub, 'trap', trap, now);
    if (bloop > 0) await grantItem(tx, session.sub, 'bloop', bloop, now);

    await tx.update(seasonPasses).set({ lastClaimAt: new Date(now) })
      .where(and(eq(seasonPasses.seasonId, season.id), eq(seasonPasses.playerId, session.sub)));
    return 'ok' as const;
  });

  if (outcome !== 'ok') {
    return Response.json({ error: outcome, ...(await passState(session.sub, now)) }, { status: outcome === 'already_claimed' ? 409 : 403 });
  }
  return Response.json({ claimed: PASS.DAILY, ...(await passState(session.sub, now)) });
}
