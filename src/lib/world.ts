/**
 * WHICH WORLD this deployment serves (2026-10-18).
 *
 * Rabbit Royale runs as two worlds that never meet: web3 (the Seeker app and
 * rabbit.rip/play — Solana wallet, crypto payments, the Crown Race) and web2
 * (Google Play, the App Store, CrazyGames, itch.io — none of that). They do not
 * share a database: each world is its own deployment, the way each region is,
 * so a player of one can never be seated, raided or ranked against a player of
 * the other, and one Google login opens a different burrow in each.
 *
 * `RR_WORLD=web2` on a deployment switches off everything crypto: wallet
 * sign-in and linking, every payment route, the Alchemy webhook, and the Crown
 * Race pot. Anything else — unset, a typo — is web3, so the servers that run
 * today keep running exactly as they do.
 */
export type World = 'web2' | 'web3';

export function world(): World {
  return process.env.RR_WORLD === 'web2' ? 'web2' : 'web3';
}

export function isWeb2(): boolean {
  return world() === 'web2';
}

/**
 * The /api routes that only exist in the web3 world. The router answers 404
 * for them on a web2 deployment — a route that is not there, rather than a
 * refusal a store reviewer could read as "the crypto is just switched off".
 */
export const WEB3_ONLY_ROUTES: ReadonlySet<string> = new Set([
  '/api/auth/challenge',
  '/api/auth/verify',
  '/api/auth/link',
  '/api/shop/pay',
  '/api/shop/pay/failed',
  '/api/shop/claim',
  '/api/webhooks/alchemy',
]);
