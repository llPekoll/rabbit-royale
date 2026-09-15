/**
 * Tap, drag and pinch, told apart on a Pixi container.
 *
 * Pixi hands out pointer events one pointer at a time and has no notion of a
 * gesture, so this is the piece that turns "a finger went down, moved, and
 * lifted" into one of three things the scene can act on:
 *
 *  - a TAP: down and up within `slopPx` of each other, with no second finger
 *    in between. The scene moves the rabbit on it.
 *  - a PAN: one pointer that travelled further than the slop. Every movement
 *    after that is a camera drag, and the release is NOT a tap.
 *  - a PINCH: two pointers. The camera zooms by the ratio of their distances,
 *    about their midpoint, and pans by the midpoint's travel — the same
 *    arithmetic every map app uses. A release after a pinch is not a tap
 *    either, whatever the fingers did before it.
 *
 * Why the tap waits for the RELEASE. The tiles used to move the rabbit on
 * `pointerdown` — the press is the moment the intent exists, and a move
 * already waits on a server round trip. That was right while there was no drag
 * to tell a tap apart from. Now there is, and a drag that starts on a lit tile
 * (the rabbit is in the middle of the screen, which is exactly where a thumb
 * lands to pan) would hop the rabbit before the finger had moved a pixel. So
 * the press is remembered and the move fires on release — which for a tap is
 * ~80ms later, and for a drag is never.
 *
 * Positions are handed to the scene in DESIGN pixels (the space the camera
 * works in) via `toDesign`; the slop is measured in SCREEN pixels, because a
 * thumb's wobble is a physical size that does not change with the zoom.
 */
import type { Container, FederatedPointerEvent } from 'pixi.js';

export interface Point {
  x: number;
  y: number;
}

export interface PanZoomHandlers {
  /** The first pointer went down. The scene uses it to stop a camera tween. */
  onGestureStart?(): void;
  /** One pointer dragged by this much, in design px. */
  onPan(dx: number, dy: number): void;
  /** Two pointers changed their spacing by `factor`, about `at` (design px). */
  onPinch(factor: number, at: Point): void;
  /** A press-and-release that never became a drag, at `at` (design px). */
  onTap(at: Point): void;
}

export interface PanZoomOptions {
  /**
   * How far a pointer may wobble and still be a tap, in screen px. Ten is the
   * width of a fingertip's jitter on a phone; a mouse never gets near it.
   */
  slopPx?: number;
}

interface Tracked {
  /** Current position, design px. */
  x: number;
  y: number;
  /** Where it went down, screen px — for the slop test. */
  downX: number;
  downY: number;
}

const DEFAULT_SLOP = 10;

export class PanZoomGestures {
  private readonly pointers = new Map<number, Tracked>();
  /** Once true, this gesture can no longer end in a tap. */
  private dragged = false;
  private readonly slop: number;

  /**
   * Did the gesture that just ended travel?
   *
   * For a listener that is NOT this recogniser — a sprite with its own
   * `pointertap`, which Pixi fires at the end of a drag as readily as after a
   * tap. Such a handler cannot tell the two apart on its own, and the burrow's
   * trap tiles would bury a trap wherever a pan happened to stop. Reading this
   * is what lets them decline.
   *
   * Stays true until the next press, so a handler running after the release
   * still sees the drag that preceded it.
   */
  get didDrag(): boolean { return this.dragged; }

  /**
   * Start a gesture from a press that landed OUTSIDE the target's subtree.
   *
   * For a board whose cells own their own taps and sit beside the target
   * rather than inside it (the burrow's diamonds over its drag surface): Pixi
   * bubbles a press only to the pressed object's ancestors, so without this the
   * recogniser never saw a drag that started on a cell. Only the press needs
   * handing over — moves arrive through `globalpointermove` wherever the
   * pointer is, and a release the target never hears is swept by `onDomUp`.
   */
  press(e: FederatedPointerEvent): void {
    this.down(e);
  }

