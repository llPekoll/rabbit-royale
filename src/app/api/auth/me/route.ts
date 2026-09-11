/**
 * GET /api/auth/me — the signed-in player, with regen applied.
 *
 * Serves guests and wallet players identically. A guest simply has a null
 * `wallet` and `guest: true`; everything else on the row is earned the same way.
 *
 * Energy and burrow HP are DERIVED from timestamps at read time rather than
 * ticked by a job. With a lot of players a per-player cron is the thing that
 * falls over first; a timestamp and a subtraction scale to any number of them.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { getSession, signSession } from '@/lib/auth/jwt';
import { applyRegen } from '@/lib/game/regen';

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 });

  const player = await db.query.players.findFirst({ where: eq(players.id, session.sub) });
  if (!player) return Response.json({ error: 'unknown player' }, { status: 404 });

  /**
   * Hand the token BACK when the caller proved itself with the cookie alone.
   *
   * The cookie is HttpOnly, so a browser that still holds a valid session
   * cannot read it — and the WS handshake needs the token in JS. Without this,
   * a player whose localStorage was cleared (or who came back on a browser that
   * dropped it) looked signed out to the client while the server still knew
   * exactly who they were, and the doorstep offered them a NEW guest burrow on
   * top of the one they already owned.
   *
   * Only minted when there was no Authorization header: a caller that already
   * has the token does not need it repeated, and this keeps the response
   * identical to what it was for every existing caller.
   */
  const viaCookie = !req.headers.get('authorization');
  const token = viaCookie
    ? await signSession({ sub: player.id, wallet: player.wallet, name: player.name })
    : null;

  // `guest` rides alongside the row rather than being derived by the client
  // from a null wallet — one field, read the same way in every screen, and the
  // server stays the thing that decides what a guest is.
  return Response.json({
    player: { ...applyRegen(player), guest: !player.wallet },
    ...(token ? { token } : {}),
  });
}
