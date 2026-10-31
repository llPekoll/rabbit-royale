/**
 * WHICH WORLD this deployment serves (2026-10-18).
 *
 * Rabbit Royale runs as two worlds that never meet: web3 (the Seeker app and
 * sol.rabbit.rip/play — Solana wallet, crypto payments, the Crown Race) and web2
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
 * The Play app's package (godot/export_presets.cfg, "Android Play (web2)").
 * Its deep link brings a Google sign-in back into the app (lib/auth/handoff.ts),
 * and the Play Developer API names the app by it.
 */
export function playPackage(): string {
  return process.env.PLAY_PACKAGE_NAME?.trim() || 'pro.gravity5.rabbitroyale';
}

/**
 * The App Store app's bundle id (godot/export_presets.cfg, "iOS"): the
 * audience of its Sign in with Apple tokens, and the scheme its Google sheet
 * closes on (lib/auth/handoff.ts).
 */
export function appleBundleId(): string {
  return process.env.APPLE_BUNDLE_ID?.trim() || 'pro.gravity5.rabbitroyale';
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
  '/api/genesis',
]);

/**
 * The /api routes that only exist in the web2 world: buying through Google
 * Play, the App Store and Stripe (the web build), and the App Store app's
 * Sign in with Apple. The Seeker and sol.rabbit.rip pay in crypto, and a
 * store purchase on a web3 burrow would be money landing in the wrong world.
 */
export const WEB2_ONLY_ROUTES: ReadonlySet<string> = new Set([
  '/api/store/play',
  '/api/store/stripe',
  '/api/store/stripe/webhook',
  '/api/auth/apple/native',
]);
