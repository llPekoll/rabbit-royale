import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Storybook for RABBIT ROYALE. The game itself is Pixi inside a Vite app, so
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
    /* THE REACT PLUGIN IS NOT ADDED HERE ANY MORE, AND THAT IS THE FIX.
   
       This used to read "this is a Next repo: there is no vite.config, so the
       React plugin has to be declared here" — true when it was written, and
       false since the front moved onto Vite (2026-09-20). `vite.config.ts`
       now exists at the root, Storybook loads it like any other Vite app, and
       it already carries `react()`. Adding a second copy here put TWO React
       Refresh preambles in the same module graph, and every story in the book
       died on `SyntaxError: Identifier 'RefreshRuntime' has already been
       declared` — the whole book, not one story, which is why it reads as a
       config failure rather than a component bug.

       The alias stays: it is stated relative to THIS file, and the root
       config's own copy is relative to the root. Both resolve to the same two
       directories, and leaving it makes the book independent of whether the
       root config is picked up. */
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
