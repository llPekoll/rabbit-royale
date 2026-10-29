/**
 * Sign in with Apple, on the App Store app (2026-10-29).
 *
 * The game never sees a web page: the RabbitApple plugin opens Apple's own
 * sheet (ASAuthorizationController) and hands back an identityToken — a JWT
 * Apple signed for our bundle id — which api/auth/apple/native checks here
 * against Apple's published keys. App Store rule 4.8: an app that offers
 * Google sign-in must offer this one too.
 *
 * Apple gives the address once, at the first sign-in, and may give a relay
 * (`…@privaterelay.appleid.com`). Either is verified, so it meets an email
 * burrow of the same address exactly like Google does (lib/auth/identity.ts).
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { appleBundleId } from '@/lib/world';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export interface AppleIdentity {
  sub: string;
  email: string | null;
}

export async function verifyAppleIdentityToken(token: string): Promise<AppleIdentity> {
  const { payload } = await jwtVerify(token, APPLE_KEYS, { issuer: APPLE_ISSUER, audience: appleBundleId() });
  const claims = payload as { sub?: string; email?: string; email_verified?: boolean | string };
  if (!claims.sub) throw new Error('apple identityToken: no sub');
  const verified = claims.email_verified === true || claims.email_verified === 'true';
  return { sub: claims.sub, email: verified && claims.email ? claims.email.toLowerCase() : null };
}
