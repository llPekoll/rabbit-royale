import type { NextConfig } from 'next';

const config: NextConfig = {
  // The island generator knows where every bomb is. It must never be bundled
  // into a client chunk — these packages stay server-side.
  serverExternalPackages: ['postgres', 'redis'],
};

export default config;
