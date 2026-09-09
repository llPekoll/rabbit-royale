import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import type { StorybookConfig } from '@storybook/react-vite';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Storybook for RABBIT ROYALE. The game itself is Pixi inside a Next app, so
 * most of what is worth reviewing in isolation is CANVAS, not React: a story
 * mounts a small Pixi app and drives one entity (the logo's ember field, a
 * tile with a chest on it, a whole board's chest spawn) with the SAME code the
 * game runs — no forked copy, or the story stops being evidence.
 *
 * `bun run storybook` (port 6007 — the hub's own Storybook owns 6006, and the
 * two are routinely open side by side).
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  framework: { name: '@storybook/react-vite', options: {} },
  // Sprites are referenced by absolute path ("/assets/…") exactly as the game
  // does, so Storybook must serve /public at the web root.
  staticDirs: [join(here, '../public')],
  viteFinal: async (cfg) => {
    // This is a Next repo: there is no vite.config, so the React plugin and
    // the `@/*` → `src/*` alias have to be declared here.
    cfg.plugins = [...(cfg.plugins ?? []), react()];
    cfg.resolve = {
      ...cfg.resolve,
      tsconfigPaths: true,
      alias: {
        ...(cfg.resolve?.alias ?? {}),
        '@': join(here, '../src'),
        '@config': join(here, '../config'),
      },
    };
    return cfg;
  },
};

export default config;
