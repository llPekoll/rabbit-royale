/**
 * The exact bytes a wallet signs. PINNED — changing this string invalidates
 * every challenge in flight AND every wrapper build that hardcodes it, so a
 * test asserts it literally.
 *
 * Kept in its own module, apart from the login flow, because the client, the
 * Android wrapper and the tests all need the string while none of them should
 * pull in a database connection to get it.
 */
export function loginMessage(nonce: string): string {
  return `Sign in to Rabbit Royale\n\nnonce: ${nonce}`;
}