  private readonly onDown = (e: FederatedPointerEvent) => this.down(e);
  private readonly onMove = (e: FederatedPointerEvent) => this.move(e);
  private readonly onUp = (e: FederatedPointerEvent) => this.up(e);
  /**
   * The browser took a touch away — a system gesture, a notification, the
   * page losing focus. Pixi does not forward `pointercancel` to containers,
   * so these come straight from the DOM. A pointer left in the map by a
   * cancelled touch would turn the NEXT single finger into a pinch.
   */
  private readonly onCancel = (e: PointerEvent) => { this.pointers.delete(e.pointerId); };
  /**
   * The DOM saw a pointer lift. Pixi's own `pointerup` is the one that resolves
   * a tap, and this does NOT resolve anything — it only makes sure the map
   * cannot keep a pointer Pixi never told us about.
   *
   * Pixi delivers `pointerup` to a container only while the pointer is over
   * something it hit-tests, and `pointerupoutside` only to the container the
   * press started on. A second finger that goes down on the HUD, on a tile
   * whose sprite is re-parented mid-gesture, or outside the canvas entirely,
   * can therefore lift without either firing — and the entry it left behind is
   * indistinguishable from a finger still on the glass. The next single touch
   * then sees `size >= 1`, is classified as the second half of a pinch, and
   * `dragged` latches true: every tap from then on is refused and no trap can
   * ever be placed again. That is the placement deadlock this guards.
   *
   * WHY IT IS DEFERRED. Pixi's own `pointerup` listener is bound on `window`
   * in the capture phase too, so whether it or this one runs first is decided
   * purely by which was registered first — Pixi's `EventSystem` at app
   * startup, this at scene setup, so today Pixi wins and `up()` resolves the
   * tap before this can empty the map. That is the correct order and it is an
   * accident of setup order. Draining on a microtask makes it the order by
   * construction: every synchronous listener, Pixi's included, has run by the
   * time this does, so a real tap is always resolved and only a pointer that
   * nobody claimed is swept.
   */
  private readonly onDomUp = (e: PointerEvent) => {
    const id = e.pointerId;
    queueMicrotask(() => this.pointers.delete(id));
  };
  private readonly onBlur = () => { this.pointers.clear(); };

  constructor(
    private readonly target: Container,
    /** Screen (renderer) coordinates -> design coordinates. */
    private readonly toDesign: (global: Point) => Point,
    private readonly handlers: PanZoomHandlers,
    options: PanZoomOptions = {},
  ) {
    this.slop = options.slopPx ?? DEFAULT_SLOP;
  }

  attach(): void {
    this.target.on('pointerdown', this.onDown);
    // `globalpointermove` rather than `pointermove`: it fires wherever the
    // pointer is, so a drag that crosses a HUD panel or leaves the canvas does
    // not freeze mid-gesture.
    this.target.on('globalpointermove', this.onMove);
    this.target.on('pointerup', this.onUp);
    this.target.on('pointerupoutside', this.onUp);
    if (typeof window !== 'undefined') {
      window.addEventListener('pointercancel', this.onCancel);
      // Capture, so it runs even if something downstream stops propagation.
      window.addEventListener('pointerup', this.onDomUp, true);
      window.addEventListener('blur', this.onBlur);
    }
  }

  destroy(): void {
    this.target.off('pointerdown', this.onDown);
    this.target.off('globalpointermove', this.onMove);
    this.target.off('pointerup', this.onUp);
    this.target.off('pointerupoutside', this.onUp);
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointercancel', this.onCancel);
      window.removeEventListener('pointerup', this.onDomUp, true);
      window.removeEventListener('blur', this.onBlur);
    }
    this.pointers.clear();
  }

  /** Is a gesture in progress? */
  get active(): boolean {
    return this.pointers.size > 0;
  }

  private down(e: FederatedPointerEvent): void {
    // Only the primary button drags. A right-click is the browser's, and a
    // middle-click is nobody's.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = this.toDesign(e.global);
    if (this.pointers.size === 0) {
      this.dragged = false;
      this.handlers.onGestureStart?.();
    }
    // A second finger ends any chance of a tap, even if it lifts at once.
    if (this.pointers.size >= 1) this.dragged = true;
    this.pointers.set(e.pointerId, { x: p.x, y: p.y, downX: e.global.x, downY: e.global.y });
  }

  private move(e: FederatedPointerEvent): void {
    const t = this.pointers.get(e.pointerId);
    if (!t) return;
    const p = this.toDesign(e.global);

    if (this.pointers.size === 1) {
      if (!this.dragged) {
        const dx = e.global.x - t.downX;
        const dy = e.global.y - t.downY;
        if (dx * dx + dy * dy < this.slop * this.slop) return;
        this.dragged = true;
      }
      this.handlers.onPan(p.x - t.x, p.y - t.y);
      t.x = p.x;
      t.y = p.y;
      return;
    }

    // Two (or more — only the first two count) pointers: a pinch. Solve the
    // midpoint and spacing before and after this pointer's move.
    const [a, b] = [...this.pointers.values()];
    const other = t === a ? b : a;
    const before = { mx: (t.x + other.x) / 2, my: (t.y + other.y) / 2, d: Math.hypot(t.x - other.x, t.y - other.y) };
    t.x = p.x;
    t.y = p.y;
    const after = { mx: (t.x + other.x) / 2, my: (t.y + other.y) / 2, d: Math.hypot(t.x - other.x, t.y - other.y) };

    this.handlers.onPan(after.mx - before.mx, after.my - before.my);
    if (before.d > 0 && after.d > 0) {
      this.handlers.onPinch(after.d / before.d, { x: after.mx, y: after.my });
    }
  }

  private up(e: FederatedPointerEvent): void {
    const t = this.pointers.get(e.pointerId);
    if (!t) return;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size > 0 || this.dragged) return;
    // Resolved at the RELEASE point rather than the press: within the slop
    // they are the same cell, and the release is the one Pixi just gave us.
    this.handlers.onTap(this.toDesign(e.global));
  }
}
