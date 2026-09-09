/**
 * POST /api/auth/challenge — mint the message a wallet must sign.
 *
 * No session required: this runs BEFORE anyone is signed in. It only accepts a
 * well-formed address and reveals nothing about whether that address has ever
 * played, so it cannot be used to probe the player list.
 */
import { issueLoginChallenge } from '@/lib/auth/wallet-login';

export async function POST(req: Request) {
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address) return Response.json({ error: 'address required' }, { status: 400 });

  const challenge = await issueLoginChallenge(address);
  if (!challenge) return Response.json({ error: 'invalid address' }, { status: 400 });

  return Response.json(challenge);
}
