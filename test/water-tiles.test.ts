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
import { isoProject, isoBounds } from '../src/game/island/iso';
import { TILE } from '../src/game/island/tileset';
import { terrainFor } from '../src/lib/game/terrainBoard';
import { ISO_ORIGIN_X, ISO_ORIGIN_Y } from '../src/config/gridConfig';
import { HALF_W, HALF_H, tilePos, toIndex } from '../src/config/gridConfig';
import { TIER_LIFT } from '../src/lib/game/terrainBoard';
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

    it(`${site.name} places the surf in the terrain's own frame`, () => {
      // Two halves, and BOTH were got wrong once each.
      //
      // The `at` callback must project through `isoProject` — the same call
      // `IsoIslandView.stamp` makes — never through the board's
      // `tilePos`/`burrowTilePos`, which answer in the scene's frame.
      expect(src, site.file).toMatch(/const at = [^\n]*isoProject\(/);
      expect(src, site.file).not.toMatch(/const at = [^\n]*(?:burrowT|t)ilePos\(/);
      // And the layer must join the GROUND, not the view: those are one
      // `bounds.origin` apart, so projecting correctly into the wrong parent
      // throws the surf just as far off, in the other direction.
      expect(src, site.file).toMatch(/\.ground\.addChild\(sea\)/);
      expect(src, site.file).not.toMatch(/\.view\.addChild\(sea\)/);
    });

    it(`${site.name} takes its look from the shared constants`, () => {
      // Not inline numbers. Two scenes tuning their own foam is how the game
      // ends up with two different seas depending on the screen.
      expect(src, site.file).toMatch(/WATER_LOOK/);
      expect(src, site.file).toMatch(/DUCK_LOOK/);
    });
  }

  /**
   * The surf is addressed in the TERRAIN's frame, not the board's.
   *
   * These are two different coordinate systems that agree on nothing but their
   * spacing. `island.view` carries `bounds.origin` — the inset from the
   * lattice's bounding box to its cell (0,0) — while the board's `tilePos`
   * already has that worked into scene coordinates. The water lives INSIDE the
   * view, so it must use the view's frame; addressing it with `tilePos`
   * shipped once, and put the surf a constant (-352, -36) off the coast: a raft
   * of pale tiles adrift beside the island instead of a line breaking on it.
   *
   * Pinned as arithmetic because it is arithmetic. A headless canvas cannot see
   * a misplaced sprite, but the gap between the two projections is a number,
   * and it is large — a third of the board — so this fails loudly if the call
   * ever reverts to the board's helper.
   */
  it('the two projections really are different frames', () => {
    const metrics = { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT };
    // What `createPackWater` is handed (and what `IsoIslandView.stamp` uses).
    const terrain = isoProject(0.5, 0.5, 0, metrics);
    // What the BOARD would answer for the same cell.
    const board = tilePos(toIndex(0, 0));

    // Not equal, and not nearly equal: a fix that made them agree by accident
    // would leave this test passing over a bug it was written to catch.
    expect(Math.hypot(terrain.x - board.x, terrain.y - board.y)).toBeGreaterThan(100);
  });

  /**
   * The surf lands on the board's diamonds — end to end, in numbers.
   *
   * The checks above are about the SHAPE of the call, and shape alone was not
   * enough: this bug shipped twice, once from the wrong projection and once
   * from the right projection in the wrong parent, and each time the code read
   * plausibly. This composes the whole chain the way the scene does —
   * `view.position` + `ground.position` + `at(cell)` — and compares it against
   * what the BOARD says the same cell is at. They have to agree exactly, since
   * the terrain is deliberately pinned to the board's grid.
   */
  it('the surf lands exactly on the board\'s cells', () => {
    const seed = 'island-1';
    const { map } = terrainFor(seed);
    const metrics = { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT };

    // The view's own inset, computed the way IsoIslandView computes it.
    const bounds = isoBounds(map.width, map.height, map.tiers, metrics, TILE / 2);
    const origin = isoProject(0.5, 0.5, 0, metrics);
    // Where TerrainBackground puts the view so cell (0,0) meets the board's.
    const view = {
      x: ISO_ORIGIN_X - origin.x - bounds.originX,
      y: ISO_ORIGIN_Y - origin.y - bounds.originY,
    };

    for (const [x, y] of [[0, 0], [8, 8], [15, 15], [0, 15], [15, 0]] as const) {
      // A foam sprite: added to `ground`, positioned at `at(x, y)`.
      const at = isoProject(x + 0.5, y + 0.5, 0, metrics);
      const abs = {
        x: view.x + bounds.originX + at.x,
        y: view.y + bounds.originY + at.y,
      };
      const board = tilePos(toIndex(x, y));
      expect(abs.x, `cell ${x},${y} x`).toBeCloseTo(board.x, 6);
      expect(abs.y, `cell ${x},${y} y`).toBeCloseTo(board.y, 6);
    }
  });
});
