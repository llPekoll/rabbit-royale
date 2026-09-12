/**
 * How the island is layered: what draws in front of what, and what the pointer
 * sees.
 *
 * Three decisions, each of which was a visible bug before it was pinned here:
 *
 *   - a cell is ONE block. Faces, rim and grass go in one container with one
 *     depth, so a neighbour can never sort into the gaps between them;
 *   - a tile's VEIL lives in that block, over the cell's own grass. With the
 *     whole terrain behind the board, a raised veil lay straight on the lower
 *     veil it overlapped and every terrace edge wore a double-dark wedge; the
 *     cell's opaque grass now sits between the two;
 *   - the pointer sees the veil, and the wall in front of it. The tile's
 *     container floats above everything with the hints, so it must not answer
 *     for a veil hidden under rock.
 *
 * Source-read rather than rendered: standing up Pixi and a WebGL context to
 * assert a handful of arrangements is more machinery than they are worth, and
 * `Island/TileDepth` in Storybook renders every one of them for the eye.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TIER_LIFT } from '../src/lib/game/terrainBoard';
import { HALF_W, HALF_H } from '../src/config/gridConfig';

const VIEW = readFileSync(new URL('../src/game/island/IsoIslandView.ts', import.meta.url), 'utf8');

/** The metrics the game actually draws the island at. */
const METRICS = { w: HALF_W * 2, h: HALF_H * 2, z: TIER_LIFT };

describe('the tier lift is one number everywhere', () => {
  it('agrees with the tile the click resolves to', () => {
    // `terrainTileAt` steps the tiers in TIER_LIFT, so the drawn face has to be
    // TIER_LIFT tall or the picture and the input disagree by the difference.
    const BOARD = readFileSync(new URL('../src/lib/game/terrainBoard.ts', import.meta.url), 'utf8');
    expect(BOARD).toMatch(/screenToTile\(sx, sy \+ tier \* TIER_LIFT\)/);
    expect(METRICS.z).toBe(TIER_LIFT);
  });
});

/**
 * One container per cell — the arrangement that ends the class of bug.
 *
 * Face heights, veil depths, deco depths: each overlap had its own fix, and a
 * new one turned up every time, because the ARRANGEMENT was what allowed them.
 * A cell used to be four loose siblings in one sorted world — faces at
 * `depth - 1 - i`, the rock rim at `depth`, the grass at `depth` — so a
 * neighbouring cell could sort into the gaps between them.
 *
 * A cell cannot interleave with a cell. The block draws together or not at all,
 * which is also what a dissolve wants and what makes a cell one thing to
 * hit-test rather than four.
 */
