/**
 * The shelf's drag gesture, as a state machine with no DOM in it.
 *
 * Pulled out of `stall-card.tsx` because the interesting part is not the
 * scrolling — that is two lines of `scrollLeft` — but the question of WHEN a
 * press stops being a click. That question has exactly one subtle answer and
 * it shipped wrong once: a drag that ends off the row fires no click, so a
 * "swallow the next click" flag cleared only by the click handler stayed
 * latched, and the shelf stopped buying anything in any currency until a
 * reload (see `armed` below).
 *
 * Kept free of DOM types so the suite can drive it without a browser — the
 * component owns the pixels, this owns the decision.
 */

/** How far a press may wander and still count as a click. */
export const DRAG_SLOP_PX = 4;

interface Press {
  /** Where the press started, and where the row was scrolled to then. */
  x: number;
  left: number;
  /** Has it crossed the slop and become a drag? */
  moved: boolean;
}

export class StallDrag {
  private press: Press | null = null;
  /**
   * A drag just ended and the click it spawns — if any — must be swallowed.
   *
   * Separate from `press` precisely because the click is NOT guaranteed. The
   * owner disarms this on its own after the release (see `disarm`), so a drag
   * released over another element, outside the window, or after the browser
   * dropped the pointer capture cannot leave the shelf permanently deaf.
   */
  private armed = false;

  /** True while the row should follow the pointer. */
  get dragging(): boolean {
    return this.press?.moved === true;
  }

  /** True while a click still has to be swallowed. */
  get swallowing(): boolean {
    return this.armed;
  }

  /** A press landed. `left` is the row's current scrollLeft. */
  down(x: number, left: number): void {
    this.press = { x, left, moved: false };
  }

  /**
   * The pointer moved. Returns the scrollLeft the row should take, or null
   * when the press has not yet travelled far enough to be a drag.
   *
   * The caller takes the pointer capture on the first non-null answer, never
   * at the press: capturing at pointerdown makes the row the target of the
   * pointerup, and the click then fires at the common ancestor of the two
   * targets — which turned every press on a price button into a click on the
   * row, and nothing bought anything.
   */
  move(x: number): number | null {
    const p = this.press;
    if (!p) return null;
    const dx = x - p.x;
    if (!p.moved) {
      if (Math.abs(dx) <= DRAG_SLOP_PX) return null;
      p.moved = true;
    }
    return p.left - dx;
  }

  /**
   * The pointer came up. Returns true when the press became a drag, and the
   * click that may follow must therefore be swallowed.
   */
  up(): boolean {
    const dragged = this.press?.moved === true;
    this.press = null;
    this.armed = dragged;
    return dragged;
  }

  /**
   * A click arrived. Returns true when it belongs to a drag and must be
   * suppressed rather than acted on.
   */
  click(): boolean {
    const swallow = this.armed;
    this.armed = false;
    return swallow;
  }

  /**
   * Forget any pending swallow.
   *
   * The owner calls this a microtask after the release. The click a drag
   * spawns is dispatched in the same task as that release, so this is always
   * late enough to swallow a real click and always early enough that nothing
   * survives to the next press — which is the whole point: no click, no latch.
   */
  disarm(): void {
    this.armed = false;
  }
}
