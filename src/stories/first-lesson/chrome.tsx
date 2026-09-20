'use client';

/**
 * The chrome both first-run lessons wear: the caption strip and the readout.
 *
 * Shared so the two phases LOOK like two phases of one tutorial rather than
 * two experiments. The caption stands where the island's real strip stands
 * (`.rr-caption`, see first-run-caption.tsx) and holds one line at a time,
 * which is that strip's own rule.
 */
import type { CSSProperties, ReactNode } from 'react';
import { ENERGY } from '@config/tuning';

export function LessonFrame({ children }: { children: ReactNode }) {
  return <div style={frame}>{children}</div>;
}

/** One line, over the board. Never two: the strip is read at a glance. */
export function LessonCaption({ text }: { text: string }) {
  return (
    <p style={caption} role="status" aria-live="polite">{text}</p>
  );
}

export interface ReadoutProps {
  energy: number;
  carrots: number;
  /** The phase's own name — what the story is showing right now. */
  beat: string;
  /** Wrong taps the safety net caught, when a lesson has one. */
  caught?: number;
}

/**
 * The numbers under the board.
 *
 * Not the shipped HUD: this is the story's instrument panel, and it says out
 * loud what the game only implies — which beat is running, and what the last
 * action actually cost. Judging a tutorial means watching those move.
 */
export function LessonReadout({ energy, carrots, beat, caught = 0 }: ReadoutProps) {
  return (
    <div style={readout}>
      <span>ENERGY {energy}/{ENERGY.MAX}</span>
      <span>CARROTS {carrots}</span>
      <span>{beat.toUpperCase()}</span>
      {caught > 0 && <span style={{ color: '#ff5a4a' }}>NET CAUGHT {caught}</span>}
    </div>
  );
}

const frame: CSSProperties = {
  position: 'relative',
  width: 960,
  maxWidth: '100%',
  margin: '0 auto',
  lineHeight: 0,
};

const caption: CSSProperties = {
  position: 'absolute',
  left: '50%',
  transform: 'translateX(-50%)',
  top: 12,
  margin: 0,
  padding: '8px 14px',
  maxWidth: '80%',
  textAlign: 'center',
  fontSize: 14,
  lineHeight: 1.4,
  color: '#f4f0e6',
  background: 'rgba(13, 17, 23, 0.86)',
  border: '1px solid #4a3a52',
  pointerEvents: 'none',
};

const readout: CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 12,
  display: 'flex',
  gap: 14,
  padding: '6px 10px',
  fontSize: 12,
  fontFamily: 'monospace',
  color: '#ffe9c4',
  background: 'rgba(13, 17, 23, 0.8)',
  pointerEvents: 'none',
};
