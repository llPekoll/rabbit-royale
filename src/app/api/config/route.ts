/**
 * GET /api/config — the handful of values the browser needs at runtime.
 *
 * `NEXT_PUBLIC_*` is baked into the client bundle AT BUILD TIME, which makes it
 * the wrong tool here: the WS URL differs per environment, and baking it means
 * a rebuild to change where the game connects (and a Coolify build arg that the
 * API cannot even set). Serving it from the server at runtime means one image
 * runs anywhere and the URL is a redeploy, not a rebuild.
 */
import { clientOverrides, refreshTuningIfStale } from '@/lib/tuning/live';

export const dynamic = 'force-dynamic';

export function GET() {
  // Non-blocking: answers with the snapshot in hand (rr-ws refreshes it every
  // 30 s anyway), never a database read on this path.
  refreshTuningIfStale();
  return Response.json({
    wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? process.env.WS_PUBLIC_URL ?? '',
    /**
     * Whether the browser may build a USDC transfer — NOT where.
     *
     * This used to serve the Alchemy URL itself, which put the API key in the
     * page source for anyone to lift, and forced the Alchemy account's IP
     * allowlist off (the callers are players, from everywhere). The browser now
     * talks to /api/rpc, which relays to Alchemy from the server: the key never
     * leaves the environment and Alchemy only ever sees one IP.
     *
     * False means the money route is off, and the shop hides its USDC buttons
     * rather than offering a payment that cannot complete.
     */
    payments: Boolean(process.env.SOLANA_RPC_URL),
    /**
     * The `tuning` overrides in force, `{ "RAID_RUN.TOLL": 50, … }` — aliases
     * included (`ENERGY.MAX` beside `OUT_OF_RUN_ENERGY.MAX`). The client merges
     * them over its bundled tuning.json so it quotes the numbers the server
     * charges; `{}` means "the file's numbers" and undoes earlier overrides.
     */
    tuning: clientOverrides(),
  });
}
