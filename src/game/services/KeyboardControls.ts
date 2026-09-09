/**
 * Keyboard control for the isometric board.
 *
 * The player presses a direction they SEE on screen; GameScene resolves it to a
 * tile via `tileInScreenDirection` (see gridConfig for why screen-space is the
 * right frame for an iso grid). Two-key chords reach the four in-between
 * headings, so all 8 legal moves are addressable from 4 keys.
 *
 * Bindings are read from `KeyboardEvent.code` — the PHYSICAL key — not `key`.
 * On AZERTY the top-left cluster is labelled ZQSD but reports KeyW/KeyA/KeyS/
 * KeyD, so a French keyboard gets the same finger positions for free. It also
 * means the on-screen hint can show arrows instead of letters, which are honest
 * on every layout (and drawable, since the bitmap font is ASCII-only).
 */

/** How long to wait for a second direction key before committing the move.
 *  Long enough that a two-finger chord registers as one diagonal, far shorter
 *  than the hop + server round-trip that follows, so it reads as instant. */
const CHORD_WINDOW_MS = 60;

/** Screen-space unit vectors, y down. */
const DIRECTIONS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

const CONFIRM_CODES = new Set(['Enter', 'NumpadEnter']);

export interface KeyboardControlsOptions {
  /** Step in a screen direction (y down). Called once per press/chord. */
  onMove(dx: number, dy: number): void;
  /** Enter — the primary action for whatever state the scene is in. */
  onConfirm(): void;
  /** Fires on the first accepted key, so the hint can retire itself. */
  onFirstUse?(): void;
}

export class KeyboardControls {
  private held = new Set<string>();
  private chordTimer: ReturnType<typeof setTimeout> | null = null;
  private used = false;
  private attached = false;

  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onBlur: () => void;

  constructor(private opts: KeyboardControlsOptions) {
    this.onKeyDown = (e) => this.handleKeyDown(e);
    this.onKeyUp = (e) => this.held.delete(e.code);
    // A lost window drops every key-up, which would strand a direction as
    // "held" and poison the next chord.
    this.onBlur = () => this.held.clear();
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  destroy(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    if (this.chordTimer !== null) {
      clearTimeout(this.chordTimer);
      this.chordTimer = null;
    }
    this.held.clear();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Never steal a key the player is aiming at a text field (the CUSTOM bet
    // overlay is a real DOM input), and leave browser/OS shortcuts alone.
    if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

    if (CONFIRM_CODES.has(e.code)) {
      e.preventDefault();
      this.markUsed();
      this.opts.onConfirm();
      return;
    }

    const dir = DIRECTIONS[e.code];
    if (!dir) return;
    e.preventDefault();
    // OS key-repeat would machine-gun moves, and every move here is a real bet.
    if (e.repeat) return;

    this.held.add(e.code);
    this.markUsed();
    // Wait a beat for a second key so W+A commits ONE diagonal rather than a
    // move up followed by a move left.
    if (this.chordTimer !== null) return;
    this.chordTimer = setTimeout(() => {
      this.chordTimer = null;
      this.commit();
    }, CHORD_WINDOW_MS);
  }

  private commit(): void {
    let dx = 0;
    let dy = 0;
    for (const code of this.held) {
      const dir = DIRECTIONS[code];
      if (!dir) continue;
      dx += dir[0];
      dy += dir[1];
    }
    // Opposite keys cancel (W+S) — nothing to do.
    if (dx === 0 && dy === 0) return;
    this.opts.onMove(dx, dy);
  }

  private markUsed(): void {
    if (this.used) return;
    this.used = true;
    this.opts.onFirstUse?.();
  }
}

/** True when the event is headed for a text entry — hands off entirely. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/** Touch-only devices have no keys to press — don't advertise bindings there.
 *  `matchMedia` is the reliable signal; a hybrid laptop keeps the hint. */
export function hasPhysicalKeyboard(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? true;
}
