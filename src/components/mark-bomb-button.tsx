'use client';

/**
 * MARK A BOMB — arm it, then tap the tile you think hides one.
 *
 * A button rather than a long press: on this board a held finger is already
 * the start of a camera drag, and a gesture that means two things is a bet
 * placed by accident — which here costs energy. So the mode is explicit, it
 * says what it is about to do while it is armed, and it drops after ONE mark
 * (see `setFlagMode` in use-game-socket), so the next tap is a step again.
 *
 * IT SAYS WHAT IT IS. Its first version was a bare red X on a dark square at
 * the screen's edge, and it read as what a red X on a dark square always
 * means: CLOSE. Paul, 2026-09-17: "il n'y a pas de bouton pour se mettre en
 * mode X rouge" — it was on screen. So: the bomb it is about, the X it puts on
 * it, and the verb, in the same pixel button HOME wears, in the corner the
 * right thumb rests in. Armed, the whole face turns the X's red and the verb
 * becomes the way out.
 */
import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useT } from '@/i18n/provider';
import { PxButton, pxLabel } from './px';

export interface MarkBombButtonProps {
  armed: boolean;
  onToggle(armed: boolean): void;
  /** Armed a moment ago with nothing around to mark — say so instead. */
  nothing?: boolean;
  /** The bar is low: this button is the way out, and should say so. */
  urge?: boolean;
  /**
   * The first island is holding the player at its lesson and this button is
   * the way through it.
   *
   * Beats on the same clock as the tile pulsing on the board (0.9s, see
   * `TEACH_BEAT_SECONDS`), which is what ties the two together — a caption
   * naming both cannot. Takes precedence over `urge`: on the tutorial the bar
   * is never low, and if it somehow were, the lesson is still the thing to do.
   */
  teach?: boolean;
}

export function MarkBombButton({ armed, onToggle, nothing = false, urge = false, teach = false }: MarkBombButtonProps) {
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'x' || e.key === 'X') onToggle(!armed);
      else if (e.key === 'Escape' && armed) onToggle(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [armed, onToggle]);

  // Disarm when the button leaves the screen (recap, eruption, watching): a
  // mode left armed across islands would turn the next run's first step into
  // a bet nobody placed.
  useEffect(() => () => onToggle(false), [onToggle]);

  return (
    <>
      {armed && <p className="rr-mark-hint" role="status">{t.run.markHint}</p>}
      {!armed && nothing && <p className="rr-mark-hint" role="status">{t.run.markNothing}</p>}
      <PxButton
        type="button"
        className={`rr-mark-btn${armed ? ' armed' : ''}${teach && !armed ? ' teach' : ''}${urge && !armed && !teach ? ' urge' : ''}`}
        aria-pressed={armed}
        title={`${t.run.markBomb} (X)`}
        onClick={() => onToggle(!armed)}
        color={armed ? '#a3261c' : '#3b2230'}
        shadowColor={armed ? '#4a0f0a' : '#1a0f16'}
        highlightColor={armed ? '#ff5a4a' : '#6b3f55'}
        textColor="#ffffff"
        style={button}
      >
        <span style={row}>
          <span style={icon} aria-hidden>
            <img src="/assets/ui/icons/bomb.png" alt="" width={27} height={36} draggable={false} style={pixel} />
            {/* The X the board will draw on it. */}
            <svg viewBox="0 0 9 9" width="27" height="27" shapeRendering="crispEdges" style={cross}>
              <path d="M0 1h1V0h2v1h1v1h1V1h1V0h2v1h1v2H8v1H7v1h1v1h1v2H8v1H6V8H5V7H4v1H3v1H1V8H0V6h1V5h1V4H1V3H0z" fill="#3a0d0d" />
              <path d="M1 1h2v1h1v1h1V2h1V1h2v2H7v1H6v1h1v1h1v2H6V7H5V6H4v1H3v1H1V6h1V5h1V4H2V3H1z" fill="#ff5a4a" />
            </svg>
          </span>
          <span style={label}>{armed ? t.run.markCancel : t.run.markBomb}</span>
        </span>
      </PxButton>
    </>
  );
}

const button: CSSProperties = {
  /* Placed by `.rr-mark-btn` (globals.css); the kit writes `position: relative`. */
  position: 'fixed',
  height: 'auto',
  minHeight: 'var(--rr-back-h)',
  padding: 'var(--rr-btn-pad)',
  pointerEvents: 'auto',
};
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--rr-pad)' };
const icon: CSSProperties = { position: 'relative', display: 'block', width: 27, height: 36, flexShrink: 0 };
const pixel: CSSProperties = { display: 'block', imageRendering: 'pixelated' };
const cross: CSSProperties = { position: 'absolute', left: 0, top: 9 };
const label: CSSProperties = {
  ...pxLabel,
  fontSize: 'clamp(13px, 2.8svh, 18px)',
  fontWeight: 400,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};
