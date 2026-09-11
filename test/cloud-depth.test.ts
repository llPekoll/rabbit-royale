/**
 * Clouds drift over the sea, not under it.
 *
 * `Clouds.ts` puts its layer at -9 and says why in a comment: the backdrop is
 * "at -10", the tiles start at 0, so the gap between them is the one place a
 * cloud can be seen without ever crossing the numbers the board is read from.
 *
 * Only the burrow's backdrop actually had that -10. The island's terrain was
 * added with `addChildAt(view, 0)` and no zIndex at all — and an insertion
 * index means nothing in a `sortableChildren` container, so it sorted at the
 * default 0 and covered the clouds. On the island, and only there, the weather
 * passed behind the sea.
 *
 * Source-read rather than rendered: standing up Pixi, a tileset and a WebGL
 * context to assert one number is far more machinery than the number is worth.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const CLOUDS = read('../src/game/fx/Clouds.ts');
const TERRAIN = read('../src/game/services/TerrainBackground.ts');
const BURROW = read('../src/game/scenes/BurrowScene.ts');

describe('cloud depth', () => {
  it('keeps the cloud layer between the backdrop and the board', () => {
    expect(CLOUDS).toMatch(/const Z = -9;/);
  });

  it('puts the island terrain below the clouds, not at the default 0', () => {
    expect(TERRAIN).toMatch(/island\.view\.zIndex = -10;/);
  });

  it('does not rely on insertion order inside a sorted container', () => {
    // addChildAt(view, 0) was the bug: it reads as "first, so behind", and a
    // sorted container ignores it entirely.
    expect(TERRAIN).not.toMatch(/addChildAt\(island\.view, 0\)/);
  });

  it('agrees with the burrow, which had it right all along', () => {
    expect(BURROW).toMatch(/zIndex = -10;/);
  });
});
