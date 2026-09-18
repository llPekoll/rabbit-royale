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
    // The press is REMEMBERED on the veil and resolved on the release, once
    // the gesture recogniser has said it was a tap and not the start of a
    // drag — see `PanZoomGestures`. What matters here is that it is the veil
    // that sees the press.
    expect(SCENE).toMatch(/tile\.onPress\(\(\) => \{ this\.pressTile = i; \}\);/);
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
    // One resolution, one move. A rabbit under the finger names the tile it
    // stands on (a tap on a rival is a shove); failing that, the veil the
    // press landed on — the one Pixi's hit test found, walls and terraces
    // included; failing that, the flat resolver. Never two of them: resolving
    // a veil's press again through the flat resolver could name a different
    // tile and fire a second move at it.
    expect(SCENE).toMatch(/const pressed = this\.pressTile;\s*this\.pressTile = null;/);
    expect(SCENE).toMatch(/const idx = this\.rivalAt\(local\) \?\? pressed \?\? terrainTileAt\(this\.seed, local\.x, local\.y\);\s*if \(idx !== null\) this\.requestMove\(idx\);/);
  });
});

/**
 * A chest is never hidden — not by a tree in front of it, and not by the
 * window the rabbit punches through its cover.
 *
 * A chest is the one thing on the board drawn BEFORE it is dug, and the reason
 * is the whole decision: the player has to be able to price the walk from
 * across the island (`showChests`). Two separate things were covering it up.
 *
 * The scatter, because the trees are rolled from the PUBLIC seed and the chest
 * tiles are dealt from the private content seed — so the generator cannot be
 * taught to leave a gap without telling every client where the chests are.
 * And the depth hole, which stipples away whatever is drawn over the rabbit
 * and cannot tell a pine from a prize.
 *
 * Geometry-read here rather than rendered, like everything else in this file:
 * `Island/DepthHole` and `Island/ChestTier` show both for the eye.
 */
