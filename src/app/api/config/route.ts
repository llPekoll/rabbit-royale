/**
 * GET /api/config — the handful of values the browser needs at runtime.
 *
 * `NEXT_PUBLIC_*` is baked into the client bundle AT BUILD TIME, which makes it
 * the wrong tool here: the WS URL differs per environment, and baking it means
 * a rebuild to change where the game connects (and a Coolify build arg that the
 * API cannot even set). Serving it from the server at runtime means one image
 * runs anywhere and the URL is a redeploy, not a rebuild.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? process.env.WS_PUBLIC_URL ?? '',
  });
}
