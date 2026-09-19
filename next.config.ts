import type { NextConfig } from 'next';

const config: NextConfig = {
  // The Docker image copies .next/standalone — Next only emits it when asked.
  output: 'standalone',

  // Pixi owns the WebGL canvas imperatively. StrictMode's dev-only mount →
  // unmount → remount double-inits Pixi on the SAME canvas: the first app tears
  // the WebGL context down, and the second then fails to link its shaders on
  // the dead context. Both the arena and the original RR disable it for exactly
  // this reason.
  reactStrictMode: false,

  // @domin8/arcade-kit ships TS/TSX source (bitmap fonts, 9-slice buttons, the
  // coin frames), so Next has to transpile it rather than treat it as built JS.
  transpilePackages: ['@domin8/arcade-kit'],

  // The island generator knows where every bomb is. It must never be bundled
  // into a client chunk — these packages stay server-side.
  serverExternalPackages: ['postgres', 'redis'],

  /**
   * Cache the artwork hard.
   *
   * Next serves `public/` with `max-age=0`, so a browser REVALIDATES every
   * image on every load. That is one round trip per asset, and the server is in
   * Finland — from south-east Asia the handshakes alone cost more than the
   * bytes. The art is immutable (a change ships under a new filename), so it is
   * safe to tell the browser to keep it for a year and never ask again.
   *
   * PRODUCTION ONLY. In dev the art is anything but immutable: a tile sheet
   * gets regenerated a dozen times an hour under the SAME filename, and its
   * cache-buster (`?layout=N`, `?v=N` — see isoworld/sheet.ts and decor.ts)
   * is bumped at commit time, not at every regeneration. With this header on
   * in dev, the browser kept the first version it saw of each URL for a year
   * and no reload could shake it: the local board showed a sheet several
   * revisions old, sliced with the current offsets, while the deployed site —
   * which only ever served each URL once — was fine. Dev asks the browser to
   * revalidate instead; Next's ETag turns that into a cheap 304 when nothing
   * has changed.
   */
  /**
   * Les routes /api/* vivent desormais dans le serveur socket.
   *
   * Elles n'importaient rien de Next (que du `Request -> Response`), et
   * l'app native a besoin d'UNE seule origine pour l'API et le WebSocket :
   * elles sont donc servies par `server/index.ts` (voir server/api-router.ts).
   *
   * Next les renvoie la-bas plutot que de les servir lui-meme, pour qu'il
   * n'existe qu'une implementation pendant la migration. Les fichiers de
   * `src/app/api` restent en place : ce sont eux que le serveur importe.
   *
   * Quand le web passera sous Expo, ce bloc et `src/app/api` disparaissent
   * ensemble.
   */
  async rewrites() {
    const cible = process.env.API_SERVER_URL ?? process.env.NEXT_PUBLIC_WS_URL;
    if (!cible) return [];
    const base = cible.replace(/\/+$/, '');
    return [{ source: '/api/:path*', destination: `${base}/api/:path*` }];
  },

  async headers() {
    const artwork =
      process.env.NODE_ENV === 'production'
        ? 'public, max-age=31536000, immutable'
        : 'no-cache';
    return [
      {
        source: '/assets/:path*',
        headers: [{ key: 'Cache-Control', value: artwork }],
      },
    ];
  },
};

export default config;