describe('nothing hides a chest', () => {
  const SCENE = readFileSync(new URL('../src/game/scenes/IslandScene.ts', import.meta.url), 'utf8');

  /** The cells `clearDecoOver` strips, recomputed from its own two rules. */
  function covering(reach: number): Array<{ dx: number; dy: number }> {
    const out: Array<{ dx: number; dy: number }> = [];
    for (let dx = 0; dx <= reach; dx++) {
      for (let dy = 0; dy <= reach; dy++) {
        const nearer = dx + dy;
        if (nearer === 0 || nearer > reach) continue;
        if (Math.abs(dx - dy) > 1) continue;
        out.push({ dx, dy });
      }
    }
    return out;
  }

  const REACH = 3;
  const CLEARED = covering(REACH);

  it('clears only cells that draw in FRONT of the chest', () => {
    // Screen y is (x + y) * h/2, so a greater sum is nearer the camera and
    // draws later — the same ruler `isoDepth` sorts the whole island by. A
    // cell behind the chest cannot cover it and must keep its tree.
    for (const { dx, dy } of CLEARED) expect(dx + dy).toBeGreaterThan(0);
  });

  it('leaves the chest its own cell', () => {
    // Nothing blocking is ever dealt onto a chest tile (the board only buries
    // content in walkable ground), and the tufts under the box are wanted.
    expect(CLEARED.some((c) => c.dx === 0 && c.dy === 0)).toBe(false);
  });

  it('spares cells a full cell clear of the box', () => {
    // Screen x is (x - y) * w/2, so (dx - dy) is the sideways offset in half
    // widths. At two the cell is a whole cell to the side and covers nothing,
    // however tall its pine — clearing it would cut holes in the scenery for
    // no gain.
    for (const { dx, dy } of CLEARED) expect(Math.abs(dx - dy)).toBeLessThanOrEqual(1);
    expect(CLEARED.some((c) => c.dx === 2 && c.dy === 0)).toBe(false);
  });

  it('reaches back as far as a pine is tall, and no further', () => {
    // A pine is about three cells tall on this projection, so the one three
    // rows in front still hangs over the box.
    expect(VIEW).toMatch(/COVER_REACH = 3;/);
    expect(CLEARED.some((c) => c.dx + c.dy === REACH)).toBe(true);
    // Five cells per chest: the two front neighbours, the diagonal, and the
    // two deep ones where a tall tree still reaches. A wider net would strip
    // the island bare around every box.
    expect(CLEARED).toHaveLength(5);
  });

  it('strips the scatter without touching the ground under it', () => {
    // `onCell` is the reveal's index and the sea diamonds register there too,
    // so sweeping a cell by that list would delete the water beside a coastal
    // chest. `livestock` is exactly the standing things.
    expect(VIEW).toMatch(/for \(let i = this\.livestock\.length - 1; i >= 0; i--\)/);
  });

  it('leaves walkability to the board, which both sides build from the seed', () => {
    // No terrain crosses the wire: freeing the cell on this client only would
    // make the highlight promise a step the server refuses.
    expect(VIEW).not.toMatch(/this\.occupied\.delete\(/);
    expect(VIEW).not.toMatch(/this\.inhabited\.delete\(/);
  });

  it('clears in front of every chest the moment the server names them', () => {
    expect(SCENE).toMatch(/if \(placed\.length\) this\.background\?\.clearDecoOver\(placed\);/);
  });

  it('spares a chest tile from the depth hole', () => {
    // The hole dithers away whatever covers the rabbit. Walking up to a chest
    // put the box, its glow and its tier label inside that disc — hiding the
    // target at the exact moment it is being reached for.
    expect(SCENE).toMatch(/const i = tileIndexOf\(child\);\s*return i !== null && this\.tiles\.get\(i\)\?\.hasChest === true;/);
  });
});

/**
 * The hit area rides up the ramp with the pixels.
 *
 * With slopes, a low cell touching higher ground has its shared corners
 * lifted and its veil warped onto that wedge — the diamond is DRAWN up to a
 * full tier above the cell's flat base plane. An explicit `hitArea` is tested
 * in the sprite's own space, before the anchor, so the anchor `rampOverlay`
 * hands back moved the picture and left the polygon behind on the flat plane.
 * The diamond you could see and the diamond you could press came apart, and a
 * tap on the raised part of a slope cell hit nothing at all: those were the
 * tiles along the terraces that would not answer.
 *
 * Geometry rather than a source read: this is arithmetic over `cornerLifts`,
 * and the bug was a number being in the wrong place, not a line being absent.
 */
describe('a slope tile can be pressed where it is drawn', () => {
  /** The veil's hit polygon on flat ground — `Tile`'s four corners, N/E/S/W. */
  const FLAT: [number, number][] = [
    [0, -HALF_H], [HALF_W, 0], [0, HALF_H], [-HALF_W, 0],
  ];

  /** The polygon `warpVeil` now installs: each corner up by its own lift. */
  const lifted = (lifts: readonly number[]) =>
    FLAT.map(([px, py], i) => [px, py - lifts[i] * TIER_LIFT] as [number, number]);

  /** Even-odd point-in-polygon, so we ask the shape the way Pixi asks it. */
  const contains = (poly: [number, number][], x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };

  // A cell whose NORTH corner is a tier up: the common ramp onto a shelf.
  const RAMP = [1, 0, 0, 0] as const;

  it('presses where a flat tile is drawn, unchanged', () => {
    // No lift, no displacement: the flat case must not move at all.
    expect(lifted([0, 0, 0, 0])).toEqual(FLAT);
  });

  it('answers a tap on the raised half of the ramp', () => {
    // The point the player aims at: inside the drawn diamond, a little above
    // the flat plane, on the side that the lift raised.
    const y = -HALF_H - TIER_LIFT / 2;
    expect(contains(lifted(RAMP), 0, y)).toBe(true);
    // ...and this is precisely what the flat polygon missed. Without the fix
    // the tap fell straight through the tile and nothing answered it.
    expect(contains(FLAT, 0, y)).toBe(false);
  });

  it('keeps the corners the ramp did not lift exactly where they were', () => {
    // Only the raised corner moves: lifting the whole diamond would float the
    // hit area off the low edge, trading one dead strip for another.
    const poly = lifted(RAMP);
    expect(poly[1]).toEqual(FLAT[1]);
    expect(poly[2]).toEqual(FLAT[2]);
    expect(poly[3]).toEqual(FLAT[3]);
    expect(poly[0]).toEqual([0, -HALF_H - TIER_LIFT]);
  });

  it('measures the lift from the flat polygon, not from the lifted one', () => {
    // `warpVeil` can run twice on the same sprite (the board rebuilds). Each
    // run must start from the flat original, or the hit area walks up the
    // screen a tier at a time and the tile becomes unpressable again.
    expect(VIEW).toMatch(/const flat = this\.flatHits\.get\(veil\) \?\? hit\.points\.slice\(\);/);
    expect(VIEW).toMatch(/lifted\[i \* 2 \+ 1\] = flat\[i \* 2 \+ 1\] - lifts\[i\]/);
  });
});
