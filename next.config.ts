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
};

export default config;
