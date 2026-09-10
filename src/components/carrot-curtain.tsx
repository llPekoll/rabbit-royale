'use client';

/**
 * The carrot iris, in CSS, over the one crossing the canvas cannot cover.
 *
 * Signing in replaces a DOM screen (the painting, the wallet button) with the
 * Pixi canvas. The engine's own iris lives INSIDE that canvas, so it cannot be
 * closed over a moment where the canvas does not exist yet — the shutter would
 * arrive with the thing it is supposed to hide. Hence a sheet in the DOM,
 * above everything, cut with the same silhouette and driven by the same
 * timings (config/wipe).
 *
 * Same trick as the Pixi one: a black sheet with a carrot-shaped HOLE, not a
 * carrot drawn over the screen. `mask-image` with the shape at `luminance`
 * would need a white-on-black source; the asset is an alpha silhouette, so the
 * sheet is masked by its INVERSE via two stacked mask layers — the full sheet
 * minus the carrot. `mask-composite: subtract` is what does the cutting.
 */
import { useEffect, useRef, useState } from 'react';
import {
  WIPE_CLOSE_MS, WIPE_OPEN_MS, WIPE_HOLD_MS, WIPE_MASK_URL,
} from '@/config/wipe';

export interface CarrotCurtainProps {
  /**
   * Flip this to run one pass. `onCut` fires at full black.
   *
   * A boolean rather than an imperative handle because the thing that triggers
   * it — a player appearing — is state, and the caller should not have to hold
   * a ref to a flourish.
   */
  play: boolean;
  /** Runs at the pitch-black midpoint, where the screen change hides. */
  onCut?: () => void;
  /** Runs once the iris is fully open again. */
  onDone?: () => void;
}

type Phase = 'idle' | 'closing' | 'held' | 'opening';

export function CarrotCurtain({ play, onCut, onDone }: CarrotCurtainProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  // Held in refs so the timer chain below is not torn down and restarted every
  // time the parent re-renders with a new inline callback.
  const cut = useRef(onCut);
  const done = useRef(onDone);
  cut.current = onCut;
  done.current = onDone;

  // Two-frame arming for the closing half — see `open` below.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (phase !== 'closing') { setArmed(false); return; }
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  useEffect(() => {
    if (!play) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setPhase('closing');
    timers.push(setTimeout(() => {
      setPhase('held');
      cut.current?.();
    }, WIPE_CLOSE_MS));
    timers.push(setTimeout(() => setPhase('opening'), WIPE_CLOSE_MS + WIPE_HOLD_MS));
    timers.push(setTimeout(() => {
      setPhase('idle');
      done.current?.();
    }, WIPE_CLOSE_MS + WIPE_HOLD_MS + WIPE_OPEN_MS));
    return () => { for (const t of timers) clearTimeout(t); };
  }, [play]);

  if (phase === 'idle') return null;

  const closing = phase === 'closing';
  // `armed` is the aperture BEFORE this phase's transition runs, so the element
  // is painted once at the starting value and only then transitions to the
  // target. Setting both in one paint is the classic way to get no animation at
  // all — the browser coalesces them and jumps straight to the end.
  const open = closing ? (armed ? 0 : 1) : phase === 'held' ? 0 : 1;

  return (
    <div
      className="rr-curtain"
      aria-hidden
      style={{
        ['--rr-curtain-open' as string]: open,
        ['--rr-curtain-ms' as string]: `${closing ? WIPE_CLOSE_MS : WIPE_OPEN_MS}ms`,
        // Closing accelerates away, opening decelerates in: the same asymmetry
        // as the Pixi iris's power2.in / power2.out.
        ['--rr-curtain-ease' as string]: closing
          ? 'cubic-bezier(.55,.09,.68,.53)'
          : 'cubic-bezier(.25,.46,.45,.94)',
        ['--rr-curtain-mask' as string]: `url(${WIPE_MASK_URL})`,
      }}
    />
  );
}
