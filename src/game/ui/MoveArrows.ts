import { Container, Graphics } from 'pixi.js';
import { levelTierAt, terrainNeighbors, tileScreenPos } from '@/lib/game/terrainBoard';
import {
  HALF_W, HALF_H, tilePos, tileDepth, tileInScreenDirection, toColRow,
  DEFAULT_SHAPE, type IslandShape,
} from '@/config/gridConfig';

/**
 * The keyboard hint, drawn ON THE BOARD.
 *
 * It used to be a legend parked beside the island: four key-caps arranged as a
 * miniature tile, which the player had to read over there and map onto the
 * board over here. Putting a mark on the tile each key actually takes you to
 * removes the mapping step entirely — the board answers "where does UP go?" by
 * pointing at the answer.
 *
 * That only works because RR is 8-directional on an iso grid: a diagonal grid
 * step renders as a straight SCREEN move, so screen up/down/left/right really
 * do land on four specific neighbours. `tileInScreenDirection` picks them the
 * same way the key handler does, so the mark can never disagree with what the
 * key will do — including at the island's edge, where a heading with no legal
 * neighbour simply shows nothing.
 *
 * Deliberately plain: a flat white triangle at 20%, no outline, no frame, no
 * cap. It is an annotation on the terrain, not another piece of UI competing
 * with the tiles — and at this alpha it reads as a suggestion the eye can skip
 * once the controls are learned.
 */

/** The four screen headings a single key press covers. */
const HEADINGS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // up
  [0, 1],  // down
  [-1, 0], // left
  [1, 0],  // right
];

const INK = 0xffffff;
/** Resting presence: legible if you look for it, ignorable if you don't. */
const ALPHA_IDLE = 0.2;
/** Once the player has pressed a key the hint has done its job — it fades
 *  rather than vanishing, so the board doesn't visibly change under them. */
const ALPHA_USED = 0.08;

/** Triangle size, as a fraction of the tile it sits on. Sized off the tile
 *  rather than a fixed px so it stays proportionate if the grid metrics move. */
const W = HALF_W * 0.44;
const H = HALF_H * 0.62;

export class MoveArrows {
  private arrows: Graphics[] = [];
  private alpha = ALPHA_IDLE;
  private shown = false;

  /**
   * The island's coastline. Every island now has its OWN shape (cut from its
   * seed), so the hint has to know which one it is annotating — otherwise it
   * points confidently at water on any island but the default.
   */
  /** The island, so arrows follow the terrain rather than a flat silhouette. */
  private seed = '';

  /** Point the arrows at `seed`'s island. */
  setSeed(seed: string): void {
    this.seed = seed;
  }

  constructor(private parent: Container, private shape: IslandShape = DEFAULT_SHAPE) {

    for (const [dx, dy] of HEADINGS) {
      const g = new Graphics();
      // Point the triangle along its own heading. Screen-space, so `dy` is
      // already "down the screen" — no iso maths here on purpose: these mark
      // where the KEY goes, and the key is read in screen space too.
      if (dy !== 0) {
        const s = Math.sign(dy);
        g.moveTo(0, s * H).lineTo(-W, -s * H * 0.35).lineTo(W, -s * H * 0.35);
      } else {
        const s = Math.sign(dx);
        g.moveTo(s * W * 1.25, 0).lineTo(-s * W * 0.35, -H).lineTo(-s * W * 0.35, H);
      }
      g.fill({ color: INK });
      g.visible = false;
      g.alpha = ALPHA_IDLE;
      // Added straight to the GRID, not to a group of their own: the grid sorts
      // its children by `tileDepth`, and a group would carry ONE z for all four
      // marks. At a single z they either sank under the nearer tiles (the first
      // cut used 6, and tile depth runs to 14, so most of them vanished) or
      // floated over them. Per-arrow z, half a step above its own tile, puts
      // each mark exactly where its tile is in the iso stack.
      parent.addChild(g);
      this.arrows.push(g);
    }
  }

  /**
   * Put a mark on each tile a single key press can reach from `from`.
   *
   * `null` (no rabbit on the board) hides the lot. A heading with no legal
   * neighbour — the island's edge, a forbidden tile — hides just that one, so
   * the hint never points off the island.
   *
   * `allowed`, when given, narrows that further to the tiles the move is
   * actually ACCEPTED on (out of energy, stunned). The mark and the lit ring
   * are two views of one answer, so they are driven from the same list — a
   * mark on a dark tile would be the hint contradicting the affordance.
   */
  update(from: number | null, allowed?: readonly number[]): void {
    if (from === null || !this.shown) {
      for (const g of this.arrows) g.visible = false;
      return;
    }
    const permitted = allowed ? new Set(allowed) : null;
    HEADINGS.forEach(([dx, dy], i) => {
      // Steered by the TERRAIN when we know the island: the flat silhouette
      // offers cells the server refuses, and hides ones it allows.
      const reachable = permitted ?? (this.seed ? new Set(terrainNeighbors(this.seed, from)) : undefined);
      const target = tileInScreenDirection(from, dx, dy, this.shape, reachable);
      const g = this.arrows[i];
      if (target === null) { g.visible = false; return; }
      // Terrace-aware: an arrow drawn at the flat position points at the
      // ground BELOW the shelf its tile is actually on.
      const { x, y } = this.seed ? tileScreenPos(this.seed, target) : tilePos(target);
      g.position.set(x, y);
      // Same scale the tiles sort on (see `Tile`): depth * 16 + tier. Half a
      // unit above the tile it names, which on this scale is still well below
      // the next cell along.
      const cell = toColRow(target);
      const tier = this.seed ? levelTierAt(this.seed, cell.col, cell.row) : 0;
      g.zIndex = tileDepth(target) * 16 + tier + 0.5;
      g.alpha = this.alpha;
      g.visible = true;
    });
    this.parent.sortChildren();
  }

  setVisible(visible: boolean): void {
    this.shown = visible;
    if (!visible) for (const g of this.arrows) g.visible = false;
  }

  /** Fade back once the player has demonstrated they know the controls. */
  markUsed(): void {
    this.alpha = ALPHA_USED;
    for (const g of this.arrows) g.alpha = ALPHA_USED;
  }

  destroy(): void {
    for (const g of this.arrows) g.destroy();
    this.arrows = [];
  }
}
