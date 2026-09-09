import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    // The game code imports through `@/…` exactly as Next resolves it; without
    // this the tests import a different module graph than the app runs.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@config': fileURLToPath(new URL('./config', import.meta.url)),
    },
  },
});