describe('a cell is one block', () => {
  it('gives every cell its own container', () => {
    expect(VIEW).toMatch(/const block = new Container\(\);/);
    expect(VIEW).toMatch(/block\.sortableChildren = true;/);
  });

  it('sorts the block as a whole, at the cell depth', () => {
    expect(VIEW).toMatch(/block\.zIndex = depth;/);
  });

  it('stamps the cell parts INTO the block, not into the world', () => {
    // The faces used to go straight into `world` at depth - 1 - i, which is
    // precisely the range a neighbour could land in.
    expect(VIEW).not.toMatch(/this\.stamp\(world, face,/);
    expect(VIEW).toMatch(/this\.stamp\(block, face,/);
    expect(VIEW).toMatch(/this\.stampGround\(block,/);
  });

  it('keeps the parts ordered among THEMSELVES, in local depths', () => {
    // Local numbers: faces below (-1 - i), rim at 0, grass at 1. Small on
    // purpose — they only ever compete inside one cell.
    expect(VIEW).toMatch(/tier, -1 - i, 0\)/);
  });
});

/**
 * A tile's veil lives in its cell's terrain block.
 *
 * With the whole terrain behind the board, every veil sat above every other
 * cell's grass — so where a raised tile overlapped a lower one, its veil lay
 * straight on the lower veil with nothing opaque between them, and each
 * terrace edge wore a double-dark wedge. Two attempts went at the symptom
 * (thinning the veils in the way; not dealing hidden tiles) and both were
 * worse than the wedge. The fix is where the veil is DRAWN: inside the block,
 * over the cell's own grass, which is opaque and now sits between the two.
 */
describe('a veil is part of its cell', () => {
  const SCENE = readFileSync(new URL('../src/game/scenes/IslandScene.ts', import.meta.url), 'utf8');
  const TILE = readFileSync(new URL('../src/game/entities/Tile.ts', import.meta.url), 'utf8');

  it('is mounted in the terrain block by the scene', () => {
    // The local depth rides along now: a cell holds three flat diamonds (the
    // fog, the highlight, the blink) and they have to stack in a fixed order
    // INSIDE the block rather than compound above the whole scene.
    expect(SCENE).toMatch(/tile\.mountVeil\(\(veil, z\) => this\.background\?\.mountVeil\(i, veil, z\)/);
  });

  /**
   * Every flat diamond mounts — not just the fog.
   *
   * The highlight and the blink are the same shape as the veil and lie just
   * as flat, so leaving them in the tile's container was the same bug twice
   * over: the texture draws ~21px tall against an 18px tier lift, so each one
   * overhangs the cell behind it, and two translucent quads over one pixel
   * compound. With the highlight up, the wedge along a terrace edge was gold.
   */
  it('mounts the highlight and the blink as well as the fog', () => {
    expect(TILE).toMatch(/host\(this\.fog, 2\)/);
    expect(TILE).toMatch(/host\(this\.highlightGfx, 4\)/);
    expect(TILE).toMatch(/host\(this\.blinkGfx, 5\)/);
  });

  it('draws last inside the block, over the grass', () => {
    // 2 is the DEFAULT rather than a constant now: a cell can hold more than
    // one mounted thing, and the burrow stacks a bomb's marker over the
    // placement diamond on the same cell (zIndex 3). What matters here is
    // unchanged — whatever a caller mounts lands above the grass.
    expect(VIEW).toMatch(/zIndex = 2\b/);
    expect(VIEW).toMatch(/veil\.zIndex = zIndex;/);
    // Grass is 1: the veil is the one thing a cell paints after it.
    expect(VIEW).toMatch(/x, y, tier, 1\)\);/);
  });

  it('goes back under the tile if there is no block to hold it', () => {
    expect(TILE).toMatch(/if \(!host\(this\.fog, 2\)\) this\.container\.addChildAt\(this\.fog, 0\);/);
  });

  it('is destroyed with its tile even though it is not its child', () => {
    // All three deported diamonds, not just the fog: whichever of them the
    // terrain accepted is no longer the container's child, so destroying the
    // container would leave it behind on the island.
    expect(TILE).toMatch(/for \(const d of \[this\.fog, this\.highlightGfx, this\.blinkGfx\]\)/);
    expect(TILE).toMatch(/d\.parent !== this\.container && !d\.destroyed\) d\.destroy\(\)/);
  });
});

/**
 * The pointer sees the veil, and the wall in front of it.
 *
 * A raised tile's wall lands on its lower neighbours; with the tile CONTAINER
 * as the hit target (a bare diamond, floating above everything), the pointer
 * over that wall lit the tile under it — rock on screen, a glowing tile under
 * the cursor. The veil is the tile as drawn, so it is the thing to hit: it
 * sorts with the ground, a raised veil is tested before the veil it covers,
 * and the wall itself catches the pointer so nothing under it lights.
 *
 * And a tap is resolved once: a tap on a tile used to be handled by the tile
 * and then AGAIN by the scene through the flat-projection resolver, which
 * could name a different tile and fire a second move.
 */
describe('the pointer sees the veil', () => {
  const SCENE = readFileSync(new URL('../src/game/scenes/IslandScene.ts', import.meta.url), 'utf8');
  const TILE = readFileSync(new URL('../src/game/entities/Tile.ts', import.meta.url), 'utf8');

  it('makes the veil the interactive surface, not the container', () => {
    expect(TILE).toMatch(/this\.container\.eventMode = 'passive';/);
    expect(TILE).toMatch(/this\.fog\.eventMode = 'static';/);
    expect(TILE).toMatch(/this\.fog\.on\('pointerdown', fn\);/);
    expect(SCENE).toMatch(/tile\.onTap\(\(\) => this\.requestMove\(i\)\);/);
  });

  it('lets the wall catch the pointer over the veil it covers', () => {
    expect(VIEW).toMatch(/sprite\.eventMode = 'static';/);
    expect(VIEW).toMatch(/sprite\.label = 'wall';/);
  });

  it('confines the wall to its own cell, so it swallows no neighbour', () => {
    // A face sprite is the sheet's full 64x64 while a cell is `w` by `z`. Hit
    // tested by its bounding box it also answered for the cells around it, and
    // a bomb buried next to a cliff could not be tapped at all — the wall
    // replied instead, with nothing. The rectangle is the cell's own column.
    expect(VIEW).toMatch(/sprite\.hitArea = new Rectangle\(\(TILE - w\) \/ 2, 0, w, z\);/);
  });

  it('resolves a tap once', () => {
    expect(SCENE).toMatch(/if \(e\.target !== this\.container\) return;/);
  });
});
