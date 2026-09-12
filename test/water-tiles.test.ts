/**
 * No scene draws the sea as TILES any more.
 *
 * `IsoIslandView` can stamp one water sprite per sea cell (`sea`) and edge it
 * with one foam sprite per shore cell (`foam`), and both default to ON. That is
 * the right default for the standalone views in Storybook, which draw an island
 * on a bare canvas and have nothing else to put around it.
 *
 * In the GAME it is wrong twice over, and both showed on a real screen:
 *
 *  - The pack's water is a flat teal of a different shade from the scene's own
 *    background, so stamped per cell it laid a lighter diamond over the whole
 *    grid — a visible carpet of squares around the land.
 *  - The foam ring is one sprite per cell, so on a grid this coarse the ring IS
 *    the grid: the coast climbed around the island in steps.
 *
 * Both scenes now pass `sea: false, foam: false` and let the scene's own
 * `BG_COLOR` be the sea, which is what the `Island/Water` stories do while the
 * continuous coastline in `game/fx` (PackWater) is built.
 *
 * Asserted by READING THE SOURCE rather than by rendering. What is being pinned
 * is a decision about which flags the game passes — a fact about the call, not
 * about pixels — and a headless canvas cannot see a teal diamond anyway. The
 * previous cut of this fix corrected the island and left the burrow drawing the
 * old water for another round; a test over BOTH construction sites is what
 * stops the next one from being half-applied.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..');

/**
 * The file with its comments removed.
 *
 * These files EXPLAIN the old behaviour at length — "`sea: true` was here to
 * stop the homestead reading as a lawn that stops" — and a bare grep sees the
 * prose as the code. Stripping comments first is what keeps the assertion about
 * what the game passes rather than about how it is described.
 */
function code(file: string): string {
  return readFileSync(join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/** Every place the GAME builds terrain. Stories are deliberately excluded. */
const SITES = [
  { name: 'the island', file: 'src/game/services/TerrainBackground.ts' },
  { name: 'the burrow', file: 'src/game/burrow/BurrowTerrain.ts' },
] as const;

describe('no scene draws the sea as tiles', () => {
  for (const site of SITES) {
    const src = code(site.file);

    it(`${site.name} turns the per-cell water off`, () => {
      expect(src, site.file).toMatch(/\bsea:\s*false/);
      expect(src, site.file).not.toMatch(/\bsea:\s*true/);
    });

    it(`${site.name} turns the per-cell surf off`, () => {
      // Explicitly, not by omission: `foam` defaults to true, so a call that
      // simply does not mention it draws the staircase.
      expect(src, site.file).toMatch(/\bfoam:\s*false/);
      expect(src, site.file).not.toMatch(/\bfoam:\s*true/);
    });
  }

  it('covers every place the game builds terrain', () => {
    // The guard above is only worth as much as its list, so the list is
    // checked against the tree rather than against a second copy of itself.
    // A new scene that drew terrain would otherwise be silently unguarded —
    // which is exactly how the burrow kept its tiled water for a round after
    // the island lost it.
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
      });

    const builders = walk(join(ROOT, 'src'))
      .filter((f) => /new IsoIslandView\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f))
      // Stories are the standalone views the ON default exists for.
      .filter((f) => !f.startsWith('src/stories/'))
      .sort();

    expect(builders).toEqual(SITES.map((s) => s.file).sort());
  });

  /**
   * And the replacement is actually wired up, in both scenes.
   *
   * Turning the tiled water off and not putting the continuous coast in its
   * place would leave the island with a hard cut-out edge — which is a worse
   * picture than the staircase was, and the kind of half-migration that is easy
   * to leave behind once the obvious artefact is gone.
   */
  for (const site of SITES) {
    const src = code(site.file);

    it(`${site.name} draws the continuous surf instead`, () => {
      expect(src, site.file).toMatch(/createPackWater\(/);
    });

    it(`${site.name} puts ducks on the water`, () => {
      expect(src, site.file).toMatch(/createDucks\(/);
    });

    it(`${site.name} takes its look from the shared constants`, () => {
      // Not inline numbers. Two scenes tuning their own foam is how the game
      // ends up with two different seas depending on the screen.
      expect(src, site.file).toMatch(/WATER_LOOK/);
      expect(src, site.file).toMatch(/DUCK_LOOK/);
    });
  }
});
