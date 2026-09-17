// Runs the robot-player simulator (tools/sim-dig.sim.ts) with the app's
// aliases. Kept out of the suite: it takes a minute and asserts nothing.
// Standalone rather than merged with ../vitest.config.ts — merging APPENDS to
// `include`, and the whole suite then runs alongside the simulator.
//
//   SIM_OUT=/tmp/sim.txt npx vitest run -c tools/vitest.sim.config.ts tools/sim-dig.sim.ts
//   ECON_OUT=/tmp/day.txt npx vitest run -c tools/vitest.sim.config.ts tools/economy-day.sim.ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    root: fileURLToPath(new URL('..', import.meta.url)),
    include: ['tools/**/*.sim.ts'],
    testTimeout: 900_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
      '@config': fileURLToPath(new URL('../config', import.meta.url)),
    },
  },
});
