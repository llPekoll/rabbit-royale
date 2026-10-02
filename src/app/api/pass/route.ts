/**
 * The Crown Race Ticket screen: GET what it is and where the race stands.
 *
 * Buying goes through /api/shop/pay with kind `season_pass` — the same quote,
 * sign, confirm rail as every other paid item, so the pass inherits the
 * signature replay guard, the webhook and the claim sweep for free.
 *
 * GET works signed out (the offer is public); `mine` is null then.
 */
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth/jwt';
import {
  holderCount, holderRank, openSeason, passOf, passPriceUsd,
  passSaleBlocker, payoutPlan, potCents, prizePoolCents, rankedHolders, skinOf,
} from '@/lib/game/season-pass';
import { PASS } from '@config/tuning';
import { looksOf } from '@/lib/game/look';

export const dynamic = 'force-dynamic';

const dollars = (cents: number) => Math.round(cents) / 100;

/** The whole screen for `playerId` (or for nobody). */
export async function passState(playerId: string | null, now = Date.now()) {
  const season = await openSeason();
  const on = !!season?.passOn;
  const pot = on ? await potCents(db, season!.id) : 0;
  const plan = on ? payoutPlan(pot, await rankedHolders(db, season!.id)) : [];
  // Every holder wears the ticket's skin: the race is drawn in it (look.ts).
  const looks = await looksOf(plan.map((p) => ({ id: p.playerId, avatar: p.avatar })));

  let mine: null | {
    holder: boolean;
    rank: number | null;
    prizeUsd: number;
    /** The ticket's skin once ever bought, else null. */
    skin: string | null;
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
      skin: await skinOf(playerId),
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
      skin: PASS.SKIN,
      /** Share of the prize pool per rank, 1st first. */
      shares: PASS.PAYOUT_SHARES,
    },
    /** The race for the pot: the top holders and what they would take if it ended now. */
    top: plan.map((p) => ({
      rank: p.rank, playerId: p.playerId, name: p.name, avatar: p.avatar, look: looks.get(p.playerId), score: p.score,
      prizeUsd: dollars(p.usdCents),
    })),
    mine,
  };
}

export async function GET(req: Request) {
  const session = await getSession(req);
  return Response.json(await passState(session?.sub ?? null));
}
