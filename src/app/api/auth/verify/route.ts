/**
 * POST /api/auth/verify — check the signature, hand back a session.
 *
 * The wallet IS the account: on the Seeker this is a Seed Vault prompt, on
 * desktop a browser wallet. There is no email, no password and no recovery flow
 * to phish, which is the point.
 *
 * The token is set as an httpOnly cookie AND returned in the body — the browser
 * uses the cookie, the Android wrapper and the WS handshake use the value.
 */
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { players } from '@/lib/db/schema';
import { resolveWalletPlayer, verifyLoginChallenge } from '@/lib/auth/wallet-login';
import { SESSION_COOKIE, signSession } from '@/lib/auth/jwt';

export async function POST(req: Request) {
  const { address, signature } = (await req.json().catch(() => ({}))) as {
    address?: string;
    signature?: string;
  };
  if (!address || !signature) {
    return Response.json({ error: 'address and signature required' }, { status: 400 });
  }

  if (!(await verifyLoginChallenge(address, signature))) {
    // Deliberately one message for every failure mode (bad signature, expired
    // nonce, no nonce): distinguishing them tells an attacker which half to fix.
    return Response.json({ error: 'invalid signature' }, { status: 401 });
  }

  const playerId = await resolveWalletPlayer(address);
  const player = await db.query.players.findFirst({ where: eq(players.id, playerId) });
  const token = await signSession({ sub: playerId, wallet: address, name: player!.name });

  return Response.json(
    { token, player: { id: playerId, name: player!.name, wallet: address } },
    {
      headers: {
        'Set-Cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
      },
    },
  );
}
