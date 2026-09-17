'use client';

/**
 * THE RED X — arm it, then tap the tile you think hides a bomb.
 *
 * A button rather than a long press: on this board a held finger is already
 * the start of a camera drag, and a gesture that means two things is a bet
 * placed by accident — which here costs energy. So the mode is explicit, it
 * says what it is about to do while it is armed, and it drops after ONE mark
 * (see `setFlagMode` in use-game-socket), so the next tap is a step again.
 *
 * It sits on the RIGHT EDGE at mid-height: phones are landscape, that is
 * where the right thumb rests, and the bottom band is already shared between
 * BACK HOME and the sound control. `X` on a keyboard does the same.
 */
import { useEffect } from 'react';
import { useT } from '@/i18n/provider';

export interface MarkBombButtonProps {
  armed: boolean;
  onToggle(armed: boolean): void;
}

export function MarkBombButton({ armed, onToggle }: MarkBombButtonProps) {
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
      <button
        type="button"
        className={`rr-mark-btn${armed ? ' armed' : ''}`}
        aria-pressed={armed}
        aria-label={armed ? t.run.markCancel : t.run.markBomb}
        title={`${armed ? t.run.markCancel : t.run.markBomb} (X)`}
        onClick={() => onToggle(!armed)}
      >
        {/* The same X the board draws on a marked bomb, as pixels. */}
        <svg viewBox="0 0 9 9" width="36" height="36" shapeRendering="crispEdges" aria-hidden>
          <path d="M0 1h1V0h2v1h1v1h1V1h1V0h2v1h1v2H8v1H7v1h1v1h1v2H8v1H6V8H5V7H4v1H3v1H1V8H0V6h1V5h1V4H1V3H0z" fill="#3a0d0d" />
          <path d="M1 1h2v1h1v1h1V2h1V1h2v2H7v1H6v1h1v1h1v2H6V7H5V6H4v1H3v1H1V6h1V5h1V4H2V3H1z" fill="#ff5a4a" />
        </svg>
      </button>
    </>
  );
}
