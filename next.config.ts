import type { NextConfig } from 'next';

const config: NextConfig = {
  // The Docker image copies .next/standalone — Next only emits it when asked.
  output: 'standalone',
  // The island generator knows where every bomb is. It must never be bundled
  // into a client chunk — these packages stay server-side.
  serverExternalPackages: ['postgres', 'redis'],
};

export default config;
